import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import type { GameConfig, TargetOs } from '../src/runtime/types';

export const ROOT = path.resolve(import.meta.dirname, '..');
export { MAX_BYTES, EXIT_API } from './constants';
export function validId(id: string): void {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error('Game IDs must contain lowercase letters, numbers and single hyphens.');
}
export async function listGames(): Promise<string[]> {
  return (await readdir(path.join(ROOT, 'games'), { withFileTypes: true })).filter(item => item.isDirectory()).map(item => item.name).sort();
}
export async function loadConfig(id: string): Promise<GameConfig> {
  validId(id);
  const value = JSON.parse(await readFile(path.join(ROOT, 'games', id, 'game.config.json'), 'utf8')) as GameConfig;
  if (value.id !== id) throw new Error('Config ID must match its game directory.');
  for (const key of ['title', 'instructions', 'successText', 'failureText', 'ctaText'] as const) {
    if (typeof value[key] !== 'string' || !value[key].trim() || value[key].length > 240) throw new Error('Invalid config field: ' + key);
  }
  if (!Number.isFinite(value.durationSeconds) || value.durationSeconds < 3 || value.durationSeconds > 120) throw new Error('durationSeconds must be between 3 and 120.');
  if (!/^#[0-9a-f]{6}$/i.test(value.accent)) throw new Error('accent must be a six-digit hex colour.');
  if (!value.assets || typeof value.assets !== 'object' || Array.isArray(value.assets)) throw new Error('assets must be an object.');
  for (const [key, asset] of Object.entries(value.assets)) {
    if (!/^[a-z][a-z0-9_-]*$/i.test(key) || !asset || !['image', 'audio'].includes(asset.kind) || typeof asset.path !== 'string') throw new Error('Invalid asset: ' + key);
  }
  return value;
}
export async function resolveGameAsset(id: string, reference: string): Promise<string> {
  if (!reference || path.isAbsolute(reference) || /[:\\]/.test(reference)) throw new Error('Assets must use relative paths within the game.');
  const base = await realpath(path.join(ROOT, 'games', id));
  const target = await realpath(path.resolve(base, reference));
  const relative = path.relative(base, target);
  if (relative.startsWith('..') || path.isAbsolute(relative) || !(await stat(target)).isFile()) throw new Error('Asset escapes its game directory.');
  return target;
}
export function validateStoreUrl(os: TargetOs, value: string): void {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('A real store URL is required for ' + os + '.'); }
  if (url.protocol !== 'https:' || /example|replace[_-]?me|placeholder|yourgame/i.test(value) || url.username || url.password) throw new Error('Placeholder or unsafe store URL for ' + os + '.');
  if (os === 'android') {
    if (url.hostname !== 'play.google.com' || url.pathname !== '/store/apps/details' || !/^[a-zA-Z][\w]*(?:\.[a-zA-Z][\w]*)+$/.test(url.searchParams.get('id') || '')) throw new Error('Use a Google Play app details URL.');
  } else if (url.hostname !== 'apps.apple.com' || !/\/id[1-9]\d{5,}(?:\/|$)/.test(url.pathname)) throw new Error('Use an Apple App Store app URL with a real app ID.');
}
export async function releaseUrls(configPath?: string): Promise<Partial<Record<TargetOs, string>>> {
  try {
    const config = JSON.parse(await readFile(path.resolve(ROOT, configPath || 'release.config.json'), 'utf8'));
    if (!config.storeUrls || typeof config.storeUrls !== 'object') throw new Error('Release config requires storeUrls.');
    return config.storeUrls;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('Missing release configuration. Copy release.config.example.json to release.config.json and enter real store URLs, or use --mode preview.');
    throw error;
  }
}
