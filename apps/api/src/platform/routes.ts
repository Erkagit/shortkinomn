import {subtitleFile} from '../subtitles.js';
﻿import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { all, one, execute, transaction } from './db.js';
import { admin, authenticated, HttpError, login, logout, rateLimit } from './auth.js';
import { accessible, decorate, getMovie, movieSchema, publicEpisode, type Movie, type Episode, type Taxonomy } from './catalog.js';
import { checkout, paymentProvider, settle } from './payments.js';
import { mediaStorage } from './storage.js';
import { dir, load, exists } from '../store.js';
import { isBusy } from '../workflow.js';
import { srt } from '../model.js';

export const platform = Router();
platform.get('/auth/me', (req, res) => res.json(req.user || null));
platform.post('/auth/login', rateLimit(10), (req, res) => login(req, res));
platform.post('/auth/register', rateLimit(5), (req, res) => login(req, res, true));
platform.post('/auth/logout', logout);
platform.get('/catalog/categories', (_req, res) => res.json(all<Taxonomy>('SELECT * FROM categories ORDER BY name')));
platform.get('/catalog/movies', (req, res) => {
  const query = z.object({ q: z.string().max(200).default(''), category: z.string().max(180).default(''), page: z.coerce.number().int().min(1).max(10000).default(1), sort: z.enum(['new','trending']).default('new') }).parse(req.query);
  const search = `%${query.q}%`;
  const where = `m.status='PUBLISHED' AND (unicode_lower(m.title_mn) LIKE unicode_lower(?) OR unicode_lower(m.title_original) LIKE unicode_lower(?) OR EXISTS(SELECT 1 FROM movie_categories mc JOIN categories c ON c.id=mc.category_id WHERE mc.movie_id=m.id AND unicode_lower(c.name) LIKE unicode_lower(?)) OR EXISTS(SELECT 1 FROM movie_genres mg JOIN genres g ON g.id=mg.genre_id WHERE mg.movie_id=m.id AND unicode_lower(g.name) LIKE unicode_lower(?))) AND (?='' OR EXISTS(SELECT 1 FROM movie_categories mc JOIN categories c ON c.id=mc.category_id WHERE mc.movie_id=m.id AND c.slug=?))`;
  const args = [search, search, search, search, query.category, query.category];
  const count = one<{ n: number }>(`SELECT count(*) n FROM movies m WHERE ${where}`, ...args)!.n;
  const items = all<Movie>(`SELECT m.* FROM movies m WHERE ${where} ORDER BY ${query.sort === 'trending' ? 'm.trending DESC,' : ''} m.created_at DESC,m.id LIMIT 24 OFFSET ?`, ...args, (query.page - 1) * 24).map(decorate);
  res.json({ items, total: count, page: query.page, pages: Math.ceil(count / 24) });
});
platform.get('/catalog/home', (_req, res) => {
  const rows = (filter: string) => all<Movie>(`SELECT * FROM movies WHERE status='PUBLISHED' ${filter} ORDER BY created_at DESC LIMIT 12`).map(decorate);
  res.json({ featured: rows('AND featured=1')[0] || rows('')[0] || null, trending: rows('AND trending=1'), latest: rows('AND new_release=1'), sections: all<Taxonomy>('SELECT * FROM categories ORDER BY name').map(c => ({ ...c, items: all<Movie>("SELECT m.* FROM movies m JOIN movie_categories mc ON mc.movie_id=m.id WHERE mc.category_id=? AND m.status='PUBLISHED' ORDER BY m.created_at DESC LIMIT 12", c.id).map(decorate) })).filter(c => c.items.length) });
});
platform.get('/catalog/movies/:id', (req, res) => {
  const movie = getMovie(String(req.params.id));
  const episodes = all<Episode>("SELECT * FROM episodes WHERE movie_id=? AND status='PUBLISHED' ORDER BY episode_number", movie.id).map(e => publicEpisode(e, req.user?.id));
  let progress = req.user ? one<{ episode_id: string; completed: number; episode_number: number }>('SELECT p.episode_id,p.completed,e.episode_number FROM watch_progress p JOIN episodes e ON e.id=p.episode_id WHERE p.user_id=? AND e.movie_id=? AND e.status=\'PUBLISHED\' ORDER BY p.updated_at DESC LIMIT 1', req.user.id, movie.id) : null;
  if (progress?.completed) {
    const next = episodes.find(e => e.episode_number > progress!.episode_number);
    if (next) progress = { episode_id: next.id, episode_number: next.episode_number, completed: 0 };
  }
  res.json({ movie, episodes, progress, favorite: !!(req.user && one('SELECT 1 FROM favorites WHERE user_id=? AND movie_id=?', req.user.id, movie.id)) });
});
function episode(id: string) {
  const row = one<Episode>("SELECT e.* FROM episodes e JOIN movies m ON m.id=e.movie_id WHERE e.id=? AND e.status='PUBLISHED' AND m.status='PUBLISHED'", id);
  if (!row) throw new HttpError(404, 'Анги олдсонгүй.');
  return row;
}
platform.get('/watch/:id', (req, res) => {
  const row = episode(String(req.params.id));
  res.json({ episode: publicEpisode(row, req.user?.id), movie: getMovie(row.movie_id), episodes: all<Episode>("SELECT * FROM episodes WHERE movie_id=? AND status='PUBLISHED' ORDER BY episode_number", row.movie_id).map(e => publicEpisode(e, req.user?.id)), progress: req.user ? one('SELECT * FROM watch_progress WHERE user_id=? AND episode_id=?', req.user.id, row.id) : null, stream: accessible(row, req.user?.id) ? `/api/stream/${row.id}/video` : null, subtitles: accessible(row, req.user?.id) && row.subtitle_key ? `/api/stream/${row.id}/subtitles` : null });
});
platform.get('/stream/:id/:kind', (req, res) => {
  const row = episode(String(req.params.id));
  if (!accessible(row, req.user?.id)) throw new HttpError(403, 'Энэ ангийг үзэх эрхгүй байна.');
  const kind = z.enum(['video','subtitles']).parse(req.params.kind);
  const key = kind === 'video' ? row.media_key : row.subtitle_key;
  if (!key) throw new HttpError(404, 'Видео бэлэн болоогүй байна.');
  res.type(kind === 'video' ? 'video/mp4' : 'text/vtt');
  res.sendFile(mediaStorage.resolve(key));
});
platform.put('/progress/:id', authenticated, rateLimit(60), (req, res) => {
  const row = episode(String(req.params.id));
  if (!accessible(row, req.user!.id)) throw new HttpError(403, 'Үзэх эрхгүй байна.');
  const data = z.object({ currentTime: z.number().finite().nonnegative() }).parse(req.body);
  const current = Math.min(data.currentTime, row.duration);
  execute('INSERT INTO watch_progress(user_id,episode_id,current_time,duration,completed,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,episode_id) DO UPDATE SET current_time=excluded.current_time,duration=excluded.duration,completed=excluded.completed,updated_at=excluded.updated_at', req.user!.id, row.id, current, row.duration, Number(current >= row.duration * .95), new Date().toISOString());
  res.json({ ok: true });
});
platform.get('/library', authenticated, (req, res) => {
  const id = req.user!.id;
  const progress = all<{ episode_id: string; current_time: number; duration: number; completed: number; movie_id: string; episode_number: number; updated_at: string }>("SELECT p.*,e.movie_id,e.episode_number FROM watch_progress p JOIN episodes e ON e.id=p.episode_id JOIN movies m ON m.id=e.movie_id WHERE p.user_id=? AND e.status='PUBLISHED' AND m.status='PUBLISHED' ORDER BY p.updated_at DESC", id);
  const seen = new Set<string>();
  const latest = progress.filter(p => { if (seen.has(p.movie_id)) return false; seen.add(p.movie_id); return true; }).map(p => ({ ...p, movie: getMovie(p.movie_id) }));
  const continueWatching = latest.flatMap(p => {
    if (!p.completed) return [p];
    const next = one<Episode>("SELECT * FROM episodes WHERE movie_id=? AND status='PUBLISHED' AND episode_number>? ORDER BY episode_number LIMIT 1", p.movie_id, p.episode_number);
    return next ? [{ ...p, episode_id: next.id, episode_number: next.episode_number, current_time: 0, duration: next.duration, completed: 0 }] : [];
  });
  res.json({ progress: latest, continueWatching, favorites: all<Movie>("SELECT m.* FROM movies m JOIN favorites f ON f.movie_id=m.id WHERE f.user_id=? AND m.status='PUBLISHED'", id).map(decorate), purchased: all<Movie>("SELECT m.* FROM movies m JOIN purchases p ON p.movie_id=m.id WHERE p.user_id=? AND p.status='PAID' AND m.status='PUBLISHED'", id).map(decorate) });
});
platform.put('/favorites/:id', authenticated, (req, res) => {
  const movie = getMovie(String(req.params.id)); const { favorite } = z.object({ favorite: z.boolean() }).parse(req.body);
  if (favorite) execute('INSERT OR IGNORE INTO favorites(user_id,movie_id) VALUES(?,?)', req.user!.id, movie.id);
  else execute('DELETE FROM favorites WHERE user_id=? AND movie_id=?', req.user!.id, movie.id);
  res.json({ favorite });
});
platform.get('/payments', authenticated, (req, res) => res.json({ instructions: paymentProvider.instructions, enabled: !!paymentProvider.instructions, items: all('SELECT p.*,m.title_mn,m.slug FROM purchases p JOIN movies m ON m.id=p.movie_id WHERE p.user_id=? ORDER BY p.created_at DESC', req.user!.id) }));
platform.post('/payments/checkout', authenticated, rateLimit(10), (req, res) => { const { movieId } = z.object({ movieId: z.string().uuid() }).parse(req.body); res.json(checkout(req.user!.id, getMovie(movieId))); });

platform.use('/admin', admin);
platform.get('/admin/dashboard', (_req, res) => res.json({ movies: one('SELECT count(*) total FROM movies'), users: one('SELECT count(*) total FROM users'), episodes: one('SELECT count(*) total FROM episodes'), revenue: one("SELECT COALESCE(sum(amount),0) total FROM payments WHERE status='PAID'") }));
platform.get('/admin/movies', (_req, res) => res.json(all<Movie>('SELECT * FROM movies ORDER BY created_at DESC').map(decorate)));
platform.get('/admin/movies/:id', (req, res) => res.json({ movie: getMovie(String(req.params.id), true), episodes: all('SELECT e.*,j.job_id FROM episodes e LEFT JOIN processing_jobs j ON j.job_id=(SELECT pj.job_id FROM processing_jobs pj WHERE pj.episode_id=e.id ORDER BY pj.created_at DESC,pj.rowid DESC LIMIT 1) WHERE movie_id=? ORDER BY episode_number', String(req.params.id)) }));
platform.post('/admin/movies', (req, res) => {
  const { category_ids, genre_ids, ...data } = movieSchema.parse(req.body); const id = randomUUID();
  transaction(() => {
    const keys = Object.keys(data); execute(`INSERT INTO movies(id,${keys.join(',')}) VALUES(?,${keys.map(() => '?').join(',')})`, id, ...Object.values(data).map(v => typeof v === 'boolean' ? Number(v) : v));
    for (const category of category_ids) execute('INSERT INTO movie_categories VALUES(?,?)', id, category);
    for (const genre of genre_ids) execute('INSERT INTO movie_genres VALUES(?,?)', id, genre);
  }); res.status(201).json(getMovie(id, true));
});
platform.put('/admin/movies/:id', (req, res) => {
  const id = getMovie(String(req.params.id), true).id;
  const { category_ids, genre_ids, ...data } = movieSchema.parse(req.body);
  transaction(() => {
    execute(`UPDATE movies SET ${Object.keys(data).map(k => `${k}=?`).join(',')},updated_at=CURRENT_TIMESTAMP WHERE id=?`, ...Object.values(data).map(v => typeof v === 'boolean' ? Number(v) : v), id);
    execute('DELETE FROM movie_categories WHERE movie_id=?', id); execute('DELETE FROM movie_genres WHERE movie_id=?', id);
    for (const category of category_ids) execute('INSERT INTO movie_categories VALUES(?,?)', id, category);
    for (const genre of genre_ids) execute('INSERT INTO movie_genres VALUES(?,?)', id, genre);
  }); res.json(getMovie(id, true));
});
platform.delete('/admin/movies/:id', (req, res) => { const id = getMovie(String(req.params.id), true).id; execute("UPDATE movies SET status='ARCHIVED' WHERE id=?", id); res.json({ ok: true }); });
platform.get('/admin/episodes', (_req, res) => res.json(all('SELECT e.*,m.title_mn,j.job_id FROM episodes e JOIN movies m ON m.id=e.movie_id LEFT JOIN processing_jobs j ON j.job_id=(SELECT pj.job_id FROM processing_jobs pj WHERE pj.episode_id=e.id ORDER BY pj.created_at DESC,pj.rowid DESC LIMIT 1) ORDER BY m.title_mn,e.episode_number')));
platform.post('/admin/episodes', (req, res) => {
  const data = z.object({ movie_id: z.string().uuid(), episode_number: z.number().int().min(1).max(10000), title: z.string().trim().min(1).max(200), is_free: z.boolean().optional() }).parse(req.body);
  getMovie(data.movie_id, true); const id = randomUUID();
  execute('INSERT INTO episodes(id,movie_id,episode_number,title,is_free) VALUES(?,?,?,?,?)', id, data.movie_id, data.episode_number, data.title, Number(data.is_free ?? data.episode_number <= 5)); res.status(201).json({ id });
});
platform.patch('/admin/episodes/:id', (req, res) => {
  const data = z.object({ title: z.string().trim().min(1).max(200), episode_number: z.number().int().min(1).max(10000), is_free: z.boolean() }).parse(req.body);
  if (!one('SELECT id FROM episodes WHERE id=?', String(req.params.id))) throw new HttpError(404, 'Анги олдсонгүй.');
  execute('UPDATE episodes SET title=?,episode_number=?,is_free=? WHERE id=?', data.title, data.episode_number, Number(data.is_free), String(req.params.id)); res.json({ ok: true });
});
platform.delete('/admin/episodes/:id', (req, res) => { execute("UPDATE episodes SET status='DRAFT' WHERE id=?", String(req.params.id)); res.json({ ok: true }); });
platform.post('/admin/episodes/:id/publish', async (req, res) => {
  const id = String(req.params.id);
  const data = z.object({ jobId: z.string().uuid(), version: z.enum(['subtitles','dubbed']).default('dubbed'), approved: z.literal(true) }).parse(req.body);
  const row = one<Episode>('SELECT * FROM episodes WHERE id=?', id);
  if (!row) throw new HttpError(404, 'Анги олдсонгүй.');
  const link = one<{ episode_id: string }>('SELECT episode_id FROM processing_jobs WHERE job_id=?', data.jobId);
  if (!link || link.episode_id !== id) throw new HttpError(409, 'Энэ боловсруулалт өөр ангид хамаарна.');
  const job = await load(data.jobId);
  if (isBusy(job.id) || job.status === 'failed' || job.status === 'rendering' || !job.translationReviewed || !job.segments.length || job.segments.some(s => !s.target.trim()) || (data.version === 'dubbed' && job.status !== 'completed')) throw new HttpError(409, 'Орчуулга болон эцсийн видеог хянаж баталгаажуулна уу.');
  if (job.mode === 'demo' && process.env.NODE_ENV === 'production') throw new HttpError(409, 'Demo үр дүнг production-д нийтлэх боломжгүй.');
  if (!await exists(path.join(dir(job.id), data.version === 'dubbed' ? 'dubbed.mp4' : 'subtitle-preview.mp4'))) throw new HttpError(409, 'Сонгосон хувилбарыг эхлээд бэлтгэж, урьдчилан үзнэ үү.');
  const media = await mediaStorage.put(path.join(dir(job.id), data.version === 'dubbed' ? 'dubbed.mp4' : 'subtitle-preview.mp4'), 'mp4');
  const vtt = path.join(dir(job.id), 'published.mn.vtt');
  await fs.writeFile(vtt, subtitleFile(job.segments, 'vtt'));
  const subtitle = await mediaStorage.put(vtt, 'vtt');
  transaction(() => {
    execute("UPDATE episodes SET media_key=?,subtitle_key=?,duration=?,status='PUBLISHED' WHERE id=?", media, subtitle, job.duration, id);
    execute('INSERT INTO subtitles(id,episode_id,storage_key) VALUES(?,?,?) ON CONFLICT(episode_id,language) DO UPDATE SET storage_key=excluded.storage_key', randomUUID(), id, subtitle);
  }); res.json({ ok: true });
});
for (const table of ['categories','genres'] as const) {
  platform.get(`/admin/${table}`, (_req, res) => res.json(all(`SELECT * FROM ${table} ORDER BY name`)));
  platform.post(`/admin/${table}`, (req, res) => { const data = z.object({ name: z.string().trim().min(1).max(80), slug: z.string().regex(/^[a-z0-9-]+$/).max(100) }).parse(req.body); const id = randomUUID(); execute(`INSERT INTO ${table}(id,name,slug) VALUES(?,?,?)`, id, data.name, data.slug); res.status(201).json({ id, ...data }); });
  platform.delete(`/admin/${table}/:id`, (req, res) => { execute(`DELETE FROM ${table} WHERE id=?`, String(req.params.id)); res.json({ ok: true }); });
}
platform.get('/admin/payments', (_req, res) => res.json(all('SELECT p.*,u.email,m.title_mn FROM payments p JOIN users u ON u.id=p.user_id JOIN purchases b ON b.id=p.purchase_id JOIN movies m ON m.id=b.movie_id ORDER BY p.created_at DESC')));
platform.post('/admin/payments/:id/verify', (req, res) => { const { transactionId } = z.object({ transactionId: z.string().trim().min(3).max(160) }).parse(req.body); settle(String(req.params.id), req.user!.id, transactionId); res.json({ ok: true }); });
platform.get('/admin/users', (_req, res) => res.json(all('SELECT id,email,name,role,created_at FROM users ORDER BY created_at DESC')));
platform.get('/admin/settings', (_req, res) => res.json({ paymentProvider: paymentProvider.name, paymentEnabled: !!paymentProvider.instructions, paymentInstructions: paymentProvider.instructions, storage: 'Private local storage', freeEpisodesDefault: 5 }));


