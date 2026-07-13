"""Plan repository-specific setup and verification commands."""

import json
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

import structlog
from anthropic import Anthropic

from pfg_agent.config import settings
from pfg_agent.phases.context import CodeContext

log = structlog.get_logger()
_client = Anthropic(api_key=settings.anthropic_api_key)

MAX_SOURCE_CHARS = 8_000
MAX_TOTAL_SOURCE_CHARS = 60_000

_FALLBACK_COMMANDS: dict[str, str] = {
    "pom.xml": "mvn test -q",
    "build.gradle": "./gradlew test --quiet",
    "build.gradle.kts": "./gradlew test --quiet",
    "package.json": "npm test --silent",
    "Cargo.toml": "cargo test --quiet",
    "pyproject.toml": "python -m pytest -q",
    "setup.py": "python -m pytest -q",
}

PLAN_VERIFICATION_PROMPT = """You are planning how an autonomous coding agent should verify a repository after applying a patch.

Repository files that may describe setup, test, lint, or build commands:
{sources}

Task:
- Identify the commands the repository recommends for local setup and verification.
- Prefer explicit repository instructions from CI, README, CONTRIBUTING, or manifests.
- Preserve the repository's recommended commands. Do not replace them with frozen/CI variants unless the repository itself recommends those variants.
- Split simple "cmd1 && cmd2" chains into separate commands when this keeps the same meaning and improves diagnostics.
- Put install/preparation commands in setupCommands.
- Put test/lint/build/typecheck commands in verificationCommands.
- If sources conflict, choose CI over docs, docs over manifests, and explain the decision.
- If no reliable command is recommended, return empty command arrays.

Respond with JSON only:
{{
  "setupCommands": [
    {{"command": "npm install", "evidence": ["README.md:12"], "source": "docs"}}
  ],
  "verificationCommands": [
    {{"command": "npm test", "evidence": ["README.md:13"], "source": "docs"}}
  ],
  "sourcesConsulted": ["README.md", "package.json"],
  "decisions": ["README command split on && for clearer diagnostics"]
}}
"""


@dataclass
class PlannedCommand:
    command: str
    evidence: list[str] = field(default_factory=list)
    source: str = "unknown"


@dataclass
class VerificationPlan:
    source: Literal["llm", "fallback", "skipped"]
    setup_commands: list[PlannedCommand]
    verification_commands: list[PlannedCommand]
    sources_consulted: list[str] = field(default_factory=list)
    decisions: list[str] = field(default_factory=list)
    fallback_used: bool = False
    tokens_used: int = 0


# Serializes plans using the hub/reporting field names shared by pipeline and verify.
def verification_plan_details(plan: VerificationPlan) -> dict[str, object]:
    return {
        "source": plan.source,
        "setupCommands": [
            {
                "command": command.command,
                "evidence": command.evidence,
                "source": command.source,
            }
            for command in plan.setup_commands
        ],
        "verificationCommands": [
            {
                "command": command.command,
                "evidence": command.evidence,
                "source": command.source,
            }
            for command in plan.verification_commands
        ],
        "sourcesConsulted": plan.sources_consulted,
        "decisions": plan.decisions,
        "fallbackUsed": plan.fallback_used,
        "tokensUsed": plan.tokens_used,
    }


# Uses repository-owned docs and metadata to ask the LLM for an auditable command plan.
def plan_verification(context: CodeContext) -> VerificationPlan:
    sources = _collect_verification_sources(context.repo_path)
    tokens_used = 0
    if sources:
        prompt = PLAN_VERIFICATION_PROMPT.format(sources=_format_sources(sources))
        log.info("planning verification commands", source_count=len(sources))
        try:
            response = _client.messages.create(
                model=settings.llm_model,
                max_tokens=2048,
                messages=[{"role": "user", "content": prompt}],
            )
            tokens_used = response.usage.input_tokens + response.usage.output_tokens
            plan = _parse_plan_response(response.content[0].text, tokens_used)
            if plan.verification_commands:
                log.info(
                    "verification plan selected",
                    setup_commands=len(plan.setup_commands),
                    verification_commands=len(plan.verification_commands),
                    tokens=tokens_used,
                )
                return plan
        except (json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
            log.warning("verification planning failed, falling back", error=str(exc))

    fallback = fallback_verification_plan(context.repo_path, tokens_used=tokens_used)
    if fallback is not None:
        return fallback
    return VerificationPlan(
        source="skipped",
        setup_commands=[],
        verification_commands=[],
        sources_consulted=list(sources.keys()),
        decisions=["No repository verification command found"],
        fallback_used=False,
        tokens_used=tokens_used,
    )


# Keeps the legacy file-indicator behavior as a low-confidence fallback for sparse repos.
def fallback_verification_plan(repo_path: Path, tokens_used: int = 0) -> VerificationPlan | None:
    for indicator, command in _FALLBACK_COMMANDS.items():
        if (repo_path / indicator).exists():
            return VerificationPlan(
                source="fallback",
                setup_commands=[],
                verification_commands=[
                    PlannedCommand(
                        command=command,
                        evidence=[indicator],
                        source="file-indicator",
                    )
                ],
                sources_consulted=[indicator],
                decisions=[f"Fallback command selected from {indicator}"],
                fallback_used=True,
                tokens_used=tokens_used,
            )
    return None


# Extracts candidate files without flooding the prompt with unrelated source code.
def _collect_verification_sources(repo_path: Path) -> dict[str, str]:
    try:
        output = subprocess.check_output(["git", "ls-files"], cwd=repo_path, text=True)
        tracked_files = [line.strip() for line in output.splitlines() if line.strip()]
    except subprocess.CalledProcessError:
        tracked_files = []

    selected: dict[str, str] = {}
    total_chars = 0
    for rel_path in tracked_files:
        if not _is_verification_source(rel_path):
            continue
        full_path = repo_path / rel_path
        if not full_path.is_file():
            continue
        content = full_path.read_text(encoding="utf-8", errors="replace")
        numbered = _number_lines(content[:MAX_SOURCE_CHARS])
        if len(content) > MAX_SOURCE_CHARS:
            numbered += "\n[truncated]"
        if total_chars + len(numbered) > MAX_TOTAL_SOURCE_CHARS:
            break
        selected[rel_path] = numbered
        total_chars += len(numbered)
    return selected


# Identifies docs, CI configs, and manifests likely to contain setup or test guidance.
def _is_verification_source(rel_path: str) -> bool:
    lower = rel_path.lower()
    name = Path(lower).name
    if lower.startswith(".github/workflows/"):
        return True
    if lower in {
        ".gitlab-ci.yml",
        ".circleci/config.yml",
        "azure-pipelines.yml",
        "jenkinsfile",
        "package.json",
        "pyproject.toml",
        "cargo.toml",
        "pom.xml",
        "build.gradle",
        "build.gradle.kts",
        "makefile",
        "justfile",
        "taskfile.yml",
        "tox.ini",
        "noxfile.py",
        "setup.py",
    }:
        return True
    if name.startswith("readme") or name.startswith("contributing"):
        return True
    if lower.startswith("docs/") and lower.endswith((".md", ".rst", ".txt")):
        return any(
            token in lower
            for token in ("contribut", "develop", "setup", "install", "test", "build", "ci")
        )
    return False


# Builds compact, line-numbered blocks so the LLM can cite evidence precisely.
def _format_sources(sources: dict[str, str]) -> str:
    return "\n\n".join(f"=== {path} ===\n{content}" for path, content in sources.items())


# Adds stable line numbers that can be echoed in the plan evidence.
def _number_lines(content: str) -> str:
    return "\n".join(f"{index}: {line}" for index, line in enumerate(content.splitlines(), 1))


# Accepts plain or fenced JSON and normalizes command entries into dataclasses.
def _parse_plan_response(text: str, tokens_used: int) -> VerificationPlan:
    data = json.loads(_extract_json(text))
    return VerificationPlan(
        source="llm",
        setup_commands=_parse_commands(data.get("setupCommands", [])),
        verification_commands=_parse_commands(data.get("verificationCommands", [])),
        sources_consulted=_string_list(data.get("sourcesConsulted", [])),
        decisions=_string_list(data.get("decisions", [])),
        fallback_used=False,
        tokens_used=tokens_used,
    )


# Handles common model formatting without accepting non-JSON prose around the payload.
def _extract_json(text: str) -> str:
    stripped = text.strip()
    if stripped.startswith("```json"):
        stripped = stripped[len("```json") :].strip()
        if stripped.endswith("```"):
            stripped = stripped[:-3].strip()
    elif stripped.startswith("```"):
        stripped = stripped[len("```") :].strip()
        if stripped.endswith("```"):
            stripped = stripped[:-3].strip()
    return stripped


# Supports both the requested object format and simple string arrays from the model.
def _parse_commands(values: object) -> list[PlannedCommand]:
    if not isinstance(values, list):
        return []
    commands: list[PlannedCommand] = []
    for value in values:
        if isinstance(value, str):
            command = value.strip()
            if command:
                commands.append(PlannedCommand(command=command))
            continue
        if not isinstance(value, dict):
            continue
        command_value = value.get("command")
        if not isinstance(command_value, str) or not command_value.strip():
            continue
        commands.append(
            PlannedCommand(
                command=command_value.strip(),
                evidence=_string_list(value.get("evidence", [])),
                source=str(value.get("source") or "unknown"),
            )
        )
    return commands


# Normalizes optional model-provided string lists while dropping malformed entries.
def _string_list(values: object) -> list[str]:
    if not isinstance(values, list):
        return []
    return [value for value in values if isinstance(value, str) and value.strip()]
