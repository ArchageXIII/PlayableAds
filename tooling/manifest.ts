import { createHash } from 'node:crypto';
import { parse, type DefaultTreeAdapterTypes as Tree } from 'parse5';

export const MANIFEST_SCHEMA_VERSION = 1;
export const MANIFEST_POLICY_VERSION = 1;
export const MAX_MANIFEST_BYTES = 4096;
const marker = 'PlayableAdsManifest';
const prefix = '<!--' + marker + ':';
export type BuildMode = 'preview' | 'release';
type ManifestTarget = { platform: 'unity'; os: 'android' | 'ios' } | { platform: 'google'; os?: never };
export type ManifestMetadata = ManifestTarget & { generatorVersion: string; game: string; mode: BuildMode };
export type ExportManifest = ManifestMetadata & {
  schemaVersion: 1;
  generator: 'PlayableAds';
  policyVersion: 1;
  contentSha256: string;
};
export interface ManifestExpectation {
  game?: string;
  platform?: 'unity' | 'google';
  mode?: BuildMode;
  os?: 'android' | 'ios';
}
export interface ManifestVerification {
  ok: boolean;
  manifest?: ExportManifest;
  errors: string[];
}

function digest(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
function decode(bytes: Uint8Array): string {
  const html = Buffer.from(bytes).toString('utf8');
  if (!Buffer.from(html, 'utf8').equals(Buffer.from(bytes))) throw new Error('Manifest input must be valid UTF-8.');
  return html;
}
function inspect(html: string) {
  const document = parse(html, { sourceCodeLocationInfo: true });
  const comments: Tree.CommentNode[] = [];
  let head: Tree.Element | undefined;
  const pending: Tree.Node[] = [document];
  while (pending.length) {
    const node = pending.pop()!;
    if ('tagName' in node && node.tagName === 'head') head = node;
    if ('data' in node && node.data.trimStart().startsWith(marker)) comments.push(node);
    if ('childNodes' in node) pending.push(...node.childNodes);
    if ('content' in node) pending.push((node as Tree.Template).content);
  }
  return { comments, head };
}
function validateMetadata(value: unknown): asserts value is ExportManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid manifest object.');
  const data = value as Record<string, unknown>;
  if (data.schemaVersion !== MANIFEST_SCHEMA_VERSION) throw new Error('Unsupported manifest schema version.');
  if (data.policyVersion !== MANIFEST_POLICY_VERSION) throw new Error('Unsupported manifest policy version.');
  if (data.generator !== 'PlayableAds') throw new Error('Unsupported manifest generator.');
  if (typeof data.generatorVersion !== 'string' || data.generatorVersion.length > 128 ||
      !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(data.generatorVersion)) throw new Error('Invalid manifest generator version.');
  if (typeof data.game !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.game)) throw new Error('Invalid manifest game ID.');
  if (data.mode !== 'preview' && data.mode !== 'release') throw new Error('Invalid manifest build mode.');
  if (data.platform === 'unity') {
    if (data.os !== 'android' && data.os !== 'ios') throw new Error('Unity manifest requires android or ios OS.');
  } else if (data.platform !== 'google' || 'os' in data) throw new Error('Manifest target must be Unity with OS or Google without OS.');
  if (typeof data.contentSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(data.contentSha256)) throw new Error('Invalid manifest content SHA-256.');
  const allowed = ['schemaVersion', 'generator', 'generatorVersion', 'policyVersion', 'game', 'platform', 'mode', 'contentSha256', 'os'];
  if (Object.keys(data).some(key => !allowed.includes(key))) throw new Error('Unknown manifest field for schema 1.');
}

/** Creates metadata only; a valid hash is not a claim of technical compliance. */
export function createManifest(content: Uint8Array, metadata: ManifestMetadata): ExportManifest {
  decode(content);
  const manifest: ExportManifest = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    generator: 'PlayableAds',
    generatorVersion: metadata.generatorVersion,
    policyVersion: MANIFEST_POLICY_VERSION,
    game: metadata.game,
    platform: metadata.platform,
    mode: metadata.mode,
    ...(metadata.platform === 'unity' ? { os: metadata.os } : {}),
    contentSha256: digest(content)
  } as ExportManifest;
  validateMetadata(manifest);
  return manifest;
}

/** Inserts exactly one comment without changing any other HTML bytes. */
export function embedManifest(html: string, metadata: ManifestMetadata): string {
  const { comments, head } = inspect(html);
  if (comments.length) throw new Error('HTML already contains a manifest marker.');
  const insertion = head?.sourceCodeLocation?.endTag?.startOffset;
  if (insertion === undefined) throw new Error('Manifest requires an explicit HTML head.');
  const manifest = createManifest(Buffer.from(html, 'utf8'), metadata);
  // Escape comment delimiters as JSON escapes, not HTML entities.
  const json = JSON.stringify(manifest).replace(/[<>&-]/g, char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'));
  const comment = prefix + json + '-->';
  if (Buffer.byteLength(comment, 'utf8') > MAX_MANIFEST_BYTES) throw new Error('Manifest exceeds the 4 KiB limit.');
  return html.slice(0, insertion) + comment + html.slice(insertion);
}

/** Extracts typed metadata and exact remaining bytes, but does not verify the hash. */
export function extractManifest(bytes: Uint8Array): { manifest: ExportManifest; content: Uint8Array } {
  const html = decode(bytes);
  const { comments, head } = inspect(html);
  if (!comments.length) throw new Error('Missing PlayableAds manifest. Rebuild this ad with the current toolkit.');
  if (comments.length !== 1) throw new Error('Exactly one PlayableAds manifest is required.');
  const comment = comments[0];
  const location = comment.sourceCodeLocation;
  const headLocation = head?.sourceCodeLocation;
  if (!location || !head || comment.parentNode !== head || !headLocation?.startTag || !headLocation.endTag ||
      location.startOffset < headLocation.startTag.endOffset || location.endOffset > headLocation.endTag.startOffset) {
    throw new Error('Manifest must be a comment directly inside the explicit HTML head.');
  }
  const raw = html.slice(location.startOffset, location.endOffset);
  if (Buffer.byteLength(raw, 'utf8') > MAX_MANIFEST_BYTES) throw new Error('Manifest exceeds the 4 KiB limit.');
  if (!raw.startsWith(prefix) || !raw.endsWith('-->')) throw new Error('Malformed PlayableAds manifest comment.');
  const json = raw.slice(prefix.length, -3);
  if (/--|[<>]/.test(json)) throw new Error('Unsafe manifest comment encoding.');
  let manifest: unknown;
  try { manifest = JSON.parse(json); } catch { throw new Error('Malformed manifest JSON.'); }
  validateMetadata(manifest);
  // parse5 offsets count UTF-16 code units; convert to byte offsets before slicing.
  const start = Buffer.byteLength(html.slice(0, location.startOffset), 'utf8');
  const end = Buffer.byteLength(html.slice(0, location.endOffset), 'utf8');
  return { manifest, content: Buffer.concat([bytes.subarray(0, start), bytes.subarray(end)]) };
}

/** Checks integrity and optional expected identity, without sources or a build report. */
export function verifyManifest(bytes: Uint8Array, expected: ManifestExpectation = {}): ManifestVerification {
  try {
    const { manifest, content } = extractManifest(bytes);
    const errors: string[] = [];
    if (digest(content) !== manifest.contentSha256) errors.push('Manifest content SHA-256 mismatch. Rebuild the ad after editing it.');
    for (const key of ['game', 'platform', 'mode', 'os'] as const) {
      if (expected[key] !== undefined && manifest[key] !== expected[key]) errors.push('Manifest ' + key + ' does not match the expected artifact.');
    }
    return { ok: errors.length === 0, manifest, errors };
  } catch (error) {
    return { ok: false, errors: [(error as Error).message] };
  }
}
