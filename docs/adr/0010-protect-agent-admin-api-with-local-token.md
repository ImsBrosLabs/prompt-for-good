# Protect the local agent admin API with a token

`pfg-agent-admin-api` requires a local admin token such as `PFG_AGENT_ADMIN_TOKEN` for configuration access and mutation, even when bound to localhost. The console can modify secrets, budgets, provider settings, and repository execution limits, so localhost binding is not treated as sufficient authorization.
