"""Phase 1: Claim the next available issue from pfg-hub."""

import structlog

from pfg_agent.hub_client import HubClient, Issue

log = structlog.get_logger()


def claim_issue(hub: HubClient) -> Issue | None:
    """
    Fetch and claim the next pending issue.

    Returns None if no issues are available.
    """
    issue = hub.get_next_issue()
    if issue is None:
        log.info("queue is empty")
        return None

    claimed = hub.claim_issue(issue.id)
    log.info("issue claimed", issue_id=claimed.id, title=claimed.title)
    return claimed
