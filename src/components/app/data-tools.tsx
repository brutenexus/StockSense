'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Database, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { Button, Field, Input } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/overlay';
import { useToast } from '@/components/ui/toast';

type Health = { balanced: boolean; driftRows: number; negativeRows: number; checkedAt: string };

export function DataTools({ initialHealth, canManage }: { initialHealth: Health; canManage: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [health, setHealth] = useState(initialHealth);
  const [busy, setBusy] = useState<'check' | 'recompute' | 'reseed' | null>(null);
  const [confirmReseed, setConfirmReseed] = useState(false);
  const [confirmation, setConfirmation] = useState('');

  async function run(action: 'check' | 'recompute') {
    setBusy(action);
    try {
      const result = await api<{ fixed?: number; health: Health }>('/api/settings/data', { body: { action } });
      setHealth(result.health);
      if (action === 'recompute') {
        toast.success('Balances recomputed', `${result.fixed ?? 0} row(s) corrected from the ledger.`);
      } else {
        toast[result.health.balanced ? 'success' : 'warning'](
          result.health.balanced ? 'Ledger balanced' : 'Drift detected',
          result.health.balanced
            ? 'Every balance matches the sum of its movements.'
            : `${result.health.driftRows} drifted row(s), ${result.health.negativeRows} negative row(s).`,
        );
      }
      router.refresh();
    } catch (error) {
      toast.error('Integrity check failed', errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function reseed() {
    setBusy('reseed');
    try {
      const result = await api<{ result: { counts: Record<string, number> } }>('/api/settings/data', {
        body: { action: 'reseed', confirmation },
      });
      toast.success('Demo data restored', `${result.result.counts.documents} documents · ${result.result.counts.moves} ledger rows.`);
      setConfirmReseed(false);
      setConfirmation('');
      router.refresh();
    } catch (error) {
      toast.error('Could not reseed', errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" icon={<ShieldCheck size={14} />} loading={busy === 'check'} onClick={() => run('check')}>
          Run integrity check
        </Button>
        {canManage ? (
          <>
            <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} loading={busy === 'recompute'} onClick={() => run('recompute')}>
              Recompute balances
            </Button>
            <Button size="sm" variant="ghost" icon={<Database size={14} />} className="text-rose-600 dark:text-rose-400" onClick={() => setConfirmReseed(true)}>
              Restore demo data
            </Button>
          </>
        ) : null}
      </div>

      <div className="rounded-xl bg-ink-50 px-4 py-3 text-[12.5px] dark:bg-ink-800/50">
        <p className="flex items-center gap-2 font-medium text-ink-700 dark:text-ink-200">
          <Sparkles size={14} className={health.balanced ? 'text-emerald-500' : 'text-amber-500'} />
          {health.balanced ? 'Balances agree with the ledger' : 'Balances need attention'}
        </p>
        <p className="mt-1 text-ink-500 dark:text-ink-400">
          {health.driftRows} drifted row(s) · {health.negativeRows} negative row(s) · checked {formatDateTime(health.checkedAt)}
        </p>
      </div>

      <ConfirmDialog
        open={confirmReseed}
        title="Restore the demo dataset?"
        description={
          <span className="block space-y-3">
            <span className="block">
              This deletes every product, document, movement and balance, then replays the StockSense demo dataset. Anything you created
              yourself is lost.
            </span>
            <span className="block">
              <Field label="Type RESEED to confirm" required>
                <Input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="RESEED" />
              </Field>
            </span>
          </span>
        }
        confirmLabel="Wipe & reseed"
        tone="danger"
        loading={busy === 'reseed'}
        onCancel={() => {
          setConfirmReseed(false);
          setConfirmation('');
        }}
        onConfirm={reseed}
      />
    </div>
  );
}
