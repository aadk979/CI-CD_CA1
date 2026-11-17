# Test Plan — TixQueue

| Item      | Value                                                                                      |
| --------- | ------------------------------------------------------------------------------------------ |
| Product   | TixQueue event ticketing platform (this repository)                                        |
| Jira      | SCRUM-43 (test plan), SCRUM-44 (test case specification)                                   |
| Companion | [Test case specification](test-cases.md): every case, its technique and its automated test |
| Status    | Living document, updated with each feature PR                                              |

---

## 1. Purpose

This plan says what is tested, how, where, and when a change is good enough to merge or release.
It covers the user stories delivered so far and is kept next to the code, so a PR that changes
behaviour also changes the plan and the cases.

## 2. Scope

### 2.1 In scope

| Epic                   | Stories / tasks under test                                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| User Accounts & Access | SCRUM-22 register, SCRUM-23 log in / log out                                                                            |
| Event Catalogue        | SCRUM-25 browse upcoming events, SCRUM-26 event details                                                                 |
| Seat Selection & Holds | SCRUM-29 seat model, SCRUM-30 seat map, SCRUM-31 10-minute holds, SCRUM-32 no double booking, SCRUM-33 hold expiry jobs |
| Virtual Waiting Room   | SCRUM-34 join the queue, SCRUM-35 batch admission, SCRUM-36 live position                                               |
| Real-time Updates      | SCRUM-37 Socket.IO + Redis adapter, SCRUM-38 live seat availability                                                     |
| Checkout & Tickets     | SCRUM-39 checkout with simulated payment, SCRUM-40 My tickets                                                           |
| DevOps                 | Health endpoint, environment validation, Jira transition script, worker heartbeat                                       |

New stories (organiser pages, search, QR tickets, emails) join this table and the case
specification in the PR that delivers them.

### 2.2 Out of scope

| Not tested                                       | Why                                                                                           |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| A real payment provider                          | Payments are simulated by design (SCRUM-39). The simulator itself is tested.                  |
| Browsers other than Chromium, and mobile devices | Single-developer project. Chromium covers the rendering engine most fans use.                 |
| Load and soak testing                            | Planned separately as SCRUM-45 (k6 against the waiting room).                                 |
| AWS infrastructure itself (RDS, Lightsail)       | Managed services. The CD pipeline's post-deploy smoke test covers our use of them (SCRUM-18). |
| Formal accessibility audit                       | E2E tests do locate elements by role and label, so basic semantics are checked on the way.    |

## 3. Approach

### 3.1 Test levels

| Level       | Tool                 | What it proves                                                                                                                      | Dependencies                    |
| ----------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Unit        | Vitest               | Pure rules give the right answer for every input class: validation, pricing, Luhn, formatting, env parsing, job processors          | None. Collaborators are mocked. |
| Integration | Vitest               | The code works against **real** Postgres and Redis: transactions, row locks, constraints, Lua scripts, BullMQ jobs, Socket.IO rooms | Postgres 17 + Redis 7           |
| End-to-end  | Playwright, Chromium | A fan can complete each story in the production build, with the web server and the worker running                                   | Production build + worker       |

Most of the cases live at the unit and integration levels, which are fast and precise. E2E covers
each story's main path plus the failures that only show in a browser: redirects, live socket
updates and the countdown.

Integration tests deliberately don't mock the database or Redis. The highest-risk behaviour, such
as two fans clicking the same seat or a hold lapsing mid-payment, depends on real locking and real
atomic scripts, and a mock would pass where production fails.

### 3.2 Test design techniques

| Technique                     | Used for                                                                                                                                                                                                  |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Equivalence partitioning (EP) | Splitting inputs into valid and invalid classes, e.g. card numbers, emails, ids, event states                                                                                                             |
| Boundary value analysis (BVA) | Every numeric limit is tested at the limit and at one step either side: password 8–72, name 1–100, email ≤254, seats 1–6, card exactly 16 digits, batch size 1–10000, interval 500–600000 ms, countdown 0 |
| State transition              | Seat FREE → HELD → SOLD / released, queue not-queued → queued → admitted → lapsed                                                                                                                         |
| Concurrency / race testing    | Simultaneous holds on one seat, 50 simultaneous queue joins, two simultaneous checkouts                                                                                                                   |
| Error guessing                | Forged cookies, SQL-like and path-traversal ids, a `File` where a string is expected, a job running twice                                                                                                 |

Test names say which technique they apply (for example "boundary values"), and each case in the
[specification](test-cases.md) names its technique and the user story it traces to.

### 3.3 Test data

- Integration tests empty every table (`TRUNCATE … CASCADE`) and delete the Redis keys they use
  before each test, then create exactly the rows the test needs, so tests don't depend on each
  other.
- E2E runs `prisma migrate deploy` and the seed script once. Each test then registers its own
  fresh user (unique email per run), so runs and retries don't collide.
- Time-dependent logic (holds, passes, expiry) takes an injectable clock, so tests can expire a
  hold without waiting 10 minutes.
- No real personal data and no real card numbers are used. The test cards are Stripe's public
  test numbers.

### 3.4 Coverage

- Vitest runs unit and integration together, so coverage is merged across both.
- CI fails if statements, branches, functions or lines on server logic (`src/lib`, `src/server`)
  drop below **80%**. Current levels are around 98% statements and 94% branches.
- UI routes and components are left out of that figure on purpose: Playwright exercises them,
  and line coverage of JSX says little.

## 4. Test environments

| Environment | Where                           | Database / cache                                              | Notes                                                                                                                                           |
| ----------- | ------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Local       | Developer machine               | Docker Compose: `ticketing_test` on Postgres 17, Redis 7 db 1 | `npm run db:up`, then `npm test` / `npm run test:e2e`. Settings come from `.env.test`.                                                          |
| CI          | GitHub Actions, Ubuntu, Node 24 | Postgres 17 and Redis 7 service containers                    | Runs on every PR and push to `main`. E2E retries twice in CI and records a trace on retry.                                                      |
| E2E runtime | Local or CI                     | Same as above                                                 | `node dist/server.mjs` + `node dist/worker.mjs` (the production build). The waiting room admits 1 fan per second so queue tests finish quickly. |
| Production  | AWS Lightsail + RDS             | RDS Postgres, Redis container                                 | `cd.yml` runs a smoke test of `/api/health` after each deploy and rolls back if it fails. Active once AWS is provisioned (SCRUM-17/18).         |

Both test setups refuse to start unless `DATABASE_URL` points at a database whose name contains
`test`, so the suites can never truncate development or production data.

## 5. Entry and exit criteria

### 5.1 Entry: when testing of a change starts

- The work has a Jira issue with acceptance criteria, and a `feature/SCRUM-xx-…` branch.
- The branch builds, and lint, Prettier and TypeScript pass locally.
- Postgres and Redis are running (`npm run db:up`).

### 5.2 Exit: when a PR may merge

Enforced by branch protection on `main`, which requires all of these checks to pass:

1. **Lint, Format & Types** — ESLint, Prettier and `tsc` report no errors.
2. **Unit & Integration Tests** — all pass, and coverage is at least 80% on every metric.
3. **E2E Tests** — all Playwright tests pass against the production build.
4. **Dependency Audit** — no high or critical advisories in production dependencies.
5. **Docker Image** — the production image builds.

In addition, before asking for a merge:

- Every acceptance criterion of the issue is covered by at least one case in the
  [specification](test-cases.md), and that case is automated.
- The branch is up to date with `main` (branch protection requires it).

### 5.3 Exit: when a release is done

- CI on `main` is green, and the image tagged with the commit SHA is pushed to GHCR.
- The CD pipeline has applied migrations and the post-deploy smoke test passed. If the smoke
  test fails, the pipeline rolls back to the previous image.
- QA reports for that commit are published to GitHub Pages.

### 5.4 Suspension

Merging stops while `main` is red. The fix, or a revert, comes first. A flaky test counts as a
defect: it is fixed or quarantined with a Jira issue, never just retried until it passes.

## 6. Risks

| #   | Risk                                                                            | Likelihood | Impact | Mitigation in testing                                                                                                         |
| --- | ------------------------------------------------------------------------------- | ---------- | ------ | ----------------------------------------------------------------------------------------------------------------------------- |
| R1  | Two fans buy the same seat (double booking)                                     | Medium     | High   | A unique constraint per seat and event, transactional holds, and concurrent-request integration tests (TC-HOLD-03, TC-PAY-11) |
| R2  | A fan is charged but gets no tickets: the hold lapses during payment            | Medium     | High   | The conversion re-checks expiry inside the transaction, and refunds on failure (TC-PAY-09, TC-PAY-10)                         |
| R3  | An unfair queue: fans skip ahead, lose their place, or are admitted twice       | Medium     | High   | Atomic Lua scripts, plus FIFO, re-join and 50-way concurrency tests (TC-Q-01 to TC-Q-04)                                      |
| R4  | A fan bypasses the queue by opening the seat map or calling the action directly | Medium     | High   | Server-side access checks on both the page and the Server Action (TC-Q-08, TC-Q-12)                                           |
| R5  | A held seat is never released if the expiry job is lost                         | Low        | Medium | Lapsed holds count as free on read, and the job is idempotent (TC-HOLD-07, TC-HOLD-12)                                        |
| R6  | A stale seat map shows taken seats as free                                      | Medium     | Medium | Socket broadcast tests and a two-browser E2E (TC-HOLD-14)                                                                     |
| R7  | Session theft or forgery                                                        | Low        | High   | httpOnly, SameSite and Secure cookie tests, forged-cookie rejection, and server-side logout (TC-AUTH-14 to TC-AUTH-16)        |
| R8  | Tests pass locally but fail in CI (environment drift)                           | Medium     | Medium | Same Postgres and Redis versions in Compose and CI, and env validated at start-up by zod                                      |
| R9  | Flaky E2E tests caused by timing                                                | Medium     | Medium | Web-first assertions, a 1-second queue cadence in E2E, a single worker, and traces on retry                                   |
| R10 | Schedule: one developer with a fixed deadline (27 Nov 2026)                     | High       | Medium | Tests are written with each story, not at the end, and CI gates stop untested work merging                                    |

## 7. Defect management

- A failing check on a PR blocks the merge. The developer fixes it on the same branch.
- A defect found after merge is logged in Jira as a Bug, linked to the story it breaks, and gets
  a regression test that fails before the fix.
- Severity: **High** means money or seats are wrong, or a security issue. **Medium** means a
  story's main path is broken. **Low** is cosmetic.

## 8. Deliverables and reporting

| Output                            | Where                                                        |
| --------------------------------- | ------------------------------------------------------------ |
| Test results and coverage table   | The GitHub Actions job summary on every run                  |
| HTML coverage report              | CI artefact `coverage-report`, and GitHub Pages for `main`   |
| Playwright HTML report and traces | CI artefact `playwright-report`, and GitHub Pages for `main` |
| Test case specification           | [`qa/test-cases.md`](test-cases.md)                          |

## 9. Roles and schedule

This is an individual project: one person plans, writes and runs every test, with CI as the
independent gate. Testing runs alongside development in each sprint:

| Sprint               | Testing focus                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------ |
| Sprint 1 (12–18 Nov) | Pipeline and coverage gate, auth, catalogue, seat holds, real-time, waiting room, checkout |
| Sprint 2 (19–25 Nov) | Organiser pages, search, QR tickets, CD smoke test and rollback, k6 load test (SCRUM-45)   |
