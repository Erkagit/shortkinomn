import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config, apiRoot } from '../config.js';

const filename = process.env.DATABASE_PATH || path.join(config.data, 'platform.sqlite');
fs.mkdirSync(path.dirname(filename), { recursive: true });
export const db = new DatabaseSync(filename);
db.function('unicode_lower', { deterministic: true }, value => String(value ?? '').toLocaleLowerCase('mn-MN'));
db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
db.exec('CREATE TABLE IF NOT EXISTS schema_migrations(version TEXT PRIMARY KEY,applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
for (const version of ['001-platform','002-upload-requests']) if (!db.prepare('SELECT 1 FROM schema_migrations WHERE version=?').get(version)) {
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(fs.readFileSync(path.join(apiRoot, `migrations/${version}.sql`), 'utf8'));
    db.prepare('INSERT INTO schema_migrations(version) VALUES(?)').run(version);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
export function all<T>(sql: string, ...values: SQLInputValue[]): T[] { return db.prepare(sql).all(...values) as unknown as T[]; }
export function one<T>(sql: string, ...values: SQLInputValue[]): T | undefined { return db.prepare(sql).get(...values) as unknown as T | undefined; }
export function execute(sql: string, ...values: SQLInputValue[]) { return db.prepare(sql).run(...values); }
export function transaction<T>(work: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try { const result = work(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
