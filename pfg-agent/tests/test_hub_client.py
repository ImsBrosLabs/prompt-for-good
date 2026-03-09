"""Tests for hub_client parsing logic."""

import pytest

from pfg_agent.hub_client import Issue, _parse_issue


def _issue_data(**kwargs):
    base = {
        "id": "abc123",
        "title": "Fix the bug",
        "body": "Some description",
        "githubUrl": "https://github.com/org/repo/issues/1",
        "repo": {"githubUrl": "https://github.com/org/repo"},
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
