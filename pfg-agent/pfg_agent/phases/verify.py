"""Phase 5: Apply the patch locally and run build + tests."""

import subprocess
from dataclasses import dataclass
from pathlib import Path

import structlog

from pfg_agent.phases.context import CodeContext
from pfg_agent.phases.solve import Patch

log = structlog.get_logger()

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
    error: str | None = None


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
        return VerifyResult(success=False, error=f"patch apply failed: {apply_result.stderr}")

    subprocess.run(["git", "apply", "-"], input=patch.diff, cwd=repo_path, text=True, check=True)

    # Detect build system and run tests
    build_cmd = _detect_build_command(repo_path)
    if build_cmd is None:
        log.warning("no known build system detected, skipping test run")
        return VerifyResult(success=True)

    log.info("running tests", cmd=build_cmd, cwd=str(repo_path))
    test_result = subprocess.run(
        build_cmd,
        cwd=repo_path,
        capture_output=True,
        text=True,
        timeout=300,  # 5 minute timeout
    )

    if test_result.returncode != 0:
        error = (test_result.stdout + test_result.stderr)[-3000:]  # last 3k chars
        log.warning("tests failed", returncode=test_result.returncode)
        return VerifyResult(success=False, error=error)

    log.info("tests passed")
    return VerifyResult(success=True)


def _detect_build_command(repo_path: Path) -> list[str] | None:
    for indicator, cmd in _BUILD_COMMANDS.items():
        if (repo_path / indicator).exists():
            return cmd
    return None
