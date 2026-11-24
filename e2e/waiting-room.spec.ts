import { randomUUID } from 'node:crypto';
import { expect, test, type Browser, type Page } from '@playwright/test';
import pg from 'pg';
import { createRedis } from '@/lib/redis';
import { joinQueue } from '@/lib/waiting-room';

// Seeded high-demand event. In E2E the worker admits 1 fan per second
// (WAITING_ROOM_BATCH_SIZE / WAITING_ROOM_INTERVAL_MS in playwright.config.ts).
const SLUG = 'aurora-world-tour';
const EVENT_PATH = `/events/${SLUG}`;
const QUEUE_PATH = `${EVENT_PATH}/queue`;

const uniqueEmail = () =>
  `queue-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

async function signedInFan(browser: Browser, name: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/register');
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Email').fill(uniqueEmail());
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL('/');
  return page;
}

/** Put placeholder fans at the front of the queue so the real fan has to wait a few seconds. */
async function crowdTheQueue(count: number) {
  // Plain SQL: Playwright's loader can't import the generated (ESM-only) Prisma client.
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const { rows } = await db.query<{ id: string }>('SELECT id FROM "Event" WHERE slug = $1', [SLUG]);
  await db.end();

  const redis = createRedis();
  for (let i = 0; i < count; i++) await joinQueue(redis, rows[0].id, `crowd-${randomUUID()}`);
  await redis.quit();
}

const position = async (page: Page) =>
  Number(await page.getByTestId('queue-position').textContent());

test.describe('Virtual waiting room (SCRUM-34, SCRUM-35, SCRUM-36)', () => {
  test('the event catalogue flags the high-demand event', async ({ page }) => {
    await page.goto('/events');
    const item = page.getByTestId('event-list').getByRole('listitem').filter({
      hasText: 'Aurora World Tour',
    });
    await expect(item).toContainText('Waiting room');
  });

  test('visitors are sent to the waiting room and asked to log in', async ({ page }) => {
    await page.goto(EVENT_PATH);

    await expect(page).toHaveURL(QUEUE_PATH);
    await expect(page.getByRole('link', { name: 'Log in to join the queue' })).toBeVisible();
    await expect(page.getByTestId('seat-map')).toHaveCount(0);
  });

  test('a signed-in fan cannot skip the queue by opening the seat map directly', async ({
    browser,
  }) => {
    const fan = await signedInFan(browser, 'Eve');

    await fan.goto(EVENT_PATH);

    await expect(fan).toHaveURL(QUEUE_PATH);
    await expect(fan.getByRole('button', { name: 'Join the queue' })).toBeVisible();
    await expect(fan.getByTestId('seat-map')).toHaveCount(0);
    await fan.context().close();
  });

  test('a queued fan keeps their place on refresh, watches it count down live, and is let in automatically', async ({
    browser,
  }) => {
    test.slow(); // waits in a real queue
    const fan = await signedInFan(browser, 'Ada');
    await fan.goto(QUEUE_PATH);

    await crowdTheQueue(6);
    await fan.getByRole('button', { name: 'Join the queue' }).click();

    // In line, with a live connection, a position and an estimated wait.
    await expect(fan.getByTestId('queue-status')).toHaveAttribute('data-live', 'true');
    const joinedAt = await position(fan);
    expect(joinedAt).toBeGreaterThan(0);
    await expect(fan.getByTestId('queue-wait')).not.toBeEmpty();

    // Refreshing keeps the place: never sent to the back of the line.
    await fan.reload();
    await expect(fan.getByTestId('queue-position')).toBeVisible();
    expect(await position(fan)).toBeLessThanOrEqual(joinedAt);

    // The position falls without reloading (SCRUM-36) …
    const beforeWaiting = await position(fan);
    if (beforeWaiting > 1) {
      await expect.poll(() => position(fan), { timeout: 10_000 }).toBeLessThan(beforeWaiting);
    }

    // … and once admitted the fan lands on the seat map with a time-limited pass (SCRUM-35).
    await expect(fan).toHaveURL(EVENT_PATH, { timeout: 20_000 });
    await expect(fan.getByTestId('access-pass')).toContainText("You're in!");
    await expect(fan.getByTestId('pass-countdown')).toHaveText(/^1[45]:\d\d$/);
    await expect(fan.getByTestId('seat-map')).toBeVisible();

    // Back on the queue page, an admitted fan is sent straight to the seats.
    await fan.goto(QUEUE_PATH);
    await expect(fan).toHaveURL(EVENT_PATH);
    await fan.context().close();
  });
});
