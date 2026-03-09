# ADR-002: Pre-Qualification Strategy for Issues

**Date:** 2026-03-09  
**Status:** Accepted

## Context

LLM tokens are the scarcest resource in this system. If an agent claims an issue and discovers it's impossible to solve (missing context, too large, ambiguous requirements), those tokens are wasted. We need a strategy to minimize this.

## Decision

pfg-hub pre-qualifies issues **before** dispatching them to runners. An agent never sees an issue that hasn't passed the scoring filter.

### Repository eligibility criteria

- Has a CI configuration (`.github/workflows/`, `.travis.yml`, etc.)
- Has a test directory (`tests/`, `test/`, `spec/`, etc.)
- Recent activity: at least one commit in the last 3 months
- At least 50 stars (proxy for project health)

### Issue solvability scoring

Issues are scored 0–100. Only issues scoring ≥ 60 enter the queue.

| Signal | Points |
|---|---|
| Has `good first issue` label | +25 |
| Has `bug` label | +15 |
| Has `help wanted` label | +10 |
| Has `pfg-eligible` label (maintainer opt-in) | +30 |
| Description > 200 characters | +10 |
| Contains "expected" and "actual" behavior | +10 |
| Not assigned to anyone | +10 |
| Opened < 90 days ago | +5 |
| Has a linked failing test or reproduction | +15 |

Issues are re-scored every 24h. A `claimed` issue that fails 3 times is marked `failed` and removed from the queue.

## Consequences

- Zero wasted LLM tokens on un-solvable issues
- Maintainer opt-in label `pfg-eligible` gives explicit control to repo owners
- Scoring is heuristic; it will be tuned over time based on success rates
