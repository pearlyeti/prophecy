import { test, expect } from '@playwright/test';
import { completeSetup, concedeFromActivePage, startMatchmaking } from './helpers.js';

test('reconnect within 60 s window — game resumes', async ({ browser }) => {
  const ctxA = await browser.newContext({ storageState: 'e2e/state-a.json' });
  const ctxB = await browser.newContext({ storageState: 'e2e/state-b.json' });

  try {
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    // ── Get both clients into an active game ─────────────────────────────
    await startMatchmaking(pageA, pageB);
    await Promise.all([completeSetup(pageA), completeSetup(pageB)]);

    // Confirm both are in action phase before we disconnect.
    await Promise.all([
      expect(pageA.locator('[data-droptarget="play"]')).toBeVisible({ timeout: 10_000 }),
      expect(pageB.locator('[data-droptarget="play"]')).toBeVisible({ timeout: 10_000 }),
    ]);

    // ── Disconnect Player A ───────────────────────────────────────────────
    await ctxA.setOffline(true);

    // The ConnectionPill renders when status !== 'connected'.
    await expect(pageA.getByText(/disconnected|reconnecting/)).toBeVisible({ timeout: 15_000 });

    // ── Reconnect Player A ────────────────────────────────────────────────
    await ctxA.setOffline(false);

    // Pill disappears once status returns to 'connected' and lobby.rejoin succeeds.
    await expect(pageA.getByText(/disconnected|reconnecting/)).not.toBeVisible({ timeout: 20_000 });

    // ── Both clients should still be in the game ──────────────────────────
    await Promise.all([
      expect(pageA.locator('[data-droptarget="play"]')).toBeVisible({ timeout: 10_000 }),
      expect(pageB.locator('[data-droptarget="play"]')).toBeVisible({ timeout: 10_000 }),
    ]);

    // Neither client should have been bounced to the splash screen.
    await expect(pageA.getByRole('button', { name: 'Find Match' })).not.toBeVisible();
    await expect(pageB.getByRole('button', { name: 'Find Match' })).not.toBeVisible();

    // ── Clean up: end the game via concede ───────────────────────────────
    await concedeFromActivePage([pageA, pageB]);
    await Promise.all([
      expect(pageA.getByText('wins.', { exact: false })).toBeVisible({ timeout: 15_000 }),
      expect(pageB.getByText('wins.', { exact: false })).toBeVisible({ timeout: 15_000 }),
    ]);
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
