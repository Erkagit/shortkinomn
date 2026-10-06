// Isolated integration test. Never calls paid providers or touches real data.
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { mediaEnv } from './media-env.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'duulav-platform-'));
const port = 4019, base = `http://127.0.0.1:${port}/api`;
const env = { ...mediaEnv(), PROVIDER_MODE: 'demo', NODE_ENV: 'test', PORT: String(port), DATA_DIR: temp, DATABASE_PATH: path.join(temp, 'test.sqlite'), ADMIN_EMAIL: 'admin@example.test', ADMIN_PASSWORD: 'test-admin-password-123', PAYMENT_INSTRUCTIONS: 'TEST ONLY: verify externally, use purchase ID as reference.' };
const child = spawn(process.execPath, ['dist/server.js'], { cwd: path.join(root, 'apps/api'), env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
let adminCookie = '', userCookie = '', secondCookie = '', jobId = '';
const body = value => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
async function request(url, options = {}, cookie = adminCookie) {
  return fetch(base + url, { ...options, headers: { 'x-mn-dub': '1', ...(cookie ? { cookie } : {}), ...options.headers } });
}
async function api(url, options = {}, cookie = adminCookie) {
  const response = await request(url, options, cookie);
  const data = await response.json();
  assert.ok(response.ok, `${response.status} ${url}: ${JSON.stringify(data)}`);
  return data;
}
async function auth(url, data) {
  const response = await request(url, body(data), ''); assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie'); assert.ok(cookie.includes('HttpOnly')); assert.ok(cookie.includes('SameSite=Lax'));
  return cookie.split(';')[0];
}
async function waitFor(status) {
  const until = Date.now() + 60000;
  while (Date.now() < until) { const j = await api('/jobs/' + jobId); if (j.status === 'failed') throw Error(j.error); if (j.status === status && !j.busy) return j; await new Promise(r => setTimeout(r, 150)); }
  throw Error('Processing timeout');
}
async function save(j, patch) {
  const { revision, segments, context, voices, transcriptReviewed, translationReviewed, bedReviewed } = j;
  return api('/jobs/' + jobId, { ...body({ revision, segments, context, voices, transcriptReviewed, translationReviewed, bedReviewed, ...patch }), method: 'PATCH' });
}
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('API startup timeout')), 15000);
    child.once('error', reject); child.once('exit', code => { clearTimeout(timer); reject(Error('API exited ' + code)); });
    child.stderr.on('data', d => process.stderr.write(d)); child.stdout.on('data', d => { if (String(d).includes('API http')) { clearTimeout(timer); resolve(); } });
  });
  assert.equal((await request('/admin/movies', {}, '')).status, 401);
  assert.equal((await request('/jobs', {}, '')).status, 401);
  assert.equal((await request('/health', {}, '')).status, 401);
  assert.equal((await fetch(base + '/auth/login', { method: 'POST' })).status, 403);
  assert.equal((await request('/auth/login', { ...body({}), headers: { origin: 'https://evil.test' } }, '')).status, 403);
  adminCookie = await auth('/auth/login', { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD });
  userCookie = await auth('/auth/register', { email: 'viewer@example.test', name: 'Viewer', password: 'test-viewer-password', role: 'ADMIN' });
  secondCookie = await auth('/auth/register', { email: 'second@example.test', name: 'Second', password: 'test-viewer-password' });
  assert.equal((await api('/auth/me', {}, userCookie)).role, 'USER');
  assert.equal((await request('/admin/movies', {}, userCookie)).status, 403);
  assert.equal((await request('/jobs', {}, userCookie)).status, 403);
  const category = await api('/admin/categories', body({ name: 'Романтик', slug: 'romance' }));
  const genre = await api('/admin/genres', body({ name: 'Mystery', slug: 'mystery' }));
  const movieData = { title_mn: 'Туршилтын түүх', title_original: 'Test Story', slug: 'test-story', description: 'Integration test only', year: 2026, price: 9900, total_episodes: 6, category_ids: [category.id], genre_ids: [genre.id], featured: true, trending: true, new_release: true, status: 'DRAFT' };
  const movie = await api('/admin/movies', body(movieData));
  assert.equal((await api('/catalog/movies', {}, '')).total, 0);
  assert.equal((await request('/catalog/movies/test-story', {}, '')).status, 404);
  const free = await api('/admin/episodes', body({ movie_id: movie.id, episode_number: 1, title: 'Эхлэл' }));
  const paid = await api('/admin/episodes', body({ movie_id: movie.id, episode_number: 6, title: 'Үргэлжлэл' }));
  assert.equal((await api('/admin/episodes')).find(e => e.id === free.id).is_free, 1);
  assert.equal((await api('/admin/episodes')).find(e => e.id === paid.id).is_free, 0);
  await api(`/admin/movies/${movie.id}`, { ...body({ ...movieData, status: 'PUBLISHED' }), method: 'PUT' });
  assert.equal((await api('/catalog/movies?q=Mystery', {}, '')).total, 1);
  assert.equal((await api('/catalog/movies?category=romance', {}, '')).total, 1);
  assert.equal((await api('/catalog/home', {}, '')).featured.id, movie.id);
  const health = await api('/health'); assert.equal(health.mode, 'demo'); assert.equal(health.ffmpeg, true);
  const bytes = await fs.readFile(path.join(root, 'data/demo-input.mp4'));
  async function upload(episodeId) {
    const form = new FormData(); form.set('video', new Blob([bytes], { type: 'video/mp4' }), 'demo-input.mp4'); form.set('background', 'none'); form.set('outputMode', 'dubbed'); form.set('episodeId', episodeId);
    return api('/jobs', { method: 'POST', body: form });
  }
  const bad = new FormData(); bad.set('video', new Blob(['fake'], { type: 'text/plain' }), 'fake.mp4'); bad.set('episodeId', free.id); bad.set('background', 'none');
  assert.equal((await request('/jobs', { method: 'POST', body: bad })).status, 400);
  for (const target of [free, paid]) {
    let job = await upload(target.id); jobId = job.id;
    const uploadedDetails = await api('/jobs/' + jobId);
    assert.equal(uploadedDetails.episodeId, target.id);
    assert.deepEqual(uploadedDetails.outputs, { subtitles: false, dubbed: false });
    assert.equal((await request(`/admin/episodes/${target.id}/publish`, body({ jobId, version: 'subtitles', approved: true }))).status, 409);
    await api(`/jobs/${jobId}/prepare`, { method: 'POST' }); job = await waitFor('transcript_ready');
    assert.equal(job.segments.length, 2);
    job = await save(job, { transcriptReviewed: true }); await api(`/jobs/${jobId}/translate`, { method: 'POST' }); job = await waitFor('translation_ready');
    job = await save(job, { translationReviewed: true });
    if (target.id === free.id) {
      await api(`/jobs/${jobId}/render`, { method: 'POST' }); job = await waitFor('completed');
      const range = await request(`/jobs/${jobId}/files/dubbed.mp4`, { headers: { Range: 'bytes=0-99' } }); assert.equal(range.status, 206); assert.equal((await range.arrayBuffer()).byteLength, 100);
    } else { await api(`/jobs/${jobId}/subtitles`, { method: 'POST' }); job = await waitFor('translation_ready'); }
    assert.equal(job.outputs[target.id === free.id ? 'dubbed' : 'subtitles'], true, 'Only existing reviewed output is available');
    assert.equal((await request(`/admin/episodes/${target.id}/publish`, body({ jobId, version: target.id === free.id ? 'dubbed' : 'subtitles', approved: false }))).status, 400);
    assert.equal((await request(`/admin/episodes/${target.id === free.id ? paid.id : free.id}/publish`, body({ jobId, version: 'dubbed', approved: true }))).status, 409);
    await api(`/admin/episodes/${target.id}/publish`, body({ jobId, version: target.id === free.id ? 'dubbed' : 'subtitles', approved: true }));
    if (target.id === free.id) {
      await assert.rejects(() => save({ ...job, revision: job.revision - 1 }, {}));
      job = await save(job, { segments: job.segments.map((s, i) => i === 0 ? { ...s, source: 'Changed source.' } : s) });
      assert.equal(job.segments[0].target, '');
      assert.deepEqual((await api('/jobs/' + jobId)).outputs, { subtitles: false, dubbed: false }, 'Editing invalidates generated outputs');
      assert.equal((await request(`/jobs/${jobId}/files/dubbed.mp4`)).status, 404);
      assert.equal((await request(`/stream/${free.id}/video`, {}, '')).status, 200, 'published snapshot survives editing');
    }
  }
  const detail = await api('/catalog/movies/test-story', {}, userCookie);
  assert.equal(detail.episodes.length, 2); assert.equal(detail.episodes[1].locked, true);
  assert.ok(!JSON.stringify(detail).includes('media_key'));
  const locked = await api('/watch/' + paid.id, {}, userCookie); assert.equal(locked.stream, null);
  assert.equal((await request(`/stream/${paid.id}/video`, {}, userCookie)).status, 403);
  assert.equal((await request(`/stream/${paid.id}/subtitles`, {}, userCookie)).status, 403);
  assert.equal((await request(`/progress/${paid.id}`, { ...body({ currentTime: 2 }), method: 'PUT' }, userCookie)).status, 403);
  const order = await api('/payments/checkout', body({ movieId: movie.id, amount: 1, userId: 'forged' }), userCookie);
  assert.equal((await api('/payments/checkout', body({ movieId: movie.id }), userCookie)).id, order.id);
  const payment = (await api('/admin/payments'))[0]; assert.equal(payment.amount, 9900);
  assert.equal((await request(`/admin/payments/${payment.id}/verify`, body({ transactionId: 'bank-1' }), userCookie)).status, 403);
  await api(`/admin/payments/${payment.id}/verify`, body({ transactionId: 'bank-1' }));
  await api(`/admin/payments/${payment.id}/verify`, body({ transactionId: 'bank-1' }));
  const unlocked = await api('/watch/' + paid.id, {}, userCookie); assert.ok(unlocked.stream);
  const media = await request(unlocked.stream.replace('/api', ''), { headers: { Range: 'bytes=0-99' } }, userCookie); assert.equal(media.status, 206); assert.equal((await media.arrayBuffer()).byteLength, 100);
  assert.equal((await request(`/stream/${paid.id}/video`, {}, secondCookie)).status, 403);
  assert.match(await (await request(`/stream/${paid.id}/subtitles`, {}, userCookie)).text(), /^WEBVTT/);
  await api(`/progress/${paid.id}`, { ...body({ currentTime: 2 }), method: 'PUT' }, userCookie);
  const otherSession = await auth('/auth/login', { email: 'viewer@example.test', password: 'test-viewer-password' });
  assert.equal((await api('/watch/' + paid.id, {}, otherSession)).progress.current_time, 2);
  await api(`/favorites/${movie.id}`, { ...body({ favorite: true }), method: 'PUT' }, userCookie);
  const library = await api('/library', {}, userCookie); assert.equal(library.favorites.length, 1); assert.equal(library.purchased.length, 1); assert.equal(library.progress.length, 1);
  await api(`/progress/${free.id}`, { ...body({ currentTime: 99999 }), method: 'PUT' }, userCookie);
  const completed = await api('/watch/' + free.id, {}, userCookie); assert.equal(completed.progress.current_time, completed.episode.duration); assert.equal(completed.progress.completed, 1);
  assert.equal((await api('/catalog/movies/test-story', {}, userCookie)).progress.episode_id, paid.id);
  assert.equal((await api('/library', {}, userCookie)).continueWatching[0].episode_id, paid.id);
  assert.equal((await api('/library', {}, secondCookie)).purchased.length, 0);
  await api('/auth/logout', { method: 'POST' }, userCookie); assert.equal(await api('/auth/me', {}, userCookie), null);
  await api(`/admin/movies/${movie.id}`, { method: 'DELETE' }); assert.equal((await request(`/stream/${paid.id}/video`, {}, otherSession)).status, 404);
  console.log('PASS: auth/RBAC, draft visibility, search, upload validation, subtitle+dubbing, review/publish, snapshot isolation, premium media protection, idempotent checkout, payment verification, cross-user denial, synced progress, favorites, logout and archive.');
} finally {
  if (child.exitCode === null) { child.kill(); await once(child, 'exit'); }
  const resolved = path.resolve(temp);
  if (!resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(resolved).startsWith('duulav-platform-')) throw Error('Unsafe cleanup path');
  await fs.rm(resolved, { recursive: true, force: true });
}
