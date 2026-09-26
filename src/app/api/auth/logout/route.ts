import { handle } from '@/lib/http';
import { currentUser, endSession } from '@/lib/auth/server';
import { logActivity } from '@/lib/repo/activity';

export async function POST() {
  return handle(async () => {
    const user = await currentUser();
    if (user) {
      logActivity({
        userId: user.id,
        userName: user.name,
        action: 'SIGN_OUT',
        entityType: 'user',
        entityId: user.id,
        summary: `${user.name} signed out`,
      });
    }
    await endSession();
    return { ok: true };
  });
}
