import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import AdmZip from 'adm-zip';

function encode(input, output, start) {
  return new Promise((resolve, reject) => {
    const process = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-ss', String(start), '-i', input, '-t', '30', '-vn', '-af', 'afade=t=in:d=0.2,afade=t=out:st=29:d=1', '-c:a', 'libmp3lame', '-b:a', '96k', '-ar', '44100', '-y', output], { windowsHide: true });
    let error = ''; process.stderr.on('data', data => { error += data; });
    process.on('error', reject); process.on('close', code => code === 0 ? resolve() : reject(new Error(error.trim() || `Audio conversion failed (${code})`)));
  });
}

export async function enrichAudio(root, catalog) {
  const output = path.join(root, 'data/previews'); await fs.mkdir(output, { recursive: true });
  let next = 0, completed = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < catalog.maps.length) {
      const map = catalog.maps[next++];
      const zip = new AdmZip(await fs.readFile(path.join(root, 'maps', map.filename)));
      const file = zip.getEntries().find(e => /\.osu$/i.test(e.entryName));
      const text = file?.getData().toString('utf8') || '';
      const filename = text.match(/^AudioFilename\s*:[ \t]*(.+)$/m)?.[1].trim().replace(/^"|"$/g, '').replaceAll('\\', '/');
      const entry = filename && zip.getEntries().find(e => e.entryName.replaceAll('\\', '/').toLowerCase() === filename.toLowerCase());
      if (entry && entry.header.size < 100 * 1024 ** 2) {
        const audio = entry.getData();
        const previewTime = Number(text.match(/^PreviewTime\s*:[ \t]*(-?\d+)/m)?.[1] ?? -1);
        const start = previewTime >= 0 ? previewTime / 1000 : Math.max(0, (map.difficultyStats?.[0]?.length || 60) / 2 - 15);
        const key = createHash('sha256').update(audio).update(`30s-96k-${start}`).digest('hex').slice(0, 20);
        const target = path.join(output, `${key}.mp3`);
        let exists = false;
        try { exists = (await fs.stat(target)).size > 1000; } catch (error) { if (error.code !== 'ENOENT') throw error; }
        if (!exists) {
          const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'osu-preview-'));
          try {
            const source = path.join(temp, `audio${path.extname(entry.entryName)}`); await fs.writeFile(source, audio);
            await encode(source, target, start);
            if ((await fs.stat(target)).size < 1000) await encode(source, target, 0);
            if ((await fs.stat(target)).size < 1000) throw new Error(`${map.filename}: no playable preview audio`);
          } finally { await fs.rm(temp, { recursive: true, force: true }); }
        }
        map.preview = `previews/${key}.mp3`;
      }
      if (++completed % 50 === 0) console.log(`Prepared previews ${completed}/${catalog.maps.length}`);
    }
  }));
  const maps = new Map(catalog.maps.map(m => [m.key, m]));
  for (const collection of catalog.collections) collection.maps = collection.maps.map(m => maps.get(m.key) || m);
}

if (process.argv[1] === path.resolve('scripts/audio.mjs')) {
  const catalog = JSON.parse(await fs.readFile('data/catalog.json', 'utf8'));
  await enrichAudio(process.cwd(), catalog);
  await fs.writeFile('data/catalog.json', JSON.stringify(catalog, null, 2) + '\n');
  console.log(`Audio previews ready for ${catalog.maps.filter(m => m.preview).length} mapsets`);
}
