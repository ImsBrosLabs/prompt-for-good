"""Client for the local runner Configuration Resolution API."""

from dataclasses import dataclass
from typing import Any

import httpx


@dataclass(frozen=True)
class RuntimeConfigClient:
    """Reads effective runner configuration from the local admin API."""

    base_url: str
    admin_token: str
    request_timeout: float = 10.0

    # Fetches a stable config payload without depending on React-admin metadata.
    def snapshot(self) -> dict[str, Any]:
        url = f"{self.base_url.rstrip('/')}/configuration/snapshot"
        response = httpx.get(
            url,
            headers={"X-Admin-Token": self.admin_token},
            timeout=self.request_timeout,
        )
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict) or not isinstance(payload.get("values"), dict):
            raise RuntimeError("Configuration snapshot response must contain a values object")
        return dict(payload["values"])
