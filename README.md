# TixQueue — Event Ticketing Platform

![CI Pipeline](../../actions/workflows/ci.yml/badge.svg)
![CD Pipeline](../../actions/workflows/cd.yml/badge.svg)

An event ticketing platform with a fair virtual waiting room, live seat availability and
reserved-seat holds — built with **Next.js 16**, **BullMQ**, **Socket.IO** and **PostgreSQL**, and
delivered through a fully automated CI/CD pipeline to **AWS Lightsail + RDS**.

> ST0529 Continuous Integration & Continuous Delivery — CA1

---

## Contents

- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Next.js patterns demonstrated](#nextjs-patterns-demonstrated)
- [Getting started](#getting-started)
- [Scripts](#scripts)
- [Testing strategy](#testing-strategy)
- [CI/CD pipeline](#cicd-pipeline)
- [AWS deployment setup](#aws-deployment-setup)
- [Workflow conventions (Jira + Git)](#workflow-conventions-jira--git)
- [Project structure](#project-structure)

---

## Architecture

```
            Browser ──HTTP──┐        ┌──WebSocket (Socket.IO)
                            ▼        ▼
   ┌────────── Lightsail instance (Docker Compose) ──────────┐
   │  Caddy (TLS, reverse proxy)                             │
   │     │                                                   │
   │     ▼                                                   │
   │  app: custom server = Next.js handler + Socket.IO ◄──┐  │
   │     │ enqueue jobs              Redis adapter pub/sub│  │
   │     ▼                                                │  │
   │  Redis ◄──────── worker: BullMQ consumers ───emit────┘  │
   └─────┼───────────────────┼───────────────────────────────┘
         │ Prisma (SSL)      │
         ▼                   ▼
            AWS RDS PostgreSQL (VPC peering, not public)
```

- **app** — a [custom Next.js server](server.ts) that serves the Next.js app and hosts Socket.IO on
  the same port (Next.js's built-in server can't hold WebSocket connections).
- **worker** — a separate process ([worker.ts](worker.ts)) consuming BullMQ queues: seat-hold
  expiry, waiting-room admission, heartbeats. It pushes real-time updates to browsers through the
  Socket.IO **Redis emitter**, so it never needs to talk to the web process directly.
- **Redis** — BullMQ job storage and Socket.IO pub/sub.
- **PostgreSQL** — system of record (Docker locally, RDS in production), accessed via Prisma 7.

One Docker image runs both roles; CI builds it once per commit and CD deploys that exact image.

## Tech stack

| Concern       | Choice                                                            |
| ------------- | ----------------------------------------------------------------- |
| Framework     | Next.js 16 (App Router, React 19, Cache Components), TypeScript   |
| Real-time     | Socket.IO 4 + `@socket.io/redis-adapter` / `redis-emitter`        |
| Queues        | BullMQ 6 on Redis 7                                               |
| Database      | PostgreSQL 17, Prisma ORM 7 (driver adapter `@prisma/adapter-pg`) |
| Auth          | Better Auth (email + password, database sessions, scrypt hashing) |
| Styling       | Tailwind CSS 4                                                    |
| Lint / format | ESLint 9 (`eslint-config-next`), Prettier 3                       |
| Tests         | Vitest 5 (unit + integration, merged coverage), Playwright (E2E)  |
| CI/CD         | GitHub Actions, GitHub Container Registry, GitHub Pages           |
| Hosting       | AWS Lightsail (Docker Compose + Caddy), AWS RDS PostgreSQL        |
| Project mgmt  | Jira (Scrum) + GitHub for Atlassian                               |

## Next.js patterns demonstrated

| Pattern                                    | Where                                                                      |
| ------------------------------------------ | -------------------------------------------------------------------------- |
| File-system routing & nested layouts       | `src/app/**` (`layout.tsx`, `page.tsx`, dynamic `[slug]`)                  |
| React Server Components + streaming        | `src/app/page.tsx` — DB query in a server component, `<Suspense>`          |
| Partial Prerendering (Cache Components)    | `next.config.ts` `cacheComponents` — static shell, dynamic holes           |
| Route Handlers                             | `src/app/api/health/route.ts`                                              |
| Server Actions + `useActionState`          | `src/app/actions/auth.ts` — register / log in / log out forms              |
| Streaming per-request data in `<Suspense>` | `src/app/layout.tsx` — the signed-in user menu streams into a static shell |
| Proxy (formerly Middleware)                | `src/proxy.ts` — optimistic route protection (Sprint 2)                    |
| Custom server                              | `server.ts` — Socket.IO alongside the Next.js handler                      |

## Getting started

**Prerequisites:** Node.js 24+, Docker Desktop.

```bash
npm install                    # also generates the Prisma client
cp .env.example .env.local     # local config (git-ignored)
npm run db:up                  # Postgres + Redis containers (creates a separate test DB too)
npm run db:deploy              # apply migrations
npm run db:seed                # demo venue (1,400-seat map) + priced events

npm run dev                    # http://localhost:3000  (Next.js + Socket.IO)
npm run dev:worker             # in a second terminal: BullMQ worker
```

The header shows **Live** once the WebSocket connects and _worker seen hh:mm:ss_ once heartbeats
arrive from the worker. `GET /api/health` reports database, Redis and worker status.

**Accounts:** `/register` and `/login`. Sessions are stored in Postgres, so logging out (or
deleting the `Session` row) invalidates the cookie immediately. The session cookie is `HttpOnly`
and `SameSite=Lax` everywhere, and `Secure` whenever `BETTER_AUTH_URL` is `https://` (production).

Run the full production stack in containers instead: `docker compose --profile app up --build`.

## Scripts

| Script                              | Purpose                                                                      |
| ----------------------------------- | ---------------------------------------------------------------------------- |
| `dev` / `dev:worker`                | Development server (custom server + Turbopack) / worker in watch mode        |
| `build`                             | Prisma generate → `next build` → bundle `server.ts` + `worker.ts` to `dist/` |
| `start` / `start:worker`            | Run the production build                                                     |
| `lint`, `format:check`, `typecheck` | Static quality gates (same as CI)                                            |
| `test:unit`, `test:integration`     | Vitest projects                                                              |
| `test:coverage`                     | Both projects with merged coverage + 80% threshold                           |
| `test:e2e`                          | Playwright against the production build (run `build` first)                  |
| `db:migrate`                        | Create + apply a migration (`-- --name x`), then regenerate the client       |
| `db:deploy` / `db:seed`             | Apply migrations / seed demo data                                            |
| `jira:seed`                         | Populate Jira with the backlog and sprints (see below)                       |

## Testing strategy

| Level       | Tool       | Scope                                                                                       | Infra                |
| ----------- | ---------- | ------------------------------------------------------------------------------------------- | -------------------- |
| Unit        | Vitest     | Pure logic: env + form validation, health aggregation, job processors, auth error mapping   | none (mocks)         |
| Integration | Vitest     | Real Postgres + Redis: queries, auth (hashing, cookies, logout), Socket.IO, BullMQ → socket | Docker / CI services |
| E2E         | Playwright | Production build in Chromium: register/login/logout, pages, live socket, worker heartbeat   | Docker / CI services |

- Unit and integration run as two Vitest **projects** in one process, so coverage is **merged**
  and the 80% threshold (statements, branches, functions, lines) applies to the combined result.
- Integration/E2E use a dedicated `ticketing_test` database and refuse to run against anything else.
- Test design techniques (equivalence partitioning, boundary values, error guessing) are labelled
  in the test names — see `tests/unit/realtime.test.ts` and `tests/integration/events.test.ts`.

## CI/CD pipeline

```
push / PR ─► CI Pipeline (.github/workflows/ci.yml)
             quality  ─┬─► test (unit+integration, coverage gate) ─┬─► image ──► GHCR :<sha>
             audit    ─┘   e2e  (Playwright, prod build)          ─┘   pages ──► QA reports
                                                                              │
main only ─► CD Pipeline (.github/workflows/cd.yml) ◄── workflow_run: CI succeeded
             ssh → Lightsail: pull :<sha> → prisma migrate deploy → restart
                  → smoke test /api/health version == <sha> → auto-rollback on failure
```

Principles applied:

- **Fail fast** — lint, format and types run first; tests only start when they pass.
- **Hermetic tests** — Postgres and Redis are CI service containers; no shared cloud DB is wiped.
- **Build once, deploy the same artifact** — the image tagged with the commit SHA is what ships.
- **Gated delivery** — CD runs only after the entire CI pipeline succeeds on `main`.
- **Verified deploys** — `/api/health` must report the new commit SHA, otherwise roll back.
- **Traceability** — the deploy job uses the `production` environment, so GitHub records a
  deployment that Jira links to the issues in the commits.
- **Least privilege** — workflow tokens default to `contents: read`; jobs request more only when needed.

### Repository configuration

| Type     | Name                    | Value                                                   |
| -------- | ----------------------- | ------------------------------------------------------- |
| Variable | `PAGES_ENABLED`         | `true` after Settings → Pages → Source = GitHub Actions |
| Variable | `DEPLOY_ENABLED`        | `true` once AWS is provisioned                          |
| Variable | `PRODUCTION_URL`        | `https://<static-ip-with-dashes>.sslip.io` or a domain  |
| Secret   | `LIGHTSAIL_HOST`        | Lightsail static IP                                     |
| Secret   | `LIGHTSAIL_USER`        | `ubuntu`                                                |
| Secret   | `LIGHTSAIL_SSH_KEY`     | Private key of the deploy key pair                      |
| Secret   | `LIGHTSAIL_KNOWN_HOSTS` | Output of `ssh-keyscan <static-ip>`                     |
| Variable | `JIRA_BASE_URL`         | `https://<site>.atlassian.net`                          |
| Variable | `JIRA_PROJECT_KEY`      | `SCRUM`                                                 |
| Secret   | `JIRA_EMAIL`            | Atlassian account email (for the Jira Sync workflow)    |
| Secret   | `JIRA_API_TOKEN`        | API token from id.atlassian.com → Security              |

**Branch protection** (Settings → Branches → `main`): require a pull request, require status checks
_Lint, Format & Types_, _Unit & Integration Tests_, _E2E Tests (Playwright)_, _Dependency Audit_
and _Docker Image_, and block force pushes.

## AWS deployment setup

All resources in **ap-southeast-1 (Singapore)**. Set an AWS Budgets alert (e.g. USD 10/month)
before creating anything.

1. **RDS PostgreSQL** (RDS → Create database → _Standard create_)
   - Engine PostgreSQL 17, template _Free tier_ (or _Sandbox_), single-AZ `db.t4g.micro`, 20 GB gp3.
   - Master username `postgres`, self-managed password (letters and digits only, so it can go
     in a URL unescaped).
   - Connectivity: _Don't connect to an EC2 compute resource_, **default VPC**,
     _Public access: No_, new security group `ticketing-rds`.
   - Additional configuration → _Initial database name_ `ticketing`.
   - Once it is _Available_, note the **endpoint**.
2. **Lightsail instance** — Linux/Unix → _OS only_ → Ubuntu 24.04 LTS, 2 GB plan, name
   `ticketing`. Then _Networking_: create and attach a **static IP**, and add a firewall rule
   for **HTTPS (443)** (22 and 80 are open by default).
3. **VPC peering** — Lightsail → Account → _Advanced_ → _Enable VPC peering_ for Singapore.
   This connects Lightsail to the default VPC, where RDS lives.
4. **RDS security group** — EC2 → Security Groups → `ticketing-rds` → inbound rules: replace the
   default rule with _PostgreSQL (5432)_ from `172.26.0.0/16` (the Lightsail CIDR) only.
5. **Prepare the instance** — Lightsail → instance → _Connect using SSH_ (browser terminal):
   ```bash
   curl -fsSL https://get.docker.com | sudo sh
   sudo usermod -aG docker ubuntu && newgrp docker
   sudo mkdir -p /opt/ticketing && sudo chown ubuntu:ubuntu /opt/ticketing
   ```
6. **Application database user** — the app connects as `ticketing_app`, not the master user.
   Still in the instance terminal (password: `openssl rand -hex 24`):
   ```bash
   docker run --rm -it postgres:17-alpine psql \
     "postgresql://postgres:<master-password>@<rds-endpoint>:5432/ticketing?sslmode=require"
   ```
   ```sql
   CREATE ROLE ticketing_app LOGIN PASSWORD '<app-password>';
   GRANT ticketing_app TO postgres;               -- RDS: lets the master hand over ownership
   ALTER DATABASE ticketing OWNER TO ticketing_app;
   \q
   ```
   A timeout here means step 3 or 4 is wrong.
7. **Production environment file** — `nano /opt/ticketing/.env`, filled in from
   [`deploy/.env.production.example`](deploy/.env.production.example), then
   `chmod 600 /opt/ticketing/.env`. Without a domain, use `<static-ip-with-dashes>.sslip.io` as
   the host (e.g. `13-250-1-2.sslip.io`) so Caddy can get a Let's Encrypt certificate.
   `deploy.sh` downloads the Amazon RDS CA bundle on first deploy so Node can verify the
   database certificate.
8. **Deploy key** — on your machine:
   ```bash
   ssh-keygen -t ed25519 -f lightsail_deploy -N "" -C "github-actions-deploy"
   ssh-keyscan <static-ip> > lightsail_known_hosts
   ```
   Append the contents of `lightsail_deploy.pub` to `~/.ssh/authorized_keys` on the instance
   (browser terminal), then check `ssh -i lightsail_deploy ubuntu@<static-ip>` works.
9. **Repository configuration** (see [above](#repository-configuration)), with the `gh` CLI:
   ```bash
   gh secret set LIGHTSAIL_HOST --body "<static-ip>"
   gh secret set LIGHTSAIL_USER --body "ubuntu"
   gh secret set LIGHTSAIL_SSH_KEY < lightsail_deploy
   gh secret set LIGHTSAIL_KNOWN_HOSTS < lightsail_known_hosts
   gh variable set PRODUCTION_URL --body "https://<static-ip-with-dashes>.sslip.io"
   gh variable set DEPLOY_ENABLED --body "true"
   ```
   Then delete the local key files. The next merge to `main` deploys automatically. To deploy
   the current `main` straight away: Actions → _CD Pipeline_ → _Run workflow_ → latest SHA.

**Rollback:** Actions → _CD Pipeline_ → _Run workflow_ → enter an earlier commit SHA.

## Workflow conventions (Jira + Git)

- Branches: `feature/SCRUM-12-seat-holds`, `bugfix/SCRUM-40-hold-expiry`, `hotfix/SCRUM-50-…`
- Commits: `SCRUM-12 Add seat hold expiry job` (Jira key first)
- PR titles: `SCRUM-12 Implement seat holds` — the template in `.github/` lists the checklist
- Jira sync ([`jira.yml`](.github/workflows/jira.yml)): _PR opened_ → In Review; _deployed to
  production_ → Done (or _PR merged_ → Done while `DEPLOY_ENABLED` is off). Keys are read from the
  PR title and branch; issues only ever move forward.
- **GitHub for Atlassian** shows each issue's branches, commits, PRs, builds and deployments in its
  _Development_ panel.

**Seeding Jira** (only for a fresh, empty project; it is not idempotent against issues created
another way): create `.env.jira` (git-ignored):

```bash
JIRA_BASE_URL=https://<site>.atlassian.net
JIRA_EMAIL=<atlassian account email>
JIRA_API_TOKEN=<token from id.atlassian.com/manage-profile/security/api-tokens>
JIRA_PROJECT_KEY=<project key>
```

then `npm run jira:seed -- --dry-run` to preview and `npm run jira:seed` to create the epics,
issues and two sprints defined in [`scripts/jira/backlog.json`](scripts/jira/backlog.json).

## Project structure

```
├── .github/workflows/   ci.yml, cd.yml, jira.yml
├── deploy/              Production compose, Caddyfile, deploy.sh (runs on Lightsail)
├── docker/              Local Postgres init (test database)
├── e2e/                 Playwright specs
├── prisma/              Schema, migrations, seed
├── scripts/             esbuild bundling, Jira seeding + issue transitions
├── src/
│   ├── app/             Next.js routes (pages, layouts, route handlers)
│   ├── components/      React components (client components marked 'use client')
│   ├── lib/             Shared logic: env, db, redis, realtime contract, health
│   └── server/          Server-only: Socket.IO, BullMQ queues, job processors
├── tests/               unit/ and integration/ (Vitest)
├── server.ts            Custom server: Next.js + Socket.IO
├── worker.ts            BullMQ worker process
└── Dockerfile           Multi-stage image (web + worker)
```
