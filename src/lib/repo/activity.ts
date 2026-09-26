import { all, get, nowIso, run, scalar, tx, uid } from '../db';
import type { NotificationKind } from '../domain/constants';

export type NotificationRow = {
  id: string;
  kind: NotificationKind;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  dedupeKey: string | null;
  isRead: number;
  createdAt: string;
};

const NOTIFICATION_COLUMNS = `id, kind, severity, title, body, entity_type AS entityType, entity_id AS entityId,
  dedupe_key AS dedupeKey, is_read AS isRead, created_at AS createdAt`;

export function listNotifications(opts: { unreadOnly?: boolean; limit?: number } = {}): NotificationRow[] {
  const where = opts.unreadOnly ? 'WHERE is_read = 0' : '';
  return all<NotificationRow>(
    `SELECT ${NOTIFICATION_COLUMNS} FROM notifications ${where} ORDER BY is_read ASC, created_at DESC LIMIT ?`,
    [Math.min(opts.limit ?? 50, 200)],
  );
}

export function unreadNotificationCount(): number {
  return Number(scalar<number>('SELECT COUNT(*) FROM notifications WHERE is_read = 0') ?? 0);
}

export function markNotificationRead(id: string, read = true): void {
  run('UPDATE notifications SET is_read = ? WHERE id = ?', [read ? 1 : 0, id]);
}

export function markAllNotificationsRead(): void {
  run('UPDATE notifications SET is_read = 1 WHERE is_read = 0');
}

export function pushNotification(input: {
  kind: NotificationKind;
  severity?: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  body?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  dedupeKey?: string | null;
}): void {
  run(
    `INSERT INTO notifications (id, kind, severity, title, body, entity_type, entity_id, dedupe_key, is_read, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
     ON CONFLICT(dedupe_key) DO UPDATE SET
       title = excluded.title, body = excluded.body, severity = excluded.severity,
       is_read = 0, created_at = excluded.created_at`,
    [
      uid.next('ntf'),
      input.kind,
      input.severity ?? 'INFO',
      input.title,
      input.body ?? null,
      input.entityType ?? null,
      input.entityId ?? null,
      input.dedupeKey ?? null,
      nowIso(),
    ],
  );
}

/**
 * Recomputes low/out-of-stock alerts so the bell always reflects reality:
 * a fresh problem raises an unread notification, and a resolved one is
 * archived automatically.
 */
export function syncStockAlerts(): { low: number; out: number } {
  return tx(() => {
    const rows = all<{
      id: string;
      name: string;
      sku: string;
      uom: string;
      onHand: number;
      reserved: number;
      reorderPoint: number;
      reorderQty: number;
    }>(
      `SELECT p.id, p.name, p.sku, p.uom, p.reorder_point AS reorderPoint, p.reorder_qty AS reorderQty,
              COALESCE((SELECT SUM(b.quantity) FROM stock_balances b WHERE b.product_id = p.id), 0) AS onHand,
              COALESCE((SELECT SUM(b.reserved) FROM stock_balances b WHERE b.product_id = p.id), 0) AS reserved
       FROM products p WHERE p.is_active = 1`,
    );
    let low = 0;
    let out = 0;
    const healthy: string[] = [];
    for (const row of rows) {
      const free = Math.max(0, row.onHand - row.reserved);
      if (row.onHand <= 0) {
        out += 1;
        pushNotification({
          kind: 'OUT_OF_STOCK',
          severity: 'CRITICAL',
          title: `${row.name} is out of stock`,
          body: `SKU ${row.sku} has no stock on hand. Reorder quantity ${row.reorderQty || 'not set'} ${row.uom}.`,
          entityType: 'product',
          entityId: row.id,
          dedupeKey: `out:${row.id}`,
        });
      } else if (free <= row.reorderPoint) {
        low += 1;
        pushNotification({
          kind: 'LOW_STOCK',
          severity: 'WARNING',
          title: `${row.name} is below its reorder point`,
          body: `Free to use ${free} ${row.uom} against a reorder point of ${row.reorderPoint} ${row.uom}.`,
          entityType: 'product',
          entityId: row.id,
          dedupeKey: `low:${row.id}`,
        });
      } else {
        healthy.push(row.id);
      }
    }
    if (healthy.length) {
      const keys = [...healthy.map((id) => `low:${id}`), ...healthy.map((id) => `out:${id}`)];
      run(
        `UPDATE notifications SET is_read = 1 WHERE is_read = 0 AND dedupe_key IN (${keys.map(() => '?').join(',')})`,
        keys,
      );
    }
    return { low, out };
  });
}

export type ActivityRow = {
  id: string;
  userId: string | null;
  userName: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  summary: string | null;
  meta: string | null;
  createdAt: string;
};

export function logActivity(input: {
  userId?: string | null;
  userName?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  summary?: string | null;
  meta?: Record<string, unknown> | null;
}): void {
  run(
    `INSERT INTO activity_log (id, user_id, user_name, action, entity_type, entity_id, summary, meta, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uid.next('act'),
      input.userId ?? null,
      input.userName ?? null,
      input.action,
      input.entityType ?? null,
      input.entityId ?? null,
      input.summary ?? null,
      input.meta ? JSON.stringify(input.meta) : null,
      nowIso(),
    ],
  );
}

export function listActivity(opts: { limit?: number; offset?: number; search?: string; entityType?: string } = {}): {
  items: ActivityRow[];
  total: number;
} {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (opts.search) {
    clauses.push('(summary LIKE ? OR action LIKE ? OR user_name LIKE ?)');
    const term = `%${opts.search}%`;
    params.push(term, term, term);
  }
  if (opts.entityType) {
    clauses.push('entity_type = ?');
    params.push(opts.entityType);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const total = Number(scalar<number>(`SELECT COUNT(*) FROM activity_log ${where}`, params) ?? 0);
  const items = all<ActivityRow>(
    `SELECT id, user_id AS userId, user_name AS userName, action, entity_type AS entityType,
            entity_id AS entityId, summary, meta, created_at AS createdAt
     FROM activity_log ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, Math.min(opts.limit ?? 50, 200), Math.max(opts.offset ?? 0, 0)],
  );
  return { items, total };
}

export function activityForEntity(entityId: string, limit = 20): ActivityRow[] {
  return all<ActivityRow>(
    `SELECT id, user_id AS userId, user_name AS userName, action, entity_type AS entityType,
            entity_id AS entityId, summary, meta, created_at AS createdAt
     FROM activity_log WHERE entity_id = ? ORDER BY created_at DESC LIMIT ?`,
    [entityId, limit],
  );
}

export function recentActivityCounters(): { actionsToday: number; usersActive7d: number } {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const week = new Date(Date.now() - 7 * 86_400_000).toISOString();
  return {
    actionsToday: Number(scalar<number>('SELECT COUNT(*) FROM activity_log WHERE created_at >= ?', [startOfDay.toISOString()]) ?? 0),
    usersActive7d: Number(scalar<number>('SELECT COUNT(DISTINCT user_id) FROM activity_log WHERE created_at >= ?', [week]) ?? 0),
  };
}

export function findNotification(id: string): NotificationRow | undefined {
  return get<NotificationRow>(`SELECT ${NOTIFICATION_COLUMNS} FROM notifications WHERE id = ?`, [id]);
}
