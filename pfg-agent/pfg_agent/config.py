"""Configuration for pfg-agent, loaded from environment variables and pfg.yaml."""

import os
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class ProjectPreferences(BaseModel):
    """User-owned dispatch criteria loaded from runner configuration."""

    model_config = ConfigDict(extra="forbid")

    languages: list[str] = Field(default_factory=list)
    ecosystems: list[str] = Field(default_factory=list)
    licenses: list[str] = Field(default_factory=list)
    labels: list[str] = Field(default_factory=list)
    allow_repos: list[str] = Field(default_factory=list)
    block_repos: list[str] = Field(default_factory=list)
    max_difficulty: Literal["easy", "medium", "hard"] | None = None
    max_estimated_minutes: int | None = None

    @field_validator(
        "languages",
        "ecosystems",
        "licenses",
        "labels",
        "allow_repos",
        "block_repos",
    )
    @classmethod
    # Canonicalizes list preferences so hub matching is deterministic.
    def normalize_list(cls, values: list[str]) -> list[str]:
        seen = set()
        normalized = []
        for value in values:
            item = value.strip().lower()
            if item and item not in seen:
                normalized.append(item)
                seen.add(item)
        return normalized

    @field_validator("max_estimated_minutes")
    @classmethod
    # Rejects invalid runtime caps before a runner can silently receive unwanted work.
    def validate_max_estimated_minutes(cls, value: int | None) -> int | None:
        if value is not None and value < 0:
            raise ValueError("max_estimated_minutes must be non-negative")
        return value

    # Translates the local YAML vocabulary into the existing hub API DTO.
    def to_hub_preferences(self) -> dict[str, object]:
        preferences: dict[str, object] = {
            "allowedRepos": self.allow_repos,
            "blockedRepos": self.block_repos,
            "languages": self.languages,
            "ecosystems": self.ecosystems,
            "licenses": self.licenses,
            "labels": self.labels,
        }
        if self.max_difficulty is not None:
            preferences["maxDifficulty"] = self.max_difficulty
        if self.max_estimated_minutes is not None:
            preferences["maxEstimatedMinutes"] = self.max_estimated_minutes
        return preferences


# Loads only runner project preferences from pfg.yaml while existing env settings stay unchanged.
def _load_project_preferences_from_yaml() -> ProjectPreferences:
    config_path = Path(os.environ.get("PFG_CONFIG_PATH", "pfg.yaml"))
    if not config_path.exists():
        return ProjectPreferences()

    data = yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}
    if not isinstance(data, dict):
        raise ValueError(f"{config_path} must contain a YAML object")

    preferences = data.get("project_preferences") or {}
    if not isinstance(preferences, dict):
        raise ValueError("project_preferences must be a YAML object")

    return ProjectPreferences.model_validate(preferences)


class Settings(BaseSettings):
    """Agent configuration. All values can be overridden via environment variables."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # Hub connection
    pfg_hub_url: str = Field(..., description="URL of the pfg-hub server")
    pfg_token: str = Field(..., description="Runner token for pfg-hub authentication")
    pfg_hub_request_timeout: float = Field(
        10.0, description="Timeout in seconds for pfg-hub HTTP requests"
    )
    pfg_hub_retry_attempts: int = Field(
        5, description="Retry attempts for transient pfg-hub connection failures"
    )
    pfg_hub_retry_delay_seconds: float = Field(
        2.0, description="Delay between pfg-hub retry attempts"
    )

    # LLM
    anthropic_api_key: str = Field(..., description="Anthropic API key")
    llm_model: str = Field("claude-sonnet-4-6", description="Claude model to use")
    max_tokens_per_day: int = Field(100_000, description="Daily token budget")

    # GitHub
    github_token: str = Field(..., description="GitHub personal access token")

    # Runner identity
    runner_id: str = Field(
        ..., description="Runner UUID obtained after registration via POST /runners/register"
    )
    contributor_name: str = Field("anonymous", description="Your name or handle")

    # Behaviour
    max_retries: int = Field(3, description="Max fix attempts per issue before giving up")
    clone_depth: int = Field(1, description="Git clone depth (shallow)")
    work_dir: str = Field("/tmp/pfg-work", description="Working directory for clones")
    project_preferences: ProjectPreferences = Field(
        default_factory=_load_project_preferences_from_yaml
    )


settings = Settings()  # type: ignore[call-arg]
