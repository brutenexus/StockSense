import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { all, get, nowIso, run, uid } from '../db';
import { hashPassword, verifyPassword } from '../auth/password';
import type { Role } from '../domain/constants';

export type UserRow = {
  id: string;
  loginId: string;
  email: string;
  name: string;
  role: Role;
  phone: string | null;
  jobTitle: string | null;
  accent: string;
  isActive: number;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const USER_COLUMNS = `id, login_id AS loginId, email, name, role, phone, job_title AS jobTitle,
  accent, is_active AS isActive, last_login_at AS lastLoginAt, created_at AS createdAt, updated_at AS updatedAt`;

export function listUsers(): UserRow[] {
  return all<UserRow>(`SELECT ${USER_COLUMNS} FROM users ORDER BY name COLLATE NOCASE`);
}

export function findUserById(id: string): UserRow | undefined {
  return get<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, [id]);
}

export function findUserByLogin(loginId: string): UserRow | undefined {
  return get<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE lower(login_id) = lower(?)`, [loginId.trim()]);
}

export function findUserByEmail(email: string): UserRow | undefined {
  return get<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE lower(email) = lower(?)`, [email.trim()]);
}

export function findUserByIdentifier(identifier: string): UserRow | undefined {
  return findUserByLogin(identifier) ?? findUserByEmail(identifier);
}

export function countUsers(): number {
  return Number(get<{ c: number }>('SELECT COUNT(*) AS c FROM users')?.c ?? 0);
}

export async function createUser(input: {
  loginId: string;
  email: string;
  name: string;
  password: string;
  role?: Role;
  phone?: string | null;
  jobTitle?: string | null;
  accent?: string;
}): Promise<UserRow> {
  const id = uid.next('usr');
  const stamp = nowIso();
  const hash = await hashPassword(input.password);
  run(
    `INSERT INTO users (id, login_id, email, name, password_hash, role, phone, job_title, accent, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [
      id,
      input.loginId.trim(),
      input.email.trim(),
      input.name.trim(),
      hash,
      input.role ?? 'STAFF',
      input.phone ?? null,
      input.jobTitle ?? null,
      input.accent ?? 'indigo',
      stamp,
      stamp,
    ],
  );
  return findUserById(id)!;
}

export async function updateUser(
  id: string,
  patch: { name?: string; email?: string; role?: Role; phone?: string | null; jobTitle?: string | null; accent?: string; isActive?: boolean },
): Promise<UserRow | undefined> {
  const current = findUserById(id);
  if (!current) return undefined;
  // Start from the existing row so omitted keys keep their value, including the
  // `isActive` flag whose `false` is meaningful.
  const next = {
    name: patch.name ?? current.name,
    email: patch.email ?? current.email,
    role: patch.role ?? current.role,
    phone: patch.phone !== undefined ? patch.phone : current.phone,
    jobTitle: patch.jobTitle !== undefined ? patch.jobTitle : current.jobTitle,
    accent: patch.accent ?? current.accent,
    isActive: patch.isActive === undefined ? current.isActive : patch.isActive ? 1 : 0,
  };
  run(
    `UPDATE users SET name = ?, email = ?, role = ?, phone = ?, job_title = ?, accent = ?, is_active = ?, updated_at = ? WHERE id = ?`,
    [next.name, next.email, next.role, next.phone, next.jobTitle, next.accent, next.isActive, nowIso(), id],
  );
  return findUserById(id);
}

export async function setPassword(userId: string, password: string): Promise<void> {
  const hash = await hashPassword(password);
  run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [hash, nowIso(), userId]);
  revokeUserSessions(userId);
}

export async function authenticate(identifier: string, password: string): Promise<UserRow | null> {
  const user = findUserByIdentifier(identifier);
  if (!user) {
    // Constant-ish time: still burn a comparison so login failures look alike.
    await verifyPassword(password, '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinvalid');
    return null;
  }
  const hash = get<{ passwordHash: string }>('SELECT password_hash AS passwordHash FROM users WHERE id = ?', [user.id]);
  const ok = await verifyPassword(password, hash?.passwordHash ?? '');
  if (!ok) return null;
  if (!user.isActive) return null;
  run('UPDATE users SET last_login_at = ? WHERE id = ?', [nowIso(), user.id]);
  return findUserById(user.id)!;
}

/* ------------------------------------------------------------------ sessions */

export type SessionUser = UserRow & { sessionId: string };

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createSession(userId: string, meta: { userAgent?: string | null; ip?: string | null; ttlHours?: number }): string {
  const token = randomBytes(32).toString('base64url');
  const ttlHours = meta.ttlHours ?? Number(process.env.SESSION_TTL_HOURS || 72);
  const expires = new Date(Date.now() + ttlHours * 3600_000).toISOString();
  run(
    `INSERT INTO sessions (id, user_id, token_hash, user_agent, ip, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [uid.next('ses'), userId, hashToken(token), meta.userAgent ?? null, meta.ip ?? null, expires, nowIso()],
  );
  return token;
}

export function resolveSession(token: string | undefined | null): SessionUser | undefined {
  if (!token) return undefined;
  const row = get<{ sessionId: string; expiresAt: string; revokedAt: string | null; userId: string }>(
    'SELECT id AS sessionId, user_id AS userId, expires_at AS expiresAt, revoked_at AS revokedAt FROM sessions WHERE token_hash = ?',
    [hashToken(token)],
  );
  if (!row || row.revokedAt) return undefined;
  if (new Date(row.expiresAt).getTime() < Date.now()) return undefined;
  const user = findUserById(row.userId);
  if (!user || !user.isActive) return undefined;
  return { ...user, sessionId: row.sessionId };
}

export function revokeSession(token: string | undefined | null): void {
  if (!token) return;
  run('UPDATE sessions SET revoked_at = ? WHERE token_hash = ?', [nowIso(), hashToken(token)]);
}

export function revokeUserSessions(userId: string): void {
  run('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', [nowIso(), userId]);
}

export function listSessions(userId: string) {
  return all<{ id: string; userAgent: string | null; ip: string | null; createdAt: string; expiresAt: string }>(
    `SELECT id, user_agent AS userAgent, ip, created_at AS createdAt, expires_at AS expiresAt
     FROM sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY created_at DESC`,
    [userId, nowIso()],
  );
}

/* ----------------------------------------------------------------- OTP codes */

export type OtpRow = {
  id: string;
  userId: string;
  purpose: string;
  codeHash: string;
  destination: string | null;
  attempts: number;
  maxAttempts: number;
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
};

function hashOtp(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

export function issueOtp(userId: string, destination: string, meta?: { ttlMinutes?: number; maxAttempts?: number }): string {
  const ttl = meta?.ttlMinutes ?? Number(process.env.OTP_TTL_MINUTES || 10);
  const maxAttempts = meta?.maxAttempts ?? Number(process.env.OTP_MAX_ATTEMPTS || 5);
  // Invalidate any outstanding codes so only the newest one works.
  run('UPDATE otp_codes SET consumed_at = ? WHERE user_id = ? AND consumed_at IS NULL', [nowIso(), userId]);
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  run(
    `INSERT INTO otp_codes (id, user_id, purpose, code_hash, channel, destination, attempts, max_attempts, expires_at, created_at)
     VALUES (?, ?, 'PASSWORD_RESET', ?, 'EMAIL', ?, 0, ?, ?, ?)`,
    [uid.next('otp'), userId, hashOtp(code), destination, maxAttempts, new Date(Date.now() + ttl * 60_000).toISOString(), nowIso()],
  );
  return code;
}

export function findOtp(userId: string): OtpRow | undefined {
  return get<OtpRow>(
    `SELECT id, user_id AS userId, purpose, code_hash AS codeHash, destination, attempts, max_attempts AS maxAttempts,
            expires_at AS expiresAt, consumed_at AS consumedAt, created_at AS createdAt
     FROM otp_codes WHERE user_id = ? AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );
}

export function verifyOtp(userId: string, code: string): { ok: true } | { ok: false; reason: string } {
  const row = findOtp(userId);
  if (!row) return { ok: false, reason: 'No active OTP. Request a new one.' };
  if (new Date(row.expiresAt).getTime() < Date.now()) return { ok: false, reason: 'This OTP has expired. Request a new one.' };
  if (row.attempts >= row.maxAttempts) return { ok: false, reason: 'Too many incorrect attempts. Request a new OTP.' };
  const expected = Buffer.from(row.codeHash, 'hex');
  const actual = Buffer.from(hashOtp(String(code).trim()), 'hex');
  const match = expected.length === actual.length && timingSafeEqual(expected, actual);
  if (!match) {
    run('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?', [row.id]);
    const left = row.maxAttempts - (row.attempts + 1);
    return { ok: false, reason: left > 0 ? `Incorrect OTP. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Too many incorrect attempts. Request a new OTP.' };
  }
  return { ok: true };
}

export function consumeOtp(userId: string): void {
  run('UPDATE otp_codes SET consumed_at = ? WHERE user_id = ? AND consumed_at IS NULL', [nowIso(), userId]);
}
