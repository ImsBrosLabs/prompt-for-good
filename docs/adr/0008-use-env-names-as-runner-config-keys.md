# Use environment variable names as runner configuration keys

The local runner configuration catalog exposes environment variable names such as `PFG_HUB_URL`, `PFG_TOKEN`, `LLM_MODEL`, and `MAX_TOKENS_PER_DAY` as canonical API keys. This differs from the hub's camelCase runtime configuration keys, but keeps the agent admin contract aligned with the existing runner `.env` vocabulary.
