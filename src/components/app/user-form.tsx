'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Pencil, UserPlus } from 'lucide-react';
import { api, errorMessage, RequestFailed } from '@/lib/api';
import { ACCENTS, ROLES, ROLE_META, type Role } from '@/lib/domain/constants';
import { passwordStrength } from '@/lib/domain/validation';
import { accentOf } from '@/lib/format';
import { Badge, Button, Checkbox, cx, Field, Input, Select } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/overlay';
import { useToast } from '@/components/ui/toast';

export type UserFormValues = {
  id?: string;
  name: string;
  loginId: string;
  email: string;
  role: Role;
  phone: string | null;
  jobTitle: string | null;
  accent: string;
  isActive: number;
};

export function UserForm({
  user = null,
  openInitially = false,
  triggerLabel,
  triggerVariant = 'primary',
  triggerSize = 'md',
  selfId,
}: {
  user?: UserFormValues | null;
  openInitially?: boolean;
  triggerLabel?: string;
  triggerVariant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  triggerSize?: 'xs' | 'sm' | 'md' | 'lg';
  selfId?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const editing = Boolean(user?.id);
  const [open, setOpen] = useState(openInitially);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [password, setPassword] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [form, setForm] = useState({
    name: user?.name ?? '',
    loginId: user?.loginId ?? '',
    email: user?.email ?? '',
    role: user?.role ?? ('STAFF' as Role),
    phone: user?.phone ?? '',
    jobTitle: user?.jobTitle ?? '',
    accent: user?.accent ?? 'indigo',
    isActive: user ? user.isActive === 1 : true,
  });

  const strength = passwordStrength(password);
  const isSelf = Boolean(user?.id && selfId && user.id === selfId);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      if (editing) {
        await api(`/api/users/${user!.id}`, {
          method: 'PATCH',
          body: { name: form.name, email: form.email, role: form.role, phone: form.phone, jobTitle: form.jobTitle, accent: form.accent, isActive: form.isActive },
        });
        if (resetPassword) {
          await api(`/api/users/${user!.id}`, { method: 'POST', body: { password: resetPassword } });
          setResetPassword('');
        }
        toast.success('Teammate updated', `${form.name} · ${ROLE_META[form.role].label}`);
      } else {
        await api('/api/users', {
          method: 'POST',
          body: { ...form, password, confirmPassword: password },
        });
        toast.success('Teammate added', `${form.name} can sign in with ${form.loginId}.`);
      }
      setOpen(false);
      router.refresh();
    } catch (error) {
      if (error instanceof RequestFailed) {
        setErrors(error.fieldErrors ?? {});
        toast.error('Could not save the teammate', error.message);
      } else {
        toast.error('Could not save the teammate', errorMessage(error));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button size={triggerSize} variant={triggerVariant} icon={editing ? <Pencil size={14} /> : <UserPlus size={15} />} onClick={() => setOpen(true)}>
        {triggerLabel ?? (editing ? 'Edit' : 'Add teammate')}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
        title={editing ? `Edit ${user!.name}` : 'Add a teammate'}
        subtitle={editing ? `Login Id ${user!.loginId}` : 'They sign in with the Login Id and password you set here.'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button form="user-form" type="submit" loading={busy} icon={editing ? <Pencil size={14} /> : <UserPlus size={15} />}>
              {editing ? 'Save changes' : 'Add teammate'}
            </Button>
          </>
        }
      >
        <form id="user-form" className="space-y-5" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" error={errors.name} required>
              <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Neha Kulkarni" />
            </Field>
            <Field label="Login Id" error={errors.loginId} hint={editing ? 'Login Id cannot be changed' : '6–12 characters'} required>
              <Input
                value={form.loginId}
                disabled={editing}
                onChange={(event) => setForm({ ...form, loginId: event.target.value })}
                placeholder="neha.k"
              />
            </Field>
            <Field label="Email Id" error={errors.email} required>
              <Input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="neha@stocksense.io" />
            </Field>
            <Field label="Role" error={errors.role} hint={ROLE_META[form.role].blurb}>
              <Select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as Role })}>
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_META[role].label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Phone" error={errors.phone}>
              <Input value={form.phone ?? ''} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="+91 98200 44556" />
            </Field>
            <Field label="Job title" error={errors.jobTitle}>
              <Input value={form.jobTitle ?? ''} onChange={(event) => setForm({ ...form, jobTitle: event.target.value })} placeholder="Warehouse Operator" />
            </Field>
          </div>

          <Field label="Accent colour">
            <div className="flex flex-wrap gap-1.5">
              {ACCENTS.map((accent) => (
                <button
                  key={accent}
                  type="button"
                  aria-label={accent}
                  onClick={() => setForm({ ...form, accent })}
                  className={cx(
                    'focus-ring h-6 w-6 rounded-full ring-offset-2 transition-shadow dark:ring-offset-ink-900',
                    accentOf(accent).chip,
                    form.accent === accent && 'ring-2 ring-ink-900 dark:ring-white',
                  )}
                />
              ))}
            </div>
          </Field>

          {!editing ? (
            <div className="rounded-xl border border-dashed border-ink-300 p-4 dark:border-ink-700">
              <Field label="Temporary password" error={errors.password} required hint="Lower, upper, special, more than 8 characters">
                <Input type="text" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Welcome@123" />
              </Field>
              {password ? (
                <div className="mt-2 flex items-center gap-2">
                  <Badge tone={strength.score >= 4 ? 'success' : strength.score >= 2 ? 'warning' : 'danger'}>{strength.label}</Badge>
                  <span className="text-[11.5px] text-ink-400">They can change it after signing in.</span>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-ink-300 p-4 dark:border-ink-700">
              <p className="flex items-center gap-2 text-[12.5px] font-medium text-ink-700 dark:text-ink-200">
                <KeyRound size={14} /> Reset password
              </p>
              <p className="mt-0.5 text-[11.5px] text-ink-500 dark:text-ink-400">
                Leave blank to keep the current password. Resetting signs the teammate out of every device.
              </p>
              <div className="mt-3">
                <Input
                  type="text"
                  value={resetPassword}
                  onChange={(event) => setResetPassword(event.target.value)}
                  placeholder="New password (optional)"
                />
              </div>
            </div>
          )}

          {editing ? (
            <Checkbox
              label={isSelf ? 'Active (you cannot deactivate yourself)' : 'Active — can sign in'}
              checked={form.isActive}
              disabled={isSelf}
              onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
            />
          ) : null}
        </form>
      </Modal>
    </>
  );
}
