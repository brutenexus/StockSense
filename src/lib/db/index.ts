/**
 * SQLite access layer.
 *
 * Built on Node's native `node:sqlite` (Node >= 22.5). No native compilation,
 * no ORM codegen — prepared statements behind a thin, typed wrapper.
 *
 * The handle is cached on `globalThis` so route re-evaluation during dev never
 * opens a second write connection against the same file.
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { MIGRATIONS } from './schema';
import { logger } from '../logger';

export type Row = Record<string, unknown>;

type GlobalWithDb = typeof globalThis & {
  __stocksenseDb?: DatabaseSync;
  __stocksenseReady?: boolean;
};

const g = globalThis as GlobalWithDb;

export function dbFile(): string {
  const configured = process.env.DATABASE_FILE || 'data/stocksense.db';
  return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
}

function open(): DatabaseSync {
  const file = dbFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  // WAL keeps readers unblocked while a write transaction is open, and the
  // busy timeout absorbs the rare contention between concurrent route handlers.
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 8000;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA synchronous = NORMAL;');
  return db;
}

export function getDb(): DatabaseSync {
  if (!g.__stocksenseDb) {
    g.__stocksenseDb = open();
    migrate(g.__stocksenseDb);
  }
  return g.__stocksenseDb;
}

export function migrate(db: DatabaseSync = getDb()): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  );`);
  const applied = new Set(
    (db.prepare('SELECT id FROM schema_migrations').all() as { id: string }[]).map((r) => r.id),
  );
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    db.exec('BEGIN IMMEDIATE;');
    try {
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(
        migration.id,
        new Date().toISOString(),
      );
      db.exec('COMMIT;');
      logger.info(`db: applied migration ${migration.id}`);
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  }
  g.__stocksenseReady = true;
}

/* ------------------------------------------------------------------ queries */

function normalize<T>(row: unknown): T {
  return row ? ({ ...(row as Row) } as T) : (row as T);
}

export function all<T = Row>(sql: string, params: unknown[] = []): T[] {
  return (getDb().prepare(sql).all(...(params as never[])) as unknown[]).map((r) => normalize<T>(r));
}

export function get<T = Row>(sql: string, params: unknown[] = []): T | undefined {
  const row = getDb().prepare(sql).get(...(params as never[]));
  return row === undefined ? undefined : normalize<T>(row);
}

export function run(sql: string, params: unknown[] = []): { changes: number; lastInsertRowid: number } {
  const res = getDb().prepare(sql).run(...(params as never[]));
  return { changes: Number(res.changes), lastInsertRowid: Number(res.lastInsertRowid) };
}

export function scalar<T = number>(sql: string, params: unknown[] = []): T | undefined {
  const row = getDb().prepare(sql).get(...(params as never[])) as Row | undefined;
  if (!row) return undefined;
  const values = Object.values(row);
  return values.length ? (values[0] as T) : undefined;
}

export function exec(sql: string): void {
  getDb().exec(sql);
}

/**
 * Runs `fn` inside an IMMEDIATE transaction. Nested calls join the outer
 * transaction so repositories can compose freely.
 */
let txDepth = 0;
export function tx<T>(fn: () => T): T {
  const db = getDb();
  if (txDepth > 0) return fn();
  db.exec('BEGIN IMMEDIATE;');
  txDepth += 1;
  try {
    const result = fn();
    db.exec('COMMIT;');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      /* the transaction already unwound */
    }
    throw err;
  } finally {
    txDepth -= 1;
  }
}

/* ---------------------------------------------------------------- utilities */

export function nowIso(): string {
  return new Date().toISOString();
}

export function like(term: string): string {
  const escaped = term.replace(/[\\%_]/g, (m) => `\\${m}`);
  return `%${escaped}%`;
}

export const uid = {
  /** Short, sortable, collision-resistant id. */
  next(prefix = 'id'): string {
    const time = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 10);
    return `${prefix}_${time}${rand}`;
  },
};
