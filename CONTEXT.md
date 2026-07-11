# Prompt for Good

Prompt for Good coordinates open-source issue discovery, runner dispatch, and contribution reporting. This glossary defines the product language used across the hub, admin console, runner, and agent.

## Language

**Operational Admin Console**:
The authenticated interface used by maintainers to observe hub health, inspect platform data, manage runtime configuration, and trigger ingestion operations. It is not a runner client and should not execute runner work protocols as a normal admin workflow.
_Avoid_: Runner simulator, API explorer, dashboard

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
