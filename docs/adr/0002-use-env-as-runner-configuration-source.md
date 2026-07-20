# Resolve runner configuration from database overrides

The Runner Configuration Console uses the same runtime configuration model as `pfg-hub-admin`: local database override, then `.env`, then catalog default. The database stores only explicit typed overrides, while `.env` remains the bootstrap and fallback layer for deployable defaults and secrets that should not be written into exported config files.

In normal operation after first setup, contributors are expected to manage runner settings through the UI and local database overrides. The startup `.env` exists to boot the local admin API and seed fallback values, not as the long-term editing surface.
