import { expect, test, type Browser, type Page } from '@playwright/test';

const EVENT_PATH = '/events/neon-skyline-tour';
const uniqueEmail = () =>
  `buyer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

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

/** Hold the first two free Upper Bowl seats ($68.00 each, Category 3); returns their labels. */
async function holdTwoSeats(page: Page): Promise<string[]> {
  await page.goto(EVENT_PATH);
  const free = page
    .getByRole('region', { name: 'Upper Bowl' })
    .locator('button[data-state="available"]');
  const labels = [
    (await free.nth(0).getAttribute('aria-label'))!,
    (await free.nth(1).getAttribute('aria-label'))!,
  ];
  for (const label of labels) await page.getByRole('button', { name: label, exact: true }).click();
  await page.getByRole('button', { name: 'Hold seats' }).click();
  await expect(page.getByTestId('held-summary')).toContainText('Holding 2 seats ($136.00)');
  return labels;
}

test.describe('Checkout (SCRUM-39) and My tickets (SCRUM-40)', () => {
  // The payment step talks to Stripe's test mode, so it needs test keys (see .env.example).
  test.skip(!process.env.STRIPE_SECRET_KEY, 'STRIPE_SECRET_KEY (test mode) is not set');

  test('a fan pays for held seats, sees them in My tickets, and nobody else can buy them', async ({
    browser,
  }) => {
    const ada = await signedInFan(browser, 'Ada');
    const labels = await holdTwoSeats(ada);

    await ada.getByRole('link', { name: 'Check out' }).click();
    await expect(ada).toHaveURL(`${EVENT_PATH}/checkout`);
    await expect(ada.getByTestId('cart').getByRole('listitem')).toHaveCount(3); // 2 seats + total
    await expect(ada.getByTestId('cart-total')).toHaveText(/Total\s*\$136\.00/);
    await expect(ada.getByTestId('checkout-countdown')).toHaveText(/^(10:00|9:\d\d)$/);

    // Stripe's Payment Element lives in an iframe. A declined card leaves the seats held.
    const card = ada.frameLocator('iframe[title*="Secure payment"]').first();
    const fillCard = async (number: string) => {
      await card.getByPlaceholder('1234 1234 1234 1234').fill(number);
      await card.getByPlaceholder('MM / YY').fill('12 / 34');
      await card.getByPlaceholder('CVC').fill('123');
      // Leaving the card field makes Stripe's form reflow; settle before aiming at Pay.
      await ada.getByRole('heading', { name: 'Payment' }).click();
      await ada.getByRole('button', { name: /^Pay/ }).scrollIntoViewIfNeeded();
      await ada.waitForTimeout(1000);
    };
    await fillCard('4000000000000002');
    await ada.getByRole('button', { name: 'Pay $136.00' }).click();
    await expect(ada.getByTestId('payment-error')).toContainText(/declined/i, { timeout: 20_000 });
    await expect(ada.getByTestId('cart-total')).toBeVisible();

    await fillCard('4242424242424242');
    await ada.getByRole('button', { name: 'Pay $136.00' }).click();

    await expect(ada).toHaveURL(/\/tickets\?order=/);
    await expect(ada.getByRole('status')).toHaveText(
      'Payment successful. Your 2 tickets for Neon Skyline Tour are below.',
    );
    const order = ada.getByTestId('order').first();
    await expect(order).toContainText('Neon Skyline Tour');
    await expect(order).toContainText('$136.00');
    await expect(order.getByRole('list', { name: 'Seats' }).getByRole('listitem')).toHaveCount(2);
    await expect(order.getByRole('img', { name: /^QR code for/ })).toHaveCount(2);

    // My tickets is one click away from any page.
    await ada.goto('/');
    await ada.getByRole('link', { name: 'My tickets' }).click();
    await expect(ada.getByTestId('order')).toHaveCount(1);

    // The seats are sold: another fan sees them taken, and has no tickets of their own.
    const bo = await signedInFan(browser, 'Bo');
    await bo.goto(EVENT_PATH);
    for (const label of labels) {
      await expect(bo.getByRole('button', { name: label, exact: true })).toHaveAttribute(
        'data-state',
        'unavailable',
      );
    }
    await bo.goto('/tickets');
    await expect(bo.getByTestId('no-tickets')).toBeVisible();

    await Promise.all([ada.context().close(), bo.context().close()]);
  });

  test('checkout with nothing on hold says so', async ({ browser }) => {
    const fan = await signedInFan(browser, 'Cy');
    await fan.goto(`${EVENT_PATH}/checkout`);
    await expect(fan.getByTestId('empty-cart')).toContainText('You have no seats on hold');
    await fan.context().close();
  });

  test('visitors must log in to see tickets or check out', async ({ page }) => {
    await page.goto('/tickets');
    await expect(page).toHaveURL('/login');
    await page.goto(`${EVENT_PATH}/checkout`);
    await expect(page).toHaveURL('/login');
  });
});
