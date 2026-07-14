# Register runners from the local admin

The Runner Configuration Console includes a runner registration flow that calls the hub's runner registration endpoint, stores the returned `RUNNER_ID` and `PFG_TOKEN` as local Runtime Configuration Overrides, and masks the token after creation. This keeps first-run setup inside the local configuration workflow instead of requiring contributors to manually obtain and copy runner credentials elsewhere.
