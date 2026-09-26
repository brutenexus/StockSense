import 'server-only';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { can, type Capability, type Role } from '../domain/constants';
import { createSession, resolveSession, revokeSession, type SessionUser } from '../repo/users';

export const SESSION_COOKIE = 'stocksense_session';

export async function currentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return resolveSession(token) ?? null;
}

export async function requireUser(nextPath?: string): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) {
    redirect(nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : '/login');
  }
  return user;
}

export async function requireCapability(capability: Capability): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, capability)) {
    redirect(`/dashboard?denied=${encodeURIComponent(capability)}`);
  }
  return user;
}

export async function startSession(userId: string): Promise<void> {
  const headerList = await headers();
  const token = createSession(userId, {
    userAgent: headerList.get('user-agent'),
    ip: headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
  });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Number(process.env.SESSION_TTL_HOURS || 72) * 3600,
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  revokeSession(token);
  store.delete(SESSION_COOKIE);
}

export function roleLabel(role: Role): string {
  return role === 'MANAGER' ? 'Inventory Manager' : 'Warehouse Staff';
}
