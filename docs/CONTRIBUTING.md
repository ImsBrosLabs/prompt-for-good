# Contributing to Prompt for Good

Thank you for wanting to contribute! Here's how to get involved.

## Ways to Contribute

- **Run a pfg-runner:** Donate your unused LLM quota (see below)
- **Improve pfg-hub:** Kotlin/Spring Boot backend contributions
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
http://localhost:8080
http://localhost:8080/swagger-ui.html
```

### Test pfg-hub

```bash
# Full hub test suite
docker compose run --rm hub-test

# One test class
docker compose run --rm hub-test ./gradlew test --tests dev.promptforgood.service.ScoringServiceTest --no-daemon

# Kotlin lint
docker compose run --rm hub-lint
```

The Docker test path uses a dedicated `postgres-test` container. Native and CI
runs can still use Testcontainers when no external datasource is provided.

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

- `pfg-hub`: JDK 21+; Docker is still useful for PostgreSQL, or provide your own PostgreSQL.
- `pfg-agent`: Python 3.11+ and `uv` or `pip`.
- `pfg-runner`: Docker, because the runner itself is distributed as a container.

Detailed commands are listed in the component sections below.

---

## Running a pfg-runner (donate your API quota)

> Available from **Milestone 4**. Stay tuned.

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
#    - Set PFG_TOKEN, ANTHROPIC_API_KEY, and GITHUB_TOKEN
#    - Configure the daily token limit

# 4. Run
docker compose up
```

Environment variables (can also go in `.env`):
```
ANTHROPIC_API_KEY=sk-ant-...
GITHUB_TOKEN=ghp_...
PFG_TOKEN=<your pfg hub token>
```

---

## Developing pfg-hub

### Prerequisites

- Docker, when using the containerized setup
- JDK 21+, when using the native setup
- Kotlin-aware IDE (IntelliJ IDEA recommended)

### Docker setup

```bash
# Start PostgreSQL + pfg-hub with JDK 21 inside Docker
docker compose up hub
```

The hub is available at:

```text
http://localhost:8080
http://localhost:8080/swagger-ui.html
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
./gradlew bootRun
```

### Running native tests

```bash
./gradlew test
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
# Fill in ANTHROPIC_API_KEY, GITHUB_TOKEN, PFG_HUB_URL
```

Run tests:

```bash
pytest
```

---

## Code Style

- **pfg-hub (Kotlin):** Follow [Kotlin coding conventions](https://kotlinlang.org/docs/coding-conventions.html). ktlint is enforced in CI.
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
