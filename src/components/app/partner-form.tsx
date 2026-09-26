'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Contact, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, errorMessage, RequestFailed } from '@/lib/api';
import { PARTNER_KINDS, type PartnerKind } from '@/lib/domain/constants';
import { Button, Checkbox, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { ConfirmDialog, Modal } from '@/components/ui/overlay';
import { useToast } from '@/components/ui/toast';

export function PartnerForm({
  partner = null,
  defaultKind = 'VENDOR',
  openInitially = false,
  triggerLabel,
  triggerVariant = 'primary',
  triggerSize = 'sm',
}: {
  partner?: {
    id: string;
    name: string;
    kind: PartnerKind;
    contactName: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    gstin: string | null;
    isActive: number;
  } | null;
  defaultKind?: PartnerKind;
  openInitially?: boolean;
  triggerLabel?: string;
  triggerVariant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  triggerSize?: 'xs' | 'sm' | 'md';
}) {
  const router = useRouter();
  const toast = useToast();
  const editing = Boolean(partner?.id);
  const [open, setOpen] = useState(openInitially);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    name: partner?.name ?? '',
    kind: partner?.kind ?? defaultKind,
    contactName: partner?.contactName ?? '',
    email: partner?.email ?? '',
    phone: partner?.phone ?? '',
    address: partner?.address ?? '',
    gstin: partner?.gstin ?? '',
    isActive: partner ? partner.isActive === 1 : true,
  });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      await api(editing ? `/api/partners/${partner!.id}` : '/api/partners', {
        method: editing ? 'PATCH' : 'POST',
        body: form,
      });
      toast.success(editing ? 'Contact updated' : 'Contact added', form.name);
      setOpen(false);
      router.refresh();
    } catch (error) {
      if (error instanceof RequestFailed) {
        setErrors(error.fieldErrors ?? {});
        toast.error('Could not save the contact', error.message);
      } else {
        toast.error('Could not save the contact', errorMessage(error));
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api(`/api/partners/${partner!.id}`, { method: 'DELETE' });
      toast.success('Contact removed', partner!.name);
      setConfirmDelete(false);
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error('Could not remove the contact', errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button size={triggerSize} variant={triggerVariant} icon={editing ? <Pencil size={13} /> : <Plus size={14} />} onClick={() => setOpen(true)}>
        {triggerLabel ?? (editing ? 'Edit' : 'New contact')}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
        title={editing ? `Edit ${partner!.name}` : 'New vendor or customer'}
        subtitle="Contacts appear on receipts and deliveries."
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
            <Button form="partner-form" type="submit" loading={busy} icon={<Contact size={15} />}>
              {editing ? 'Save changes' : 'Add contact'}
            </Button>
          </>
        }
      >
        <form id="partner-form" className="space-y-4" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <Field label="Name" error={errors.name} required>
              <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Steel Works Ltd" />
            </Field>
            <Field label="Type" error={errors.kind}>
              <Select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as PartnerKind })}>
                {PARTNER_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind === 'BOTH' ? 'Vendor & customer' : kind.charAt(0) + kind.slice(1).toLowerCase()}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Contact person" error={errors.contactName}>
              <Input value={form.contactName ?? ''} onChange={(event) => setForm({ ...form, contactName: event.target.value })} placeholder="Imran Sheikh" />
            </Field>
            <Field label="Email" error={errors.email}>
              <Input type="email" value={form.email ?? ''} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="orders@steelworks.co.in" />
            </Field>
            <Field label="Phone" error={errors.phone}>
              <Input value={form.phone ?? ''} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="+91 98111 55667" />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <Field label="Address" error={errors.address}>
              <Textarea value={form.address ?? ''} onChange={(event) => setForm({ ...form, address: event.target.value })} placeholder="Plot 22, Steel Market, Raipur" />
            </Field>
            <Field label="GSTIN / Tax ID" error={errors.gstin}>
              <Input value={form.gstin ?? ''} onChange={(event) => setForm({ ...form, gstin: event.target.value.toUpperCase() })} placeholder="22AACCS9988F1Z3" />
            </Field>
          </div>
          {editing ? <Checkbox label="Active" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} /> : null}
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        title="Remove this contact?"
        description="Contacts referenced by past documents are kept for the audit trail and cannot be removed."
        confirmLabel="Remove contact"
        tone="danger"
        loading={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={remove}
      />
    </>
  );
}
