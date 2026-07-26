# Hosting pfg-hub

This document analyzes the available options for hosting pfg-hub, the central orchestration server of the Prompt for Good platform.

---

## Application Profile

Understanding what we're deploying is essential for evaluating each platform.

| Property | Value |
|---|---|
| Runtime | JVM 21, Spring Boot 4.0.3 |
| Build | `./gradlew build` → fat JAR |
| Port | `8080` (configurable via `PORT` env var) |
| Database | PostgreSQL 17 (required, persistent) |
| Scheduled job | GitHub crawl every 6 hours (`0 0 */6 * * *`) |
| Expected traffic | Low-to-moderate (OSS community tool) |
| Health endpoint | `GET /actuator/health` |
| API docs | `GET /swagger-ui.html` |

### Key constraint: always-on process

The 6-hour GitHub crawl cron job requires pfg-hub to run as a **persistent, long-lived process**. This rules out scale-to-zero serverless platforms (Google Cloud Run, Azure Container Apps) unless you pay for a minimum of 1 always-warm instance — which eliminates their cost advantage.

### Required environment variables

| Variable | Description |
|---|---|
| `SPRING_DATASOURCE_URL` | PostgreSQL JDBC URL (e.g. `jdbc:postgresql://host:5432/pfg`) |
| `SPRING_DATASOURCE_USERNAME` | Database username |
| `SPRING_DATASOURCE_PASSWORD` | Database password |
| `GITHUB_TOKEN` | GitHub personal access token for repository crawling |
| `PORT` | HTTP port (optional, defaults to `8080`) |

---

## Comparison Overview

| Platform | PG 17 | Always-on | Dockerfile needed | Est. cost/month | Complexity | Recommended |
|---|---|---|---|---|---|---|
| **Railway** | ✅ | ✅ | ❌ optional | ~$5–10 | Low | ⭐ Yes |
| **Fly.io** | ✅ | ✅ | ✅ required | ~$0–5 | Medium | ⭐ Yes |
| **Hetzner + Docker** | ✅ | ✅ | ✅ required | ~€4–8 | High | ⭐ Yes (self-host) |
| Render | ⚠️ PG 16 | ⚠️ paid only | ❌ optional | ~$14 | Low | No |
| Heroku | ✅ | ✅ | ❌ optional | ~$25–50 | Low | No |
| Google Cloud Run | ✅ via Cloud SQL | ⚠️ extra cost | ✅ required | ~$15–25 | Medium-High | No |
| AWS App Runner | ✅ via RDS | ✅ | ✅ required | ~$30–50 | High | No |
| Azure Container Apps | ✅ via Azure DB | ⚠️ extra cost | ✅ required | ~$15–25 | High | No |
| DigitalOcean App Platform | ✅ | ✅ | ❌ optional | ~$27 | Low-Medium | No |

---

## Recommended Options

### Option 1: Railway — Best for getting started quickly

[Railway](https://railway.app) is a modern PaaS with native GitHub integration. It detects Spring Boot/Gradle projects automatically via Nixpacks and can deploy without a Dockerfile.

**Highlights:**
- Zero-config deploy: connect GitHub repo, Railway builds with Nixpacks (Gradle detected automatically)
- One-click PostgreSQL plugin with connection string auto-injected as env vars
- Deploy on every push to `main`, preview environments for PRs
- Automatic HTTPS and custom domain support
- Environment variables managed via dashboard

**Limitations:**
- No permanent free tier — usage-based billing after the initial $5 credit
- Vendor lock-in to Railway's Nixpacks-based build system

**Required artifacts:** None to start. A `Dockerfile` can optionally be added later for more build control.

**Setup steps:**
1. Create a Railway project and connect the GitHub repository
2. Add a PostgreSQL plugin — Railway injects `DATABASE_URL`, `PGUSER`, `PGPASSWORD`, etc.
3. Set `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, `SPRING_DATASOURCE_PASSWORD`, and `GITHUB_TOKEN` in the Variables tab
4. Deploy

---

### Option 2: Fly.io — Best balance of cost and portability

[Fly.io](https://fly.io) is a container-based PaaS with a generous free tier well-suited for always-on OSS services. It requires a Dockerfile but the resulting image is fully portable.

**Highlights:**
- Free tier covers 3 shared-CPU VMs (sufficient for pfg-hub + Fly Postgres)
- Docker-based: no vendor lock-in, same image works on any platform
- `fly.toml` config is version-controlled alongside the code
- `fly secrets set` for secure env var management
- Global regions, automatic HTTPS

**Limitations:**
- Fly Postgres is self-managed: you are responsible for version upgrades and backups (though Fly provides tools)
- Requires writing a `Dockerfile` before first deploy
- CLI-heavy workflow compared to Railway

**Required artifacts to create:**

`pfg-hub/Dockerfile` (multi-stage):
```dockerfile
# Stage 1: build
FROM gradle:8-jdk21-alpine AS build
WORKDIR /app
COPY . .
RUN gradle build -x test --no-daemon

# Stage 2: runtime
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=build /app/build/libs/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
```

`pfg-hub/fly.toml`:
```toml
app = "pfg-hub"
primary_region = "cdg"  # Paris — change to your preferred region

[build]
  dockerfile = "Dockerfile"

[http_service]
  internal_port = 8080
  force_https = true

  [http_service.checks]
    [http_service.checks.health]
      grace_period = "30s"
      interval = "15s"
      method = "GET"
      path = "/actuator/health"
      timeout = "5s"
```

**Setup steps:**
1. Install `flyctl` and run `fly auth login`
2. `cd pfg-hub && fly launch` (uses the `fly.toml` above)
3. `fly postgres create` and `fly postgres attach`
4. `fly secrets set GITHUB_TOKEN=<token>`
5. `fly deploy`

---

### Option 3: Hetzner Cloud + Docker Compose — Cheapest long-term, ideal for self-hosters

[Hetzner Cloud](https://www.hetzner.com/cloud) offers the best price/performance ratio of any VPS provider. A CX22 instance (2 vCPU, 4 GB RAM, 40 GB NVMe) costs ~€3.79/month and comfortably runs both pfg-hub and PostgreSQL.

**Highlights:**
- Cheapest option by far for persistent workloads (~€4–8/month all-in)
- Full control — no vendor lock-in, no usage-based surprises
- Ideal for contributors who want to self-host their own hub instance
- Docker Compose makes local and server setups identical

**Limitations:**
- Manual setup required: provision server, install Docker, configure reverse proxy, set up SSL
- You are responsible for OS updates, security patches, and PostgreSQL backups
- No managed database — backups must be configured explicitly

**Required artifacts to create:**

`pfg-hub/Dockerfile` (same as Fly.io option above)

`pfg-hub/docker-compose.prod.yml`:
```yaml
services:
  app:
    build: .
    restart: always
    ports:
      - "8080:8080"
    environment:
      SPRING_DATASOURCE_URL: jdbc:postgresql://db:5432/pfg
      SPRING_DATASOURCE_USERNAME: ${DB_USER}
      SPRING_DATASOURCE_PASSWORD: ${DB_PASSWORD}
      GITHUB_TOKEN: ${GITHUB_TOKEN}
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:17-alpine
    restart: always
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: pfg
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER} -d pfg"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

**Setup steps:**
1. Provision a Hetzner CX22 instance (Ubuntu 24.04)
2. Install Docker: `curl -fsSL https://get.docker.com | sh`
3. Clone the repository: `git clone https://github.com/ImsBrosLabs/prompt-for-good.git`
4. Create `.env` with `DB_USER`, `DB_PASSWORD`, `GITHUB_TOKEN`
5. `cd pfg-hub && docker compose -f docker-compose.prod.yml up -d`
6. Set up Traefik or Nginx + Certbot for HTTPS on your domain

---

## Options Not Recommended

### Render
Render's free tier web services spin down after 15 minutes of inactivity, which kills the 6-hour cron job. The paid tier ($7/month) fixes this, but the managed PostgreSQL adds another $7/month, and Render's PostgreSQL support tops out at version 16 (not 17) as of early 2026.

### Heroku
Heroku removed its free tier in November 2022. The cheapest always-on option starts at ~$25/month for the app alone, making it significantly more expensive than the recommended options with no meaningful advantages for this use case.

### Google Cloud Run / Azure Container Apps
Both platforms scale to zero by default. Keeping a minimum of 1 instance warm (required for the cron job) eliminates their cost benefit and still requires Cloud SQL or Azure Database for PostgreSQL, which adds $7–15/month. Total cost ends up similar to Render but with significantly more setup complexity.

### AWS App Runner
Managed and auto-scaling, but requires AWS RDS for PostgreSQL ($15–30/month), plus App Runner costs, pushing the total to $30–50/month. The setup complexity is high relative to the alternatives.

### DigitalOcean App Platform
Works well technically — managed PostgreSQL 17 available, GitHub deploy integration — but pricing is steep: ~$12/month for the smallest app tier plus ~$15/month for managed PostgreSQL puts it at ~$27/month, which is not competitive with Railway or Fly.io.

---

## Decision Guide

| If you want... | Choose |
|---|---|
| Fastest time to production, minimal setup | **Railway** |
| Free/near-free hosting with good portability | **Fly.io** |
| Cheapest long-term cost or self-hosting | **Hetzner + Docker** |
