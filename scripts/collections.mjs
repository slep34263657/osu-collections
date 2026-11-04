import { gunzipSync } from 'node:zlib';

class Reader {
  constructor(buffer) { this.buffer = buffer; this.offset = 0; }
  take(n) {
    if (n < 0 || this.offset + n > this.buffer.length) throw new Error('Truncated collection file');
    const b = this.buffer.subarray(this.offset, this.offset += n); return b;
  }
  int() { return this.take(4).readInt32LE(); }
  count() { const n = this.int(); if (n < 0 || n > 1000000) throw new Error('Invalid collection count'); return n; }
  byte() { return this.take(1)[0]; }
  string() {
    let n = 0, shift = 0, b;
    do { if (shift > 28) throw new Error('Invalid string length'); b = this.byte(); n += (b & 127) * 2 ** shift; shift += 7; } while (b & 128);
    return this.take(n).toString('utf8');
  }
}

export function parseOsdb(buffer) {
  let r = new Reader(buffer);
  const version = r.string();
  if (!/^o!dm(?:[2-8])?(?:min)?$/.test(version) || (version.endsWith('min') && !/^o!dm[78]min$/.test(version))) throw new Error(`Unsupported OSDB version: ${version}`);
  const v = Number(version.match(/\d+/)?.[0] || 1), minimal = version.endsWith('min');
  if (v >= 7) {
    r = new Reader(gunzipSync(buffer.subarray(r.offset), { maxOutputLength: 128 * 1024 * 1024 }));
    if (r.string() !== version) throw new Error('OSDB version headers do not match');
  }
  r.take(8); r.string();
  const collections = [], count = r.count();
  for (let i = 0; i < count; i++) {
    const name = r.string(); if (v >= 7) r.int();
    const maps = [], n = r.count();
    for (let j = 0; j < n; j++) {
      const map = { id: r.int(), setId: v >= 2 ? r.int() : -1 };
      if (!minimal) { map.artist = r.string(); map.title = r.string(); map.difficulty = r.string(); }
      map.hash = r.string().toLowerCase();
      if (v >= 4) r.string();
      if (v >= 8 || (v >= 5 && !minimal)) map.mode = r.byte();
      if (v >= 8 || (v >= 6 && !minimal)) {
        const stars = r.take(8).readDoubleLE();
        if (Number.isFinite(stars) && stars > 0) map.stars = stars;
      }
      maps.push(map);
    }
    if (v >= 3) { const n = r.count(); for (let j = 0; j < n; j++) maps.push({ hash: r.string().toLowerCase() }); }
    collections.push({ name, maps });
  }
  if (r.string() !== 'By Piotrekol' || r.offset !== r.buffer.length) throw new Error('Invalid OSDB footer');
  return collections;
}
