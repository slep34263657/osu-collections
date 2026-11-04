import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import AdmZip from 'adm-zip';
import sharp from 'sharp';
import { dtStats } from './dt.mjs';
import { officialCalculator } from './calculator.mjs';

export function parseDifficulty(data) {
  const text = data.toString('utf8');
  const section = name => text.match(new RegExp(`^\\[${name}\\]\\s*\\r?\\n([\\s\\S]*?)(?=^\\[|$(?![\\s\\S]))`, 'm'))?.[1] || '';
  const field = key => text.match(new RegExp(`^${key}[ \\t]*:[ \\t]*(.*)$`, 'm'))?.[1].trim() || '';
  const number = key => { const value = field(key); return value !== '' && Number.isFinite(Number(value)) ? Number(value) : null; };
  const timing = section('TimingPoints').split(/\r?\n/).filter(l => l.trim() && !l.startsWith('//')).map(l => l.split(',').map(Number)).filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1])).sort((a, b) => a[0] - b[0]);
  const bpms = timing.filter(p => p[1] > 0).map(p => 60000 / p[1]);
  const objects = section('HitObjects').split(/\r?\n/).map(l => l.split(',')).filter(p => p.length >= 5 && Number.isFinite(Number(p[2]))).sort((a, b) => Number(a[2]) - Number(b[2]));
  const sliderMultiplier = number('SliderMultiplier') || 1.4;
  let end = 0, index = 0, beatLength = 500, velocity = 1;
  for (const object of objects) {
    const start = Number(object[2]), type = Number(object[3]);
    while (index < timing.length && timing[index][0] <= start) {
      const point = timing[index++];
      if (point[1] > 0) { beatLength = point[1]; velocity = 1; }
      else if (point[1] < 0) velocity = Math.min(10, Math.max(0.1, -100 / point[1]));
    }
    let finish = start;
    if (type & 8 || type & 128) finish = Number(object[5]?.split(':')[0]) || start;
    else if (type & 2) finish += (Number(object[7]) || 0) * (Number(object[6]) || 1) * beatLength / (sliderMultiplier * 100 * velocity);
    end = Math.max(end, finish);
  }
  const tempos = timing.filter(point => point[1] > 0), durations = new Map();
  for (const [i, point] of tempos.entries()) {
    const bpm = Math.round(60000 / point[1]);
    const duration = Math.max(0, Math.min(end, tempos[i + 1]?.[0] ?? end) - Math.max(0, point[0]));
    durations.set(bpm, (durations.get(bpm) || 0) + duration);
  }
  const bpmMain = [...durations].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const first = Number(objects[0]?.[2]) || 0;
  const breaks = [...section('Events').matchAll(/^\s*(?:2|Break)\s*,\s*(\d+)\s*,\s*(\d+)/gm)].reduce((sum, match) => sum + Math.max(0, Math.min(end, Number(match[2])) - Math.max(first, Number(match[1]))), 0);
  const background = section('Events').match(/^\s*(?:0|Background)\s*,\s*0\s*,\s*"([^"]+)"/m)?.[1];
  return {
    hash: createHash('md5').update(data).digest('hex'), id: number('BeatmapID'), name: field('Version'), mode: number('Mode') || 0,
    ar: number('ApproachRate') ?? number('OverallDifficulty'), od: number('OverallDifficulty'), cs: number('CircleSize'), hp: number('HPDrainRate'),
    bpmMin: bpms.length ? Math.min(...bpms) : null, bpmMax: bpms.length ? Math.max(...bpms) : null, bpmMain,
    length: Math.round(Math.max(0, end - first) / 1000), drain: Math.round(Math.max(0, end - first - breaks) / 1000), objects: objects.length, background,
    creator: field('Creator'), source: field('Source'), tags: field('Tags'), titleUnicode: field('TitleUnicode'), artistUnicode: field('ArtistUnicode'),
    divisor: number('BeatDivisor'), circles: objects.filter(o => Number(o[3]) & 1).length, sliders: objects.filter(o => Number(o[3]) & 2).length,
    ln: objects.length ? objects.filter(o => Number(o[3]) & 128).length / objects.length * 100 : 0
  };
}

export async function enrichCatalog(root, catalog) {
  const calculator = await officialCalculator();
  catalog.calculator = { name: 'osu!lazer', version: calculator.version };
  try {
  const covers = path.join(root, 'data/covers'); await fs.mkdir(covers, { recursive: true });
  let processed = 0;
  for (const map of catalog.maps) {
    const zip = new AdmZip(await fs.readFile(path.join(root, 'maps', map.filename)));
    map.difficultyStats = [];
    for (const e of zip.getEntries().filter(e => /\.osu$/i.test(e.entryName))) {
      if (e.header.size > 16 * 1024 ** 2) throw new Error(`${map.filename}: .osu entry too large`);
      const data = e.getData(), diff = parseDifficulty(data);
      const rating = await calculator.calculate(data, diff.mode);
      Object.assign(diff, rating.normal);
      diff.dt = { ...dtStats(diff), ...rating.dt };
      map.difficultyStats.push(diff);
    }
    map.difficultyStats.sort((a, b) => a.mode - b.mode || (a.stars ?? Infinity) - (b.stars ?? Infinity) || a.od - b.od || a.name.localeCompare(b.name));
    map.difficulties = map.difficultyStats.map(d => d.name);
    const backgrounds = map.difficultyStats.map(d => d.background).filter(Boolean);
    for (const name of backgrounds) {
      const normalized = path.posix.normalize(name.replaceAll('\\', '/')).replace(/^\.\//, '').toLowerCase();
      const entry = zip.getEntries().find(e => e.entryName.replaceAll('\\', '/').toLowerCase() === normalized);
      if (!entry || entry.header.size > 30 * 1024 ** 2) continue;
      try {
        const image = entry.getData(), file = `${createHash('sha256').update(image).digest('hex').slice(0, 20)}.webp`;
        await sharp(image, { limitInputPixels: 50000000 }).rotate().resize(240, 150, { fit: 'cover' }).webp({ quality: 72 }).toFile(path.join(covers, file));
        map.background = `covers/${file}`; break;
      } catch (error) { console.warn(`Background skipped: ${map.filename}: ${error.message}`); }
    }
    for (const diff of map.difficultyStats) delete diff.background;
    if (++processed % 50 === 0) console.log(`Read metadata ${processed}/${catalog.maps.length}`);
  }
  const maps = new Map(catalog.maps.map(m => [m.key, m]));
  for (const collection of catalog.collections) collection.maps = collection.maps.map(m => maps.get(m.key) || m);
  return catalog;
  } finally { calculator.close(); }
}

if (process.argv[1] === path.resolve('scripts/metadata.mjs')) {
  const catalog = JSON.parse(await fs.readFile('data/catalog.json', 'utf8'));
  await enrichCatalog(process.cwd(), catalog);
  await fs.writeFile('data/catalog.json', JSON.stringify(catalog, null, 2) + '\n');
  console.log(`Updated metadata for ${catalog.maps.length} mapsets`);
}
