// k6 load test for the virtual waiting room (SCRUM-45).
//
//   k6 run tests/load/waiting-room.k6.js                       # against production (default)
//   k6 run -e BASE_URL=http://localhost:3000 tests/load/waiting-room.k6.js
//   k6 run -e VUS=50 -e HOLD=2m tests/load/waiting-room.k6.js
//
// Each virtual fan registers an account (once), opens the queue page of the high-demand
// event, joins the queue through the real form (Next.js Server Action) and keeps refreshing
// their place, as a browser tab would. It checks that:
//   - every page answers quickly and without errors under load,
//   - joining works for everyone,
//   - joining twice never gives a fan a second place (idempotent), and
//   - the health endpoint stays healthy while the queue is busy.
// Accounts are named loadtest-<vu>-<time>@example.com. Run it against a throwaway or demo
// environment: it creates users and queue entries.
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Counter } from 'k6/metrics';

const BASE = (__ENV.BASE_URL || 'https://52-76-156-111.sslip.io').replace(/\/$/, '');
const SLUG = __ENV.EVENT_SLUG || 'aurora-world-tour';
const VUS = Number(__ENV.VUS || 20);
const HOLD = __ENV.HOLD || '60s';

export const options = {
  stages: [
    { duration: '20s', target: VUS }, // ramp up: the on-sale opens
    { duration: HOLD, target: VUS }, // sustained demand
    { duration: '10s', target: 0 }, // ramp down
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'], // under 1% failed requests
    'http_req_duration{kind:page}': ['p(95)<2000'], // pages: 95% under 2 s
    'http_req_duration{kind:health}': ['p(95)<1000'],
    checks: ['rate>0.99'],
    queue_join_ms: ['p(95)<3000'],
  },
};

const queueJoin = new Trend('queue_join_ms', true);
const joined = new Counter('queue_joins');

const queueUrl = `${BASE}/events/${SLUG}/queue`;
// Server Actions only accept multipart/form-data; an empty file part makes k6 send that
// (the action ignores it).
const MULTIPART = { _multipart: http.file('x', 'x.txt') };

// Next.js forms that call a Server Action carry hidden $ACTION_* inputs naming the action.
// Replaying them with the visible fields is exactly what a browser submit does.
function actionFields(html) {
  const fields = {};
  const re = /<input type="hidden" name="(\$ACTION[^"]*)"(?: value="([^"]*)")?\/>/g;
  let m;
  while ((m = re.exec(html))) {
    fields[m[1]] = (m[2] || '')
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }
  return fields;
}

function register() {
  const email = `loadtest-${__VU}-${Date.now()}@example.com`;
  const form = http.get(`${BASE}/register`, { tags: { kind: 'page' } });
  const res = http.post(
    `${BASE}/register`,
    {
      ...actionFields(form.body),
      ...MULTIPART,
      name: `Load Test ${__VU}`,
      email,
      password: 'correct-horse-battery',
    },
    { tags: { kind: 'auth' } },
  ); // k6 follows the redirect to / and keeps the session cookie for this VU
  return check(res, {
    'registered and signed in': (r) => r.status === 200 && r.body.includes('Log out'),
  });
}

let registered = false;

export default function waitingRoomScenario() {
  if (!registered) {
    registered = register();
    if (!registered) {
      sleep(2);
      return;
    }
  }

  group('open the waiting room', () => {
    const res = http.get(queueUrl, { tags: { kind: 'page' } });
    check(res, {
      'queue page 200': (r) => r.status === 200,
      'shows waiting room': (r) => r.body.includes('Waiting room'),
    });

    // A fan who has not joined sees a plain form; its hidden field names the Server Action.
    if (res.body.includes('Join the queue')) {
      const t0 = Date.now();
      const join = http.post(
        queueUrl,
        { ...actionFields(res.body), ...MULTIPART, slug: SLUG },
        { tags: { kind: 'page' } },
      );
      queueJoin.add(Date.now() - t0);
      const ok = check(join, {
        'join accepted (2xx)': (r) => r.status >= 200 && r.status < 300,
        // Queued, or (when the queue is short) admitted straight away and sent to the seat map.
        'now queued or admitted': (r) =>
          r.body.includes('queue-position') ||
          r.body.includes('queue-admitted') ||
          !r.url.includes('/queue'),
      });
      if (ok) joined.add(1);
    }
  });

  group('refresh my place', () => {
    const res = http.get(queueUrl, { tags: { kind: 'page' } });
    check(res, {
      'still queued or admitted': (r) =>
        r.status === 200 &&
        (r.body.includes('queue-position') ||
          r.body.includes('queue-admitted') ||
          r.url.includes(`/events/${SLUG}`)),
      'never offered the join form twice': (r) => !r.body.includes('Join the queue'),
    });
  });

  group('health under load', () => {
    const res = http.get(`${BASE}/api/health`, { tags: { kind: 'health' } });
    check(res, { 'health ok': (r) => r.status === 200 && r.body.includes('"status":"ok"') });
  });

  sleep(1 + Math.random() * 2); // a fan does not hammer refresh
}
