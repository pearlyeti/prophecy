import { test, expect } from '@playwright/test';
import { completeSetup, concedeFromActivePage, startMatchmaking } from './helpers.js';

test('1v1 happy path — matchmaking → setup → concede', async ({ browser }) => {
  const ctxA = await browser.newContext({ storageState: 'e2e/state-a.json' });
  const ctxB = await browser.newContext({ storageState: 'e2e/state-b.json' });

  try {
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    await startMatchmaking(pageA, pageB);

    await Promise.all([completeSetup(pageA), completeSetup(pageB)]);

    await concedeFromActivePage([pageA, pageB]);

    await Promise.all([
      expect(pageA.getByText('wins.', { exact: false })).toBeVisible({ timeout: 15_000 }),
      expect(pageB.getByText('wins.', { exact: false })).toBeVisible({ timeout: 15_000 }),
    ]);

    const aWon = await pageA.locator('text=Victory').isVisible();
    const bWon = await pageB.locator('text=Victory').isVisible();
    expect(aWon || bWon).toBe(true);
    expect(aWon && bWon).toBe(false);
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
