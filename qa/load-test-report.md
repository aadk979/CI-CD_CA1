# Load test report: virtual waiting room (SCRUM-45)

**Tool:** [k6](https://k6.io) v2.4.0 · **Script:** [`tests/load/waiting-room.k6.js`](../tests/load/waiting-room.k6.js)
**Target:** production (AWS Lightsail, 2 GB, one instance) · **Date:** 23 Nov 2026

## Scenario

Each virtual fan registers an account (through the real registration form), opens the queue page
of the high-demand event _Aurora World Tour_, joins the queue through the real form (a Next.js
Server Action), keeps refreshing their place like a browser tab, and the health endpoint is
polled throughout. Load profile: ramp to 20 concurrent fans in 20 s, hold 60 s, ramp down 10 s.

Run it: `npm run test:load` (needs k6 installed), or
`k6 run -e BASE_URL=http://localhost:3000 -e VUS=50 tests/load/waiting-room.k6.js`.
It creates `loadtest-*@example.com` users and queue entries, so use a demo or throwaway environment.

## Thresholds (pass/fail criteria) and results

| Metric                        | Threshold  | Result (20 fans, 90 s) |
| ----------------------------- | ---------- | ---------------------- |
| Failed HTTP requests          | < 1%       | **0.00%** (0 of 2,289) |
| Page response time, p95       | < 2,000 ms | **89 ms**              |
| Health endpoint response, p95 | < 1,000 ms | **33 ms**              |
| Time to join the queue, p95   | < 3,000 ms | **89 ms**              |
| Checks passed                 | > 99%      | **99.8%** (see below)  |

Throughput: about 25 requests/s and 734 iterations; the health endpoint reported `ok` (database,
Redis and worker) on every poll while the queue was busy.

## Findings

- The first run reported 7 of 20 joins as "failed". This was a test defect, not an application
  defect: fans who joined while the queue was short were admitted immediately and redirected to
  the seat map, which the check did not recognise. The check now accepts "queued or admitted".
  A re-run (10 fans, 20 s hold) passed 100% of checks.
- Joining is idempotent: refreshing or re-submitting never offered a fan the join form twice
  (a fan keeps exactly one place).
- No errors, timeouts or health degradation at 20 concurrent fans on a single 2 GB instance.

## Limits of this test

- 20 concurrent virtual users is a smoke-scale load, kept small because it runs against the live
  demo site from one machine; it shows the queue path is fast and correct, not the breaking point.
  To find the limit, run it with higher `VUS` against a staging copy.
- Live WebSocket updates (Socket.IO) are not part of this script; they are covered by the
  end-to-end tests.
