'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Scale, SlidersHorizontal } from 'lucide-react';
import { api, errorMessage, RequestFailed } from '@/lib/api';
import { Button, cx, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/overlay';
import { useToast } from '@/components/ui/toast';
import type { Option } from './product-form';

export type StockLocationOption = Option & { quantity: number; reserved: number; uom?: string | null; warehouseName?: string };

/**
 * The mock-up calls this out explicitly: "User must be able to update the stock
 * from here." The dialog captures a counted quantity and lets the API book a
 * real adjustment document, so every correction stays auditable.
 */
export function StockForm({
  productId,
  productName,
  uom,
  locations,
  initialLocationId,
  openInitially = false,
  triggerLabel = 'Update stock',
  triggerVariant = 'outline',
  triggerSize = 'sm',
}: {
  productId: string;
  productName: string;
  uom: string;
  locations: StockLocationOption[];
  initialLocationId?: string;
  openInitially?: boolean;
  triggerLabel?: string;
  triggerVariant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  triggerSize?: 'xs' | 'sm' | 'md';
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(openInitially);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [locationId, setLocationId] = useState(initialLocationId ?? locations[0]?.id ?? '');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');

  const location = locations.find((entry) => entry.id === locationId) ?? locations[0];
  const recorded = location?.quantity ?? 0;
  const counted = quantity === '' ? Number.NaN : Number(quantity);
  const delta = Number.isFinite(counted) ? counted - recorded : 0;

  function openDialog() {
    setErrors({});
    setQuantity('');
    setNote('');
    setLocationId(initialLocationId ?? locations[0]?.id ?? '');
    setOpen(true);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const result = await api<{ unchanged: boolean; document: { reference: string } | null; moves: number }>(
        `/api/products/${productId}/stock`,
        { body: { locationId, quantity: Number(quantity), note } },
      );
      if (result.unchanged) {
        toast.info('No change recorded', `${productName} already shows ${recorded} ${uom} at that location.`);
      } else {
        toast.success('Stock updated', `Adjustment ${result.document?.reference} posted ${result.moves} movement(s).`);
      }
      setOpen(false);
      router.refresh();
    } catch (error) {
      if (error instanceof RequestFailed) {
        setErrors(error.fieldErrors ?? {});
        toast.error('Could not update the stock', error.message);
      } else {
        toast.error('Could not update the stock', errorMessage(error));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button size={triggerSize} variant={triggerVariant} icon={<SlidersHorizontal size={14} />} onClick={openDialog} disabled={locations.length === 0}>
        {triggerLabel}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="md"
        title="Update stock"
        subtitle={`${productName} · counted quantities are booked as an adjustment`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button form="stock-form" type="submit" loading={busy} icon={<Scale size={15} />}>
              Post adjustment
            </Button>
          </>
        }
      >
        <form id="stock-form" className="space-y-4" onSubmit={submit}>
          <Field label="Storage location" error={errors.locationId} required>
            <Select value={locationId} onChange={(event) => setLocationId(event.target.value)}>
              {locations.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label} — {entry.quantity} on hand
                </option>
              ))}
            </Select>
          </Field>

          {location ? (
            <div className="grid grid-cols-3 gap-3 rounded-xl bg-ink-50 p-3 text-[12.5px] dark:bg-ink-800/50">
              <div>
                <p className="text-ink-400">Recorded</p>
                <p className="tnum font-semibold text-ink-800 dark:text-ink-100">
                  {recorded} {uom}
                </p>
              </div>
              <div>
                <p className="text-ink-400">Reserved</p>
                <p className="tnum font-semibold text-ink-800 dark:text-ink-100">
                  {location.reserved} {uom}
                </p>
              </div>
              <div>
                <p className="text-ink-400">Free</p>
                <p className="tnum font-semibold text-ink-800 dark:text-ink-100">
                  {Math.max(0, location.quantity - location.reserved)} {uom}
                </p>
              </div>
            </div>
          ) : null}

          <Field label="Counted quantity" error={errors.quantity} required hint="What is physically on the shelf right now">
            <Input
              autoFocus
              type="number"
              min="0"
              step="0.01"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              placeholder={String(recorded)}
            />
          </Field>

          {Number.isFinite(counted) ? (
            <p className={cx('text-[12.5px]', delta === 0 ? 'text-ink-400' : delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
              {delta === 0
                ? 'No difference from the recorded balance.'
                : `This will ${delta > 0 ? 'increase' : 'reduce'} ${location?.label ?? 'the location'} by ${Math.abs(delta)} ${uom}.`}
            </p>
          ) : null}

          <Field label="Reason" error={errors.note} hint="Cycle count, damage, found stock…">
            <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Cycle count — Rack A packaging bay" />
          </Field>
        </form>
      </Modal>
    </>
  );
}
