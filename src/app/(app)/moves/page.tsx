import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowDownToLine, ArrowUpFromLine, History } from 'lucide-react';
import { listMoves, type MoveFilters } from '@/lib/repo/inventory';
import { listCategories } from '@/lib/repo/catalog';
import { listWarehouses } from '@/lib/repo/warehouses';
import { requireUser } from '@/lib/auth/server';
import { TYPE_META, type DocumentType } from '@/lib/domain/constants';
import { documentHref } from '@/lib/domain/routes';
import { formatDateTime, formatQty } from '@/lib/format';
import { Badge, PageHeader } from '@/components/ui/primitives';
import { Pagination } from '@/components/ui/nav';
import { ActiveFilters, ExportButton, FilterSelect, PrintButton, SearchField } from '@/components/app/filters';
import { StatTile, TBody, TD, TH, THead, Table } from '@/components/app/ui';

export const metadata: Metadata = { title: 'Move History' };

const PAGE_SIZE = 40;
const DOCUMENT_TYPES: { value: DocumentType | 'INITIAL'; label: string }[] = [
  { value: 'RECEIPT', label: 'Receipts' },
  { value: 'DELIVERY', label: 'Deliveries' },
  { value: 'TRANSFER', label: 'Transfers' },
  { value: 'ADJUSTMENT', label: 'Adjustments' },
  { value: 'INITIAL', label: 'Opening stock' },
];

export default async function MovesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser('/moves');
  const queryParams = await searchParams;
  const single = (key: string) => {
    const value = queryParams[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const search = single('q') ?? '';
  const documentType = (single('type') ?? '') as NonNullable<MoveFilters['documentType']>;
  const direction = (single('direction') ?? '') as 'IN' | 'OUT' | '';
  const warehouseId = single('warehouse') ?? '';
  const categoryId = single('category') ?? '';
  const page = Math.max(1, Number(single('page') ?? 1) || 1);

  const warehouses = listWarehouses();
  const categories = listCategories();

  const filters: MoveFilters = {
    search: search || undefined,
    documentType: documentType || undefined,
    direction: direction || undefined,
    warehouseId: warehouseId || undefined,
    categoryId: categoryId || undefined,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  };

  const result = listMoves(filters);
  const showCosts = user.role === 'MANAGER';
  const net = result.totals.inQty - result.totals.outQty;

  const buildHref = (pageNumber: number) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ q: search, type: documentType, direction, warehouse: warehouseId, category: categoryId })) {
      if (value) next.set(key, value);
    }
    next.set('page', String(pageNumber));
    return `/moves?${next.toString()}`;
  };

  const exportRows = result.items.map((move) => ({
    createdAt: move.createdAt,
    reference: move.reference,
    documentType: move.documentType,
    product: move.productName,
    sku: move.sku,
    direction: move.direction,
    quantity: move.quantity,
    uom: move.uom,
    from: move.fromLocationCode ?? 'Vendors',
    to: move.toLocationCode ?? 'Customers',
    location: move.locationCode ?? '',
    balanceAfter: move.balanceAfter ?? '',
    unitCost: move.unitCost,
    by: move.createdByName ?? '',
    note: move.note ?? '',
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Ledger"
        title="Move History"
        subtitle="Every stock movement ever recorded, straight from the immutable ledger — filter it, audit it, export it."
        actions={
          <>
            <ExportButton rows={exportRows} filename="stocksense-move-history.csv" />
            <PrintButton />
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Movements" value={result.total.toLocaleString('en-IN')} hint={documentType ? TYPE_META[documentType as DocumentType]?.label ?? documentType : 'Across every document type'} icon={<History size={16} />} />
        <StatTile label="Units in" value={formatQty(result.totals.inQty)} hint="Goods received into a location" icon={<ArrowDownToLine size={16} />} accent="emerald" />
        <StatTile label="Units out" value={formatQty(result.totals.outQty)} hint="Goods shipped or written off" icon={<ArrowUpFromLine size={16} />} accent="sky" />
        <StatTile
          label="Net change"
          value={`${net > 0 ? '+' : ''}${formatQty(net)}`}
          hint={net === 0 ? 'Balanced in and out' : net > 0 ? 'Stock built up in this view' : 'Stock drew down in this view'}
          accent={net >= 0 ? 'violet' : 'amber'}
        />
      </div>

      <div className="surface space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SearchField placeholder="Search reference, product, note…" className="w-full sm:w-72" />
          <div className="flex flex-wrap items-center gap-2">
            <FilterSelect paramKey="type" ariaLabel="Document type" allLabel="All document types" options={DOCUMENT_TYPES.map((entry) => ({ value: entry.value, label: entry.label }))} />
            <FilterSelect paramKey="direction" ariaLabel="Direction" allLabel="In and out" options={[{ value: 'IN', label: 'Stock in' }, { value: 'OUT', label: 'Stock out' }]} />
            <FilterSelect paramKey="warehouse" ariaLabel="Warehouse" allLabel="All warehouses" options={warehouses.map((warehouse) => ({ value: warehouse.id, label: warehouse.name }))} />
            <FilterSelect paramKey="category" ariaLabel="Category" allLabel="All categories" options={categories.map((category) => ({ value: category.id, label: category.name }))} />
          </div>
        </div>
        <ActiveFilters
          labels={[
            { key: 'type', label: 'Document type' },
            { key: 'direction', label: 'Direction' },
            { key: 'warehouse', label: 'Warehouse' },
            { key: 'category', label: 'Category' },
          ]}
        />
      </div>

      <div className="surface overflow-hidden">
        {result.items.length ? (
          <Table minWidth={showCosts ? 1180 : 1020}>
            <THead>
              <tr>
                <TH>When</TH>
                <TH>Reference</TH>
                <TH>Product</TH>
                <TH>Direction</TH>
                <TH align="right">Quantity</TH>
                <TH>Route</TH>
                <TH align="right">Balance after</TH>
                {showCosts ? <TH align="right">Unit cost</TH> : null}
                <TH>By</TH>
              </tr>
            </THead>
            <TBody>
              {result.items.map((move) => (
                <tr key={move.id} className="hover:bg-ink-50 dark:hover:bg-ink-800/40">
                  <TD className="whitespace-nowrap text-[12px] text-ink-500 dark:text-ink-400">{formatDateTime(move.createdAt)}</TD>
                  <TD>
                    {move.documentId ? (
                      <Link
                        href={documentHref(move.documentType as DocumentType, move.documentId)}
                        className="focus-ring rounded font-medium text-ink-900 hover:text-brand-600 dark:text-white dark:hover:text-brand-400"
                      >
                        {move.reference}
                      </Link>
                    ) : (
                      <span className="font-medium text-ink-900 dark:text-white">{move.reference}</span>
                    )}
                    <span className="block text-[11px] text-ink-400">
                      {move.documentType === 'INITIAL' ? 'Opening stock' : TYPE_META[move.documentType as DocumentType]?.label ?? move.documentType}
                    </span>
                  </TD>
                  <TD>
                    <Link href={`/products/${move.productId}`} className="focus-ring rounded">
                      <span className="block text-[12.5px] font-medium text-ink-800 dark:text-ink-100">{move.productName}</span>
                      <span className="block text-[11px] text-ink-400">
                        {move.sku}
                        {move.categoryName ? ` · ${move.categoryName}` : ''}
                      </span>
                    </Link>
                  </TD>
                  <TD>
                    <Badge tone={move.direction === 'IN' ? 'success' : 'info'} dot>
                      {move.direction === 'IN' ? 'In' : 'Out'}
                    </Badge>
                  </TD>
                  <TD align="right" className="whitespace-nowrap font-medium">
                    {formatQty(move.quantity, move.uom)}
                  </TD>
                  <TD className="text-[12px]">
                    <span className="block">{move.fromLocationCode ?? 'Vendors'} → {move.toLocationCode ?? 'Customers'}</span>
                    <span className="block text-[11px] text-ink-400">Balances {move.locationCode ?? '—'}</span>
                  </TD>
                  <TD align="right">{move.balanceAfter === null ? '—' : formatQty(move.balanceAfter, move.uom)}</TD>
                  {showCosts ? <TD align="right">{move.unitCost ? move.unitCost.toLocaleString('en-IN') : '—'}</TD> : null}
                  <TD className="whitespace-nowrap text-[12px]">{move.createdByName ?? 'System'}</TD>
                </tr>
              ))}
            </TBody>
          </Table>
        ) : (
          <div className="px-6 py-16 text-center">
            <p className="text-[14px] font-semibold text-ink-800 dark:text-ink-100">No movements match those filters</p>
            <p className="mt-1 text-[12.5px] text-ink-500 dark:text-ink-400">Validate a receipt, delivery, transfer or adjustment to write to the ledger.</p>
          </div>
        )}
      </div>

      <Pagination page={page} pageSize={PAGE_SIZE} total={result.total} buildHref={buildHref} />
    </div>
  );
}
