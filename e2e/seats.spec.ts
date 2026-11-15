import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';

const EVENT_PATH = '/events/neon-skyline-tour';
const uniqueEmail = () =>
  `seats-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

/** A fresh, signed-in fan in their own browser context (own cookies). */
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

const floor = (page: Page) => page.getByRole('region', { name: 'Floor' });
/** Exact match: "seat 1" must not also match "seat 10". */
const seat = (scope: Page | Locator, label: string) =>
  scope.getByRole('button', { name: label, exact: true });

test.describe('Event details and seat map (SCRUM-26, SCRUM-30)', () => {
  test('opens from the home page and shows details, prices and the seat map', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Neon Skyline Tour' }).click();

    await expect(page).toHaveURL(EVENT_PATH);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Neon Skyline Tour');
    await expect(page.getByTestId('event-when-where')).toContainText('Harbour Arena, Singapore');
    await expect(page.getByRole('list', { name: 'Ticket prices' })).toContainText(
      'Category 1 · $188.00',
    );
    // 1,400 seats across three sections, each labelled for screen readers.
    await expect(page.getByTestId('seat-map').getByRole('button')).toHaveCount(1400);
    await expect(seat(floor(page), 'Floor row A seat 1')).toBeVisible();
  });

  test('visitors can pick seats but must log in to hold them', async ({ page }) => {
    await page.goto(EVENT_PATH);
    await floor(page).locator('button[data-state="available"]').first().click();

    await expect(page.getByTestId('selection-summary')).toHaveText('1 selected · $188.00');
    await expect(page.getByRole('link', { name: 'Log in to hold seats' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hold seats' })).toHaveCount(0);
  });

  test('unknown events show a not-found page that search engines skip', async ({ page }) => {
    await page.goto('/events/no-such-event');

    await expect(page.getByRole('heading', { name: 'Event not found' })).toBeVisible();
    // The shell streams first, so the status stays 200; Next marks the page noindex instead.
    await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute('content', /noindex/);
  });
});

test.describe('Seat holds (SCRUM-31, SCRUM-32)', () => {
  test('a held seat is reserved for 10 minutes and locked for everyone else', async ({
    browser,
  }) => {
    const ada = await signedInFan(browser, 'Ada');
    await ada.goto(EVENT_PATH);

    const free = floor(ada).locator('button[data-state="available"]');
    const first = await free.nth(0).getAttribute('aria-label');
    const second = await free.nth(1).getAttribute('aria-label');
    await seat(ada, first!).click();
    await seat(ada, second!).click();
    await expect(ada.getByTestId('selection-summary')).toHaveText('2 selected · $376.00');

    await ada.getByRole('button', { name: 'Hold seats' }).click();

    await expect(ada.getByRole('status')).toHaveText('2 seats held for you.');
    await expect(ada.getByTestId('held-summary')).toContainText('Holding 2 seats ($376.00)');
    await expect(ada.getByTestId('hold-countdown')).toHaveText(/^(10:00|9:5\d)$/);
    await expect(seat(ada, first!)).toHaveAttribute('data-state', 'held');

    // Another fan sees those seats as taken and cannot select them.
    const bo = await signedInFan(browser, 'Bo');
    await bo.goto(EVENT_PATH);
    for (const label of [first!, second!]) {
      const taken = seat(bo, label);
      await expect(taken).toHaveAttribute('data-state', 'unavailable');
      await expect(taken).toBeDisabled();
    }

    // Releasing frees them again.
    await ada.getByRole('button', { name: 'Release seats' }).click();
    await expect(ada.getByRole('status')).toHaveText('Your seats have been released.');
    await expect(seat(ada, first!)).toHaveAttribute('data-state', 'available');

    await bo.reload();
    await expect(seat(bo, first!)).toBeEnabled();

    await Promise.all([ada.context().close(), bo.context().close()]);
  });

  test('a fan cannot select more than 6 seats', async ({ browser }) => {
    const fan = await signedInFan(browser, 'Cy');
    await fan.goto(EVENT_PATH);
    const free = floor(fan).locator('button[data-state="available"]');

    for (let i = 0; i < 6; i++) await free.nth(i).click();

    await expect(fan.getByTestId('selection-summary')).toHaveText('6 selected · $1,128.00');
    await expect(free.first()).toBeDisabled(); // the rest of the map is locked
    await fan.context().close();
  });
});
