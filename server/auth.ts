import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { HttpError, query } from './db.js';
import { permsOf, type Perm } from './perms.js';

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number, options: object) => Promise<Buffer>;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };

export const SESSION_COOKIE = 'lk_session';
const SESSION_DAYS = 30;

export type Role = 'admin' | 'worker';
export interface AuthUser {
  id: string;
  username: string;
  full_name: string;
  role: Role;
  permissions: Perm[];
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64, SCRYPT_PARAMS);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, keyB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, SCRYPT_PARAMS);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function validatePassword(password: unknown): string {
  if (typeof password !== 'string' || password.length < 8) {
    throw new HttpError(400, 'Parol kamida 8 belgidan iborat bo‘lishi kerak');
  }
  if (password.length > 128) throw new HttpError(400, 'Parol juda uzun');
  return password;
}

export function normalizeUsername(username: unknown): string {
  const value = typeof username === 'string' ? username.trim().toLowerCase() : '';
  if (!/^[a-z0-9._-]{3,40}$/.test(value)) {
    throw new HttpError(400, 'Login 3–40 ta lotin harfi, raqam yoki . _ - belgilaridan iborat bo‘lsin');
  }
  return value;
}

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function createSession(userId: string, userAgent?: string): Promise<{ token: string; maxAge: number }> {
  const token = randomBytes(32).toString('base64url');
  const maxAge = SESSION_DAYS * 24 * 3600;
  await query(
    `INSERT INTO app_sessions (token_hash, user_id, expires_at, user_agent)
     VALUES ($1, $2, NOW() + ($3 || ' seconds')::interval, $4)`,
    [hashToken(token), userId, String(maxAge), (userAgent || '').slice(0, 200)],
  );
  // Opportunistic cleanup of expired sessions.
  await query(`DELETE FROM app_sessions WHERE expires_at < NOW()`);
  return { token, maxAge };
}

export async function destroySession(token: string | undefined) {
  if (token) await query(`DELETE FROM app_sessions WHERE token_hash = $1`, [hashToken(token)]);
}

export async function getSessionUser(token: string | undefined): Promise<AuthUser | null> {
  if (!token) return null;
  const rows = await query<Omit<AuthUser, 'permissions'> & { stored: string[] | null }>(
    `SELECT u.id, u.username, u.full_name, u.role, u.permissions AS stored
       FROM app_sessions s JOIN app_users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.is_active`,
    [hashToken(token)],
  );
  if (!rows[0]) return null;
  const { stored, ...user } = rows[0];
  return { ...user, permissions: permsOf(user.role, stored) };
}

export function sessionCookie(token: string, maxAge: number, secure: boolean): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

export function clearedCookie(secure: boolean): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

const MAX_FAILURES = 5;
const LOCK_MINUTES = 10;

export async function assertNotLocked(key: string) {
  const rows = await query<{ locked_until: string | null }>(
    `SELECT locked_until FROM login_attempts WHERE key = $1 AND locked_until > NOW()`,
    [key],
  );
  if (rows.length) throw new HttpError(429, `Juda ko‘p noto‘g‘ri urinish. ${LOCK_MINUTES} daqiqadan so‘ng qayta urinib ko‘ring`);
}

export async function recordLoginFailure(key: string) {
  await query(
    `INSERT INTO login_attempts (key, failures, updated_at) VALUES ($1, 1, NOW())
     ON CONFLICT (key) DO UPDATE SET
       failures = CASE WHEN login_attempts.updated_at < NOW() - interval '30 minutes' THEN 1 ELSE login_attempts.failures + 1 END,
       locked_until = CASE WHEN login_attempts.failures + 1 >= ${MAX_FAILURES} AND login_attempts.updated_at >= NOW() - interval '30 minutes'
                           THEN NOW() + interval '${LOCK_MINUTES} minutes' ELSE NULL END,
       updated_at = NOW()`,
    [key],
  );
}

export async function clearLoginFailures(key: string) {
  await query(`DELETE FROM login_attempts WHERE key = $1`, [key]);
}
