import { all, get, like, nowIso, run, scalar, tx, uid } from '../db';
import { stockHealth } from '../domain/inventory';
import type { PartnerKind } from '../domain/constants';
import { postMove } from './inventory';

/* --------------------------------------------------------------- categories */

export type CategoryRow = {
  id: string;
  name: string;
  code: string | null;
  color: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  productCount?: number;
  stockValue?: number;
};

export function listCategories(): CategoryRow[] {
  return all<CategoryRow>(
    `SELECT c.id, c.name, c.code, c.color, c.description, c.created_at AS createdAt, c.updated_at AS updatedAt,
            (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.is_active = 1) AS productCount,
            (SELECT COALESCE(SUM(b.quantity * p.cost_price), 0) FROM products p
               LEFT JOIN stock_balances b ON b.product_id = p.id
              WHERE p.category_id = c.id) AS stockValue
     FROM categories c ORDER BY c.name COLLATE NOCASE`,
  );
}

export function getCategory(id: string): CategoryRow | undefined {
  return get<CategoryRow>(
    `SELECT id, name, code, color, description, created_at AS createdAt, updated_at AS updatedAt FROM categories WHERE id = ?`,
    [id],
  );
}

export function createCategory(input: { name: string; code?: string | null; color?: string; description?: string | null }): CategoryRow {
  const id = uid.next('cat');
  const stamp = nowIso();
  run('INSERT INTO categories (id, name, code, color, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [
    id,
    input.name.trim(),
    input.code ?? null,
    input.color ?? 'slate',
    input.description ?? null,
    stamp,
    stamp,
  ]);
  return getCategory(id)!;
}

export function updateCategory(
  id: string,
  patch: Partial<Pick<CategoryRow, 'name' | 'code' | 'color' | 'description'>>,
): CategoryRow | undefined {
  const current = getCategory(id);
  if (!current) return undefined;
  run('UPDATE categories SET name = ?, code = ?, color = ?, description = ?, updated_at = ? WHERE id = ?', [
    patch.name ?? current.name,
    patch.code !== undefined ? patch.code : current.code,
    patch.color ?? current.color,
    patch.description !== undefined ? patch.description : current.description,
    nowIso(),
    id,
  ]);
  return getCategory(id);
}

export function deleteCategory(id: string): { ok: boolean; error?: string } {
  const used = Number(scalar<number>('SELECT COUNT(*) FROM products WHERE category_id = ?', [id]) ?? 0);
  if (used > 0) return { ok: false, error: `Category is used by ${used} product(s).` };
  run('DELETE FROM categories WHERE id = ?', [id]);
  return { ok: true };
}

/* ----------------------------------------------------------------- partners */

export type PartnerRow = {
  id: string;
  name: string;
  kind: PartnerKind;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  gstin: string | null;
  isActive: number;
  createdAt: string;
  updatedAt: string;
  documentCount?: number;
};

const PARTNER_COLUMNS = `id, name, kind, contact_name AS contactName, email, phone, address, gstin,
  is_active AS isActive, created_at AS createdAt, updated_at AS updatedAt`;

export function listPartners(opts: { kind?: PartnerKind; search?: string; includeInactive?: boolean } = {}): PartnerRow[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (!opts.includeInactive) clauses.push('is_active = 1');
  if (opts.kind) {
    clauses.push('(kind = ? OR kind = \'BOTH\')');
    params.push(opts.kind);
  }
  if (opts.search) {
    clauses.push('(name LIKE ? ESCAPE \'\\\' OR email LIKE ? ESCAPE \'\\\' OR contact_name LIKE ? ESCAPE \'\\\')');
    const term = like(opts.search);
    params.push(term, term, term);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return all<PartnerRow>(
    `SELECT ${PARTNER_COLUMNS}, (SELECT COUNT(*) FROM documents d WHERE d.partner_id = partners.id) AS documentCount
     FROM partners ${where} ORDER BY name COLLATE NOCASE`,
    params,
  );
}

export function getPartner(id: string): PartnerRow | undefined {
  return get<PartnerRow>(`SELECT ${PARTNER_COLUMNS} FROM partners WHERE id = ?`, [id]);
}

export function createPartner(input: {
  name: string;
  kind?: PartnerKind;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  gstin?: string | null;
}): PartnerRow {
  const id = uid.next('prt');
  const stamp = nowIso();
  run(
    `INSERT INTO partners (id, name, kind, contact_name, email, phone, address, gstin, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [id, input.name.trim(), input.kind ?? 'VENDOR', input.contactName ?? null, input.email ?? null, input.phone ?? null, input.address ?? null, input.gstin ?? null, stamp, stamp],
  );
  return getPartner(id)!;
}

export function updatePartner(
  id: string,
  patch: Partial<Pick<PartnerRow, 'name' | 'kind' | 'contactName' | 'email' | 'phone' | 'address' | 'gstin' | 'isActive'>>,
): PartnerRow | undefined {
  const current = getPartner(id);
  if (!current) return undefined;
  run(
    `UPDATE partners SET name = ?, kind = ?, contact_name = ?, email = ?, phone = ?, address = ?, gstin = ?, is_active = ?, updated_at = ? WHERE id = ?`,
    [
      patch.name ?? current.name,
      patch.kind ?? current.kind,
      patch.contactName !== undefined ? patch.contactName : current.contactName,
      patch.email !== undefined ? patch.email : current.email,
      patch.phone !== undefined ? patch.phone : current.phone,
      patch.address !== undefined ? patch.address : current.address,
      patch.gstin !== undefined ? patch.gstin : current.gstin,
      patch.isActive === undefined ? current.isActive : patch.isActive ? 1 : 0,
      nowIso(),
      id,
    ],
  );
  return getPartner(id);
}

export function deletePartner(id: string): { ok: boolean; error?: string } {
  const used = Number(scalar<number>('SELECT COUNT(*) FROM documents WHERE partner_id = ?', [id]) ?? 0);
  if (used > 0) return { ok: false, error: `Partner is referenced by ${used} document(s).` };
  run('DELETE FROM partners WHERE id = ?', [id]);
  return { ok: true };
}

/* ----------------------------------------------------------------- products */

export type ProductRow = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  uom: string;
  costPrice: number;
  salePrice: number;
  reorderPoint: number;
  reorderQty: number;
  accent: string;
  isActive: number;
  createdAt: string;
  updatedAt: string;
  onHand: number;
  reserved: number;
  freeToUse: number;
  stockValue: number;
  health: 'HEALTHY' | 'LOW_STOCK' | 'OUT_OF_STOCK';
};

const PRODUCT_COLUMNS = `p.id, p.sku, p.barcode, p.name, p.description, p.category_id AS categoryId,
  c.name AS categoryName, c.color AS categoryColor, p.uom, p.cost_price AS costPrice, p.sale_price AS salePrice,
  p.reorder_point AS reorderPoint, p.reorder_qty AS reorderQty, p.accent, p.is_active AS isActive,
  p.created_at AS createdAt, p.updated_at AS updatedAt,
  COALESCE((SELECT SUM(b.quantity) FROM stock_balances b WHERE b.product_id = p.id), 0) AS onHand,
  COALESCE((SELECT SUM(b.reserved) FROM stock_balances b WHERE b.product_id = p.id), 0) AS reserved`;

export type ProductListOptions = {
  search?: string;
  categoryId?: string;
  warehouseId?: string;
  locationId?: string;
  health?: 'HEALTHY' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'ALL';
  sort?: 'name' | 'sku' | 'onHand' | 'value' | 'updated' | 'health';
  direction?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
  includeInactive?: boolean;
};

export function listProducts(opts: ProductListOptions = {}): { items: ProductRow[]; total: number } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (!opts.includeInactive) clauses.push('p.is_active = 1');
  if (opts.search) {
    const term = like(opts.search);
    clauses.push('(p.name LIKE ? ESCAPE \'\\\' OR p.sku LIKE ? ESCAPE \'\\\' OR p.barcode LIKE ? ESCAPE \'\\\' OR p.description LIKE ? ESCAPE \'\\\')');
    params.push(term, term, term, term);
  }
  if (opts.categoryId) {
    clauses.push('p.category_id = ?');
    params.push(opts.categoryId);
  }
  if (opts.locationId) {
    clauses.push('EXISTS (SELECT 1 FROM stock_balances b WHERE b.product_id = p.id AND b.location_id = ?)');
    params.push(opts.locationId);
  } else if (opts.warehouseId) {
    clauses.push('EXISTS (SELECT 1 FROM stock_balances b JOIN locations l ON l.id = b.location_id WHERE b.product_id = p.id AND l.warehouse_id = ?)');
    params.push(opts.warehouseId);
  }
  // Health is a derived value, so the filter has to be expressed as SQL too —
  // otherwise `health: 'LOW_STOCK'` would happily return the whole catalogue.
  if (opts.health && opts.health !== 'ALL') {
    const onHand = 'COALESCE((SELECT SUM(b.quantity) FROM stock_balances b WHERE b.product_id = p.id), 0)';
    const reserved = 'COALESCE((SELECT SUM(b.reserved) FROM stock_balances b WHERE b.product_id = p.id), 0)';
    if (opts.health === 'OUT_OF_STOCK') {
      clauses.push(`${onHand} <= 0`);
    } else if (opts.health === 'LOW_STOCK') {
      clauses.push(`${onHand} > 0 AND ${onHand} - ${reserved} <= p.reorder_point`);
    } else {
      clauses.push(`${onHand} > 0 AND ${onHand} - ${reserved} > p.reorder_point`);
    }
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  // The ORDER BY runs against the derived `base` relation, so every key has to
  // be expressed in its alias names — the raw `p.*` columns are out of scope there.
  const sortMap: Record<string, string> = {
    name: 'base.name COLLATE NOCASE',
    sku: 'base.sku COLLATE NOCASE',
    onHand: 'base.onHand',
    value: 'base.costPrice * base.onHand',
    updated: 'base.updatedAt',
    health: 'base.onHand - base.reserved - base.reorderPoint',
  };
  const order = sortMap[opts.sort ?? 'name'] ?? sortMap.name;
  const direction = opts.direction === 'desc' ? 'DESC' : 'ASC';
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500);
  const offset = Math.max(opts.offset ?? 0, 0);

  const total = Number(scalar<number>(`SELECT COUNT(*) FROM products p ${where}`, params) ?? 0);
  const rows = all<ProductRow>(
    `SELECT base.*, base.onHand - base.reserved AS freeToUse, base.costPrice * base.onHand AS stockValue
     FROM (
       SELECT ${PRODUCT_COLUMNS}
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
       ${where}
     ) base
     ORDER BY ${order} ${direction}
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  ).map((row) => ({ ...row, health: stockHealth(row.onHand, row.reserved, row.reorderPoint) }));
  return { items: rows, total };
}

export function getProduct(id: string): ProductRow | undefined {
  const row = get<ProductRow>(
    `SELECT base.*, base.onHand - base.reserved AS freeToUse, base.costPrice * base.onHand AS stockValue
     FROM (
       SELECT ${PRODUCT_COLUMNS}
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.id = ?
     ) base`,
    [id],
  );
  return row ? { ...row, health: stockHealth(row.onHand, row.reserved, row.reorderPoint) } : undefined;
}

export function findProductBySkuOrBarcode(code: string): ProductRow | undefined {
  const row = get<ProductRow>(
    `SELECT ${PRODUCT_COLUMNS}, 0 AS freeToUse, 0 AS stockValue
     FROM products p LEFT JOIN categories c ON c.id = p.category_id
     WHERE lower(p.sku) = lower(?) OR p.barcode = ? LIMIT 1`,
    [code.trim(), code.trim()],
  );
  return row ? getProduct(row.id) : undefined;
}

export function createProduct(input: {
  sku: string;
  name: string;
  barcode?: string | null;
  description?: string | null;
  categoryId?: string | null;
  uom?: string;
  costPrice?: number;
  salePrice?: number;
  reorderPoint?: number;
  reorderQty?: number;
  accent?: string;
}): ProductRow {
  const id = uid.next('prd');
  const stamp = nowIso();
  run(
    `INSERT INTO products (id, sku, barcode, name, description, category_id, uom, cost_price, sale_price, reorder_point, reorder_qty, accent, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [
      id,
      input.sku.trim(),
      input.barcode?.trim() || null,
      input.name.trim(),
      input.description ?? null,
      input.categoryId || null,
      input.uom ?? 'Unit',
      input.costPrice ?? 0,
      input.salePrice ?? 0,
      input.reorderPoint ?? 0,
      input.reorderQty ?? 0,
      input.accent ?? 'slate',
      stamp,
      stamp,
    ],
  );
  return getProduct(id)!;
}

export function updateProduct(id: string, patch: Partial<Omit<ProductRow, 'id' | 'createdAt' | 'onHand' | 'reserved' | 'freeToUse' | 'stockValue' | 'health'>>): ProductRow | undefined {
  const current = getProduct(id);
  if (!current) return undefined;
  run(
    `UPDATE products SET sku = ?, barcode = ?, name = ?, description = ?, category_id = ?, uom = ?, cost_price = ?,
       sale_price = ?, reorder_point = ?, reorder_qty = ?, accent = ?, is_active = ?, updated_at = ? WHERE id = ?`,
    [
      patch.sku ?? current.sku,
      patch.barcode !== undefined ? patch.barcode : current.barcode,
      patch.name ?? current.name,
      patch.description !== undefined ? patch.description : current.description,
      patch.categoryId !== undefined ? patch.categoryId : current.categoryId,
      patch.uom ?? current.uom,
      patch.costPrice ?? current.costPrice,
      patch.salePrice ?? current.salePrice,
      patch.reorderPoint ?? current.reorderPoint,
      patch.reorderQty ?? current.reorderQty,
      patch.accent ?? current.accent,
      patch.isActive === undefined ? current.isActive : patch.isActive ? 1 : 0,
      nowIso(),
      id,
    ],
  );
  return getProduct(id);
}

export function deleteProduct(id: string): { ok: boolean; error?: string } {
  const stock = Number(scalar<number>('SELECT COALESCE(SUM(quantity), 0) FROM stock_balances WHERE product_id = ?', [id]) ?? 0);
  if (stock !== 0) return { ok: false, error: 'Product still has stock on hand. Archive it instead.' };
  const used = Number(scalar<number>('SELECT COUNT(*) FROM document_lines WHERE product_id = ?', [id]) ?? 0);
  if (used > 0) {
    run('UPDATE products SET is_active = 0, updated_at = ? WHERE id = ?', [nowIso(), id]);
    return { ok: true, error: 'Product is used by past documents, so it was archived instead of deleted.' };
  }
  run('DELETE FROM products WHERE id = ?', [id]);
  return { ok: true };
}

/**
 * Creates a product and, when an opening balance is supplied, records it as a
 * first-class `INITIAL` ledger entry so on-hand never appears out of nowhere.
 */
export function createProductWithStock(
  input: Parameters<typeof createProduct>[0],
  opening: { locationId: string; quantity: number; note?: string } | null,
  actor: { id: string | null; name?: string | null } = { id: null },
  options: { at?: string } = {},
): ProductRow {
  return tx(() => {
    const product = createProduct(input);
    if (opening && opening.quantity > 0) {
      postMove({
        reference: `INIT/${product.sku}`,
        documentType: 'INITIAL',
        productId: product.id,
        fromLocationId: null,
        toLocationId: opening.locationId,
        locationId: opening.locationId,
        quantity: opening.quantity,
        direction: 'IN',
        unitCost: input.costPrice ?? 0,
        note: opening.note ?? 'Initial stock recorded when the product was created',
        createdBy: actor.id,
        createdAt: options.at ?? nowIso(),
      });
    }
    return getProduct(product.id)!;
  });
}

export function productIdsByHealth(health: 'LOW_STOCK' | 'OUT_OF_STOCK'): string[] {
  const rows = all<{ id: string }>(
    `SELECT p.id FROM products p
     WHERE p.is_active = 1
       AND ${
         health === 'OUT_OF_STOCK'
           ? 'COALESCE((SELECT SUM(b.quantity) FROM stock_balances b WHERE b.product_id = p.id), 0) <= 0'
           : `COALESCE((SELECT SUM(b.quantity) FROM stock_balances b WHERE b.product_id = p.id), 0) > 0
              AND COALESCE((SELECT SUM(b.quantity - b.reserved) FROM stock_balances b WHERE b.product_id = p.id), 0) <= p.reorder_point`
       }`,
  );
  return rows.map((r) => r.id);
}

/* ---------------------------------------------------------- reorder rules */

export type ReorderRuleRow = {
  id: string;
  productId: string;
  productName?: string;
  sku?: string;
  warehouseId: string | null;
  warehouseName?: string | null;
  locationId: string | null;
  locationName?: string | null;
  minQty: number;
  maxQty: number;
  qtyToOrder: number;
  autoDraft: number;
  isActive: number;
  createdAt: string;
  updatedAt: string;
};

export function listReorderRules(productId?: string): ReorderRuleRow[] {
  const params: unknown[] = [];
  let where = '';
  if (productId) {
    where = 'WHERE r.product_id = ?';
    params.push(productId);
  }
  return all<ReorderRuleRow>(
    `SELECT r.id, r.product_id AS productId, p.name AS productName, p.sku, r.warehouse_id AS warehouseId, w.name AS warehouseName,
            r.location_id AS locationId, l.name AS locationName, r.min_qty AS minQty, r.max_qty AS maxQty,
            r.qty_to_order AS qtyToOrder, r.auto_draft AS autoDraft, r.is_active AS isActive,
            r.created_at AS createdAt, r.updated_at AS updatedAt
     FROM reorder_rules r
     JOIN products p ON p.id = r.product_id
     LEFT JOIN warehouses w ON w.id = r.warehouse_id
     LEFT JOIN locations l ON l.id = r.location_id
     ${where}
     ORDER BY p.name COLLATE NOCASE`,
    params,
  );
}

export function upsertReorderRule(input: {
  id?: string;
  productId: string;
  warehouseId?: string | null;
  locationId?: string | null;
  minQty: number;
  maxQty: number;
  qtyToOrder: number;
  autoDraft?: boolean;
}): ReorderRuleRow {
  return tx(() => {
    const stamp = nowIso();
    if (input.id) {
      run(
        `UPDATE reorder_rules SET warehouse_id = ?, location_id = ?, min_qty = ?, max_qty = ?, qty_to_order = ?, auto_draft = ?, updated_at = ? WHERE id = ?`,
        [input.warehouseId ?? null, input.locationId ?? null, input.minQty, input.maxQty, input.qtyToOrder, input.autoDraft ? 1 : 0, stamp, input.id],
      );
    } else {
      run(
        `INSERT INTO reorder_rules (id, product_id, warehouse_id, location_id, min_qty, max_qty, qty_to_order, auto_draft, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [uid.next('ror'), input.productId, input.warehouseId ?? null, input.locationId ?? null, input.minQty, input.maxQty, input.qtyToOrder, input.autoDraft ? 1 : 0, stamp, stamp],
      );
    }
    return get<ReorderRuleRow>(
      `SELECT r.id, r.product_id AS productId, p.name AS productName, p.sku, r.warehouse_id AS warehouseId, w.name AS warehouseName,
              r.location_id AS locationId, l.name AS locationName, r.min_qty AS minQty, r.max_qty AS maxQty,
              r.qty_to_order AS qtyToOrder, r.auto_draft AS autoDraft, r.is_active AS isActive,
              r.created_at AS createdAt, r.updated_at AS updatedAt
       FROM reorder_rules r JOIN products p ON p.id = r.product_id
       LEFT JOIN warehouses w ON w.id = r.warehouse_id LEFT JOIN locations l ON l.id = r.location_id
       WHERE r.product_id = ? ORDER BY r.is_active DESC, r.rowid DESC LIMIT 1`,
      [input.productId],
    )!;
  });
}

export function deleteReorderRule(id: string): void {
  run('DELETE FROM reorder_rules WHERE id = ?', [id]);
}
