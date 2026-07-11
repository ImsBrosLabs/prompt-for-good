# pfg-hub Onboarding

This guide is for contributors who already know NestJS and are used to TypeORM.
The hub uses the same NestJS module/controller/service shape, but it uses
Drizzle directly instead of entities and repositories.

## What pfg-hub does

`pfg-hub` is the central API for Prompt for Good. It coordinates the queue of
qualified GitHub issues and the runners that work on them.

At a high level, it:

- registers runners and gives them tokens;
- seeds GitHub repositories into the database;
- crawls and scores GitHub issues;
- exposes the next available issue to runners;
- records successful or failed contributions.

The main business flow is:

```text
POST /runners/register
  -> runner receives runnerId + token

GET /issues/next
  -> hub returns the highest-scored PENDING issue

POST /issues/:id/claim
  -> issue becomes CLAIMED by that runner

POST /issues/:id/done
  -> issue becomes DONE or FAILED, and a contribution is recorded
```

## NestJS map

The application starts in `pfg-hub/src/main.ts`. It creates a Fastify-backed
Nest application, registers the global exception filter, then listens on the
configured port.

The root module is `pfg-hub/src/app.module.ts`:

```text
AppModule
  DatabaseModule
  ScoringModule
  RunnersModule
  IssuesModule
  StatsModule
  GitHubModule
  SeedModule
```

The most important files are:

- `src/db/schema.ts`: database table definitions and inferred row types.
- `src/db/database.module.ts`: global Drizzle/PostgreSQL providers.
- `src/issues/issues.service.ts`: issue queue, claim, and completion logic.
- `src/runners/runners.service.ts`: runner registration and token validation.
- `src/github/github.service.ts`: GitHub API calls, repo seeding, and issue crawling.
- `src/scoring/scoring.service.ts`: repo and issue scoring rules.
- `src/seed/seed.controller.ts`: admin-only endpoints that seed repositories.
- `src/openapi/dtos.ts`: API DTO classes used by controllers and Swagger docs.
- `src/openapi/swagger.ts`: Nest Swagger/OpenAPI setup.

## Drizzle if you know TypeORM

With TypeORM, you might expect this shape:

```ts
@Entity()
export class Issue {}

@Injectable()
export class IssuesService {
  constructor(
    @InjectRepository(Issue)
    private readonly issuesRepository: Repository<Issue>,
  ) {}
}
```

In this project, the equivalent shape is:

```ts
export const issues = pgTable("issues", {
  id: varchar("id", { length: 36 }).primaryKey(),
  status: varchar("status", { length: 50 }).notNull().default("PENDING"),
});

@Injectable()
export class IssuesService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}
}
```

Then queries are written explicitly:

```ts
const [row] = await this.db
  .select({ issue: issues, repoUrl: repos.githubUrl })
  .from(issues)
  .innerJoin(repos, eq(issues.repoId, repos.id))
  .where(eq(issues.status, "PENDING"))
  .orderBy(desc(issues.score), asc(issues.createdAt))
  .limit(1);
```

The mental model is:

| TypeORM | pfg-hub / Drizzle |
|---|---|
| `@Entity()` classes | `pgTable(...)` declarations |
| `Repository<T>` | `this.db.select/insert/update/delete` |
| decorators for columns | typed column builders |
| relations on entities | explicit joins |
| entity instances | plain typed row objects |
| migrations via TypeORM | SQL migrations in `src/main/resources/db/migration` |

Drizzle keeps the database layer closer to SQL. There is less framework magic,
and service methods show exactly which query they run.

## Database model

The current hub schema has four core tables:

```text
repos
  GitHub repositories known by the hub.

issues
  Qualified GitHub issues that can be dispatched to runners.

runners
  Registered agents/contributors with an API token.

contributions
  Attempts made by runners, including PR URL, status, token usage, and errors.
```

Issue statuses are:

```text
PENDING -> CLAIMED -> DONE
                  -> FAILED
```

If a runner reports failure and retries are still available, the issue goes back
to `PENDING`:

```text
CLAIMED -> PENDING
```

The initial SQL schema lives in:

```text
pfg-hub/src/main/resources/db/migration/V1__Initial_Schema.sql
```

## Configuration

The hub config is centralized in `src/config.ts`.

The application reads from `process.env`:

```text
PORT
DATABASE_URL
GITHUB_TOKEN
ADMIN_KEY
ISSUE_MAX_RETRIES
ISSUE_MIN_SCORE
GITHUB_INGESTION_ENABLED
GITHUB_INGESTION_CRON
GITHUB_RECRAWL_AFTER_MS
GITHUB_MAX_RETRIES
GITHUB_BACKOFF_BASE_MS
GITHUB_DISCOVERY_MAX_PAGES_PER_LABEL
GITHUB_DISCOVERY_MAX_REPOSITORIES
GITHUB_MIN_RATE_LIMIT_REMAINING
```

When running with the root Docker Compose file, these values are injected by the
root `docker-compose.yml`, usually using values from the root `.env` file.

When running natively, the hub does not currently load `.env` by itself. Export
the variables in your shell, or run the PostgreSQL service through Docker and use
the defaults from `src/config.ts`.

## API contract and DTOs

The hub uses `@nestjs/swagger`. Public request/response shapes live in:

```text
pfg-hub/src/openapi/dtos.ts
```

Controllers reference those DTO classes in method signatures and Swagger
decorators. Runtime docs are generated at `/docs`, with raw specs at
`/docs-json` and `/docs-yaml`.

## Main flows in code

### Register a runner

Files:

```text
src/runners/runners.controller.ts
src/runners/runners.service.ts
```

Request:

```http
POST /runners/register
Content-Type: application/json

{
  "contributorName": "octocat"
}
```

The service inserts a new row in `runners` and returns a generated `runnerId`
and `token`. Future runner calls send that token in:

```http
X-Runner-Token: ...
```

### Get and claim an issue

Files:

```text
src/issues/issues.controller.ts
src/issues/issues.service.ts
```

`GET /issues/next` validates the runner token, loads pending issues with
repository context, filters out work that does not match the runner's
preferences, then selects the highest-affinity compatible issue:

```text
status = PENDING
rank by dispatch affinity desc, score desc, created_at asc
limit 1
```

`POST /issues/:id/claim` updates the issue only if it is still `PENDING`. That
conditional update is what prevents two runners from claiming the same issue.

### Report completion

File:

```text
src/issues/issues.service.ts
```

`POST /issues/:id/done` checks that the issue was claimed by the same runner,
then runs a transaction:

- update the issue status;
- insert a row in `contributions`.

Successful reports set the issue to `DONE`. Failed reports either retry by
returning the issue to `PENDING`, or mark it `FAILED` after
`ISSUE_MAX_RETRIES`.

### Seed repositories from GitHub

Files:

```text
src/seed/seed.controller.ts
src/auth/admin-token.guard.ts
src/github/github.service.ts
src/scoring/scoring.service.ts
```

Seed endpoints require:

```http
X-Admin-Token: ...
```

The flow is:

```text
POST /seed/repo?owner=nodejs&name=node
  -> fetch repo metadata from GitHub
  -> insert repo
  -> check repo eligibility
  -> crawl matching open issues
  -> score each issue
  -> insert qualifying issues as PENDING
```

`POST /seed/discover` starts background GitHub issue-label discovery and returns
an ingestion `runId`. The run searches GitHub issue labels, seeds discovered
repositories, recrawls stale known repositories and records an `ingestion_runs`
audit row. Poll `GET /seed/ingestion-runs/:runId` for aggregate counters plus
JSON diagnostics for labels, repository outcomes, warnings and rate-limit
snapshots.

`GET /seed/ingestion-runs` returns recent ingestion runs for admin diagnostics.
Runs with isolated repository failures are recorded as `PARTIAL_SUCCESS`; hard
GitHub quota exhaustion is recorded as `RATE_LIMITED`.

The scoring rules live in `ScoringService`. They are deterministic, auditable
and intentionally simple to change; ranking should not spend runner LLM quota.
Repository and issue score snapshots are persisted as JSON diagnostics, and
`/admin/scoring` exposes recent diagnostics plus queue size and matching
latency so maintainers can decide when in-memory dispatch needs database-side
ranking.

## Errors

The global exception filter is in:

```text
src/errors/global-exception.filter.ts
```

It normalizes errors into:

```json
{
  "error": "message"
}
```

Nest HTTP exceptions such as `UnauthorizedException`, `NotFoundException`, and
`ConflictException` are used directly in services.

## Running the hub

From the repository root, using Docker:

```bash
cp .env.example .env
docker compose up hub
```

The API is available at:

```text
http://localhost:8080
http://localhost:8080/docs
```

Run hub checks:

```bash
docker compose run --rm hub-test
docker compose run --rm hub-lint
```

Native setup:

```bash
cd pfg-hub
docker compose up -d postgres
npm install
npm run db:migrate
npm run dev
```

## Tests to read first

Start with the integration spec:

```text
pfg-hub/test/hub.integration.spec.ts
```

It walks through the full happy path:

```text
register runner
insert repo + issue fixture
GET /issues/next
POST /issues/:id/claim
POST /issues/:id/done
assert issue is DONE
```

That test is the fastest way to understand how controllers, services, Drizzle,
and the queue lifecycle fit together.

## Recommended reading order

1. `src/db/schema.ts`
2. `src/db/database.module.ts`
3. `src/issues/issues.service.ts`
4. `src/runners/runners.service.ts`
5. `src/github/github.service.ts`
6. `src/scoring/scoring.service.ts`
7. `test/hub.integration.spec.ts`

After that, the rest of the hub is mostly straightforward NestJS plumbing.
