# Runners use the configuration API

The runner reads effective Runner Runtime Configuration through the local Configuration Resolution API instead of reading the configuration database directly. This keeps persistence private to `pfg-agent-admin-api`, gives validation and fallback behavior one authoritative implementation, and prevents runner execution from depending on database schema details.

If the Configuration Resolution API is unavailable, a real runner fails startup rather than silently falling back to `.env`. This prevents stale bootstrap values from bypassing database overrides for quota, model provider, verification, or repository execution limits.
