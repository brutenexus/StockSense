import { all, get, nowIso, run, tx, uid } from '../db';
import type { LocationKind } from '../domain/constants';

export type WarehouseRow = {
  id: string;
  name: string;
  shortCode: string;
  address: string | null;
  contactName: string | null;
  contactPhone: string | null;
  isDefault: number;
  isActive: number;
  createdAt: string;
  updatedAt: string;
};

export type LocationRow = {
  id: string;
  warehouseId: string;
  parentId: string | null;
  name: string;
  shortCode: string;
  kind: LocationKind;
  address: string | null;
  isActive: number;
  warehouseName?: string;
  warehouseCode?: string;
  createdAt: string;
  updatedAt: string;
};

const WH_COLUMNS = `id, name, short_code AS shortCode, address, contact_name AS contactName,
  contact_phone AS contactPhone, is_default AS isDefault, is_active AS isActive,
  created_at AS createdAt, updated_at AS updatedAt`;

const LOC_COLUMNS = `l.id, l.warehouse_id AS warehouseId, l.parent_id AS parentId, l.name, l.short_code AS shortCode,
  l.kind, l.address, l.is_active AS isActive, w.name AS warehouseName, w.short_code AS warehouseCode,
  l.created_at AS createdAt, l.updated_at AS updatedAt`;

export function listWarehouses(includeInactive = false): WarehouseRow[] {
  return all<WarehouseRow>(
    `SELECT ${WH_COLUMNS} FROM warehouses ${includeInactive ? '' : 'WHERE is_active = 1'} ORDER BY is_default DESC, name COLLATE NOCASE`,
  );
}

export function getWarehouse(id: string): WarehouseRow | undefined {
  return get<WarehouseRow>(`SELECT ${WH_COLUMNS} FROM warehouses WHERE id = ?`, [id]);
}

export function defaultWarehouse(): WarehouseRow | undefined {
  return get<WarehouseRow>(`SELECT ${WH_COLUMNS} FROM warehouses ORDER BY is_default DESC, created_at LIMIT 1`);
}

export function createWarehouse(input: {
  name: string;
  shortCode: string;
  address?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  isDefault?: boolean;
}): WarehouseRow {
  return tx(() => {
    const id = uid.next('wh');
    const stamp = nowIso();
    const shortCode = input.shortCode.trim().toUpperCase();
    if (input.isDefault) run('UPDATE warehouses SET is_default = 0');
    run(
      `INSERT INTO warehouses (id, name, short_code, address, contact_name, contact_phone, is_default, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [id, input.name.trim(), shortCode, input.address ?? null, input.contactName ?? null, input.contactPhone ?? null, input.isDefault ? 1 : 0, stamp, stamp],
    );
    // Every warehouse gets the two virtual endpoints that make the ledger
    // complete: goods arrive from "Vendors" and leave to "Customers".
    seedDefaultLocations(id, shortCode);
    return getWarehouse(id)!;
  });
}

function seedDefaultLocations(warehouseId: string, code: string): void {
  const stamp = nowIso();
  const rows: [string, string, LocationKind][] = [
    ['Stock', 'Stock', 'INTERNAL'],
    ['Input', 'Input', 'INPUT'],
    ['Output', 'Output', 'OUTPUT'],
    ['Production Floor', 'Production', 'PRODUCTION'],
  ];
  for (const [name, shortCode, kind] of rows) {
    run(
      `INSERT INTO locations (id, warehouse_id, parent_id, name, short_code, kind, is_active, created_at, updated_at)
       VALUES (?, ?, NULL, ?, ?, ?, 1, ?, ?)`,
      [uid.next('loc'), warehouseId, name, `${code}/${shortCode}`, kind, stamp, stamp],
    );
  }
}

export function updateWarehouse(
  id: string,
  patch: Partial<Pick<WarehouseRow, 'name' | 'shortCode' | 'address' | 'contactName' | 'contactPhone' | 'isActive' | 'isDefault'>>,
): WarehouseRow | undefined {
  const current = getWarehouse(id);
  if (!current) return undefined;
  return tx(() => {
    if (patch.isDefault) run('UPDATE warehouses SET is_default = 0 WHERE id <> ?', [id]);
    run(
      `UPDATE warehouses SET name = ?, short_code = ?, address = ?, contact_name = ?, contact_phone = ?, is_default = ?, is_active = ?, updated_at = ?
       WHERE id = ?`,
      [
        patch.name ?? current.name,
        (patch.shortCode ?? current.shortCode).toUpperCase(),
        patch.address !== undefined ? patch.address : current.address,
        patch.contactName !== undefined ? patch.contactName : current.contactName,
        patch.contactPhone !== undefined ? patch.contactPhone : current.contactPhone,
        patch.isDefault === undefined ? current.isDefault : patch.isDefault ? 1 : 0,
        patch.isActive === undefined ? current.isActive : patch.isActive ? 1 : 0,
        nowIso(),
        id,
      ],
    );
    return getWarehouse(id);
  });
}

export function deleteWarehouse(id: string): { ok: boolean; error?: string } {
  const used = Number(
    get<{ c: number }>('SELECT COUNT(*) AS c FROM stock_balances WHERE location_id IN (SELECT id FROM locations WHERE warehouse_id = ?) AND quantity > 0')?.c ?? 0,
  );
  if (used > 0) return { ok: false, error: 'This warehouse still holds stock. Move or adjust it first.' };
  const docs = Number(get<{ c: number }>('SELECT COUNT(*) AS c FROM documents WHERE warehouse_id = ?')?.c ?? 0);
  if (docs > 0) return { ok: false, error: `This warehouse is referenced by ${docs} document(s).` };
  run('DELETE FROM warehouses WHERE id = ?', [id]);
  return { ok: true };
}

/* ----------------------------------------------------------------- locations */

export function listLocations(opts: { warehouseId?: string; includeInactive?: boolean; internal?: boolean } = {}): LocationRow[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (!opts.includeInactive) clauses.push('l.is_active = 1');
  if (opts.warehouseId) {
    clauses.push('l.warehouse_id = ?');
    params.push(opts.warehouseId);
  }
  if (opts.internal) clauses.push("l.kind IN ('INTERNAL', 'PRODUCTION', 'TRANSIT')");
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return all<LocationRow>(
    `SELECT ${LOC_COLUMNS} FROM locations l JOIN warehouses w ON w.id = l.warehouse_id ${where}
     ORDER BY w.is_default DESC, w.name COLLATE NOCASE, l.kind = 'INPUT' ASC, l.name COLLATE NOCASE`,
    params,
  );
}

export function getLocation(id: string): LocationRow | undefined {
  return get<LocationRow>(`SELECT ${LOC_COLUMNS} FROM locations l JOIN warehouses w ON w.id = l.warehouse_id WHERE l.id = ?`, [id]);
}

export function virtualLocation(warehouseId: string, kind: 'INPUT' | 'OUTPUT'): LocationRow | undefined {
  return get<LocationRow>(
    `SELECT ${LOC_COLUMNS} FROM locations l JOIN warehouses w ON w.id = l.warehouse_id
     WHERE l.warehouse_id = ? AND l.kind = ? ORDER BY l.created_at LIMIT 1`,
    [warehouseId, kind],
  );
}

export function createLocation(input: {
  warehouseId: string;
  name: string;
  shortCode: string;
  kind?: LocationKind;
  parentId?: string | null;
  address?: string | null;
}): LocationRow {
  const id = uid.next('loc');
  const stamp = nowIso();
  const warehouse = getWarehouse(input.warehouseId);
  const prefix = warehouse ? `${warehouse.shortCode}/` : '';
  run(
    `INSERT INTO locations (id, warehouse_id, parent_id, name, short_code, kind, address, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [id, input.warehouseId, input.parentId ?? null, input.name.trim(), `${prefix}${input.shortCode.trim()}`, input.kind ?? 'INTERNAL', input.address ?? null, stamp, stamp],
  );
  return getLocation(id)!;
}

export function updateLocation(
  id: string,
  patch: Partial<Pick<LocationRow, 'name' | 'shortCode' | 'kind' | 'address' | 'parentId' | 'isActive'>>,
): LocationRow | undefined {
  const current = getLocation(id);
  if (!current) return undefined;
  run(
    `UPDATE locations SET name = ?, short_code = ?, kind = ?, address = ?, parent_id = ?, is_active = ?, updated_at = ? WHERE id = ?`,
    [
      patch.name ?? current.name,
      patch.shortCode ?? current.shortCode,
      patch.kind ?? current.kind,
      patch.address !== undefined ? patch.address : current.address,
      patch.parentId !== undefined ? patch.parentId : current.parentId,
      patch.isActive === undefined ? current.isActive : patch.isActive ? 1 : 0,
      nowIso(),
      id,
    ],
  );
  return getLocation(id);
}

export function deleteLocation(id: string): { ok: boolean; error?: string } {
  const used = Number(get<{ c: number }>('SELECT COUNT(*) AS c FROM stock_balances WHERE location_id = ? AND quantity > 0', [id])?.c ?? 0);
  if (used > 0) return { ok: false, error: 'This location still holds stock.' };
  run('DELETE FROM locations WHERE id = ?', [id]);
  return { ok: true };
}

export function stockByLocation(productId: string) {
  return all<{ locationId: string; locationName: string; locationCode: string; warehouseName: string; quantity: number; reserved: number }>(
    `SELECT b.location_id AS locationId, l.name AS locationName, l.short_code AS locationCode, w.name AS warehouseName,
            b.quantity, b.reserved
     FROM stock_balances b
     JOIN locations l ON l.id = b.location_id
     JOIN warehouses w ON w.id = l.warehouse_id
     WHERE b.product_id = ? AND (b.quantity <> 0 OR b.reserved <> 0)
     ORDER BY w.name COLLATE NOCASE, l.name COLLATE NOCASE`,
    [productId],
  );
}
