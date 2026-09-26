'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FilePlus2, Info, Plus, Search, Trash2, X } from 'lucide-react';
import { api, errorMessage, RequestFailed } from '@/lib/api';
import { TYPE_META, type DocumentType } from '@/lib/domain/constants';
import { formatMoney, formatQty, todayInput } from '@/lib/format';
import { Badge, Button, cx, Field, IconButton, Input, Select, Textarea } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/overlay';
import { useToast } from '@/components/ui/toast';
import type { DocumentRow } from '@/lib/repo/documents';

type ProductOption = {
  id: string;
  sku: string;
  name: string;
  uom: string;
  costPrice: number;
  onHand: number;
  freeToUse: number;
};

type Line = {
  productId: string;
  sku: string;
  name: string;
  uom: string;
  quantity: string;
  unitCost: string;
  note: string;
};

/** Pre-filled lines: a scanned product, or the lines of the draft being edited. */
export type InitialLine = {
  productId: string;
  sku?: string;
  name?: string;
  uom?: string;
  quantity: number;
  unitCost?: number;
  note?: string;
};

export type LocationOption = { id: string; label: string; warehouseId: string; kind: string };

const OPERATION_TYPES: Record<DocumentType, string[]> = {
  RECEIPT: ['Purchase', 'Customer return', 'Opening stock'],
  DELIVERY: ['Sales', 'Sample', 'Scrap', 'Warranty replacement'],
  TRANSFER: ['Internal', 'Replenishment', 'Quality hold'],
  ADJUSTMENT: ['Cycle count', 'Damage', 'Theft', 'Found stock'],
};

const PRIORITIES = ['NORMAL', 'HIGH', 'URGENT'];

export function DocumentForm({
  type,
  warehouses,
  locations,
  partners,
  users,
  currentUserId,
  document = null,
  initialLines = [],
  openInitially = false,
  triggerLabel,
  triggerVariant = 'primary',
  triggerSize = 'md',
  showCosts = false,
}: {
  type: DocumentType;
  warehouses: { id: string; name: string; shortCode: string; isDefault: number }[];
  locations: LocationOption[];
  partners: { id: string; name: string; kind: string }[];
  users: { id: string; name: string; role: string }[];
  currentUserId: string;
  document?: DocumentRow | null;
  initialLines?: InitialLine[];
  openInitially?: boolean;
  triggerLabel?: string;
  triggerVariant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  triggerSize?: 'sm' | 'md' | 'lg';
  showCosts?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const meta = TYPE_META[type];
  const editing = Boolean(document);

  const defaultWarehouse = useMemo(() => {
    if (document) return document.warehouseId;
    return warehouses.find((warehouse) => warehouse.isDefault === 1)?.id ?? warehouses[0]?.id ?? '';
  }, [document, warehouses]);

  const bins = useMemo(() => locations.filter((location) => location.kind !== 'INPUT' && location.kind !== 'OUTPUT'), [locations]);

  const [open, setOpen] = useState(openInitially);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [warehouseId, setWarehouseId] = useState(defaultWarehouse);
  const [fromLocationId, setFromLocationId] = useState(document?.fromLocationId ?? '');
  const [toLocationId, setToLocationId] = useState(document?.toLocationId ?? '');
  const [partnerId, setPartnerId] = useState(document?.partnerId ?? '');
  const [partnerName, setPartnerName] = useState(document?.partnerName ?? '');
  const [scheduleDate, setScheduleDate] = useState(document ? (document.scheduleDate ?? '').slice(0, 10) : todayInput());
  const [operationType, setOperationType] = useState(document?.operationType ?? OPERATION_TYPES[type][0]!);
  const [responsibleId, setResponsibleId] = useState(document?.responsibleId ?? currentUserId);
  const [priority, setPriority] = useState(document?.priority ?? 'NORMAL');
  const [notes, setNotes] = useState(document?.notes ?? '');
  const [lines, setLines] = useState<Line[]>(() => buildInitialLines(document, initialLines));

  /* ------------------------------------------------------- product picker */
  const [term, setTerm] = useState('');
  const [options, setOptions] = useState<ProductOption[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const result = await api<{ items: ProductOption[] }>(`/api/products?limit=8&q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        });
        setOptions(result.items);
      } catch {
        /* aborted or offline — the picker simply shows nothing */
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term, open]);

  function warehouseBins(predicate: (location: LocationOption) => boolean) {
    return bins.filter((location) => location.warehouseId === warehouseId && predicate(location));
  }

  const partnerKind = type === 'RECEIPT' ? 'VENDOR' : type === 'DELIVERY' ? 'CUSTOMER' : null;
  const partnerOptions = partnerKind ? partners.filter((partner) => partner.kind === partnerKind || partner.kind === 'BOTH') : [];

  function addLine(product: ProductOption) {
    setLines((current) => {
      const existing = current.findIndex((line) => line.productId === product.id);
      if (existing >= 0) {
        const next = [...current];
        const line = next[existing]!;
        next[existing] = { ...line, quantity: String(Number(line.quantity || 0) + 1) };
        return next;
      }
      return [
        ...current,
        {
          productId: product.id,
          sku: product.sku,
          name: product.name,
          uom: product.uom,
          quantity: '1',
          unitCost: String(product.costPrice ?? 0),
          note: '',
        },
      ];
    });
    setTerm('');
    setOptions([]);
  }

  function reset() {
    setErrors({});
    setFormState();
  }

  function setFormState() {
    setWarehouseId(document?.warehouseId ?? defaultWarehouse);
    setFromLocationId(document?.fromLocationId ?? '');
    setToLocationId(document?.toLocationId ?? '');
    setPartnerId(document?.partnerId ?? '');
    setPartnerName(document?.partnerName ?? '');
    setScheduleDate(document ? (document.scheduleDate ?? '').slice(0, 10) : todayInput());
    setOperationType(document?.operationType ?? OPERATION_TYPES[type][0]!);
    setResponsibleId(document?.responsibleId ?? currentUserId);
    setPriority(document?.priority ?? 'NORMAL');
    setNotes(document?.notes ?? '');
    setLines(buildInitialLines(document, initialLines));
    setTerm('');
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const body = {
        type,
        warehouseId,
        fromLocationId: needsFrom ? fromLocationId || null : null,
        toLocationId: needsTo ? toLocationId || null : null,
        partnerId: partnerId || null,
        partnerName: partnerKind ? null : partnerName || null,
        scheduleDate: scheduleDate || null,
        operationType,
        responsibleId,
        priority,
        notes,
        lines: lines.map((line) => ({
          productId: line.productId,
          quantity: Number(line.quantity || 0),
          counted: Number(line.quantity || 0),
          unitCost: Number(line.unitCost || 0),
          note: line.note,
        })),
      };
      const result = await api<{ document: DocumentRow }>(editing ? `/api/documents/${document!.id}` : '/api/documents', {
        method: editing ? 'PATCH' : 'POST',
        body,
      });
      toast.success(editing ? 'Draft updated' : `${meta.label} drafted`, `${result.document.reference} is ready for review.`);
      setOpen(false);
      router.refresh();
      if (!editing) router.push(`${meta.href}/${result.document.id}`);
    } catch (error) {
      if (error instanceof RequestFailed) {
        setErrors(error.fieldErrors ?? {});
        toast.error('Could not save the document', error.message);
      } else {
        toast.error('Could not save the document', errorMessage(error));
      }
    } finally {
      setBusy(false);
    }
  }

  // Receipts land in a bin; deliveries leave one; transfers do both; counts target one.
  const needsFrom = type === 'DELIVERY' || type === 'TRANSFER' || type === 'ADJUSTMENT';
  const needsTo = type === 'RECEIPT' || type === 'TRANSFER';

  return (
    <>
      <Button size={triggerSize} variant={triggerVariant} icon={<Plus size={15} />} onClick={() => { reset(); setOpen(true); }}>
        {triggerLabel ?? `New ${meta.label.toLowerCase()}`}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="xl"
        title={editing ? `Edit ${document!.reference}` : `New ${meta.label.toLowerCase()}`}
        subtitle={meta.description}
        footer={
          <>
            <p className="mr-auto hidden text-[11.5px] text-ink-400 sm:block">
              {lines.length} line{lines.length === 1 ? '' : 's'} · saved as a draft
            </p>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button form="document-form" type="submit" loading={busy} icon={<FilePlus2 size={15} />}>
              {editing ? 'Save draft' : 'Create draft'}
            </Button>
          </>
        }
      >
        <form id="document-form" className="space-y-5" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Warehouse" error={errors.warehouseId} required>
              <Select value={warehouseId} onChange={(event) => { setWarehouseId(event.target.value); setFromLocationId(''); setToLocationId(''); }}>
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name} ({warehouse.shortCode})
                  </option>
                ))}
              </Select>
            </Field>

            {needsFrom ? (
              <Field label={type === 'ADJUSTMENT' ? 'Counted at' : 'Source location'} error={errors.fromLocationId} required>
                <Select value={fromLocationId} onChange={(event) => setFromLocationId(event.target.value)}>
                  <option value="">Choose a location…</option>
                  {warehouseBins(() => true).map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.label}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}

            {needsTo ? (
              <Field label="Destination location" error={errors.toLocationId} required>
                <Select value={toLocationId} onChange={(event) => setToLocationId(event.target.value)}>
                  <option value="">Choose a location…</option>
                  {warehouseBins((location) => location.id !== fromLocationId).map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.label}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}

            <Field label="Scheduled for" error={errors.scheduleDate}>
              <Input type="date" value={scheduleDate} onChange={(event) => setScheduleDate(event.target.value)} />
            </Field>

            {partnerKind ? (
              <Field label={partnerKind === 'VENDOR' ? 'Vendor' : 'Customer'} error={errors.partnerId}>
                <Select value={partnerId} onChange={(event) => setPartnerId(event.target.value)}>
                  <option value="">Choose a contact…</option>
                  {partnerOptions.map((partner) => (
                    <option key={partner.id} value={partner.id}>
                      {partner.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <Field label="Reference / counterpart" error={errors.partnerName}>
                <Input value={partnerName} onChange={(event) => setPartnerName(event.target.value)} placeholder="Internal" />
              </Field>
            )}

            <Field label="Operation type" error={errors.operationType}>
              <Select value={operationType} onChange={(event) => setOperationType(event.target.value)}>
                {OPERATION_TYPES[type].map((entry) => (
                  <option key={entry} value={entry}>
                    {entry}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Responsible" error={errors.responsibleId}>
              <Select value={responsibleId} onChange={(event) => setResponsibleId(event.target.value)}>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Priority" error={errors.priority}>
              <Select value={priority} onChange={(event) => setPriority(event.target.value)}>
                {PRIORITIES.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry.charAt(0) + entry.slice(1).toLowerCase()}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {/* -------------------------------------------------------- lines */}
          <div className="rounded-xl border border-ink-200 dark:border-ink-800">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-200 px-4 py-3 dark:border-ink-800">
              <div>
                <p className="text-[13px] font-semibold text-ink-800 dark:text-ink-100">Products</p>
                <p className="text-[11.5px] text-ink-400">
                  {type === 'ADJUSTMENT' ? 'Enter the counted quantity for each product.' : 'Search by name or SKU to add a line.'}
                </p>
              </div>
              {errors.lines ? <span className="text-[12px] font-medium text-rose-600 dark:text-rose-400">{errors.lines}</span> : null}
            </div>

            <div className="p-4">
              <div className="relative">
                <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
                <input
                  value={term}
                  onChange={(event) => setTerm(event.target.value)}
                  placeholder="Search products…"
                  className="focus-ring h-10 w-full rounded-lg border border-ink-200 bg-white pl-8.5 pr-3 text-[13px] dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100"
                />
                {term ? (
                  <IconButton label="Clear" className="absolute right-1 top-1" onClick={() => { setTerm(''); setOptions([]); }}>
                    <X size={15} />
                  </IconButton>
                ) : null}

                {term ? (
                  <div className="absolute left-0 right-0 top-11 z-30 max-h-64 overflow-y-auto rounded-xl border border-ink-200 bg-white p-1 shadow-[var(--shadow-raise)] dark:border-ink-700 dark:bg-ink-900">
                    {options.length ? (
                      options.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => addLine(option)}
                          className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-ink-100 dark:hover:bg-ink-800"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-medium text-ink-800 dark:text-ink-100">{option.name}</span>
                            <span className="block text-[11.5px] text-ink-400">
                              {option.sku} · free {formatQty(option.freeToUse, option.uom)}
                            </span>
                          </span>
                          <span className="shrink-0 text-[11.5px] text-ink-400">{formatQty(option.onHand, option.uom)} on hand</span>
                        </button>
                      ))
                    ) : (
                      <p className="px-2.5 py-3 text-[12.5px] text-ink-400">{searching ? 'Searching…' : 'No products match that search.'}</p>
                    )}
                  </div>
                ) : null}
              </div>

              {lines.length ? (
                <div className="mt-3 space-y-2">
                  {lines.map((line, index) => (
                    <div key={line.productId} className="rounded-xl border border-ink-200/80 p-3 dark:border-ink-800">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium text-ink-800 dark:text-ink-100">{line.name}</p>
                          <p className="text-[11.5px] text-ink-400">
                            {line.sku} · {line.uom}
                          </p>
                        </div>
                        <IconButton label={`Remove ${line.name}`} onClick={() => setLines((current) => current.filter((_, position) => position !== index))}>
                          <Trash2 size={15} />
                        </IconButton>
                      </div>
                      <div className="mt-2.5 grid gap-2 sm:grid-cols-[1fr_1fr_1.4fr]">
                        <Field label={type === 'ADJUSTMENT' ? 'Counted' : 'Quantity'} error={errors[`lines.${index}.quantity`]}>
                          <Input
                            type="number"
                            min={type === 'ADJUSTMENT' ? 0 : 0.01}
                            step="0.01"
                            value={line.quantity}
                            onChange={(event) => setLines((current) => current.map((entry, position) => (position === index ? { ...entry, quantity: event.target.value } : entry)))}
                          />
                        </Field>
                        {showCosts ? (
                          <Field label="Unit cost">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.unitCost}
                              onChange={(event) => setLines((current) => current.map((entry, position) => (position === index ? { ...entry, unitCost: event.target.value } : entry)))}
                            />
                          </Field>
                        ) : null}
                        <Field label="Note">
                          <Input
                            value={line.note}
                            placeholder="Pallet 3, damaged box…"
                            onChange={(event) => setLines((current) => current.map((entry, position) => (position === index ? { ...entry, note: event.target.value } : entry)))}
                          />
                        </Field>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3 flex items-center gap-2 rounded-xl bg-ink-50 px-3 py-3 text-[12.5px] text-ink-500 dark:bg-ink-800/50 dark:text-ink-400">
                  <Info size={14} />
                  No lines yet — search above to add the first product.
                </div>
              )}
            </div>
          </div>

          <Field label="Notes" error={errors.notes}>
            <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Anything the warehouse team should know…" />
          </Field>

          {showCosts && lines.length ? (
            <div className="flex items-center justify-between rounded-xl bg-ink-50 px-4 py-3 text-[12.5px] dark:bg-ink-800/50">
              <span className="text-ink-500 dark:text-ink-400">Estimated value</span>
              <span className="tnum font-semibold text-ink-800 dark:text-ink-100">
                {formatMoney(lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitCost || 0), 0))}
              </span>
            </div>
          ) : null}
        </form>
      </Modal>
    </>
  );
}

/**
 * Lines always arrive fully hydrated from the server (either the product being
 * scanned or the lines of the draft under edit), so the builder stays free of
 * lookups and the first render is correct.
 */
function buildInitialLines(_document: DocumentRow | null, initialLines: InitialLine[]): Line[] {
  return initialLines.map((line) => ({
    productId: line.productId,
    sku: line.sku ?? '',
    name: line.name ?? line.sku ?? line.productId,
    uom: line.uom ?? '',
    quantity: String(line.quantity),
    unitCost: String(line.unitCost ?? 0),
    note: line.note ?? '',
  }));
}
