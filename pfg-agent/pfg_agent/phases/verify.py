"""Phase 5: Apply the patch locally and run planned setup + verification commands."""

import os
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import structlog

from pfg_agent.phases.context import CodeContext
from pfg_agent.phases.plan_verification import (
    PlannedCommand,
    VerificationPlan,
    fallback_verification_plan,
    verification_plan_details,
)
from pfg_agent.phases.solve import Patch

log = structlog.get_logger()
VERIFY_TIMEOUT_SECONDS = 300
VERIFY_LOG_TAIL_CHARS = 3000


@dataclass
class VerifyResult:
    success: bool
    status: Literal["passed", "failed", "skipped"]
    error: str | None = None
    details: dict[str, object] | None = None


@dataclass
class CommandRunResult:
    phase: Literal["setup", "verification"]
    command: str
    status: Literal["passed", "failed"]
    return_code: int | None
    stdout_tail: str
    stderr_tail: str
    timed_out: bool


# Applies the proposed diff, then executes the frozen setup/verification plan in order.
def verify_patch(
    context: CodeContext, patch: Patch, plan: VerificationPlan | None = None
) -> VerifyResult:
    repo_path = context.repo_path

    apply_result = subprocess.run(
        ["git", "apply", "--check", "-"],
        input=patch.diff,
        cwd=repo_path,
        capture_output=True,
        text=True,
    )
    if apply_result.returncode != 0:
        log.warning("patch does not apply cleanly", stderr=apply_result.stderr)
        error = f"patch apply failed: {_tail(apply_result.stderr)}"
        return VerifyResult(
            success=False,
            status="failed",
            error=error,
            details={
                "patch": {
                    "applied": False,
                    "stderrTail": _tail(apply_result.stderr),
                },
                "verification": {
                    "status": "failed",
                    "reason": "patch_apply_failed",
                    "command": None,
                },
            },
        )

    try:
        subprocess.run(
            ["git", "apply", "-"],
            input=patch.diff,
            cwd=repo_path,
            capture_output=True,
            text=True,
            check=True,
        )
    except subprocess.CalledProcessError as exc:
        stderr_tail = _tail(exc.stderr)
        error = f"patch apply failed: {stderr_tail}"
        log.warning("patch apply failed after clean check", stderr=stderr_tail)
        return VerifyResult(
            success=False,
            status="failed",
            error=error,
            details={
                "patch": {
                    "applied": False,
                    "stderrTail": stderr_tail,
                },
                "verification": {
                    "status": "failed",
                    "reason": "patch_apply_failed",
                    "command": None,
                },
            },
        )

    plan = plan or fallback_verification_plan(repo_path)
    if plan is None or not plan.verification_commands:
        log.warning("no verification command planned, skipping test run")
        return VerifyResult(
            success=True,
            status="skipped",
            details={
                "patch": {"applied": True},
                "verification": {
                    "status": "skipped",
                    "command": None,
                    "plan": _plan_details(plan),
                    "missingBuildSystem": True,
                },
            },
        )

    command_results: list[dict[str, object]] = []
    for phase, command in _iter_plan_commands(plan):
        log.info("running verification command", phase=phase, command=command.command)
        result = _run_planned_command(phase, command.command, repo_path)
        result_details = _command_result_details(result)
        command_results.append(result_details)
        if result.status == "failed":
            reason = _failure_reason(result)
            error = (
                f"verification timed out after {VERIFY_TIMEOUT_SECONDS}s"
                if result.timed_out
                else _tail(result.stdout_tail + result.stderr_tail)
            )
            log.warning(
                "verification command failed",
                phase=phase,
                command=command.command,
                timed_out=result.timed_out,
                returncode=result.return_code,
            )
            return VerifyResult(
                success=False,
                status="failed",
                error=error,
                details={
                    "patch": {"applied": True},
                    "verification": {
                        "status": "failed",
                        "reason": reason,
                        "phase": phase,
                        "command": command.command,
                        "plan": _plan_details(plan),
                        "commands": command_results,
                        "returnCode": result.return_code,
                        "stdoutTail": result.stdout_tail,
                        "stderrTail": result.stderr_tail,
                        "timedOut": result.timed_out,
                        "timeoutSeconds": VERIFY_TIMEOUT_SECONDS,
                    },
                },
            )

    log.info("verification commands passed")
    return VerifyResult(
        success=True,
        status="passed",
        details={
            "patch": {"applied": True},
            "verification": {
                "status": "passed",
                "command": command_results[-1]["command"] if command_results else None,
                "plan": _plan_details(plan),
                "commands": command_results,
                "timedOut": False,
                "timeoutSeconds": VERIFY_TIMEOUT_SECONDS,
            },
        },
    )


# Runs setup commands before verification commands while preserving command evidence for logs.
def _iter_plan_commands(
    plan: VerificationPlan,
) -> list[tuple[Literal["setup", "verification"], PlannedCommand]]:
    return [
        *[("setup", command) for command in plan.setup_commands],
        *[("verification", command) for command in plan.verification_commands],
    ]


# Executes repository-provided commands through the shell but without runner-owned secrets.
def _run_planned_command(
    phase: Literal["setup", "verification"], command: str, repo_path: Path
) -> CommandRunResult:
    try:
        result = subprocess.run(
            command,
            shell=True,
            cwd=repo_path,
            capture_output=True,
            text=True,
            timeout=VERIFY_TIMEOUT_SECONDS,
            env=_repo_command_env(),
        )
    except subprocess.TimeoutExpired as exc:
        return CommandRunResult(
            phase=phase,
            command=command,
            status="failed",
            return_code=None,
            stdout_tail=_tail(exc.stdout),
            stderr_tail=_tail(exc.stderr),
            timed_out=True,
        )

    return CommandRunResult(
        phase=phase,
        command=command,
        status="passed" if result.returncode == 0 else "failed",
        return_code=result.returncode,
        stdout_tail=_tail(result.stdout),
        stderr_tail=_tail(result.stderr),
        timed_out=False,
    )


# Removes runner credentials from the environment inherited by untrusted repository commands.
def _repo_command_env() -> dict[str, str]:
    secret_markers = ("TOKEN", "SECRET", "API_KEY", "PASSWORD")
    return {
        key: value
        for key, value in os.environ.items()
        if not any(marker in key.upper() for marker in secret_markers)
    }


# Distinguishes setup failures from verification failures without changing retry behavior.
def _failure_reason(result: CommandRunResult) -> str:
    if result.phase == "setup":
        return "setup_timeout" if result.timed_out else "setup_command_failed"
    return "timeout" if result.timed_out else "command_failed"


# Keeps command execution diagnostics consistent across setup and verification phases.
def _command_result_details(result: CommandRunResult) -> dict[str, object]:
    return {
        "phase": result.phase,
        "command": result.command,
        "status": result.status,
        "returnCode": result.return_code,
        "stdoutTail": result.stdout_tail,
        "stderrTail": result.stderr_tail,
        "timedOut": result.timed_out,
        "timeoutSeconds": VERIFY_TIMEOUT_SECONDS,
    }


# Serializes optional plans defensively so skipped legacy repos still report cleanly.
def _plan_details(plan: VerificationPlan | None) -> dict[str, object] | None:
    if plan is None:
        return None
    return verification_plan_details(plan)


# Reads the repository base revision once so retries can return to a stable tree.
def get_current_head(repo_path: Path) -> str:
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=repo_path,
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout.strip()


# Rebuilds the PR worktree from the verified diff after setup/test commands may have written files.
def restore_patch_worktree(repo_path: Path, patch: Patch, revision: str) -> None:
    reset_worktree(repo_path, revision)
    subprocess.run(
        ["git", "apply", "--check", "-"],
        input=patch.diff,
        cwd=repo_path,
        capture_output=True,
        text=True,
        check=True,
    )
    subprocess.run(
        ["git", "apply", "-"],
        input=patch.diff,
        cwd=repo_path,
        capture_output=True,
        text=True,
        check=True,
    )


# Removes all generated changes from a failed attempt before another patch is requested.
def reset_worktree(repo_path: Path, revision: str) -> None:
    subprocess.run(
        ["git", "reset", "--hard", revision],
        cwd=repo_path,
        capture_output=True,
        text=True,
        check=True,
    )
    subprocess.run(
        ["git", "clean", "-fd"],
        cwd=repo_path,
        capture_output=True,
        text=True,
        check=True,
    )


def _tail(value: str | bytes | None) -> str:
    if value is None:
        return ""
    if isinstance(value, bytes):
        value = value.decode("utf-8", errors="replace")
    return value[-VERIFY_LOG_TAIL_CHARS:]
