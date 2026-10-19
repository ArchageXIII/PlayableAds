import { parse as parseHtml } from 'parse5';
import { parse as parseJs } from 'acorn';
import { full } from 'acorn-walk';
import { unzipSync, strFromU8 } from 'fflate';
import { EXIT_API, MAX_BYTES } from './config';

export interface Validation { ok: boolean; errors: string[]; checks: string[] }
const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const forbiddenTags = new Set(['iframe', 'frame', 'frameset', 'object', 'embed', 'video', 'link', 'base']);
const forbiddenNames = new Set(['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'Worker', 'SharedWorker', 'localStorage', 'sessionStorage', 'indexedDB', 'caches', 'eval', 'Function']);
export function validateHtml(bytes: Uint8Array, platform: 'unity' | 'google'): Validation {
  const errors: string[] = [];
  const html = Buffer.from(bytes).toString('utf8');
  if (!Buffer.from(html, 'utf8').equals(Buffer.from(bytes))) errors.push('Invalid UTF-8 encoding.');
  if (bytes.length > MAX_BYTES) errors.push('HTML exceeds the 4.5 MB toolkit budget.');
  if (!/^<!doctype html>/i.test(html)) errors.push('Missing HTML5 doctype.');
  const document = parseHtml(html, { sourceCodeLocationInfo: true });
  let orientation = 0;
  let charset = 0;
  let inlineScripts = 0;
  let exitScripts = 0;
  let hasUnityHost = false;
  let hasGoogleHost = false;
  function visit(node: any, inHead = false): void {
    if (node.tagName) {
      const tag: string = node.tagName;
      const location = node.sourceCodeLocation;
      const attrs: Record<string, string> = Object.fromEntries((node.attrs || []).map((attribute: any) => [attribute.name, attribute.value]));
      const head = inHead || tag === 'head';
      if (!location || (!voidTags.has(tag) && !location.endTag)) errors.push('Missing explicit closing tag: ' + tag);
      if (forbiddenTags.has(tag)) errors.push('Unsupported element: ' + tag);
      if (tag === 'meta') {
        if (attrs.charset?.toLowerCase() === 'utf-8' && head) charset++;
        if (attrs.name === 'ad.orientation') { orientation++; if (!head || attrs.content !== 'portrait,landscape') errors.push('Use portrait,landscape orientation metadata in the head.'); }
        if (attrs['http-equiv']?.toLowerCase() === 'refresh') errors.push('Automatic redirection is forbidden.');
      }
      for (const [name, value] of Object.entries(attrs)) {
        if (/^on/i.test(name)) errors.push('Inline event attributes are not supported.');
        if (['src', 'href', 'action', 'poster', 'data', 'xlink:href', 'srcset'].includes(name)) {
          if (tag === 'script' && name === 'src' && platform === 'google' && value === EXIT_API && head) { exitScripts++; }
          else if (!/^data:(?:image\/(?:png|jpeg)|audio\/wav);base64,[A-Za-z0-9+/=]+$/.test(value)) errors.push('Forbidden resource reference: ' + value.slice(0, 100));
        }
      }
      const contents = (node.childNodes || []).filter((child: any) => child.nodeName === '#text').map((child: any) => child.value).join('');
      if (tag === 'style') {
        if (/@import|https?:|url\s*\(/i.test(contents)) errors.push('Styles must not fetch external resources.');
      }
      if (tag === 'script' && !attrs.src) {
        inlineScripts++;
        if (attrs.type && attrs.type !== 'text/javascript') errors.push('Use classic JavaScript, not modules.');
        if (/sourceMappingURL|__vite|@vite|adgames-preview-exit|__ADGAMES_DEBUG__/.test(contents)) errors.push('Development code leaked into export.');
        hasUnityHost ||= contents.includes('.mraid') && contents.includes('viewableChange');
        hasGoogleHost ||= contents.includes('.ExitApi') && /\.exit\(/.test(contents);
        try {
          const ast = parseJs(contents, { ecmaVersion: 5, sourceType: 'script' });
          full(ast, (entry: any) => {
            if (entry.type === 'Identifier' && forbiddenNames.has(entry.name)) errors.push('Forbidden runtime API: ' + entry.name);
            if (entry.type === 'MemberExpression') {
              const property = entry.computed ? entry.property.value : entry.property.name;
              if (['cookie', 'sendBeacon', 'serviceWorker', 'write', 'assign', 'replace'].includes(property) && ['document', 'navigator', 'location'].includes(entry.object.name)) errors.push('Forbidden browser side effect: ' + property);
              if (property === 'open' && ['window', 'self', 'top', 'parent'].includes(entry.object.name)) errors.push('Direct navigation is forbidden.');
            }
            if (entry.type === 'CallExpression' && entry.callee.type === 'MemberExpression' && entry.callee.property.name === 'getContext' && entry.arguments[0]?.value !== '2d') errors.push('Only Canvas 2D is supported.');
          });
        } catch (error) { errors.push('Production script is not valid ES5: ' + (error as Error).message); }
      }
      for (const child of node.childNodes || []) visit(child, head);
      return;
    }
    for (const child of node.childNodes || []) visit(child, inHead);
  }
  visit(document);
  if (orientation !== 1) errors.push('Exactly one orientation tag is required.');
  if (charset !== 1) errors.push('Exactly one UTF-8 charset tag is required.');
  if (inlineScripts !== 1) errors.push('Exactly one inline game script is required.');
  if (platform === 'unity' && (!hasUnityHost || exitScripts)) errors.push('Unity export must use its MRAID adapter only.');
  if (platform === 'google' && (!hasGoogleHost || exitScripts !== 1)) errors.push('Google export requires its ExitApi adapter and one literal SDK script in the head.');
  return { ok: !errors.length, errors: [...new Set(errors)], checks: ['UTF-8 and explicit HTML structure', 'Dual orientation metadata', 'Embedded resources and host adapter', 'ES5 syntax and prohibited APIs', 'No development code', '4.5 MB HTML budget'] };
}
export function validateZip(bytes: Uint8Array): Validation {
  const errors: string[] = [];
  if (bytes.length > MAX_BYTES) errors.push('ZIP exceeds the 4.5 MB toolkit budget.');
  try {
    const archive = Buffer.from(bytes);
    // Toolkit archives are single-entry, non-ZIP64, unencrypted ZIPs with no comment.
    // Read the central directory before decompression and verify the entry CRC.
    const end = archive.length - 22;
    if (end < 0 || archive.readUInt32LE(end) !== 0x06054b50 || archive.readUInt16LE(end + 20) !== 0 || archive.readUInt16LE(end + 4) || archive.readUInt16LE(end + 6)) throw new Error('Invalid ZIP footer.');
    const count = archive.readUInt16LE(end + 10);
    if (count > 512) errors.push('ZIP contains more than 512 files.');
    if (count !== 1 || archive.readUInt16LE(end + 8) !== 1) throw new Error('Toolkit ZIP must contain exactly one entry.');
    const central = archive.readUInt32LE(end + 16);
    if (central + 46 > end || archive.readUInt32LE(central) !== 0x02014b50 || central + archive.readUInt32LE(end + 12) !== end) throw new Error('Invalid central directory.');
    const flags = archive.readUInt16LE(central + 8);
    const method = archive.readUInt16LE(central + 10);
    const originalSize = archive.readUInt32LE(central + 24);
    if (flags & 1 || ![0, 8].includes(method) || originalSize > MAX_BYTES) throw new Error('Unsupported or oversized ZIP entry.');
    const nameLength = archive.readUInt16LE(central + 28);
    if (archive.toString('utf8', central + 46, central + 46 + nameLength) !== 'index.html') throw new Error('Missing root index.html.');
    const local = archive.readUInt32LE(central + 42);
    if (local + 30 > central || archive.readUInt32LE(local) !== 0x04034b50) throw new Error('Invalid local entry.');
    const localNameLength = archive.readUInt16LE(local + 26);
    if (archive.toString('utf8', local + 30, local + 30 + localNameLength) !== 'index.html') throw new Error('Inconsistent ZIP filename.');
    const dataStart = local + 30 + localNameLength + archive.readUInt16LE(local + 28);
    if (dataStart + archive.readUInt32LE(central + 20) > central) throw new Error('Truncated ZIP entry.');
    // Reject decompression bombs before allocating their declared output.
    const entries = unzipSync(bytes, { filter: file => {
      if (file.originalSize > MAX_BYTES) { errors.push('ZIP entry exceeds the HTML budget.'); return false; }
      return true;
    } });
    const names = Object.keys(entries);
    if (names.length > 512) errors.push('ZIP contains more than 512 files.');
    if (names.length !== 1 || names[0] !== 'index.html') errors.push('Toolkit ZIP must contain only a root index.html.');
    if (entries['index.html']) {
      if (entries['index.html'].length !== originalSize) throw new Error('Inconsistent uncompressed size.');
      let crc = 0xffffffff;
      for (const byte of entries['index.html']) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
      if (((crc ^ 0xffffffff) >>> 0) !== archive.readUInt32LE(central + 16)) throw new Error('ZIP entry CRC mismatch.');
      const validation = validateHtml(entries['index.html'], 'google');
      errors.push(...validation.errors);
      // Force decoding as well as byte validation to exercise the stored entry.
      if (!strFromU8(entries['index.html'])) errors.push('Empty ZIP entry.');
    }
  } catch { errors.push('ZIP is corrupt or cannot be processed.'); }
  return { ok: !errors.length, errors: [...new Set(errors)], checks: ['ZIP integrity and root entry', 'Archive file count', '4.5 MB archive budget', 'Contained HTML validation'] };
}
