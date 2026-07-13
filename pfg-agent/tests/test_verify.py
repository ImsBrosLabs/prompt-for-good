"""Tests for patch verification and retry cleanup helpers."""

import subprocess
import sys
from pathlib import Path

from pfg_agent.phases.context import CodeContext
from pfg_agent.phases.plan_verification import (
    PlannedCommand,
    VerificationPlan,
    verification_plan_details,
)
from pfg_agent.phases.solve import Patch
from pfg_agent.phases.verify import (
    get_current_head,
    reset_worktree,
    restore_patch_worktree,
    verify_patch,
)


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

    result = verify_patch(
        CodeContext(repo_path=tmp_path, files={}), Patch(diff=diff, tokens_used=1)
    )

    assert result.success is True
    assert result.status == "skipped"
    assert result.details == {
        "patch": {"applied": True},
        "verification": {
            "status": "skipped",
            "command": None,
            "plan": None,
            "missingBuildSystem": True,
        },
    }


def test_verify_patch_captures_command_failure(monkeypatch, tmp_path):
    _init_git_repo(tmp_path)
    _commit_file(tmp_path, "foo.txt", "old\n")
    diff = _diff_for_change(tmp_path, "foo.txt", "new\n")

    command = _python_command(
        "import sys; print('stdout log'); print('stderr log', file=sys.stderr); sys.exit(2)"
    )
    plan = VerificationPlan(
        source="llm",
        setup_commands=[],
        verification_commands=[
            PlannedCommand(command=command, evidence=["README.md:1"], source="docs")
        ],
        sources_consulted=["README.md"],
        decisions=["README command selected"],
        fallback_used=False,
        tokens_used=0,
    )

    result = verify_patch(
        CodeContext(repo_path=tmp_path, files={}), Patch(diff=diff, tokens_used=1), plan
    )

    assert result.success is False
    assert result.status == "failed"
    assert result.details is not None
    assert result.details["verification"] == {
        "status": "failed",
        "reason": "command_failed",
        "phase": "verification",
        "command": command,
        "plan": verification_plan_details(plan),
        "commands": [
            {
                "phase": "verification",
                "command": command,
                "status": "failed",
                "returnCode": 2,
                "stdoutTail": "stdout log\n",
                "stderrTail": "stderr log\n",
                "timedOut": False,
                "timeoutSeconds": 300,
            }
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
    command = _python_command("import time; time.sleep(1)")
    plan = VerificationPlan(
        source="llm",
        setup_commands=[],
        verification_commands=[
            PlannedCommand(command=command, evidence=["README.md:1"], source="docs")
        ],
        sources_consulted=["README.md"],
        decisions=[],
        fallback_used=False,
        tokens_used=0,
    )

    result = verify_patch(
        CodeContext(repo_path=tmp_path, files={}), Patch(diff=diff, tokens_used=1), plan
    )

    assert result.success is False
    assert result.details is not None
    assert result.details["verification"]["reason"] == "timeout"
    assert result.details["verification"]["timedOut"] is True
    assert result.details["verification"]["timeoutSeconds"] == 0.01


def test_verify_patch_runs_setup_before_verification_with_filtered_env(tmp_path):
    _init_git_repo(tmp_path)
    _commit_file(tmp_path, "foo.txt", "old\n")
    diff = _diff_for_change(tmp_path, "foo.txt", "new\n")
    setup_command = _python_command(
        "import os, pathlib; "
        "assert 'GITHUB_TOKEN' not in os.environ; "
        "pathlib.Path('sequence.txt').write_text('setup\\n', encoding='utf-8')"
    )
    verification_command = _python_command(
        "import pathlib; "
        "p = pathlib.Path('sequence.txt'); "
        "p.write_text(p.read_text(encoding='utf-8') + 'verify\\n', encoding='utf-8')"
    )
    plan = VerificationPlan(
        source="llm",
        setup_commands=[
            PlannedCommand(command=setup_command, evidence=["README.md:1"], source="docs")
        ],
        verification_commands=[
            PlannedCommand(command=verification_command, evidence=["README.md:2"], source="docs")
        ],
        sources_consulted=["README.md"],
        decisions=["Run setup before verification"],
        fallback_used=False,
        tokens_used=0,
    )

    result = verify_patch(
        CodeContext(repo_path=tmp_path, files={}), Patch(diff=diff, tokens_used=1), plan
    )

    assert result.success is True
    assert result.status == "passed"
    assert (tmp_path / "sequence.txt").read_text(encoding="utf-8") == "setup\nverify\n"
    assert result.details is not None
    assert result.details["verification"]["commands"][0]["phase"] == "setup"
    assert result.details["verification"]["commands"][1]["phase"] == "verification"


def test_reset_worktree_restores_base_and_removes_untracked_files(tmp_path):
    _init_git_repo(tmp_path)
    _commit_file(tmp_path, "foo.txt", "old\n")
    base_revision = get_current_head(tmp_path)
    (tmp_path / "foo.txt").write_text("dirty\n", encoding="utf-8")
    (tmp_path / "generated.txt").write_text("remove me\n", encoding="utf-8")

    reset_worktree(tmp_path, base_revision)

    assert (tmp_path / "foo.txt").read_text(encoding="utf-8") == "old\n"
    assert not (tmp_path / "generated.txt").exists()


def test_restore_patch_worktree_keeps_only_verified_patch_changes(tmp_path):
    _init_git_repo(tmp_path)
    _commit_file(tmp_path, "foo.txt", "old\n")
    base_revision = get_current_head(tmp_path)
    diff = _diff_for_change(tmp_path, "foo.txt", "new\n")
    (tmp_path / "foo.txt").write_text("test mutation\n", encoding="utf-8")
    (tmp_path / "generated.txt").write_text("artifact\n", encoding="utf-8")

    restore_patch_worktree(tmp_path, Patch(diff=diff, tokens_used=1), base_revision)

    assert (tmp_path / "foo.txt").read_text(encoding="utf-8") == "new\n"
    assert not (tmp_path / "generated.txt").exists()


# Builds a shell command that runs Python code without depending on platform-specific quoting.
def _python_command(code: str) -> str:
    import shlex

    return f"{shlex.quote(sys.executable)} -c {shlex.quote(code)}"
