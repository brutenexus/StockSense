import { body, handle, HttpError, text } from '@/lib/http';
import { ROLES, type Role } from '@/lib/domain/constants';
import { firstError, validateSignup } from '@/lib/domain/validation';
import { createUser, findUserByEmail, findUserByLogin, authenticate } from '@/lib/repo/users';
import { ACCENTS } from '@/lib/domain/constants';
import { startSession } from '@/lib/auth/server';
import { logActivity } from '@/lib/repo/activity';

const ACCENTS_POOL = ACCENTS;

export async function POST(request: Request) {
  return handle(async () => {
    const payload = await body<Record<string, unknown>>(request);
    const input = {
      loginId: text(payload.loginId, 'Login Id'),
      email: text(payload.email, 'Email Id'),
      name: text(payload.name, 'Full name'),
      password: text(payload.password, 'Password'),
      confirmPassword: String(payload.confirmPassword ?? ''),
      role: typeof payload.role === 'string' ? payload.role : undefined,
    };

    const validated = validateSignup(input);
    if (!validated.ok) throw new HttpError(firstError(validated), 400, validated.errors);

    const errors: Record<string, string> = {};
    if (findUserByLogin(input.loginId)) errors.loginId = 'This Login Id is already taken';
    if (findUserByEmail(input.email)) errors.email = 'This email is already registered';
    if (Object.keys(errors).length) throw new HttpError('Please fix the highlighted fields.', 400, errors);

    const role: Role = ROLES.includes(input.role as Role) ? (input.role as Role) : 'STAFF';
    const accent = ACCENTS_POOL[Math.floor(Math.random() * ACCENTS_POOL.length)] ?? 'indigo';
    const user = await createUser({
      loginId: input.loginId,
      email: input.email,
      name: input.name,
      password: input.password,
      role,
      accent,
    });

    // Signing in straight after signup keeps the flow to a single step.
    await startSession(user.id);
    logActivity({
      userId: user.id,
      userName: user.name,
      action: 'SIGN_UP',
      entityType: 'user',
      entityId: user.id,
      summary: `${user.name} created the account ${user.loginId}`,
    });

    // Touch authenticate once so `last_login_at` is stamped for a new account.
    await authenticate(input.loginId, input.password);

    return { user: { id: user.id, name: user.name, role: user.role } };
  });
}
