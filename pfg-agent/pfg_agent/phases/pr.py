"""Phase 6: Push the patch and open a Pull Request."""

import subprocess
from pathlib import Path

import structlog
from anthropic import Anthropic
from github import Github

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


def open_pull_request(issue: Issue, patch: Patch) -> str:
    """
    Apply patch, push to a new branch, and open a PR via the GitHub API.

    Returns the PR URL.
    """
    from pfg_agent.phases.context import CodeContext  # avoid circular import

    branch_name = f"pfg/{issue.id}"

    # Extract owner/repo from GitHub URL
    # e.g. https://github.com/owner/repo → owner/repo
    parts = issue.repo_url.rstrip("/").split("/")
    repo_slug = f"{parts[-2]}/{parts[-1]}"
    issue_number = issue.github_url.rstrip("/").split("/")[-1]

    work_path = Path(settings.work_dir) / issue.id

    # Create branch and commit
    subprocess.run(["git", "checkout", "-b", branch_name], cwd=work_path, check=True)
    subprocess.run(["git", "add", "-A"], cwd=work_path, check=True)
    subprocess.run(
        ["git", "commit", "-m", f"fix: resolve issue #{issue_number}\n\nAutomated fix by pfg-agent"],
        cwd=work_path,
        check=True,
        env={**__import__("os").environ, "GIT_AUTHOR_NAME": "pfg-agent", "GIT_AUTHOR_EMAIL": "agent@promptforgood.dev"},
    )

    subprocess.run(
        ["git", "push", "origin", branch_name],
        cwd=work_path,
        check=True,
    )

    # Generate PR description with LLM
    pr_body = _generate_pr_description(issue, issue_number)

    # Open PR via GitHub API
    gh = Github(settings.github_token)
    repo = gh.get_repo(repo_slug)
    default_branch = repo.default_branch

    pr = repo.create_pull(
        title=f"fix: {issue.title}",
        body=pr_body,
        head=branch_name,
        base=default_branch,
    )

    log.info("PR opened", pr_url=pr.html_url, pr_number=pr.number)
    return pr.html_url


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
