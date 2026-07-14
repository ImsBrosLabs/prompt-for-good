# Do not export runner `.env` files

The Runner Configuration Console does not generate or export `.env` files. Runner Runtime Configuration is persisted through local database overrides and resolved through the Configuration Resolution API; `.env` remains a bootstrap fallback layer, not an artifact produced by the admin UI.
