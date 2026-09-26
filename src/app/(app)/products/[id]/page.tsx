import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowDownToLine, ArrowLeft, ArrowLeftRight, Boxes, Package, Scale, TrendingUp } from 'lucide-react';
import { getProduct, listCategories, listReorderRules } from '@/lib/repo/catalog';
import { productLedger } from '@/lib/repo/inventory';
import { documentsForProduct } from '@/lib/repo/documents';
import { productStockBreakdown } from '@/lib/repo/insights';
import { listLocations } from '@/lib/repo/warehouses';
import { can, TYPE_META } from '@/lib/domain/constants';
import { requireUser } from '@/lib/auth/server';
import { formatDate, formatDateTime, formatMoney, formatQty, relativeTime } from '@/lib/format';
import { Badge, Button, HealthPill, PageHeader, ProgressBar } from '@/components/ui/primitives';
import { SectionCard, StatTile, TBody, TD, TH, THead, Table } from '@/components/app/ui';
import { PrintButton } from '@/components/app/filters';
import { ProductForm } from '@/components/app/product-form';
import { StockForm, type StockLocationOption } from '@/components/app/stock-form';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const product = getProduct(id);
  return { title: product ? product.name : 'Product' };
}

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/products/${id}`);
  const product = getProduct(id);
  if (!product) notFound();

  const categories = listCategories();
  const balances = productStockBreakdown(product.id);
  const ledger = productLedger(product.id, 14);
  const documents = documentsForProduct(product.id, 8);
  const rules = listReorderRules(product.id);
  const rule = rules[0];

  const showCosts = can(user.role, 'view_costs');
  const canStock = can(user.role, 'create_adjustment') || can(user.role, 'manage_products');

  const balanceByLocation = new Map(balances.balances.map((row) => [row.locationId, row]));
  const stockLocations: StockLocationOption[] = listLocations({ internal: true }).map((location) => {
    const balance = balanceByLocation.get(location.id);
    return {
      id: location.id,
      label: `${location.warehouseName ?? location.warehouseCode} · ${location.shortCode}`,
      quantity: balance?.quantity ?? 0,
      reserved: balance?.reserved ?? 0,
    };
  });

  const inQty = ledger.filter((move) => move.direction === 'IN').reduce((sum, move) => sum + move.quantity, 0);
  const outQty = ledger.filter((move) => move.direction === 'OUT').reduce((sum, move) => sum + move.quantity, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={
          <Link href="/products" className="focus-ring inline-flex items-center gap-1 rounded text-brand-600 hover:text-brand-700 dark:text-brand-400">
            <ArrowLeft size={13} /> All products
          </Link>
        }
        eyebrow={product.categoryName ?? 'Uncategorised'}
        title={product.name}
        subtitle={product.description ?? `SKU ${product.sku}`}
        actions={
          <>
            {canStock ? (
              <StockForm
                productId={product.id}
                productName={product.name}
                uom={product.uom}
                locations={stockLocations}
                triggerLabel="Update stock"
                triggerVariant="primary"
                triggerSize="sm"
              />
            ) : null}
            {can(user.role, 'manage_products') ? (
              <ProductForm
                product={product}
                categories={categories.map((category) => ({ id: category.id, label: category.name }))}
                locations={stockLocations.map((location) => ({ id: location.id, label: location.label }))}
                triggerVariant="outline"
                triggerSize="sm"
              />
            ) : null}
            <Link href={`/operations/receipts?new=1&product=${product.id}`}>
              <Button size="sm" variant="outline" icon={<ArrowDownToLine size={14} />}>
                Receive
              </Button>
            </Link>
            <PrintButton />
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <HealthPill health={product.health} />
        {product.categoryName ? <Badge tone="neutral">{product.categoryName}</Badge> : null}
        <Badge tone="neutral">Unit: {product.uom}</Badge>
        {product.barcode ? <Badge tone="neutral">Barcode {product.barcode}</Badge> : null}
        {rule ? <Badge tone="brand">Reorder rule · min {formatQty(rule.minQty)} · buy {formatQty(rule.qtyToOrder)}</Badge> : null}
        {product.isActive === 0 ? <Badge tone="danger">Archived</Badge> : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="On hand"
          value={formatQty(balances.total, product.uom)}
          hint={`Across ${balances.balances.length} location${balances.balances.length === 1 ? '' : 's'}`}
          icon={<Boxes size={16} />}
        />
        <StatTile
          label="Free to use"
          value={formatQty(balances.free, product.uom)}
          hint={`${formatQty(balances.reserved, product.uom)} reserved for open documents`}
          icon={<Scale size={16} />}
          accent="emerald"
          footer={<ProgressBar value={balances.total > 0 ? (balances.free / balances.total) * 100 : 0} tone="bg-emerald-500" />}
        />
        <StatTile
          label="Reorder point"
          value={formatQty(product.reorderPoint, product.uom)}
          hint={`Suggested order ${formatQty(product.reorderQty, product.uom)}`}
          icon={<TrendingUp size={16} />}
          accent={product.health === 'HEALTHY' ? 'sky' : 'amber'}
        />
        {showCosts ? (
          <StatTile
            label="Stock value"
            value={formatMoney(product.stockValue, { compact: true })}
            hint={`${formatMoney(product.costPrice)} cost · ${formatMoney(product.salePrice)} sale`}
            icon={<Package size={16} />}
            accent="violet"
          />
        ) : (
          <StatTile label="Movements (recent)" value={formatQty(inQty + outQty, product.uom)} hint={`+${formatQty(inQty)} in · -${formatQty(outQty)} out`} icon={<ArrowLeftRight size={16} />} accent="violet" />
        )}
      </div>

      <SectionCard
        title="Stock by location"
        subtitle="Where this product physically sits right now"
        action={canStock ? <StockForm productId={product.id} productName={product.name} uom={product.uom} locations={stockLocations} triggerLabel="Update stock" /> : null}
        bodyClassName=""
      >
        {balances.balances.length ? (
          <Table minWidth={720}>
            <THead>
              <tr>
                <TH>Location</TH>
                <TH>Warehouse</TH>
                <TH align="right">On hand</TH>
                <TH align="right">Reserved</TH>
                <TH align="right">Free to use</TH>
                <TH align="right">Updated</TH>
                <TH align="right" />
              </tr>
            </THead>
            <TBody>
              {balances.balances.map((balance) => (
                <tr key={balance.locationId} className="hover:bg-ink-50 dark:hover:bg-ink-800/40">
                  <TD>
                    <span className="block text-[13px] font-medium text-ink-800 dark:text-ink-100">{balance.locationName}</span>
                    <span className="block text-[11.5px] text-ink-400">{balance.locationCode}</span>
                  </TD>
                  <TD>{balance.warehouseName}</TD>
                  <TD align="right">{formatQty(balance.quantity, product.uom)}</TD>
                  <TD align="right">{formatQty(balance.reserved, product.uom)}</TD>
                  <TD align="right" className="font-medium">{formatQty(Math.max(0, balance.quantity - balance.reserved), product.uom)}</TD>
                  <TD align="right" className="text-[12px] text-ink-400">{relativeTime(balance.updatedAt)}</TD>
                  <TD align="right">
                    {canStock ? (
                      <StockForm
                        productId={product.id}
                        productName={product.name}
                        uom={product.uom}
                        locations={stockLocations}
                        initialLocationId={balance.locationId}
                        triggerLabel="Adjust"
                        triggerSize="xs"
                      />
                    ) : null}
                  </TD>
                </tr>
              ))}
            </TBody>
          </Table>
        ) : (
          <div className="px-6 py-12 text-center">
            <p className="text-[13.5px] font-semibold text-ink-800 dark:text-ink-100">No stock recorded yet</p>
            <p className="mt-1 text-[12.5px] text-ink-500 dark:text-ink-400">
              Receive this product against a purchase order, or record an opening count.
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <Link href={`/operations/receipts?new=1&product=${product.id}`}>
                <Button size="sm" icon={<ArrowDownToLine size={14} />}>
                  Create receipt
                </Button>
              </Link>
              {canStock ? (
                <StockForm productId={product.id} productName={product.name} uom={product.uom} locations={stockLocations} triggerLabel="Count stock" triggerVariant="outline" triggerSize="sm" />
              ) : null}
            </div>
          </div>
        )}
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <SectionCard
          title="Movement history"
          subtitle="The ledger rows that produced the balance above"
          action={
            <Link href={`/moves?q=${encodeURIComponent(product.sku)}`} className="no-print text-[12px] font-medium text-brand-600 dark:text-brand-400">
              Open in ledger
            </Link>
          }
          bodyClassName=""
        >
          {ledger.length ? (
            <Table minWidth={680}>
              <THead>
                <tr>
                  <TH>Reference</TH>
                  <TH>Direction</TH>
                  <TH align="right">Quantity</TH>
                  <TH>Route</TH>
                  {showCosts ? <TH align="right">Balance after</TH> : null}
                  <TH align="right">When</TH>
                </tr>
              </THead>
              <TBody>
                {ledger.map((move) => (
                  <tr key={move.id} className="hover:bg-ink-50 dark:hover:bg-ink-800/40">
                    <TD>
                      <span className="block font-medium text-ink-800 dark:text-ink-100">{move.reference}</span>
                      <span className="block text-[11.5px] text-ink-400">{move.documentType}</span>
                    </TD>
                    <TD>
                      <Badge tone={move.direction === 'IN' ? 'success' : 'info'} dot>
                        {move.direction === 'IN' ? 'In' : 'Out'}
                      </Badge>
                    </TD>
                    <TD align="right">{formatQty(move.quantity, move.uom)}</TD>
                    <TD>
                      <span className="text-[12.5px]">
                        {move.fromLocationCode ?? 'Vendors'} → {move.toLocationCode ?? 'Customers'}
                      </span>
                    </TD>
                    {showCosts ? <TD align="right">{move.balanceAfter === null ? '—' : formatQty(move.balanceAfter, move.uom)}</TD> : null}
                    <TD align="right" className="text-[12px] text-ink-400">
                      {relativeTime(move.createdAt)}
                    </TD>
                  </tr>
                ))}
              </TBody>
            </Table>
          ) : (
            <p className="px-5 py-10 text-center text-[12.5px] text-ink-400">No movements recorded for this product yet.</p>
          )}
        </SectionCard>

        <SectionCard title="Documents" subtitle="Receipts, deliveries and transfers touching this product" bodyClassName="">
          {documents.length ? (
            <ul className="divide-y divide-ink-100 dark:divide-ink-800/70">
              {documents.map((document) => (
                <li key={document.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <Link
                      href={`${TYPE_META[document.type].href}/${document.id}`}
                      className="focus-ring block truncate rounded text-[13px] font-medium text-ink-800 hover:text-brand-600 dark:text-ink-100 dark:hover:text-brand-400"
                    >
                      {document.reference}
                    </Link>
                    <p className="truncate text-[11.5px] text-ink-400">
                      {TYPE_META[document.type].label} · {document.partnerName ?? 'Internal'} · {formatDate(document.scheduleDate)}
                    </p>
                  </div>
                  <span className="tnum shrink-0 text-[12.5px] font-medium text-ink-700 dark:text-ink-200">{formatQty(document.totalQuantity, product.uom)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-10 text-center text-[12.5px] text-ink-400">This product has not been on a document yet.</p>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Record" subtitle="Catalogue metadata and audit stamps">
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'SKU', value: product.sku },
            { label: 'Barcode', value: product.barcode ?? '—' },
            { label: 'Category', value: product.categoryName ?? 'Uncategorised' },
            { label: 'Unit of measure', value: product.uom },
            { label: 'Reorder quantity', value: formatQty(product.reorderQty, product.uom) },
            ...(showCosts
              ? [
                  { label: 'Cost price', value: formatMoney(product.costPrice) },
                  { label: 'Sale price', value: formatMoney(product.salePrice) },
                  { label: 'Margin', value: product.salePrice > 0 ? `${(((product.salePrice - product.costPrice) / product.salePrice) * 100).toFixed(1)}%` : '—' },
                ]
              : []),
            { label: 'Created', value: formatDateTime(product.createdAt) },
            { label: 'Last updated', value: formatDateTime(product.updatedAt) },
          ].map((entry) => (
            <div key={entry.label} className="min-w-0">
              <dt className="text-[11px] font-medium uppercase tracking-wider text-ink-400 dark:text-ink-500">{entry.label}</dt>
              <dd className="mt-1 truncate text-[13.5px] font-medium text-ink-800 dark:text-ink-100">{entry.value}</dd>
            </div>
          ))}
        </dl>
      </SectionCard>
    </div>
  );
}
