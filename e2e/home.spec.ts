import { expect, test } from '@playwright/test';

test.describe('Home page', () => {
  test('lists upcoming events from the database', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Upcoming events' })).toBeVisible();

    const list = page.getByTestId('event-list');
    await expect(list).toContainText('Neon Skyline Tour');
    await expect(list).toContainText('Harbour Arena, Singapore');
  });

  test('searches events by title and shows a message when nothing matches', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('searchbox', { name: 'Search events or venues' }).fill('neon skyline');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page).toHaveURL(/query=neon\+skyline/);
    await expect(page.getByTestId('event-list')).toContainText('Neon Skyline Tour');

    await page.getByRole('searchbox', { name: 'Search events or venues' }).fill('zzzzzz');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.getByTestId('no-events')).toHaveText('No events match your search.');
  });

  test('opens a live WebSocket connection', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('connection-status')).toHaveText('Live');
  });

  test('receives worker heartbeats pushed over the socket', async ({ page }) => {
    await page.goto('/');
    // Heartbeat job runs every 10s via a BullMQ job scheduler in the worker process.
    await expect(page.getByTestId('worker-heartbeat')).toBeVisible({ timeout: 20_000 });
  });
});
