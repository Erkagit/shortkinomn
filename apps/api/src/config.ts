import dotenv from 'dotenv';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({path:path.join(apiRoot,'.env'), quiet:true});
if (process.env.NODE_ENV === 'production') {
  if (process.env.PROVIDER_MODE !== 'live') throw new Error('Production requires PROVIDER_MODE=live.');
  const missing = ['OPENAI_API_KEY', 'ELEVENLABS_API_KEY'].filter(key => !process.env[key]?.trim());
  if (missing.length) throw new Error(`Missing production configuration: ${missing.join(', ')}`);
}
export const config = {
  mode: process.env.PROVIDER_MODE === 'live' ? 'live' as const : 'demo' as const,
  port: Number(process.env.PORT || 4000),
  origin: process.env.WEB_ORIGIN || 'http://localhost:3000',
  data: process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.resolve(apiRoot,'../../data'),
  ffmpeg: process.env.FFMPEG_PATH || 'ffmpeg', ffprobe: process.env.FFPROBE_PATH || 'ffprobe',
  openai: process.env.OPENAI_API_KEY || '', eleven: process.env.ELEVENLABS_API_KEY || '',
  translationModel: process.env.TRANSLATION_MODEL || 'gpt-4o-2024-08-06',
  sttModel: process.env.STT_MODEL || 'scribe_v2', ttsModel: process.env.TTS_MODEL || 'eleven_v4',
  maxSeconds:180, maxBytes:200*1024*1024
};
