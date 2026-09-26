/**
 * Demo dataset.
 *
 * Everything is driven through the *real* document workflow — receipts,
 * transfers, deliveries and adjustments — so the ledger, the balances and the
 * dashboard charts are guaranteed to agree with each other. Nothing is
 * hand-written into `stock_balances`.
 *
 * History is replayed with backdated timestamps, so the trend charts light up
 * on first boot instead of sitting empty.
 */
import { exec, get, nowIso, run, tx, uid } from './index';
import { logger } from '../logger';
import { createCategory, createPartner, createProduct, createProductWithStock } from '../repo/catalog';
import { createLocation, createWarehouse, listLocations } from '../repo/warehouses';
import { createUser } from '../repo/users';
import {
  cancelDocument,
  confirmDocument,
  createDocument,
  validateDocument,
  type DocumentPayload,
} from '../repo/documents';
import { syncStockAlerts } from '../repo/activity';
import type { DocumentType } from '../domain/constants';

const TABLES = [
  'stock_moves',
  'document_lines',
  'documents',
  'stock_balances',
  'reorder_rules',
  'products',
  'partners',
  'categories',
  'locations',
  'warehouses',
  'notifications',
  'activity_log',
  'otp_codes',
  'sessions',
  'users',
  'counters',
];

export function wipe(): void {
  // Deleted child-first so foreign keys stay satisfied — `PRAGMA foreign_keys`
  // is a no-op inside a transaction, so ordering is the reliable tool here.
  tx(() => {
    for (const table of TABLES) {
      exec(`DELETE FROM ${table};`);
    }
  });
}

/** A deterministic timestamp `days` ago at a given hour, so charts look tidy. */
function at(daysAgo: number, hour = 10, minute = 15): string {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString();
}

function dayOffset(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export type SeedResult = {
  users: { loginId: string; password: string; role: string; name: string }[];
  counts: Record<string, number>;
};

export async function seed(): Promise<SeedResult> {
  wipe();

  /* ----------------------------------------------------------------- users */
  const manager = await createUser({
    loginId: 'manager',
    email: 'manager@stocksense.io',
    name: 'Aarav Mehta',
    password: 'Manage@123',
    role: 'MANAGER',
    jobTitle: 'Head of Inventory',
    phone: '+91 98200 11223',
    accent: 'indigo',
  });
  await createUser({
    loginId: 'staff01',
    email: 'staff@stocksense.io',
    name: 'Neha Kulkarni',
    password: 'Staff@123',
    role: 'STAFF',
    jobTitle: 'Warehouse Operator',
    phone: '+91 98200 44556',
    accent: 'emerald',
  });
  const supervisor = await createUser({
    loginId: 'manager2',
    email: 'rohit@stocksense.io',
    name: 'Rohit Sharma',
    password: 'Manage@123',
    role: 'MANAGER',
    jobTitle: 'Depot Supervisor',
    phone: '+91 98200 77889',
    accent: 'violet',
  });

  /* ------------------------------------------------------- warehouses + bins */
  const main = createWarehouse({
    name: 'Main Warehouse',
    shortCode: 'WH',
    address: '12 Logistics Park, Chakan, Pune 410501',
    contactName: 'Aarav Mehta',
    contactPhone: '+91 98200 11223',
    isDefault: true,
  });
  const north = createWarehouse({
    name: 'North Depot',
    shortCode: 'ND',
    address: 'Plot 4, Industrial Estate, Nashik 422007',
    contactName: 'Rohit Sharma',
    contactPhone: '+91 98200 77889',
  });

  const bin = (warehouseId: string, name: string, shortCode: string, kind: 'INTERNAL' | 'TRANSIT' = 'INTERNAL') =>
    createLocation({ warehouseId, name, shortCode, kind });

  const whStock1 = bin(main.id, 'Rack A · Fast movers', 'Stock1');
  const whStock2 = bin(main.id, 'Rack B · Bulk storage', 'Stock2');
  const whQuarantine = bin(main.id, 'Quarantine Bay', 'Quarantine', 'TRANSIT');
  const ndStock1 = bin(north.id, 'Aisle 1', 'Stock1');
  const locByCode = (code: string) => listLocations().find((l) => l.shortCode === code)!;
  const whStock = locByCode('WH/Stock');
  const whProduction = locByCode('WH/Production');
  const ndStock = locByCode('ND/Stock');

  /* -------------------------------------------------- categories + contacts */
  const furniture = createCategory({ name: 'Furniture', code: 'FRN', color: 'indigo', description: 'Desks, tables and seating' });
  const raw = createCategory({ name: 'Raw Material', code: 'RAW', color: 'amber', description: 'Steel, frames and stock material' });
  const fasteners = createCategory({ name: 'Fasteners', code: 'FST', color: 'slate', description: 'Bolts, nuts and fixings' });
  const tools = createCategory({ name: 'Power Tools', code: 'PWR', color: 'violet', description: 'Drills, wrenches and machines' });
  const packaging = createCategory({ name: 'Packaging', code: 'PKG', color: 'emerald', description: 'Cartons, wraps and consumables' });
  const electricals = createCategory({ name: 'Electricals', code: 'ELC', color: 'sky', description: 'Cables, lighting and fittings' });

  const azure = createPartner({
    name: 'Azure Interior',
    kind: 'BOTH',
    contactName: 'Priya Nair',
    email: 'sales@azureinterior.in',
    phone: '+91 98111 20304',
    address: 'Unit 7, MIDC Bhosari, Pune',
    gstin: '27AABCA1234D1Z5',
  });
  const steelWorks = createPartner({
    name: 'Steel Works Ltd',
    kind: 'VENDOR',
    contactName: 'Imran Sheikh',
    email: 'orders@steelworks.co.in',
    phone: '+91 98111 55667',
    address: 'Plot 22, Steel Market, Raipur',
    gstin: '22AACCS9988F1Z3',
  });
  const nordic = createPartner({
    name: 'Nordic Supplies',
    kind: 'VENDOR',
    contactName: 'Anna Larsen',
    email: 'hello@nordicsupplies.com',
    phone: '+91 98111 88990',
    address: 'Freight Terminal, Bhiwandi',
    gstin: '27AAECN4455G1Z9',
  });
  const boltTrader = createPartner({
    name: 'Bolt & Nut Traders',
    kind: 'VENDOR',
    contactName: 'Sandeep Rao',
    email: 'desk@boltntnut.in',
    phone: '+91 98111 22114',
    address: 'Shop 3, Hardware Lane, Pune',
    gstin: '27AAFCB7788H1Z1',
  });
  const beta = createPartner({
    name: 'Beta Industries',
    kind: 'CUSTOMER',
    contactName: 'Meera Joshi',
    email: 'procurement@betaind.com',
    phone: '+91 98111 33445',
    address: 'Plot 90, Ranjangaon MIDC, Pune',
    gstin: '27AAHCB2233K1Z7',
  });
  const acme = createPartner({
    name: 'Acme Retail',
    kind: 'CUSTOMER',
    contactName: 'Karan Bhatt',
    email: 'stores@acmeretail.in',
    phone: '+91 98111 66778',
    address: 'High Street Mall, Kharadi, Pune',
    gstin: '27AAJCA5566L1Z2',
  });
  const zenith = createPartner({
    name: 'Zenith Infra',
    kind: 'CUSTOMER',
    contactName: 'Rahul Verma',
    email: 'site@zenithinfra.com',
    phone: '+91 98111 99001',
    address: 'Tower B, Hinjewadi Phase 2, Pune',
    gstin: '27AAKCZ1122M1Z8',
  });

  /* --------------------------------------------------------------- products */
  const catalog: Parameters<typeof createProduct>[0][] = [
    { sku: 'DESK001', name: 'Standing Desk Pro', categoryId: furniture.id, uom: 'Unit', costPrice: 12800, salePrice: 15999, reorderPoint: 20, reorderQty: 30, accent: 'indigo', description: 'Height adjustable desk, 1400×700 mm' },
    { sku: 'TBL002', name: 'Conference Table', categoryId: furniture.id, uom: 'Unit', costPrice: 18400, salePrice: 22900, reorderPoint: 8, reorderQty: 12, accent: 'indigo', description: '12-seater modular table' },
    { sku: 'CHR003', name: 'Ergonomic Chair', categoryId: furniture.id, uom: 'Unit', costPrice: 5400, salePrice: 6999, reorderPoint: 30, reorderQty: 40, accent: 'indigo', description: 'Mesh back, lumbar support' },
    { sku: 'STL004', name: 'Steel Rod 12mm', categoryId: raw.id, uom: 'Kg', costPrice: 78, salePrice: 96, reorderPoint: 150, reorderQty: 400, accent: 'amber', description: 'MS round bar' },
    { sku: 'STL005', name: 'Steel Sheet 2mm', categoryId: raw.id, uom: 'Kg', costPrice: 92, salePrice: 112, reorderPoint: 200, reorderQty: 500, accent: 'amber', description: 'Cold rolled sheet' },
    { sku: 'WRK011', name: 'Workbench Frame', categoryId: raw.id, uom: 'Unit', costPrice: 6400, salePrice: 8200, reorderPoint: 12, reorderQty: 15, accent: 'amber', description: 'Welded frame for assembly benches' },
    { sku: 'BLT006', name: 'Hex Bolt M8', categoryId: fasteners.id, uom: 'Pack', costPrice: 240, salePrice: 320, reorderPoint: 80, reorderQty: 200, accent: 'slate', description: 'Stainless, 100 pcs per pack' },
    { sku: 'PKG007', name: 'Shipping Carton L', categoryId: packaging.id, uom: 'Box', costPrice: 42, salePrice: 55, reorderPoint: 150, reorderQty: 600, accent: 'emerald', description: '5-ply corrugated carton' },
    { sku: 'SAF010', name: 'Safety Gloves', categoryId: packaging.id, uom: 'Pack', costPrice: 150, salePrice: 220, reorderPoint: 50, reorderQty: 120, accent: 'emerald', description: 'Cut resistant, 12 pairs' },
    { sku: 'PWR008', name: 'Cordless Drill 18V', categoryId: tools.id, uom: 'Unit', costPrice: 4200, salePrice: 5499, reorderPoint: 10, reorderQty: 15, accent: 'violet', description: 'Brushless, 2 batteries' },
    { sku: 'TOOL014', name: 'Torque Wrench', categoryId: tools.id, uom: 'Unit', costPrice: 3400, salePrice: 4400, reorderPoint: 4, reorderQty: 8, accent: 'violet', description: '20–200 Nm calibrated' },
    { sku: 'CBL009', name: 'Power Cable 3m', categoryId: electricals.id, uom: 'Unit', costPrice: 180, salePrice: 260, reorderPoint: 200, reorderQty: 250, accent: 'sky', description: '3-core, 6 A rated' },
    { sku: 'LMP012', name: 'LED Panel Light', categoryId: electricals.id, uom: 'Unit', costPrice: 950, salePrice: 1350, reorderPoint: 90, reorderQty: 200, accent: 'sky', description: '36 W recessed panel' },
  ];
  const products = catalog.map((entry) => createProduct(entry));
  const pid = (sku: string) => products.find((p) => p.sku === sku)!.id;

  // Demonstrates the "initial stock (optional)" field from the specification:
  // the opening balance is booked as a first-class INITIAL ledger movement.
  createProductWithStock(
    { sku: 'TLB013', name: 'Tool Cabinet 7-drawer', categoryId: tools.id, uom: 'Unit', costPrice: 8900, salePrice: 11500, reorderPoint: 3, reorderQty: 6, accent: 'violet', description: 'Roller cabinet with lock' },
    { locationId: whStock1.id, quantity: 4, note: 'Opening stock captured from the physical count sheet' },
    { id: manager.id, name: manager.name },
    { at: at(14, 9, 0) },
  );
  const toolCabinet = get<{ id: string }>('SELECT id FROM products WHERE sku = ?', ['TLB013'])!.id;

  /* -------------------------------------------------------- document history */

  type HistoryStep =
    | { kind: 'DONE'; daysAgo: number; hour: number; payload: DocumentPayload; actor: string | null }
    | { kind: 'CONFIRM'; payload: DocumentPayload; actor: string | null }
    | { kind: 'DRAFT'; payload: DocumentPayload; actor: string | null }
    | { kind: 'CANCEL'; payload: DocumentPayload; actor: string | null };

  const receipt = (warehouseId: string, to: string, partnerId: string, op: string, days: number, lines: DocumentPayload['lines'], hour = 9): DocumentPayload => ({
    type: 'RECEIPT',
    warehouseId,
    toLocationId: to,
    partnerId,
    partnerName: undefined,
    operationType: op,
    scheduleDate: dayOffset(-days),
    responsibleId: manager.id,
    lines,
    notes: op === 'Purchase' ? 'Standard purchase order' : undefined,
  });
  const delivery = (warehouseId: string, from: string, partnerId: string, days: number, lines: DocumentPayload['lines']): DocumentPayload => ({
    type: 'DELIVERY',
    warehouseId,
    fromLocationId: from,
    partnerId,
    operationType: 'Sales',
    scheduleDate: dayOffset(-days),
    responsibleId: manager.id,
    lines,
  });
  const transfer = (warehouseId: string, from: string, to: string, days: number, lines: DocumentPayload['lines']): DocumentPayload => ({
    type: 'TRANSFER',
    warehouseId,
    fromLocationId: from,
    toLocationId: to,
    partnerName: 'Internal',
    scheduleDate: dayOffset(-days),
    responsibleId: supervisor.id,
    lines,
  });
  const adjustment = (warehouseId: string, location: string, days: number, lines: DocumentPayload['lines'], notes?: string): DocumentPayload => ({
    type: 'ADJUSTMENT',
    warehouseId,
    fromLocationId: location,
    partnerName: 'Internal count',
    scheduleDate: dayOffset(-days),
    responsibleId: supervisor.id,
    notes,
    lines,
  });

  const history: HistoryStep[] = [
    { kind: 'DONE', daysAgo: 13, hour: 9, actor: manager.id, payload: receipt(main.id, whStock2.id, steelWorks.id, 'Purchase', 13, [{ productId: pid('STL004'), quantity: 500 }, { productId: pid('STL005'), quantity: 800 }], 9) },
    { kind: 'DONE', daysAgo: 13, hour: 14, actor: manager.id, payload: receipt(main.id, whStock1.id, nordic.id, 'Purchase', 13, [{ productId: pid('CBL009'), quantity: 300 }, { productId: pid('LMP012'), quantity: 120 }], 14) },
    { kind: 'DONE', daysAgo: 12, hour: 10, actor: manager.id, payload: receipt(main.id, whStock1.id, azure.id, 'Purchase', 12, [{ productId: pid('DESK001'), quantity: 60 }, { productId: pid('TBL002'), quantity: 25 }, { productId: pid('CHR003'), quantity: 120 }], 10) },
    { kind: 'DONE', daysAgo: 12, hour: 16, actor: supervisor.id, payload: transfer(main.id, whStock2.id, whProduction.id, 12, [{ productId: pid('STL005'), quantity: 200 }, { productId: pid('STL004'), quantity: 60 }]) },
    { kind: 'DONE', daysAgo: 11, hour: 11, actor: manager.id, payload: receipt(main.id, whStock2.id, boltTrader.id, 'Purchase', 11, [{ productId: pid('BLT006'), quantity: 40 }], 11) },
    { kind: 'DONE', daysAgo: 11, hour: 15, actor: manager.id, payload: delivery(main.id, whStock1.id, beta.id, 11, [{ productId: pid('DESK001'), quantity: 12 }, { productId: pid('CHR003'), quantity: 20 }]) },
    { kind: 'DONE', daysAgo: 10, hour: 12, actor: manager.id, payload: delivery(main.id, whStock1.id, acme.id, 10, [{ productId: pid('CHR003'), quantity: 16 }, { productId: pid('TBL002'), quantity: 4 }]) },
    { kind: 'DONE', daysAgo: 10, hour: 17, actor: supervisor.id, payload: adjustment(main.id, whStock2.id, 10, [{ productId: pid('STL004'), quantity: 432 }], '8 kg damaged during unloading — written off') },
    { kind: 'DONE', daysAgo: 9, hour: 9, actor: manager.id, payload: receipt(main.id, whStock1.id, nordic.id, 'Purchase', 9, [{ productId: pid('PKG007'), quantity: 500 }, { productId: pid('SAF010'), quantity: 200 }], 9) },
    { kind: 'DONE', daysAgo: 9, hour: 16, actor: supervisor.id, payload: transfer(main.id, whStock1.id, whStock2.id, 9, [{ productId: pid('CBL009'), quantity: 100 }]) },
    { kind: 'DONE', daysAgo: 8, hour: 13, actor: manager.id, payload: delivery(main.id, whStock1.id, zenith.id, 8, [{ productId: pid('PKG007'), quantity: 220 }, { productId: pid('SAF010'), quantity: 60 }]) },
    { kind: 'DONE', daysAgo: 8, hour: 10, actor: supervisor.id, payload: receipt(north.id, ndStock.id, nordic.id, 'Purchase', 8, [{ productId: pid('LMP012'), quantity: 60 }, { productId: pid('CBL009'), quantity: 80 }], 10) },
    { kind: 'DONE', daysAgo: 7, hour: 11, actor: manager.id, payload: delivery(main.id, whStock1.id, beta.id, 7, [{ productId: pid('DESK001'), quantity: 14 }, { productId: pid('TBL002'), quantity: 3 }]) },
    { kind: 'DONE', daysAgo: 7, hour: 18, actor: supervisor.id, payload: adjustment(main.id, whStock1.id, 7, [{ productId: pid('PKG007'), quantity: 279 }], 'One carton crushed in the rack') },
    { kind: 'DONE', daysAgo: 6, hour: 10, actor: manager.id, payload: receipt(main.id, whStock1.id, azure.id, 'Purchase', 6, [{ productId: pid('PWR008'), quantity: 25 }, { productId: pid('WRK011'), quantity: 4 }], 10) },
    { kind: 'DONE', daysAgo: 6, hour: 15, actor: supervisor.id, payload: transfer(main.id, whStock1.id, whStock.id, 6, [{ productId: pid('PKG007'), quantity: 20 }, { productId: pid('SAF010'), quantity: 20 }]) },
    { kind: 'DONE', daysAgo: 5, hour: 14, actor: manager.id, payload: delivery(main.id, whStock1.id, acme.id, 5, [{ productId: pid('CHR003'), quantity: 18 }]) },
    { kind: 'DONE', daysAgo: 5, hour: 9, actor: supervisor.id, payload: transfer(main.id, whStock2.id, whStock1.id, 5, [{ productId: pid('STL004'), quantity: 60 }]) },
    { kind: 'DONE', daysAgo: 4, hour: 11, actor: manager.id, payload: receipt(main.id, whStock2.id, steelWorks.id, 'Purchase', 4, [{ productId: pid('WRK011'), quantity: 6 }, { productId: pid('STL004'), quantity: 120 }], 11) },
    { kind: 'DONE', daysAgo: 4, hour: 15, actor: manager.id, payload: delivery(main.id, whStock1.id, zenith.id, 4, [{ productId: pid('CBL009'), quantity: 140 }, { productId: pid('LMP012'), quantity: 100 }]) },
    { kind: 'DONE', daysAgo: 4, hour: 16, actor: manager.id, payload: delivery(main.id, whStock1.id, zenith.id, 4, [{ productId: pid('PWR008'), quantity: 25 }]) },
    { kind: 'DONE', daysAgo: 3, hour: 12, actor: manager.id, payload: delivery(main.id, whStock1.id, beta.id, 3, [{ productId: pid('DESK001'), quantity: 16 }, { productId: pid('CHR003'), quantity: 24 }, { productId: pid('TBL002'), quantity: 6 }]) },
    { kind: 'DONE', daysAgo: 2, hour: 10, actor: manager.id, payload: receipt(main.id, whStock2.id, boltTrader.id, 'Purchase', 2, [{ productId: pid('BLT006'), quantity: 20 }], 10) },
    { kind: 'DONE', daysAgo: 2, hour: 14, actor: manager.id, payload: delivery(main.id, whStock1.id, acme.id, 2, [{ productId: pid('PKG007'), quantity: 180 }, { productId: pid('SAF010'), quantity: 80 }]) },
    { kind: 'DONE', daysAgo: 1, hour: 11, actor: supervisor.id, payload: delivery(north.id, ndStock.id, zenith.id, 1, [{ productId: pid('CBL009'), quantity: 60 }]) },    { kind: 'DONE', daysAgo: 1, hour: 9, actor: supervisor.id, payload: receipt(main.id, whQuarantine.id, steelWorks.id, 'Purchase', 1, [{ productId: pid('STL004'), quantity: 40 }], 9) },
    { kind: 'DONE', daysAgo: 1, hour: 17, actor: supervisor.id, payload: transfer(main.id, whQuarantine.id, whStock2.id, 1, [{ productId: pid('STL004'), quantity: 40 }]) },

    // Open work the operator still has to deal with.
    { kind: 'CONFIRM', actor: manager.id, payload: receipt(main.id, whStock1.id, nordic.id, 'Purchase', -1, [{ productId: pid('CBL009'), quantity: 100 }, { productId: pid('LMP012'), quantity: 60 }]) },
    { kind: 'DRAFT', actor: manager.id, payload: receipt(main.id, whStock2.id, boltTrader.id, 'Purchase', 3, [{ productId: pid('BLT006'), quantity: 250 }]) },
    { kind: 'DRAFT', actor: supervisor.id, payload: receipt(north.id, ndStock1.id, nordic.id, 'Purchase', -2, [{ productId: pid('LMP012'), quantity: 40 }]) },
    { kind: 'CONFIRM', actor: manager.id, payload: delivery(main.id, whStock1.id, acme.id, -1, [{ productId: pid('CHR003'), quantity: 20 }]) },
    { kind: 'CONFIRM', actor: manager.id, payload: delivery(main.id, whStock1.id, zenith.id, -1, [{ productId: pid('PWR008'), quantity: 5 }]) },
    { kind: 'DRAFT', actor: manager.id, payload: delivery(main.id, whStock1.id, beta.id, 1, [{ productId: pid('DESK001'), quantity: 6 }]) },
    { kind: 'DRAFT', actor: manager.id, payload: delivery(main.id, whStock1.id, acme.id, -3, [{ productId: pid('PKG007'), quantity: 50 }, { productId: pid('SAF010'), quantity: 20 }]) },
    { kind: 'CONFIRM', actor: supervisor.id, payload: transfer(main.id, whStock1.id, whStock2.id, -1, [{ productId: pid('CHR003'), quantity: 10 }]) },
    { kind: 'DRAFT', actor: supervisor.id, payload: transfer(main.id, whStock2.id, whProduction.id, -4, [{ productId: pid('STL004'), quantity: 30 }]) },
    { kind: 'DRAFT', actor: supervisor.id, payload: adjustment(main.id, whStock1.id, -1, [{ productId: pid('PKG007'), quantity: 79 }, { productId: pid('SAF010'), quantity: 40 }], 'Cycle count — Rack A packaging bay') },
    { kind: 'CANCEL', actor: manager.id, payload: delivery(main.id, whStock1.id, acme.id, -5, [{ productId: pid('TBL002'), quantity: 2 }]) },
  ];

  let created = 0;
  for (const step of history) {
    const stamp = 'daysAgo' in step ? at(step.daysAgo, step.hour, 20) : nowIso();
    const document = createDocument(step.payload, step.actor, { at: stamp });
    if (step.kind === 'DONE') {
      confirmDocument(document.id, step.actor);
      validateDocument(document.id, step.actor, { at: stamp });
    } else if (step.kind === 'CONFIRM') {
      confirmDocument(document.id, step.actor);
    } else if (step.kind === 'CANCEL') {
      confirmDocument(document.id, step.actor);
      cancelDocument(document.id, step.actor);
    }
    created += 1;
  }

  /* ------------------------------------------- reorder rules + housekeeping */
  run(
    `INSERT INTO reorder_rules (id, product_id, warehouse_id, location_id, min_qty, max_qty, qty_to_order, auto_draft, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)`,
    [uid.next('ror'), pid('PKG007'), main.id, whStock1.id, 150, 900, 600, nowIso(), nowIso()],
  );
  run(
    `INSERT INTO reorder_rules (id, product_id, warehouse_id, location_id, min_qty, max_qty, qty_to_order, auto_draft, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`,
    [uid.next('ror'), pid('PWR008'), main.id, whStock1.id, 10, 40, 20, nowIso(), nowIso()],
  );

  const alerts = syncStockAlerts();

  const counts = {
    users: Number(get<{ c: number }>('SELECT COUNT(*) AS c FROM users')?.c ?? 0),
    warehouses: Number(get<{ c: number }>('SELECT COUNT(*) AS c FROM warehouses')?.c ?? 0),
    locations: Number(get<{ c: number }>('SELECT COUNT(*) AS c FROM locations')?.c ?? 0),
    categories: Number(get<{ c: number }>('SELECT COUNT(*) AS c FROM categories')?.c ?? 0),
    products: Number(get<{ c: number }>('SELECT COUNT(*) AS c FROM products')?.c ?? 0),
    partners: Number(get<{ c: number }>('SELECT COUNT(*) AS c FROM partners')?.c ?? 0),
    documents: Number(get<{ c: number }>('SELECT COUNT(*) AS c FROM documents')?.c ?? 0),
    moves: Number(get<{ c: number }>('SELECT COUNT(*) AS c FROM stock_moves')?.c ?? 0),
    alerts: alerts.low + alerts.out,
    steps: created,
  };

  logger.info(
    `seed: ${counts.products} products, ${counts.documents} documents, ${counts.moves} ledger rows, ${counts.alerts} alerts`,
  );

  return {
    users: [
      { loginId: 'manager', password: 'Manage@123', role: 'MANAGER', name: 'Aarav Mehta' },
      { loginId: 'staff01', password: 'Staff@123', role: 'STAFF', name: 'Neha Kulkarni' },
      { loginId: 'manager2', password: 'Manage@123', role: 'MANAGER', name: 'Rohit Sharma' },
    ],
    counts,
  };
}

export const SEEDED_DOCUMENT_TYPES: DocumentType[] = ['RECEIPT', 'DELIVERY', 'TRANSFER', 'ADJUSTMENT'];
