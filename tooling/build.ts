import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { build as bundle } from 'esbuild';
import { transformAsync } from '@babel/core';
import { minify as minifyJs } from 'terser';
import { minify as minifyHtml } from 'html-minifier-terser';
import { zipSync, strToU8 } from 'fflate';
import type { EmbeddedAsset, Platform, RuntimeConfig, TargetOs } from '../src/runtime/types';
import { ROOT, EXIT_API, loadConfig, resolveGameAsset, validateStoreUrl } from './config';
import { auditGame } from './source-policy';
import { validateHtml, validateZip } from './validate';
import { PREVIEW_STORE_URLS } from './constants';

export type BuildMode = 'preview' | 'release';
export interface AssetContribution { id: string; sourceBytes: number; embeddedBytes: number }
export interface ArtifactRecord { platform: 'unity' | 'google'; os: TargetOs; path: string; bytes: number; sha256: string; checks: string[]; assets: AssetContribution[] }
export interface BuildReport {
  schemaVersion: 1;
  game: string;
  mode: BuildMode;
  createdAt: string;
  sourceSha256: string;
  storeUrls: Partial<Record<TargetOs, string>>;
  localValidation: 'passed';
  platformAcceptance: 'pending';
  releaseReady: false;
  artifacts: ArtifactRecord[];
}
export function sha256(bytes: Uint8Array | string): string { return createHash('sha256').update(bytes).digest('hex'); }
export async function compileGame(id: string, platform: Platform, os: TargetOs, storeUrl = ''): Promise<{ html: string; assets: AssetContribution[]; sourceSha256: string }> {
  const game = await loadConfig(id);
  await auditGame(id);
  const assets: Record<string, EmbeddedAsset> = {};
  const contributions: AssetContribution[] = [];
  for (const [key, spec] of Object.entries(game.assets)) {
    const file = await resolveGameAsset(id, spec.path);
    const bytes = await readFile(file);
    const extension = path.extname(file).toLowerCase();
    let mime = '';
    if (spec.kind === 'image' && extension === '.png' && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) mime = 'image/png';
    else if (spec.kind === 'image' && ['.jpg', '.jpeg'].includes(extension) && bytes[0] === 255 && bytes[1] === 216) mime = 'image/jpeg';
    else if (spec.kind === 'audio' && extension === '.wav' && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE') mime = 'audio/wav';
    if (!mime) throw new Error('Unsupported or invalid asset (use PNG/JPEG images or WAV audio): ' + spec.path);
    const data = 'data:' + mime + ';base64,' + bytes.toString('base64');
    assets[key] = { kind: spec.kind, data };
    contributions.push({ id: key, sourceBytes: bytes.length, embeddedBytes: Buffer.byteLength(data) });
  }
  const config: RuntimeConfig = { ...game, assets, storeUrl, targetOs: os };
  const bundled = await bundle({
    stdin: { contents: `import { createGame } from './games/${id}/game.ts'; import { boot } from './src/runtime/boot.ts'; import { createHost } from './src/runtime/hosts/${platform}.ts'; boot(createGame, ${JSON.stringify(config)}, createHost());`, resolveDir: ROOT, loader: 'ts' },
    bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2015', treeShaking: true, metafile: true, legalComments: 'none', logLevel: 'silent'
  });
  for (const input of Object.keys(bundled.metafile.inputs)) {
    if (input === '<stdin>') continue;
    const relative = path.relative(ROOT, path.resolve(ROOT, input)).replace(/\\/g, '/');
    if (!relative.startsWith('src/runtime/') && !relative.startsWith('games/' + id + '/')) throw new Error('Unapproved runtime dependency: ' + input);
  }
  const source = bundled.outputFiles[0].text;
  const transpiled = await transformAsync(source, { babelrc: false, configFile: false, presets: [['@babel/preset-env', { targets: { android: '4.4', ios: '9' }, modules: false, useBuiltIns: false }]], comments: false });
  if (!transpiled?.code) throw new Error('Transpilation failed.');
  const minimized = await minifyJs(transpiled.code, { ecma: 5, compress: { passes: 2 }, mangle: true, format: { comments: false, ascii_only: true } });
  if (!minimized.code) throw new Error('Minification failed.');
  const css = await readFile(path.join(ROOT, 'src/runtime/style.css'), 'utf8');
  const escapedTitle = game.title.replace(/[&<>"']/g, value => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[value]!);
  const sdk = platform === 'google' ? `<script src="${EXIT_API}"></script>` : '';
  const script = minimized.code.replace(/<\/script/gi, '<\\/script');
  const minimizedHtml = await minifyHtml(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="ad.orientation" content="portrait,landscape"><title>${escapedTitle}</title>${sdk}<style>${css}</style></head><body><div id="ad-root"></div><script>${script}</script></body></html>`, { collapseWhitespace: true, removeComments: true, removeOptionalTags: false, minifyCSS: true, minifyJS: false, keepClosingSlash: false });
  // Preserve the runtime's license in standalone uploads, after comment stripping.
  const license = (await readFile(path.join(ROOT, 'LICENSE'), 'utf8')).replace(/\r\n?/g, '\n').trim();
  if (!license || /--|[<>]/.test(license)) throw new Error('LICENSE must be non-empty and safe for an HTML comment.');
  const html = minimizedHtml.replace(/^(<!doctype html>)/i, '$1<!--\n' + license + '\n-->');
  if (platform !== 'browser') {
    const validation = validateHtml(strToU8(html), platform);
    if (!validation.ok) throw new Error(validation.errors.join('\n'));
  }
  return { html, assets: contributions, sourceSha256: sha256(source) };
}
export async function buildGame(id: string, mode: BuildMode, systems: TargetOs[], urls: Partial<Record<TargetOs, string>>): Promise<BuildReport> {
  if (mode === 'release') systems.forEach(os => validateStoreUrl(os, urls[os] || ''));
  const artifacts: ArtifactRecord[] = [];
  const sourceHashes: string[] = [];
  for (const os of systems) {
    for (const platform of ['unity', 'google'] as const) {
      const built = await compileGame(id, platform, os, mode === 'release' ? urls[os] : PREVIEW_STORE_URLS[os]);
      const bytes = platform === 'google' ? zipSync({ 'index.html': [strToU8(built.html), { mtime: new Date(1980, 0, 2, 12) }] }, { level: 9 }) : strToU8(built.html);
      const validation = platform === 'google' ? validateZip(bytes) : validateHtml(bytes, platform);
      if (!validation.ok) throw new Error(validation.errors.join('\n'));
      const relative = `dist/${id}/${os}/${platform}/${platform === 'unity' ? 'index.html' : 'playable.zip'}`;
      const destination = path.join(ROOT, relative);
      await mkdir(path.dirname(destination), { recursive: true }); await writeFile(destination, bytes);
      sourceHashes.push(built.sourceSha256);
      artifacts.push({ platform, os, path: relative, bytes: bytes.length, sha256: sha256(bytes), checks: validation.checks, assets: built.assets });
    }
  }
  const report: BuildReport = { schemaVersion: 1, game: id, mode, createdAt: new Date().toISOString(), sourceSha256: sha256(sourceHashes.join('')), storeUrls: Object.fromEntries(systems.map(os => [os, mode === 'release' ? urls[os] : PREVIEW_STORE_URLS[os]])), localValidation: 'passed', platformAcceptance: 'pending', releaseReady: false, artifacts };
  await writeFile(path.join(ROOT, 'dist', id, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}
export async function verifyGame(id: string): Promise<BuildReport> {
  const config = await loadConfig(id);
  const report = JSON.parse(await readFile(path.join(ROOT, 'dist', config.id, 'report.json'), 'utf8')) as BuildReport;
  if (report.game !== id || report.schemaVersion !== 1 || !report.artifacts?.length || !['preview', 'release'].includes(report.mode)) throw new Error('Invalid build report.');
  const sources: string[] = [];
  for (const artifact of report.artifacts) {
    if (!['unity', 'google'].includes(artifact.platform) || !['android', 'ios'].includes(artifact.os)) throw new Error('Invalid artifact target.');
    const expected = `dist/${id}/${artifact.os}/${artifact.platform}/${artifact.platform === 'unity' ? 'index.html' : 'playable.zip'}`;
    if (artifact.path !== expected) throw new Error('Invalid artifact path.');
    if (report.mode === 'release') validateStoreUrl(artifact.os, report.storeUrls[artifact.os] || '');
    const bytes = await readFile(path.join(ROOT, expected));
    if (sha256(bytes) !== artifact.sha256 || bytes.length !== artifact.bytes) throw new Error('Artifact changed after build: ' + artifact.path);
    const validation = artifact.platform === 'google' ? validateZip(bytes) : validateHtml(bytes, 'unity');
    if (!validation.ok) throw new Error(validation.errors.join('\n'));
    const compiled = await compileGame(id, artifact.platform, artifact.os, report.storeUrls[artifact.os] || '');
    sources.push(compiled.sourceSha256);
    const expectedBytes = artifact.platform === 'unity' ? strToU8(compiled.html) : zipSync({ 'index.html': [strToU8(compiled.html), { mtime: new Date(1980, 0, 2, 12) }] }, { level: 9 });
    if (sha256(expectedBytes) !== artifact.sha256) throw new Error('Artifact does not match current sources: ' + artifact.path);
  }
  if (sha256(sources.join('')) !== report.sourceSha256) throw new Error('Sources changed since build; rebuild before verification.');
  return report;
}
