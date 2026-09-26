import { apiUser, body, handle, intParam, notFound, oneOf, optionalText, query } from '@/lib/http';
import {
  findNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  syncStockAlerts,
  unreadNotificationCount,
} from '@/lib/repo/activity';

const ACTIONS = ['read', 'unread', 'read-all', 'sync'] as const;

export async function GET(request: Request) {
  return handle(async () => {
    await apiUser();
    const source = query(request);
    const items = listNotifications({
      unreadOnly: source.get('unread') === '1',
      limit: intParam(source, 'limit', 20),
    });
    return { items, unread: unreadNotificationCount() };
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    await apiUser();
    const payload = await body<{ action?: string; id?: string }>(request);
    const action = oneOf(payload.action, ACTIONS, 'Action');

    if (action === 'read-all') {
      markAllNotificationsRead();
    } else if (action === 'sync') {
      const result = syncStockAlerts();
      return { ok: true, ...result, unread: unreadNotificationCount() };
    } else {
      const id = optionalText(payload.id);
      if (!id) notFound('Which notification?');
      const notification = findNotification(id);
      if (!notification) notFound('That notification no longer exists.');
      markNotificationRead(id, action === 'read');
    }

    return { ok: true, unread: unreadNotificationCount() };
  });
}
