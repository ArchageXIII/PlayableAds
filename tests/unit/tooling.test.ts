import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile, writeFile, mkdir, unlink, symlink, rmdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { compileGame, buildGame, verifyGame } from '../../tooling/build';
import { ROOT, MAX_BYTES, releaseUrls, resolveGameAsset, validateStoreUrl, validId } from '../../tooling/config';
import { validateHtml, validateZip } from '../../tooling/validate';
import { auditSource } from '../../tooling/source-policy';
import { platformCheckEvidence } from '../../tooling/platform-check';
let unity: string;
let google: string;
before(async () => { unity = (await compileGame('tap-to-collect', { platform: 'unity', os: 'android', storeUrl: '' })).html; google = (await compileGame('tap-to-collect', { platform: 'google' })).html; });
test('both profiles contain valid classic ES5 and explicitly closed HTML', () => {
  assert.equal(validateHtml(strToU8(unity), 'unity').ok, true);
  assert.equal(validateHtml(strToU8(google), 'google').ok, true);
  assert.equal(validateZip(zipSync({ 'index.html': strToU8(google) })).ok, true);
});
test('deterministic exports reproduce bytes and current sources verify', async () => {
  assert.equal((await compileGame('tap-to-collect', { platform: 'unity', os: 'android', storeUrl: '' })).html, unity);
  await buildGame('tap-to-collect', 'preview', ['android', 'ios'], {});
  assert.equal((await verifyGame('tap-to-collect')).artifacts.length, 3);
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

const cli = (args: string[]) => promisify(execFile)(process.execPath, ['--import', 'tsx', path.join(ROOT, 'tooling/cli.ts'), ...args], { cwd: ROOT });
const game = 'tap-to-collect';
const urls = { android: 'https://play.google.com/store/apps/details?id=org.sample.game', ios: 'https://apps.apple.com/gb/app/game/id123456789' };

test('combined exports have one universal Google ZIP and distinct Unity destinations', async () => {
  const report = await buildGame(game, 'release', ['android', 'ios'], urls);
  assert.equal(report.schemaVersion, 2);
  assert.deepEqual(report.artifacts.map(item => item.path), [
    `dist/${game}/android/unity/index.html`, `dist/${game}/ios/unity/index.html`, `dist/${game}/google/playable.zip`
  ]);
  const googleArtifact = report.artifacts.find(item => item.platform === 'google')!;
  assert.ok(!('os' in googleArtifact));
  const html = strFromU8(unzipSync(await readFile(path.join(ROOT, googleArtifact.path)))['index.html']);
  assert.doesNotMatch(html, /targetOs|storeUrl|play\.google\.com|apps\.apple\.com/);
  for (const item of report.artifacts) if (item.platform === 'unity') {
    assert.ok((await readFile(path.join(ROOT, item.path), 'utf8')).includes(urls[item.os]));
  }
  const selected = await buildGame(game, 'release', ['ios'], { ios: 'https://apps.apple.com/app/other/id987654321' });
  assert.equal(selected.artifacts.find(item => item.platform === 'google')!.sha256, googleArtifact.sha256);
  const universal = await buildGame(game, 'preview', [], {}, 'google');
  assert.equal(universal.artifacts[0].sha256, googleArtifact.sha256);
  assert.deepEqual(universal.storeUrls, {});
  assert.equal((await verifyGame(game)).artifacts.length, 1);
});

test('CLI Google-only builds ignore Unity config, reject OS selection, and verify the latest report', async () => {
  await cli(['build', '--game', game, '--platform', 'google', '--mode', 'release', '--config', 'does-not-exist.json']);
  const report = await verifyGame(game);
  assert.equal(report.mode, 'release');
  assert.equal(report.artifacts.length, 1);
  assert.deepEqual(report.storeUrls, {});
  assert.equal(report.platformAcceptance, 'pending');
  assert.equal(report.releaseReady, false);
  await cli(['verify', '--game', game]);
  const reportPath = path.join(ROOT, 'dist', game, 'report.json');
  const before = await readFile(reportPath);
  for (const args of [
    ['build', '--game', game, '--platform', 'google', '--os', 'android'],
    ['build', '--game', game, '--platform', 'google', '--os', ''],
    ['build', '--game', game, '--platform', 'unity', '--config', 'does-not-exist.json'],
    ['build', '--game', game, '--platform', 'all', '--config', 'does-not-exist.json'],
    ['build', '--game', game, '--platform', 'other', '--mode', 'preview'],
    ['verify', '--game', game, '--platform', 'google'],
    ['verify', '--game', game, '--os', 'ios'],
    ['verify', '--game', game, '--mode', 'release'],
    ['verify', '--game', game, '--config', 'does-not-exist.json']
  ]) {
    await assert.rejects(cli(args));
    assert.deepEqual(await readFile(reportPath), before);
  }
  await assert.rejects(cli(['build', '--game', game, '--platform', 'google', '--os', 'android']), /Google exports are universal/);
});

test('Unity-only selection and invalid configuration leave unrelated deliverables intact', async () => {
  const googleFile = path.join(ROOT, 'dist', game, 'google/playable.zip');
  const previous = await readFile(googleFile);
  await cli(['build', '--game', game, '--platform', 'unity', '--os', 'ios', '--mode', 'preview']);
  const report = await verifyGame(game);
  assert.deepEqual(report.artifacts.map(item => [item.platform, item.os]), [['unity', 'ios']]);
  assert.deepEqual(await readFile(googleFile), previous);
  const reportPath = path.join(ROOT, 'dist', game, 'report.json');
  const before = await readFile(reportPath);
  await assert.rejects(buildGame(game, 'release', ['android', 'ios'], { android: urls.android }));
  await assert.rejects(buildGame(game, 'preview', ['ios', 'ios'], {}));
  assert.deepEqual(await readFile(reportPath), before);
});

test('schema migration, duplicate targets, OS-bearing Google records and stale sources fail verification', async () => {
  await buildGame(game, 'preview', ['android', 'ios'], {});
  const file = path.join(ROOT, 'dist', game, 'report.json');
  const original = await readFile(file, 'utf8');
  const mutations: [((report: any) => void), RegExp][] = [
    [report => { report.schemaVersion = 1; }, /Rebuild/],
    [report => { report.artifacts.push(report.artifacts[2]); }, /Duplicate/],
    [report => { report.artifacts[2].os = 'android'; }, /Invalid artifact target/],
    [report => { report.artifacts[2].path = `dist/${game}/android/google/playable.zip`; }, /Invalid artifact path/],
    [report => { report.sourceSha256 = 'stale'; }, /Invalid build report metadata/],
    [report => { report.artifacts[2].sha256 = 'changed'; }, /Invalid artifact metadata/],
    [report => { report.sourceSha256 = '0'.repeat(64); }, /Sources changed/],
    [report => { report.artifacts[2].sha256 = '0'.repeat(64); }, /changed after build/],
    [report => { report.platformAcceptance = 'passed'; }, /readiness/]
  ];
  try {
    for (const [mutate, expected] of mutations) {
      const report = JSON.parse(original); mutate(report);
      await writeFile(file, JSON.stringify(report));
      await assert.rejects(verifyGame(game), expected);
    }
  } finally { await writeFile(file, original); }
});

test('migration removes only the selected game legacy ZIPs and preserves Unity and unrelated files', async () => {
  const unityFile = path.join(ROOT, 'dist', game, 'android/unity/index.html');
  const unityBefore = await readFile(unityFile);
  const legacy: string[] = [];
  const notes: string[] = [];
  for (const os of ['android', 'ios']) {
    const directory = path.join(ROOT, 'dist', game, os, 'google');
    await mkdir(directory, { recursive: true });
    const file = path.join(directory, 'playable.zip');
    const note = path.join(directory, 'migration-test-note.txt');
    await writeFile(file, 'obsolete generated fixture'); await writeFile(note, 'preserve');
    legacy.push(file); notes.push(note);
  }
  try {
    await buildGame(game, 'preview', [], {}, 'google');
    for (const file of legacy) await assert.rejects(readFile(file), { code: 'ENOENT' });
    for (const file of notes) assert.equal(await readFile(file, 'utf8'), 'preserve');
    assert.deepEqual(await readFile(unityFile), unityBefore);
  } finally { for (const file of notes) await unlink(file); }
});

test('legacy cleanup refuses symlink or junction traversal', async () => {
  const id = 'cleanup-fixture-' + Date.now();
  const directory = path.join(ROOT, 'dist', id);
  const outside = path.join(ROOT, '.cache', id);
  const link = path.join(directory, 'android/google');
  await mkdir(path.dirname(link), { recursive: true }); await mkdir(outside, { recursive: true });
  await writeFile(path.join(outside, 'playable.zip'), 'untouched');
  try {
    await symlink(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(buildGame(id, 'preview', [], {}, 'google'), /Refusing symlink/);
    assert.equal(await readFile(path.join(outside, 'playable.zip'), 'utf8'), 'untouched');
  } finally {
    await unlink(link); await rmdir(path.dirname(link)); await rmdir(directory);
    await unlink(path.join(outside, 'playable.zip')); await rmdir(outside);
  }
});

test('Google manual checks share an artifact hash but preserve separate campaign OS context', async () => {
  const report = await buildGame(game, 'release', ['android'], urls);
  for (const os of ['android', 'ios'] as const) {
    const evidence = platformCheckEvidence(report, 'google', os, 'Fixture', 'fail', 'Automated record-shape test only');
    assert.equal(evidence.campaignOs, os);
    assert.ok(!('os' in evidence));
    assert.equal(evidence.sha256, report.artifacts.find(item => item.platform === 'google')!.sha256);
    assert.equal(evidence.path, `dist/${game}/google/playable.zip`);
  }
  const unityEvidence = platformCheckEvidence(report, 'unity', 'android', 'Fixture', 'fail', 'Automated record-shape test only');
  assert.equal(unityEvidence.os, 'android');
  assert.ok(!('campaignOs' in unityEvidence));
  assert.throws(() => platformCheckEvidence(report, 'unity', 'ios', 'Fixture', 'fail', 'Fixture'), /Build the selected/);
  assert.throws(() => platformCheckEvidence({ ...report, mode: 'preview' }, 'google', 'android', 'Fixture', 'fail', 'Fixture'), /release build/);
});
