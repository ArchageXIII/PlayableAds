import { readFile, mkdir, writeFile, lstat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { build as bundle } from 'esbuild';
import { transformAsync } from '@babel/core';
import { minify as minifyJs } from 'terser';
import { minify as minifyHtml } from 'html-minifier-terser';
import { zipSync, strToU8 } from 'fflate';
import type { EmbeddedAsset, RuntimeConfig, TargetOs } from '../src/runtime/types';
import { ROOT, EXIT_API, loadConfig, resolveGameAsset, validateStoreUrl, validId } from './config';
import { auditGame } from './source-policy';
import { validateHtml, validateZip } from './validate';
import { PREVIEW_STORE_URLS } from './constants';
import { embedManifest, type BuildMode } from './manifest';

export type { BuildMode } from './manifest';
export type BuildPlatform = 'all' | 'unity' | 'google';
export type CompileTarget = { platform: 'unity'; os: TargetOs; storeUrl: string } | { platform: 'google' | 'browser'; os?: never; storeUrl?: never };
export interface AssetContribution { id: string; sourceBytes: number; embeddedBytes: number }
export type ArtifactTarget = { platform: 'unity'; os: TargetOs } | { platform: 'google'; os?: never };
export type ArtifactRecord = ArtifactTarget & { path: string; bytes: number; sha256: string; checks: string[]; assets: AssetContribution[] };
export interface BuildReport {
  schemaVersion: 2;
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
export async function compileGame(id: string, target: CompileTarget, mode: BuildMode = 'preview'): Promise<{ html: string; assets: AssetContribution[]; sourceSha256: string }> {
  const { platform } = target;
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
  const config: RuntimeConfig = target.platform === 'unity'
    ? { ...game, assets, platform: 'unity', storeUrl: target.storeUrl, targetOs: target.os }
    : { ...game, assets, platform: target.platform };
  const hostArguments = target.platform === 'unity' ? JSON.stringify(target.storeUrl) : '';
  const bundled = await bundle({
    stdin: { contents: `import { createGame } from './games/${id}/game.ts'; import { boot } from './src/runtime/boot.ts'; import { createHost } from './src/runtime/hosts/${platform}.ts'; boot(createGame, ${JSON.stringify(config)}, createHost(${hostArguments}));`, resolveDir: ROOT, loader: 'ts' },
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
  let html = minimizedHtml.replace(/^(<!doctype html>)/i, '$1<!--\n' + license + '\n-->');
  if (platform !== 'browser') {
    const { version: generatorVersion } = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
    html = embedManifest(html, {
      generatorVersion, game: id, mode,
      ...(target.platform === 'unity' ? { platform: 'unity', os: target.os } : { platform: 'google' })
    });
    const validation = validateHtml(strToU8(html), platform);
    if (!validation.ok) throw new Error(validation.errors.join('\n'));
  }
  return { html, assets: contributions, sourceSha256: sha256(source) };
}
export function artifactPath(id: string, target: ArtifactTarget): string {
  return target.platform === 'google' ? `dist/${id}/google/playable.zip` : `dist/${id}/${target.os}/unity/index.html`;
}
function artifactBytes(html: string, platform: 'unity' | 'google'): Uint8Array {
  return platform === 'unity' ? strToU8(html) : zipSync({ 'index.html': [strToU8(html), { mtime: new Date(1980, 0, 2, 12) }] }, { level: 9 });
}
// Check each existing component, including Windows junctions, before writing or removing generated files.
export async function outputPath(relative: string): Promise<string> {
  const destination = path.resolve(ROOT, relative);
  const inside = path.relative(ROOT, destination);
  if (!inside.startsWith('dist' + path.sep) || path.isAbsolute(inside)) throw new Error('Output must stay inside dist.');
  let current = ROOT;
  for (const part of inside.split(path.sep)) {
    current = path.join(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error('Refusing symlink traversal in generated output: ' + relative);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') break;
      throw error;
    }
  }
  return destination;
}
async function obsoleteGoogleFiles(id: string): Promise<string[]> {
  const files: string[] = [];
  for (const os of ['android', 'ios']) {
    const file = await outputPath(`dist/${id}/${os}/google/playable.zip`);
    try {
      if (!(await lstat(file)).isFile()) throw new Error('Obsolete Google output is not a regular file: ' + file);
      files.push(file);
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  return files;
}
export async function buildGame(id: string, mode: BuildMode, systems: TargetOs[], urls: Partial<Record<TargetOs, string>>, platform: BuildPlatform = 'all'): Promise<BuildReport> {
  validId(id);
  if (!['preview', 'release'].includes(mode) || !['all', 'unity', 'google'].includes(platform)) throw new Error('Invalid build mode or platform.');
  if (platform === 'google' && systems.length) throw new Error('Google exports are universal; do not select an OS.');
  if (platform !== 'google' && (!systems.length || systems.some(os => !['android', 'ios'].includes(os)) || new Set(systems).size !== systems.length)) throw new Error('Select unique Unity operating systems: android,ios.');
  if (mode === 'release') systems.forEach(os => validateStoreUrl(os, urls[os] || ''));
  const storeUrls = Object.fromEntries(systems.map(os => [os, mode === 'release' ? urls[os]! : PREVIEW_STORE_URLS[os]]));
  const targets: ArtifactTarget[] = systems.map(os => ({ platform: 'unity', os }));
  if (platform !== 'unity') targets.push({ platform: 'google' });
  const legacy = platform !== 'unity' ? await obsoleteGoogleFiles(id) : [];
  const artifacts: ArtifactRecord[] = [];
  const pending: { destination: string; bytes: Uint8Array }[] = [];
  const sourceHashes: string[] = [];
  for (const target of targets) {
    const built = await compileGame(id, target.platform === 'unity' ? { ...target, storeUrl: storeUrls[target.os] } : target, mode);
    const bytes = artifactBytes(built.html, target.platform);
    const validation = target.platform === 'google' ? validateZip(bytes) : validateHtml(bytes, 'unity');
    if (!validation.ok) throw new Error(validation.errors.join('\n'));
    const relative = artifactPath(id, target);
    pending.push({ destination: await outputPath(relative), bytes });
    sourceHashes.push(built.sourceSha256);
    artifacts.push({ ...target, path: relative, bytes: bytes.length, sha256: sha256(bytes), checks: validation.checks, assets: built.assets });
  }
  const report: BuildReport = { schemaVersion: 2, game: id, mode, createdAt: new Date().toISOString(), sourceSha256: sha256(sourceHashes.join('')), storeUrls, localValidation: 'passed', platformAcceptance: 'pending', releaseReady: false, artifacts };
  const reportPath = await outputPath(`dist/${id}/report.json`);
  // Compile and validate every selected target before replacing any deliverable.
  for (const item of pending) { await mkdir(path.dirname(item.destination), { recursive: true }); await writeFile(item.destination, item.bytes); }
  for (const file of legacy) { await outputPath(path.relative(ROOT, file)); await unlink(file); }
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  return report;
}
export class SourceMismatchError extends Error {}
export async function readBuildReport(id: string): Promise<{ report: BuildReport; bytes: Buffer; fingerprint: string }> {
  validId(id);
  const bytes = await readFile(await outputPath(`dist/${id}/report.json`));
  const report = JSON.parse(bytes.toString('utf8')) as BuildReport;
  validateBuildReport(id, report);
  return { report, bytes, fingerprint: sha256(bytes) };
}
export function validateBuildReport(id: string, report: BuildReport): void {
  if (!report || report.schemaVersion !== 2) throw new Error('Unsupported build report schema. Rebuild this game for universal Google exports (schema 2).');
  if (report.game !== id || !Array.isArray(report.artifacts) || !report.artifacts.length || !['preview', 'release'].includes(report.mode) || !report.storeUrls || typeof report.storeUrls !== 'object' || Array.isArray(report.storeUrls)) throw new Error('Invalid build report.');
  if (report.localValidation !== 'passed' || report.platformAcceptance !== 'pending' || report.releaseReady !== false) throw new Error('Invalid build report readiness fields.');
  if (!Number.isFinite(Date.parse(report.createdAt)) || !/^[a-f0-9]{64}$/.test(report.sourceSha256)) throw new Error('Invalid build report metadata.');
  const seen = new Set<string>();
  const systems = new Set<string>();
  // Validate the entire target list before reading artifacts or compiling sources.
  for (const artifact of report.artifacts) {
    if (!artifact || !['unity', 'google'].includes(artifact.platform) || (artifact.platform === 'unity' ? !['android', 'ios'].includes(artifact.os) : 'os' in artifact)) throw new Error('Invalid artifact target.');
    if (!Number.isSafeInteger(artifact.bytes) || artifact.bytes < 1 || !/^[a-f0-9]{64}$/.test(artifact.sha256)) throw new Error('Invalid artifact metadata.');
    const expected = artifactPath(id, artifact);
    if (artifact.path !== expected) throw new Error('Invalid artifact path.');
    if (seen.has(expected)) throw new Error('Duplicate artifact target.');
    seen.add(expected);
    if (artifact.platform === 'unity') {
      systems.add(artifact.os);
      const url = report.storeUrls[artifact.os];
      if (report.mode === 'release') validateStoreUrl(artifact.os, url || '');
      else if (url !== PREVIEW_STORE_URLS[artifact.os]) throw new Error('Invalid preview destination.');
    }
  }
  if (Object.keys(report.storeUrls).some(os => !systems.has(os))) throw new Error('Store URLs are only allowed for selected Unity artifacts.');
}
export async function verifyGame(id: string): Promise<BuildReport> {
  await loadConfig(id);
  const { report } = await readBuildReport(id);
  const sources: string[] = [];
  for (const artifact of report.artifacts) {
    const bytes = await readFile(await outputPath(artifact.path));
    if (sha256(bytes) !== artifact.sha256 || bytes.length !== artifact.bytes) throw new Error('Artifact changed after build: ' + artifact.path);
    const expected = { game: id, mode: report.mode, platform: artifact.platform, ...(artifact.platform === 'unity' ? { os: artifact.os } : {}) };
    const validation = artifact.platform === 'google' ? validateZip(bytes, expected) : validateHtml(bytes, 'unity', expected);
    if (!validation.ok) throw new Error(validation.errors.join('\n'));
    const target: CompileTarget = artifact.platform === 'unity' ? { platform: 'unity', os: artifact.os, storeUrl: report.storeUrls[artifact.os]! } : { platform: 'google' };
    const compiled = await compileGame(id, target, report.mode);
    sources.push(compiled.sourceSha256);
    if (sha256(artifactBytes(compiled.html, artifact.platform)) !== artifact.sha256) throw new SourceMismatchError('Artifact does not match current sources: ' + artifact.path);
  }
  if (sha256(sources.join('')) !== report.sourceSha256) throw new SourceMismatchError('Sources changed since build; rebuild before verification.');
  return report;
}
