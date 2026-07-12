"""Phase 6: Push the patch and open a Pull Request."""

import os
import subprocess
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote
from uuid import uuid4

import structlog
from anthropic import Anthropic
from github import Github, GithubException

from pfg_agent.config import settings
from pfg_agent.hub_client import Issue
from pfg_agent.phases.solve import Patch

log = structlog.get_logger()
_client = Anthropic(api_key=settings.anthropic_api_key)

PR_DESCRIPTION_PROMPT = """You are writing a Pull Request description for an open-source project.

Issue fixed: {title}
Issue URL: {issue_url}
Issue description: {body}

Write a clear, friendly PR description that:
1. Explains what the issue was (1-2 sentences)
2. Describes the fix approach (2-3 sentences)
3. Notes what was tested

Keep it concise and professional. Do not use bullet points for the opening summary.
End with: "Fixes #{issue_number}"
"""


@dataclass
class PullRequestResult:
    url: str
    details: dict[str, object]


class PullRequestError(RuntimeError):
    def __init__(self, message: str, details: dict[str, object]) -> None:
        super().__init__(message)
        self.details = details


# Commits the verified worktree, pushes it to the best writable remote and opens a PR.
def open_pull_request(issue: Issue, patch: Patch) -> PullRequestResult:
    """
    Apply patch, push to a new branch, and open a PR via the GitHub API.

    Returns the PR URL.
    """
    del patch
    work_path = Path(settings.work_dir) / issue.id
    base_sha = _git_output(["git", "rev-parse", "--short=8", "HEAD"], work_path)
    branch_name = f"pfg/{issue.id}-{base_sha}-{uuid4().hex[:8]}"
    details: dict[str, object] = {
        "status": "started",
        "branch": branch_name,
        "forkUsed": False,
        "emptyCommit": False,
    }

    # Extract owner/repo from GitHub URL
    # e.g. https://github.com/owner/repo → owner/repo
    parts = issue.repo_url.rstrip("/").split("/")
    repo_slug = f"{parts[-2]}/{parts[-1]}"
    issue_number = issue.github_url.rstrip("/").split("/")[-1]

    # Create branch and commit
    subprocess.run(["git", "checkout", "-B", branch_name], cwd=work_path, check=True)
    subprocess.run(["git", "add", "-A"], cwd=work_path, check=True)
    if _has_empty_index(work_path):
        details["status"] = "failed"
        details["emptyCommit"] = True
        raise PullRequestError("empty commit, refusing to open PR", {"pullRequest": details})

    subprocess.run(
        [
            "git",
            "commit",
            "-m",
            f"fix: resolve issue #{issue_number}\n\nAutomated fix by pfg-agent",
        ],
        cwd=work_path,
        check=True,
        env={
            **os.environ,
            "GIT_AUTHOR_NAME": "pfg-agent",
            "GIT_AUTHOR_EMAIL": "agent@promptforgood.dev",
            "GIT_COMMITTER_NAME": "pfg-agent",
            "GIT_COMMITTER_EMAIL": "agent@promptforgood.dev",
        },
    )

    gh = Github(settings.github_token)
    try:
        repo = gh.get_repo(repo_slug)
    except GithubException as exc:
        details["status"] = "failed"
        details["githubError"] = _github_error_details(exc, "load_repository")
        raise PullRequestError("GitHub repository lookup failed", {"pullRequest": details}) from exc

    default_branch = repo.default_branch
    repo_owner = repo.owner.login
    details["base"] = default_branch
    push_url = _authenticated_repo_url(issue.repo_url)
    push_result = _push_branch(work_path, push_url, branch_name)
    head_ref = f"{repo_owner}:{branch_name}"

    if push_result.returncode != 0:
        details["originPushError"] = _redact_secret(push_result.stderr, settings.github_token)
        try:
            fork = _get_or_create_fork(gh, repo)
        except GithubException as exc:
            details["status"] = "failed"
            details["githubError"] = _github_error_details(exc, "create_fork")
            raise PullRequestError(
                "failed to push upstream and could not create fork",
                {"pullRequest": details},
            ) from exc

        fork_owner = fork.owner.login
        details["forkUsed"] = True
        details["forkOwner"] = fork_owner
        fork_push_url = _authenticated_repo_url(fork.html_url)
        fork_push_result = _push_branch(work_path, fork_push_url, branch_name)
        if fork_push_result.returncode != 0:
            details["status"] = "failed"
            details["forkPushError"] = _redact_secret(
                fork_push_result.stderr,
                settings.github_token,
            )
            raise PullRequestError("failed to push branch to fork", {"pullRequest": details})
        head_ref = f"{fork_owner}:{branch_name}"

    # Generate PR description with LLM
    pr_body = _generate_pr_description(issue, issue_number)

    try:
        existing = _find_existing_pull_request(repo, head_ref, default_branch)
        if existing is not None:
            details["status"] = "existing"
            details["url"] = existing.html_url
            log.info("PR already exists", pr_url=existing.html_url, pr_number=existing.number)
            return PullRequestResult(url=existing.html_url, details=details)

        pr = repo.create_pull(
            title=f"fix: {issue.title}",
            body=pr_body,
            head=head_ref,
            base=default_branch,
        )
    except GithubException as exc:
        details["status"] = "failed"
        details["githubError"] = _github_error_details(exc, "create_pull")
        raise PullRequestError(
            "GitHub pull request creation failed", {"pullRequest": details}
        ) from exc

    details["status"] = "opened"
    details["url"] = pr.html_url
    details["number"] = pr.number
    log.info("PR opened", pr_url=pr.html_url, pr_number=pr.number)
    return PullRequestResult(url=pr.html_url, details=details)


def _generate_pr_description(issue: Issue, issue_number: str) -> str:
    prompt = PR_DESCRIPTION_PROMPT.format(
        title=issue.title,
        issue_url=issue.github_url,
        body=issue.body or "(no description)",
        issue_number=issue_number,
    )
    response = _client.messages.create(
        model=settings.llm_model,
        max_tokens=512,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.content[0].text


def _git_output(command: list[str], cwd: Path) -> str:
    result = subprocess.run(command, cwd=cwd, capture_output=True, text=True, check=True)
    return result.stdout.strip()


def _has_empty_index(work_path: Path) -> bool:
    return (
        subprocess.run(
            ["git", "diff", "--cached", "--quiet"],
            cwd=work_path,
            capture_output=True,
            text=True,
        ).returncode
        == 0
    )


# Pushes to an explicit URL so public clones can still authenticate without rewriting remotes.
def _push_branch(
    work_path: Path, push_url: str, branch_name: str
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", "push", push_url, f"HEAD:{branch_name}"],
        cwd=work_path,
        capture_output=True,
        text=True,
    )


# Converts a GitHub HTTPS URL into a token-authenticated push URL without logging it.
def _authenticated_repo_url(repo_url: str) -> str:
    normalized = repo_url.rstrip("/")
    if normalized.endswith(".git"):
        normalized = normalized[:-4]
    parts = normalized.split("/")
    owner = parts[-2]
    name = parts[-1]
    token = quote(settings.github_token, safe="")
    return f"https://x-access-token:{token}@github.com/{owner}/{name}.git"


# Reuses an existing fork when possible, otherwise asks GitHub to create one.
def _get_or_create_fork(gh: Github, repo: object) -> object:
    user = gh.get_user()
    try:
        return user.get_repo(repo.name)
    except GithubException as exc:
        if exc.status != 404:
            raise
        return repo.create_fork()


# Avoids opening duplicate PRs when a retry already pushed the selected branch.
def _find_existing_pull_request(repo: object, head_ref: str, base: str) -> object | None:
    for pull_request in repo.get_pulls(state="open", head=head_ref, base=base):
        return pull_request
    return None


def _github_error_details(exc: GithubException, stage: str) -> dict[str, object]:
    return {
        "stage": stage,
        "statusCode": exc.status,
        "message": str(exc.data or exc),
    }


def _redact_secret(value: str | None, secret: str) -> str:
    if not value:
        return ""
    return value.replace(secret, "[redacted]")
