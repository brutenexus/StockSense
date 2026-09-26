import { describe, expect, it } from 'vitest';
import {
  adjustmentDeltas,
  allowedTransitions,
  applyMoves,
  balanceKey,
  canTransition,
  checkAvailability,
  freeToUse,
  onHand,
  planMoves,
  planReservation,
  reservedQty,
  statusAfterConfirm,
  stockHealth,
  stockValue,
  type BalanceLike,
} from '@/lib/domain/inventory';
import { counterKey, formatReference, isValidReference, parseReference } from '@/lib/domain/references';
import { canCreateDocument, canValidateDocument, documentCapabilities } from '@/lib/domain/permissions';
import { can } from '@/lib/domain/constants';

const balances = (...rows: [string, string, number, number][]): BalanceLike[] =>
  rows.map(([productId, locationId, quantity, reserved]) => ({ productId, locationId, quantity, reserved }));

describe('availability', () => {
  const stock = balances(['p1', 'loc1', 10, 4], ['p1', 'loc2', 6, 0], ['p2', 'loc1', 3, 3]);

  it('sums on hand and reservations per scope', () => {
    expect(onHand(stock, 'p1')).toBe(16);
    expect(reservedQty(stock, 'p1')).toBe(4);
    expect(freeToUse(stock, 'p1')).toBe(12);
    expect(onHand(stock, 'p1', 'loc1')).toBe(10);
    expect(freeToUse(stock, 'p1', 'loc1')).toBe(6);
  });

  it('reports a shortage when the requested quantity exceeds free stock', () => {
    const [line] = checkAvailability([{ productId: 'p2', quantity: 5 }], stock, 'loc1');
    expect(line).toMatchObject({ requested: 5, onHand: 3, reserved: 3, free: 0, shortage: 5, ok: false });
  });

  it('aggregates multiple lines for the same product', () => {
    const [line] = checkAvailability(
      [
        { productId: 'p1', quantity: 3 },
        { productId: 'p1', quantity: 4 },
      ],
      stock,
      'loc1',
    );
    expect(line?.requested).toBe(7);
    expect(line?.ok).toBe(false);
  });

  it('scopes availability to the source location when one is given', () => {
    const [line] = checkAvailability([{ productId: 'p1', quantity: 8 }], stock, 'loc2');
    expect(line).toMatchObject({ free: 6, shortage: 2, ok: false });
  });

  it('plans partial reservations from free stock', () => {
    const plan = planReservation(
      [
        { productId: 'p1', quantity: 9 },
        { productId: 'p2', quantity: 1 },
      ],
      stock,
      'loc1',
    );
    expect(plan).toEqual([
      { productId: 'p1', want: 9, reserve: 6 },
      { productId: 'p2', want: 1, reserve: 0 },
    ]);
  });
});

describe('status machine', () => {
  it('never blocks a receipt or a count on stock', () => {
    expect(statusAfterConfirm('RECEIPT', [{ productId: 'p', requested: 5, onHand: 0, reserved: 0, free: 0, shortage: 5, ok: false }])).toBe('READY');
    expect(statusAfterConfirm('ADJUSTMENT', [])).toBe('READY');
  });

  it('drops a short delivery or transfer into WAITING', () => {
    const short = checkAvailability([{ productId: 'p', quantity: 5 }], balances(['p', 'loc', 1, 0]), 'loc');
    expect(statusAfterConfirm('DELIVERY', short)).toBe('WAITING');
    expect(statusAfterConfirm('TRANSFER', short)).toBe('WAITING');
  });

  it('promotes when everything is covered', () => {
    const covered = checkAvailability([{ productId: 'p', quantity: 5 }], balances(['p', 'loc', 9, 0]), 'loc');
    expect(statusAfterConfirm('DELIVERY', covered)).toBe('READY');
  });

  it('exposes the transitions drawn on the mock-up', () => {
    expect(allowedTransitions('RECEIPT', 'DRAFT')).toContain('READY');
    expect(allowedTransitions('DELIVERY', 'DRAFT')).toEqual(expect.arrayContaining(['READY', 'WAITING', 'CANCELED']));
    expect(allowedTransitions('TRANSFER', 'READY')).toContain('DONE');
    expect(allowedTransitions('RECEIPT', 'DONE')).toEqual([]);
    expect(canTransition('ADJUSTMENT', 'READY', 'DONE')).toBe(true);
    expect(canTransition('ADJUSTMENT', 'DRAFT', 'DONE')).toBe(false);
  });
});

describe('move planning', () => {
  it('routes a receipt from the virtual input to the destination bin', () => {
    const moves = planMoves({
      type: 'RECEIPT',
      lines: [{ productId: 'p', quantity: 5, unitCost: 10 }],
      fromLocationId: 'input',
      toLocationId: 'bin',
    });
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ direction: 'IN', locationId: 'bin', quantity: 5, unitCost: 10 });
  });

  it('writes two ledger rows for a transfer so both sides are visible', () => {
    const moves = planMoves({
      type: 'TRANSFER',
      lines: [{ productId: 'p', quantity: 4 }],
      fromLocationId: 'from',
      toLocationId: 'to',
    });
    expect(moves.map((move) => [move.direction, move.locationId])).toEqual([
      ['OUT', 'from'],
      ['IN', 'to'],
    ]);
  });

  it('turns an adjustment into a signed move', () => {
    const up = planMoves({ type: 'ADJUSTMENT', lines: [{ productId: 'p', quantity: 7 }], fromLocationId: 'bin', toLocationId: null });
    const down = planMoves({ type: 'ADJUSTMENT', lines: [{ productId: 'p', quantity: -3 }], fromLocationId: 'bin', toLocationId: null });
    expect(up[0]).toMatchObject({ direction: 'IN', quantity: 7, locationId: 'bin' });
    expect(down[0]).toMatchObject({ direction: 'OUT', quantity: 3, locationId: 'bin' });
  });

  it('skips zero quantities and missing endpoints', () => {
    expect(planMoves({ type: 'RECEIPT', lines: [{ productId: 'p', quantity: 0 }], fromLocationId: null, toLocationId: 'bin' })).toEqual([]);
    expect(planMoves({ type: 'TRANSFER', lines: [{ productId: 'p', quantity: 2 }], fromLocationId: 'from', toLocationId: null })).toEqual([]);
  });

  it('applies planned moves to a balance map and consumes reservations first', () => {
    const map = new Map([['p::bin', { productId: 'p', locationId: 'bin', quantity: 10, reserved: 6 }]]);
    const touched = applyMoves(map, planMoves({ type: 'DELIVERY', lines: [{ productId: 'p', quantity: 5 }], fromLocationId: 'bin', toLocationId: 'out' }));
    expect(touched[0]).toMatchObject({ quantity: 5, reserved: 1 });
    expect(map.get('p::bin')).toMatchObject({ quantity: 5, reserved: 1 });
    expect(balanceKey('p', 'bin')).toBe('p::bin');
  });

  it('computes adjustment deltas from counted quantities', () => {
    const deltas = adjustmentDeltas([{ productId: 'p', counted: 8 }], balances(['p', 'bin', 12, 0]), 'bin');
    expect(deltas[0]).toMatchObject({ recorded: 12, delta: -4 });
  });
});

describe('health and valuation', () => {
  it('classifies stock against the reorder point', () => {
    expect(stockHealth(0, 0, 5)).toBe('OUT_OF_STOCK');
    expect(stockHealth(9, 5, 5)).toBe('LOW_STOCK');
    expect(stockHealth(20, 5, 5)).toBe('HEALTHY');
  });

  it('values balances at cost', () => {
    expect(stockValue(balances(['p1', 'loc', 2, 0], ['p2', 'loc', 3, 0]), new Map([['p1', 10], ['p2', 5]]))).toBe(35);
  });
});

describe('references', () => {
  it('formats <warehouse>/<operation>/<id> with padding', () => {
    expect(formatReference('wh', 'RECEIPT', 7)).toBe('WH/IN/0007');
    expect(formatReference('ND', 'ADJUSTMENT', 12)).toBe('ND/ADJ/0012');
    expect(counterKey('nd', 'DELIVERY')).toBe('ND/OUT');
  });

  it('parses and validates references', () => {
    expect(parseReference('WH/OUT/0002')).toEqual({ warehouse: 'WH', op: 'OUT', id: 2 });
    expect(isValidReference('WH/OUT/0002')).toBe(true);
    expect(isValidReference('WH/0002')).toBe(false);
    expect(isValidReference('nonsense')).toBe(false);
  });
});

describe('permissions', () => {
  it('lets staff raise transfers and counts but not receipts or deliveries', () => {
    expect(canCreateDocument('STAFF', 'TRANSFER')).toBe(true);
    expect(canCreateDocument('STAFF', 'ADJUSTMENT')).toBe(true);
    expect(canCreateDocument('STAFF', 'RECEIPT')).toBe(false);
    expect(canCreateDocument('STAFF', 'DELIVERY')).toBe(false);
  });

  it('reserves delivery validation for managers', () => {
    expect(canValidateDocument('STAFF', 'DELIVERY')).toBe(false);
    expect(canValidateDocument('MANAGER', 'DELIVERY')).toBe(true);
    expect(canValidateDocument('STAFF', 'RECEIPT')).toBe(true);
  });

  it('hides costs from staff', () => {
    expect(documentCapabilities('STAFF', 'RECEIPT').viewCosts).toBe(false);
    expect(documentCapabilities('MANAGER', 'RECEIPT').viewCosts).toBe(true);
    expect(can(undefined, 'view_costs')).toBe(false);
  });
});
