# Contributing to Prompt for Good

Thank you for wanting to contribute! Here's how to get involved.

## Ways to Contribute

- **Run a pfg-runner:** Donate your unused LLM quota (see below)
- **Improve pfg-hub:** Kotlin/Spring Boot backend contributions
- **Improve pfg-agent:** Python/LangChain AI pipeline contributions
- **Suggest repos:** Open an issue to nominate an open-source project for the hub

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

# 2. Copy the example config
cp pfg.example.yaml pfg.yaml

# 3. Edit pfg.yaml
#    - Set your contributor name
#    - Configure active hours and daily token limit

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

- JDK 21+
- Docker (for local PostgreSQL)
- Kotlin-aware IDE (IntelliJ IDEA recommended)

### Setup

```bash
cd pfg-hub

# Start PostgreSQL
docker compose -f docker-compose.dev.yml up -d

# Run the application
./gradlew bootRun
```

### Running tests

```bash
./gradlew test
```

---

## Developing pfg-agent

### Prerequisites

- Python 3.11+
- `uv` (recommended) or `pip`

### Setup

```bash
cd pfg-agent

# Install dependencies
uv sync
# or: pip install -e ".[dev]"

# Copy env config
cp .env.example .env
# Fill in ANTHROPIC_API_KEY, GITHUB_TOKEN, PFG_HUB_URL
```

### Running tests

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
