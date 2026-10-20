import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { embedManifest, extractManifest, verifyManifest, MAX_MANIFEST_BYTES, type ManifestMetadata } from '../../tooling/manifest';

const content = '<!DOCTYPE html><!--MIT notice ©--><html><head><meta charset="utf-8"><title>広告 🎮</title></head><body>Play\r\nnow</body></html>';
const metadata: ManifestMetadata = { generatorVersion: '0.1.0', game: 'test-game', platform: 'google', mode: 'preview' };
const embedded = embedManifest(content, metadata);
const bytes = (html: string) => Buffer.from(html, 'utf8');
const comment = embedded.match(/<!--PlayableAdsManifest:.*?-->/)![0];
const rawManifest = extractManifest(bytes(embedded)).manifest;
function alteredManifest(update: Record<string, unknown>): string {
  return embedded.replace(comment, '<!--PlayableAdsManifest:' + JSON.stringify({ ...rawManifest, ...update }) + '-->');
}
function fails(html: string, expected: RegExp): void {
  const result = verifyManifest(bytes(html));
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), expected);
}

test('manifest preserves exact content bytes including Unicode, license and line endings', () => {
  const result = extractManifest(bytes(embedded));
  assert.deepEqual(result.content, bytes(content));
  assert.equal(result.manifest.contentSha256, createHash('sha256').update(bytes(content)).digest('hex'));
  assert.deepEqual(verifyManifest(bytes(embedded)), { ok: true, manifest: result.manifest, errors: [] });
  assert.equal(embedManifest(content, metadata), embedded);
  assert.equal(result.manifest.schemaVersion, 1);
  assert.equal(result.manifest.policyVersion, 1);
  assert.equal(result.manifest.generator, 'PlayableAds');
  assert.ok(Buffer.byteLength(comment) < MAX_MANIFEST_BYTES);
  assert.throws(() => embedManifest(embedded, metadata), /already contains/);
});

test('Unity identities and expected metadata are verified independently of hash', () => {
  for (const os of ['android', 'ios'] as const) {
    const html = bytes(embedManifest(content, { ...metadata, platform: 'unity', os, mode: 'release' }));
    assert.equal(verifyManifest(html, { game: 'test-game', platform: 'unity', os, mode: 'release' }).ok, true);
    for (const expected of [{ game: 'different' }, { platform: 'google' as const }, { mode: 'preview' as const }, { os: os === 'ios' ? 'android' as const : 'ios' as const }]) {
      assert.equal(verifyManifest(html, expected).ok, false);
    }
  }
});

test('edits, copied manifests and license changes invalidate the content hash', () => {
  fails(embedded.replace('Play\r\nnow', 'Play later'), /SHA-256 mismatch/);
  fails(embedded.replace('MIT notice', 'edited license'), /SHA-256 mismatch/);
  fails(content.replace('</head>', comment + '</head>').replace('広告', 'Other game'), /SHA-256 mismatch/);
  fails(embedded.replace('\r\n', '\n'), /SHA-256 mismatch/);
  assert.equal(verifyManifest(bytes(embedded.replace('Play\r\nnow', 'changed'))).manifest?.game, 'test-game');
});

test('only actual comments count, including duplicate markers hidden in templates', () => {
  const scriptOnly = content.replace('</head>', '<script>var marker=' + JSON.stringify(comment) + ';</script></head>');
  fails(scriptOnly, /Missing.*Rebuild/);
  assert.equal(verifyManifest(bytes(embedManifest(scriptOnly, metadata))).ok, true);
  fails(embedded.replace('</head>', comment + '</head>'), /Exactly one/);
  fails(embedded.replace('</body>', '<template>' + comment + '</template></body>'), /Exactly one/);
  fails(content.replace('</body>', comment + '</body>'), /directly inside/);
  fails(content, /Missing.*Rebuild/);
});

test('malformed, unsupported and invalid manifest metadata returns useful errors', () => {
  const cases: [Record<string, unknown>, RegExp][] = [
    [{ schemaVersion: 2 }, /schema version/],
    [{ policyVersion: 2 }, /policy version/],
    [{ generator: 'Other' }, /generator/],
    [{ generatorVersion: null }, /generator version/],
    [{ game: '../escape' }, /game ID/],
    [{ mode: 'development' }, /build mode/],
    [{ platform: 'browser' }, /target/],
    [{ os: 'android' }, /without OS/],
    [{ platform: 'unity' }, /requires/],
    [{ platform: 'unity', os: 'windows' }, /requires/],
    [{ contentSha256: 'bad' }, /SHA-256/],
    [{ trackingUrl: 'https://example.com' }, /Unknown manifest field/]
  ];
  for (const [update, expected] of cases) fails(alteredManifest(update), expected);
  fails(embedded.replace(comment, '<!--PlayableAdsManifest:{-->'), /JSON/);
  fails(embedded.replace(comment, '<!-- PlayableAdsManifest:{}-->'), /Malformed/);
  fails(embedded.replace(comment, '<!--PlayableAdsManifest:{}--!>'), /Malformed/);
  fails(embedded.replace(comment, '<!--PlayableAdsManifest:null-->'), /object/);
  assert.match(verifyManifest(Uint8Array.of(255)).errors.join(), /UTF-8/);
});

test('safe serialization escapes comment delimiters and bounds embedded metadata', () => {
  const html = embedManifest(content, { ...metadata, generatorVersion: '1.0.0-alpha--test' });
  assert.ok(html.includes('alpha\\u002d\\u002dtest'));
  assert.equal(extractManifest(bytes(html)).manifest.generatorVersion, '1.0.0-alpha--test');
  assert.equal(verifyManifest(bytes(html)).ok, true);
  fails(alteredManifest({ generatorVersion: '1.0.0-alpha--test' }), /Unsafe/);
  fails(alteredManifest({ generatorVersion: '<unsafe>' }), /Unsafe/);
  fails(embedded.replace(comment, '<!--PlayableAdsManifest:' + ' '.repeat(MAX_MANIFEST_BYTES) + '{}-->'), /4 KiB/);
  assert.throws(() => embedManifest(content, { ...metadata, game: 'x'.repeat(MAX_MANIFEST_BYTES) }), /4 KiB/);
});
