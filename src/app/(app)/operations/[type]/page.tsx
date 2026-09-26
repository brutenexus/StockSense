import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CalendarDays, CircleAlert, Clock, PackageSearch, TriangleAlert } from 'lucide-react';
import { documentKpis, listDocuments, type DocumentFilters } from '@/lib/repo/documents';
import { getProduct, listPartners } from '@/lib/repo/catalog';
import { listLocations, listWarehouses } from '@/lib/repo/warehouses';
import { listUsers } from '@/lib/repo/users';
import { requireUser } from '@/lib/auth/server';
import { DOCUMENT_STATUSES, STATUS_META, TYPE_META, can, type DocumentStatus, type DocumentType } from '@/lib/domain/constants';
import { canCreateDocument } from '@/lib/domain/permissions';
import { documentTypeFromSegment, TYPE_SEGMENTS } from '@/lib/domain/routes';
import { formatDate, formatQty, isOverdue } from '@/lib/format';
import { Button, PageHeader, StatusPill } from '@/components/ui/primitives';
import { LinkTabs, Pagination } from '@/components/ui/nav';
import { ActiveFilters, ExportButton, FilterSelect, FilterToggle, PrintButton, SearchField } from '@/components/app/filters';
import { StatTile, TBody, TD, TH, THead, Table } from '@/components/app/ui';
import { DocumentForm } from '@/components/app/document-form';

const PAGE_SIZE = 25;
const OPEN_STATUSES: DocumentStatus[] = ['DRAFT', 'WAITING', 'READY'];

export async function generateMetadata({ params }: { params: Promise<{ type: string }> }): Promise<Metadata> {
  const { type } = await params;
  const resolved = documentTypeFromSegment(type);
  return { title: resolved ? TYPE_META[resolved].plural : 'Operations' };
}

export default async function OperationsListPage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { type: segment } = await params;
  const type = documentTypeFromSegment(segment);
  if (!type) notFound();

  const user = await requireUser(`/operations/${segment}`);
  const queryParams = await searchParams;
  const single = (key: string) => {
    const value = queryParams[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const meta = TYPE_META[type];
  const search = single('q') ?? '';
  const warehouseId = single('warehouse') ?? '';
  const late = single('late') === '1';
  const sort = (single('sort') ?? 'created') as NonNullable<DocumentFilters['sort']>;
  const statusParam = single('status');
  const page = Math.max(1, Number(single('page') ?? 1) || 1);
  const openNew = single('new') === '1';
  const prefillProductId = single('product');

  const selected: DocumentStatus[] | 'ALL' = statusParam === 'ALL'
    ? 'ALL'
    : statusParam
      ? (statusParam.split(',').filter((entry) => DOCUMENT_STATUSES.includes(entry as DocumentStatus)) as DocumentStatus[])
      : OPEN_STATUSES;

  const baseFilters: DocumentFilters = {
    type,
    warehouseId: warehouseId || undefined,
    search: search || undefined,
    late,
    sort,
    direction: single('dir') === 'asc' ? 'asc' : 'desc',
  };

  const base = listDocuments({ ...baseFilters, status: 'ALL', limit: 1 });
  const result = listDocuments({ ...baseFilters, status: selected, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const kpis = documentKpis(type);

  const warehouses = listWarehouses();
  const locations = listLocations({ internal: true });
  const partners = listPartners();
  const users = listUsers();
  const prefillProduct = prefillProductId ? getProduct(prefillProductId) : undefined;
  const canCreate = canCreateDocument(user.role, type);

  const openCount = kpis.operations;
  const visibleTotal = selected === 'ALL' ? base.total : selected.reduce((sum, status) => sum + (base.statusCounts[status] ?? 0), 0);

  const tabHref = (status: DocumentStatus[] | 'ALL') => {
    const next = new URLSearchParams();
    if (search) next.set('q', search);
    if (warehouseId) next.set('warehouse', warehouseId);
    if (late) next.set('late', '1');
    if (sort !== 'created') next.set('sort', sort);
    if (status !== 'ALL') next.set('status', status.join(','));
    else next.set('status', 'ALL');
    const query = next.toString();
    return `/operations/${TYPE_SEGMENTS[type]}${query ? `?${query}` : ''}`;
  };

  const buildHref = (pageNumber: number) => {
    const next = new URLSearchParams();
    if (search) next.set('q', search);
    if (warehouseId) next.set('warehouse', warehouseId);
    if (late) next.set('late', '1');
    if (sort !== 'created') next.set('sort', sort);
    next.set('status', typeof selected === 'string' ? 'ALL' : selected.join(','));
    next.set('page', String(pageNumber));
    return `/operations/${TYPE_SEGMENTS[type]}?${next.toString()}`;
  };

  const exportRows = result.items.map((document) => ({
    reference: document.reference,
    type: document.type,
    status: document.status,
    warehouse: document.warehouseName,
    partner: document.partnerName ?? '',
    from: document.fromLocationCode ?? '',
    to: document.toLocationCode ?? '',
    scheduleDate: document.scheduleDate ?? '',
    lines: document.lineCount,
    quantity: document.totalQuantity,
    responsible: document.responsibleName ?? '',
    created: document.createdAt,
    done: document.doneAt ?? '',
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title={meta.plural}
        subtitle={meta.description + '. Draft it, confirm it once stock is committed, then validate it to post the ledger.'}
        actions={
          <>
            {canCreate ? (
              <DocumentForm
                type={type}
                warehouses={warehouses.map((warehouse) => ({ id: warehouse.id, name: warehouse.name, shortCode: warehouse.shortCode, isDefault: warehouse.isDefault }))}
                locations={locations.map((location) => ({
                  id: location.id,
                  label: `${location.warehouseCode} · ${location.shortCode}`,
                  warehouseId: location.warehouseId,
                  kind: location.kind,
                }))}
                partners={partners.map((partner) => ({ id: partner.id, name: partner.name, kind: partner.kind }))}
                users={users.filter((entry) => entry.isActive === 1).map((entry) => ({ id: entry.id, name: entry.name, role: entry.role }))}
                currentUserId={user.id}
                openInitially={openNew}
                showCosts={can(user.role, 'view_costs')}
                initialLines={
                  prefillProduct
                    ? [{ productId: prefillProduct.id, sku: prefillProduct.sku, name: prefillProduct.name, uom: prefillProduct.uom, quantity: 1, unitCost: prefillProduct.costPrice }]
                    : []
                }
              />
            ) : null}
            <ExportButton rows={exportRows} filename={`stocksense-${TYPE_SEGMENTS[type]}.csv`} />
            <PrintButton />
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Open operations" value={openCount.toLocaleString('en-IN')} hint={`${formatQty(kpis.quantity)} in the worklist`} icon={<PackageSearch size={16} />} accent={meta.accent} />
        <StatTile label="Late" value={kpis.late.toLocaleString('en-IN')} hint="Past their scheduled date" icon={<TriangleAlert size={16} />} accent="rose" href={`/operations/${TYPE_SEGMENTS[type]}?late=1`} />
        <StatTile label="Waiting for stock" value={kpis.waiting.toLocaleString('en-IN')} hint="Confirmed but short of free stock" icon={<Clock size={16} />} accent="amber" />
        <StatTile label="Products to process" value={kpis.toProcess.toLocaleString('en-IN')} hint="Distinct products across open documents" icon={<CalendarDays size={16} />} accent="sky" />
      </div>

      <div className="surface space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <LinkTabs
            items={[
              { value: 'open', label: 'Open', count: openCount, href: tabHref(OPEN_STATUSES), tone: selected !== 'ALL' && selected.length === 3 ? 'active' : undefined },
              { value: 'all', label: 'All', count: base.total, href: tabHref('ALL'), tone: selected === 'ALL' ? 'active' : undefined },
              ...DOCUMENT_STATUSES.map((status) => ({
                value: status,
                label: STATUS_META[status].label,
                count: base.statusCounts[status] ?? 0,
                href: tabHref([status]),
                tone: selected !== 'ALL' && selected.length === 1 && selected[0] === status ? 'active' : undefined,
              })),
            ]}
          />
          <div className="flex flex-wrap items-center gap-2">
            <SearchField placeholder="Search reference, product, note…" className="w-full sm:w-64" />
            <FilterSelect
              paramKey="warehouse"
              ariaLabel="Warehouse"
              allLabel="All warehouses"
              options={warehouses.map((warehouse) => ({ value: warehouse.id, label: warehouse.name }))}
            />
            <FilterSelect
              paramKey="sort"
              ariaLabel="Sort"
              allLabel="Newest first"
              options={[
                { value: 'schedule', label: 'Schedule date' },
                { value: 'reference', label: 'Reference' },
                { value: 'status', label: 'Status' },
              ]}
            />
            <FilterToggle paramKey="late" label="Late only" icon={<CircleAlert size={14} />} />
          </div>
        </div>
        <ActiveFilters labels={[{ key: 'warehouse', label: 'Warehouse' }, { key: 'late', label: 'Late only' }, { key: 'sort', label: 'Sort' }]} />
      </div>

      <div className="surface overflow-hidden">
        {result.items.length ? (
          <Table minWidth={1000}>
            <THead>
              <tr>
                <TH>Reference</TH>
                <TH>{type === 'TRANSFER' || type === 'ADJUSTMENT' ? 'Counterpart' : 'Partner'}</TH>
                <TH>Route</TH>
                <TH>Scheduled</TH>
                <TH align="right">Lines</TH>
                <TH align="right">Quantity</TH>
                <TH>Status</TH>
                <TH align="right" />
              </tr>
            </THead>
            <TBody>
              {result.items.map((document) => {
                const lateDocument = isOverdue(document.scheduleDate, document.status);
                return (
                  <tr key={document.id} className="hover:bg-ink-50 dark:hover:bg-ink-800/40">
                    <TD>
                      <Link href={`/operations/${TYPE_SEGMENTS[type]}/${document.id}`} className="focus-ring rounded">
                        <span className="block text-[13px] font-medium text-ink-900 dark:text-white">{document.reference}</span>
                        <span className="block text-[11.5px] text-ink-400">
                          {document.warehouseName} · {document.operationType ?? meta.label}
                        </span>
                      </Link>
                    </TD>
                    <TD>
                      <span className="text-[12.5px]">{document.partnerName ?? 'Internal'}</span>
                      {document.partnerKind && document.partnerKind !== 'BOTH' ? (
                        <span className="mt-0.5 block text-[11px] text-ink-400">{document.partnerKind === 'VENDOR' ? 'Vendor' : 'Customer'}</span>
                      ) : null}
                    </TD>
                    <TD>
                      <span className="text-[12.5px] text-ink-600 dark:text-ink-300">
                        {document.fromLocationCode ?? '—'} → {document.toLocationCode ?? '—'}
                      </span>
                    </TD>
                    <TD>
                      <span className={lateDocument ? 'text-[12.5px] font-medium text-rose-600 dark:text-rose-400' : 'text-[12.5px]'}>{formatDate(document.scheduleDate)}</span>
                      {lateDocument ? (
                        <span className="mt-0.5 block text-[11px] font-medium text-rose-500">Late</span>
                      ) : null}
                    </TD>
                    <TD align="right">{document.lineCount}</TD>
                    <TD align="right">{formatQty(document.totalQuantity)}</TD>
                    <TD>
                      <StatusPill status={document.status} />
                      {document.reservedQuantity > 0 ? (
                        <span className="mt-1 block text-[11px] text-ink-400">{formatQty(document.reservedQuantity)} reserved</span>
                      ) : null}
                    </TD>
                    <TD align="right">
                      <Link href={`/operations/${TYPE_SEGMENTS[type]}/${document.id}`} className="focus-ring rounded text-[12.5px] font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">
                        Open
                      </Link>
                    </TD>
                  </tr>
                );
              })}
            </TBody>
          </Table>
        ) : (
          <div className="px-6 py-16 text-center">
            <p className="text-[14px] font-semibold text-ink-800 dark:text-ink-100">Nothing in this worklist</p>
            <p className="mt-1 text-[12.5px] text-ink-500 dark:text-ink-400">
              {canCreate ? `Create a ${meta.label.toLowerCase()} to get started, or widen the filters above.` : 'Widen the filters above to see historical documents.'}
            </p>
            {canCreate ? (
              <div className="mt-4 flex justify-center">
                <DocumentForm
                  type={type}
                  warehouses={warehouses.map((warehouse) => ({ id: warehouse.id, name: warehouse.name, shortCode: warehouse.shortCode, isDefault: warehouse.isDefault }))}
                  locations={locations.map((location) => ({ id: location.id, label: `${location.warehouseCode} · ${location.shortCode}`, warehouseId: location.warehouseId, kind: location.kind }))}
                  partners={partners.map((partner) => ({ id: partner.id, name: partner.name, kind: partner.kind }))}
                  users={users.filter((entry) => entry.isActive === 1).map((entry) => ({ id: entry.id, name: entry.name, role: entry.role }))}
                  currentUserId={user.id}
                  showCosts={can(user.role, 'view_costs')}
                  triggerVariant="outline"
                  triggerSize="sm"
                />
              </div>
            ) : null}
          </div>
        )}
      </div>

      <Pagination page={page} pageSize={PAGE_SIZE} total={visibleTotal} buildHref={buildHref} />
      <p className="text-center text-[11.5px] text-ink-400">
        Showing {result.items.length} of {visibleTotal} document{visibleTotal === 1 ? '' : 's'}
        {search ? ` matching “${search}”` : ''}
      </p>
    </div>
  );
}
