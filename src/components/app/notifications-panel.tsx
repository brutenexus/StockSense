'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BellRing, CircleAlert, Info, TriangleAlert } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { Button, cx } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';

export type NotificationItem = {
  id: string;
  kind: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  isRead: number;
  createdAt: string;
};

export function NotificationsPanel({ items, unread }: { items: NotificationItem[]; unread: number }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function markAll() {
    setBusy('all');
    try {
      await api('/api/notifications', { body: { action: 'read-all' } });
      toast.success('All caught up', 'Every alert is marked as read.');
      router.refresh();
    } catch (error) {
      toast.error('Could not update alerts', errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function sync() {
    setBusy('sync');
    try {
      const result = await api<{ low: number; out: number }>('/api/notifications', { body: { action: 'sync' } });
      toast.success('Alerts refreshed', `${result.low} low stock · ${result.out} out of stock.`);
      router.refresh();
    } catch (error) {
      toast.error('Could not refresh alerts', errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function toggle(item: NotificationItem) {
    setBusy(item.id);
    try {
      await api('/api/notifications', { body: { action: item.isRead ? 'unread' : 'read', id: item.id } });
      router.refresh();
    } catch (error) {
      toast.error('Could not update the alert', errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" icon={<BellRing size={14} />} loading={busy === 'sync'} onClick={sync}>
          Re-check stock levels
        </Button>
        <Button size="sm" variant="ghost" loading={busy === 'all'} disabled={unread === 0} onClick={markAll}>
          Mark all read
        </Button>
        <span className="text-[12px] text-ink-400">{unread} unread</span>
      </div>

      {items.length ? (
        <ul className="divide-y divide-ink-100 dark:divide-ink-800/70">
          {items.map((item) => (
            <li key={item.id} className="flex items-start gap-3 py-3">
              <span
                className={cx(
                  'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                  item.severity === 'CRITICAL'
                    ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400'
                    : item.severity === 'WARNING'
                      ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400'
                      : 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400',
                )}
              >
                {item.severity === 'CRITICAL' ? <CircleAlert size={14} /> : item.severity === 'WARNING' ? <TriangleAlert size={14} /> : <Info size={14} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cx('text-[13px]', item.isRead ? 'font-medium text-ink-600 dark:text-ink-300' : 'font-semibold text-ink-900 dark:text-white')}>{item.title}</p>
                {item.body ? <p className="mt-0.5 text-[12px] leading-relaxed text-ink-500 dark:text-ink-400">{item.body}</p> : null}
                <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-ink-400">
                  <span>{relativeTime(item.createdAt)}</span>
                  <span>·</span>
                  <span>{item.kind.replace(/_/g, ' ').toLowerCase()}</span>
                  {item.entityType === 'product' && item.entityId ? (
                    <Link href={`/products/${item.entityId}`} className="font-medium text-brand-600 dark:text-brand-400">
                      Open product
                    </Link>
                  ) : null}
                  {item.entityType === 'document' && item.entityId ? (
                    <Link href={`/operations/find/${item.entityId}`} className="font-medium text-brand-600 dark:text-brand-400">
                      Open document
                    </Link>
                  ) : null}
                </p>
              </div>
              <Button size="xs" variant="ghost" loading={busy === item.id} onClick={() => toggle(item)}>
                {item.isRead ? 'Mark unread' : 'Mark read'}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-10 text-center text-[12.5px] text-ink-400">No alerts — stock levels look healthy.</p>
      )}
    </div>
  );
}
