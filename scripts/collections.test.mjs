import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { parseOsdb } from './collections.mjs';
import { build } from './build.mjs';

const str = s => { const b = Buffer.from(s), prefix = []; let n = b.length; do { prefix.push((n & 127) | (n > 127 ? 128 : 0)); n >>>= 7; } while (n); return Buffer.concat([Buffer.from(prefix), b]); };
const int = n => { const b = Buffer.alloc(4); b.writeInt32LE(n); return b; };
function fixture(version, hash = 'a'.repeat(32)) {
  const v = Number(version.match(/\d/)?.[0] || 1), min = version.endsWith('min');
  const parts = [str(version), Buffer.alloc(8), str('Editor'), int(1), str('Aim <practice>')];
  if (v >= 7) parts.push(int(123));
  parts.push(int(1), int(42)); if (v >= 2) parts.push(int(100));
  if (!min) parts.push(str('Artist'), str('Title'), str('Hard'));
  parts.push(str(hash)); if (v >= 4) parts.push(str(''));
  if (v >= 8 || (v >= 5 && !min)) parts.push(Buffer.alloc(1));
  if (v >= 8 || (v >= 6 && !min)) parts.push(Buffer.alloc(8));
  if (v >= 3) parts.push(int(1), str('b'.repeat(32)));
  parts.push(str('By Piotrekol'));
  const data = Buffer.concat(parts);
  return v >= 7 ? Buffer.concat([str(version), gzipSync(data)]) : data;
}
test('reads supported full and minimal OSDB versions', () => {
  for (const version of ['o!dm', ...Array.from({ length: 7 }, (_, i) => `o!dm${i + 2}`), 'o!dm7min', 'o!dm8min']) {
    const [c] = parseOsdb(fixture(version)); assert.equal(c.name, 'Aim <practice>'); assert.equal(c.maps[0].id, 42);
  }
});
test('rejects corrupt and truncated collection files', () => {
  assert.throws(() => parseOsdb(str('unknown')), /Unsupported/);
  assert.throws(() => parseOsdb(fixture('o!dm8').subarray(0, 20)));
  const b = fixture('o!dm6'); b[b.length - 1] = 0; assert.throws(() => parseOsdb(b), /footer/);
});
test('build matches OSZ hashes, deduplicates sets and packs original files', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osu-collections-test-'));
  try {
    await fs.mkdir(path.join(root, 'maps')); await fs.mkdir(path.join(root, 'collections'));
    await fs.cp('web', path.join(root, 'web'), { recursive: true }); await fs.copyFile('site.config.json', path.join(root, 'site.config.json'));
    const osu = Buffer.from('osu file format v14\r\n[Metadata]\r\nTitle:Test title\r\nArtist:Test artist\r\nCreator:Mapper\r\nVersion:Hard\r\nBeatmapID:42\r\nBeatmapSetID:100\r\n');
    const zip = new AdmZip(); zip.addFile('hard.osu', osu); zip.addFile('audio.mp3', Buffer.from('fixture'));
    await fs.writeFile(path.join(root, 'maps', 'test.osz'), zip.toBuffer());
    await fs.writeFile(path.join(root, 'collections', 'test.osdb'), fixture('o!dm8', createHash('md5').update(osu).digest('hex')));
    const catalog = await build(root), c = catalog.collections[0];
    assert.equal(c.available, 1); assert.equal(c.missing, 1); assert.equal(c.maps[0].title, 'Test title'); assert.equal(c.maps[0].creator, 'Mapper');
    assert.match(c.maps[0].download, /https:\/\/github.com\/.+\.osz$/);
    const pack = new AdmZip(path.join(root, 'artifacts', decodeURIComponent(c.pack.split('/').at(-1))));
    assert.equal(pack.getEntries().length, 2); assert.ok(pack.getEntries().some(e => e.entryName.endsWith('.osdb')));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
