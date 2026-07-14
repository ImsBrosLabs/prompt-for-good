# Promote bootstrap `.env` values to the database

The Runner Configuration Console includes a Bootstrap Promotion action that imports valid startup `.env` values into local Runtime Configuration Overrides. This lets contributors start the local admin API with a minimal `.env`, complete setup through the UI, and then manage normal runner configuration through the database-backed configuration flow.

Promotion does not change the resolution order: effective configuration always remains database override, then `.env`, then catalog default. The UI reports setup as complete when required keys have database overrides, and reports drift if a required key falls back to `.env` again after a reset.
