# Keep runner lifecycle control out of the initial agent admin scope

The initial Runner Configuration Console configures, registers, and diagnoses a runner but does not start, stop, restart, or supervise runner processes. Runner lifecycle control is deferred as a future evolution because it requires Docker or process orchestration beyond the configuration boundary.
