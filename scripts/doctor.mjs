import {spawnSync} from 'node:child_process';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');let failed=false;
const env=path.join(root,'apps/api/.env');if(fs.existsSync(env))process.loadEnvFile(env);
const major=Number(process.versions.node.split('.')[0]);console.log(`Node ${process.version}: ${major>=22?'OK':'Node >=22 required'}`);if(major<22)failed=true;
for(const [name,bin] of [['FFmpeg',process.env.FFMPEG_PATH||'ffmpeg'],['FFprobe',process.env.FFPROBE_PATH||'ffprobe']]){const r=spawnSync(bin,['-version'],{encoding:'utf8',shell:false,timeout:5000});const ok=r.status===0;console.log(`${name}: ${ok?'OK':'MISSING; install or set absolute executable path in .env'}`);if(!ok)failed=true;}
const mode=process.env.PROVIDER_MODE==='live'?'live':'demo';console.log(`Provider mode: ${mode}`);
for(const k of ['OPENAI_API_KEY','ELEVENLABS_API_KEY'])console.log(`${k}: ${process.env[k]?'configured':'not configured'+(mode==='demo'?' (not needed for demo)':'')}`);
if(mode==='live'&&(!process.env.OPENAI_API_KEY||!process.env.ELEVENLABS_API_KEY))failed=true;
process.exitCode=failed?1:0;
