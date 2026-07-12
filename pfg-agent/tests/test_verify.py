"""Tests for patch verification and retry cleanup helpers."""

import subprocess
import sys
from pathlib import Path

from pfg_agent.phases.context import CodeContext
from pfg_agent.phases.solve import Patch
from pfg_agent.phases.verify import get_current_head, reset_worktree, verify_patch


# Creates a minimal Git repository with author config so tests can commit fixtures.
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


# Creates a tracked file and commits it so git apply has a clean base.
def _commit_file(repo: Path, rel_path: str, content: str) -> None:
    target = repo / rel_path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    subprocess.run(["git", "add", rel_path], cwd=repo, check=True, capture_output=True)
    subprocess.run(["git", "commit", "-m", "initial"], cwd=repo, check=True, capture_output=True)


# Produces a real git diff and restores the working tree to the committed file.
def _diff_for_change(repo: Path, rel_path: str, content: str) -> str:
    (repo / rel_path).write_text(content, encoding="utf-8")
    diff = subprocess.check_output(["git", "diff"], cwd=repo, text=True)
    subprocess.run(["git", "checkout", "--", rel_path], cwd=repo, check=True, capture_output=True)
    return diff


def test_verify_patch_reports_skipped_when_build_system_is_missing(tmp_path):
    _init_git_repo(tmp_path)
    _commit_file(tmp_path, "foo.txt", "old\n")
    diff = _diff_for_change(tmp_path, "foo.txt", "new\n")

    result = verify_patch(CodeContext(repo_path=tmp_path, files={}), Patch(diff=diff, tokens_used=1))

    assert result.success is True
    assert result.status == "skipped"
    assert result.details == {
        "patch": {"applied": True},
        "verification": {
            "status": "skipped",
            "command": None,
            "missingBuildSystem": True,
        },
    }


def test_verify_patch_captures_command_failure(monkeypatch, tmp_path):
    _init_git_repo(tmp_path)
    _commit_file(tmp_path, "foo.txt", "old\n")
    diff = _diff_for_change(tmp_path, "foo.txt", "new\n")

    monkeypatch.setattr(
        "pfg_agent.phases.verify._detect_build_command",
        lambda _repo_path: [
            sys.executable,
            "-c",
            "import sys; print('stdout log'); print('stderr log', file=sys.stderr); sys.exit(2)",
        ],
    )

    result = verify_patch(CodeContext(repo_path=tmp_path, files={}), Patch(diff=diff, tokens_used=1))

    assert result.success is False
    assert result.status == "failed"
    assert result.details is not None
    assert result.details["verification"] == {
        "status": "failed",
        "reason": "command_failed",
        "command": [
            sys.executable,
            "-c",
            "import sys; print('stdout log'); print('stderr log', file=sys.stderr); sys.exit(2)",
        ],
        "returnCode": 2,
        "stdoutTail": "stdout log\n",
        "stderrTail": "stderr log\n",
        "timedOut": False,
        "timeoutSeconds": 300,
    }


def test_verify_patch_captures_timeout(monkeypatch, tmp_path):
    _init_git_repo(tmp_path)
    _commit_file(tmp_path, "foo.txt", "old\n")
    diff = _diff_for_change(tmp_path, "foo.txt", "new\n")

    monkeypatch.setattr("pfg_agent.phases.verify.VERIFY_TIMEOUT_SECONDS", 0.01)
    monkeypatch.setattr(
        "pfg_agent.phases.verify._detect_build_command",
        lambda _repo_path: [sys.executable, "-c", "import time; time.sleep(1)"],
    )

    result = verify_patch(CodeContext(repo_path=tmp_path, files={}), Patch(diff=diff, tokens_used=1))

    assert result.success is False
    assert result.details is not None
    assert result.details["verification"]["reason"] == "timeout"
    assert result.details["verification"]["timedOut"] is True
    assert result.details["verification"]["timeoutSeconds"] == 0.01


def test_reset_worktree_restores_base_and_removes_untracked_files(tmp_path):
    _init_git_repo(tmp_path)
    _commit_file(tmp_path, "foo.txt", "old\n")
    base_revision = get_current_head(tmp_path)
    (tmp_path / "foo.txt").write_text("dirty\n", encoding="utf-8")
    (tmp_path / "generated.txt").write_text("remove me\n", encoding="utf-8")

    reset_worktree(tmp_path, base_revision)

    assert (tmp_path / "foo.txt").read_text(encoding="utf-8") == "old\n"
    assert not (tmp_path / "generated.txt").exists()
