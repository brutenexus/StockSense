import { apiCapability, body, flag, handle, HttpError, notFound, optionalText } from '@/lib/http';
import { ROLES, type Role } from '@/lib/domain/constants';
import { validatePassword } from '@/lib/domain/validation';
import { findUserById, setPassword, updateUser } from '@/lib/repo/users';
import { logActivity } from '@/lib/repo/activity';

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  return handle(async () => {
    const actor = await apiCapability('manage_users');
    const { id } = await params;
    const current = findUserById(id);
    if (!current) notFound('That teammate no longer exists.');

    const payload = await body<Record<string, unknown>>(request);
    const role = optionalText(payload.role);
    if (role && !ROLES.includes(role as Role)) {
      throw new HttpError('Pick a valid role.', 400, { role: 'Invalid role' });
    }
    if (current.id === actor.id && payload.isActive !== undefined && !flag(payload.isActive, true)) {
      throw new HttpError('You cannot deactivate your own account.');
    }

    const user = await updateUser(id, {
      name: payload.name === undefined ? undefined : String(payload.name).trim() || current.name,
      email: payload.email === undefined ? undefined : String(payload.email).trim() || current.email,
      role: (role as Role | undefined) ?? undefined,
      phone: payload.phone === undefined ? undefined : optionalText(payload.phone),
      jobTitle: payload.jobTitle === undefined ? undefined : optionalText(payload.jobTitle),
      accent: payload.accent === undefined ? undefined : optionalText(payload.accent) ?? current.accent,
      isActive: payload.isActive === undefined ? undefined : flag(payload.isActive, true),
    });
    if (!user) notFound('That teammate no longer exists.');

    logActivity({
      userId: actor.id,
      userName: actor.name,
      action: 'USER_UPDATE',
      entityType: 'user',
      entityId: user.id,
      summary: `Updated ${user.name} (${user.role === 'MANAGER' ? 'Inventory Manager' : 'Warehouse Staff'})`,
    });

    return { user };
  });
}

/** Manager-driven password reset — the OTP flow is for self-service. */
export async function POST(request: Request, { params }: Context) {
  return handle(async () => {
    const actor = await apiCapability('manage_users');
    const { id } = await params;
    const user = findUserById(id);
    if (!user) notFound('That teammate no longer exists.');

    const payload = await body<Record<string, unknown>>(request);
    const password = String(payload.password ?? '');
    const error = validatePassword(password);
    if (error) throw new HttpError(error, 400, { password: error });

    await setPassword(user.id, password);
    logActivity({
      userId: actor.id,
      userName: actor.name,
      action: 'USER_PASSWORD',
      entityType: 'user',
      entityId: user.id,
      summary: `Reset the password for ${user.name}`,
    });

    return { ok: true };
  });
}
