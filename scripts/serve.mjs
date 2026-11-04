import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { build } from './build.mjs';
await build(process.cwd(), process.argv.includes('--catalog'));
const root = path.resolve('dist');
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.mp3': 'audio/mpeg' };
http.createServer(async (req, res) => {
  try {
    const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let target = path.resolve(root, `.${name === '/' ? '/index.html' : name}`);
    if (!target.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    if ((await fs.stat(target)).isDirectory()) target = path.join(target, 'index.html');
    const data = await fs.readFile(target); res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream' }); res.end(data);
  } catch { res.writeHead(404).end('Not found'); }
}).listen(4173, '127.0.0.1', () => console.log('Local: http://127.0.0.1:4173'));
