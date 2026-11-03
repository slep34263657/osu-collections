import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { build } from './build.mjs';

const gh = args => execFileSync('gh', args, { stdio: 'inherit', shell: false });
const config = JSON.parse(await fs.readFile('site.config.json', 'utf8'));
if (!/^[\w.-]+\/[\w.-]+$/.test(config.downloadRepository)) throw new Error('Set downloadRepository to owner/repository');
await build();
const repo = config.downloadRepository, tag = config.releaseTag;
const files = (await fs.readdir('artifacts')).sort();
if (!files.length) { console.log('No files to upload. Add .osdb files to collections/ and .osz files to maps/.'); process.exit(0); }
if (files.length > 1000) throw new Error('This library exceeds GitHub’s 1000 assets per release; split it before publishing');
try { execFileSync('gh', ['release', 'view', tag, '--repo', repo], { stdio: 'ignore' }); }
catch { gh(['release', 'create', tag, '--repo', repo, '--title', 'Beatmap library', '--notes', 'Beatmaps and collection packs']); }
for (const file of files) gh(['release', 'upload', tag, `artifacts/${file}`, '--repo', repo, '--clobber']);
console.log('Downloads published. Deploy dist/ to update the website.');
