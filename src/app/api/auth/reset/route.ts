import { body, handle, HttpError, text } from '@/lib/http';
import { firstError, validatePassword, validatePasswordConfirmation } from '@/lib/domain/validation';
import { consumeOtp, findUserByIdentifier, setPassword, verifyOtp } from '@/lib/repo/users';
import { logActivity } from '@/lib/repo/activity';

export async function POST(request: Request) {
  return handle(async () => {
    const payload = await body<Record<string, unknown>>(request);
    const identifier = text(payload.identifier, 'Login Id or email');
    const code = text(payload.code, 'OTP');
    const password = text(payload.password, 'New password');
    const confirmPassword = String(payload.confirmPassword ?? '');

    const errors: Record<string, string> = {};
    const passwordError = validatePassword(password);
    if (passwordError) errors.password = passwordError;
    const confirmError = validatePasswordConfirmation(password, confirmPassword);
    if (confirmError) errors.confirmPassword = confirmError;
    if (Object.keys(errors).length) throw new HttpError(firstError({ ok: false, errors }), 400, errors);

    const user = findUserByIdentifier(identifier);
    // A wrong identifier should not reveal whether the account exists.
    if (!user) throw new HttpError('That OTP is not valid any more. Request a new one.', 400);

    const result = verifyOtp(user.id, code);
    if (!result.ok) throw new HttpError(result.reason, 400, { code: result.reason });

    await setPassword(user.id, password);
    consumeOtp(user.id);
    logActivity({
      userId: user.id,
      userName: user.name,
      action: 'PASSWORD_RESET',
      entityType: 'user',
      entityId: user.id,
      summary: `${user.name} reset their password`,
    });

    return { ok: true };
  });
}
