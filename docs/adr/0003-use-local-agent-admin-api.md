# Use a local agent admin API

`pfg-agent-admin` talks to a dedicated local `pfg-agent-admin-api` rather than writing configuration directly or embedding admin endpoints in the runner. This keeps the Runner Configuration Console aligned with the `pfg-hub-admin` architecture while preserving a clean boundary between local configuration management and runner execution.
