# Prompt for Good

Prompt for Good coordinates open-source issue discovery, runner dispatch, and contribution reporting. This glossary defines the product language used across the hub, admin console, runner, and agent.

## Language

**Operational Admin Console**:
The authenticated interface used by maintainers to observe hub health, inspect platform data, manage runtime configuration, and trigger ingestion operations. It is not a runner client and should not execute runner work protocols as a normal admin workflow.
_Avoid_: Runner simulator, API explorer, dashboard

**Runner Configuration Console**:
The local interface used by a runner owner to configure how their runner spends machine time, GitHub access, and LLM quota. It is separate from hub administration and manages runner-owned runtime configuration rather than changing central hub state.
_Avoid_: Agent admin, hub admin, runner dashboard

**Runner Runtime Configuration**:
The effective runner settings resolved from local database overrides, environment variables, and catalog defaults. Its catalog uses environment variable names as the canonical keys and covers local runner behavior and policy, not hub-wide operational configuration.
_Avoid_: Agent settings, runner env, YAML config

**Runtime Configuration Override**:
A typed value stored in the local configuration database that takes precedence over the matching environment variable and catalog default. Resetting an override returns the effective value to the next configured fallback.
_Avoid_: Env edit, saved draft, preference

**Structured Environment Value**:
A JSON value stored under an environment-variable configuration key when a runner setting has multiple fields, ordered commands, or nested limits. It keeps the `.env` key vocabulary while preserving typed validation for complex settings.
_Avoid_: YAML section, free-form text blob, extra config file

**Bootstrap Promotion**:
The setup action that copies valid startup `.env` values into local Runtime Configuration Overrides so ongoing runner configuration is managed through the UI and database.
_Avoid_: Export, env sync, migration file

**Runner Readiness Check**:
A non-destructive local diagnostic that verifies whether required runner configuration, credentials, and selected integrations are ready before the runner claims work.
_Avoid_: Verification command, health check, smoke test

**Configuration Resolution API**:
The local API contract that exposes effective Runner Runtime Configuration to both the configuration console and runner execution. It hides persistence details so runners never read the configuration database directly.
_Avoid_: Database access, config file parser, admin-only endpoint

**Configuration Snapshot**:
The effective Runner Runtime Configuration captured before a runner claims or starts a contribution. It remains stable for that contribution so reports, budgets, verification, and execution limits can be interpreted consistently.
_Avoid_: Live config, mutable settings, current env

**Redacted Configuration Snapshot**:
A Configuration Snapshot with secret values removed or replaced by presence metadata before it is reported outside the local runner boundary. It supports hub diagnostics without exposing runner-owned credentials.
_Avoid_: Full config dump, sanitized env, debug payload

**Runner Work Protocol**:
The API workflow used by autonomous runners to register, send heartbeats, receive work, claim issues, and report completion. This protocol belongs to runner execution, not routine hub administration.
_Avoid_: Admin action, manual dispatch flow

**Operations**:
The operational area of the admin console where maintainers check hub reachability, review platform counters, trigger GitHub ingestion, and inspect ingestion run diagnostics.
_Avoid_: Resource, runner controls, API explorer

**Scoring Hardening**:
The work of improving repository and issue qualification using auditable, deterministic signals before dispatch. It sharpens confidence in queued work without spending runner LLM quota.
_Avoid_: Stronger scoring, AI ranking, recommender

**Dispatch Affinity**:
The compatibility score between a runner's project preferences and a qualified issue. It ranks already-compatible work for a runner; it is not a global issue quality score.
_Avoid_: Preference score, personalized issue score

**Solvability Signal**:
A queue-time clue that an issue is likely actionable by an autonomous runner, such as clear reproduction steps, acceptance criteria, bounded scope, or testable behavior.
_Avoid_: Quality signal, issue quality, LLM confidence

**Scoring Diagnostic**:
An auditable explanation of the deterministic signals that affected a repository score, issue score, or dispatch affinity decision.
_Avoid_: Debug log, ranking trace, LLM explanation

**Queue Health Metric**:
An operational measure that shows whether pending work can be matched to runners quickly enough, such as queue size or dispatch matching latency.
_Avoid_: Performance counter, database metric, worker metric
