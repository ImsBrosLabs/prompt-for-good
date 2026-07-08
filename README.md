<div align="center">
  <img src="docs/logo.svg" width="160" alt="Prompt for Good logo"/>

  # Prompt for Good

  > Your unused AI quota, working for open source.
</div>

**Prompt for Good** (`pfg`) turns idle LLM API credits into open-source
contributions. The project is split into a TypeScript hub API, a Python agent,
and a Docker runner that packages the agent for contributors.

The current codebase is an MVP. The hub already supports runner registration,
issue dispatch, claiming, completion reporting, stats, OpenAPI docs, manual
GitHub seeding, scheduled GitHub ingestion, and DB-backed tests. The agent and
runner are still evolving toward the full autonomous "claim -> patch -> PR"
workflow.

---

## How It Works

```text
                 +------------------------------+
                 |            pfg-hub           |
                 | NestJS + Fastify + Drizzle   |
                 | PostgreSQL + GitHub REST API |
                 |                              |
                 | - runner registry            |
                 | - issue queue                |
                 | - scoring                    |
                 | - GitHub seeding/ingestion   |
                 | - contribution tracking      |
                 +---------------+--------------+
                                 |
                                 | HTTP
                                 |
                  +--------------v--------------+
                  |         pfg-runner          |
                  | Docker image with pfg-agent |
                  +--------------+--------------+
                                 |
                                 v
             GitHub clone -> analyze -> patch -> test -> PR
```

The intended agent pipeline is:

| Phase | Status | Description |
|---|---|---|
| 1. Claim | Implemented in hub | Runner fetches the next qualified issue |
| 2. Analyze | Agent work in progress | LLM understands issue and likely files |
| 3. Context | Agent work in progress | Clone repo and extract relevant context |
| 4. Solve | Agent work in progress | Generate a targeted patch |
| 5. Verify | Agent work in progress | Run build/tests locally and retry on failure |
| 6. PR | Agent work in progress | Push branch and open a pull request |
| 7. Report | Implemented in hub | Runner reports success/failure to the hub |

---

## Repository Structure

```text
prompt-for-good/
├── pfg-hub/      # Hub API: NestJS, Fastify, Drizzle, PostgreSQL
├── pfg-agent/    # Agent runtime: Python 3.11, LangChain, Anthropic, GitPython
├── pfg-runner/   # Docker packaging for pfg-agent
├── docs/         # Architecture notes, ADRs, hub onboarding, contributing
└── docker-compose.yml
```

Useful docs:

- [Architecture overview](docs/ARCHITECTURE.md)
- [pfg-hub onboarding](docs/PFG_HUB_ONBOARDING.md)
- [Contributing guide](docs/CONTRIBUTING.md)
- [Tech stack ADR](docs/ADR-001-tech-stack.md)
- [Issue scoring ADR](docs/ADR-002-issue-scoring.md)

---

## Quick Start

### Docker development

Use this path if you do not want to install Node.js, Python, `uv`, or
PostgreSQL locally.

```bash
cp .env.example .env
docker compose build
docker compose up hub
```

The hub is available at:

```text
http://localhost:8080/actuator/health
http://localhost:8080/docs
http://localhost:8080/docs-json
```

Run checks in Docker:

```bash
# Hub tests, including DB-backed specs against postgres-test
docker compose run --rm hub-test

# Hub lint
docker compose run --rm hub-lint

# Agent tests and lint
docker compose run --rm agent-test
docker compose run --rm agent-lint
docker compose run --rm agent-format-check
```

Run the agent or runner against the local hub:

```bash
docker compose --profile agent up agent
docker compose --profile runner up runner
```

### Native hub development

Use this path if you want local IDE/tooling integration for the TypeScript hub.

```bash
cd pfg-hub
docker compose up -d postgres
npm install
npm run db:migrate
npm run dev
```

Run hub checks:

```bash
cd pfg-hub
npm test
npm run lint
npx tsc -p tsconfig.json --noEmit --incremental false
```

By default, `npm test` skips DB-backed integration/e2e specs. To run them,
provide a test PostgreSQL database and set `RUN_DB_TESTS=true`.

### Local HTTPS with mkcert

The hub can run locally over HTTPS on `hub.pfg.local`. Add the local hostname to
your hosts file:

```text
127.0.0.1 hub.pfg.local
```

Generate local certificates with `mkcert` and place them in the hub working
directory:

```bash
mkcert -install
cd pfg-hub
mkdir -p certs
cd certs
mkcert hub.pfg.local
```

This creates:

```text
certs/hub.pfg.local.pem
certs/hub.pfg.local-key.pem
```

Run the hub with HTTPS enabled:

```bash
cd pfg-hub
HTTPS_ENABLED=true \
HTTPS_CERT_PATH=./certs/hub.pfg.local.pem \
HTTPS_KEY_PATH=./certs/hub.pfg.local-key.pem \
npm run dev
```

Then open:

```text
https://hub.pfg.local:8080/docs
```

If HTTPS is disabled or either certificate file is missing, the hub starts in
HTTP mode as before.

### Hoppscotch local HTTPS

When testing the local HTTPS hub from Hoppscotch, keep certificate verification
enabled and trust the local mkcert CA instead.

First, ensure the hub is running at:

```text
https://hub.pfg.local:8080
```

Find the mkcert CA location:

```bash
mkcert -CAROOT
```

In Hoppscotch, import `rootCA.pem` from that directory:

```text
Settings -> Interceptor -> Native -> CA Certificates
```

Keep `Verify Host` and `Verify Peer` enabled.

Set a Hoppscotch environment variable:

```text
baseUrl = https://hub.pfg.local:8080
```

Then test:

```text
GET {{baseUrl}}/actuator/health
```

### Native agent development

```bash
cd pfg-agent
cp .env.example .env
uv sync --extra dev
uv run pytest -q
uv run ruff check .
uv run ruff format --check .
```

### Runner-only development

```bash
cd pfg-runner
cp .env.example .env
docker compose up
```

---

## Hub API

The hub is the main implemented service today. Runtime docs are generated by
Nest Swagger at `/docs`.

Current endpoints:

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/actuator/health` | none | Health check |
| `GET` | `/docs` | none | Swagger UI |
| `GET` | `/docs-json` | none | OpenAPI JSON |
| `GET` | `/stats` | none | Queue/contribution stats |
| `POST` | `/runners/register` | none | Register a runner and receive a token |
| `POST` | `/runners/:id/heartbeat` | `X-Runner-Token` | Update runner liveness/quota |
| `GET` | `/issues/next` | `X-Runner-Token` | Fetch the next pending issue |
| `POST` | `/issues/:id/claim` | `X-Runner-Token` | Claim an issue |
| `POST` | `/issues/:id/done` | `X-Runner-Token` | Report success or failure |
| `POST` | `/seed/default` | `X-Admin-Token` | Seed the default demo repository |
| `POST` | `/seed/repo` | `X-Admin-Token` | Seed one GitHub repository |
| `POST` | `/seed/discover` | `X-Admin-Token` | Discover repositories from GitHub issue search |
| `GET` | `/seed/ingestion-runs` | `X-Admin-Token` | List recent GitHub ingestion runs and diagnostics |

Example runner flow:

```bash
curl -s -X POST http://localhost:8080/runners/register \
  -H 'Content-Type: application/json' \
  -d '{"contributorName":"octocat"}'

curl -i http://localhost:8080/issues/next \
  -H 'X-Runner-Token: <runner-token>'
```

Example admin seed:

```bash
curl -X POST http://localhost:8080/seed/repo \
  -H 'Content-Type: application/json' \
  -H 'X-Admin-Token: dev-admin-key' \
  -d '{"owner":"nestjs","name":"nestjs"}'
```

Example ingestion audit:

```bash
curl -s http://localhost:8080/seed/ingestion-runs \
  -H 'X-Admin-Token: dev-admin-key'
```

Manual and scheduled GitHub discovery records an `ingestion_runs` row with
aggregate counters plus JSON details for searched labels, repository seed or
recrawl results, warnings and GitHub rate-limit snapshots. If some repositories
fail but the run can continue, the run is stored as `PARTIAL_SUCCESS`; hard
GitHub quota exhaustion is stored as `RATE_LIMITED`.

---

## Configuration

The root `.env` is used by the root `docker-compose.yml`. Native processes read
environment variables directly unless their component explicitly loads an env
file.

When using Docker Compose, recreate affected containers after any `.env` change;
running containers do not reload environment variables automatically:

```bash
docker compose up -d --force-recreate hub
```

Hub variables:

| Variable | Default | Purpose |
|---|---|---|
| `PFG_HUB_PORT` | `8080` | Host port used by root Docker Compose |
| `PFG_POSTGRES_PORT` | `5432` | Host port for the dev PostgreSQL container |
| `PORT` | `8080` | Hub HTTP port inside the Node process |
| `HTTPS_ENABLED` | `false` | Enable local HTTPS when certificates exist |
| `HTTPS_CERT_PATH` | `./certs/hub.pfg.local.pem` | Local mkcert certificate path |
| `HTTPS_KEY_PATH` | `./certs/hub.pfg.local-key.pem` | Local mkcert private key path |
| `DATABASE_URL` | local postgres URL | Hub PostgreSQL connection string |
| `ADMIN_KEY` | empty | Admin token required by `/seed/**` |
| `GITHUB_TOKEN` | `dummy` | GitHub token for real seeding/ingestion |
| `GITHUB_INGESTION_ENABLED` | `false` | Enable scheduled GitHub ingestion |
| `GITHUB_INGESTION_CRON` | `0 */6 * * *` | Ingestion cron expression |
| `GITHUB_RECRAWL_AFTER_MS` | `21600000` | Minimum age before recrawling a repo |
| `GITHUB_MAX_RETRIES` | `3` | GitHub retry count for retryable failures |
| `GITHUB_BACKOFF_BASE_MS` | `1000` | Base retry delay |
| `GITHUB_DISCOVERY_MAX_PAGES_PER_LABEL` | `2` | Search pages fetched per discovery label |
| `GITHUB_DISCOVERY_MAX_REPOSITORIES` | `50` | Max repositories discovered per run |
| `GITHUB_MIN_RATE_LIMIT_REMAINING` | `5` | Stop early when GitHub quota is low |
| `ISSUE_MAX_RETRIES` | `3` | Failed issue retry budget |
| `ISSUE_MIN_SCORE` | `60` | Minimum score for imported issues |

Agent/runner variables:

| Variable | Purpose |
|---|---|
| `PFG_HUB_URL` | Hub URL used by the agent/runner |
| `PFG_TOKEN` | Runner token returned by the hub |
| `RUNNER_ID` | Runner id returned by the hub |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `GITHUB_TOKEN` | GitHub token used by the agent |
| `CONTRIBUTOR_NAME` | Contributor display name |
| `MAX_TOKENS_PER_DAY` | Local daily token budget |

---

## Tech Stack

| Component | Stack |
|---|---|
| `pfg-hub` | TypeScript, NestJS 11, Fastify, Drizzle, PostgreSQL, Vitest |
| `pfg-agent` | Python 3.11, LangChain, Anthropic SDK, GitPython, PyGithub, httpx |
| `pfg-runner` | Docker image wrapping `pfg-agent` |
| Default LLM | Claude via Anthropic, with future provider expansion planned |

---

## Roadmap

- Expand GitHub repository eligibility beyond stars.
- Strengthen issue scoring and solvability checks.
- Finish the autonomous agent pipeline from patch generation to PR creation.
- Add runner preferences and preference-aware dispatch.
- Add production-grade auth, token rotation, observability, and deployment.
- Build a public dashboard for repositories, issues, runners, and contributions.

---

## License

MIT. See [LICENSE](LICENSE).

## Contributing

See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md).
