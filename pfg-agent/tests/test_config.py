"""Tests for runner-facing configuration models."""

import pytest
from pydantic import ValidationError

from pfg_agent.config import ProjectPreferences, _load_project_preferences_from_yaml


def test_project_preferences_map_to_hub_contract():
    preferences = ProjectPreferences(
        languages=[" TypeScript ", "typescript", "Python"],
        ecosystems=["npm", "pip"],
        licenses=["MIT"],
        labels=["Bug", "good first issue"],
        allow_repos=["Acme/Project"],
        block_repos=["Owner/Repo-To-Avoid"],
        max_difficulty="medium",
        max_estimated_minutes=120,
    )

    assert preferences.to_hub_preferences() == {
        "allowedRepos": ["acme/project"],
        "blockedRepos": ["owner/repo-to-avoid"],
        "languages": ["typescript", "python"],
        "ecosystems": ["npm", "pip"],
        "licenses": ["mit"],
        "labels": ["bug", "good first issue"],
        "maxDifficulty": "medium",
        "maxEstimatedMinutes": 120,
    }


def test_project_preferences_reject_unknown_fields():
    with pytest.raises(ValidationError):
        ProjectPreferences(allowed_repos=["acme/project"])


def test_project_preferences_reject_negative_runtime():
    with pytest.raises(ValidationError):
        ProjectPreferences(max_estimated_minutes=-1)


def test_project_preferences_load_from_yaml(monkeypatch, tmp_path):
    config_path = tmp_path / "pfg.yaml"
    config_path.write_text(
        """
project_preferences:
  languages: ["Python"]
  allow_repos: ["Acme/Project"]
  max_difficulty: "easy"
""",
        encoding="utf-8",
    )
    monkeypatch.setenv("PFG_CONFIG_PATH", str(config_path))

    preferences = _load_project_preferences_from_yaml()

    assert preferences.to_hub_preferences() == {
        "allowedRepos": ["acme/project"],
        "blockedRepos": [],
        "languages": ["python"],
        "ecosystems": [],
        "licenses": [],
        "labels": [],
        "maxDifficulty": "easy",
    }
