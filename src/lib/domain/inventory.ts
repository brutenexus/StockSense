/**
 * The inventory engine.
 *
 * Everything in this file is pure: plain data in, plain data out. That keeps
 * the trickiest part of an IMS — availability, reservation and status logic —
 * independently testable and impossible to accidentally couple to SQLite.
 */
import type { DocumentStatus, DocumentType, MoveDirection } from './constants';

export type BalanceKey = { productId: string; locationId: string };

export type BalanceLike = {
  productId: string;
  locationId: string;
  quantity: number;
  reserved: number;
};

export type LineLike = {
  productId: string;
  quantity: number;
  uom?: string | null;
};

export type Availability = {
  productId: string;
  requested: number;
  onHand: number;
  reserved: number;
  free: number;
  shortage: number;
  ok: boolean;
};

export function balanceKey(productId: string, locationId: string): string {
  return `${productId}::${locationId}`;
}

/** Stock physically present. */
export function onHand(balances: BalanceLike[], productId: string, locationId?: string): number {
  return balances
    .filter((b) => b.productId === productId && (locationId === undefined || b.locationId === locationId))
    .reduce((sum, b) => sum + b.quantity, 0);
}

/** Stock that can still be committed to a new document. */
export function freeToUse(balances: BalanceLike[], productId: string, locationId?: string): number {
  return balances
    .filter((b) => b.productId === productId && (locationId === undefined || b.locationId === locationId))
    .reduce((sum, b) => sum + Math.max(0, b.quantity - b.reserved), 0);
}

export function reservedQty(balances: BalanceLike[], productId: string, locationId?: string): number {
  return balances
    .filter((b) => b.productId === productId && (locationId === undefined || b.locationId === locationId))
    .reduce((sum, b) => sum + b.reserved, 0);
}

/**
 * Aggregates the requested lines of a document against the free stock of a
 * single source location. Lines for the same product are summed so a document
 * never promises more than it holds.
 */
export function checkAvailability(
  lines: LineLike[],
  balances: BalanceLike[],
  sourceLocationId: string | null,
): Availability[] {
  const grouped = new Map<string, number>();
  for (const line of lines) {
    grouped.set(line.productId, (grouped.get(line.productId) ?? 0) + line.quantity);
  }
  return [...grouped.entries()].map(([productId, requested]) => {
    const scope = balances.filter((b) => b.productId === productId);
    const scoped = sourceLocationId ? scope.filter((b) => b.locationId === sourceLocationId) : scope;
    const stock = onHand(scoped, productId);
    const held = reservedQty(scoped, productId);
    const free = Math.max(0, stock - held);
    return {
      productId,
      requested,
      onHand: stock,
      reserved: held,
      free,
      shortage: Math.max(0, requested - free),
      ok: requested <= free,
    };
  });
}

/**
 * Confirm transitions (mock-up: `To Do` / `Confirm`).
 *
 * - Transfer & Delivery reserve stock. Deliveries that cannot be fully covered
 *   drop to WAITING instead of failing, so the warehouse keeps the order and it
 *   auto-promotes the moment a receipt lands.
 * - Receipts have nothing to reserve: goods are about to arrive.
 * - Adjustments are counts, not reservations.
 */
export function statusAfterConfirm(
  type: DocumentType,
  availability: Availability[],
): DocumentStatus {
  if (type === 'RECEIPT' || type === 'ADJUSTMENT') return 'READY';
  const fullyCovered = availability.every((a) => a.ok);
  return fullyCovered ? 'READY' : 'WAITING';
}

/** Which statuses a document may move to from `from`. */
export function allowedTransitions(type: DocumentType, from: DocumentStatus): DocumentStatus[] {
  if (from === 'DONE' || from === 'CANCELED') return [];
  switch (type) {
    case 'RECEIPT':
    case 'ADJUSTMENT':
      return from === 'DRAFT' ? ['READY', 'CANCELED'] : from === 'READY' ? ['DONE', 'DRAFT', 'CANCELED'] : ['CANCELED'];
    case 'DELIVERY':
    case 'TRANSFER':
      if (from === 'DRAFT') return ['READY', 'WAITING', 'CANCELED'];
      if (from === 'WAITING') return ['READY', 'DRAFT', 'CANCELED'];
      return ['DONE', 'WAITING', 'DRAFT', 'CANCELED'];
    default:
      return [];
  }
}

export function canTransition(type: DocumentType, from: DocumentStatus, to: DocumentStatus): boolean {
  return allowedTransitions(type, from).includes(to);
}

/**
 * How much of each line can realistically be reserved right now, given the
 * free stock at the source location. Used to build partial reservations.
 */
export function planReservation(
  lines: LineLike[],
  balances: BalanceLike[],
  sourceLocationId: string,
): { productId: string; want: number; reserve: number }[] {
  const grouped = new Map<string, number>();
  for (const line of lines) {
    grouped.set(line.productId, (grouped.get(line.productId) ?? 0) + line.quantity);
  }
  return [...grouped.entries()].map(([productId, want]) => ({
    productId,
    want,
    reserve: Math.max(0, Math.min(want, freeToUse(balances, productId, sourceLocationId))),
  }));
}

export type PlannedMove = {
  productId: string;
  direction: MoveDirection;
  fromLocationId: string | null;
  toLocationId: string | null;
  /** The single location whose balance this row records. */
  locationId: string;
  quantity: number;
  unitCost: number;
};

/**
 * Translate a validated document into concrete ledger movements.
 *
 * The invariant that makes the ledger auditable: **every balance change is
 * exactly one row**. A transfer therefore produces two rows sharing one
 * reference — an OUT of the source and an IN to the destination — so filtering
 * the move history by location always tells the whole truth.
 */
export function planMoves(input: {
  type: DocumentType;
  lines: { productId: string; quantity: number; unitCost?: number }[];
  fromLocationId: string | null;
  toLocationId: string | null;
}): PlannedMove[] {
  const { type, lines, fromLocationId, toLocationId } = input;
  const moves: PlannedMove[] = [];
  for (const line of lines ?? []) {
    const unitCost = line.unitCost ?? 0;
    if (line.quantity === 0) continue;
    switch (type) {
      case 'RECEIPT':
        if (!toLocationId) break;
        moves.push({
          productId: line.productId,
          direction: 'IN',
          fromLocationId,
          toLocationId,
          locationId: toLocationId,
          quantity: line.quantity,
          unitCost,
        });
        break;
      case 'DELIVERY':
        if (!fromLocationId) break;
        moves.push({
          productId: line.productId,
          direction: 'OUT',
          fromLocationId,
          toLocationId,
          locationId: fromLocationId,
          quantity: line.quantity,
          unitCost,
        });
        break;
      case 'TRANSFER':
        if (!fromLocationId || !toLocationId) break;
        moves.push({
          productId: line.productId,
          direction: 'OUT',
          fromLocationId,
          toLocationId,
          locationId: fromLocationId,
          quantity: line.quantity,
          unitCost,
        });
        moves.push({
          productId: line.productId,
          direction: 'IN',
          fromLocationId,
          toLocationId,
          locationId: toLocationId,
          quantity: line.quantity,
          unitCost,
        });
        break;
      case 'ADJUSTMENT': {
        // For adjustments `quantity` is the *counted* value; the caller passes
        // the signed delta in `unitCost`-free form via `signedDelta`.
        if (!fromLocationId) break;
        const signed = line.quantity;
        if (signed === 0) break;
        moves.push(
          signed > 0
            ? {
                productId: line.productId,
                direction: 'IN',
                fromLocationId: null,
                toLocationId: fromLocationId,
                locationId: fromLocationId,
                quantity: signed,
                unitCost,
              }
            : {
                productId: line.productId,
                direction: 'OUT',
                fromLocationId,
                toLocationId: null,
                locationId: fromLocationId,
                quantity: Math.abs(signed),
                unitCost,
              },
        );
        break;
      }
    }
  }
  return moves;
}

/** Apply planned moves to a mutable balance map. Returns the affected rows. */
export function applyMoves(
  balances: Map<string, BalanceLike>,
  moves: PlannedMove[],
): { productId: string; locationId: string; quantity: number; reserved: number }[] {
  const touched = new Map<string, { productId: string; locationId: string; quantity: number; reserved: number }>();
  for (const move of moves) {
    const key = balanceKey(move.productId, move.locationId);
    const current = balances.get(key) ?? {
      productId: move.productId,
      locationId: move.locationId,
      quantity: 0,
      reserved: 0,
    };
    current.quantity += move.direction === 'IN' ? move.quantity : -move.quantity;
    if (move.direction === 'OUT') {
      // Shipping consumes whatever was reserved first, then loose stock.
      current.reserved = Math.max(0, current.reserved - move.quantity);
    }
    balances.set(key, current);
    touched.set(key, { ...current });
  }
  return [...touched.values()];
}

/** Compute the signed deltas an adjustment needs from counted quantities. */
export function adjustmentDeltas(
  lines: { productId: string; counted: number }[],
  balances: BalanceLike[],
  locationId: string,
): { productId: string; counted: number; recorded: number; delta: number }[] {
  return lines.map((line) => {
    const recorded = onHand(balances, line.productId, locationId);
    return { ...line, recorded, delta: line.counted - recorded };
  });
}

export function stockHealth(quantity: number, reserved: number, reorderPoint: number) {
  const free = Math.max(0, quantity - reserved);
  if (quantity <= 0) return 'OUT_OF_STOCK' as const;
  if (free <= reorderPoint) return 'LOW_STOCK' as const;
  return 'HEALTHY' as const;
}

export function stockValue(balances: BalanceLike[], costs: Map<string, number>): number {
  return balances.reduce((sum, b) => sum + b.quantity * (costs.get(b.productId) ?? 0), 0);
}
