"""Tests for pull request creation safety checks."""

import subprocess
from pathlib import Path

import pytest

from pfg_agent.hub_client import Issue
from pfg_agent.phases.pr import PullRequestError, open_pull_request
from pfg_agent.phases.solve import Patch


# Creates a minimal Git repository with author config so PR tests can commit fixtures.
def _init_git_repo(path: Path) -> None:
    subprocess.run(["git", "init", str(path)], check=True, capture_output=True)
    subprocess.run(
        ["git", "config", "user.email", "test@test.com"],
        cwd=path,
        check=True,
        capture_output=True,
    )
    subprocess.run(
        ["git", "config", "user.name", "Test"],
        cwd=path,
        check=True,
        capture_output=True,
    )


# Commits a clean repository state so empty PR attempts fail before GitHub calls.
def _commit_file(repo: Path, rel_path: str, content: str) -> None:
    target = repo / rel_path
    target.write_text(content, encoding="utf-8")
    subprocess.run(["git", "add", rel_path], cwd=repo, check=True, capture_output=True)
    subprocess.run(["git", "commit", "-m", "initial"], cwd=repo, check=True, capture_output=True)


def test_open_pull_request_rejects_empty_commit(monkeypatch, tmp_path):
    work_dir = tmp_path / "work"
    repo = work_dir / "issue-1"
    repo.mkdir(parents=True)
    _init_git_repo(repo)
    _commit_file(repo, "foo.txt", "unchanged\n")

    monkeypatch.setattr("pfg_agent.phases.pr.settings.work_dir", str(work_dir))

    issue = Issue(
        id="issue-1",
        title="Fix it",
        body=None,
        github_url="https://github.com/owner/repo/issues/7",
        repo_url="https://github.com/owner/repo",
        labels=[],
    )

    with pytest.raises(PullRequestError) as error:
        open_pull_request(issue, Patch(diff="", tokens_used=0))

    assert error.value.details["pullRequest"]["emptyCommit"] is True
    assert error.value.details["pullRequest"]["status"] == "failed"
