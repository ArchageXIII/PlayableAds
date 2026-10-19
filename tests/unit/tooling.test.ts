import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { compileGame, buildGame, verifyGame } from '../../tooling/build';
import { ROOT, MAX_BYTES, releaseUrls, resolveGameAsset, validateStoreUrl, validId } from '../../tooling/config';
import { validateHtml, validateZip } from '../../tooling/validate';
import { auditSource } from '../../tooling/source-policy';
let unity: string;
let google: string;
before(async () => { unity = (await compileGame('tap-to-collect', 'unity', 'android')).html; google = (await compileGame('tap-to-collect', 'google', 'android')).html; });
test('both profiles contain valid classic ES5 and explicitly closed HTML', () => {
  assert.equal(validateHtml(strToU8(unity), 'unity').ok, true);
  assert.equal(validateHtml(strToU8(google), 'google').ok, true);
  assert.equal(validateZip(zipSync({ 'index.html': strToU8(google) })).ok, true);
});
test('deterministic exports reproduce bytes and current sources verify', async () => {
  assert.equal((await compileGame('tap-to-collect', 'unity', 'android')).html, unity);
  await buildGame('tap-to-collect', 'preview', ['android', 'ios'], {});
  assert.equal((await verifyGame('tap-to-collect')).artifacts.length, 4);
});

test('standalone HTML and the shipped ZIP retain the complete MIT notice', async () => {
  const license = (await readFile(path.join(ROOT, 'LICENSE'), 'utf8')).replace(/\r\n?/g, '\n').trim();
  const report = await verifyGame('tap-to-collect');
  for (const artifact of report.artifacts) {
    const bytes = await readFile(path.join(ROOT, artifact.path));
    const html = artifact.platform === 'google' ? strFromU8(unzipSync(bytes)['index.html']) : bytes.toString('utf8');
    const notice = '<!--\n' + license + '\n-->';
    assert.match(html, /^<!doctype html><!--\nMIT License/i);
    assert.equal(html.split(notice).length - 1, 1);
    assert.ok(html.includes('Copyright (c) 2026 Magicave Holdings Limited'));
    assert.equal(validateHtml(strToU8(html), artifact.platform).ok, true);
  }
});
test('HTML rejects external references, optional closing tags, invalid orientation and development code', () => {
  for (const broken of [
    unity.replace('</body>', '<img src="https://example.com/x.png"></body>'),
    unity.replace('</html>', ''),
    unity.replace('</body>', '<svg><path /></svg></body>'),
    unity.replace('portrait,landscape', 'portrait'),
    unity.replace('<script>', '<script>var __ADGAMES_DEBUG__=true;'),
    unity.replace('<script>', '<script type="module">'),
    unity.replace('<script>', '<script>fetch("https://example.com");'),
    unity.replace('<script>', '<script>window.open("https://example.com");'),
    unity.replace('</body>', '<iframe></iframe></body>')
  ]) assert.equal(validateHtml(strToU8(broken), 'unity').ok, false);
});
test('HTML rejects oversized and invalid UTF-8 data', () => {
  const big = unity.replace('</body>', 'x'.repeat(MAX_BYTES) + '</body>');
  assert.equal(validateHtml(strToU8(big), 'unity').ok, false);
  assert.equal(validateHtml(Uint8Array.of(0xff, 0xfe), 'unity').ok, false);
});
test('Google SDK must be literal in the head and cannot appear in Unity', () => {
  assert.equal(validateHtml(strToU8(google.replace(/<script src="[^"]+"><\/script>/, '')), 'google').ok, false);
  assert.equal(validateHtml(strToU8(google), 'unity').ok, false);
});
test('ZIP rejects corruption, missing HTML, unexpected entries and excess files', () => {
  assert.equal(validateZip(strToU8('not a zip')).ok, false);
  assert.equal(validateZip(zipSync({ 'else.html': strToU8(google) })).ok, false);
  const files: Record<string, Uint8Array> = { 'index.html': strToU8(google) };
  for (let i = 0; i < 512; i++) files['file' + i + '.js'] = strToU8('');
  assert.equal(validateZip(zipSync(files)).ok, false);
  assert.equal(validateZip(new Uint8Array(MAX_BYTES + 1)).ok, false);
  const corrupted = Buffer.from(zipSync({ 'index.html': strToU8(google) }));
  const central = corrupted.readUInt32LE(corrupted.length - 6);
  corrupted[central + 16] ^= 255;
  assert.equal(validateZip(corrupted).ok, false);
});
test('artifact edits and stale reports are rejected', async () => {
  const report = await verifyGame('tap-to-collect');
  const file = path.join(ROOT, report.artifacts[0].path);
  const original = await readFile(file);
  try { await writeFile(file, Buffer.concat([original, Buffer.from(' ')])); await assert.rejects(verifyGame('tap-to-collect'), /changed after build/); }
  finally { await writeFile(file, original); }
});
test('games cannot bypass lifecycle services or import arbitrary dependencies', () => {
  const filename = path.join(ROOT, 'games', 'tap-to-collect', 'bad.ts');
  const gameRoot = path.dirname(filename);
  for (const code of ['window.location.href="x"', 'fetch("x")', 'localStorage.x=1', 'import x from "phaser"', 'import x from "../../src/runtime/hosts/unity"', 'import("./x")', 'require("x")', 'canvas.getContext("webgl")']) assert.throws(() => auditSource(code, filename, gameRoot));
  assert.doesNotThrow(() => auditSource('import { circleHit } from "../../src/runtime/math"; const score=1;', filename, gameRoot));
});
test('missing and escaping assets are rejected', async () => {
  await assert.rejects(resolveGameAsset('tap-to-collect', 'assets/missing.png'));
  await assert.rejects(resolveGameAsset('tap-to-collect', '../../package.json'));
  await assert.rejects(resolveGameAsset('tap-to-collect', 'https://example.com/x.png'));
  assert.throws(() => validId('../outside'));
});
test('release builds reject missing and placeholder destinations before writing output', async () => {
  await assert.rejects(releaseUrls('does-not-exist.json'));
  await assert.rejects(buildGame('tap-to-collect', 'release', ['android'], {}));
  for (const [os, value] of [['android', 'https://play.google.com/store/apps/details?id=com.example.adgames'], ['ios', 'https://apps.apple.com/app/test/id000000000'], ['android', 'https://example.com/app']] as const) assert.throws(() => validateStoreUrl(os, value));
  assert.doesNotThrow(() => validateStoreUrl('android', 'https://play.google.com/store/apps/details?id=org.sample.game'));
  assert.doesNotThrow(() => validateStoreUrl('ios', 'https://apps.apple.com/gb/app/game/id123456789'));
});
