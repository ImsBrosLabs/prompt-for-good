# Mask runner configuration secrets

The Runner Configuration Console treats hub tokens, model provider API keys, and GitHub tokens as secret runtime configuration values. Secret values may be stored as local database overrides and resolved for runner execution, but admin responses and UI fields never echo persisted secret values in clear text; they only report whether a secret is set and allow replacement or reset.

Bootstrap Promotion may import secret values from the startup `.env` into secret database overrides. After promotion, those secrets follow the same masking rule and are never returned in clear text by admin responses.
