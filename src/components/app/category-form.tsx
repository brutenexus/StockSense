'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import { api, errorMessage, RequestFailed } from '@/lib/api';
import { ACCENTS } from '@/lib/domain/constants';
import { accentOf } from '@/lib/format';
import { Button, cx, Field, Input, Textarea } from '@/components/ui/primitives';
import { ConfirmDialog, Modal } from '@/components/ui/overlay';
import { useToast } from '@/components/ui/toast';

export function CategoryForm({
  category = null,
  openInitially = false,
  triggerLabel,
  triggerVariant = 'primary',
  triggerSize = 'sm',
}: {
  category?: { id: string; name: string; code: string | null; color: string; description: string | null } | null;
  openInitially?: boolean;
  triggerLabel?: string;
  triggerVariant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  triggerSize?: 'xs' | 'sm' | 'md';
}) {
  const router = useRouter();
  const toast = useToast();
  const editing = Boolean(category?.id);
  const [open, setOpen] = useState(openInitially);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    name: category?.name ?? '',
    code: category?.code ?? '',
    color: category?.color ?? 'indigo',
    description: category?.description ?? '',
  });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      await api(editing ? `/api/categories/${category!.id}` : '/api/categories', {
        method: editing ? 'PATCH' : 'POST',
        body: form,
      });
      toast.success(editing ? 'Category updated' : 'Category created', form.name);
      setOpen(false);
      router.refresh();
    } catch (error) {
      if (error instanceof RequestFailed) {
        setErrors(error.fieldErrors ?? {});
        toast.error('Could not save the category', error.message);
      } else {
        toast.error('Could not save the category', errorMessage(error));
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api(`/api/categories/${category!.id}`, { method: 'DELETE' });
      toast.success('Category removed', category!.name);
      setConfirmDelete(false);
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error('Could not remove the category', errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        size={triggerSize}
        variant={triggerVariant}
        icon={editing ? <Pencil size={13} /> : <Plus size={14} />}
        onClick={() => setOpen(true)}
      >
        {triggerLabel ?? (editing ? 'Edit' : 'New category')}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${category!.name}` : 'New category'}
        subtitle="Categories group products in reports and on the dashboard."
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
            <Button form="category-form" type="submit" loading={busy} icon={<Tags size={15} />}>
              {editing ? 'Save changes' : 'Create category'}
            </Button>
          </>
        }
      >
        <form id="category-form" className="space-y-4" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <Field label="Name" error={errors.name} required>
              <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Furniture" />
            </Field>
            <Field label="Code" error={errors.code} hint="Short label for exports">
              <Input value={form.code ?? ''} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} placeholder="FRN" maxLength={6} />
            </Field>
          </div>
          <Field label="Description" error={errors.description}>
            <Textarea value={form.description ?? ''} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Desks, tables and seating" />
          </Field>
          <Field label="Chart colour">
            <div className="flex flex-wrap gap-1.5">
              {ACCENTS.map((accent) => (
                <button
                  key={accent}
                  type="button"
                  aria-label={accent}
                  onClick={() => setForm({ ...form, color: accent })}
                  className={cx(
                    'focus-ring h-6 w-6 rounded-full ring-offset-2 transition-shadow dark:ring-offset-ink-900',
                    accentOf(accent).chip,
                    form.color === accent && 'ring-2 ring-ink-900 dark:ring-white',
                  )}
                />
              ))}
            </div>
          </Field>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        title="Remove this category?"
        description="Products in this category must be moved elsewhere first."
        confirmLabel="Remove category"
        tone="danger"
        loading={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={remove}
      />
    </>
  );
}
