import { body, handle, text } from '@/lib/http';
import { findUserByIdentifier, issueOtp } from '@/lib/repo/users';
import { logger } from '@/lib/logger';

const DEV_ECHO = () => process.env.OTP_DEV_ECHO !== 'false';

/**
 * Starts the "forgot password" flow. The account is never confirmed to the
 * caller: a missing account yields the same response as a present one.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const payload = await body<{ identifier?: string }>(request);
    const identifier = text(payload.identifier, 'Login Id or email');
    const user = findUserByIdentifier(identifier);

    if (!user) {
      return { ok: true, sent: true, destination: null, otp: null as string | null };
    }

    const destination = user.email;
    const code = issueOtp(user.id, destination);
    logger.info(`otp: issued a password reset code for ${user.loginId}`);
    return {
      ok: true,
      sent: true,
      destination,
      otp: DEV_ECHO() ? code : null,
    };
  });
}
