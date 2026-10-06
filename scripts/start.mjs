import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mediaEnv } from './media-env.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(root, 'apps/api/.env');
try {
  await fs.access(envFile);
  process.loadEnvFile(envFile);
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const requiredEnv = ['OPENAI_API_KEY', 'ELEVENLABS_API_KEY'];
if (process.env.RENDER === 'true') requiredEnv.push('ADMIN_EMAIL', 'ADMIN_PASSWORD');
for (const key of requiredEnv) {
  if (!process.env[key]?.trim()) throw new Error(`Missing required environment variable: ${key}`);
}
if (process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.length < 10) {
  throw new Error('ADMIN_PASSWORD must be at least 10 characters long.');
}

await Promise.all(['apps/api/dist/server.js', 'apps/web/.next/BUILD_ID'].map(file => fs.access(path.join(root, file))));

const onRender = process.env.RENDER === 'true';
const webPort = Number(onRender ? process.env.PORT || process.env.WEB_PORT || 3000 : process.env.WEB_PORT || 3000);
const apiPort = Number(process.env.API_PORT || (onRender ? 4000 : process.env.PORT || 4000));
const internalApiUrl = process.env.API_INTERNAL_URL || `http://127.0.0.1:${apiPort}`;
const baseEnv = mediaEnv();
const apiEnv = { ...baseEnv, NODE_ENV: 'production', PROVIDER_MODE: 'live', PORT: String(apiPort), API_PORT: String(apiPort) };
const webEnv = { ...baseEnv, NODE_ENV: 'production', PORT: String(webPort), API_INTERNAL_URL: internalApiUrl };
const children = [];
let closing = false;
let shutdown;

function stop(code = 0) {
  if (shutdown) return shutdown;
  closing = true;
  process.exitCode = code;
  shutdown = Promise.all(children.map(child => {
    if (child.exitCode !== null) return Promise.resolve();
    return new Promise(resolve => {
      const forceKill = setTimeout(() => child.kill('SIGKILL'), 10_000);
      child.once('exit', () => { clearTimeout(forceKill); resolve(); });
      child.kill('SIGTERM');
    });
  }));
  return shutdown;
}

function run(args, cwd, env) {
  const child = spawn(process.execPath, args, { cwd: path.join(root, cwd), env, stdio: 'inherit', windowsHide: true });
  children.push(child);
  child.on('error', error => { console.error(`Could not start ${args[0]}: ${error.message}`); void stop(1); });
  child.on('exit', code => { if (!closing) void stop(code === 0 ? 1 : code ?? 1); });
}

process.once('SIGINT', () => { void stop(0); });
process.once('SIGTERM', () => { void stop(0); });

run(['dist/server.js'], 'apps/api', apiEnv);
run([path.join(root, 'node_modules/next/dist/bin/next'), 'start', '--hostname', '0.0.0.0', '--port', String(webPort)], 'apps/web', webEnv);
console.log(`Shortkino production: web :${webPort}, internal API :${apiPort}`);
