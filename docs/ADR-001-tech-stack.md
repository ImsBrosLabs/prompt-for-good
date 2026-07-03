# ADR-001: Technology Stack Selection

**Date:** 2026-03-09  
**Status:** Accepted

## Context

We needed to choose the technology stack for each component of the pfg system. The main constraints were:
- pfg-hub should share TypeScript tooling with future API/dashboard work
- pfg-agent needs the best available LLM tooling ecosystem
- pfg-runner must be easy for contributors to deploy

## Decision

| Component | Technology | Rationale |
|---|---|---|
| pfg-hub | NestJS + Drizzle + PostgreSQL | TypeScript backend with explicit SQL mapping, generated OpenAPI types, and a familiar modular service structure |
| pfg-agent | Python + LangChain + GitPython | Best LLM tooling ecosystem; rich GitHub/git libraries |
| pfg-runner | Docker | Universal deployment; contributors need zero setup beyond Docker |
| Default LLM | Claude 3.5 Sonnet (Anthropic) | Best code generation quality at launch; extensible to other providers |

## Consequences

- pfg-hub and pfg-agent are separate services communicating via REST
- Python is used only for the agent; TypeScript is used for the hub
- Architecture is plugin-friendly for adding new LLM providers in the future
