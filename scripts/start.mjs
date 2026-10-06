// Run the existing compiled API and Next production server on this machine.
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mediaEnv } from './media-env.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile(path.join(root, 'apps/api/.env'));
for (const key of ['OPENAI_API_KEY', 'ELEVENLABS_API_KEY']) {
  if (!process.env[key]?.trim()) throw Error(`${key} is missing from apps/api/.env.`);
}
await Promise.all(['apps/api/dist/server.js', 'apps/web/.next/BUILD_ID'].map(file => fs.access(path.join(root, file))));
const apiPort = Number(process.env.PORT || 4000);
const webPort = Number(process.env.WEB_PORT || 3000);
const env = { ...mediaEnv(), NODE_ENV: 'production', PROVIDER_MODE: 'live', WEB_ORIGIN: process.env.WEB_ORIGIN || `http://localhost:${webPort}`, API_INTERNAL_URL: `http://127.0.0.1:${apiPort}` };
const children = [];
let closing = false;
function stop(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of children) if (child.exitCode === null) child.kill();
  process.exitCode = code;
}
function run(args, cwd) {
  const child = spawn(process.execPath, args, { cwd: path.join(root, cwd), env, stdio: 'inherit', windowsHide: true });
  children.push(child);
  child.on('error', error => { console.error(error.message); stop(1); });
  child.on('exit', code => { if (!closing) stop(code || 1); });
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
run(['dist/server.js'], 'apps/api');
run([path.join(root, 'node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', String(webPort)], 'apps/web');
console.log(`shortkinomn production: http://localhost:${webPort} | API ${apiPort} | live providers`);
