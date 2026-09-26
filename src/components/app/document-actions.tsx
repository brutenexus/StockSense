'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BadgeCheck, Check, RotateCcw, Trash2, XCircle } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import type { DocumentStatus, DocumentType } from '@/lib/domain/constants';
import { TYPE_SEGMENTS } from '@/lib/domain/routes';
import { Button } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/overlay';
import { useToast } from '@/components/ui/toast';

type Action = 'confirm' | 'validate' | 'cancel' | 'reset';

export function DocumentActions({
  documentId,
  reference,
  type,
  status,
  capabilities,
  onDeleted,
}: {
  documentId: string;
  reference: string;
  type: DocumentType;
  status: DocumentStatus;
  capabilities: { confirm: boolean; validate: boolean; cancel: boolean; reset: boolean; delete: boolean };
  onDeleted?: 'stay' | 'navigate';
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<Action | 'delete' | null>(null);
  const [confirm, setConfirm] = useState<Action | 'delete' | null>(null);

  const closed = status === 'DONE' || status === 'CANCELED';

  async function run(action: Action) {
    setBusy(action);
    try {
      const result = await api<{ document: { reference: string; status: DocumentStatus }; moves: number }>(
        `/api/documents/${documentId}/actions`,
        { body: { action } },
      );
      const messages: Record<Action, string> = {
        confirm: `${reference} is ${result.document.status === 'WAITING' ? 'waiting for stock' : 'ready to process'}.`,
        validate: `${result.moves} ledger movement${result.moves === 1 ? '' : 's'} posted.`,
        cancel: 'Reservations were released.',
        reset: 'Back in draft — edit and confirm again.',
      };
      toast.success(`${reference} ${action === 'validate' ? 'validated' : action + 'ed'}`, messages[action]);
      setConfirm(null);
      router.refresh();
    } catch (error) {
      toast.error(`Could not ${action} ${reference}`, errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy('delete');
    try {
      await api(`/api/documents/${documentId}`, { method: 'DELETE' });
      toast.success('Draft deleted', `${reference} was removed.`);
      setConfirm(null);
      if (onDeleted === 'navigate') router.push(`/operations/${TYPE_SEGMENTS[type]}`);
      router.refresh();
    } catch (error) {
      toast.error('Could not delete the draft', errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {!closed && (status === 'DRAFT' || status === 'WAITING') && capabilities.confirm ? (
          <Button size="sm" icon={<Check size={15} />} loading={busy === 'confirm'} onClick={() => run('confirm')}>
            {status === 'WAITING' ? 'Re-check availability' : 'Confirm'}
          </Button>
        ) : null}

        {!closed && status === 'READY' && capabilities.validate ? (
          <Button size="sm" variant="success" icon={<BadgeCheck size={15} />} loading={busy === 'validate'} onClick={() => run('validate')}>
            Validate &amp; post
          </Button>
        ) : null}

        {!closed && status === 'WAITING' && capabilities.validate ? (
          <Button size="sm" variant="outline" icon={<BadgeCheck size={15} />} loading={busy === 'validate'} onClick={() => setConfirm('validate')}>
            Validate anyway
          </Button>
        ) : null}

        {!closed && status === 'READY' && capabilities.reset ? (
          <Button size="sm" variant="outline" icon={<RotateCcw size={14} />} loading={busy === 'reset'} onClick={() => setConfirm('reset')}>
            Back to draft
          </Button>
        ) : null}

        {!closed && capabilities.cancel ? (
          <Button size="sm" variant="ghost" icon={<XCircle size={14} />} loading={busy === 'cancel'} onClick={() => setConfirm('cancel')} className="text-rose-600 dark:text-rose-400">
            Cancel document
          </Button>
        ) : null}

        {status === 'DRAFT' && capabilities.delete ? (
          <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} loading={busy === 'delete'} onClick={() => setConfirm('delete')}>
            Delete
          </Button>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirm === 'cancel'}
        title={`Cancel ${reference}?`}
        description="Any stock this document reserved is released immediately. The document stays in the history as canceled — nothing is deleted."
        confirmLabel="Cancel document"
        tone="danger"
        loading={busy === 'cancel'}
        onCancel={() => setConfirm(null)}
        onConfirm={() => run('cancel')}
      />

      <ConfirmDialog
        open={confirm === 'reset'}
        title={`Send ${reference} back to draft?`}
        description="Reserved stock is released and the document can be edited again before it is confirmed."
        confirmLabel="Back to draft"
        loading={busy === 'reset'}
        onCancel={() => setConfirm(null)}
        onConfirm={() => run('reset')}
      />

      <ConfirmDialog
        open={confirm === 'validate'}
        title={`Validate ${reference} while stock is short?`}
        description="The ledger will refuse to post if free stock is still missing at the source location. This is only useful once the shortage is resolved."
        confirmLabel="Try to validate"
        tone="success"
        loading={busy === 'validate'}
        onCancel={() => setConfirm(null)}
        onConfirm={() => run('validate')}
      />

      <ConfirmDialog
        open={confirm === 'delete'}
        title={`Delete draft ${reference}?`}
        description="This permanently removes the draft. Confirmed or validated documents can never be deleted, only canceled."
        confirmLabel="Delete draft"
        tone="danger"
        loading={busy === 'delete'}
        onCancel={() => setConfirm(null)}
        onConfirm={remove}
      />
    </>
  );
}


