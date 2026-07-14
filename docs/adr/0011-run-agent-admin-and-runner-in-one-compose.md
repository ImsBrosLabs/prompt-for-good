# Run agent admin and runner in one local compose stack

The local runner distribution starts `pfg-agent-admin`, `pfg-agent-admin-api`, and `pfg-runner` from the same compose stack. This makes the Configuration Resolution API an explicit dependency of runner execution, shares the local SQLite configuration volume, and gives contributors one startup path for configuring and running their donated agent capacity.
