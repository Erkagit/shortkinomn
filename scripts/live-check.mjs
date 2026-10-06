// Explicitly opt in: this script sends a short synthetic sample to paid providers.
// Run: node --import tsx scripts/live-check.mjs --run-paid
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { mediaEnv } from './media-env.mjs';

if (!process.argv.includes('--run-paid')) throw Error('Add --run-paid to authorize the short live API check.');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile(path.join(root, 'apps/api/.env'));
process.env.PROVIDER_MODE = 'live';
Object.assign(process.env, mediaEnv());
const { config } = await import('../apps/api/src/config.ts');
const { stt, translate, checkTts, tts } = await import('../apps/api/src/providers.ts');
const { ff, duration } = await import('../apps/api/src/media.ts');
const reportRoot = path.join(root, 'data/live-check');
await fs.mkdir(reportRoot, { recursive: true });
const report = { checkedAt: new Date().toISOString(), models: { translation: config.translationModel, stt: config.sttModel, tts: config.ttsModel }, checks: {} };
function safeError(error) {
  let message = error instanceof Error ? error.message : String(error);
  for (const key of [config.openai, config.eleven]) if (key) message = message.replaceAll(key, '[redacted]');
  return message.slice(0, 1000);
}
async function check(name, work) {
  try { const result = await work(); report.checks[name] = { ok: true, ...result }; console.log(name + ': PASS ' + JSON.stringify(result)); return result; }
  catch (error) { report.checks[name] = { ok: false, error: safeError(error) }; console.log(name + ': FAIL ' + safeError(error)); return null; }
}
// A local system voice provides known, non-personal English speech for STT.
const source = path.join(reportRoot, 'source.wav');
try { await fs.access(source); } catch {
  if (process.platform !== 'win32') throw Error('Place a short synthetic English speech sample at data/live-check/source.wav.');
  const command = `Add-Type -AssemblyName System.Speech; $speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer; $speaker.SetOutputToWaveFile('${source.replaceAll("'", "''")}'); $speaker.Speak('Hello. We are testing the video translation.'); $speaker.Dispose()`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', command], { windowsHide: true, encoding: 'utf8', timeout: 15000 });
  if (result.status !== 0) throw Error('Could not create synthetic speech sample.');
}
await ff('-i', source, '-ac', '1', '-ar', '16000', path.join(reportRoot, 'speech.wav'));
const seconds = await duration(source);
await check('ElevenLabs STT', async () => {
  const segments = await stt(reportRoot, seconds);
  if (!segments.length) throw Error('No speech was recognized.');
  await fs.writeFile(path.join(reportRoot, 'transcript.json'), JSON.stringify(segments, null, 2));
  return { segments: segments.length, transcript: segments.map(s => s.source).join(' ') };
});
// Translate a known source independently, so one provider cannot hide the other's failure.
let translated;
await check('OpenAI translation', async () => {
  const segment = { id: 'live-check-1', start: 0, end: 5, speaker: 'speaker_0', source: 'Hello. We are testing the video translation.', target: '', flags: [] };
  const job = { context: { synopsis: 'A synthetic software test, not a movie scene.', characters: '', glossary: [] }, outputMode: 'subtitles' };
  const result = await translate(job, [segment], [], [], reportRoot);
  translated = result.lines[0].text;
  return { text: translated, needsReview: result.lines[0].needsReview };
});
const supported = process.argv.includes('--with-dubbing') && await check('ElevenLabs model support', async () => { await checkTts(); return { mongolian: true }; });
if (supported && translated) {
  await check('ElevenLabs TTS', async () => {
    const response = await fetch('https://api.elevenlabs.io/v2/voices?page_size=20', { headers: { 'xi-api-key': config.eleven }, signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw Error(`Voices HTTP ${response.status}. Enable voices_read on the API key.`);
    const payload = await response.json();
    const voice = payload.voices?.find(v => v.category === 'premade');
    if (!voice) throw Error('No stock voice available; choose an authorized voice ID in the studio.');
    const file = await tts(translated, voice.voice_id, reportRoot, 5);
    await fs.copyFile(file, path.join(reportRoot, 'mongolian.wav'));
    await ff('-f', 'lavfi', '-i', 'color=c=0x151922:s=360x640:r=25', '-i', file, '-shortest', '-c:v', 'libx264', '-preset', 'fast', '-c:a', 'aac', '-pix_fmt', 'yuv420p', path.join(reportRoot, 'preview.mp4'));
    return { voice: voice.name, seconds: await duration(file), preview: 'data/live-check/preview.mp4' };
  });
}
await check('Production automatic subtitles', async () => {
  const sample = path.join(reportRoot, 'input.mp4');
  await ff('-f', 'lavfi', '-i', 'color=c=0x151922:s=360x640:r=25', '-i', source, '-shortest', '-c:v', 'libx264', '-preset', 'fast', '-c:a', 'aac', '-pix_fmt', 'yuv420p', sample);
  const isolatedData = path.join(reportRoot, 'api-' + Date.now());
  const password = randomUUID();
  const child = spawn(process.execPath, ['dist/server.js'], {
    cwd: path.join(root, 'apps/api'), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: 'production', PROVIDER_MODE: 'live', PORT: '4021', DATA_DIR: isolatedData, DATABASE_PATH: path.join(isolatedData, 'test.sqlite'), ADMIN_EMAIL: 'live-check@example.test', ADMIN_PASSWORD: password }
  });
  child.stdout.on('data', () => {}); child.stderr.on('data', () => {});
  const base = 'http://127.0.0.1:4021/api';
  let cookie = '';
  async function request(url, options = {}) {
    return fetch(base + url, { ...options, headers: { 'x-mn-dub': '1', cookie, ...options.headers }, signal: AbortSignal.timeout(20000) });
  }
  async function api(url, data, method = 'POST') {
    const response = await request(url, data ? { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {});
    const result = await response.json(); if (!response.ok) throw Error(`${url} HTTP ${response.status}: ${result.error}`); return result;
  }
  try {
    for (let i = 0; i < 60; i++) { try { if ((await request('/auth/me')).ok) break; } catch {} await new Promise(r => setTimeout(r, 250)); }
    const login = await request('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'live-check@example.test', password }) });
    assert.equal(login.status, 200); cookie = login.headers.get('set-cookie').split(';')[0];
    assert.ok(login.headers.get('set-cookie').includes('Secure'));
    const health = await api('/health'); assert.equal(health.mode, 'live'); assert.ok(health.ffmpeg && health.ffprobe);
    const movie = await api('/admin/movies', { title_mn: 'Live subtitle check', slug: 'live-subtitle-check', year: 2026, price: 0, status: 'DRAFT' });
    const episode = await api('/admin/episodes', { movie_id: movie.id, episode_number: 1, title: 'Synthetic sample' });
    const form = new FormData();form.set('episodeId', episode.id);form.set('outputMode', 'subtitles');form.set('background', 'none');form.set('video', new Blob([await fs.readFile(sample)], { type: 'video/mp4' }), 'live-check.mp4');
    const upload = await request('/jobs', { method: 'POST', body: form });assert.equal(upload.status, 201);const created = await upload.json();
    assert.equal((await request(`/jobs/${created.id}/render`, { method: 'POST' })).status, 409, 'Subtitle jobs do not call TTS');
    await api(`/jobs/${created.id}/subtitle_auto`, {});
    let job;
    for (let i = 0; i < 180; i++) {
      job = await api(`/jobs/${created.id}`);
      if (job.status === 'failed') throw Error(job.error);
      if (job.outputs?.subtitles && !job.busy) break;
      await new Promise(r => setTimeout(r, 1000));
    }
    assert.ok(job.outputs.subtitles, 'Subtitle preview exists');
    assert.equal(job.translationReviewed, false, 'Automatic output has not been approved by a human');
    const blocked = await request(`/admin/episodes/${episode.id}/publish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId: job.id, version: 'subtitles', approved: true }) });assert.equal(blocked.status, 409);
    const preview = await request(`/jobs/${job.id}/files/subtitle-preview.mp4`);assert.equal(preview.status, 200);
    const vtt = await request(`/jobs/${job.id}/files/preview.mn.vtt`);assert.equal(vtt.status, 200);
    await fs.writeFile(path.join(reportRoot, 'subtitle-preview.mp4'), Buffer.from(await preview.arrayBuffer()));
    await fs.writeFile(path.join(reportRoot, 'preview.mn.vtt'), await vtt.text());
    const srt = await request(`/jobs/${job.id}/files/translated.mn.srt`);await fs.writeFile(path.join(reportRoot, 'translated.mn.srt'), await srt.text());
    const transcript = job.segments.map(s => ({ source: s.source, target: s.target }));
    return { mode: health.mode, segments: job.segments.length, transcript, reviewRequired: true, published: false, preview: 'data/live-check/subtitle-preview.mp4' };
  } finally { if (child.exitCode === null) { child.kill(); await once(child, 'exit'); } }
});
await fs.writeFile(path.join(reportRoot, 'report.json'), JSON.stringify(report, null, 2));
console.log('Report: data/live-check/report.json');
if (Object.values(report.checks).some(c => !c.ok)) process.exitCode = 1;
