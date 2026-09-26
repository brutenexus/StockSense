import { apiCapability, apiUser, body, flag, handle, HttpError, optionalText, text } from '@/lib/http';
import { ROLES, type Role } from '@/lib/domain/constants';
import { firstError, validateSignup } from '@/lib/domain/validation';
import { createUser, findUserByEmail, findUserByLogin, listUsers, updateUser } from '@/lib/repo/users';
import { logActivity } from '@/lib/repo/activity';

export async function GET() {
  return handle(async () => {
    await apiUser();
    return { items: listUsers() };
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const actor = await apiCapability('manage_users');
    const payload = await body<Record<string, unknown>>(request);

    const input = {
      loginId: text(payload.loginId, 'Login Id'),
      email: text(payload.email, 'Email Id'),
      name: text(payload.name, 'Full name'),
      password: text(payload.password, 'Password'),
      confirmPassword: String(payload.confirmPassword ?? payload.password ?? ''),
      role: optionalText(payload.role) ?? 'STAFF',
    };

    const validated = validateSignup(input);
    if (!validated.ok) throw new HttpError(firstError(validated), 400, validated.errors);

    const errors: Record<string, string> = {};
    if (findUserByLogin(input.loginId)) errors.loginId = 'This Login Id is already taken';
    if (findUserByEmail(input.email)) errors.email = 'This email is already registered';
    if (Object.keys(errors).length) throw new HttpError('Please fix the highlighted fields.', 400, errors);

    const role = ROLES.includes(input.role as Role) ? (input.role as Role) : 'STAFF';
    const user = await createUser({
      loginId: input.loginId,
      email: input.email,
      name: input.name,
      password: input.password,
      role,
      phone: optionalText(payload.phone),
      jobTitle: optionalText(payload.jobTitle),
      accent: optionalText(payload.accent) ?? 'indigo',
    });

    // Inviting someone straight into the inactive state keeps the demo tidy.
    const saved = flag(payload.inactive) ? ((await updateUser(user.id, { isActive: false })) ?? user) : user;

    logActivity({
      userId: actor.id,
      userName: actor.name,
      action: 'USER_CREATE',
      entityType: 'user',
      entityId: user.id,
      summary: `Added ${user.name} (${role === 'MANAGER' ? 'Inventory Manager' : 'Warehouse Staff'})`,
    });

    return { user: saved };
  });
}
