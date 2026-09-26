import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, BadgeCheck, CircleAlert, Clock, FileText, History, TriangleAlert, Truck } from 'lucide-react';
import { getDocument, getDocumentLines } from '@/lib/repo/documents';
import { listMoves } from '@/lib/repo/inventory';
import { activityForEntity } from '@/lib/repo/activity';
import { listPartners } from '@/lib/repo/catalog';
import { listLocations, listWarehouses } from '@/lib/repo/warehouses';
import { listUsers } from '@/lib/repo/users';
import { requireUser } from '@/lib/auth/server';
import { STATUS_FLOW, STATUS_META, TYPE_META, type DocumentStatus } from '@/lib/domain/constants';
import { documentCapabilities } from '@/lib/domain/permissions';
import { documentTypeFromSegment, TYPE_SEGMENTS } from '@/lib/domain/routes';
import { formatDate, formatDateTime, formatMoney, formatQty, relativeTime } from '@/lib/format';
import { Logo } from '@/components/app/logo';
import { Badge, Button, cx, PageHeader, ProgressBar, StatusPill } from '@/components/ui/primitives';
import { SectionCard, TBody, TD, TH, THead, Table } from '@/components/app/ui';
import { PrintButton } from '@/components/app/filters';
import { DocumentActions } from '@/components/app/document-actions';
import { DocumentForm } from '@/components/app/document-form';

type Params = { type: string; id: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params;
  const document = getDocument(id);
  return { title: document ? document.reference : 'Document' };
}

export default async function DocumentDetailPage({ params }: { params: Promise<Params> }) {
  const { type: segment, id } = await params;
  const type = documentTypeFromSegment(segment);
  if (!type) notFound();

  const user = await requireUser(`/operations/${segment}/${id}`);
  const document = getDocument(id);
  if (!document || document.type !== type) notFound();

  const meta = TYPE_META[type];
  const lines = getDocumentLines(document.id);
  const moves = listMoves({ documentId: document.id, limit: 60 });
  const activity = activityForEntity(document.id, 12);
  const capabilities = documentCapabilities(user.role, type);
  const warehouses = listWarehouses();
  const locations = listLocations({ internal: true });
  const partners = listPartners();
  const users = listUsers();

  const open = document.status === 'DRAFT' || document.status === 'WAITING' || document.status === 'READY';
  const shortages = lines.filter((line) => {
    if (type === 'ADJUSTMENT') return false;
    if (type === 'RECEIPT') return false;
    return line.quantity > line.freeAtSource;
  });
  const editable = open && capabilities.create;

  const availabilityTotal = lines.reduce((sum, line) => sum + (type === 'RECEIPT' ? line.quantity : Math.min(line.quantity, line.freeAtSource)), 0);
  const requestedTotal = lines.reduce((sum, line) => sum + line.quantity, 0);

  return (
    <div className="space-y-6">
      <div className="no-print">
        <PageHeader
          breadcrumb={
            <Link href={`/operations/${TYPE_SEGMENTS[type]}`} className="focus-ring inline-flex items-center gap-1 rounded text-brand-600 hover:text-brand-700 dark:text-brand-400">
              <ArrowLeft size={13} /> {meta.plural}
            </Link>
          }
          eyebrow={`${meta.label} · ${document.warehouseName}`}
          title={document.reference}
          subtitle={`${document.partnerName ?? 'Internal movement'} · ${STATUS_META[document.status].hint}`}
          actions={
            <>
              {editable ? (
                <DocumentForm
                  type={type}
                  document={document}
                  warehouses={warehouses.map((warehouse) => ({ id: warehouse.id, name: warehouse.name, shortCode: warehouse.shortCode, isDefault: warehouse.isDefault }))}
                  locations={locations.map((location) => ({ id: location.id, label: `${location.warehouseCode} · ${location.shortCode}`, warehouseId: location.warehouseId, kind: location.kind }))}
                  partners={partners.map((partner) => ({ id: partner.id, name: partner.name, kind: partner.kind }))}
                  users={users.filter((entry) => entry.isActive === 1).map((entry) => ({ id: entry.id, name: entry.name, role: entry.role }))}
                  currentUserId={user.id}
                  showCosts={capabilities.viewCosts}
                  triggerLabel="Edit draft"
                  triggerVariant="outline"
                  triggerSize="sm"
                  initialLines={lines.map((line) => ({
                    productId: line.productId,
                    sku: line.sku,
                    name: line.productName,
                    uom: line.uom,
                    quantity: line.quantity,
                    unitCost: line.unitCost,
                    note: line.note ?? '',
                  }))}
                />
              ) : null}
              <PrintButton />
            </>
          }
        />
      </div>

      <div className="no-print flex flex-wrap items-center gap-3">
        <StatusPill status={document.status} className="text-[12px]" />
        <DocumentActions
          documentId={document.id}
          reference={document.reference}
          type={type}
          status={document.status}
          capabilities={{ confirm: capabilities.validate || capabilities.create, validate: capabilities.validate, cancel: capabilities.cancel, reset: capabilities.create, delete: capabilities.create }}
          onDeleted="navigate"
        />
      </div>

      {shortages.length && open ? (
        <div className="no-print flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border border-amber-200 bg-amber-50/70 px-4 py-3 dark:border-amber-500/25 dark:bg-amber-500/10">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
            <TriangleAlert size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-amber-800 dark:text-amber-300">
              {shortages.length} line{shortages.length === 1 ? '' : 's'} short of free stock
            </p>
            <p className="text-[12px] text-amber-700/80 dark:text-amber-400/80">
              {shortages.map((line) => `${line.productName} needs ${formatQty(line.quantity - line.freeAtSource, line.uom)} more`).join(' · ')}
            </p>
          </div>
          <Link href={`/operations/receipts?new=1${shortages[0] ? `&product=${shortages[0].productId}` : ''}`}>
            <Button size="sm" variant="secondary">
              Receive stock
            </Button>
          </Link>
        </div>
      ) : null}

      {/* --------------------------------------------------------- print sheet */}
      <div className="print-sheet surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-ink-200 pb-4 dark:border-ink-800">
          <div className="flex items-start gap-3">
            <Logo size={44} className="mt-0.5 h-11 w-11 shrink-0 rounded-lg object-contain" />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-600 dark:text-brand-400">StockSense · {meta.label}</p>
              <h2 className="mt-1 text-[20px] font-semibold tracking-tight text-ink-900 dark:text-white">{document.reference}</h2>
              <p className="mt-1 text-[12.5px] text-ink-500 dark:text-ink-400">
                {document.warehouseName} ({document.warehouseCode}) · {document.operationType ?? meta.label}
              </p>
            </div>
          </div>
          <div className="text-right">
            <StatusPill status={document.status} />
            <p className="mt-2 text-[12px] text-ink-500 dark:text-ink-400">Scheduled {formatDate(document.scheduleDate)}</p>
            <p className="text-[12px] text-ink-400">Created {formatDateTime(document.createdAt)}</p>
          </div>
        </div>

        <dl className="grid gap-x-6 gap-y-4 py-5 sm:grid-cols-3 lg:grid-cols-4">
          {[
            { label: 'Counterparty', value: document.partnerName ?? 'Internal' },
            { label: 'Source', value: document.fromLocationCode ? `${document.fromLocationName} (${document.fromLocationCode})` : '—' },
            { label: 'Destination', value: document.toLocationCode ? `${document.toLocationName} (${document.toLocationCode})` : '—' },
            { label: 'Responsible', value: document.responsibleName ?? '—' },
            { label: 'Priority', value: document.priority },
            { label: 'Raised by', value: document.createdByName ?? '—' },
            { label: 'Confirmed', value: document.confirmedAt ? formatDateTime(document.confirmedAt) : '—' },
            { label: document.status === 'CANCELED' ? 'Canceled' : 'Validated', value: (document.status === 'CANCELED' ? document.canceledAt : document.doneAt) ? formatDateTime(document.status === 'CANCELED' ? document.canceledAt : document.doneAt) : '—' },
          ].map((entry) => (
            <div key={entry.label} className="min-w-0">
              <dt className="text-[11px] font-medium uppercase tracking-wider text-ink-400 dark:text-ink-500">{entry.label}</dt>
              <dd className="mt-1 truncate text-[13.5px] font-medium text-ink-800 dark:text-ink-100">{entry.value}</dd>
            </div>
          ))}
        </dl>

        {open && type !== 'RECEIPT' && type !== 'ADJUSTMENT' ? (
          <div className="mb-4 rounded-xl border border-ink-200 p-4 dark:border-ink-800">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[12.5px] font-semibold text-ink-700 dark:text-ink-200">
                {shortages.length ? 'Partially available' : 'Fully available at the source'}
              </p>
              <span className="tnum text-[12px] text-ink-500 dark:text-ink-400">
                {formatQty(availabilityTotal)} of {formatQty(requestedTotal)} covered
              </span>
            </div>
            <ProgressBar
              className="mt-2"
              value={requestedTotal > 0 ? (availabilityTotal / requestedTotal) * 100 : 0}
              tone={shortages.length ? 'bg-amber-500' : 'bg-emerald-500'}
            />
          </div>
        ) : null}

        <Table minWidth={760}>
          <THead>
            <tr>
              <TH>Product</TH>
              <TH align="right">{type === 'ADJUSTMENT' ? 'Counted' : 'Requested'}</TH>
              <TH align="right">Reserved</TH>
              <TH align="right">Done</TH>
              {capabilities.viewCosts ? <TH align="right">Unit cost</TH> : null}
              {capabilities.viewCosts ? <TH align="right">Value</TH> : null}
              {open && type !== 'RECEIPT' && type !== 'ADJUSTMENT' ? <TH align="right">Free at source</TH> : null}
              <TH>Note</TH>
            </tr>
          </THead>
          <TBody>
            {lines.map((line) => {
              const short = line.quantity > line.freeAtSource && type !== 'RECEIPT' && type !== 'ADJUSTMENT';
              return (
                <tr key={line.id}>
                  <TD>
                    <Link href={`/products/${line.productId}`} className="focus-ring rounded">
                      <span className="block text-[13px] font-medium text-ink-800 dark:text-ink-100">{line.productName}</span>
                      <span className="block text-[11.5px] text-ink-400">
                        {line.sku} · {line.uom}
                        {line.categoryName ? ` · ${line.categoryName}` : ''}
                      </span>
                    </Link>
                  </TD>
                  <TD align="right">{formatQty(line.quantity, line.uom)}</TD>
                  <TD align="right">{formatQty(line.reservedQty, line.uom)}</TD>
                  <TD align="right">{formatQty(line.doneQuantity, line.uom)}</TD>
                  {capabilities.viewCosts ? <TD align="right">{formatMoney(line.unitCost)}</TD> : null}
                  {capabilities.viewCosts ? <TD align="right">{formatMoney(line.unitCost * line.quantity)}</TD> : null}
                  {open && type !== 'RECEIPT' && type !== 'ADJUSTMENT' ? (
                    <TD align="right" className={short ? 'font-semibold text-rose-600 dark:text-rose-400' : undefined}>
                      {formatQty(line.freeAtSource, line.uom)}
                    </TD>
                  ) : null}
                  <TD>
                    <span className="text-[12px] text-ink-500 dark:text-ink-400">{line.note ?? '—'}</span>
                  </TD>
                </tr>
              );
            })}
          </TBody>
        </Table>

        {capabilities.viewCosts ? (
          <div className="mt-4 flex justify-end">
            <div className="w-full max-w-xs space-y-1.5 text-[12.5px]">
              <div className="flex justify-between text-ink-500 dark:text-ink-400">
                <span>Total quantity</span>
                <span className="tnum font-medium text-ink-700 dark:text-ink-200">{formatQty(requestedTotal)}</span>
              </div>
              <div className="flex justify-between text-ink-500 dark:text-ink-400">
                <span>Total value</span>
                <span className="tnum font-medium text-ink-700 dark:text-ink-200">{formatMoney(lines.reduce((sum, line) => sum + line.unitCost * line.quantity, 0))}</span>
              </div>
            </div>
          </div>
        ) : null}

        {document.notes ? (
          <div className="mt-5 rounded-xl bg-ink-50 p-4 dark:bg-ink-800/50">
            <p className="text-[11px] font-medium uppercase tracking-wider text-ink-400">Notes</p>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-700 dark:text-ink-200">{document.notes}</p>
          </div>
        ) : null}

        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {['Prepared by', 'Checked by', 'Received by'].map((label) => (
            <div key={label}>
              <div className="h-10 border-b border-dashed border-ink-300 dark:border-ink-700" />
              <p className="mt-1.5 text-[11px] uppercase tracking-wider text-ink-400">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* --------------------------------------------------------- progress */}
      <SectionCard title="Workflow" subtitle="Where this document sits in its lifecycle" className="no-print">
        <ol className="flex flex-wrap items-start gap-3">
          {STATUS_FLOW[type].map((status) => {
            const stamp = statusStamp(document, status);
            const currentIndex = STATUS_FLOW[type].indexOf(document.status as DocumentStatus);
            const index = STATUS_FLOW[type].indexOf(status);
            const reached = document.status === 'CANCELED' ? Boolean(stamp) : index <= (currentIndex === -1 ? -1 : currentIndex);
            return (
              <li key={status} className="flex min-w-[150px] flex-1 items-start gap-3 rounded-xl border border-ink-200/80 p-3 dark:border-ink-800">
                <span
                  className={cx(
                    'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                    reached ? 'bg-emerald-500 text-white' : 'bg-ink-100 text-ink-400 dark:bg-ink-800',
                  )}
                >
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-ink-800 dark:text-ink-100">{STATUS_META[status].label}</span>
                  <span className="block text-[11.5px] text-ink-400">{stamp ? formatDateTime(stamp) : STATUS_META[status].hint}</span>
                </span>
              </li>
            );
          })}
          {document.status === 'WAITING' ? (
            <li className="flex min-w-[150px] flex-1 items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-500/25 dark:bg-amber-500/10">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white">
                <Clock size={14} />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-amber-800 dark:text-amber-300">Waiting on stock</span>
                <span className="block text-[11.5px] text-amber-700/80 dark:text-amber-400/80">Promotes itself to Ready when the shortage clears.</span>
              </span>
            </li>
          ) : null}
          {document.status === 'CANCELED' ? (
            <li className="flex min-w-[150px] flex-1 items-start gap-3 rounded-xl border border-rose-200 bg-rose-50/60 p-3 dark:border-rose-500/25 dark:bg-rose-500/10">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-500 text-white">
                <CircleAlert size={14} />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-rose-800 dark:text-rose-300">Canceled</span>
                <span className="block text-[11.5px] text-rose-700/80 dark:text-rose-400/80">{formatDateTime(document.canceledAt)} · reservations released</span>
              </span>
            </li>
          ) : null}
        </ol>
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <SectionCard
          title="Ledger entries"
          subtitle="Every balance change this document produced"
          action={<Badge tone={moves.items.length ? 'brand' : 'neutral'}>{moves.items.length} move{moves.items.length === 1 ? '' : 's'}</Badge>}
          bodyClassName=""
          className="no-print"
        >
          {moves.items.length ? (
            <Table minWidth={680}>
              <THead>
                <tr>
                  <TH>When</TH>
                  <TH>Product</TH>
                  <TH>Direction</TH>
                  <TH align="right">Quantity</TH>
                  <TH>Route</TH>
                  {capabilities.viewCosts ? <TH align="right">Balance after</TH> : null}
                  <TH>By</TH>
                </tr>
              </THead>
              <TBody>
                {moves.items.map((move) => (
                  <tr key={move.id}>
                    <TD className="text-[12px] text-ink-500 dark:text-ink-400">{formatDateTime(move.createdAt)}</TD>
                    <TD>
                      <span className="block text-[12.5px] font-medium text-ink-800 dark:text-ink-100">{move.productName}</span>
                      <span className="block text-[11px] text-ink-400">{move.sku}</span>
                    </TD>
                    <TD>
                      <Badge tone={move.direction === 'IN' ? 'success' : 'info'} dot>
                        {move.direction === 'IN' ? 'In' : 'Out'}
                      </Badge>
                    </TD>
                    <TD align="right">{formatQty(move.quantity, move.uom)}</TD>
                    <TD className="text-[12px]">
                      {move.fromLocationCode ?? 'Vendors'} → {move.toLocationCode ?? 'Customers'}
                    </TD>
                    {capabilities.viewCosts ? <TD align="right">{move.balanceAfter === null ? '—' : formatQty(move.balanceAfter, move.uom)}</TD> : null}
                    <TD className="text-[12px]">{move.createdByName ?? 'System'}</TD>
                  </tr>
                ))}
              </TBody>
            </Table>
          ) : (
            <p className="px-5 py-10 text-center text-[12.5px] text-ink-400">
              {document.status === 'DONE' ? 'This document produced no ledger movement (the count already matched).' : 'Nothing has been posted yet — validate the document to write the ledger.'}
            </p>
          )}
        </SectionCard>

        <SectionCard title="Timeline" subtitle="Audit trail for this document" className="no-print" action={<History size={15} className="text-ink-400" />}>
          {activity.length ? (
            <ol className="space-y-3">
              {activity.map((entry) => (
                <li key={entry.id} className="flex gap-3">
                  <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-300">
                    {entry.action.includes('VALIDATE') ? <BadgeCheck size={13} /> : entry.action.includes('CONFIRM') ? <Truck size={13} /> : <FileText size={13} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] text-ink-700 dark:text-ink-200">{entry.summary ?? entry.action}</span>
                    <span className="block text-[11px] text-ink-400">
                      {entry.userName ?? 'System'} · {relativeTime(entry.createdAt)} · {formatDateTime(entry.createdAt)}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="py-6 text-center text-[12.5px] text-ink-400">No activity recorded for this document yet.</p>
          )}
        </SectionCard>
      </div>

    </div>
  );
}

function statusStamp(document: { createdAt: string; confirmedAt: string | null; doneAt: string | null; status: DocumentStatus }, status: DocumentStatus): string | null {
  if (status === 'DRAFT') return document.createdAt;
  if (status === 'WAITING' || status === 'READY') return document.confirmedAt;
  if (status === 'DONE') return document.doneAt;
  return null;
}
