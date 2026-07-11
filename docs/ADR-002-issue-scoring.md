# ADR-002: Pre-Qualification Strategy for Issues

**Date:** 2026-03-09  
**Status:** Accepted

## Context

LLM tokens are the scarcest resource in this system. If an agent claims an issue and discovers it's impossible to solve (missing context, too large, ambiguous requirements), those tokens are wasted. We need a strategy to minimize this.

## Decision

pfg-hub pre-qualifies issues **before** dispatching them to runners. An agent never sees an issue that hasn't passed the scoring filter.

Scoring remains deterministic and auditable. The hub must not spend runner LLM
quota to rank candidate repositories, issues or runner-specific matches.

### Repository eligibility criteria

- Has a CI configuration (`.github/workflows/`, `.travis.yml`, etc.)
- Has a test directory (`tests/`, `test/`, `spec/`, etc.)
- Recent activity: at least one commit in the last 3 months
- At least 50 stars (proxy for project health)

Repository scoring is stored with a JSON scoring diagnostic snapshot.

| Signal | Points |
|---|---:|
| At least 50 stars | +20 |
| At least 250 stars | +5 |
| At least 1000 stars | +5 |
| CI detected | +25 |
| Tests detected | +25 |
| Recent activity | +20 |

### Issue solvability scoring

Issues are scored 0–100. Only issues scoring ≥ 60 enter the queue.

| Signal | Points |
|---|---:|
| Has `good first issue` label | +25 |
| Has `bug` label | +15 |
| Has `help wanted` label | +10 |
| Has `pfg-eligible` label (maintainer opt-in) | +25 |
| Description > 200 characters | +10 |
| Contains "expected" and "actual" behavior | +10 |
| Has a linked failing test or reproduction | +15 |
| Has acceptance criteria or checklist | +10 |
| Has fenced code block for testable behavior | +5 |
| Missing body | -30 |
| Ambiguous or very short scope | -20 |
| Body longer than 5000 characters | -15 |

Issue scoring is stored with a JSON scoring diagnostic snapshot. Rejected issues
do not create queue rows, but ingestion runs keep bounded rejected-issue
diagnostic samples so maintainers can calibrate false negatives.

### Dispatch affinity

Runner project preferences are applied at dispatch time. Compatible candidates
are sorted by dispatch affinity, then issue score, then oldest creation time.
Dispatch affinity diagnostics are computed for the dispatch decision and logged
with matching latency.

| Signal | Points |
|---|---:|
| Allowed repository matched | +6 |
| Language matched | +3 |
| Ecosystem matched | +3 |
| License matched | +2 |
| Label matched | +4 |
| Runner declares maximum difficulty | +1 |
| Runner declares maximum estimated runtime | +1 |

### Queue health

The hub exposes queue size and recent matching latency through stats and the
admin scoring screen. Keep in-memory dispatch while pending issues are at or
below 1000 and recent p95 matching latency stays below 100 ms. Plan
database-side ranking when either threshold is exceeded durably.

A `claimed` issue that fails 3 times is marked `failed` and removed from the
queue.

## Consequences

- Zero wasted LLM tokens on un-solvable issues
- Maintainer opt-in label `pfg-eligible` gives explicit control to repo owners
- Scoring is heuristic; it will be tuned over time based on success rates
- Auditable diagnostics make score calibration and dispatch decisions visible in
  the admin console
