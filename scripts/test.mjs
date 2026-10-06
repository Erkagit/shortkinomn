import { spawn } from 'node:child_process';
import { mediaEnv } from './media-env.mjs';
const child = spawn(process.execPath, ['--import', 'tsx', '--test', 'test/*.test.ts'], { cwd: new URL('../apps/api/', import.meta.url), env: mediaEnv(), stdio: 'inherit', windowsHide: true });
child.on('exit', code => { process.exitCode = code ?? 1; });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
