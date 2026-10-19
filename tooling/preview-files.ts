import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { outputPath, readBuildReport, sha256, SourceMismatchError, verifyGame, type ArtifactRecord } from './build';
import { validId } from './config';

export class PreviewFileError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
async function snapshot(game: string, fingerprint?: string) {
  const result = await readBuildReport(game);
  if (fingerprint !== undefined && result.fingerprint !== fingerprint) throw new PreviewFileError('The build report changed. Refresh files before continuing.', 409);
  return result;
}
export async function artifactBuffer(artifact: ArtifactRecord): Promise<Buffer> {
  const bytes = await readFile(await outputPath(artifact.path));
  if (bytes.length !== artifact.bytes || sha256(bytes) !== artifact.sha256) throw new Error('File changed after build. Rebuild exports.');
  return bytes;
}
export async function listPreviewFiles(game: string) {
  validId(game);
  // Only a missing report means no export; missing artifacts are individual errors.
  let saved;
  try { saved = await snapshot(game); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { state: 'empty' as const };
    throw error;
  }
  const { report, fingerprint } = saved;
  const artifacts = await Promise.all(report.artifacts.map(async artifact => {
    try {
      await artifactBuffer(artifact);
      return { ...artifact, available: true, absolutePath: await outputPath(artifact.path), error: '' };
    } catch (error) {
      const message = (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'File missing. Rebuild exports.' : (error as Error).message;
      return { ...artifact, available: false, absolutePath: '', error: message };
    }
  }));
  await snapshot(game, fingerprint);
  return { state: 'built' as const, fingerprint, mode: report.mode, createdAt: report.createdAt, artifacts };
}
export async function previewDownload(params: URLSearchParams) {
  for (const key of params.keys()) if (!['game', 'platform', 'os', 'fingerprint', 'report'].includes(key) || params.getAll(key).length !== 1) throw new PreviewFileError('Invalid download selector.');
  const game = params.get('game') || '';
  const fingerprint = params.get('fingerprint') || '';
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new PreviewFileError('Refresh files to obtain a current download link.');
  const saved = await snapshot(game, fingerprint);
  if (params.get('report') === '1' && !params.has('platform') && !params.has('os')) {
    return { bytes: saved.bytes, contentType: 'application/json; charset=utf-8', filename: `${game}-report.json`, attachment: false };
  }
  if (params.has('report')) throw new PreviewFileError('Invalid report selector.');
  const platform = params.get('platform'); const os = params.get('os');
  if (platform !== 'unity' && platform !== 'google' || platform === 'google' && params.has('os') || platform === 'unity' && !['android', 'ios'].includes(os || '')) throw new PreviewFileError('Invalid artifact selector.');
  const artifact = saved.report.artifacts.find(item => item.platform === platform && (item.platform === 'google' || item.os === os));
  if (!artifact) throw new PreviewFileError('This file is not in the latest build. Refresh files.', 404);
  const bytes = await artifactBuffer(artifact);
  await snapshot(game, fingerprint);
  return { bytes, contentType: platform === 'google' ? 'application/zip' : 'text/html; charset=utf-8', filename: `${game}-${platform}${os ? '-' + os : ''}-${path.basename(artifact.path)}`, attachment: true };
}
export async function verifyPreviewFiles(game: string, fingerprint: string) {
  await snapshot(game, fingerprint);
  let status: 'passed' | 'outdated' | 'failed' = 'passed'; let message = 'Local checks passed';
  try { await verifyGame(game); }
  catch (error) {
    status = error instanceof SourceMismatchError ? 'outdated' : 'failed';
    message = (error as Error).message;
  }
  await snapshot(game, fingerprint);
  return { fingerprint, status, message, checkedAt: new Date().toISOString() };
}
