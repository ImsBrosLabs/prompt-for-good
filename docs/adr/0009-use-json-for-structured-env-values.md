# Use JSON for structured environment values

Complex runner settings use typed JSON values under canonical environment-variable keys instead of introducing a second configuration file or many fine-grained variables. This allows keys such as `RUNNER_PROJECT_PREFERENCES`, `VERIFICATION_COMMANDS`, and `REPOSITORY_EXECUTION_LIMITS` to remain part of the `.env` vocabulary while still supporting catalog validation and structured admin UI controls.
