import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  CircleAlert,
  ClipboardList,
  Package,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  TriangleAlert,
  Warehouse,
} from 'lucide-react';
import { dashboardSnapshot, lowStockProducts, reorderSuggestions } from '@/lib/repo/insights';
import { listActivity } from '@/lib/repo/activity';
import { TYPE_META } from '@/lib/domain/constants';
import { formatMoney, formatNumber, formatQty, relativeTime } from '@/lib/format';
import { PageHeader, Badge, Button, Card, cx, HealthPill, ProgressBar } from '@/components/ui/primitives';
import { BarList, Gauge, MovementChart, ScheduleStrip } from '@/components/app/charts';
import { Delta, Legend, SectionCard, StatTile, TBody, TD, TH, THead, Table } from '@/components/app/ui';
import { PrintButton } from '@/components/app/filters';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const snapshot = dashboardSnapshot({ days: 14 });
  const alerts = lowStockProducts(6);
  const supply = reorderSuggestions(5);
  const activity = listActivity({ limit: 7 });
  const { totals, health, documents, series, warehouses, schedule, systemHealth } = snapshot;

  const openOperations = documents.pending.RECEIPT + documents.pending.DELIVERY + documents.pending.TRANSFER + documents.pending.ADJUSTMENT;
  const supplyValue = supply.reduce((sum, row) => sum + row.estimatedCost, 0);
  const healthTotal = Math.max(1, health.healthy + health.low + health.out);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        subtitle="A live read of every warehouse: what is on the shelves, what is moving, and what needs attention today."
        actions={
          <>
            <Link href="/operations/receipts?new=1">
              <Button size="sm" icon={<ArrowDownToLine size={15} />}>
                Receive stock
              </Button>
            </Link>
            <Link href="/moves">
              <Button size="sm" variant="outline" icon={<ClipboardList size={15} />}>
                Stock ledger
              </Button>
            </Link>
            <PrintButton />
          </>
        }
      />

      {/* ------------------------------------------------------------- alerts */}
      {systemHealth.balanced ? (
        <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border border-emerald-200 bg-emerald-50/70 px-4 py-3 dark:border-emerald-500/25 dark:bg-emerald-500/10">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
            <ShieldCheck size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-emerald-800 dark:text-emerald-300">Ledger balanced</p>
            <p className="text-[12px] text-emerald-700/80 dark:text-emerald-400/80">
              Every balance matches the sum of its movements — checked {relativeTime(systemHealth.checkedAt)}.
            </p>
          </div>
          <Link href="/settings/data" className="no-print">
            <Button size="sm" variant="ghost">
              Integrity tools
            </Button>
          </Link>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border border-amber-200 bg-amber-50/70 px-4 py-3 dark:border-amber-500/25 dark:bg-amber-500/10">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
            <TriangleAlert size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-amber-800 dark:text-amber-300">
              {systemHealth.driftRows + systemHealth.negativeRows} balance row(s) disagree with the ledger
            </p>
            <p className="text-[12px] text-amber-700/80 dark:text-amber-400/80">
              Recompute balances from the movement history to bring them back in line.
            </p>
          </div>
          <Link href="/settings/data">
            <Button size="sm" variant="secondary">
              Open integrity tools
            </Button>
          </Link>
        </div>
      )}

      {/* ---------------------------------------------------------------- KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Stock value"
          value={formatMoney(totals.value, { compact: true })}
          hint={`${formatNumber(totals.onHand)} units across ${formatNumber(totals.products)} SKUs`}
          icon={<Boxes size={16} />}
          accent="indigo"
          href="/products"
        />
        <StatTile
          label="Free to use"
          value={formatQty(Math.max(0, totals.onHand - totals.reserved))}
          hint={`${formatQty(totals.reserved)} reserved against open documents`}
          icon={<Package size={16} />}
          accent="emerald"
          footer={<ProgressBar value={totals.onHand ? ((totals.onHand - totals.reserved) / totals.onHand) * 100 : 0} tone="bg-emerald-500" />}
        />
        <StatTile
          label="Attention needed"
          value={formatNumber(health.low + health.out)}
          hint={health.out > 0 ? `${health.out} out of stock · ${health.low} below reorder point` : `${health.low} below reorder point`}
          icon={<TriangleAlert size={16} />}
          accent={health.out > 0 ? 'rose' : 'amber'}
          href="/products?health=OUT_OF_STOCK"
        />
        <StatTile
          label="Open operations"
          value={formatNumber(openOperations)}
          hint={`${documents.throughput.receipts + documents.throughput.deliveries + documents.throughput.transfers + documents.throughput.adjustments} completed in 30 days`}
          icon={<ClipboardList size={16} />}
          accent="violet"
          footer={
            <div className="flex flex-wrap gap-1.5">
              {(['RECEIPT', 'DELIVERY', 'TRANSFER', 'ADJUSTMENT'] as const).map((type) => (
                <Link key={type} href={TYPE_META[type].href} className="no-print">
                  <Badge tone="neutral">
                    {TYPE_META[type].plural} · {documents.pending[type]}
                  </Badge>
                </Link>
              ))}
            </div>
          }
        />
      </div>

      {/* -------------------------------------------------------------- charts */}
      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <SectionCard
          title="Stock movement"
          subtitle="Units moved in and out over the last 14 days"
          action={<Legend items={[{ label: 'In', tone: 'emerald' }, { label: 'Out', tone: 'sky' }]} />}
        >
          <MovementChart series={series} />
        </SectionCard>

        <SectionCard title="Stock health" subtitle="Active SKUs by reorder position">
          <div className="space-y-4">
            <Gauge
              value={health.healthy}
              max={healthTotal}
              tone="emerald"
              label={`${formatNumber(health.healthy)} SKUs are comfortably above their reorder point.`}
            />
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-amber-200/70 bg-amber-50/60 p-3 dark:border-amber-500/20 dark:bg-amber-500/10">
                <p className="text-[11.5px] font-medium uppercase tracking-wide text-amber-700/80 dark:text-amber-300/80">Low stock</p>
                <p className="tnum mt-1 text-[20px] font-semibold text-amber-800 dark:text-amber-200">{formatNumber(health.low)}</p>
              </div>
              <div className="rounded-xl border border-rose-200/70 bg-rose-50/60 p-3 dark:border-rose-500/20 dark:bg-rose-500/10">
                <p className="text-[11.5px] font-medium uppercase tracking-wide text-rose-700/80 dark:text-rose-300/80">Out of stock</p>
                <p className="tnum mt-1 text-[20px] font-semibold text-rose-800 dark:text-rose-200">{formatNumber(health.out)}</p>
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr_1fr]">
        <SectionCard title="Value by category" subtitle="Stocked value at cost price">
          <BarList
            items={snapshot.valueByCategory.map((row) => ({
              label: row.name,
              value: row.value,
              secondary: `${formatNumber(row.quantity)} units`,
              tone: row.color,
            }))}
            valueFormatter={(value) => formatMoney(value, { compact: true })}
          />
        </SectionCard>

        <SectionCard title="Top movers" subtitle="Most moved products in the last 30 days" action={<TrendingUp size={15} className="text-ink-400" />}>
          {snapshot.topMoving.length ? (
            <ul className="space-y-3">
              {snapshot.topMoving.map((row) => (
                <li key={row.productId} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/products/${row.productId}`} className="focus-ring truncate rounded text-[13px] font-medium text-ink-800 hover:text-brand-600 dark:text-ink-100 dark:hover:text-brand-400">
                      {row.name}
                    </Link>
                    <p className="text-[11.5px] text-ink-400">{row.sku}</p>
                  </div>
                  <div className="text-right">
                    <p className="tnum text-[13px] font-semibold text-ink-800 dark:text-ink-100">{formatNumber(row.moved)}</p>
                    <p className="text-[11px] text-ink-400">
                      <span className="text-emerald-600 dark:text-emerald-400">+{formatNumber(row.inQty)}</span> /{' '}
                      <span className="text-sky-600 dark:text-sky-400">-{formatNumber(row.outQty)}</span>
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-[12.5px] text-ink-400">No movements recorded yet.</p>
          )}
        </SectionCard>

        <SectionCard title="Upcoming schedule" subtitle="Open receipts, deliveries and transfers" action={<Link href="/operations/receipts" className="text-[12px] font-medium text-brand-600 dark:text-brand-400">All operations</Link>}>
          <ScheduleStrip days={schedule} />
          <div className="mt-3 border-t border-ink-100 pt-3 dark:border-ink-800">
            <Legend
              items={[
                { label: 'Receipts', tone: 'emerald' },
                { label: 'Deliveries', tone: 'sky' },
                { label: 'Transfers', tone: 'violet' },
              ]}
            />
          </div>
        </SectionCard>
      </div>

      {/* ------------------------------------------------------------ warehouses */}
      <SectionCard
        title="Warehouses"
        subtitle="Stock distribution and capacity by site"
        action={
          <Link href="/settings/warehouses" className="no-print">
            <Button size="sm" variant="outline" icon={<Warehouse size={14} />}>
              Manage
            </Button>
          </Link>
        }
        bodyClassName="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3"
      >
        {warehouses.map((warehouse) => (
          <div key={warehouse.warehouseId} className="rounded-xl border border-ink-200/80 p-4 dark:border-ink-800">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-semibold text-ink-900 dark:text-white">{warehouse.name}</p>
                <p className="text-[11.5px] text-ink-400">Code {warehouse.shortCode}</p>
              </div>
              <Badge tone="brand">{formatNumber(warehouse.locations)} bins</Badge>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
              <div>
                <p className="text-ink-400">SKUs</p>
                <p className="tnum font-semibold text-ink-800 dark:text-ink-100">{formatNumber(warehouse.skus)}</p>
              </div>
              <div>
                <p className="text-ink-400">On hand</p>
                <p className="tnum font-semibold text-ink-800 dark:text-ink-100">{formatNumber(warehouse.quantity)}</p>
              </div>
              <div>
                <p className="text-ink-400">Value</p>
                <p className="tnum font-semibold text-ink-800 dark:text-ink-100">{formatMoney(warehouse.value, { compact: true })}</p>
              </div>
            </div>
          </div>
        ))}
      </SectionCard>

      {/* ------------------------------------------------------------ worklists */}
      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <SectionCard
          title="Reorder now"
          subtitle="Products at or below their reorder point"
          action={
            <Link href="/products?health=LOW_STOCK" className="no-print">
              <Button size="sm" variant="ghost">
                View all
              </Button>
            </Link>
          }
          bodyClassName=""
        >
          {alerts.length ? (
            <Table minWidth={640}>
              <THead>
                <tr>
                  <TH>Product</TH>
                  <TH align="right">On hand</TH>
                  <TH align="right">Free</TH>
                  <TH align="right">Reorder at</TH>
                  <TH align="right">Suggested</TH>
                  <TH>Status</TH>
                </tr>
              </THead>
              <TBody>
                {alerts.map((product) => (
                  <tr key={product.id} className="hover:bg-ink-50 dark:hover:bg-ink-800/40">
                    <TD>
                      <Link href={`/products/${product.id}`} className="focus-ring rounded">
                        <span className="block text-[13px] font-medium text-ink-800 dark:text-ink-100">{product.name}</span>
                        <span className="block text-[11.5px] text-ink-400">
                          {product.sku} · {product.categoryName ?? 'Uncategorised'}
                        </span>
                      </Link>
                    </TD>
                    <TD align="right">{formatQty(product.onHand, product.uom)}</TD>
                    <TD align="right">{formatQty(product.freeToUse, product.uom)}</TD>
                    <TD align="right">{formatQty(product.reorderPoint, product.uom)}</TD>
                    <TD align="right" className="font-semibold">{formatQty(product.suggestedQty, product.uom)}</TD>
                    <TD>
                      <HealthPill health={product.health} />
                    </TD>
                  </tr>
                ))}
              </TBody>
            </Table>
          ) : (
            <p className="px-5 py-10 text-center text-[13px] text-ink-400">Every product is above its reorder point. Nice.</p>
          )}
        </SectionCard>

        <div className="space-y-4">
          <SectionCard
            title="Procurement plan"
            subtitle="Estimated spend to restore safe levels"
            action={<Sparkles size={15} className="text-ink-400" />}
          >
            <p className="tnum text-[24px] font-semibold tracking-tight text-ink-900 dark:text-white">{formatMoney(supplyValue, { compact: true })}</p>
            <p className="mt-1 text-[12px] text-ink-500 dark:text-ink-400">
              Across {supply.length} product{supply.length === 1 ? '' : 's'} that are short right now.
            </p>
            <ul className="mt-4 space-y-2">
              {supply.map((row) => (
                <li key={row.productId} className="flex items-center justify-between gap-3 text-[12.5px]">
                  <Link href={`/products/${row.productId}`} className="focus-ring truncate rounded text-ink-700 hover:text-brand-600 dark:text-ink-200 dark:hover:text-brand-400">
                    {row.name}
                  </Link>
                  <span className="tnum shrink-0 text-ink-500 dark:text-ink-400">
                    {formatQty(row.suggestedQty, row.uom)} · {formatMoney(row.estimatedCost, { compact: true })}
                  </span>
                </li>
              ))}
              {supply.length === 0 ? <li className="text-[12.5px] text-ink-400">Nothing to buy right now.</li> : null}
            </ul>
            <div className="mt-4 flex gap-2">
              <Link href="/operations/receipts?new=1">
                <Button size="sm" icon={<ArrowDownToLine size={14} />}>
                  Raise a receipt
                </Button>
              </Link>
              <Link href="/settings/catalog">
                <Button size="sm" variant="outline">
                  Reorder rules
                </Button>
              </Link>
            </div>
          </SectionCard>

          <SectionCard
            title="Recent activity"
            subtitle="What your team has been doing"
            action={
              <Link href="/settings/activity" className="no-print text-[12px] font-medium text-brand-600 dark:text-brand-400">
                Full log
              </Link>
            }
          >
            {activity.items.length ? (
              <ol className="space-y-3">
                {activity.items.map((entry) => (
                  <li key={entry.id} className="flex gap-3">
                    <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-300">
                      {entry.action.startsWith('SIGN') ? <CircleAlert size={13} /> : <ClipboardList size={13} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] text-ink-700 dark:text-ink-200">{entry.summary ?? entry.action}</span>
                      <span className="block text-[11px] text-ink-400">
                        {entry.userName ?? 'System'} · {relativeTime(entry.createdAt)}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="py-6 text-center text-[12.5px] text-ink-400">No activity recorded yet.</p>
            )}
          </SectionCard>
        </div>
      </div>

      {/* ------------------------------------------------------------- footer */}
      <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
            <Sparkles size={16} />
          </span>
          <div>
            <p className="text-[13px] font-semibold text-ink-900 dark:text-white">Throughput this month</p>
            <p className="text-[12px] text-ink-500 dark:text-ink-400">
              {documents.throughput.receipts} receipts · {documents.throughput.deliveries} deliveries · {documents.throughput.transfers} transfers ·{' '}
              {documents.throughput.adjustments} adjustments
            </p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-wide text-ink-400">Avg. cycle</p>
            <p className="tnum text-[15px] font-semibold text-ink-800 dark:text-ink-100">
              {documents.throughput.avgCycleHours === null ? '—' : `${documents.throughput.avgCycleHours.toFixed(1)} h`}
            </p>
          </div>
          <Delta value={documents.throughput.deliveries - documents.throughput.receipts} suffix=" net out" />
          <Link href="/moves" className="no-print">
            <Button size="sm" variant="secondary" icon={<ArrowUpFromLine size={14} />}>
              Inspect ledger
            </Button>
          </Link>
        </div>
      </Card>
      <p className="text-center text-[11.5px] text-ink-400">
        Snapshot generated {relativeTime(snapshot.generatedAt)} · {cx('tnum')} {formatNumber(totals.onHand)} units tracked
      </p>
    </div>
  );
}
