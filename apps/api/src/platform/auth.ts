import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { execute, one } from './db.js';

const derive = promisify(scrypt);
export interface User { id: string; email: string; name: string; avatar: string; role: 'USER' | 'ADMIN' }
declare global { namespace Express { interface Request { user?: User } } }
import {HttpError} from '../runtime.js';
export {HttpError} from '../runtime.js';
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
export async function passwordHash(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await derive(password, salt, 64) as Buffer).toString('hex')}`;
}
async function passwordMatches(password: string, saved: string) {
  const [salt, hash] = saved.split(':');
  const actual = await derive(password, salt, 64) as Buffer;
  return timingSafeEqual(actual, Buffer.from(hash, 'hex'));
}
export function identify(req: Request, _res: Response, next: NextFunction) {
  const token = req.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith('duulav_session='))?.slice(15);
  if (token) req.user = one<User>('SELECT u.id,u.email,u.name,u.avatar,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?', digest(token), Date.now());
  next();
}
export function authenticated(req: Request, _res: Response, next: NextFunction) { if (!req.user) throw new HttpError(401, 'Нэвтэрч орно уу.'); next(); }
export function admin(req: Request, _res: Response, next: NextFunction) { if (req.user?.role !== 'ADMIN') throw new HttpError(req.user ? 403 : 401, 'Админ эрх шаардлагатай.'); next(); }
const attempts = new Map<string, { count: number; until: number }>();
export function rateLimit(limit = 20, windowMs = 60_000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    for (const [key, value] of attempts) if (value.until < now) attempts.delete(key);
    const key = `${req.ip}:${req.baseUrl}:${req.path}`;
    const value = attempts.get(key) || { count: 0, until: now + windowMs };
    attempts.set(key, value); value.count++;
    if (value.count > limit) { res.setHeader('Retry-After', Math.ceil((value.until - now) / 1000)); throw new HttpError(429, 'Түр хүлээгээд дахин оролдоно уу.'); }
    next();
  };
}
const credentials = z.object({ email: z.string().email().max(254).transform(s => s.toLowerCase().trim()), password: z.string().min(10).max(128), name: z.string().trim().min(1).max(80).optional() });
export async function login(req: Request, res: Response, register = false) {
  const data = credentials.parse(req.body);
  let user = one<User & { password_hash: string }>('SELECT * FROM users WHERE email=?', data.email);
  if (register) {
    if (user) throw new HttpError(409, 'Энэ и-мэйл бүртгэлтэй байна.');
    const hash = await passwordHash(data.password);
    const id = randomUUID();
    execute('INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,?)', id, data.email, data.name || data.email.split('@')[0], hash);
    user = one<User & { password_hash: string }>('SELECT * FROM users WHERE id=?', id);
  } else {
    const hash = user?.password_hash || '00000000000000000000000000000000:' + '00'.repeat(64);
    if (!await passwordMatches(data.password, hash) || !user) throw new HttpError(401, 'И-мэйл эсвэл нууц үг буруу байна.');
  }
  const token = randomBytes(32).toString('hex');
  execute('DELETE FROM sessions WHERE expires<?', Date.now());
  execute('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)', digest(token), user!.id, Date.now() + 30 * 86400000);
  res.cookie('duulav_session', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 30 * 86400000, path: '/' });
  const { password_hash: _, ...safe } = user!;
  res.json(safe);
}
export function logout(req: Request, res: Response) {
  const token = req.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith('duulav_session='))?.slice(15);
  if (token) execute('DELETE FROM sessions WHERE token=?', digest(token));
  res.clearCookie('duulav_session', { path: '/' }); res.json({ ok: true });
}
export async function bootstrapAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase(), password = process.env.ADMIN_PASSWORD;
  if (!email || !password || one('SELECT id FROM users WHERE email=?', email)) return;
  credentials.parse({ email, password });
  execute('INSERT INTO users(id,email,name,password_hash,role) VALUES(?,?,?,?,?)', randomUUID(), email, 'Админ', await passwordHash(password), 'ADMIN');
}
