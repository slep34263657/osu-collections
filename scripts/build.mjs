import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import AdmZip from 'adm-zip';
import { parseOsdb } from './collections.mjs';
import { writePacks } from './packs.mjs';
import { enrichCatalog } from './metadata.mjs';
import { enrichAudio } from './audio.mjs';
import { writeCollectionPages } from './routes.mjs';

export async function build(root = process.cwd(), fromCatalog = false) {
  const config = JSON.parse(await fs.readFile(path.join(root, 'site.config.json'), 'utf8'));
  const out = path.join(root, 'dist'), artifacts = path.join(root, 'artifacts/releases');
  await fs.mkdir(out, { recursive: true });
  if (fromCatalog) {
    await fs.cp(path.join(root, 'web'), out, { recursive: true });
    await fs.copyFile(path.join(root, 'data/catalog.json'), path.join(out, 'catalog.json'));
    await writeCollectionPages(out, JSON.parse(await fs.readFile(path.join(root, 'data/catalog.json'), 'utf8')));
    try { await fs.cp(path.join(root, 'data/covers'), path.join(out, 'covers'), { recursive: true }); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    try { await fs.cp(path.join(root, 'data/previews'), path.join(out, 'previews'), { recursive: true }); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    console.log('Built site from published catalog'); return;
  }
  await fs.mkdir(artifacts, { recursive: true });
  await fs.rm(out, { recursive: true, force: true }); await fs.rm(artifacts, { recursive: true, force: true });
  await fs.cp(path.join(root, 'web'), out, { recursive: true }); await fs.mkdir(artifacts);
  const base = `https://github.com/${config.downloadRepository}/releases/download/${encodeURIComponent(config.releaseTag)}/`;
  const link = name => base + encodeURIComponent(name);
  const byHash = new Map(), bySet = new Map(), byId = new Map(), sets = [];
  for (const file of (await fs.readdir(path.join(root, 'maps'))).filter(f => /\.osz$/i.test(f)).sort()) {
    let bytes = await fs.readFile(path.join(root, 'maps', file));
    if (bytes.length >= 2 * 1024 ** 3) throw new Error(`${file}: GitHub release files must be under 2 GiB`);
    const zip = new AdmZip(bytes), diffs = [];
    for (const entry of zip.getEntries().filter(e => /\.osu$/i.test(e.entryName))) {
      if (entry.header.size > 16 * 1024 ** 2) throw new Error(`${file}: .osu entry too large`);
      const data = entry.getData(), text = data.toString('utf8');
      const field = key => text.match(new RegExp(`^${key}\\s*:[ \\t]*(.*)$`, 'm'))?.[1].trim() || '';
      diffs.push({ hash: createHash('md5').update(data).digest('hex'), id: Number(field('BeatmapID')) || -1, setId: Number(field('BeatmapSetID')) || -1, artist: field('Artist'), title: field('Title'), creator: field('Creator'), difficulty: field('Version') });
    }
    if (!diffs.length) throw new Error(`${file}: no .osu difficulties found`);
    const videos = zip.getEntries().filter(e => /\.(?:mp4|avi|flv|mov|mkv|webm|wmv|m4v|mpg|mpeg|ogv)$/i.test(e.entryName));
    for (const entry of videos) zip.deleteFile(entry.entryName);
    if (videos.length) { bytes = zip.toBuffer(); console.log(`Removed ${videos.length} video file(s): ${file}`); }
    const asset = `map-${createHash('sha256').update(bytes).digest('hex').slice(0, 20)}.osz`;
    await fs.writeFile(path.join(artifacts, asset), bytes);
    const set = { ...diffs[0], key: asset, asset, filename: file, bytes: bytes.length, download: link(asset), difficulties: diffs.map(d => d.difficulty) };
    const existing = sets.find(map => map.key === asset);
    if (!existing) sets.push(set);
    for (const d of diffs) { byHash.set(d.hash, existing || set); if (d.id > 0) byId.set(d.id, existing || set); if (d.setId > 0) bySet.set(d.setId, existing || set); }
  }
  const collections = [];
  for (const file of (await fs.readdir(path.join(root, 'collections'))).filter(f => /\.osdb$/i.test(f)).sort()) {
    const buffer = await fs.readFile(path.join(root, 'collections', file));
    const sourceId = createHash('sha256').update(file).digest('hex').slice(0, 12);
    const sourceAsset = `collection-${sourceId}.osdb`;
    await fs.writeFile(path.join(artifacts, sourceAsset), buffer);
    let parsed;
    try { parsed = parseOsdb(buffer); } catch (error) { throw new Error(`${file}: ${error.message}`); }
    for (const [index, collection] of parsed.entries()) {
      const id = `${sourceId}-${index}`, matched = new Map(), missing = new Map();
      for (const map of collection.maps) {
        const set = byHash.get(map.hash) || byId.get(map.id) || bySet.get(map.setId);
        if (set) matched.set(set.key, set);
        else { const key = map.setId > 0 ? `set-${map.setId}` : map.hash || `id-${map.id}`; missing.set(key, { ...map, key, title: map.title || 'Unavailable map', difficulties: map.difficulty ? [map.difficulty] : [] }); }
      }
      const assets = await writePacks([...matched.values()], { artifacts, id, sourceAsset, buffer });
      const packSizes = await Promise.all(assets.map(async asset => (await fs.stat(path.join(artifacts, asset))).size));
      const packs = assets.map(link);
      collections.push({ id, name: collection.name, source: file, collectionDownload: link(sourceAsset), pack: packs.length === 1 ? packs[0] : null, packs, packSizes, available: matched.size, missing: missing.size, maps: [...matched.values(), ...missing.values()] });
    }
  }
  const catalog = { title: config.title, maps: sets, collections };
  await enrichCatalog(root, catalog);
  await enrichAudio(root, catalog);
  await fs.cp(path.join(root, 'data/covers'), path.join(out, 'covers'), { recursive: true });
  await fs.cp(path.join(root, 'data/previews'), path.join(out, 'previews'), { recursive: true });
  await fs.writeFile(path.join(out, 'catalog.json'), JSON.stringify(catalog));
  await writeCollectionPages(out, catalog);
  await fs.mkdir(path.join(root, 'data'), { recursive: true });
  await fs.writeFile(path.join(root, 'data/catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
  console.log(`Built ${sets.length} mapsets and ${collections.length} collections`);
  return catalog;
}
if (process.argv[1] === path.resolve('scripts/build.mjs')) await build(process.cwd(), process.argv.includes('--catalog'));
