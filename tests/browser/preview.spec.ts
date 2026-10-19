import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

test('playable lab switches games, controls hosts, intercepts exits and checks exports', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5173');
  await page.locator('#game').selectOption('tap-to-collect');
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#ad-root')).toHaveAttribute('data-state', 'running');
  await expect(page.locator('#state')).toHaveText('running');
  await expect(page.locator('.developer-tools')).not.toHaveAttribute('open', '');
  await page.getByText('Developer tools', { exact: true }).click();
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
  await page.getByRole('button', { name: 'Verify exports' }).click();
  await expect(page.locator('#report')).toContainText('Local checks passed');
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

test('file links download exact report bytes and verification runs only on demand', async ({ page, request }) => {
  let checks = 0;
  page.on('request', req => { if (new URL(req.url()).pathname === '/api/verify') checks++; });
  await page.goto('http://127.0.0.1:5173');
  await page.locator('#game').selectOption('tap-to-collect');
  await expect(page.getByRole('link', { name: 'Download Google ZIP' })).toBeVisible();
  await expect(page.locator('#report')).toHaveText('Current sources not checked.');
  expect(checks).toBe(0);
  const listing = await (await request.get('http://127.0.0.1:5173/api/files?game=tap-to-collect')).json();
  const google = listing.artifacts.find((item: { platform: string }) => item.platform === 'google');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download Google ZIP' }).click();
  const download = await downloadEvent;
  const bytes = await readFile((await download.path())!);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(google.sha256);
  expect(bytes.length).toBe(google.bytes);
  expect(bytes.equals(await readFile(path.resolve(google.absolutePath)))).toBeTruthy();
  const reportHref = await page.getByRole('link', { name: 'View verification report' }).getAttribute('href');
  const reportResponse = await request.get('http://127.0.0.1:5173' + reportHref);
  expect((await reportResponse.body()).equals(await readFile('dist/tap-to-collect/report.json'))).toBeTruthy();
  await page.locator('#verify').click();
  await expect(page.locator('#report')).toContainText('Local checks passed');
  await page.locator('#game').selectOption('drag-to-sort');
  await expect(page.getByRole('link', { name: 'Download Google ZIP' })).toHaveAttribute('href', /game=drag-to-sort/);
  await expect(page.locator('#report')).toHaveText('Current sources not checked.');
});

test('preview fits landscape and custom screens, preserves input and has keyboard controls', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173');
  await page.locator('#game').selectOption('tap-to-collect');
  for (const windowWidth of [1100, 800, 320]) {
    await page.setViewportSize({ width: windowWidth, height: 850 });
    await page.locator('#landscape').focus(); await page.keyboard.press('Enter');
    await expect(page.locator('#landscape')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.frameLocator('#playable').locator('#ad-root')).toHaveAttribute('data-orientation', 'landscape');
    expect(await page.frameLocator('#playable').locator('body').evaluate(() => window.innerWidth)).toBe(640);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    const box = (await page.locator('#device-wrap').boundingBox())!;
    const scale = Math.round(box.width / 640 * 100);
    await expect(page.locator('#dimensions')).toHaveText(`640 × 360 · ${scale}%`);
    expect(box.x + box.width).toBeLessThanOrEqual(windowWidth);
  }
  await page.locator('#width').fill('1280'); await page.locator('#height').fill('720');
  await page.setViewportSize({ width: 360, height: 850 });
  await expect(page.locator('#dimensions')).toContainText('640 × 360');
  await page.locator('#height').press('Enter');
  await expect(page.locator('#dimensions')).toContainText('1280 × 720');
  expect(await page.frameLocator('#playable').locator('body').evaluate(() => window.innerWidth)).toBe(1280);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.locator('#portrait').click();
  const canvas = page.frameLocator('#playable').locator('canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width * .28, box.y + box.height * .18);
  await expect(page.frameLocator('#playable').locator('.progress')).toHaveText('1 / 8');
});

test('copy paths supports the clipboard and a selectable fallback', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { document.documentElement.dataset.copied = text; } } });
  });
  await page.goto('http://127.0.0.1:5173');
  const copy = page.getByRole('button', { name: 'Copy file path for Google ZIP' });
  await copy.click();
  await expect(page.locator('#file-action-status')).toHaveText('File path copied.');
  expect(await page.locator('html').getAttribute('data-copied')).toMatch(/google[\\/]playable.zip$/);
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('Clipboard denied'); } } }));
  await copy.click();
  await expect(page.locator('#copy-path')).toBeFocused();
  expect(await page.locator('#copy-path').evaluate((input: HTMLInputElement) => input.selectionEnd! - input.selectionStart!)).toBeGreaterThan(0);
  await expect(page.locator('#file-action-status')).toContainText('Clipboard unavailable');
});

test('empty, damaged and outdated exports have actionable states without claiming approval', async ({ page }) => {
  let state = 'empty'; let check = 'outdated';
  const listing = { state: 'built', fingerprint: 'a'.repeat(64), mode: 'preview', createdAt: '2026-10-19T12:00:00Z', artifacts: [{ platform: 'google', available: true, bytes: 1234, absolutePath: 'D:/fixture/google/playable.zip', error: '' }] };
  await page.route('**/api/files?*', route => {
    if (state === 'error') return route.fulfill({ status: 400, body: 'Unsupported build report schema. Rebuild this game.' });
    return route.fulfill({ json: state === 'empty' ? { state: 'empty' } : { ...listing, artifacts: listing.artifacts.map(item => ({ ...item, available: state !== 'missing', error: state === 'missing' ? 'File missing. Rebuild exports.' : '' })) } });
  });
  await page.route('**/api/verify?*', route => route.fulfill({ json: { fingerprint: listing.fingerprint, status: check, checkedAt: listing.createdAt, message: check === 'outdated' ? 'Artifact does not match current sources.' : 'Invalid config field: title.' } }));
  await page.goto('http://127.0.0.1:5173');
  await expect(page.locator('#files')).toContainText('No export yet');
  await page.locator('#host').selectOption('google');
  await expect(page.locator('#build-command')).toContainText('--platform google --mode preview');
  await page.locator('#host').selectOption('browser');
  await expect(page.locator('#build-command')).toContainText('--platform all --mode preview');
  await expect(page.locator('#verify')).toBeDisabled();
  state = 'built'; await page.locator('#refresh-files').click();
  await page.locator('#verify').click();
  await expect(page.locator('#report')).toContainText('Exports outdated');
  await expect(page.getByRole('link', { name: 'Download Google ZIP' })).toBeVisible();
  check = 'failed'; await page.locator('#verify').click();
  await expect(page.locator('#report')).toContainText('Verification failed');
  await expect(page.locator('#report')).not.toContainText('Exports outdated');
  listing.fingerprint = 'b'.repeat(64);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('link', { name: 'Download Google ZIP' })).toHaveAttribute('href', /fingerprint=b{64}/);
  await expect(page.locator('#report')).toHaveText('Current sources not checked.');
  state = 'empty'; await page.locator('#refresh-files').click();
  await expect(page.locator('#files')).toContainText('No export yet');
  await expect(page.locator('#verify')).toBeDisabled();
  state = 'missing'; await page.locator('#refresh-files').click();
  await expect(page.locator('#files')).toContainText('File missing. Rebuild exports.');
  await expect(page.getByRole('link', { name: 'Download Google ZIP' })).toHaveCount(0);
  state = 'error'; await page.locator('#refresh-files').click();
  await expect(page.locator('#files')).toContainText('Unsupported build report schema');
  await expect(page.locator('#files')).not.toContainText('No export yet');
});

test('late file and verification responses cannot replace another game selection', async ({ page }) => {
  let releaseFiles!: () => void; let releaseVerify!: () => void;
  const filesGate = new Promise<void>(resolve => { releaseFiles = resolve; });
  const verifyGate = new Promise<void>(resolve => { releaseVerify = resolve; });
  let delayFiles = false;
  await page.route('**/api/files?*', async route => {
    const game = new URL(route.request().url()).searchParams.get('game');
    if (delayFiles && game === 'tap-to-collect') await filesGate;
    await route.fulfill({ json: { state: 'built', fingerprint: (game === 'tap-to-collect' ? 'a' : 'b').repeat(64), mode: 'preview', createdAt: '2026-10-19T12:00:00Z', artifacts: [{ platform: 'google', available: true, bytes: 1234, absolutePath: '/fixture/' + game, error: '' }] } });
  });
  await page.route('**/api/verify?*', async route => { await verifyGate; await route.fulfill({ json: { fingerprint: 'a'.repeat(64), status: 'failed', checkedAt: '2026-10-19T12:00:00Z', message: 'Old game result' } }); });
  await page.goto('http://127.0.0.1:5173');
  await page.locator('#game').selectOption('tap-to-collect');
  await expect(page.getByRole('link', { name: 'Download Google ZIP' })).toHaveAttribute('href', /game=tap-to-collect/);
  await page.locator('#verify').click();
  await expect(page.locator('#report')).toContainText('Checking exports');
  delayFiles = true; await page.locator('#refresh-files').click();
  await page.locator('#game').selectOption('drag-to-sort');
  await expect(page.getByRole('link', { name: 'Download Google ZIP' })).toHaveAttribute('href', /game=drag-to-sort/);
  const oldFiles = page.waitForResponse(response => response.url().includes('/api/files?game=tap-to-collect'));
  const oldVerify = page.waitForResponse(response => response.url().includes('/api/verify?game=tap-to-collect'));
  releaseFiles(); releaseVerify(); await Promise.all([oldFiles, oldVerify]);
  await expect(page.getByRole('link', { name: 'Download Google ZIP' })).toHaveAttribute('href', /game=drag-to-sort/);
  await expect(page.locator('#report')).toHaveText('Current sources not checked.');
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


test('universal previews omit OS and restore the previous Unity target', async ({ page, request }) => {
  await page.goto('http://127.0.0.1:5173');
  const frame = page.frameLocator('#playable');
  await expect(frame.locator('#ad-root')).toHaveAttribute('data-state', 'running');
  await page.locator('#os').selectOption('ios');
  await expect(page.locator('#os-field')).toBeVisible();
  for (const host of ['google', 'browser']) {
    const response = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === '/api/export' && url.searchParams.get('platform') === host;
    });
    await page.locator('#host').selectOption(host);
    const exported = await response;
    expect(exported.ok()).toBeTruthy();
    const url = new URL(exported.url());
    expect(url.searchParams.has('os')).toBeFalsy();
    expect(url.searchParams.has('storeUrl')).toBeFalsy();
    expect(await exported.text()).not.toMatch(/targetOs|storeUrl|play\.google\.com|apps\.apple\.com/);
    await expect(page.locator('#os-field')).toBeHidden();
    await expect(frame.locator('#ad-root')).toHaveAttribute('data-state', 'running');
    await page.locator('#landscape').click();
    await expect(frame.locator('#ad-root')).toHaveAttribute('data-orientation', 'landscape');
    await page.locator('#portrait').click();
    await expect(frame.locator('#ad-root')).toHaveAttribute('data-orientation', 'portrait');
    const invalid = await request.get(`http://127.0.0.1:5173/api/export?game=tap-to-collect&platform=${host}&os=ios`);
    expect(invalid.status()).toBe(400);
  }
  const response = page.waitForResponse(response => new URL(response.url()).searchParams.get('platform') === 'unity');
  await page.locator('#host').selectOption('unity');
  expect(new URL((await response).url()).searchParams.get('os')).toBe('ios');
  await expect(page.locator('#os-field')).toBeVisible();
  await expect(page.locator('#os')).toHaveValue('ios');
  await page.locator('#verify').click();
  await expect(page.locator('#report')).toContainText('Local checks passed');
  await expect(page.getByRole('link', { name: 'Download Google ZIP' })).toHaveCount(1);
  await expect(page.locator('#report')).not.toContainText('google /');
});
