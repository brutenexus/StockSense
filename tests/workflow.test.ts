/**
 * End-to-end workflow test.
 *
 * Runs the *real* repositories against a throwaway SQLite file so the ledger,
 * the reservation logic and the status machine are all exercised together —
 * including the promise that a delivery which is short of stock promotes itself
 * once a receipt lands.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATABASE_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'stocksense-')), 'test.db');

const { seed } = await import('@/lib/db/seed');
const { checkHealth, productStockBreakdown } = await import('@/lib/repo/insights');
const { createProduct, listProducts, getProduct } = await import('@/lib/repo/catalog');
const { getLocation, listLocations, listWarehouses } = await import('@/lib/repo/warehouses');
const { currentQuantity, listBalances, listMoves } = await import('@/lib/repo/inventory');
const { cancelDocument, confirmDocument, createDocument, getDocument, getDocumentLines, listDocuments, validateDocument } =
  await import('@/lib/repo/documents');
const { listUsers } = await import('@/lib/repo/users');

let managerId = '';
let staffId = '';
/** A product/location pair that genuinely has free stock to move around. */
let source = { productId: '', locationId: '', warehouseId: '', quantity: 0 };

beforeAll(async () => {
  const result = await seed();
  managerId = listUsers().find((user) => user.loginId === 'manager')!.id;
  staffId = listUsers().find((user) => user.loginId === 'staff01')!.id;
  expect(result.counts.documents).toBeGreaterThan(20);

  const balance = listBalances({ onlyNonZero: true }).find((row) => row.quantity - row.reserved >= 5)!;
  source = {
    productId: balance.productId,
    locationId: balance.locationId,
    warehouseId: balance.warehouseId!,
    quantity: balance.quantity - balance.reserved,
  };
});

function otherInternalLocation(warehouseId: string, excludeId: string): string {
  return listLocations({ warehouseId }).filter((location) => location.kind === 'INTERNAL' && location.id !== excludeId)[0]!.id;
}

describe('seeded dataset', () => {
  it('keeps every balance in step with the ledger', () => {
    const health = checkHealth();
    expect(health.driftRows).toBe(0);
    expect(health.negativeRows).toBe(0);
    expect(health.balanced).toBe(true);
  });

  it('creates balances out of movements, never out of thin air', () => {
    const balances = listBalances({ onlyNonZero: true });
    expect(balances.length).toBeGreaterThan(0);
    expect(balances.every((balance) => balance.quantity >= 0)).toBe(true);
  });

  it('mixes open and completed work', () => {
    expect(listDocuments({ status: ['DRAFT'], limit: 10 }).total).toBeGreaterThan(0);
    expect(listDocuments({ status: ['DONE'], limit: 10 }).total).toBeGreaterThan(0);
  });

  it('sorts products by name by default', () => {
    const result = listProducts({ limit: 5 });
    expect(result.items.length).toBeGreaterThan(0);
    const names = result.items.map((product) => product.name.toLowerCase());
    expect([...names].sort()).toEqual(names);
  });

  it('filters the catalogue by stock health', () => {
    const all = listProducts({ limit: 1 });
    const low = listProducts({ health: 'LOW_STOCK', limit: 200 });
    const out = listProducts({ health: 'OUT_OF_STOCK', limit: 200 });
    const healthy = listProducts({ health: 'HEALTHY', limit: 200 });

    expect(low.items.every((product) => product.health === 'LOW_STOCK')).toBe(true);
    expect(out.items.every((product) => product.health === 'OUT_OF_STOCK')).toBe(true);
    expect(healthy.items.every((product) => product.health === 'HEALTHY')).toBe(true);
    // The three buckets partition the active catalogue exactly.
    expect(low.total + out.total + healthy.total).toBe(all.total);
    // A health filter must actually narrow the result set when stock is short.
    expect(low.total + out.total).toBeGreaterThan(0);
    expect(low.total + out.total).toBeLessThan(all.total);
  });

  it('sorts products by stock value on request', () => {
    const result = listProducts({ limit: 5, sort: 'value', direction: 'desc' });
    const values = result.items.map((product) => product.stockValue);
    expect([...values].sort((a, b) => b - a)).toEqual(values);
  });
});

describe('transfers and deliveries', () => {
  it('reserves free stock on confirm and posts two-sided moves on validate', () => {
    const destination = otherInternalLocation(source.warehouseId, source.locationId);
    const before = currentQuantity(source.productId, source.locationId);

    const document = createDocument(
      {
        type: 'TRANSFER',
        warehouseId: source.warehouseId,
        fromLocationId: source.locationId,
        toLocationId: destination,
        lines: [{ productId: source.productId, quantity: 2 }],
      },
      managerId,
    );

    const confirmed = confirmDocument(document.id, managerId);
    expect(confirmed.status).toBe('READY');
    expect(getDocumentLines(document.id)[0]!.reservedQty).toBe(2);
    expect(currentQuantity(source.productId, source.locationId)).toBe(before); // reserved, not removed

    const validated = validateDocument(document.id, managerId);
    expect(validated.document.status).toBe('DONE');
    // A transfer leaves the source and lands in the destination: two ledger rows.
    expect(validated.moves).toBe(2);
    expect(currentQuantity(source.productId, source.locationId)).toBe(before - 2);
    expect(checkHealth().balanced).toBe(true);
  });

  it('parks a short delivery in WAITING and promotes it when stock arrives', () => {
    const bin = source.locationId;
    const product = createProduct({ sku: `WAIT${Date.now().toString(36).toUpperCase()}`, name: 'Waiting Test Widget', uom: 'Unit', costPrice: 10 });
    expect(productStockBreakdown(product.id).free).toBe(0);

    const delivery = createDocument(
      { type: 'DELIVERY', warehouseId: source.warehouseId, fromLocationId: bin, lines: [{ productId: product.id, quantity: 25 }] },
      managerId,
    );
    expect(confirmDocument(delivery.id, managerId).status).toBe('WAITING');
    expect(getDocumentLines(delivery.id)[0]!.reservedQty).toBe(0);

    // Stock arrives — the waiting delivery promotes itself automatically.
    const receipt = createDocument(
      { type: 'RECEIPT', warehouseId: source.warehouseId, toLocationId: bin, lines: [{ productId: product.id, quantity: 100 }] },
      managerId,
    );
    confirmDocument(receipt.id, managerId);
    validateDocument(receipt.id, managerId);

    expect(getDocument(delivery.id)!.status).toBe('READY');
    expect(getDocumentLines(delivery.id)[0]!.reservedQty).toBe(25);

    const done = validateDocument(delivery.id, managerId);
    expect(done.document.status).toBe('DONE');
    expect(currentQuantity(product.id, bin)).toBe(75);
    expect(checkHealth().balanced).toBe(true);
  });

  it('releases reservations when a document is canceled', () => {
    const destination = otherInternalLocation(source.warehouseId, source.locationId);
    const product = getProduct(source.productId)!;
    const document = createDocument(
      {
        type: 'TRANSFER',
        warehouseId: source.warehouseId,
        fromLocationId: source.locationId,
        toLocationId: destination,
        lines: [{ productId: product.id, quantity: 1 }],
      },
      managerId,
    );
    confirmDocument(document.id, managerId);
    cancelDocument(document.id, managerId);
    expect(getDocument(document.id)!.status).toBe('CANCELED');
    expect(getDocumentLines(document.id)[0]!.reservedQty).toBe(0);
  });
});

describe('counted adjustments', () => {
  it('writes only the delta between counted and recorded stock', () => {
    const product = getProduct(source.productId)!;
    const recorded = currentQuantity(product.id, source.locationId);
    const counted = recorded + 7;

    const document = createDocument(
      {
        type: 'ADJUSTMENT',
        warehouseId: source.warehouseId,
        fromLocationId: source.locationId,
        partnerName: 'Stock update',
        lines: [{ productId: product.id, quantity: counted }],
      },
      staffId,
    );
    confirmDocument(document.id, staffId);
    const result = validateDocument(document.id, staffId);

    expect(result.document.status).toBe('DONE');
    expect(currentQuantity(product.id, source.locationId)).toBe(counted);
    expect(result.moves).toBe(1);
    const [line] = getDocumentLines(document.id);
    expect(line!.doneQuantity).toBe(7);
    expect(checkHealth().balanced).toBe(true);
  });

  it('refuses to validate a draft that was never confirmed', () => {
    const bin = getLocation(source.locationId)!;
    const product = getProduct(source.productId)!;
    const document = createDocument(
      { type: 'RECEIPT', warehouseId: bin.warehouseId, toLocationId: bin.id, lines: [{ productId: product.id, quantity: 1 }] },
      managerId,
    );
    expect(() => validateDocument(document.id, managerId)).toThrow(/Confirm the document/);
  });
});

describe('ledger', () => {
  it('records a balance after every movement', () => {
    const moves = listMoves({ productId: source.productId, limit: 5 });
    expect(moves.items.length).toBeGreaterThan(0);
    expect(moves.items.every((move) => move.balanceAfter === null || Number.isFinite(move.balanceAfter))).toBe(true);
  });

  it('totals in and out for the filtered view', () => {
    const moves = listMoves({ limit: 5 });
    expect(moves.total).toBeGreaterThan(0);
    expect(moves.totals.inQty).toBeGreaterThan(0);
  });

  it('keeps the seeded warehouse list usable', () => {
    expect(listWarehouses().length).toBeGreaterThan(1);
  });
});
