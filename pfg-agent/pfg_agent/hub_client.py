"""HTTP client for the pfg-hub REST API."""

from dataclasses import dataclass

import httpx
import structlog

log = structlog.get_logger()


@dataclass
class Issue:
    id: str
    title: str
    body: str | None
    github_url: str
    repo_url: str
    labels: list[str]


class HubClient:
    def __init__(self, base_url: str, token: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.headers = {"X-Runner-Token": token}

    def get_next_issue(self) -> Issue | None:
        """Fetch the next pending issue from the FIFO queue."""
        resp = httpx.get(f"{self.base_url}/issues/next", headers=self.headers)
        if resp.status_code == 204:
            return None
        resp.raise_for_status()
        data = resp.json()
        return _parse_issue(data)

    def claim_issue(self, issue_id: str) -> Issue:
        """Claim an issue so other runners skip it."""
        resp = httpx.post(f"{self.base_url}/issues/{issue_id}/claim", headers=self.headers)
        resp.raise_for_status()
        return _parse_issue(resp.json())

    def report_done(
        self,
        issue_id: str,
        success: bool,
        pr_url: str | None = None,
        tokens_used: int = 0,
        error_message: str | None = None,
    ) -> None:
        """Report the outcome of an issue processing attempt."""
        payload = {
            "success": success,
            "prUrl": pr_url,
            "tokensUsed": tokens_used,
            "errorMessage": error_message,
        }
        resp = httpx.post(
            f"{self.base_url}/issues/{issue_id}/done",
            json=payload,
            headers=self.headers,
        )
        resp.raise_for_status()
        log.info("reported to hub", issue_id=issue_id, success=success)

    def heartbeat(self, runner_id: str, quota_remaining: int) -> None:
        payload = {"quotaRemainingToday": quota_remaining}
        resp = httpx.post(
            f"{self.base_url}/runners/{runner_id}/heartbeat",
            json=payload,
            headers=self.headers,
        )
        resp.raise_for_status()


def _parse_issue(data: dict) -> Issue:
    return Issue(
        id=data["id"],
        title=data["title"],
        body=data.get("body"),
        github_url=data["githubUrl"],
        repo_url=data["repo"]["githubUrl"],
        labels=data.get("labels", "").split(",") if data.get("labels") else [],
    )
