"""Phase 4: Generate a patch using the LLM."""

from dataclasses import dataclass

import structlog
from anthropic import Anthropic

from pfg_agent.config import settings
from pfg_agent.hub_client import Issue
from pfg_agent.phases.context import CodeContext

log = structlog.get_logger()
_client = Anthropic(api_key=settings.anthropic_api_key)

SOLVE_PROMPT = """You are an expert software engineer tasked with fixing a GitHub issue.

Issue: {title}
Description: {body}

Relevant source files:
{files}

{error_context}

Your task: produce a minimal, focused patch that fixes the issue.

Rules:
- Only modify what is necessary. Do not refactor unrelated code.
- Ensure the fix is complete and does not break existing behaviour.
- Output a valid unified diff (git diff format).

Output ONLY the diff, no explanations:
```diff
...
```
"""


@dataclass
class Patch:
    diff: str
    tokens_used: int


def generate_patch(
    issue: Issue,
    context: CodeContext,
    previous_error: str | None = None,
) -> Patch:
    """Ask Claude to generate a diff that fixes the issue."""
    files_block = "\n\n".join(
        f"=== {path} ===\n{content}" for path, content in context.files.items()
    )

    error_context = ""
    if previous_error:
        error_context = f"""
A previous patch attempt failed with the following error:
{previous_error}

Please fix the issue taking this error into account.
"""

    prompt = SOLVE_PROMPT.format(
        title=issue.title,
        body=issue.body or "(no description)",
        files=files_block,
        error_context=error_context,
    )

    log.info("generating patch", issue_id=issue.id, retry=previous_error is not None)
    response = _client.messages.create(
        model=settings.llm_model,
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = response.content[0].text
    diff = _extract_diff(raw)
    tokens_used = response.usage.input_tokens + response.usage.output_tokens

    log.info(
        "patch generated", issue_id=issue.id, tokens=tokens_used, diff_lines=len(diff.splitlines())
    )
    return Patch(diff=diff, tokens_used=tokens_used)


def _extract_diff(text: str) -> str:
    """Extract the diff block from the LLM response."""
    if "```diff" in text:
        start = text.index("```diff") + len("```diff")
        end = text.index("```", start)
        return text[start:end].strip()
    return text.strip()
