<div align="center">
  <img src="docs/logo.svg" width="160" alt="Prompt for Good logo"/>

  # Prompt for Good

  > *Your unused AI quota, working for open source.*
</div>

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

## Development

You can develop with Docker-based services or with native local tooling. The
root `.env` file is only used by the root `docker-compose.yml`; native setups
use the component-specific files such as `pfg-agent/.env.example`.

### Option A: Docker-based development

Use this path if you do not want to install Java, Python, Gradle, `uv`, or
PostgreSQL locally.

From the repository root:

```bash
cp .env.example .env
docker compose build
```

The root `.env` configures the services in `docker-compose.yml`:

| Variable | Used by | Purpose |
|---|---|---|
| `PFG_HUB_PORT` | `hub` | Host port for the Spring Boot API |
| `PFG_POSTGRES_PORT` | `postgres` | Host port for the dev database |
| `ADMIN_KEY` | `hub` | Admin token for `/seed/**` endpoints |
| `GITHUB_TOKEN` | `hub`, `agent`, `runner` | GitHub API token when real calls are needed |
| `PFG_HUB_URL` | `agent`, `runner` | Hub URL seen from containers |
| `PFG_TOKEN` | `agent`, `runner` | Runner token used to call the hub |
| `RUNNER_ID` | `agent`, `runner` | Registered runner id |
| `ANTHROPIC_API_KEY` | `agent`, `runner` | LLM API key |
| `CONTRIBUTOR_NAME` | `agent`, `runner` | Contributor display name |
| `MAX_TOKENS_PER_DAY` | `agent`, `runner` | Local daily LLM budget |

Run the hub:

```bash
docker compose up hub
```

The hub is available at:

```text
http://localhost:8080
http://localhost:8080/swagger-ui.html
```

Run hub checks:

```bash
# Full hub test suite
docker compose run --rm hub-test

# One hub test class
docker compose run --rm hub-test ./gradlew test --tests dev.promptforgood.service.ScoringServiceTest --no-daemon

# Kotlin lint
docker compose run --rm hub-lint
```

Run agent checks:

```bash
# Full agent test suite
docker compose run --rm agent-test

# One agent test file
docker compose run --rm agent-test uv run --extra dev pytest tests/test_context.py -q

# Python lint / format checks
docker compose run --rm agent-lint
docker compose run --rm agent-format-check
```

Run the agent against the local hub:

```bash
docker compose up hub
docker compose run --rm agent
```

Run the local runner image:

```bash
docker compose --profile runner up runner
```

### Option B: Native development

Use this path if you prefer local IDE/tooling integration.

For `pfg-hub`, install JDK 21+. You can still use Docker only for PostgreSQL:

```bash
cd pfg-hub
docker compose up -d postgres
./gradlew bootRun
```

Run hub tests natively:

```bash
cd pfg-hub
./gradlew test
./gradlew ktlintCheck
```

For `pfg-agent`, install Python 3.11+ and `uv`:

```bash
cd pfg-agent
cp .env.example .env
uv sync --extra dev
uv run pytest -q
uv run ruff check .
uv run ruff format --check .
```

The native `pfg-agent/.env` configures the agent process itself. It is separate
from the root `.env` used by Docker Compose.

For `pfg-runner`, use the runner-specific Compose setup:

```bash
cd pfg-runner
cp .env.example .env
docker compose up
```

See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for more contribution
workflow details.

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
| Default LLM | Claude (claude-sonnet-4-6), extensible to OpenAI/Gemini |

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
