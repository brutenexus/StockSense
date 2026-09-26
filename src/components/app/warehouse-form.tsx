'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, errorMessage, RequestFailed } from '@/lib/api';
import { Button, Checkbox, Field, Input, Textarea } from '@/components/ui/primitives';
import { ConfirmDialog, Modal } from '@/components/ui/overlay';
import { useToast } from '@/components/ui/toast';

export type WarehouseFormValues = {
  id?: string;
  name: string;
  shortCode: string;
  address: string | null;
  contactName: string | null;
  contactPhone: string | null;
  isDefault: number;
  isActive: number;
};

export function WarehouseForm({
  warehouse = null,
  openInitially = false,
  triggerLabel,
  triggerVariant = 'primary',
  triggerSize = 'md',
}: {
  warehouse?: WarehouseFormValues | null;
  openInitially?: boolean;
  triggerLabel?: string;
  triggerVariant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  triggerSize?: 'xs' | 'sm' | 'md' | 'lg';
}) {
  const router = useRouter();
  const toast = useToast();
  const editing = Boolean(warehouse?.id);
  const [open, setOpen] = useState(openInitially);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    name: warehouse?.name ?? '',
    shortCode: warehouse?.shortCode ?? '',
    address: warehouse?.address ?? '',
    contactName: warehouse?.contactName ?? '',
    contactPhone: warehouse?.contactPhone ?? '',
    isDefault: warehouse ? warehouse.isDefault === 1 : false,
    isActive: warehouse ? warehouse.isActive === 1 : true,
  });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      await api(editing ? `/api/warehouses/${warehouse!.id}` : '/api/warehouses', {
        method: editing ? 'PATCH' : 'POST',
        body: { ...form, isDefault: form.isDefault, isActive: form.isActive },
      });
      toast.success(editing ? 'Warehouse updated' : 'Warehouse created', `${form.shortCode.toUpperCase()} · ${form.name}`);
      setOpen(false);
      router.refresh();
    } catch (error) {
      if (error instanceof RequestFailed) {
        setErrors(error.fieldErrors ?? {});
        toast.error('Could not save the warehouse', error.message);
      } else {
        toast.error('Could not save the warehouse', errorMessage(error));
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api(`/api/warehouses/${warehouse!.id}`, { method: 'DELETE' });
      toast.success('Warehouse removed', `${warehouse!.name} is gone.`);
      setConfirmDelete(false);
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error('Could not remove the warehouse', errorMessage(error));
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
        onClick={() => setOpen(true)}
      >
        {triggerLabel ?? (editing ? 'Edit' : 'New warehouse')}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${warehouse!.name}` : 'New warehouse'}
        subtitle={editing ? `Code ${warehouse!.shortCode}` : 'Each warehouse starts with Stock, Input, Output and Production locations.'}
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
            <Button form="warehouse-form" type="submit" loading={busy} icon={<Building2 size={15} />}>
              {editing ? 'Save changes' : 'Create warehouse'}
            </Button>
          </>
        }
      >
        <form id="warehouse-form" className="space-y-4" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <Field label="Name" error={errors.name} required>
              <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Main Warehouse" />
            </Field>
            <Field label="Short code" error={errors.shortCode} hint="Prefix for references" required>
              <Input
                value={form.shortCode}
                onChange={(event) => setForm({ ...form, shortCode: event.target.value.toUpperCase() })}
                placeholder="WH"
                maxLength={6}
              />
            </Field>
          </div>
          <Field label="Address" error={errors.address}>
            <Textarea value={form.address ?? ''} onChange={(event) => setForm({ ...form, address: event.target.value })} placeholder="12 Logistics Park, Chakan, Pune" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Contact name" error={errors.contactName}>
              <Input value={form.contactName ?? ''} onChange={(event) => setForm({ ...form, contactName: event.target.value })} placeholder="Aarav Mehta" />
            </Field>
            <Field label="Contact phone" error={errors.contactPhone}>
              <Input value={form.contactPhone ?? ''} onChange={(event) => setForm({ ...form, contactPhone: event.target.value })} placeholder="+91 98200 11223" />
            </Field>
          </div>
          <div className="flex flex-wrap gap-6">
            <Checkbox label="Default warehouse" checked={form.isDefault} onChange={(event) => setForm({ ...form, isDefault: event.target.checked })} />
            {editing ? <Checkbox label="Active" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} /> : null}
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        title="Remove this warehouse?"
        description="Warehouses that still hold stock or appear on documents cannot be removed — deactivate them instead."
        confirmLabel="Remove warehouse"
        tone="danger"
        loading={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={remove}
      />
    </>
  );
}
