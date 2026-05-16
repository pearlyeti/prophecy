import { expect, type Page } from '@playwright/test';

/** Handle the setup phase (roll-off → choose-first-player → place-shields) for one page. */
export async function completeSetup(page: Page): Promise<void> {
  await expect(page.locator('text=Roll-off')).toBeVisible({ timeout: 20_000 });

  while (await page.locator('text=Roll-off').isVisible().catch(() => false)) {
    const goFirstBtn = page.getByRole('button', { name: /go first/i }).first();
    if (await goFirstBtn.isVisible().catch(() => false)) {
      await goFirstBtn.click();
      await page.waitForTimeout(400);
      continue;
    }

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

/** Click Concede + confirm from whichever page currently has the action button. */
export async function concedeFromActivePage(pages: [Page, Page]): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    for (const page of pages) {
      const actBtn = page.getByLabel('Open actions');
      if (await actBtn.isVisible().catch(() => false)) {
        await actBtn.click();
        await page.getByRole('button', { name: 'Concede' }).click();
        await expect(page.getByText('Concede the game?')).toBeVisible({ timeout: 5_000 });
        await page.getByRole('button', { name: 'Concede' }).last().click();
        return;
      }
    }
    await pages[0].waitForTimeout(300);
  }
  throw new Error('No active player found within 15 s');
}

/** Navigate both pages to the app, fill display names, and click Find Match. */
export async function startMatchmaking(
  pageA: Page,
  pageB: Page,
  nameA = 'PlayerA',
  nameB = 'PlayerB',
): Promise<void> {
  await Promise.all([pageA.goto('/'), pageB.goto('/')]);
  await pageA.getByPlaceholder('e.g. Sean').fill(nameA);
  await pageB.getByPlaceholder('e.g. Sean').fill(nameB);
  await Promise.all([
    pageA.getByRole('button', { name: 'Find Match' }).click(),
    pageB.getByRole('button', { name: 'Find Match' }).click(),
  ]);
}
