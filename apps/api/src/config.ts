import dotenv from 'dotenv';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const bundledFfmpeg=require('ffmpeg-static') as string|null;
const bundledFfprobe=(require('@ffprobe-installer/ffprobe') as {path:string}).path;
export const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({path:path.join(apiRoot,'.env'), quiet:true});
if (process.env.NODE_ENV === 'production') {
  if (process.env.PROVIDER_MODE !== 'live') throw new Error('Production requires PROVIDER_MODE=live.');
  const missing = ['OPENAI_API_KEY', 'ELEVENLABS_API_KEY'].find(key => !process.env[key]?.trim());
  if (missing) throw new Error(`Missing required environment variable: ${missing}`);
  if (process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.length < 10) throw new Error('ADMIN_PASSWORD must be at least 10 characters long.');
}
export const config = {
  mode: process.env.PROVIDER_MODE === 'live' ? 'live' as const : 'demo' as const,
  port: Number(process.env.API_PORT || process.env.PORT || 4000),
  origin: process.env.WEB_ORIGIN || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000',
  data: process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.resolve(apiRoot,'../../data'),
  ffmpeg: process.env.FFMPEG_PATH || bundledFfmpeg || 'ffmpeg', ffprobe: process.env.FFPROBE_PATH || bundledFfprobe,
  openai: process.env.OPENAI_API_KEY || '', eleven: process.env.ELEVENLABS_API_KEY || '',
  translationModel: process.env.TRANSLATION_MODEL || 'gpt-4o-2024-08-06',
  sttModel: process.env.STT_MODEL || 'scribe_v2', ttsModel: process.env.TTS_MODEL || 'eleven_v4',
  maxSeconds:180, maxBytes:200*1024*1024
};
