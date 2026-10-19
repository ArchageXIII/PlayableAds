import { test, expect } from '@playwright/test';

test('playable lab switches games, controls hosts, intercepts exits and checks exports', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5173');
  await page.locator('#game').selectOption('tap-to-collect');
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#ad-root')).toHaveAttribute('data-state', 'running');
  await expect(page.locator('#state')).toHaveText('running');
  await page.locator('#ready').uncheck();
  await expect(frame.locator('#ad-root')).toHaveAttribute('data-state', 'paused');
  await page.locator('#visible').uncheck();
  await page.locator('#ready').check();
  await expect(frame.locator('#ad-root')).toHaveAttribute('data-state', 'paused');
  await page.locator('#visible').check();
  await expect(frame.locator('#ad-root')).toHaveAttribute('data-state', 'running');
  await page.getByRole('button', { name: 'Landscape', exact: true }).click();
  await expect(frame.locator('#ad-root')).toHaveAttribute('data-orientation', 'landscape');
  for (let i = 0; i < 8; i++) {
    const box = (await frame.locator('canvas').boundingBox())!;
    await page.mouse.click(box.x + box.width * (i % 2 === 0 ? 0.28 : 0.72), box.y + box.height * (0.18 + Math.floor(i / 2) * 0.21));
  }
  await frame.getByRole('button', { name: 'Install & keep playing' }).click();
  await expect(page.locator('#exit-count')).toHaveText('1');
  await page.getByRole('button', { name: 'Check built artifacts' }).click();
  await expect(page.locator('#report')).toContainText('PREVIEW builds');
  await page.locator('#host').selectOption('google');
  await expect(frame.locator('#ad-root')).toHaveAttribute('data-state', 'running');
  await page.locator('#game').selectOption('drag-to-sort');
  await expect(frame.getByRole('heading', { name: 'Shape shuffle' })).toBeVisible();
  await page.locator('#host').selectOption('browser');
  await expect(page.locator('#ready')).toBeDisabled();
  await expect(frame.locator('#ad-root')).toHaveAttribute('data-state', 'running');
  await page.locator('#overlay').uncheck();
  await expect(page.locator('#container-close')).toBeHidden();
  expect(errors).toEqual([]);
});

test('mobile lab fits the preview without changing the emulated game viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:5173');
  await page.locator('#game').selectOption('tap-to-collect');
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#ad-root')).toHaveAttribute('data-state', 'running');
  await page.locator('#device-wrap').scrollIntoViewIfNeeded();
  const wrapper = (await page.locator('#device-wrap').boundingBox())!;
  expect(wrapper.x).toBeGreaterThanOrEqual(20);
  expect(wrapper.x + wrapper.width).toBeLessThanOrEqual(370);
  const innerWidth = await frame.locator('body').evaluate(() => window.innerWidth);
  expect(innerWidth).toBe(360);
  const box = (await frame.locator('canvas').boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.28, box.y + box.height * 0.18);
  await expect(frame.locator('.progress')).toHaveText('1 / 8');
});
