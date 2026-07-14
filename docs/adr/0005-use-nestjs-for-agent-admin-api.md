# Use NestJS for the local agent admin API

`pfg-agent-admin-api` uses the same TypeScript, NestJS, Drizzle, migration, and catalog-based runtime configuration pattern as `pfg-hub`. The agent itself remains Python for execution, but local configuration management follows the existing hub admin architecture so validation, source reporting, and React-admin integration stay consistent.
