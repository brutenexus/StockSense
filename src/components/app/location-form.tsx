'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, errorMessage, RequestFailed } from '@/lib/api';
import { LOCATION_KINDS } from '@/lib/domain/constants';
import { Button, Checkbox, Field, Input, Select } from '@/components/ui/primitives';
import { ConfirmDialog, Modal } from '@/components/ui/overlay';
import { useToast } from '@/components/ui/toast';

export type LocationFormValues = {
  id?: string;
  warehouseId: string;
  name: string;
  shortCode: string;
  kind: string;
  address: string | null;
  isActive: number;
};

export function LocationForm({
  location = null,
  warehouseId,
  openInitially = false,
  triggerLabel,
  triggerVariant = 'primary',
  triggerSize = 'sm',
}: {
  location?: LocationFormValues | null;
  warehouseId: string;
  openInitially?: boolean;
  triggerLabel?: string;
  triggerVariant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  triggerSize?: 'xs' | 'sm' | 'md';
}) {
  const router = useRouter();
  const toast = useToast();
  const editing = Boolean(location?.id);
  const [open, setOpen] = useState(openInitially);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    name: location?.name ?? '',
    shortCode: location?.shortCode?.split('/').pop() ?? '',
    kind: location?.kind ?? 'INTERNAL',
    address: location?.address ?? '',
    isActive: location ? location.isActive === 1 : true,
  });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      await api(editing ? `/api/locations/${location!.id}` : '/api/locations', {
        method: editing ? 'PATCH' : 'POST',
        body: editing ? { ...form, isActive: form.isActive } : { ...form, warehouseId },
      });
      toast.success(editing ? 'Location updated' : 'Location added', `${form.shortCode} · ${form.name}`);
      setOpen(false);
      router.refresh();
    } catch (error) {
      if (error instanceof RequestFailed) {
        setErrors(error.fieldErrors ?? {});
        toast.error('Could not save the location', error.message);
      } else {
        toast.error('Could not save the location', errorMessage(error));
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api(`/api/locations/${location!.id}`, { method: 'DELETE' });
      toast.success('Location removed', `${location!.name} is gone.`);
      setConfirmDelete(false);
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error('Could not remove the location', errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button size={triggerSize} variant={triggerVariant} icon={editing ? <Pencil size={13} /> : <Plus size={14} />} onClick={() => setOpen(true)}>
        {triggerLabel ?? (editing ? 'Edit' : 'Add location')}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${location!.name}` : 'Add a storage location'}
        subtitle={editing ? location!.shortCode : 'Bins, racks, aisles — anything stock can sit in.'}
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
            <Button form="location-form" type="submit" loading={busy} icon={<MapPin size={15} />}>
              {editing ? 'Save changes' : 'Add location'}
            </Button>
          </>
        }
      >
        <form id="location-form" className="space-y-4" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <Field label="Name" error={errors.name} required>
              <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Rack A · Fast movers" />
            </Field>
            <Field label="Short code" error={errors.shortCode} hint="Prefixed by the warehouse code" required>
              <Input value={form.shortCode} onChange={(event) => setForm({ ...form, shortCode: event.target.value })} placeholder="Stock1" />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type" error={errors.kind}>
              <Select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })}>
                {LOCATION_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind.charAt(0) + kind.slice(1).toLowerCase()}
                  </option>
                ))}
              </Select>
            </Field>
            {editing ? <Checkbox label="Active" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} /> : null}
          </div>
          <Field label="Address / directions" error={errors.address}>
            <Input value={form.address ?? ''} onChange={(event) => setForm({ ...form, address: event.target.value })} placeholder="Aisle opposite the loading bay" />
          </Field>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        title="Remove this location?"
        description="A location that still holds stock cannot be removed — move the stock out first."
        confirmLabel="Remove location"
        tone="danger"
        loading={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={remove}
      />
    </>
  );
}
