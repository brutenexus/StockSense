import type { Metadata } from 'next';
import { Database, FileText, Package, Users } from 'lucide-react';
import { checkHealth } from '@/lib/repo/insights';
import { listMoves, stockTotals } from '@/lib/repo/inventory';
import { listProducts } from '@/lib/repo/catalog';
import { listDocuments } from '@/lib/repo/documents';
import { listUsers } from '@/lib/repo/users';
import { dbFile } from '@/lib/db';
import { requireUser } from '@/lib/auth/server';
import { can } from '@/lib/domain/constants';
import { formatMoney, formatNumber } from '@/lib/format';
import { Badge, PageHeader } from '@/components/ui/primitives';
import { MetaGrid, SectionCard, StatTile } from '@/components/app/ui';
import { SettingsNav } from '@/components/app/settings-nav';
import { DataTools } from '@/components/app/data-tools';

export const metadata: Metadata = { title: 'Data tools' };

export default async function DataSettingsPage() {
  const user = await requireUser('/settings/data');
  const health = checkHealth();
  const totals = stockTotals();
  const counters = {
    products: listProducts({ limit: 1 }).total,
    documents: listDocuments({ limit: 1 }).total,
    moves: listMoves({ limit: 1 }).total,
    users: listUsers().length,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Data tools"
        subtitle="Verify that the balances still agree with the ledger, rebuild them if they ever drift, and reset the demo dataset."
        actions={<Badge tone={health.balanced ? 'success' : 'warning'} dot>{health.balanced ? 'Ledger balanced' : 'Drift detected'}</Badge>}
      />

      <SettingsNav active="data" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Products" value={formatNumber(counters.products)} hint={`${formatNumber(totals.products)} with stock on hand`} icon={<Package size={16} />} />
        <StatTile label="Documents" value={formatNumber(counters.documents)} hint="Receipts, deliveries, transfers and counts" icon={<FileText size={16} />} accent="sky" />
        <StatTile label="Ledger rows" value={formatNumber(counters.moves)} hint={`${formatMoney(totals.value, { compact: true })} of stock at cost`} icon={<Database size={16} />} accent="violet" />
        <StatTile label="People" value={formatNumber(counters.users)} hint="Accounts that can sign in" icon={<Users size={16} />} accent="emerald" />
      </div>

      <SectionCard title="Integrity & maintenance" subtitle="Safe operations you can run at any time">
        <DataTools initialHealth={health} canManage={can(user.role, 'manage_settings')} />
      </SectionCard>

      <SectionCard title="How stock stays honest" subtitle="The two invariants behind every number in the app">
        <div className="space-y-4 text-[13px] leading-relaxed text-ink-600 dark:text-ink-300">
          <div className="rounded-xl bg-ink-50 p-4 dark:bg-ink-800/50">
            <p className="font-semibold text-ink-800 dark:text-ink-100">One movement, one row</p>
            <p className="mt-1">
              Every balance change is written to <span className="font-mono text-[12px]">stock_moves</span>. A transfer posts two rows — an out of
              the source and an in to the destination — so filtering the ledger by location always tells the whole truth.
            </p>
          </div>
          <div className="rounded-xl bg-ink-50 p-4 dark:bg-ink-800/50">
            <p className="font-semibold text-ink-800 dark:text-ink-100">Balances are derived, never invented</p>
            <p className="mt-1">
              Stock updates from the product page do not write a balance directly. They book an adjustment document, confirm it, validate it and
              only then touch the balance — which is why every correction has a reference and an author.
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Storage" subtitle="Where this instance keeps its data">
        <MetaGrid
          columns={3}
          items={[
            { label: 'Database file', value: <span className="font-mono text-[12px]">{dbFile()}</span> },
            { label: 'Engine', value: 'SQLite via node:sqlite (WAL)' },
            { label: 'Migrations', value: 'Applied automatically on boot' },
            { label: 'Last integrity check', value: health.checkedAt.replace('T', ' ').slice(0, 19) },
            { label: 'Drifted rows', value: health.driftRows },
            { label: 'Negative balances', value: health.negativeRows },
          ]}
        />
      </SectionCard>
    </div>
  );
}
