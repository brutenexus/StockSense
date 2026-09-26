import { body, handle, HttpError, text } from '@/lib/http';
import { INVALID_CREDENTIALS } from '@/lib/domain/validation';
import { authenticate } from '@/lib/repo/users';
import { startSession } from '@/lib/auth/server';
import { logActivity } from '@/lib/repo/activity';

export async function POST(request: Request) {
  return handle(async () => {
    const payload = await body<{ identifier?: string; password?: string }>(request);
    const identifier = text(payload.identifier, 'Login Id');
    const password = text(payload.password, 'Password');

    const user = await authenticate(identifier, password);
    if (!user) throw new HttpError(INVALID_CREDENTIALS, 401);

    await startSession(user.id);
    logActivity({
      userId: user.id,
      userName: user.name,
      action: 'SIGN_IN',
      entityType: 'user',
      entityId: user.id,
      summary: `${user.name} signed in`,
    });

    return { user: { id: user.id, name: user.name, role: user.role } };
  });
}
