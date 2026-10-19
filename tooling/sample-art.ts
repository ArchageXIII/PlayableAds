// Reproducible, code-authored sample artwork; production never runs this module.
import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from './config';
function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const label = Buffer.from(type); const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([label, data])));
  return Buffer.concat([length, label, data, crc]);
}
function png(colour: number[], coin: boolean): Buffer {
  const size = 64; const pixels = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = x - 31.5; const dy = y - 31.5;
    const inside = coin ? dx * dx + dy * dy < 29 * 29 : Math.abs(dx) + Math.abs(dy) < 30;
    const offset = y * (1 + size * 4) + 1 + x * 4;
    const highlight = (coin ? dx * dx + dy * dy < 23 * 23 && y < 28 : y < 30) ? 18 : 0;
    for (let channel = 0; channel < 3; channel++) pixels[offset + channel] = Math.min(255, colour[channel] + highlight);
    pixels[offset + 3] = inside ? 255 : 0;
    if (coin && inside && Math.abs(dx) < 3 && Math.abs(dy) < 14) { pixels[offset] = 171; pixels[offset + 1] = 114; pixels[offset + 2] = 31; }
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}
for (const [id, files] of Object.entries({ 'tap-to-collect': { coin: [237, 184, 62] }, 'drag-to-sort': { coral: [245, 119, 134], mint: [96, 208, 191], blue: [110, 156, 235] } })) {
  const folder = path.join(ROOT, 'games', id, 'assets'); await mkdir(folder, { recursive: true });
  for (const [name, colour] of Object.entries(files)) await writeFile(path.join(folder, name + '.png'), png(colour, name === 'coin'));
}
