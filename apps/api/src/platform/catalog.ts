import { z } from 'zod';
import { all, one } from './db.js';
import { HttpError } from './auth.js';

const imageUrl = z.string().max(2000).refine(s => !s || /^https?:\/\//.test(s), 'HTTP(S) URL оруулна уу.');
export const movieSchema = z.object({
  title_mn: z.string().trim().min(1).max(200), title_original: z.string().max(200).default(''),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(180), description: z.string().max(6000).default(''),
  poster_url: imageUrl.default(''), backdrop_url: imageUrl.default(''), trailer_url: imageUrl.default(''),
  country: z.string().max(80).default(''), year: z.number().int().min(1900).max(2100),
  price: z.number().int().min(0).max(10000000), total_episodes: z.number().int().min(0).max(10000).default(0),
  status: z.enum(['DRAFT','PROCESSING','PUBLISHED','ARCHIVED']).default('DRAFT'),
  featured: z.boolean().default(false), trending: z.boolean().default(false), new_release: z.boolean().default(true),
  category_ids: z.array(z.string().uuid()).max(30).default([]), genre_ids: z.array(z.string().uuid()).max(30).default([]),
});
export interface Movie { id: string; slug: string; title_mn: string; title_original: string; description: string; poster_url: string; backdrop_url: string; trailer_url: string; country: string; year: number; price: number; total_episodes: number; status: string; featured: number; trending: number; new_release: number; created_at: string; updated_at: string; episode_count: number; free_episode_count: number; free_intro_count: number; categories: Taxonomy[]; genres: Taxonomy[] }
export interface Taxonomy { id: string; slug: string; name: string }
export interface Episode { id: string; movie_id: string; episode_number: number; title: string; duration: number; is_free: number; status: string; media_key: string | null; subtitle_key: string | null; thumbnail_url: string }
export function decorate(movie: Movie): Movie {
  const episodes = all<{ episode_number: number; is_free: number }>("SELECT episode_number,is_free FROM episodes WHERE movie_id=? AND status='PUBLISHED' ORDER BY episode_number", movie.id);
  let intro = 0;
  for (const episode of episodes) { if (!episode.is_free || episode.episode_number !== intro + 1) break; intro++; }
  return { ...movie, categories: all<Taxonomy>('SELECT c.* FROM categories c JOIN movie_categories mc ON mc.category_id=c.id WHERE mc.movie_id=?', movie.id), genres: all<Taxonomy>('SELECT g.* FROM genres g JOIN movie_genres mg ON mg.genre_id=g.id WHERE mg.movie_id=?', movie.id), episode_count: episodes.length, free_episode_count: episodes.filter(e => e.is_free).length, free_intro_count: intro };
}
export function getMovie(id: string, isAdmin = false) {
  const movie = one<Movie>(`SELECT * FROM movies WHERE (id=? OR slug=?) ${isAdmin ? '' : "AND status='PUBLISHED'"}`, id, id);
  if (!movie) throw new HttpError(404, 'Кино олдсонгүй.');
  return decorate(movie);
}
export function accessible(episode: Episode, userId?: string) {
  return !!episode.is_free || !!(userId && one("SELECT id FROM purchases WHERE user_id=? AND movie_id=? AND status='PAID'", userId, episode.movie_id));
}
export function publicEpisode(episode: Episode, userId?: string) {
  const { media_key: _, subtitle_key: __, ...safe } = episode;
  const progress=userId?one<{completed:number;current_time:number}>('SELECT completed,current_time FROM watch_progress WHERE user_id=? AND episode_id=?',userId,episode.id):undefined;
  return { ...safe, locked: !accessible(episode, userId),completed:progress?.completed||0,current_time:progress?.current_time||0 };
}
