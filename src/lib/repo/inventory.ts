import { all, get, like, nowIso, run, scalar, tx, uid } from '../db';
import { balanceKey, type BalanceLike } from '../domain/inventory';
import type { DocumentType, MoveDirection } from '../domain/constants';

export type BalanceRow = {
  id: string;
  productId: string;
  locationId: string;
  quantity: number;
  reserved: number;
  updatedAt: string;
  productName?: string;
  sku?: string;
  uom?: string;
  locationName?: string;
  locationCode?: string;
  warehouseId?: string;
  warehouseName?: string;
};

export type MoveRow = {
  id: string;
  reference: string;
  documentId: string | null;
  documentType: string;
  documentLineId: string | null;
  productId: string;
  productName: string;
  sku: string;
  uom: string;
  categoryName: string | null;
  fromLocationId: string | null;
  fromLocationName: string | null;
  fromLocationCode: string | null;
  toLocationId: string | null;
  toLocationName: string | null;
  toLocationCode: string | null;
  locationId: string | null;
  locationName: string | null;
  locationCode: string | null;
  quantity: number;
  direction: MoveDirection;
  unitCost: number;
  balanceAfter: number | null;
  note: string | null;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
};

const MOVE_COLUMNS = `m.id, m.reference, m.document_id AS documentId, m.document_type AS documentType,
  m.document_line_id AS documentLineId, m.product_id AS productId, p.name AS productName, p.sku, p.uom,
  cat.name AS categoryName,
  m.from_location_id AS fromLocationId, fl.name AS fromLocationName, fl.short_code AS fromLocationCode,
  m.to_location_id AS toLocationId, tl.name AS toLocationName, tl.short_code AS toLocationCode,
  m.location_id AS locationId, ll.name AS locationName, ll.short_code AS locationCode,
  m.quantity, m.direction, m.unit_cost AS unitCost, m.balance_after AS balanceAfter, m.note,
  m.created_by AS createdBy, u.name AS createdByName, m.created_at AS createdAt`;

const MOVE_JOINS = `FROM stock_moves m
  JOIN products p ON p.id = m.product_id
  LEFT JOIN categories cat ON cat.id = p.category_id
  LEFT JOIN locations fl ON fl.id = m.from_location_id
  LEFT JOIN locations tl ON tl.id = m.to_location_id
  LEFT JOIN locations ll ON ll.id = m.location_id
  LEFT JOIN users u ON u.id = m.created_by`;

/* ----------------------------------------------------------------- balances */

export function listBalances(opts: { productId?: string; locationId?: string; warehouseId?: string; onlyNonZero?: boolean } = {}): BalanceRow[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (opts.onlyNonZero !== false) clauses.push('(b.quantity <> 0 OR b.reserved <> 0)');
  if (opts.productId) {
    clauses.push('b.product_id = ?');
    params.push(opts.productId);
  }
  if (opts.locationId) {
    clauses.push('b.location_id = ?');
    params.push(opts.locationId);
  }
  if (opts.warehouseId) {
    clauses.push('l.warehouse_id = ?');
    params.push(opts.warehouseId);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return all<BalanceRow>(
    `SELECT b.id, b.product_id AS productId, b.location_id AS locationId, b.quantity, b.reserved, b.updated_at AS updatedAt,
            p.name AS productName, p.sku, p.uom, l.name AS locationName, l.short_code AS locationCode,
            l.warehouse_id AS warehouseId, w.name AS warehouseName
     FROM stock_balances b
     JOIN products p ON p.id = b.product_id
     JOIN locations l ON l.id = b.location_id
     JOIN warehouses w ON w.id = l.warehouse_id
     ${where}
     ORDER BY p.name COLLATE NOCASE, w.name COLLATE NOCASE, l.name COLLATE NOCASE`,
    params,
  );
}

export function balanceMap(opts: { productIds?: string[]; locationIds?: string[] } = {}): Map<string, BalanceLike> {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (opts.productIds?.length) {
    clauses.push(`product_id IN (${opts.productIds.map(() => '?').join(',')})`);
    params.push(...opts.productIds);
  }
  if (opts.locationIds?.length) {
    clauses.push(`location_id IN (${opts.locationIds.map(() => '?').join(',')})`);
    params.push(...opts.locationIds);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = all<{ productId: string; locationId: string; quantity: number; reserved: number }>(
    `SELECT product_id AS productId, location_id AS locationId, quantity, reserved FROM stock_balances ${where}`,
    params,
  );
  const map = new Map<string, BalanceLike>();
  for (const row of rows) map.set(balanceKey(row.productId, row.locationId), row);
  return map;
}

/** Upsert a relative change onto a product/location balance. */
export function applyDelta(productId: string, locationId: string, deltaQty: number, deltaReserved = 0, stamp = nowIso()): BalanceRow {
  const existing = get<{ id: string; quantity: number; reserved: number }>(
    'SELECT id, quantity, reserved FROM stock_balances WHERE product_id = ? AND location_id = ?',
    [productId, locationId],
  );
  if (!existing) {
    run(
      `INSERT INTO stock_balances (id, product_id, location_id, quantity, reserved, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [uid.next('bal'), productId, locationId, deltaQty, Math.max(0, deltaReserved), stamp],
    );
  } else {
    run('UPDATE stock_balances SET quantity = ?, reserved = ?, updated_at = ? WHERE id = ?', [
      existing.quantity + deltaQty,
      Math.max(0, existing.reserved + deltaReserved),
      stamp,
      existing.id,
    ]);
  }
  return get<BalanceRow>(
    `SELECT b.id, b.product_id AS productId, b.location_id AS locationId, b.quantity, b.reserved, b.updated_at AS updatedAt
     FROM stock_balances b WHERE b.product_id = ? AND b.location_id = ?`,
    [productId, locationId],
  )!;
}

export function currentQuantity(productId: string, locationId: string): number {
  return Number(
    scalar<number>('SELECT COALESCE(quantity, 0) FROM stock_balances WHERE product_id = ? AND location_id = ?', [productId, locationId]) ?? 0,
  );
}

export function currentReserved(productId: string, locationId: string): number {
  return Number(
    scalar<number>('SELECT COALESCE(reserved, 0) FROM stock_balances WHERE product_id = ? AND location_id = ?', [productId, locationId]) ?? 0,
  );
}

/* -------------------------------------------------------------------- moves */

function buildMoveFilters(opts: MoveFilters): { where: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (opts.search) {
    const term = like(opts.search);
    clauses.push(`(m.reference LIKE ? ESCAPE '\\' OR p.name LIKE ? ESCAPE '\\' OR p.sku LIKE ? ESCAPE '\\' OR m.note LIKE ? ESCAPE '\\')`);
    params.push(term, term, term, term);
  }
  if (opts.productId) {
    clauses.push('m.product_id = ?');
    params.push(opts.productId);
  }
  if (opts.locationId) {
    clauses.push('(m.from_location_id = ? OR m.to_location_id = ?)');
    params.push(opts.locationId, opts.locationId);
  }
  if (opts.warehouseId) {
    clauses.push(
      `(m.location_id IN (SELECT id FROM locations WHERE warehouse_id = ?)
        OR m.from_location_id IN (SELECT id FROM locations WHERE warehouse_id = ?)
        OR m.to_location_id IN (SELECT id FROM locations WHERE warehouse_id = ?))`,
    );
    params.push(opts.warehouseId, opts.warehouseId, opts.warehouseId);
  }
  if (opts.categoryId) {
    clauses.push('p.category_id = ?');
    params.push(opts.categoryId);
  }
  if (opts.documentType) {
    clauses.push('m.document_type = ?');
    params.push(opts.documentType);
  }
  if (opts.direction) {
    clauses.push('m.direction = ?');
    params.push(opts.direction);
  }
  if (opts.documentId) {
    clauses.push('m.document_id = ?');
    params.push(opts.documentId);
  }
  if (opts.createdBy) {
    clauses.push('m.created_by = ?');
    params.push(opts.createdBy);
  }
  if (opts.from) {
    clauses.push('m.created_at >= ?');
    params.push(opts.from);
  }
  if (opts.to) {
    clauses.push('m.created_at <= ?');
    params.push(opts.to);
  }
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

export type MoveFilters = {
  search?: string;
  productId?: string;
  locationId?: string;
  warehouseId?: string;
  categoryId?: string;
  documentType?: DocumentType | 'INITIAL' | 'ALL';
  direction?: MoveDirection;
  documentId?: string;
  createdBy?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

export function listMoves(opts: MoveFilters = {}): { items: MoveRow[]; total: number; totals: { inQty: number; outQty: number } } {
  const { where, params } = buildMoveFilters(opts);
  const limit = Math.min(Math.max(opts.limit ?? 60, 1), 1000);
  const offset = Math.max(opts.offset ?? 0, 0);
  const total = Number(scalar<number>(`SELECT COUNT(*) ${MOVE_JOINS} ${where}`, params) ?? 0);
  const items = all<MoveRow>(
    `SELECT ${MOVE_COLUMNS} ${MOVE_JOINS} ${where} ORDER BY m.created_at DESC, m.rowid DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  const sums = get<{ inQty: number; outQty: number }>(
    `SELECT COALESCE(SUM(CASE WHEN m.direction = 'IN' THEN m.quantity ELSE 0 END), 0) AS inQty,
            COALESCE(SUM(CASE WHEN m.direction = 'OUT' THEN m.quantity ELSE 0 END), 0) AS outQty
     ${MOVE_JOINS} ${where}`,
    params,
  );
  return { items, total, totals: { inQty: Number(sums?.inQty ?? 0), outQty: Number(sums?.outQty ?? 0) } };
}

export function productLedger(productId: string, limit = 100): MoveRow[] {
  return all<MoveRow>(
    `SELECT ${MOVE_COLUMNS} ${MOVE_JOINS} WHERE m.product_id = ? ORDER BY m.created_at DESC, m.rowid DESC LIMIT ?`,
    [productId, limit],
  );
}

export type NewMove = {
  reference: string;
  documentId?: string | null;
  documentType: DocumentType | 'INITIAL';
  documentLineId?: string | null;
  productId: string;
  fromLocationId?: string | null;
  toLocationId?: string | null;
  locationId: string;
  quantity: number;
  direction: MoveDirection;
  unitCost?: number;
  note?: string | null;
  createdBy?: string | null;
  createdAt?: string;
};

/**
 * Applies one ledger row **and** the matching balance change. Callers must run
 * inside `tx()` so a multi-line document is atomic.
 */
export function postMove(move: NewMove): MoveRow {
  const stamp = move.createdAt ?? nowIso();
  const delta = move.direction === 'IN' ? move.quantity : -move.quantity;
  const balance = applyDelta(move.productId, move.locationId, delta, 0, stamp);
  const id = uid.next('mov');
  run(
    `INSERT INTO stock_moves (id, reference, document_id, document_type, document_line_id, product_id,
       from_location_id, to_location_id, location_id, quantity, direction, unit_cost, balance_after, note, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      move.reference,
      move.documentId ?? null,
      move.documentType,
      move.documentLineId ?? null,
      move.productId,
      move.fromLocationId ?? null,
      move.toLocationId ?? null,
      move.locationId,
      move.quantity,
      move.direction,
      move.unitCost ?? 0,
      balance.quantity,
      move.note ?? null,
      move.createdBy ?? null,
      stamp,
    ],
  );
  return get<MoveRow>(`SELECT ${MOVE_COLUMNS} ${MOVE_JOINS} WHERE m.id = ?`, [id])!;
}

export function deleteMovesForDocument(documentId: string): void {
  run('DELETE FROM stock_moves WHERE document_id = ?', [documentId]);
}

/* -------------------------------------------------------------- aggregates */

export function stockTotals() {
  const row = get<{ products: number; onHand: number; reserved: number; value: number }>(
    `SELECT COUNT(DISTINCT CASE WHEN b.quantity <> 0 THEN b.product_id END) AS products,
            COALESCE(SUM(b.quantity), 0) AS onHand,
            COALESCE(SUM(b.reserved), 0) AS reserved,
            COALESCE(SUM(b.quantity * p.cost_price), 0) AS value
     FROM stock_balances b JOIN products p ON p.id = b.product_id`,
  );
  return {
    products: Number(row?.products ?? 0),
    onHand: Number(row?.onHand ?? 0),
    reserved: Number(row?.reserved ?? 0),
    value: Number(row?.value ?? 0),
  };
}

export function movementSeries(days = 14): { date: string; inQty: number; outQty: number; moves: number }[] {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  const rows = all<{ day: string; direction: MoveDirection; qty: number; moves: number }>(
    `SELECT substr(created_at, 1, 10) AS day, direction, SUM(quantity) AS qty, COUNT(*) AS moves
     FROM stock_moves WHERE created_at >= ? GROUP BY day, direction`,
    [start.toISOString()],
  );
  const buckets = new Map<string, { date: string; inQty: number; outQty: number; moves: number }>();
  for (let i = 0; i < days; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    buckets.set(key, { date: key, inQty: 0, outQty: 0, moves: 0 });
  }
  for (const row of rows) {
    const bucket = buckets.get(row.day);
    if (!bucket) continue;
    if (row.direction === 'IN') bucket.inQty += Number(row.qty);
    else bucket.outQty += Number(row.qty);
    bucket.moves += Number(row.moves);
  }
  return [...buckets.values()];
}

export function valueByCategory(): { name: string; value: number; color: string; quantity: number }[] {
  return all<{ name: string; value: number; color: string; quantity: number }>(
    `SELECT COALESCE(c.name, 'Uncategorised') AS name, COALESCE(c.color, 'slate') AS color,
            COALESCE(SUM(b.quantity * p.cost_price), 0) AS value, COALESCE(SUM(b.quantity), 0) AS quantity
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN stock_balances b ON b.product_id = p.id
     WHERE p.is_active = 1
     GROUP BY c.name, c.color
     HAVING value > 0
     ORDER BY value DESC`,
  );
}

export function topMovingProducts(limit = 6, days = 30): { productId: string; name: string; sku: string; moved: number; inQty: number; outQty: number }[] {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  return all<{ productId: string; name: string; sku: string; moved: number; inQty: number; outQty: number }>(
    `SELECT p.id AS productId, p.name, p.sku, SUM(m.quantity) AS moved,
            SUM(CASE WHEN m.direction = 'IN' THEN m.quantity ELSE 0 END) AS inQty,
            SUM(CASE WHEN m.direction = 'OUT' THEN m.quantity ELSE 0 END) AS outQty
     FROM stock_moves m JOIN products p ON p.id = m.product_id
     WHERE m.created_at >= ? GROUP BY p.id ORDER BY moved DESC LIMIT ?`,
    [since, limit],
  );
}

export function locationUtilisation(): { locationId: string; name: string; code: string; warehouse: string; quantity: number; value: number; skus: number }[] {
  return all<{ locationId: string; name: string; code: string; warehouse: string; quantity: number; value: number; skus: number }>(
    `SELECT l.id AS locationId, l.name, l.short_code AS code, w.name AS warehouse,
            COALESCE(SUM(b.quantity), 0) AS quantity,
            COALESCE(SUM(b.quantity * p.cost_price), 0) AS value,
            COUNT(DISTINCT CASE WHEN b.quantity <> 0 THEN b.product_id END) AS skus
     FROM locations l
     JOIN warehouses w ON w.id = l.warehouse_id
     LEFT JOIN stock_balances b ON b.location_id = l.id
     LEFT JOIN products p ON p.id = b.product_id
     WHERE l.kind IN ('INTERNAL', 'PRODUCTION', 'TRANSIT') AND l.is_active = 1
     GROUP BY l.id ORDER BY value DESC`,
  );
}

/**
 * Rebuilds every balance row from the immutable ledger. Used by the integrity
 * check in Settings → Data tools and by the test-suite to prove that the
 * incremental bookkeeping and the ledger agree.
 */
export function recomputeBalances(): number {
  return tx(() => {
    const moves = all<{ productId: string; locationId: string | null; quantity: number; direction: MoveDirection }>(
      'SELECT product_id AS productId, location_id AS locationId, quantity, direction FROM stock_moves ORDER BY created_at, rowid',
    );
    const totals = new Map<string, number>();
    for (const move of moves) {
      if (!move.locationId) continue;
      const key = balanceKey(move.productId, move.locationId);
      totals.set(key, (totals.get(key) ?? 0) + (move.direction === 'IN' ? move.quantity : -move.quantity));
    }
    const existing = all<{ id: string; productId: string; locationId: string }>(
      'SELECT id, product_id AS productId, location_id AS locationId FROM stock_balances',
    );
    let fixed = 0;
    const stamp = nowIso();
    for (const row of existing) {
      const expected = totals.get(balanceKey(row.productId, row.locationId)) ?? 0;
      const actual = Number(scalar<number>('SELECT quantity FROM stock_balances WHERE id = ?', [row.id]) ?? 0);
      if (Math.abs(expected - actual) > 1e-9) {
        // Reserved is a promise, not a physical quantity — it survives a rebuild.
        run('UPDATE stock_balances SET quantity = ?, reserved = MIN(reserved, MAX(?, 0)), updated_at = ? WHERE id = ?', [
          expected,
          expected,
          stamp,
          row.id,
        ]);
        fixed += 1;
      }
      totals.delete(balanceKey(row.productId, row.locationId));
    }
    for (const [key, quantity] of totals) {
      const [productId, locationId] = key.split('::');
      if (!productId || !locationId || quantity === 0) continue;
      run('INSERT INTO stock_balances (id, product_id, location_id, quantity, reserved, updated_at) VALUES (?, ?, ?, ?, 0, ?)', [
        uid.next('bal'),
        productId,
        locationId,
        quantity,
        stamp,
      ]);
      fixed += 1;
    }
    return fixed;
  });
}
