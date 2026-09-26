import { all, exec, get, like, nowIso, run, scalar, tx, uid } from '../db';
import { TYPE_META, type DocumentStatus, type DocumentType } from '../domain/constants';
import { counterKey, formatReference } from '../domain/references';
import {
  checkAvailability,
  planMoves,
  statusAfterConfirm,
  type Availability,
} from '../domain/inventory';
import { applyDelta, currentQuantity, postMove } from './inventory';
import { getLocation, getWarehouse, virtualLocation } from './warehouses';
import { findProductBySkuOrBarcode, getProduct } from './catalog';

export type DocumentRow = {
  id: string;
  reference: string;
  type: DocumentType;
  status: DocumentStatus;
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  fromLocationId: string | null;
  fromLocationName: string | null;
  fromLocationCode: string | null;
  toLocationId: string | null;
  toLocationName: string | null;
  toLocationCode: string | null;
  partnerId: string | null;
  partnerName: string | null;
  partnerKind: string | null;
  scheduleDate: string | null;
  responsibleId: string | null;
  responsibleName: string | null;
  operationType: string | null;
  address: string | null;
  priority: string;
  notes: string | null;
  seq: number;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
  doneAt: string | null;
  canceledAt: string | null;
  lineCount: number;
  totalQuantity: number;
  reservedQuantity: number;
};

export type DocumentLineRow = {
  id: string;
  documentId: string;
  productId: string;
  productName: string;
  sku: string;
  uom: string;
  categoryName: string | null;
  quantity: number;
  doneQuantity: number;
  reservedQty: number;
  unitCost: number;
  position: number;
  note: string | null;
  onHandAtSource: number;
  freeAtSource: number;
};

const DOC_COLUMNS = `d.id, d.reference, d.type, d.status, d.warehouse_id AS warehouseId, w.name AS warehouseName,
  w.short_code AS warehouseCode, d.from_location_id AS fromLocationId, fl.name AS fromLocationName,
  fl.short_code AS fromLocationCode, d.to_location_id AS toLocationId, tl.name AS toLocationName,
  tl.short_code AS toLocationCode, d.partner_id AS partnerId, COALESCE(pt.name, d.partner_name) AS partnerName,
  pt.kind AS partnerKind, d.schedule_date AS scheduleDate, d.responsible_id AS responsibleId,
  ru.name AS responsibleName, d.operation_type AS operationType, d.address, d.priority, d.notes, d.seq,
  d.created_by AS createdBy, cu.name AS createdByName, d.created_at AS createdAt, d.updated_at AS updatedAt,
  d.confirmed_at AS confirmedAt, d.done_at AS doneAt, d.canceled_at AS canceledAt,
  (SELECT COUNT(*) FROM document_lines dl WHERE dl.document_id = d.id) AS lineCount,
  COALESCE((SELECT SUM(dl.quantity) FROM document_lines dl WHERE dl.document_id = d.id), 0) AS totalQuantity,
  COALESCE((SELECT SUM(dl.reserved_qty) FROM document_lines dl WHERE dl.document_id = d.id), 0) AS reservedQuantity`;

const DOC_JOINS = `FROM documents d
  JOIN warehouses w ON w.id = d.warehouse_id
  LEFT JOIN locations fl ON fl.id = d.from_location_id
  LEFT JOIN locations tl ON tl.id = d.to_location_id
  LEFT JOIN partners pt ON pt.id = d.partner_id
  LEFT JOIN users ru ON ru.id = d.responsible_id
  LEFT JOIN users cu ON cu.id = d.created_by`;

/* --------------------------------------------------------------- references */

/**
 * Reserves the next id for `<warehouse>/<operation>/<id>`. Runs inside the
 * caller's transaction so the number can never be handed out twice.
 */
export function nextReference(warehouseId: string, type: DocumentType): { reference: string; seq: number } {
  const warehouse = getWarehouse(warehouseId);
  const code = warehouse?.shortCode ?? 'WH';
  const key = counterKey(code, type);
  const row = get<{ value: number }>('SELECT value FROM counters WHERE key = ?', [key]);
  const seq = Number(row?.value ?? 0) + 1;
  if (row) run('UPDATE counters SET value = ? WHERE key = ?', [seq, key]);
  else run('INSERT INTO counters (key, value) VALUES (?, ?)', [key, seq]);
  return { reference: formatReference(code, type, seq), seq };
}

/* ------------------------------------------------------------------- queries */

export type DocumentFilters = {
  type?: DocumentType | 'ALL';
  status?: DocumentStatus[] | 'ALL';
  warehouseId?: string;
  locationId?: string;
  partnerId?: string;
  productId?: string;
  categoryId?: string;
  responsibleId?: string;
  search?: string;
  late?: boolean;
  scheduleFrom?: string;
  scheduleTo?: string;
  createdFrom?: string;
  createdTo?: string;
  sort?: 'schedule' | 'created' | 'reference' | 'status';
  direction?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
};

function buildDocFilters(filters: DocumentFilters) {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filters.type && filters.type !== 'ALL') {
    clauses.push('d.type = ?');
    params.push(filters.type);
  }
  if (filters.status && filters.status !== 'ALL' && filters.status.length) {
    clauses.push(`d.status IN (${filters.status.map(() => '?').join(',')})`);
    params.push(...filters.status);
  }
  if (filters.warehouseId) {
    clauses.push('d.warehouse_id = ?');
    params.push(filters.warehouseId);
  }
  if (filters.locationId) {
    clauses.push('(d.from_location_id = ? OR d.to_location_id = ?)');
    params.push(filters.locationId, filters.locationId);
  }
  if (filters.partnerId) {
    clauses.push('d.partner_id = ?');
    params.push(filters.partnerId);
  }
  if (filters.responsibleId) {
    clauses.push('d.responsible_id = ?');
    params.push(filters.responsibleId);
  }
  if (filters.productId) {
    clauses.push('EXISTS (SELECT 1 FROM document_lines dl WHERE dl.document_id = d.id AND dl.product_id = ?)');
    params.push(filters.productId);
  }
  if (filters.categoryId) {
    clauses.push(
      'EXISTS (SELECT 1 FROM document_lines dl JOIN products p ON p.id = dl.product_id WHERE dl.document_id = d.id AND p.category_id = ?)',
    );
    params.push(filters.categoryId);
  }
  if (filters.search) {
    const term = like(filters.search);
    clauses.push(
      `(d.reference LIKE ? ESCAPE '\\' OR COALESCE(pt.name, d.partner_name) LIKE ? ESCAPE '\\'
        OR d.notes LIKE ? ESCAPE '\\' OR d.operation_type LIKE ? ESCAPE '\\'
        OR EXISTS (SELECT 1 FROM document_lines dl JOIN products p ON p.id = dl.product_id
                   WHERE dl.document_id = d.id AND (p.name LIKE ? ESCAPE '\\' OR p.sku LIKE ? ESCAPE '\\')))`,
    );
    params.push(term, term, term, term, term, term);
  }
  if (filters.late) {
    clauses.push("d.status IN ('DRAFT', 'WAITING', 'READY') AND d.schedule_date IS NOT NULL AND date(d.schedule_date) < date('now')");
  }
  if (filters.scheduleFrom) {
    clauses.push('d.schedule_date >= ?');
    params.push(filters.scheduleFrom);
  }
  if (filters.scheduleTo) {
    clauses.push('d.schedule_date <= ?');
    params.push(filters.scheduleTo);
  }
  if (filters.createdFrom) {
    clauses.push('d.created_at >= ?');
    params.push(filters.createdFrom);
  }
  if (filters.createdTo) {
    clauses.push('d.created_at <= ?');
    params.push(filters.createdTo);
  }
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

export function listDocuments(filters: DocumentFilters = {}): {
  items: DocumentRow[];
  total: number;
  statusCounts: Record<string, number>;
} {
  const { where, params } = buildDocFilters(filters);
  const sortMap: Record<string, string> = {
    schedule: 'd.schedule_date',
    created: 'd.created_at',
    reference: 'd.reference',
    status: "CASE d.status WHEN 'DRAFT' THEN 0 WHEN 'WAITING' THEN 1 WHEN 'READY' THEN 2 WHEN 'DONE' THEN 3 ELSE 4 END",
  };
  const order = sortMap[filters.sort ?? 'created'] ?? sortMap.created;
  const direction = filters.direction === 'asc' ? 'ASC' : 'DESC';
  const limit = Math.min(Math.max(filters.limit ?? 40, 1), 500);
  const offset = Math.max(filters.offset ?? 0, 0);

  const total = Number(scalar<number>(`SELECT COUNT(*) ${DOC_JOINS} ${where}`, params) ?? 0);
  const items = all<DocumentRow>(
    `SELECT ${DOC_COLUMNS} ${DOC_JOINS} ${where}
     ORDER BY ${order} ${direction} NULLS LAST, d.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  const counts = all<{ status: string; c: number }>(
    `SELECT d.status, COUNT(*) AS c ${DOC_JOINS} ${where} GROUP BY d.status`,
    params,
  );
  const statusCounts: Record<string, number> = { DRAFT: 0, WAITING: 0, READY: 0, DONE: 0, CANCELED: 0 };
  for (const row of counts) statusCounts[row.status] = Number(row.c);
  return { items, total, statusCounts };
}

export function getDocument(id: string): DocumentRow | undefined {
  return get<DocumentRow>(`SELECT ${DOC_COLUMNS} ${DOC_JOINS} WHERE d.id = ?`, [id]);
}

export function getDocumentByReference(reference: string): DocumentRow | undefined {
  return get<DocumentRow>(`SELECT ${DOC_COLUMNS} ${DOC_JOINS} WHERE d.reference = ?`, [reference]);
}

export function getDocumentLines(documentId: string, sourceLocationId?: string | null): DocumentLineRow[] {
  const source = sourceLocationId ?? getDocument(documentId)?.fromLocationId ?? null;
  return all<DocumentLineRow>(
    `SELECT dl.id, dl.document_id AS documentId, dl.product_id AS productId, p.name AS productName, p.sku, p.uom,
            c.name AS categoryName, dl.quantity, dl.done_quantity AS doneQuantity, dl.reserved_qty AS reservedQty,
            dl.unit_cost AS unitCost, dl.position, dl.note,
            COALESCE((SELECT SUM(b.quantity) FROM stock_balances b WHERE b.product_id = dl.product_id
                      AND (? IS NULL OR b.location_id = ?)), 0) AS onHandAtSource,
            COALESCE((SELECT SUM(b.quantity - b.reserved) FROM stock_balances b WHERE b.product_id = dl.product_id
                      AND (? IS NULL OR b.location_id = ?)), 0) AS freeAtSource
     FROM document_lines dl
     JOIN products p ON p.id = dl.product_id
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE dl.document_id = ? ORDER BY dl.position, dl.rowid`,
    [source, source, source, source, documentId],
  );
}

export function documentKpis(type: DocumentType) {
  const row = get<{ operations: number; late: number; waiting: number; toProcess: number; quantity: number }>(
    `SELECT COUNT(*) AS operations,
            SUM(CASE WHEN d.status IN ('DRAFT','WAITING','READY') AND d.schedule_date IS NOT NULL AND date(d.schedule_date) < date('now') THEN 1 ELSE 0 END) AS late,
            SUM(CASE WHEN d.status = 'WAITING' THEN 1 ELSE 0 END) AS waiting,
            (SELECT COUNT(*) FROM (SELECT DISTINCT dl.product_id FROM document_lines dl JOIN documents dd ON dd.id = dl.document_id
               WHERE dd.type = ? AND dd.status IN ('DRAFT','WAITING','READY'))) AS toProcess,
            COALESCE((SELECT SUM(dl.quantity) FROM document_lines dl JOIN documents dd ON dd.id = dl.document_id
               WHERE dd.type = ? AND dd.status IN ('DRAFT','WAITING','READY')), 0) AS quantity
     FROM documents d WHERE d.type = ? AND d.status IN ('DRAFT','WAITING','READY')`,
    [type, type, type],
  );
  return {
    operations: Number(row?.operations ?? 0),
    late: Number(row?.late ?? 0),
    waiting: Number(row?.waiting ?? 0),
    toProcess: Number(row?.toProcess ?? 0),
    quantity: Number(row?.quantity ?? 0),
  };
}

export function pendingCounts(): Record<DocumentType, number> {
  const rows = all<{ type: DocumentType; c: number }>(
    `SELECT type, COUNT(*) AS c FROM documents WHERE status IN ('DRAFT','WAITING','READY') GROUP BY type`,
  );
  const result: Record<DocumentType, number> = { RECEIPT: 0, DELIVERY: 0, TRANSFER: 0, ADJUSTMENT: 0 };
  for (const row of rows) result[row.type] = Number(row.c);
  return result;
}

export function recentDocuments(limit = 8): DocumentRow[] {
  return all<DocumentRow>(`SELECT ${DOC_COLUMNS} ${DOC_JOINS} ORDER BY d.created_at DESC LIMIT ?`, [limit]);
}

/* ---------------------------------------------------------------- mutations */

export type DocumentLineInputPayload = {
  productId: string;
  quantity: number;
  unitCost?: number;
  note?: string | null;
};

export type DocumentPayload = {
  type: DocumentType;
  warehouseId: string;
  fromLocationId?: string | null;
  toLocationId?: string | null;
  partnerId?: string | null;
  partnerName?: string | null;
  scheduleDate?: string | null;
  responsibleId?: string | null;
  operationType?: string | null;
  address?: string | null;
  priority?: string | null;
  notes?: string | null;
  lines: DocumentLineInputPayload[];
};

/**
 * Normalises the virtual endpoints so the ledger always has both sides of a
 * movement: receipts originate in `<warehouse>/Input` and deliveries terminate
 * in `<warehouse>/Output`.
 */
type LocationPayload = Pick<DocumentPayload, 'type' | 'warehouseId' | 'fromLocationId' | 'toLocationId'>;

function resolveLocations(payload: LocationPayload) {
  let fromLocationId = payload.fromLocationId ?? null;
  let toLocationId = payload.toLocationId ?? null;
  if (payload.type === 'RECEIPT' && !fromLocationId) {
    fromLocationId = virtualLocation(payload.warehouseId, 'INPUT')?.id ?? null;
  }
  if (payload.type === 'DELIVERY' && !toLocationId) {
    toLocationId = virtualLocation(payload.warehouseId, 'OUTPUT')?.id ?? null;
  }
  return { fromLocationId, toLocationId };
}

export function createDocument(payload: DocumentPayload, userId: string | null, options: { at?: string } = {}): DocumentRow {
  return tx(() => {
    const { fromLocationId, toLocationId } = resolveLocations(payload);
    const { reference, seq } = nextReference(payload.warehouseId, payload.type);
    const id = uid.next('doc');
    const stamp = options.at ?? nowIso();
    run(
      `INSERT INTO documents (id, reference, type, status, warehouse_id, from_location_id, to_location_id, partner_id,
         partner_name, schedule_date, responsible_id, operation_type, address, priority, notes, seq, created_by, created_at, updated_at)
       VALUES (?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        reference,
        payload.type,
        payload.warehouseId,
        fromLocationId,
        toLocationId,
        payload.partnerId || null,
        payload.partnerName ?? null,
        payload.scheduleDate ?? null,
        payload.responsibleId || userId,
        payload.operationType ?? null,
        payload.address ?? null,
        payload.priority ?? 'NORMAL',
        payload.notes ?? null,
        seq,
        userId,
        stamp,
        stamp,
      ],
    );
    replaceLines(id, payload.lines);
    return getDocument(id)!;
  });
}

/** Lines may arrive as a product id (UI) or as a SKU/barcode (scanner). */
function resolveProduct(reference: string) {
  return getProduct(reference) ?? findProductBySkuOrBarcode(reference);
}

function replaceLines(documentId: string, lines: DocumentLineInputPayload[]): void {
  run('DELETE FROM document_lines WHERE document_id = ?', [documentId]);
  lines.forEach((line, index) => {
    const product = resolveProduct(line.productId) ?? null;
    run(
      `INSERT INTO document_lines (id, document_id, product_id, quantity, done_quantity, reserved_qty, uom, unit_cost, position, note)
       VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?, ?)`,
      [
        uid.next('ln'),
        documentId,
        product?.id ?? line.productId,
        line.quantity,
        product?.uom ?? 'Unit',
        line.unitCost ?? product?.costPrice ?? 0,
        index,
        line.note ?? null,
      ],
    );
  });
}

export function updateDocument(id: string, payload: Partial<DocumentPayload>): DocumentRow | undefined {
  return tx(() => {
    const current = getDocument(id);
    if (!current) return undefined;
    if (current.status === 'DONE') throw new DocumentError('A validated document can no longer be edited.');
    const { fromLocationId, toLocationId } = resolveLocations({
      type: (payload.type ?? current.type) as DocumentType,
      warehouseId: payload.warehouseId ?? current.warehouseId,
      fromLocationId: payload.fromLocationId !== undefined ? payload.fromLocationId : current.fromLocationId,
      toLocationId: payload.toLocationId !== undefined ? payload.toLocationId : current.toLocationId,
    });
    run(
      `UPDATE documents SET from_location_id = ?, to_location_id = ?, partner_id = ?, partner_name = ?, schedule_date = ?,
         responsible_id = ?, operation_type = ?, address = ?, priority = ?, notes = ?, updated_at = ?
       WHERE id = ?`,
      [
        fromLocationId,
        toLocationId,
        payload.partnerId !== undefined ? payload.partnerId || null : current.partnerId,
        payload.partnerName !== undefined ? payload.partnerName : current.partnerName,
        payload.scheduleDate !== undefined ? payload.scheduleDate : current.scheduleDate,
        payload.responsibleId !== undefined ? payload.responsibleId || null : current.responsibleId,
        payload.operationType !== undefined ? payload.operationType : current.operationType,
        payload.address !== undefined ? payload.address : current.address,
        payload.priority ?? current.priority,
        payload.notes !== undefined ? payload.notes : current.notes,
        nowIso(),
        id,
      ],
    );
    if (payload.lines) {
      releaseReservations(id);
      replaceLines(id, payload.lines);
    }
    return getDocument(id);
  });
}

export class DocumentError extends Error {}

/* -------------------------------------------------------------- reservation */

function releaseReservations(documentId: string): void {
  const doc = getDocument(documentId);
  if (!doc?.fromLocationId) {
    run('UPDATE document_lines SET reserved_qty = 0 WHERE document_id = ?', [documentId]);
    return;
  }
  const lines = all<{ id: string; productId: string; reservedQty: number }>(
    'SELECT id, product_id AS productId, reserved_qty AS reservedQty FROM document_lines WHERE document_id = ?',
    [documentId],
  );
  for (const line of lines) {
    if (line.reservedQty > 0) {
      applyDelta(line.productId, doc.fromLocationId, 0, -line.reservedQty);
    }
  }
  run('UPDATE document_lines SET reserved_qty = 0 WHERE document_id = ?', [documentId]);
}

function reserveLines(documentId: string): { availability: Availability[]; fullyReserved: boolean } {
  const doc = getDocument(documentId)!;
  const source = doc.fromLocationId;
  const lines = all<{ id: string; productId: string; quantity: number; reservedQty: number }>(
    'SELECT id, product_id AS productId, quantity, reserved_qty AS reservedQty FROM document_lines WHERE document_id = ? ORDER BY position, rowid',
    [documentId],
  );
  if (!source) {
    return { availability: checkAvailability(lines, [], null), fullyReserved: true };
  }
  const balances = all<{ productId: string; locationId: string; quantity: number; reserved: number }>(
    `SELECT product_id AS productId, location_id AS locationId, quantity, reserved FROM stock_balances WHERE location_id = ?`,
    [source],
  );
  const before = checkAvailability(lines, balances, source);
  const freeLeft = new Map(before.map((a) => [a.productId, a.free]));
  let fullyReserved = true;
  for (const line of lines) {
    const free = freeLeft.get(line.productId) ?? 0;
    const reserve = Math.max(0, Math.min(line.quantity, free));
    if (reserve < line.quantity) fullyReserved = false;
    freeLeft.set(line.productId, free - reserve);
    if (reserve !== line.reservedQty) {
      applyDelta(line.productId, source, 0, reserve - line.reservedQty);
      run('UPDATE document_lines SET reserved_qty = ? WHERE id = ?', [reserve, line.id]);
    }
  }
  return { availability: before, fullyReserved };
}

/** Mock-up `To Do` / `Confirm`: DRAFT → READY (or WAITING when short). */
export function confirmDocument(id: string, actorId: string | null, options: { recheck?: boolean } = {}): DocumentRow {
  return tx(() => {
    const doc = getDocument(id);
    if (!doc) throw new DocumentError('Document not found.');
    if (doc.status === 'DONE') throw new DocumentError('This document is already validated.');
    if (doc.status === 'CANCELED') throw new DocumentError('This document was canceled.');
    const type = doc.type;
    const previouslyReady = doc.status === 'READY';

    if (type === 'RECEIPT' || type === 'ADJUSTMENT') {
      if (!doc.lineCount) throw new DocumentError('Add at least one product line before confirming.');
      run(`UPDATE documents SET status = 'READY', confirmed_at = COALESCE(confirmed_at, ?), updated_at = ? WHERE id = ?`, [
        nowIso(),
        nowIso(),
        id,
      ]);
      return getDocument(id)!;
    }

    if (!doc.fromLocationId) throw new DocumentError('Choose a source location first.');
    if (!doc.lineCount) throw new DocumentError('Add at least one product line before confirming.');
    const { availability, fullyReserved } = reserveLines(id);
    // The pure engine decides the target status; reservation already happened.
    const target = statusAfterConfirm(type, availability);
    const status: DocumentStatus = target === 'READY' && fullyReserved ? 'READY' : 'WAITING';
    run(`UPDATE documents SET status = ?, confirmed_at = COALESCE(confirmed_at, ?), updated_at = ? WHERE id = ?`, [
      status,
      nowIso(),
      nowIso(),
      id,
    ]);
    if (!previouslyReady && status === 'WAITING') {
      markWaitingNotification(id, doc.reference, type);
    }
    return getDocument(id)!;
  });
}

function markWaitingNotification(documentId: string, reference: string, type: DocumentType): void {
  const existing = get<{ id: string; isRead: number }>('SELECT id, is_read AS isRead FROM notifications WHERE dedupe_key = ?', [
    `waiting:${documentId}`,
  ]);
  if (existing) {
    if (existing.isRead) run('UPDATE notifications SET is_read = 0, created_at = ? WHERE id = ?', [nowIso(), existing.id]);
    return;
  }
  run(
    `INSERT INTO notifications (id, kind, severity, title, body, entity_type, entity_id, dedupe_key, is_read, created_at)
     VALUES (?, 'DOCUMENT_WAITING', 'WARNING', ?, ?, 'document', ?, ?, 0, ?)`,
    [
      uid.next('ntf'),
      `${TYPE_META[type].label} ${reference} is waiting for stock`,
      'Some lines could not be fully reserved. It will be promoted automatically when stock arrives.',
      documentId,
      `waiting:${documentId}`,
      nowIso(),
    ],
  );
}

/** Mock-up `Validate`: READY → DONE and post the ledger entries. */
export function validateDocument(
  id: string,
  actorId: string | null,
  options: { at?: string } = {},
): { document: DocumentRow; moves: number } {
  return tx(() => {
    const doc = getDocument(id);
    if (!doc) throw new DocumentError('Document not found.');
    if (doc.status === 'DONE') throw new DocumentError('This document is already validated.');
    if (doc.status === 'CANCELED') throw new DocumentError('This document was canceled.');
    if (doc.status === 'DRAFT' || doc.status === 'WAITING') {
      throw new DocumentError(
        doc.status === 'WAITING'
          ? 'Stock is still missing. Conform availability first, then validate.'
          : 'Confirm the document before validating it.',
      );
    }
    if (!doc.lineCount) throw new DocumentError('This document has no product lines.');

    const rawLines = all<{ id: string; productId: string; quantity: number; unitCost: number }>(
      'SELECT id, product_id AS productId, quantity, unit_cost AS unitCost FROM document_lines WHERE document_id = ? ORDER BY position, rowid',
      [id],
    );

    const stamp = options.at ?? nowIso();
    let moveCount = 0;

    if (doc.type === 'ADJUSTMENT') {
      if (!doc.fromLocationId) throw new DocumentError('Choose a location to adjust.');
      for (const line of rawLines) {
        const recorded = currentQuantity(line.productId, doc.fromLocationId);
        const delta = line.quantity - recorded;
        run('UPDATE document_lines SET done_quantity = ? WHERE id = ?', [delta, line.id]);
        if (Math.abs(delta) < 1e-9) continue;
        postMove({
          reference: doc.reference,
          documentId: doc.id,
          documentType: doc.type,
          documentLineId: line.id,
          productId: line.productId,
          fromLocationId: delta > 0 ? null : doc.fromLocationId,
          toLocationId: delta > 0 ? doc.fromLocationId : null,
          locationId: doc.fromLocationId,
          quantity: Math.abs(delta),
          direction: delta > 0 ? 'IN' : 'OUT',
          unitCost: line.unitCost,
          note: `Counted ${line.quantity} · recorded ${recorded} · delta ${delta > 0 ? '+' : ''}${delta}`,
          createdBy: actorId,
          createdAt: stamp,
        });
        moveCount += 1;
      }
    } else {
      // Deliveries and transfers ship what this document reserved, so its own
      // hold must be discounted before judging availability — otherwise the
      // order would always look short by exactly the amount it is holding.
      if (doc.type !== 'RECEIPT') {
        const ownHolds = new Map<string, number>(
          all<{ productId: string; held: number }>(
            'SELECT product_id AS productId, COALESCE(SUM(reserved_qty), 0) AS held FROM document_lines WHERE document_id = ? GROUP BY product_id',
            [id],
          ).map((row) => [row.productId, Number(row.held)] as [string, number]),
        );
        const sourceBalances = all<{ productId: string; locationId: string; quantity: number; reserved: number }>(
          `SELECT product_id AS productId, location_id AS locationId, quantity, reserved FROM stock_balances WHERE location_id = ?`,
          [doc.fromLocationId],
        ).map((row) => ({ ...row, reserved: Math.max(0, row.reserved - (ownHolds.get(row.productId) ?? 0)) }));
        const shortages = checkAvailability(
          rawLines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
          sourceBalances,
          doc.fromLocationId!,
        ).filter((a) => !a.ok);
        if (shortages.length) {
          const names = shortages
            .map((s) => get<{ name: string }>('SELECT name FROM products WHERE id = ?', [s.productId])?.name ?? s.productId)
            .join(', ');
          throw new DocumentError(`Not enough free stock for: ${names}. Re-check availability first.`);
        }
      }
      const planned = planMoves({
        type: doc.type,
        fromLocationId: doc.fromLocationId,
        toLocationId: doc.toLocationId,
        lines: rawLines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitCost: l.unitCost })),
      });
      const reservedBySource = new Map<string, number>();
      if (doc.type !== 'RECEIPT') {
        for (const line of rawLines) {
          reservedBySource.set(line.productId, (reservedBySource.get(line.productId) ?? 0) + line.quantity);
        }
        for (const [productId, qty] of reservedBySource) {
          if (doc.fromLocationId) applyDelta(productId, doc.fromLocationId, 0, -qty);
        }
      }
      for (const move of planned) {
        postMove({
          reference: doc.reference,
          documentId: doc.id,
          documentType: doc.type,
          productId: move.productId,
          fromLocationId: move.fromLocationId,
          toLocationId: move.toLocationId,
          locationId: move.locationId,
          quantity: move.quantity,
          direction: move.direction,
          unitCost: move.unitCost,
          createdBy: actorId,
          createdAt: stamp,
        });
        moveCount += 1;
      }
      for (const line of rawLines) {
        run('UPDATE document_lines SET done_quantity = ?, reserved_qty = 0 WHERE id = ?', [line.quantity, line.id]);
      }
    }

    run(`UPDATE documents SET status = 'DONE', done_at = ?, updated_at = ? WHERE id = ?`, [stamp, stamp, id]);
    // Inbound stock may have unblocked deliveries that were waiting on it.
    // (Skipped while seeding historical data so numbering stays predictable.)
    if (!options.at && (doc.type === 'RECEIPT' || doc.type === 'ADJUSTMENT')) promoteWaitingDocuments();
    run(
      `INSERT INTO notifications (id, kind, severity, title, body, entity_type, entity_id, dedupe_key, is_read, created_at)
       VALUES (?, 'DOCUMENT_DONE', 'INFO', ?, ?, 'document', ?, NULL, 0, ?)`,
      [
        uid.next('ntf'),
        `${TYPE_META[doc.type].label} ${doc.reference} validated`,
        `${moveCount} ledger movement(s) posted.`,
        doc.id,
        stamp,
      ],
    );
    return { document: getDocument(id)!, moves: moveCount };
  });
}

export function cancelDocument(id: string, actorId: string | null): DocumentRow {
  return tx(() => {
    const doc = getDocument(id);
    if (!doc) throw new DocumentError('Document not found.');
    if (doc.status === 'DONE') throw new DocumentError('A validated document cannot be canceled — post an adjustment instead.');
    if (doc.status === 'CANCELED') return doc;
    if (doc.status !== 'DRAFT') releaseReservations(id);
    const stamp = nowIso();
    run(`UPDATE documents SET status = 'CANCELED', canceled_at = ?, updated_at = ? WHERE id = ?`, [stamp, stamp, id]);
    return getDocument(id)!;
  });
}

/** Sends a document back to Draft, releasing whatever it had reserved. */
export function resetToDraft(id: string, actorId: string | null): DocumentRow {
  return tx(() => {
    const doc = getDocument(id);
    if (!doc) throw new DocumentError('Document not found.');
    if (doc.status === 'DONE') throw new DocumentError('A validated document cannot be reset.');
    if (doc.status !== 'DRAFT') releaseReservations(id);
    run(`UPDATE documents SET status = 'DRAFT', confirmed_at = NULL, updated_at = ? WHERE id = ?`, [nowIso(), id]);
    return getDocument(id)!;
  });
}

/**
 * Re-evaluates every waiting document. Called after any inbound movement so a
 * delivery that was waiting on a receipt promotes itself to Ready.
 */
export function promoteWaitingDocuments(): { promoted: string[] } {
  return tx(() => {
    const waiting = all<{ id: string; reference: string }>("SELECT id, reference FROM documents WHERE status = 'WAITING'");
    const promoted: string[] = [];
    for (const row of waiting) {
      const { fullyReserved } = reserveLines(row.id);
      if (fullyReserved) {
        run(`UPDATE documents SET status = 'READY', updated_at = ? WHERE id = ?`, [nowIso(), row.id]);
        run('UPDATE notifications SET is_read = 1 WHERE dedupe_key = ?', [`waiting:${row.id}`]);
        promoted.push(row.reference);
      }
    }
    return { promoted };
  });
}

/* --------------------------------------------------------------- utilities */

export function deleteDocument(id: string): void {
  run('DELETE FROM documents WHERE id = ? AND status IN (\'DRAFT\', \'CANCELED\')', [id]);
}

export function documentsForProduct(productId: string, limit = 10): DocumentRow[] {
  return all<DocumentRow>(
    `SELECT ${DOC_COLUMNS} ${DOC_JOINS}
     WHERE EXISTS (SELECT 1 FROM document_lines dl WHERE dl.document_id = d.id AND dl.product_id = ?)
     ORDER BY d.created_at DESC LIMIT ?`,
    [productId, limit],
  );
}

export function documentCountsByType(): { type: DocumentType; status: DocumentStatus; count: number }[] {
  return all<{ type: DocumentType; status: DocumentStatus; count: number }>(
    'SELECT type, status, COUNT(*) AS count FROM documents GROUP BY type, status',
  );
}

export function scheduleLoad(days = 14): { date: string; receipts: number; deliveries: number; transfers: number }[] {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const rows = all<{ day: string; type: DocumentType; c: number }>(
    `SELECT date(schedule_date) AS day, type, COUNT(*) AS c FROM documents
     WHERE schedule_date IS NOT NULL AND status IN ('DRAFT','WAITING','READY') AND date(schedule_date) >= date(?)
     GROUP BY day, type ORDER BY day`,
    [start.toISOString().slice(0, 10)],
  );
  const buckets = new Map<string, { date: string; receipts: number; deliveries: number; transfers: number }>();
  for (let i = 0; i < days; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    buckets.set(key, { date: key, receipts: 0, deliveries: 0, transfers: 0 });
  }
  for (const row of rows) {
    const bucket = buckets.get(row.day);
    if (!bucket) continue;
    if (row.type === 'RECEIPT') bucket.receipts += Number(row.c);
    else if (row.type === 'DELIVERY') bucket.deliveries += Number(row.c);
    else if (row.type === 'TRANSFER') bucket.transfers += Number(row.c);
  }
  return [...buckets.values()];
}

export function resetCounters(): void {
  exec('DELETE FROM counters');
}

export function locationLabel(id: string | null | undefined): string {
  if (!id) return '—';
  const loc = getLocation(id);
  return loc ? loc.shortCode : id;
}
