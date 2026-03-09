# Prompt for Good 🤖

> *Your unused AI quota, working for open source.*

**Prompt for Good** (`pfg`) turns idle LLM API credits into real open-source contributions. Contributors run a lightweight Docker container with their own API key — the container claims pre-qualified GitHub issues, generates fixes autonomously, validates them (build + tests), and opens Pull Requests. No human in the loop.

---

## How It Works

```
┌─────────────────────────────────────────────────────┐
│                      pfg-hub                        │
│           (Central server — hosted by maintainers)  │
│                                                     │
│  • Crawls GitHub → finds eligible OSS repos         │
│  • Pre-qualifies issues (solvability scoring)       │
│  • Runner registry + FIFO dispatch queue            │
│  • Contribution tracking (PRs opened)               │
│  • REST API                                         │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP
        ┌──────────────┴──────────────┐
        │                             │
┌───────▼────────┐          ┌─────────▼──────────┐
│  pfg-runner    │          │    pfg-runner       │
│  (Docker)      │          │    (Docker)         │
│  Contributor A │          │    Contributor B    │
│  LLM API key   │          │    LLM API key      │
│  + pfg-agent   │          │    + pfg-agent      │
└───────┬────────┘          └────────────────────-┘
        │
        ▼
  GitHub API → Clone → Analyze → Patch → Build/Tests → PR
```

### The 7-Phase Agent Pipeline

| Phase | Description |
|---|---|
| 1. Claim | Fetch next qualified issue from pfg-hub |
| 2. Analyze | LLM understands the problem, identifies impacted files |
| 3. Context | Clone repo, extract only relevant code (AST/grep/embeddings) |
| 4. Solve | LLM generates a targeted diff/patch |
| 5. Verify | Apply patch, run build + tests locally (retry up to 3×) |
| 6. PR | Push branch + open PR via GitHub API (LLM-generated description) |
| 7. Report | Notify pfg-hub of success or failure |

---

## Repository Structure

```
prompt-for-good/
├── pfg-hub/          # Central server (Kotlin + Spring Boot + PostgreSQL)
├── pfg-agent/        # Autonomous AI agent (Python + LangChain)
├── pfg-runner/       # Docker container wrapping pfg-agent
└── docs/             # Architecture, ADRs, contributing guides
```

---

## Quick Start (Contributors)

> Coming in Milestone 4. For now, see [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md).

```bash
# 1. Copy and configure
cp pfg-runner/pfg.example.yaml pfg.yaml
# Edit pfg.yaml with your API key and GitHub token

# 2. Run
docker run -v $(pwd)/pfg.yaml:/app/pfg.yaml \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -e GITHUB_TOKEN=ghp_... \
  ghcr.io/imsbrostabs/pfg-runner:latest
```

---

## Milestones

- **M1 — Foundation:** pfg-hub core API + basic agent (claim → analyze)
- **M2 — Code Intelligence:** smart context extraction (no wasted tokens)
- **M3 — Full Contribution:** patch → verify → PR → report
- **M4 — Distribution:** Docker runner, contributor onboarding in < 5 min
- **M5 — Production:** public release, stats dashboard, `promptforgood.dev`

---

## Tech Stack

| Component | Stack |
|---|---|
| pfg-hub | Kotlin, Spring Boot, PostgreSQL |
| pfg-agent | Python, LangChain, GitPython |
| pfg-runner | Docker |
| Default LLM | Claude (claude-3-5-sonnet), extensible to OpenAI/Gemini |

---

## Philosophy

- **Zero waste:** Issues are scored and pre-qualified before any LLM token is spent
- **Safety first:** A patch is only submitted as a PR if build + tests pass locally
- **Contributor-friendly:** Bring your own API key, control your quota limits and active hours
- **Open by design:** Plugin-friendly architecture, multi-LLM support planned

---

## License

MIT — See [LICENSE](LICENSE)

---

## Contributing

See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for guidelines.

Built with ❤️ by [ImsBrosLabs](https://github.com/ImsBrosLabs)
