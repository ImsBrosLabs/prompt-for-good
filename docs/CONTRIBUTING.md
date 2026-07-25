# Contributing to Prompt for Good

Thank you for wanting to contribute! Here's how to get involved.

## Ways to Contribute

- **Run a pfg-runner:** Donate your unused LLM quota (see below)
- **Improve pfg-hub:** NestJS/TypeScript backend contributions
- **Improve pfg-agent:** Python/LangChain AI pipeline contributions
- **Suggest repos:** Open an issue to nominate an open-source project for the hub

---

## Development setup options

You can develop with either a Docker-based environment or a native local
environment. Both paths are supported so contributors can choose the workflow
that fits their machine and preferences.

### Docker-based setup

From the repository root:

```bash
cp .env.example .env
docker compose build
```

The root `.env` configures the services declared in the root `docker-compose.yml`.
Native setups use component-specific env files, such as `pfg-agent/.env.example`
or `pfg-runner/.env.example`.

On Windows/WSL, enable Docker Desktop integration for the distro that contains
the repository before running these commands.

### Run pfg-hub locally

```bash
docker compose up hub
```

The hub is available at:

```text
https://hub.pfg.local:8080
https://hub.pfg.local:8080/docs
```

### Test pfg-hub

```bash
# Full hub test suite
docker compose run --rm hub-test

# One test file
docker compose run --rm hub-test npm test -- test/scoring.service.spec.ts

# TypeScript lint
docker compose run --rm hub-lint
```

The Docker test path uses a dedicated `postgres-test` container and enables the
DB integration specs with `RUN_DB_TESTS=true`.

### Test pfg-agent

```bash
# Full agent test suite
docker compose run --rm agent-test

# One test file
docker compose run --rm agent-test uv run --extra dev pytest tests/test_context.py -q

# Python lint / format checks
docker compose run --rm agent-lint
docker compose run --rm agent-format-check
```

### Run pfg-agent against the local hub

```bash
docker compose up hub
docker compose run --rm agent
```

### Run pfg-runner locally

Fill the real runner values in `.env`, then run:

```bash
docker compose --profile runner up runner
```

### Native setup overview

For native development, install only the stack you are working on:

- `pfg-hub`: Node.js 22+; Docker is still useful for PostgreSQL, or provide your own PostgreSQL.
- `pfg-agent`: Python 3.11+ and `uv` or `pip`.
- `pfg-runner`: Docker, because the runner itself is distributed as a container.

Detailed commands are listed in the component sections below.

---

## Running a pfg-runner (donate your API quota)

The runner package exists and can be run locally, but the autonomous agent
pipeline is still evolving. Treat it as a development path until the public hub
and contributor onboarding are production-ready.

### Prerequisites

- Docker installed
- An Anthropic API key (or OpenAI/Gemini in future)
- A GitHub personal access token with `repo` scope

### Steps

```bash
# 1. Clone this repo
git clone https://github.com/ImsBrosLabs/prompt-for-good.git
cd prompt-for-good/pfg-runner

# 2. Copy the example env config used by Docker Compose
cp .env.example .env

# 3. Edit .env
#    - Set your contributor name
#    - Set PFG_TOKEN, ANTHROPIC_API_KEY, and PFG_GITHUB_TOKEN
#    - Configure the daily token limit

# 4. Run
docker compose up
```

Environment variables (can also go in `.env`):
```
ANTHROPIC_API_KEY=sk-ant-...
PFG_GITHUB_TOKEN=ghp_...
PFG_TOKEN=<your pfg hub token>
```

---

## Developing pfg-hub

If you are new to the hub internals, read the
[pfg-hub onboarding guide](PFG_HUB_ONBOARDING.md) first. It maps the NestJS
modules, Drizzle database layer, runner flow, and issue lifecycle.

### Prerequisites

- Docker, when using the containerized setup
- Node.js 22+, when using the native setup
- TypeScript-aware IDE

### Docker setup

```bash
# Start PostgreSQL + pfg-hub with Node.js inside Docker
docker compose up hub
```

The hub is available at:

```text
https://hub.pfg.local:8080
https://hub.pfg.local:8080/docs
```

### Running tests in Docker

```bash
docker compose run --rm hub-test
```

### Native setup

If you prefer running the hub directly on your machine:

```bash
cd pfg-hub
docker compose up -d postgres

# Run the application
npm install
npm run db:migrate
npm run dev
```

### Running native tests

```bash
npm test
npm run lint
```

---

## Developing pfg-agent

### Prerequisites

- Docker, when using the containerized setup
- Python 3.11+ and `uv` or `pip`, when using the native setup

### Docker setup

```bash
# Run tests inside the container
docker compose run --rm agent-test

# Run lint / format checks
docker compose run --rm agent-lint
docker compose run --rm agent-format-check
```

### Native setup

```bash
cd pfg-agent

# Install dependencies
uv sync
# or: pip install -e ".[dev]"

# Copy env config
cp .env.example .env
# Fill in ANTHROPIC_API_KEY, PFG_GITHUB_TOKEN, PFG_HUB_URL
```

Run tests:

```bash
pytest
```

---

## Code Style

- **pfg-hub (TypeScript):** Keep controllers thin, preserve the OpenAPI contract, and run `npm run lint`.
- **pfg-agent (Python):** Follow PEP 8. `ruff` is enforced in CI.

---

## Submitting a PR

1. Fork the repository
2. Create a branch: `git checkout -b feat/your-feature`
3. Make your changes + add tests
4. Run the test suite
5. Open a PR against `main` with a clear description

---

## Code of Conduct

Be kind. Be constructive. We're all here to make open source better.
