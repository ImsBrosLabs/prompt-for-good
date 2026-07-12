"""Phase 5: Apply the patch locally and run build + tests."""

import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import structlog

from pfg_agent.phases.context import CodeContext
from pfg_agent.phases.solve import Patch

log = structlog.get_logger()
VERIFY_TIMEOUT_SECONDS = 300
VERIFY_LOG_TAIL_CHARS = 3000

_BUILD_COMMANDS: dict[str, list[str]] = {
    "pom.xml": ["mvn", "test", "-q"],
    "build.gradle": ["./gradlew", "test", "--quiet"],
    "build.gradle.kts": ["./gradlew", "test", "--quiet"],
    "package.json": ["npm", "test", "--silent"],
    "Cargo.toml": ["cargo", "test", "--quiet"],
    "pyproject.toml": ["python", "-m", "pytest", "-q"],
    "setup.py": ["python", "-m", "pytest", "-q"],
}


@dataclass
class VerifyResult:
    success: bool
    status: Literal["passed", "failed", "skipped"]
    error: str | None = None
    details: dict[str, object] | None = None


def verify_patch(context: CodeContext, patch: Patch) -> VerifyResult:
    """Apply the patch and run the project's test suite."""
    repo_path = context.repo_path

    # Apply patch
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

    # Detect build system and run tests
    build_cmd = _detect_build_command(repo_path)
    if build_cmd is None:
        log.warning("no known build system detected, skipping test run")
        return VerifyResult(
            success=True,
            status="skipped",
            details={
                "patch": {"applied": True},
                "verification": {
                    "status": "skipped",
                    "command": None,
                    "missingBuildSystem": True,
                },
            },
        )

    log.info("running tests", cmd=build_cmd, cwd=str(repo_path))
    try:
        test_result = subprocess.run(
            build_cmd,
            cwd=repo_path,
            capture_output=True,
            text=True,
            timeout=VERIFY_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired as exc:
        stdout_tail = _tail(exc.stdout)
        stderr_tail = _tail(exc.stderr)
        error = f"verification timed out after {VERIFY_TIMEOUT_SECONDS}s"
        log.warning("tests timed out", timeout_seconds=VERIFY_TIMEOUT_SECONDS)
        return VerifyResult(
            success=False,
            status="failed",
            error=error,
            details={
                "patch": {"applied": True},
                "verification": {
                    "status": "failed",
                    "reason": "timeout",
                    "command": build_cmd,
                    "stdoutTail": stdout_tail,
                    "stderrTail": stderr_tail,
                    "timedOut": True,
                    "timeoutSeconds": VERIFY_TIMEOUT_SECONDS,
                },
            },
        )
    except FileNotFoundError as exc:
        error = f"build command not found: {build_cmd[0]}"
        log.warning("build command not found", cmd=build_cmd, error=str(exc))
        return VerifyResult(
            success=False,
            status="failed",
            error=error,
            details={
                "patch": {"applied": True},
                "verification": {
                    "status": "failed",
                    "reason": "command_not_found",
                    "command": build_cmd,
                    "stdoutTail": "",
                    "stderrTail": str(exc),
                    "timedOut": False,
                    "timeoutSeconds": VERIFY_TIMEOUT_SECONDS,
                },
            },
        )

    if test_result.returncode != 0:
        stdout_tail = _tail(test_result.stdout)
        stderr_tail = _tail(test_result.stderr)
        error = _tail(test_result.stdout + test_result.stderr)
        log.warning("tests failed", returncode=test_result.returncode)
        return VerifyResult(
            success=False,
            status="failed",
            error=error,
            details={
                "patch": {"applied": True},
                "verification": {
                    "status": "failed",
                    "reason": "command_failed",
                    "command": build_cmd,
                    "returnCode": test_result.returncode,
                    "stdoutTail": stdout_tail,
                    "stderrTail": stderr_tail,
                    "timedOut": False,
                    "timeoutSeconds": VERIFY_TIMEOUT_SECONDS,
                },
            },
        )

    log.info("tests passed")
    return VerifyResult(
        success=True,
        status="passed",
        details={
            "patch": {"applied": True},
            "verification": {
                "status": "passed",
                "command": build_cmd,
                "returnCode": test_result.returncode,
                "stdoutTail": _tail(test_result.stdout),
                "stderrTail": _tail(test_result.stderr),
                "timedOut": False,
                "timeoutSeconds": VERIFY_TIMEOUT_SECONDS,
            },
        },
    )


def _detect_build_command(repo_path: Path) -> list[str] | None:
    for indicator, cmd in _BUILD_COMMANDS.items():
        if (repo_path / indicator).exists():
            return cmd
    return None


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
