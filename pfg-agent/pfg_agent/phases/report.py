"""Phase 7: Report the outcome back to pfg-hub."""

import structlog

from pfg_agent.hub_client import HubClient, Issue

log = structlog.get_logger()


def report_done(
    hub: HubClient,
    issue: Issue,
    success: bool,
    pr_url: str | None,
    tokens_used: int,
    error_message: str | None,
) -> None:
    """Notify pfg-hub that processing is complete (success or failure)."""
    hub.report_done(
        issue_id=issue.id,
        success=success,
        pr_url=pr_url,
        tokens_used=tokens_used,
        error_message=error_message,
    )
    log.info(
        "reported to hub",
        issue_id=issue.id,
        success=success,
        pr_url=pr_url,
        tokens_used=tokens_used,
    )
