"""Configuration for pfg-agent, loaded from environment variables and pfg.yaml."""

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Agent configuration. All values can be overridden via environment variables."""

    # Hub connection
    pfg_hub_url: str = Field(..., description="URL of the pfg-hub server")
    pfg_token: str = Field(..., description="Runner token for pfg-hub authentication")

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

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()  # type: ignore[call-arg]
