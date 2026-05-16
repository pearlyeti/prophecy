import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function completeSetup(page: Page): Promise<void> {
  // Wait for the setup modal (roll-off panel) to become visible.
  await expect(page.locator('text=Roll-off')).toBeVisible({ timeout: 20_000 });

  // Loop until the setup modal disappears (phase transitions to 'action').
  while (await page.locator('text=Roll-off').isVisible().catch(() => false)) {
    // choose-first-player step: the roll-off winner sees these buttons.
    const goFirstBtn = page.getByRole('button', { name: /go first/i }).first();
    if (await goFirstBtn.isVisible().catch(() => false)) {
      await goFirstBtn.click();
      await page.waitForTimeout(400);
      continue;
    }

    // place-shields step: the shield recipient sees character buttons.
    if (await page.locator('text=Place a shield').isVisible().catch(() => false)) {
      const charBtn = page
        .getByRole('button', { name: /Character/ })
        .and(page.locator('button:not([disabled])'))
        .first();
      if (await charBtn.isVisible().catch(() => false)) {
        await charBtn.click();
        await page.waitForTimeout(300);
      }
      continue;
    }

    await page.waitForTimeout(200);
  }
}

async function concedeFromActivePage(pages: [Page, Page]): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    for (const page of pages) {
      const actBtn = page.getByLabel('Open actions');
      if (await actBtn.isVisible().catch(() => false)) {
        await actBtn.click();
        await page.getByRole('button', { name: 'Concede' }).click();
        // Confirm dialog
        await expect(page.getByText('Concede the game?')).toBeVisible({ timeout: 5_000 });
        await page.getByRole('button', { name: 'Concede' }).last().click();
        return;
      }
    }
    await pages[0].waitForTimeout(300);
  }
  throw new Error('No active player found within 15 s — neither page showed the action button');
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

test('1v1 happy path — matchmaking → setup → concede', async ({ browser }) => {
  // Two authenticated browser contexts.
  const ctxA = await browser.newContext({ storageState: 'e2e/state-a.json' });
  const ctxB = await browser.newContext({ storageState: 'e2e/state-b.json' });

  try {
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    // ── Navigate ────────────────────────────────────────────────────────────
    await Promise.all([pageA.goto('/'), pageB.goto('/')]);

    // ── Enter display names and join the matchmaking queue ──────────────────
    await pageA.getByPlaceholder('e.g. Sean').fill('PlayerA');
    await pageB.getByPlaceholder('e.g. Sean').fill('PlayerB');

    await Promise.all([
      pageA.getByRole('button', { name: 'Find Match' }).click(),
      pageB.getByRole('button', { name: 'Find Match' }).click(),
    ]);

    // ── Wait for lobby.matchFound (both clients enter game / setup phase) ───
    await Promise.all([
      completeSetup(pageA),
      completeSetup(pageB),
    ]);

    // ── Action phase: one player concedes ───────────────────────────────────
    await concedeFromActivePage([pageA, pageB]);

    // ── Both clients see the game-ended banner ──────────────────────────────
    await Promise.all([
      expect(pageA.getByText('wins.', { exact: false })).toBeVisible({ timeout: 15_000 }),
      expect(pageB.getByText('wins.', { exact: false })).toBeVisible({ timeout: 15_000 }),
    ]);

    // Exactly one winner, one loser.
    const aWon = await pageA.locator('text=Victory').isVisible();
    const bWon = await pageB.locator('text=Victory').isVisible();
    expect(aWon || bWon).toBe(true);
    expect(aWon && bWon).toBe(false);
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
