"""Tests for repository-driven verification command planning."""

import subprocess
from dataclasses import dataclass
from pathlib import Path

from pfg_agent.phases.context import CodeContext
from pfg_agent.phases.plan_verification import plan_verification


@dataclass
class _Usage:
    input_tokens: int
    output_tokens: int


@dataclass
class _Content:
    text: str


@dataclass
class _Response:
    content: list[_Content]
    usage: _Usage


class _Messages:
    def __init__(self, text: str) -> None:
        self.text = text

    def create(self, **_kwargs: object) -> _Response:
        return _Response(content=[_Content(self.text)], usage=_Usage(11, 13))


class _Client:
    def __init__(self, text: str) -> None:
        self.messages = _Messages(text)


# Creates a tracked repository so source collection follows the same path as cloned work.
def _init_repo(path: Path) -> None:
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


# Tracks a file fixture because the planner only consults repository-owned files.
def _commit_file(repo: Path, rel_path: str, content: str) -> None:
    target = repo / rel_path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    subprocess.run(["git", "add", rel_path], cwd=repo, check=True, capture_output=True)
    subprocess.run(["git", "commit", "-m", rel_path], cwd=repo, check=True, capture_output=True)


def test_plan_verification_uses_llm_structured_commands(monkeypatch, tmp_path):
    _init_repo(tmp_path)
    _commit_file(
        tmp_path,
        "README.md",
        "## Development\nRun `npm install && npm test` before opening a PR.\n",
    )
    _commit_file(
        tmp_path,
        "package.json",
        '{"scripts":{"test":"vitest"}}\n',
    )
    response = """
    {
      "setupCommands": [
        {"command": "npm install", "evidence": ["README.md:2"], "source": "docs"}
      ],
      "verificationCommands": [
        {"command": "npm test", "evidence": ["README.md:2"], "source": "docs"}
      ],
      "sourcesConsulted": ["README.md", "package.json"],
      "decisions": ["README command split on && for clearer diagnostics"]
    }
    """
    monkeypatch.setattr("pfg_agent.phases.plan_verification._client", _Client(response))

    plan = plan_verification(CodeContext(repo_path=tmp_path, files={}))

    assert plan.source == "llm"
    assert plan.setup_commands[0].command == "npm install"
    assert plan.setup_commands[0].evidence == ["README.md:2"]
    assert plan.verification_commands[0].command == "npm test"
    assert plan.sources_consulted == ["README.md", "package.json"]
    assert plan.decisions == ["README command split on && for clearer diagnostics"]
    assert plan.fallback_used is False
    assert plan.tokens_used == 24


def test_plan_verification_falls_back_when_llm_finds_no_command(monkeypatch, tmp_path):
    _init_repo(tmp_path)
    _commit_file(tmp_path, "package.json", '{"scripts":{"test":"vitest"}}\n')
    response = """
    {
      "setupCommands": [],
      "verificationCommands": [],
      "sourcesConsulted": ["package.json"],
      "decisions": ["No explicit repo recommendation found"]
    }
    """
    monkeypatch.setattr("pfg_agent.phases.plan_verification._client", _Client(response))

    plan = plan_verification(CodeContext(repo_path=tmp_path, files={}))

    assert plan.source == "fallback"
    assert plan.fallback_used is True
    assert plan.verification_commands[0].command == "npm test --silent"
    assert plan.decisions[-1] == "Fallback command selected from package.json"
    assert plan.tokens_used == 24
