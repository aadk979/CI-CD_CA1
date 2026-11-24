import { expect, test, type Browser, type Page } from '@playwright/test';
import pg from 'pg';

const uniqueEmail = () =>
  `organiser-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

async function signedInUser(browser: Browser, email = uniqueEmail()): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/register');
  await page.getByLabel('Name').fill('Olive Organiser');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL('/');
  return page;
}

/** What `npm run organiser:grant` does. Plain SQL: Playwright can't load the Prisma client. */
async function grantOrganiser(email: string) {
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  await db.query(`UPDATE "User" SET role = 'ORGANISER' WHERE email = $1`, [email]);
  await db.end();
}

/** A datetime-local value `days` from now, in Singapore time (UTC+8). */
const inDays = (days: number) =>
  new Date(Date.now() + days * 86_400_000 + 8 * 3_600_000).toISOString().slice(0, 16);

test.describe('Organiser sign-up', () => {
  test('choosing "organiser" at registration lands in the back office', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel('Name').fill('Olive Organiser');
    await page.getByLabel('Email').fill(uniqueEmail());
    await page.getByLabel('Password').fill('correct-horse-battery');
    await page.getByLabel(/Sell tickets as an organiser/).check();
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page).toHaveURL('/organiser');
    await expect(page.getByRole('link', { name: 'Organiser' }).first()).toBeVisible();
  });
});

test.describe('Organiser access (SCRUM-24)', () => {
  test('visitors are sent to log in', async ({ page }) => {
    await page.goto('/organiser');
    await expect(page).toHaveURL('/login');
    await page.goto('/organiser/events/new');
    await expect(page).toHaveURL('/login');
  });

  test('fans get a 403 on organiser pages and actions, and no organiser link', async ({
    browser,
  }) => {
    const fan = await signedInUser(browser);
    await expect(fan.getByRole('link', { name: 'Organiser' })).toHaveCount(0);

    for (const path of ['/organiser', '/organiser/events/new']) {
      const response = await fan.goto(path);
      expect(response?.status()).toBe(403);
      await expect(fan.getByTestId('forbidden')).toBeVisible();
    }

    // A Server Action is a POST to the page: the fan's session cookie is sent with it.
    const action = await fan.request.post('/organiser/events/new', {
      headers: { 'Next-Action': 'forged' },
      form: { title: 'Hijack' },
    });
    expect(action.status()).toBe(403);
  });

  test('signed-out Server Action posts get a 401, not a redirect', async ({ request }) => {
    const action = await request.post('/organiser', {
      headers: { 'Next-Action': 'forged' },
      maxRedirects: 0,
    });
    expect(action.status()).toBe(401);
  });
});

test.describe('Create and publish an event (SCRUM-28)', () => {
  test('an organiser creates a draft, previews it, then publishes it to the home page', async ({
    browser,
  }) => {
    const email = uniqueEmail();
    const organiser = await signedInUser(browser, email);
    await grantOrganiser(email);
    await organiser.reload(); // the role applies from the next request
    await organiser.getByRole('link', { name: 'Organiser' }).click();
    await expect(organiser).toHaveURL('/organiser');
    await organiser.getByRole('link', { name: 'New event' }).click();

    // Server-side validation: errors next to each field, and what was typed is kept.
    // Pick the seeded arena by name: other test suites may leave venues behind.
    await organiser.getByLabel('Venue').selectOption({ label: 'Harbour Arena, Singapore' });
    await organiser.getByLabel('Floor price').fill('120');
    await organiser.getByRole('button', { name: 'Save as draft' }).click();
    await expect(organiser.locator('#field-title-error')).toHaveText('Enter a title');
    await expect(organiser.locator('#field-startsAt-error')).toHaveText('Enter a date and time');
    await expect(organiser.getByLabel('Floor price')).toHaveValue('120');

    const title = `Harbour Lights ${Date.now()}`;
    await organiser.getByLabel('Title').fill(title);
    await organiser.getByLabel('Starts at (Singapore time)').fill(inDays(60));
    await organiser.getByLabel('Floor tier name').fill('Golden Circle');
    await organiser.getByRole('button', { name: 'Save as draft' }).click();

    await expect(organiser).toHaveURL(/\/organiser\?created=harbour-lights-/);
    await expect(organiser.getByRole('status')).toContainText(`“${title}” saved as a draft`);
    const row = organiser.getByTestId('organiser-event').filter({ hasText: title });
    await expect(row.getByTestId('event-status')).toHaveText('Draft');
    const eventPath = (await row.getByRole('link', { name: title }).getAttribute('href'))!;

    // Fans can't see a draft: not listed, and its page is "not found" (like an unknown
    // event, the streamed shell keeps status 200 and the page is marked noindex). Visiting
    // the home page now also fills its cache, which publishing must then expire.
    const visitor = await (await browser.newContext()).newPage();
    await visitor.goto('/');
    await expect(visitor.getByTestId('event-list')).not.toContainText(title);
    await visitor.goto(eventPath);
    await expect(visitor.getByRole('heading', { name: 'Event not found' })).toBeVisible();

    // The organiser can preview it.
    await organiser.goto(eventPath);
    await expect(organiser.getByTestId('draft-preview')).toBeVisible();
    await organiser.goBack();

    await row.getByRole('button', { name: `Publish ${title}` }).click();
    await expect(organiser).toHaveURL(/\/organiser\?published=harbour-lights-/);
    await expect(organiser.getByRole('status')).toContainText(`“${title}” is on sale`);
    await expect(row.getByTestId('event-status')).toHaveText('On sale');
    await expect(row.getByRole('button', { name: /Publish/ })).toHaveCount(0);

    // On the home page straight away (cache expired on publish), with its price.
    await visitor.goto('/');
    await visitor.getByRole('link', { name: title }).click();
    await expect(visitor).toHaveURL(eventPath);
    await expect(visitor.getByRole('list', { name: 'Ticket prices' })).toHaveText(
      'Golden Circle · $120.00',
    );
    await expect(visitor.getByTestId('draft-preview')).toHaveCount(0);
  });
});
