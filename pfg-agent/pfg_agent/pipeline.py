"""7-phase agent pipeline: Claim → Analyze → Context → Solve → Verify → PR → Report."""

import structlog

from pfg_agent.config import settings
from pfg_agent.hub_client import HubClient, Issue
from pfg_agent.phases.analyze import analyze_issue
from pfg_agent.phases.claim import claim_issue
from pfg_agent.phases.context import gather_context
from pfg_agent.phases.pr import open_pull_request
from pfg_agent.phases.report import report_done
from pfg_agent.phases.solve import generate_patch
from pfg_agent.phases.verify import verify_patch

log = structlog.get_logger()


class AgentPipeline:
    """Orchestrates the full 7-phase contribution pipeline."""

    def __init__(self) -> None:
        self.hub = HubClient(
            base_url=settings.pfg_hub_url,
            token=settings.pfg_token,
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
                self.hub.heartbeat(settings.runner_id, quota_remaining)
            except Exception as exc:
                log.warning("heartbeat failed, continuing", error=str(exc))

    def _process_issue(self, issue: Issue) -> int:
        """Run all pipeline phases for a single issue. Returns tokens consumed."""
        log.info("processing issue", issue_id=issue.id, title=issue.title)
        pr_url = None
        tokens_used = 0
        error_message = None

        try:
            # Phase 2: Analyze
            analysis = analyze_issue(issue)
            tokens_used += analysis.tokens_used

            # Phase 3: Context
            context = gather_context(issue, analysis)

            # Phase 4: Solve
            patch = generate_patch(issue, context)
            tokens_used += patch.tokens_used

            # Phase 5: Verify (with retries)
            for attempt in range(1, settings.max_retries + 1):
                log.info("verifying patch", attempt=attempt)
                verified = verify_patch(context, patch)
                if verified.success:
                    break
                log.warning("patch verification failed", attempt=attempt, error=verified.error)
                if attempt < settings.max_retries:
                    patch = generate_patch(issue, context, previous_error=verified.error)
                    tokens_used += patch.tokens_used
            else:
                raise RuntimeError(f"patch failed after {settings.max_retries} attempts")

            # Phase 6: PR
            pr_url = open_pull_request(issue, patch)
            log.info("PR opened", pr_url=pr_url)

        except Exception as exc:
            log.error("issue processing failed", issue_id=issue.id, error=str(exc))
            error_message = str(exc)

        finally:
            # Phase 7: Report
            report_done(
                hub=self.hub,
                issue=issue,
                success=pr_url is not None,
                pr_url=pr_url,
                tokens_used=tokens_used,
                error_message=error_message,
            )

        return tokens_used
