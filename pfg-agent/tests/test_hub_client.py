"""Tests for hub_client parsing logic."""

import httpx
import pytest

from pfg_agent.hub_client import HubClient, Issue, _parse_issue


def _issue_data(**kwargs):
    base = {
        "id": "abc123",
        "title": "Fix the bug",
        "body": "Some description",
        "githubUrl": "https://github.com/org/repo/issues/1",
        "repoUrl": "https://github.com/org/repo",
        "labels": "bug,good-first-issue",
    }
    base.update(kwargs)
    return base


def test_parse_issue_basic():
    issue = _parse_issue(_issue_data())
    assert issue.id == "abc123"
    assert issue.title == "Fix the bug"
    assert issue.body == "Some description"
    assert issue.github_url == "https://github.com/org/repo/issues/1"
    assert issue.repo_url == "https://github.com/org/repo"
    assert issue.labels == ["bug", "good-first-issue"]


def test_parse_issue_no_body():
    data = _issue_data()
    del data["body"]
    issue = _parse_issue(data)
    assert issue.body is None


def test_parse_issue_empty_labels():
    issue = _parse_issue(_issue_data(labels=""))
    assert issue.labels == []


def test_parse_issue_no_labels_key():
    data = _issue_data()
    del data["labels"]
    issue = _parse_issue(data)
    assert issue.labels == []


def test_issue_is_dataclass():
    issue = Issue(
        id="x",
        title="t",
        body=None,
        github_url="u",
        repo_url="r",
        labels=[],
    )
    assert issue.id == "x"


def test_get_next_issue_retries_transient_connection_error(monkeypatch):
    calls = []
    sleeps = []
    request = httpx.Request("GET", "http://hub.test/issues/next")

    def fake_request(method, url, **kwargs):
        calls.append((method, url, kwargs))
        if len(calls) == 1:
            raise httpx.ConnectError("connection refused", request=request)
        return httpx.Response(204)

    monkeypatch.setattr(httpx, "request", fake_request)

    client = HubClient(
        "http://hub.test",
        "token",
        request_timeout=1.5,
        retry_attempts=2,
        retry_delay_seconds=0.25,
        sleep=sleeps.append,
    )

    assert client.get_next_issue() is None
    assert len(calls) == 2
    assert sleeps == [0.25]
    assert calls[0] == (
        "GET",
        "http://hub.test/issues/next",
        {"headers": {"X-Runner-Token": "token"}, "timeout": 1.5},
    )


def test_get_next_issue_raises_after_retry_attempts(monkeypatch):
    calls = []
    request = httpx.Request("GET", "http://hub.test/issues/next")

    def fake_request(method, url, **kwargs):
        calls.append((method, url, kwargs))
        raise httpx.ConnectError("connection refused", request=request)

    monkeypatch.setattr(httpx, "request", fake_request)

    client = HubClient(
        "http://hub.test",
        "token",
        retry_attempts=2,
        retry_delay_seconds=0,
        sleep=lambda delay: None,
    )

    with pytest.raises(httpx.ConnectError):
        client.get_next_issue()

    assert len(calls) == 3


def test_heartbeat_sends_preferences(monkeypatch):
    calls = []
    request = httpx.Request("POST", "http://hub.test/runners/runner-1/heartbeat")

    def fake_request(method, url, **kwargs):
        calls.append((method, url, kwargs))
        return httpx.Response(204, request=request)

    monkeypatch.setattr(httpx, "request", fake_request)

    client = HubClient("http://hub.test", "token")
    client.heartbeat(
        "runner-1",
        250,
        {
            "allowedRepos": ["acme/project"],
            "maxDifficulty": "medium",
        },
    )

    assert calls == [
        (
            "POST",
            "http://hub.test/runners/runner-1/heartbeat",
            {
                "headers": {"X-Runner-Token": "token"},
                "timeout": 10.0,
                "json": {
                    "quotaRemainingToday": 250,
                    "preferences": {
                        "allowedRepos": ["acme/project"],
                        "maxDifficulty": "medium",
                    },
                },
            },
        ),
    ]


def test_report_done_sends_structured_details(monkeypatch):
    calls = []
    request = httpx.Request("POST", "http://hub.test/issues/issue-1/done")

    def fake_request(method, url, **kwargs):
        calls.append((method, url, kwargs))
        return httpx.Response(204, request=request)

    monkeypatch.setattr(httpx, "request", fake_request)

    client = HubClient("http://hub.test", "token")
    client.report_done(
        "issue-1",
        success=False,
        tokens_used=42,
        error_message="tests failed",
        details={"verification": {"status": "failed"}},
    )

    assert calls == [
        (
            "POST",
            "http://hub.test/issues/issue-1/done",
            {
                "headers": {"X-Runner-Token": "token"},
                "timeout": 10.0,
                "json": {
                    "success": False,
                    "prUrl": None,
                    "tokensUsed": 42,
                    "errorMessage": "tests failed",
                    "details": {"verification": {"status": "failed"}},
                },
            },
        ),
    ]
