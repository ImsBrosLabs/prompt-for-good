"""Set required env vars before any module-level Settings() instantiation."""

import os


def pytest_configure(config):
    os.environ.setdefault("PFG_HUB_URL", "http://localhost:8080")
    os.environ.setdefault("PFG_TOKEN", "test-token")
    os.environ.setdefault("ANTHROPIC_API_KEY", "sk-ant-test-key")
    os.environ.setdefault("GITHUB_TOKEN", "ghp_test_token")
