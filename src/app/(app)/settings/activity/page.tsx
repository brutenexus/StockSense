import type { Metadata } from 'next';
import Link from 'next/link';
import { History } from 'lucide-react';
import { listActivity, listNotifications, unreadNotificationCount } from '@/lib/repo/activity';
import { requireUser } from '@/lib/auth/server';
import { formatDateTime, relativeTime } from '@/lib/format';
import { Avatar, Badge, PageHeader } from '@/components/ui/primitives';
import { Pagination } from '@/components/ui/nav';
import { ActiveFilters, ExportButton, SearchField } from '@/components/app/filters';
import { SectionCard, StatTile, TBody, TD, TH, THead, Table } from '@/components/app/ui';
import { SettingsNav } from '@/components/app/settings-nav';
import { NotificationsPanel } from '@/components/app/notifications-panel';

export const metadata: Metadata = { title: 'Activity' };

const PAGE_SIZE = 30;

export default async function ActivitySettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser('/settings/activity');
  const params = await searchParams;
  const search = (Array.isArray(params.q) ? params.q[0] : params.q) ?? '';
  const page = Math.max(1, Number((Array.isArray(params.page) ? params.page[0] : params.page) ?? 1) || 1);

  const activity = listActivity({ search: search || undefined, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const notifications = listNotifications({ limit: 25 });
  const unread = unreadNotificationCount();

  const buildHref = (pageNumber: number) => {
    const next = new URLSearchParams();
    if (search) next.set('q', search);
    next.set('page', String(pageNumber));
    return `/settings/activity?${next.toString()}`;
  };

  const exportRows = activity.items.map((entry) => ({
    when: entry.createdAt,
    user: entry.userName ?? 'System',
    action: entry.action,
    entityType: entry.entityType ?? '',
    entityId: entry.entityId ?? '',
    summary: entry.summary ?? '',
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Activity & alerts"
        subtitle="An append-only audit trail of everything anyone did, plus the live stock alerts that need attention."
        actions={<ExportButton rows={exportRows} filename="stocksense-activity.csv" />}
      />

      <SettingsNav active="activity" />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Recorded actions" value={activity.total.toLocaleString('en-IN')} hint="Across every module" icon={<History size={16} />} />
        <StatTile label="Unread alerts" value={unread} hint="Low stock, out of stock, documents done" accent={unread ? 'amber' : 'emerald'} />
        <StatTile
          label="Latest action"
          value={activity.items[0] ? relativeTime(activity.items[0].createdAt) : '—'}
          hint={activity.items[0]?.summary ?? 'Nothing recorded yet'}
          accent="sky"
        />
      </div>

      <SectionCard title="Stock alerts" subtitle="Raised automatically as balances cross their reorder points" action={<Badge tone={unread ? 'warning' : 'success'}>{unread ? `${unread} unread` : 'All read'}</Badge>}>
        <NotificationsPanel items={notifications} unread={unread} />
      </SectionCard>

      <SectionCard title="Audit trail" subtitle="Who did what, and when" action={<SearchField placeholder="Search actions, users, summaries…" className="w-full sm:w-72" />} bodyClassName="">
        <ActiveFilters labels={[]} />
        <Table minWidth={960}>
          <THead>
            <tr>
              <TH>When</TH>
              <TH>Who</TH>
              <TH>Action</TH>
              <TH>Entity</TH>
              <TH>Summary</TH>
            </tr>
          </THead>
          <TBody>
            {activity.items.map((entry) => (
              <tr key={entry.id} className="hover:bg-ink-50 dark:hover:bg-ink-800/40">
                <TD className="whitespace-nowrap">
                  <span className="block text-[12.5px] text-ink-700 dark:text-ink-200">{formatDateTime(entry.createdAt)}</span>
                  <span className="block text-[11px] text-ink-400">{relativeTime(entry.createdAt)}</span>
                </TD>
                <TD>
                  <span className="flex items-center gap-2">
                    <Avatar name={entry.userName ?? 'System'} size={26} />
                    <span className="text-[12.5px] text-ink-700 dark:text-ink-200">{entry.userName ?? 'System'}</span>
                  </span>
                </TD>
                <TD>
                  <Badge tone="neutral">{entry.action.replace(/_/g, ' ').toLowerCase()}</Badge>
                </TD>
                <TD className="text-[12px]">
                  {entry.entityType === 'document' && entry.entityId ? (
                    <Link href={`/operations/find/${entry.entityId}`} className="font-medium text-brand-600 dark:text-brand-400">
                      document
                    </Link>
                  ) : entry.entityType === 'product' && entry.entityId ? (
                    <Link href={`/products/${entry.entityId}`} className="font-medium text-brand-600 dark:text-brand-400">
                      product
                    </Link>
                  ) : (
                    <span className="text-ink-400">{entry.entityType ?? '—'}</span>
                  )}
                </TD>
                <TD className="text-[12.5px] text-ink-600 dark:text-ink-300">{entry.summary ?? '—'}</TD>
              </tr>
            ))}
            {activity.items.length === 0 ? (
              <tr>
                <TD colSpan={5} className="py-12 text-center text-[12.5px] text-ink-400">
                  Nothing recorded yet.
                </TD>
              </tr>
            ) : null}
          </TBody>
        </Table>
      </SectionCard>

      <Pagination page={page} pageSize={PAGE_SIZE} total={activity.total} buildHref={buildHref} />
    </div>
  );
}
