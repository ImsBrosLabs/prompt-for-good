"""Phase 3: Clone the repository and extract a focused code context window."""

import subprocess
from dataclasses import dataclass
from pathlib import Path

import git
import structlog

from pfg_agent.config import settings
from pfg_agent.hub_client import Issue
from pfg_agent.phases.analyze import Analysis

log = structlog.get_logger()

MAX_FILE_SIZE_BYTES = 50_000  # skip files larger than 50KB


@dataclass
class CodeContext:
    repo_path: Path
    files: dict[str, str]  # relative path → file content


def gather_context(issue: Issue, analysis: Analysis) -> CodeContext:
    """
    Shallow-clone the repository and extract the content of impacted files.

    Uses grep to resolve glob patterns in analysis.impacted_files.
    """
    repo_dir = Path(settings.work_dir) / issue.id
    repo_dir.mkdir(parents=True, exist_ok=True)

    log.info("cloning repository", url=issue.repo_url, dest=str(repo_dir))
    if (repo_dir / ".git").exists():
        log.info("repo already cloned, reusing", path=str(repo_dir))
    else:
        git.Repo.clone_from(
            issue.repo_url,
            repo_dir,
            depth=settings.clone_depth,
        )

    files = _extract_files(repo_dir, analysis.impacted_files)
    log.info("context gathered", issue_id=issue.id, file_count=len(files))
    return CodeContext(repo_path=repo_dir, files=files)


def _extract_files(repo_path: Path, patterns: list[str]) -> dict[str, str]:
    """Resolve file patterns and read their content."""
    result: dict[str, str] = {}

    for pattern in patterns:
        # Use git ls-files to match patterns against tracked files
        try:
            output = subprocess.check_output(
                ["git", "ls-files", pattern],
                cwd=repo_path,
                text=True,
                stderr=subprocess.DEVNULL,
            )
            matched = [line.strip() for line in output.splitlines() if line.strip()]
        except subprocess.CalledProcessError:
            matched = []

        for rel_path in matched:
            full_path = repo_path / rel_path
            if not full_path.is_file():
                continue
            if full_path.stat().st_size > MAX_FILE_SIZE_BYTES:
                log.warning("skipping large file", path=rel_path)
                continue
            try:
                result[rel_path] = full_path.read_text(encoding="utf-8", errors="replace")
            except OSError as e:
                log.warning("could not read file", path=rel_path, error=str(e))

    return result
