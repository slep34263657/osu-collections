import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createInterface } from 'node:readline';

export async function officialCalculator() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const portable = path.join(root, 'artifacts/dotnet10/dotnet.exe');
  let dotnet = 'dotnet';
  if (process.platform === 'win32') { try { await fs.access(portable); dotnet = portable; } catch {} }
  const project = path.join(root, 'scripts/calculator/Calculator.csproj');
  const version = (await fs.readFile(project, 'utf8')).match(/Version="([^"]+)"/)?.[1];
  const output = path.join(root, 'artifacts/calculator');
  await promisify(execFile)(dotnet, ['build', project, '-c', 'Release', '-o', output, '--nologo', '-v', 'quiet'], { windowsHide: true, maxBuffer: 4 * 1024 ** 2 });
  const child = spawn(dotnet, [path.join(output, 'Calculator.dll')], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const waiting = []; let stderr = '', failure;
  const fail = error => { failure = error; for (const job of waiting.splice(0)) job.reject(error); };
  child.stderr.on('data', data => { stderr = (stderr + data).slice(-8000); });
  child.on('error', fail);
  child.on('exit', code => { if (waiting.length) fail(new Error(stderr || `Official calculator exited (${code})`)); });
  child.stdin.on('error', fail);
  createInterface({ input: child.stdout }).on('line', line => {
    const job = waiting.shift(); if (!job) return;
    try { const result = JSON.parse(line); if (result.error) throw new Error(result.error); job.resolve(result); } catch (error) { job.reject(error); }
  });
  return {
    version,
    calculate(data, mode) {
      if (failure) return Promise.reject(failure);
      return new Promise((resolve, reject) => {
        waiting.push({ resolve, reject }); child.stdin.write(JSON.stringify({ data: data.toString('base64'), mode }) + '\n');
      });
    },
    close() { child.stdin.end(); }
  };
}
