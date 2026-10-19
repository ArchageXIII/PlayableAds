import { test, expect, type Page, type Frame } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { ROOT } from '../../tooling/config';
import { EXIT_API, PREVIEW_STORE_URLS } from '../../tooling/constants';

type HostOptions = { ready?: boolean; visible?: boolean; missing?: boolean; late?: boolean; brokenAudio?: boolean; noPointer?: boolean; brokenArtwork?: boolean };
async function mount(page: Page, game: string, platform: 'unity' | 'google', width = 360, height = 640, options: HostOptions = {}, os = 'android'): Promise<Frame> {
  const artifact = platform === 'unity' ? path.join(ROOT, 'dist', game, os, 'unity/index.html') : path.join(ROOT, 'dist', game, 'google/playable.zip');
  const bytes = await readFile(artifact);
  let html = platform === 'unity' ? bytes.toString('utf8') : strFromU8(unzipSync(bytes)['index.html']);
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.clock.install();
  const requests: string[] = [];
  const errors: string[] = [];
  page.on('request', request => { if (!request.url().startsWith('data:')) requests.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    if (route.request().url() === EXIT_API) await route.fulfill({ contentType: 'application/javascript', body: options.missing ? '' : "window.ExitApi={exit:function(){if(arguments.length!==0)throw new Error('ExitApi expects no arguments');parent.postMessage({qa:'exit',value:'campaign'},'*')}};" });
    else await route.abort();
  });
  if (options.brokenArtwork) html = html.replace(/data:image\/png;base64,[A-Za-z0-9+/=]+/g, 'data:image/png;base64,AAAA');
  const setup = `<script>(function(){var ready=${options.ready !== false},visible=${options.visible !== false},events={},hidden=false;function emit(name,value){(events[name]||[]).slice().forEach(function(fn){fn(value)})}function sdk(){window.mraid={getState:function(){return ready?'default':'loading'},isViewable:function(){return visible},addEventListener:function(name,fn){(events[name]||(events[name]=[])).push(fn)},removeEventListener:function(name,fn){events[name]=(events[name]||[]).filter(function(item){return item!==fn})},open:function(url){parent.postMessage({qa:'exit',value:url},'*')}}}${!options.missing && !options.late ? 'sdk();' : ''}${options.noPointer ? 'window.PointerEvent=undefined;' : ''}${options.brokenAudio ? 'window.AudioContext=undefined;window.webkitAudioContext=undefined;window.Audio=undefined;' : ''}Object.defineProperty(document,'hidden',{configurable:true,get:function(){return hidden}});window.addEventListener('message',function(event){if(event.source!==parent||!event.data)return;var command=event.data.qa;if(command==='ready'){ready=true;emit('ready')}if(command==='visible'){visible=event.data.value;emit('viewableChange',visible)}if(command==='inject'){sdk()}if(command==='page-hidden'){hidden=event.data.value;document.dispatchEvent(new Event('visibilitychange'))}});try{window.localStorage;parent.postMessage({qa:'origin',value:'same-origin'},'*')}catch(error){parent.postMessage({qa:'origin',value:'opaque'},'*')}})();</script>`;
  // Only the test host is injected. The entire packaged game script remains unchanged.
  html = html.replace('<head>', '<head>' + setup);
  await page.setContent('<!DOCTYPE html><html><head></head><body style="margin:0"><iframe title="test playable" sandbox="allow-scripts" style="border:0"></iframe></body></html>');
  await page.evaluate(({ html, width, height }) => {
    const state = { exits: [] as string[], origin: '' };
    (window as any).qa = state;
    const iframe = document.querySelector('iframe')!;
    window.addEventListener('message', event => {
      if (event.source !== iframe.contentWindow) return;
      if (event.data.qa === 'exit') state.exits.push(event.data.value);
      if (event.data.qa === 'origin') state.origin = event.data.value;
    });
    iframe.style.width = width + 'px'; iframe.style.height = height + 'px'; iframe.srcdoc = html;
  }, { html, width, height });
  await expect(page.frameLocator('iframe').locator('#ad-root')).toBeAttached();
  const frame = page.frames().find(item => item !== page.mainFrame())!;
  await expect.poll(() => page.evaluate(() => (window as any).qa.origin)).toBe('opaque');
  if (options.missing && platform === 'unity' || options.late || options.ready === false || options.visible === false || options.brokenArtwork) {
    await expect(frame.locator('#ad-root')).not.toHaveAttribute('data-state', 'running');
  } else await expect(frame.locator('#ad-root')).toHaveAttribute('data-state', 'running');
  (page as any).network = requests; (page as any).errors = errors;
  return frame;
}
async function signal(page: Page, command: string, value?: boolean): Promise<void> {
  await page.evaluate(({ command, value }) => document.querySelector('iframe')!.contentWindow!.postMessage({ qa: command, value }, '*'), { command, value });
}
async function exits(page: Page): Promise<string[]> { return page.evaluate(() => (window as any).qa.exits); }
async function playTap(page: Page, frame: Frame, from = 0, to = 8): Promise<void> {
  for (let index = from; index < to; index++) {
    const box = (await frame.locator('canvas').boundingBox())!;
    await page.mouse.click(box.x + box.width * (index % 2 === 0 ? 0.28 : 0.72), box.y + box.height * (0.18 + Math.floor(index / 2) * 0.21));
  }
}
async function playDrag(page: Page, frame: Frame, index: number, wrong = false): Promise<void> {
  const box = (await frame.locator('canvas').boundingBox())!;
  const x = box.x + box.width * (0.18 + (index % 3) * 0.32);
  const y = box.y + box.height * (index < 3 ? 0.19 : 0.42);
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(box.x + box.width * (0.18 + ((index + (wrong ? 1 : 0)) % 3) * 0.32), box.y + box.height * 0.75, { steps: 8 });
  await page.mouse.up();
}
function assertClean(page: Page, platform: 'unity' | 'google'): void {
  expect((page as any).errors).toEqual([]);
  expect((page as any).network.filter((url: string) => url !== (platform === 'google' ? EXIT_API : ''))).toEqual([]);
}

for (const platform of ['unity', 'google'] as const) {
  for (const [width, height] of [[360, 640], [640, 360], [320, 480], [568, 320]] as const) {
    test(`${platform} tap gameplay ${width}×${height}`, async ({ page }) => {
      const frame = await mount(page, 'tap-to-collect', platform, width, height);
      await expect(frame.locator('#ad-root')).toHaveAttribute('data-audio', 'locked');
      await expect(frame.locator('.install')).toBeHidden();
      expect(await exits(page)).toEqual([]);
      await playTap(page, frame);
      await expect(frame.locator('#ad-root')).toHaveAttribute('data-outcome', 'success');
      await expect(frame.locator('.progress')).toHaveText('8 / 8');
      const header = (await frame.locator('.game-header').boundingBox())!;
      expect(header.y).toBeGreaterThanOrEqual(48);
      await frame.locator('.install').evaluate((button: HTMLButtonElement) => button.click());
      expect(await exits(page)).toEqual([]); // Untrusted programmatic clicks never navigate.
      await frame.getByRole('button', { name: 'Install & keep playing' }).click();
      await expect.poll(() => exits(page)).toEqual([platform === 'unity' ? PREVIEW_STORE_URLS.android : 'campaign']);
      await frame.getByRole('button', { name: 'Play again' }).click();
      await expect(frame.locator('.progress')).toHaveText('0 / 8');
      await expect(frame.locator('.install')).toBeHidden();
      assertClean(page, platform);
    });
  }
  test(`${platform} drag sorting rejects wrong bins and survives rotation`, async ({ page }) => {
    test.setTimeout(60_000); // WebKit's instrumented RAF clock is slower on Windows.
    const frame = await mount(page, 'drag-to-sort', platform);
    await playDrag(page, frame, 0, true);
    await expect(frame.locator('.progress')).toHaveText('0 / 6');
    await playDrag(page, frame, 0);
    await expect(frame.locator('.progress')).toHaveText('1 / 6');
    await page.locator('iframe').evaluate((iframe: HTMLIFrameElement) => { iframe.style.width = '640px'; iframe.style.height = '360px'; });
    await expect(frame.locator('#ad-root')).toHaveAttribute('data-orientation', 'landscape');
    for (let index = 1; index < 6; index++) await playDrag(page, frame, index);
    await expect(frame.locator('#ad-root')).toHaveAttribute('data-outcome', 'success');
    await frame.getByRole('button', { name: 'Play again' }).click();
    await expect(frame.locator('.progress')).toHaveText('0 / 6');
    await playDrag(page, frame, 0);
    await page.clock.runFor(31_000);
    await expect(frame.locator('#ad-root')).toHaveAttribute('data-outcome', 'failure');
    assertClean(page, platform);
  });
  test(`${platform} SDK readiness, visibility and page hiding freeze time`, async ({ page }) => {
    test.setTimeout(60_000);
    const frame = await mount(page, 'tap-to-collect', platform, 360, 640, { ready: false, visible: false });
    await signal(page, 'ready');
    await expect(frame.locator('#ad-root')).toHaveAttribute('data-state', 'paused');
    await signal(page, 'visible', true);
    await expect(frame.locator('#ad-root')).toHaveAttribute('data-state', 'running');
    await playTap(page, frame, 0, 1); await page.clock.runFor(2_000);
    const remaining = await frame.locator('.time').textContent();
    await signal(page, 'visible', false);
    await expect(frame.locator('#ad-root')).toHaveAttribute('data-audio', 'paused');
    await page.clock.runFor(25_000);
    await expect(frame.locator('.time')).toHaveText(remaining!);
    await expect(frame.locator('.progress')).toHaveText('1 / 8');
    await signal(page, 'visible', true); await signal(page, 'visible', true);
    await page.clock.runFor(1_000);
    await signal(page, 'page-hidden', true);
    await expect(frame.locator('#ad-root')).toHaveAttribute('data-state', 'paused');
    const afterResume = await frame.locator('.time').textContent();
    await page.clock.runFor(20_000);
    await expect(frame.locator('.time')).toHaveText(afterResume!);
    await signal(page, 'page-hidden', false);
    await expect(frame.locator('#ad-root')).toHaveAttribute('data-state', 'running');
    await page.clock.runFor(21_000);
    await expect(frame.locator('#ad-root')).toHaveAttribute('data-outcome', 'failure');
    expect(await exits(page)).toEqual([]);
    assertClean(page, platform);
  });
  test(`${platform} mute and unavailable audio do not interrupt gameplay`, async ({ page }) => {
    const frame = await mount(page, 'tap-to-collect', platform, 360, 640, { brokenAudio: true }, 'ios');
    await frame.getByRole('button', { name: 'Mute sound' }).click();
    await expect(frame.locator('#ad-root')).toHaveAttribute('data-audio', 'muted');
    await playTap(page, frame);
    await expect(frame.locator('#ad-root')).toHaveAttribute('data-outcome', 'success');
    await frame.getByRole('button', { name: 'Install & keep playing' }).click();
    await expect.poll(() => exits(page)).toEqual([platform === 'unity' ? PREVIEW_STORE_URLS.ios : 'campaign']);
    assertClean(page, platform);
  });
  test(`${platform} broken artwork prevents gameplay`, async ({ page }) => {
    const frame = await mount(page, 'tap-to-collect', platform, 360, 640, { brokenArtwork: true });
    await expect(frame.locator('.status')).toHaveText('Unable to load artwork');
    await playTap(page, frame, 0, 1);
    await expect(frame.locator('.install')).toBeHidden();
    expect(await exits(page)).toEqual([]);
    assertClean(page, platform);
  });
}
test('Unity waits for delayed SDK injection and never starts without it', async ({ page }) => {
  const frame = await mount(page, 'tap-to-collect', 'unity', 360, 640, { late: true });
  await signal(page, 'inject'); await page.clock.runFor(200);
  await expect(frame.locator('#ad-root')).toHaveAttribute('data-state', 'running');
  assertClean(page, 'unity');
});
test('Unity missing SDK remains safely inactive', async ({ page }) => {
  const frame = await mount(page, 'tap-to-collect', 'unity', 360, 640, { missing: true });
  await page.clock.runFor(10_100);
  await expect(frame.locator('.status')).toHaveText('Ad host unavailable');
  await expect(frame.locator('#ad-root')).toHaveAttribute('data-state', 'paused');
  await playTap(page, frame, 0, 1);
  await expect(frame.locator('.progress')).toHaveText('0 / 8');
  expect(await exits(page)).toEqual([]);
  assertClean(page, 'unity');
});
test('Google without MRAID uses page visibility; missing ExitApi never navigates', async ({ page }) => {
  const frame = await mount(page, 'tap-to-collect', 'google', 360, 640, { missing: true });
  await playTap(page, frame);
  await frame.getByRole('button', { name: 'Install & keep playing' }).click();
  await expect(frame.locator('.status')).toHaveText('Install is unavailable in this environment');
  expect(await exits(page)).toEqual([]);
  assertClean(page, 'google');
});
test('legacy mouse fallback works without PointerEvent', async ({ page }) => {
  const frame = await mount(page, 'tap-to-collect', 'unity', 360, 640, { noPointer: true });
  await playTap(page, frame);
  await expect(frame.locator('#ad-root')).toHaveAttribute('data-outcome', 'success');
  assertClean(page, 'unity');
});
test('touch input collects targets without synthetic mouse duplication', async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true });
  const page = await context.newPage();
  const frame = await mount(page, 'tap-to-collect', 'unity');
  const box = (await frame.locator('canvas').boundingBox())!;
  await page.touchscreen.tap(box.x + box.width * 0.28, box.y + box.height * 0.18);
  await expect(frame.locator('.progress')).toHaveText('1 / 8');
  assertClean(page, 'unity');
  await context.close();
});
