import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, readFile, rename, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildGame, sha256 } from '../../tooling/build';
import { ROOT } from '../../tooling/config';
import { startPreview } from '../../tooling/preview-server';

test('preview file API serves only intact report-bound files and classifies verification', async t => {
  const id = 'preview-test-' + randomUUID();
  const gameDir = path.join(ROOT, 'games', id); const distDir = path.join(ROOT, 'dist', id);
  const server = await startPreview(0);
  const address = server.httpServer!.address();
  assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  const get = (route: string, extra: Record<string, string> = {}) => fetch(origin + '/api/' + route + '?' + new URLSearchParams({ game: id, ...extra }));
  try {
    await mkdir(gameDir);
    await cp(path.join(ROOT, 'games/tap-to-collect/assets'), path.join(gameDir, 'assets'), { recursive: true });
    await cp(path.join(ROOT, 'games/tap-to-collect/game.ts'), path.join(gameDir, 'game.ts'));
    const config = JSON.parse(await readFile(path.join(ROOT, 'games/tap-to-collect/game.config.json'), 'utf8'));
    config.id = id;
    const configText = JSON.stringify(config);
    await writeFile(path.join(gameDir, 'game.config.json'), configText);
    assert.deepEqual(await (await get('files')).json(), { state: 'empty' });
    const report = await buildGame(id, 'preview', ['android', 'ios'], {});
    const reportPath = path.join(distDir, 'report.json'); const reportBytes = await readFile(reportPath); const fingerprint = sha256(reportBytes);
    const google = report.artifacts.find(a => a.platform === 'google')!;
    const googlePath = path.join(ROOT, google.path); const googleBytes = await readFile(googlePath);
    const download = (extra: Record<string, string> = {}) => get('download', { fingerprint, platform: 'google', ...extra });
    await t.test('list, attachments and JSON reproduce the recorded bytes', async () => {
      await writeFile(path.join(distDir, 'unlisted.txt'), 'not an export');
      const listing = await (await get('files')).json();
      assert.equal(listing.artifacts.length, 3); assert.equal(listing.fingerprint, fingerprint);
      for (const artifact of report.artifacts) {
        const response = await get('download', { fingerprint, platform: artifact.platform, ...(artifact.os ? { os: artifact.os } : {}) });
        assert.equal(response.status, 200);
        assert.match(response.headers.get('content-disposition')!, /^attachment;/);
        assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
        assert.equal(response.headers.get('content-length'), String(artifact.bytes));
        const expected = await readFile(path.join(ROOT, artifact.path));
        assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected);
      }
      const response = await get('download', { fingerprint, report: '1' });
      assert.match(response.headers.get('content-type')!, /application\/json/);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), reportBytes);
    });
    await t.test('changed reports invalidate download and verification links', async () => {
      try {
        await writeFile(reportPath, reportBytes.toString() + '\n');
        assert.equal((await download()).status, 409);
        assert.equal((await get('verify', { fingerprint })).status, 409);
      } finally { await writeFile(reportPath, reportBytes); }
    });
    await t.test('missing or changed artifacts remain listed without download access', async () => {
      try {
        await unlink(googlePath);
        let listing = await (await get('files')).json();
        assert.match(listing.artifacts.find((a: { platform: string }) => a.platform === 'google').error, /missing/i);
        assert.notEqual((await download()).status, 200);
        await writeFile(googlePath, 'changed');
        listing = await (await get('files')).json();
        assert.equal(listing.artifacts.find((a: { platform: string }) => a.platform === 'google').available, false);
        assert.match(await (await download()).text(), /changed after build/);
      } finally { await writeFile(googlePath, googleBytes); }
    });
    await t.test('malformed, old and unsafe reports are rejected', async () => {
      try {
        for (const value of ['{', JSON.stringify({ ...report, schemaVersion: 1 }), JSON.stringify({ ...report, artifacts: [{ ...google, path: '../package.json' }] })]) {
          await writeFile(reportPath, value);
          const response = await get('files'); assert.equal(response.status, 400);
          assert.notEqual((await download()).status, 200);
        }
      } finally { await writeFile(reportPath, reportBytes); }
      for (const extra of ([{ os: 'android' }, { path: '../LICENSE' }, { game: '../tap-to-collect' }] as Record<string, string>[])) assert.equal((await download(extra)).status, 400);
      assert.equal((await get('download', { fingerprint, platform: 'google', os: '' })).status, 400);
    });
    await t.test('junction traversal cannot serve artifacts or reports', async () => {
      const directory = path.dirname(googlePath); const backup = path.join(distDir, 'google-backup');
      await rename(directory, backup);
      try {
        await symlink(backup, directory, process.platform === 'win32' ? 'junction' : 'dir');
        assert.match(await (await download()).text(), /symlink traversal/);
        const listing = await (await get('files')).json();
        assert.equal(listing.artifacts.find((a: { platform: string }) => a.platform === 'google').available, false);
      } finally { await unlink(directory); await rename(backup, directory); }
      const saved = distDir + '-saved'; await rename(distDir, saved);
      try {
        await symlink(saved, distDir, process.platform === 'win32' ? 'junction' : 'dir');
        assert.match(await (await get('files')).text(), /symlink traversal/);
      } finally { await unlink(distDir); await rename(saved, distDir); }
    });
    await t.test('source mismatch is outdated, compilation failure is failed, intact downloads stay available', async () => {
      assert.equal((await (await get('verify', { fingerprint })).json()).status, 'passed');
      try {
        await writeFile(path.join(gameDir, 'game.config.json'), JSON.stringify({ ...config, title: 'Changed title' }));
        assert.equal((await (await get('verify', { fingerprint })).json()).status, 'outdated');
        assert.equal((await download()).status, 200);
        await writeFile(path.join(gameDir, 'game.config.json'), '{');
        assert.equal((await (await get('verify', { fingerprint })).json()).status, 'failed');
      } finally { await writeFile(path.join(gameDir, 'game.config.json'), configText); }
    });
  } finally {
    await server.close();
    for (const directory of [gameDir, distDir]) {
      assert.ok(path.relative(ROOT, directory).startsWith(directory === gameDir ? 'games' + path.sep : 'dist' + path.sep));
      assert.equal(path.basename(directory), id);
      await rm(directory, { recursive: true, force: true });
    }
  }
});
