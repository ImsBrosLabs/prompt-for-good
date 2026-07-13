"""Agent pipeline: claim, analyze, context, plan verification, solve, verify, PR, report."""

import structlog

from pfg_agent.config import settings
from pfg_agent.hub_client import HubClient, Issue
from pfg_agent.phases.analyze import analyze_issue
from pfg_agent.phases.claim import claim_issue
from pfg_agent.phases.context import gather_context
from pfg_agent.phases.plan_verification import plan_verification, verification_plan_details
from pfg_agent.phases.pr import open_pull_request
from pfg_agent.phases.report import report_done
from pfg_agent.phases.solve import generate_patch
from pfg_agent.phases.verify import (
    get_current_head,
    reset_worktree,
    restore_patch_worktree,
    verify_patch,
)

log = structlog.get_logger()


class AgentPipeline:
    """Orchestrates the full contribution pipeline."""

    def __init__(self) -> None:
        self.hub = HubClient(
            base_url=settings.pfg_hub_url,
            token=settings.pfg_token,
            request_timeout=settings.pfg_hub_request_timeout,
            retry_attempts=settings.pfg_hub_retry_attempts,
            retry_delay_seconds=settings.pfg_hub_retry_delay_seconds,
        )
        self.tokens_used_today: int = 0

    def run(self) -> None:
        """Claim and process issues in a loop until no more are available or budget is exhausted."""
        while True:
            if self.tokens_used_today >= settings.max_tokens_per_day:
                log.info(
                    "daily token budget exhausted, stopping",
                    total=self.tokens_used_today,
                    budget=settings.max_tokens_per_day,
                )
                break

            issue = claim_issue(self.hub)
            if issue is None:
                log.info("no issues available, stopping")
                break

            tokens = self._process_issue(issue)
            self.tokens_used_today += tokens
            log.info(
                "session token usage",
                used=self.tokens_used_today,
                budget=settings.max_tokens_per_day,
            )

            # Heartbeat: signal runner is alive and report remaining quota
            quota_remaining = max(0, settings.max_tokens_per_day - self.tokens_used_today)
            try:
                self.hub.heartbeat(
                    settings.runner_id,
                    quota_remaining,
                    settings.project_preferences.to_hub_preferences(),
                )
            except Exception as exc:
                log.warning("heartbeat failed, continuing", error=str(exc))

    def _process_issue(self, issue: Issue) -> int:
        """Run all pipeline phases for a single issue. Returns tokens consumed."""
        log.info("processing issue", issue_id=issue.id, title=issue.title)
        pr_url = None
        tokens_used = 0
        error_message = None
        attempts: list[dict[str, object]] = []
        details: dict[str, object] = {"attempts": attempts}
        context = None
        base_revision = None

        try:
            # Phase 2: Analyze
            analysis = analyze_issue(issue)
            tokens_used += analysis.tokens_used

            # Phase 3: Context
            context = gather_context(issue, analysis)
            base_revision = get_current_head(context.repo_path)
            details["baseRevision"] = base_revision
            reset_worktree(context.repo_path, base_revision)

            # Phase 4: Plan verification
            verification_plan = plan_verification(context)
            tokens_used += verification_plan.tokens_used
            details["verificationPlan"] = verification_plan_details(verification_plan)

            # Phase 5: Solve
            patch = generate_patch(issue, context, verification_plan=verification_plan)
            tokens_used += patch.tokens_used

            # Phase 6: Verify (with retries)
            for attempt in range(1, settings.max_retries + 1):
                log.info("verifying patch", attempt=attempt)
                verified = verify_patch(context, patch, verification_plan)
                attempt_details = {
                    "attempt": attempt,
                    "patchTokensUsed": patch.tokens_used,
                    **(verified.details or {}),
                }
                attempts.append(attempt_details)
                if verified.details:
                    details["verification"] = verified.details.get("verification")
                if verified.success:
                    break
                log.warning("patch verification failed", attempt=attempt, error=verified.error)
                if attempt < settings.max_retries:
                    reset_worktree(context.repo_path, base_revision)
                    patch = generate_patch(
                        issue,
                        context,
                        previous_error=verified.error,
                        verification_plan=verification_plan,
                    )
                    tokens_used += patch.tokens_used
            else:
                reset_worktree(context.repo_path, base_revision)
                raise RuntimeError(f"patch failed after {settings.max_retries} attempts")

            # Phase 7: PR
            restore_patch_worktree(context.repo_path, patch, base_revision)
            pr_result = open_pull_request(issue, patch)
            pr_url = pr_result.url
            details["pullRequest"] = pr_result.details
            log.info("PR opened", pr_url=pr_url)

        except Exception as exc:
            log.error("issue processing failed", issue_id=issue.id, error=str(exc))
            error_message = str(exc)
            exception_details = getattr(exc, "details", None)
            if isinstance(exception_details, dict):
                details.update(exception_details)
            details["error"] = {"message": error_message}
            if context is not None and base_revision is not None and pr_url is None:
                try:
                    reset_worktree(context.repo_path, base_revision)
                except Exception as reset_exc:
                    details["cleanup"] = {
                        "status": "failed",
                        "error": str(reset_exc),
                    }

        finally:
            # Phase 8: Report
            report_done(
                hub=self.hub,
                issue=issue,
                success=pr_url is not None,
                pr_url=pr_url,
                tokens_used=tokens_used,
                error_message=error_message,
                details=details,
            )

        return tokens_used
