import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'correct-horse-battery';
const uniqueEmail = () => `fan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

async function register(page: Page, email: string, name = 'Ada Fan', password = PASSWORD) {
  await page.goto('/register');
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
}

async function logIn(page: Page, email: string, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
}

test.describe('Registration (SCRUM-22)', () => {
  test('creates an account and signs the user in', async ({ page, context }) => {
    await register(page, uniqueEmail());

    await expect(page).toHaveURL('/');
    await expect(page.getByTestId('signed-in-as')).toContainText('Ada Fan');

    const session = (await context.cookies()).find((c) => c.name.endsWith('session_token'));
    expect(session).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
  });

  test('shows validation errors next to each field', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel('Email').fill('not-an-email');
    await page.getByLabel('Password').fill('short');
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.locator('#field-name-error')).toHaveText('Enter your name');
    await expect(page.locator('#field-email-error')).toHaveText('Enter a valid email address');
    await expect(page.locator('#field-password-error')).toHaveText(
      'Password must be at least 8 characters',
    );
    await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');
    // What the user typed is kept, except the password.
    await expect(page.getByLabel('Email')).toHaveValue('not-an-email');
    await expect(page.getByLabel('Password')).toHaveValue('');
  });

  test('rejects an email that is already registered', async ({ page, browser }) => {
    const email = uniqueEmail();
    await register(page, email);
    await expect(page).toHaveURL('/');

    const other = await browser.newPage(); // fresh, signed-out session
    await register(other, email.toUpperCase());
    await expect(other.locator('#field-email-error')).toHaveText(
      'An account with this email already exists.',
    );
    await other.close();
  });
});

test.describe('Log in and log out (SCRUM-23)', () => {
  let email: string;

  test.beforeEach(async ({ browser }) => {
    email = uniqueEmail();
    const setup = await browser.newPage();
    await register(setup, email);
    await expect(setup).toHaveURL('/');
    await setup.close();
  });

  test('wrong credentials show one generic error', async ({ page }) => {
    for (const [user, password] of [
      [email, 'wrong-password'],
      ['nobody@example.com', PASSWORD],
    ]) {
      await logIn(page, user, password);
      // (Next adds its own hidden role=alert route announcer, so match the message text.)
      await expect(page.getByText('Incorrect email or password.')).toBeVisible();
      await expect(page).toHaveURL('/login');
    }
  });

  test('logging in, then out, invalidates the session cookie', async ({ page, context }) => {
    await logIn(page, email);
    await expect(page).toHaveURL('/');
    await expect(page.getByTestId('signed-in-as')).toBeVisible();
    const sessionCookie = (await context.cookies()).find((c) => c.name.endsWith('session_token'))!;

    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();

    // Replaying the old cookie must not restore the session: it was deleted server-side.
    await context.addCookies([sessionCookie]);
    await page.reload();
    await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();
    await expect(page.getByTestId('signed-in-as')).toHaveCount(0);
  });
});
