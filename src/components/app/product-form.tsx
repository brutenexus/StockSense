'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Package, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, errorMessage, RequestFailed } from '@/lib/api';
import { ACCENTS, UOMS } from '@/lib/domain/constants';
import { accentOf } from '@/lib/format';
import { Button, Checkbox, cx, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { ConfirmDialog, Modal } from '@/components/ui/overlay';
import { useToast } from '@/components/ui/toast';
import type { ProductRow } from '@/lib/repo/catalog';

export type Option = { id: string; label: string };

type FormState = {
  sku: string;
  name: string;
  barcode: string;
  description: string;
  categoryId: string;
  uom: string;
  costPrice: string;
  salePrice: string;
  reorderPoint: string;
  reorderQty: string;
  accent: string;
  initialStock: string;
  locationId: string;
  isActive: boolean;
};

function emptyState(product?: ProductRow | null, locations: Option[] = []): FormState {
  return {
    sku: product?.sku ?? '',
    name: product?.name ?? '',
    barcode: product?.barcode ?? '',
    description: product?.description ?? '',
    categoryId: product?.categoryId ?? '',
    uom: product?.uom ?? 'Unit',
    costPrice: product ? String(product.costPrice) : '',
    salePrice: product ? String(product.salePrice) : '',
    reorderPoint: product ? String(product.reorderPoint) : '',
    reorderQty: product ? String(product.reorderQty) : '',
    accent: product?.accent ?? 'indigo',
    initialStock: '',
    locationId: locations[0]?.id ?? '',
    isActive: product ? product.isActive === 1 : true,
  };
}

export function ProductForm({
  product = null,
  categories,
  locations = [],
  openInitially = false,
  triggerLabel,
  triggerVariant = 'primary',
  triggerSize = 'md',
}: {
  product?: ProductRow | null;
  categories: Option[];
  locations?: Option[];
  openInitially?: boolean;
  triggerLabel?: string;
  triggerVariant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  triggerSize?: 'sm' | 'md' | 'lg';
}) {
  const router = useRouter();
  const toast = useToast();
  const editing = Boolean(product);
  const [open, setOpen] = useState(openInitially);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState<FormState>(() => emptyState(product, locations));

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((state) => ({ ...state, [key]: value }));
  }

  function openDialog() {
    setForm(emptyState(product, locations));
    setErrors({});
    setOpen(true);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const body = {
        sku: form.sku,
        name: form.name,
        barcode: form.barcode,
        description: form.description,
        categoryId: form.categoryId || null,
        uom: form.uom,
        costPrice: Number(form.costPrice || 0),
        salePrice: Number(form.salePrice || 0),
        reorderPoint: Number(form.reorderPoint || 0),
        reorderQty: Number(form.reorderQty || 0),
        accent: form.accent,
        isActive: form.isActive,
        ...(editing ? {} : { initialStock: Number(form.initialStock || 0), locationId: form.locationId || null }),
      };
      const result = await api<{ product: ProductRow }>(editing ? `/api/products/${product!.id}` : '/api/products', {
        method: editing ? 'PATCH' : 'POST',
        body,
      });
      toast.success(editing ? 'Product updated' : 'Product created', `${result.product.sku} · ${result.product.name}`);
      setOpen(false);
      router.refresh();
      if (!editing) router.push(`/products/${result.product.id}`);
    } catch (error) {
      if (error instanceof RequestFailed) {
        setErrors(error.fieldErrors ?? {});
        toast.error('Could not save the product', error.message);
      } else {
        toast.error('Could not save the product', errorMessage(error));
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!product) return;
    setBusy(true);
    try {
      const result = await api<{ notice: string | null }>(`/api/products/${product.id}`, { method: 'DELETE' });
      toast.success('Product removed', result.notice ?? `${product.sku} is gone.`);
      setConfirmDelete(false);
      setOpen(false);
      router.push('/products');
      router.refresh();
    } catch (error) {
      toast.error('Could not remove the product', errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        size={triggerSize}
        variant={triggerVariant}
        icon={editing ? <Pencil size={14} /> : <Plus size={15} />}
        onClick={openDialog}
      >
        {triggerLabel ?? (editing ? 'Edit product' : 'New product')}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
        title={editing ? `Edit ${product!.name}` : 'New product'}
        subtitle={editing ? `SKU ${product!.sku}` : 'Add a product to the catalogue, optionally with opening stock.'}
        footer={
          <>
            {editing ? (
              <Button variant="ghost" icon={<Trash2 size={14} />} className="mr-auto text-rose-600 dark:text-rose-400" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button form="product-form" type="submit" loading={busy} icon={<Package size={15} />}>
              {editing ? 'Save changes' : 'Create product'}
            </Button>
          </>
        }
      >
        <form id="product-form" className="space-y-5" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="SKU / Code" error={errors.sku} required hint="Used on documents and scanners">
              <Input value={form.sku} onChange={(event) => set('sku', event.target.value)} placeholder="DESK001" />
            </Field>
            <Field label="Barcode" error={errors.barcode} hint="Optional — scanned during receipts">
              <Input value={form.barcode} onChange={(event) => set('barcode', event.target.value)} placeholder="8901234567890" />
            </Field>
          </div>

          <Field label="Product name" error={errors.name} required>
            <Input value={form.name} onChange={(event) => set('name', event.target.value)} placeholder="Standing Desk Pro" />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category" error={errors.categoryId}>
              <Select value={form.categoryId} onChange={(event) => set('categoryId', event.target.value)}>
                <option value="">Uncategorised</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Unit of measure" error={errors.uom}>
              <Select value={form.uom} onChange={(event) => set('uom', event.target.value)}>
                {UOMS.map((uom) => (
                  <option key={uom} value={uom}>
                    {uom}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Cost price" error={errors.costPrice} hint="Rs">
              <Input type="number" min="0" step="0.01" value={form.costPrice} onChange={(event) => set('costPrice', event.target.value)} />
            </Field>
            <Field label="Sale price" error={errors.salePrice} hint="Rs">
              <Input type="number" min="0" step="0.01" value={form.salePrice} onChange={(event) => set('salePrice', event.target.value)} />
            </Field>
            <Field label="Reorder point" error={errors.reorderPoint} hint="Alert below this">
              <Input type="number" min="0" step="0.01" value={form.reorderPoint} onChange={(event) => set('reorderPoint', event.target.value)} />
            </Field>
            <Field label="Reorder qty" error={errors.reorderQty} hint="Suggested buy">
              <Input type="number" min="0" step="0.01" value={form.reorderQty} onChange={(event) => set('reorderQty', event.target.value)} />
            </Field>
          </div>

          {!editing ? (
            <div className="rounded-xl border border-dashed border-ink-300 p-4 dark:border-ink-700">
              <p className="text-[12.5px] font-medium text-ink-700 dark:text-ink-200">Opening stock (optional)</p>
              <p className="mt-0.5 text-[11.5px] text-ink-500 dark:text-ink-400">
                Recorded as a first-class ledger entry so the balance never appears out of nowhere.
              </p>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <Field label="Quantity" error={errors.initialStock}>
                  <Input type="number" min="0" step="0.01" value={form.initialStock} onChange={(event) => set('initialStock', event.target.value)} placeholder="0" />
                </Field>
                <Field label="Stored at" error={errors.locationId}>
                  <Select value={form.locationId} onChange={(event) => set('locationId', event.target.value)} disabled={locations.length === 0}>
                    {locations.length === 0 ? <option value="">No locations yet</option> : null}
                    {locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </div>
          ) : null}

          <Field label="Description" error={errors.description}>
            <Textarea value={form.description} onChange={(event) => set('description', event.target.value)} placeholder="Height adjustable desk, 1400×700 mm" />
          </Field>

          <div className="flex flex-wrap items-end gap-6">
            <Field label="Accent">
              <div className="flex flex-wrap gap-1.5">
                {ACCENTS.map((accent) => (
                  <button
                    key={accent}
                    type="button"
                    aria-label={accent}
                    onClick={() => set('accent', accent)}
                    className={cx(
                      'focus-ring h-6 w-6 rounded-full ring-offset-2 transition-shadow dark:ring-offset-ink-900',
                      accentOf(accent).chip,
                      form.accent === accent && 'ring-2 ring-ink-900 dark:ring-white',
                    )}
                  />
                ))}
              </div>
            </Field>
            {editing ? (
              <Checkbox label="Active" checked={form.isActive} onChange={(event) => set('isActive', event.target.checked)} />
            ) : null}
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        title="Remove this product?"
        description={`${product?.name ?? 'This product'} will be archived if it appears in past documents, otherwise deleted. Stock history is never rewritten.`}
        confirmLabel="Remove product"
        tone="danger"
        loading={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={remove}
      />
    </>
  );
}
