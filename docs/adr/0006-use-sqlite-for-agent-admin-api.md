# Use SQLite for local runner configuration

`pfg-agent-admin-api` stores local Runtime Configuration Overrides in SQLite through Drizzle migrations rather than requiring Postgres. The hub keeps Postgres for platform coordination, while runner configuration is single-node local state and should not require an external database service.
