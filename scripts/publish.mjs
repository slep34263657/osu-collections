import fs from 'node:fs/promises';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { build } from './build.mjs';

const gh = args => execFileSync('gh', args, { stdio: 'inherit', shell: false });
const config = JSON.parse(await fs.readFile('site.config.json', 'utf8'));
if (!/^[\w.-]+\/[\w.-]+$/.test(config.downloadRepository)) throw new Error('Set downloadRepository to owner/repository');
if (!process.argv.includes('--skip-build')) await build();
const repo = config.downloadRepository, tag = config.releaseTag;
const files = (await fs.readdir('artifacts')).sort();
if (!files.length) { console.log('No files to upload. Add .osdb files to collections/ and .osz files to maps/.'); process.exit(0); }
if (files.length > 1000) throw new Error('This library exceeds GitHub’s 1000 assets per release; split it before publishing');
try { execFileSync('gh', ['release', 'view', tag, '--repo', repo], { stdio: 'ignore' }); }
catch { gh(['release', 'create', tag, '--repo', repo, '--title', 'Beatmap library', '--notes', 'Beatmaps and collection packs']); }
const existing = JSON.parse(execFileSync('gh', ['release', 'view', tag, '--repo', repo, '--json', 'assets'], { encoding: 'utf8' })).assets;
const run = promisify(execFile);
let next = 0, completed = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
  while (next < files.length) {
    const file = files[next++], size = (await fs.stat(`artifacts/${file}`)).size;
    if (!file.startsWith('map-') || !existing.some(a => a.name === file && a.size === size)) {
      for (let attempt = 1; ; attempt++) {
        try { await run('gh', ['release', 'upload', tag, `artifacts/${file}`, '--repo', repo, '--clobber']); break; }
        catch (error) { if (attempt === 3) throw error; console.log(`Retrying ${file}`); }
      }
    }
    completed++; if (completed % 25 === 0 || completed === files.length) console.log(`Uploaded ${completed}/${files.length}`);
  }
}));
console.log('Downloads published. Commit and push data/catalog.json to update the site.');
