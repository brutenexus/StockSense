/** Tiny dependency-free structured logger (no db import to avoid cycles). */
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

const threshold: number = LEVELS[(process.env.LOG_LEVEL as Level) || 'info'] ?? LEVELS.info;
const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

function emit(level: Level, msg: string, extra?: unknown) {
  if (isTest || LEVELS[level] < threshold) return;
  const stamp = new Date().toISOString().slice(11, 23);
  const tag = `[${stamp}] ${level.toUpperCase().padEnd(5)} stocksense`;
  if (extra === undefined) console[level === 'debug' ? 'log' : level](`${tag} ${msg}`);
  else console[level === 'debug' ? 'log' : level](`${tag} ${msg}`, extra);
}

export const logger = {
  debug: (m: string, e?: unknown) => emit('debug', m, e),
  info: (m: string, e?: unknown) => emit('info', m, e),
  warn: (m: string, e?: unknown) => emit('warn', m, e),
  error: (m: string, e?: unknown) => emit('error', m, e),
};
