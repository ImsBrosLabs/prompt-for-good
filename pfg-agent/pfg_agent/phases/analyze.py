"""Phase 2: Analyze the issue with an LLM to understand the problem and identify impacted files."""

from dataclasses import dataclass

import structlog
from anthropic import Anthropic

from pfg_agent.config import settings
from pfg_agent.hub_client import Issue

log = structlog.get_logger()

_client = Anthropic(api_key=settings.anthropic_api_key)

ANALYZE_PROMPT = """You are an expert software engineer analyzing a GitHub issue.

Issue title: {title}
Issue body:
{body}

Your task:
1. Summarize the root cause of the bug or the feature request in 2-3 sentences.
2. List the files most likely impacted (max 10 files). Use glob patterns if needed.
3. Classify the issue type: bug | feature | docs | refactor
4. Estimate the fix complexity: low | medium | high

Respond in JSON:
{{
  "summary": "...",
  "impacted_files": ["src/...", "..."],
  "issue_type": "bug",
  "complexity": "low"
}}
"""


@dataclass
class Analysis:
    summary: str
    impacted_files: list[str]
    issue_type: str
    complexity: str
    tokens_used: int


def analyze_issue(issue: Issue) -> Analysis:
    """Use Claude to understand the issue and identify impacted files."""
    prompt = ANALYZE_PROMPT.format(
        title=issue.title,
        body=issue.body or "(no description provided)",
    )

    log.info("analyzing issue", issue_id=issue.id)
    response = _client.messages.create(
        model=settings.llm_model,
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )

    import json

    content = response.content[0].text
    data = json.loads(content)
    tokens_used = response.usage.input_tokens + response.usage.output_tokens

    log.info(
        "analysis complete",
        issue_id=issue.id,
        issue_type=data["issue_type"],
        complexity=data["complexity"],
        files=len(data["impacted_files"]),
        tokens=tokens_used,
    )

    return Analysis(
        summary=data["summary"],
        impacted_files=data["impacted_files"],
        issue_type=data["issue_type"],
        complexity=data["complexity"],
        tokens_used=tokens_used,
    )
