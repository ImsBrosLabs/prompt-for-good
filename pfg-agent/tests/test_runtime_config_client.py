"""Tests for the local runtime configuration API client."""

import httpx
import pytest

from pfg_agent.runtime_config_client import RuntimeConfigClient


def test_runtime_config_client_fetches_snapshot(monkeypatch):
    calls = []
    request = httpx.Request("GET", "http://admin-api.test/configuration/snapshot")

    def fake_get(url, **kwargs):
        calls.append((url, kwargs))
        return httpx.Response(
            200,
            json={"values": {"PFG_HUB_URL": "https://hub.test"}},
            request=request,
        )

    monkeypatch.setattr(httpx, "get", fake_get)

    client = RuntimeConfigClient(
        base_url="http://admin-api.test/",
        admin_token="local-token",
        request_timeout=1.5,
    )

    assert client.snapshot() == {"PFG_HUB_URL": "https://hub.test"}
    assert calls == [
        (
            "http://admin-api.test/configuration/snapshot",
            {"headers": {"X-Admin-Token": "local-token"}, "timeout": 1.5},
        )
    ]


def test_runtime_config_client_rejects_invalid_snapshot_payload(monkeypatch):
    request = httpx.Request("GET", "http://admin-api.test/configuration/snapshot")

    def fake_get(url, **kwargs):
        return httpx.Response(200, json={"data": []}, request=request)

    monkeypatch.setattr(httpx, "get", fake_get)

    client = RuntimeConfigClient("http://admin-api.test", "local-token")

    with pytest.raises(RuntimeError, match="values object"):
        client.snapshot()
