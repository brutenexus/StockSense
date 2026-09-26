import { all, get } from '../db';
import type { DocumentType } from '../domain/constants';
import { stockHealth } from '../domain/inventory';
import { documentKpis, pendingCounts, scheduleLoad, type DocumentRow } from './documents';
import {
  listBalances,
  locationUtilisation,
  movementSeries,
  stockTotals,
  topMovingProducts,
  valueByCategory,
} from './inventory';
import { listProducts, type ProductRow } from './catalog';
import { unreadNotificationCount } from './activity';

export function warehouseOverview() {
  return all<{
    warehouseId: string;
    name: string;
    shortCode: string;
    locations: number;
    skus: number;
    quantity: number;
    value: number;
  }>(
    `SELECT w.id AS warehouseId, w.name, w.short_code AS shortCode,
            (SELECT COUNT(*) FROM locations l WHERE l.warehouse_id = w.id AND l.is_active = 1) AS locations,
            (SELECT COUNT(DISTINCT b.product_id) FROM stock_balances b JOIN locations l ON l.id = b.location_id
              WHERE l.warehouse_id = w.id AND b.quantity <> 0) AS skus,
            COALESCE((SELECT SUM(b.quantity) FROM stock_balances b JOIN locations l ON l.id = b.location_id WHERE l.warehouse_id = w.id), 0) AS quantity,
            COALESCE((SELECT SUM(b.quantity * p.cost_price) FROM stock_balances b JOIN locations l ON l.id = b.location_id
                       JOIN products p ON p.id = b.product_id WHERE l.warehouse_id = w.id), 0) AS value
     FROM warehouses w WHERE w.is_active = 1 ORDER BY w.is_default DESC, w.name COLLATE NOCASE`,
  );
}

export type StockAlertRow = ProductRow & { shortage: number; suggestedQty: number; categoryName: string | null };

export function lowStockProducts(limit = 50): StockAlertRow[] {
  const [low, out] = [listProducts({ health: 'LOW_STOCK', sort: 'onHand', limit }), listProducts({ health: 'OUT_OF_STOCK', sort: 'onHand', limit })];
  const merged = [...out.items, ...low.items].slice(0, limit);
  return merged.map((product) => ({
    ...product,
    shortage: Math.max(0, product.reorderPoint - product.freeToUse),
    suggestedQty: Math.max(product.reorderQty || 0, Math.max(0, product.reorderPoint * 2 - product.onHand)),
  }));
}

export function reorderSuggestions(limit = 25) {
  return all<{
    productId: string;
    name: string;
    sku: string;
    uom: string;
    categoryName: string | null;
    costPrice: number;
    onHand: number;
    reserved: number;
    freeToUse: number;
    reorderPoint: number;
    reorderQty: number;
    suggestedQty: number;
    estimatedCost: number;
    health: 'LOW_STOCK' | 'OUT_OF_STOCK';
    ruleId: string | null;
    autoDraft: number;
    defaultWarehouseId: string | null;
    defaultLocationId: string | null;
  }>(
    `SELECT p.id AS productId, p.name, p.sku, p.uom, c.name AS categoryName, p.cost_price AS costPrice,
            COALESCE((SELECT SUM(b.quantity) FROM stock_balances b WHERE b.product_id = p.id), 0) AS onHand,
            COALESCE((SELECT SUM(b.reserved) FROM stock_balances b WHERE b.product_id = p.id), 0) AS reserved,
            COALESCE((SELECT SUM(b.quantity - b.reserved) FROM stock_balances b WHERE b.product_id = p.id), 0) AS freeToUse,
            p.reorder_point AS reorderPoint, p.reorder_qty AS reorderQty,
            MAX(COALESCE(NULLIF(r.qty_to_order, 0), p.reorder_qty),
                CASE WHEN COALESCE((SELECT SUM(b.quantity) FROM stock_balances b WHERE b.product_id = p.id), 0) <= 0
                     THEN p.reorder_qty ELSE p.reorder_qty END) AS suggestedQty,
            r.id AS ruleId, COALESCE(r.auto_draft, 0) AS autoDraft,
            (SELECT id FROM warehouses ORDER BY is_default DESC, created_at LIMIT 1) AS defaultWarehouseId,
            (SELECT b.location_id FROM stock_balances b JOIN locations l ON l.id = b.location_id
              WHERE b.product_id = p.id AND l.kind = 'INTERNAL' ORDER BY b.quantity DESC LIMIT 1) AS defaultLocationId
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN reorder_rules r ON r.product_id = p.id AND r.is_active = 1
     WHERE p.is_active = 1
       AND COALESCE((SELECT SUM(b.quantity - b.reserved) FROM stock_balances b WHERE b.product_id = p.id), 0) <= p.reorder_point
     GROUP BY p.id
     ORDER BY (COALESCE((SELECT SUM(b.quantity) FROM stock_balances b WHERE b.product_id = p.id), 0) <= 0) DESC,
              freeToUse ASC
     LIMIT ?`,
    [limit],
  ).map((row) => ({
    ...row,
    freeToUse: Number(row.freeToUse),
    onHand: Number(row.onHand),
    reserved: Number(row.reserved),
    suggestedQty: Number(row.suggestedQty || Math.max(row.reorderQty, row.reorderPoint * 2 - row.onHand) || 1),
    estimatedCost: Number(row.suggestedQty || 0) * Number(row.costPrice ?? 0),
    health: row.onHand <= 0 ? ('OUT_OF_STOCK' as const) : ('LOW_STOCK' as const),
  }));
}

export function completedThroughput(days = 30) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const row = get<{ receipts: number; deliveries: number; transfers: number; adjustments: number; avgCycleHours: number | null }>(
    `SELECT
       SUM(CASE WHEN type = 'RECEIPT' THEN 1 ELSE 0 END) AS receipts,
       SUM(CASE WHEN type = 'DELIVERY' THEN 1 ELSE 0 END) AS deliveries,
       SUM(CASE WHEN type = 'TRANSFER' THEN 1 ELSE 0 END) AS transfers,
       SUM(CASE WHEN type = 'ADJUSTMENT' THEN 1 ELSE 0 END) AS adjustments,
       AVG(CASE WHEN done_at IS NOT NULL AND created_at IS NOT NULL
                THEN (julianday(done_at) - julianday(created_at)) * 24 END) AS avgCycleHours
     FROM documents WHERE status = 'DONE' AND done_at >= ?`,
    [since],
  );
  return {
    receipts: Number(row?.receipts ?? 0),
    deliveries: Number(row?.deliveries ?? 0),
    transfers: Number(row?.transfers ?? 0),
    adjustments: Number(row?.adjustments ?? 0),
    avgCycleHours: row?.avgCycleHours !== null && row?.avgCycleHours !== undefined ? Number(row.avgCycleHours) : null,
  };
}

export type DashboardSnapshot = Awaited<ReturnType<typeof dashboardSnapshot>>;

export function dashboardSnapshot(options: { warehouseId?: string; categoryId?: string; days?: number } = {}) {
  const days = options.days ?? 14;
  const totals = stockTotals();
  const health = get<{ low: number; out: number; healthy: number }>(
    `SELECT
       SUM(CASE WHEN onHand > 0 AND free <= reorderPoint THEN 1 ELSE 0 END) AS low,
       SUM(CASE WHEN onHand <= 0 THEN 1 ELSE 0 END) AS out,
       SUM(CASE WHEN onHand > 0 AND free > reorderPoint THEN 1 ELSE 0 END) AS healthy
     FROM (
       SELECT p.id, p.reorder_point AS reorderPoint,
              COALESCE((SELECT SUM(b.quantity) FROM stock_balances b WHERE b.product_id = p.id), 0) AS onHand,
              COALESCE((SELECT SUM(b.quantity - b.reserved) FROM stock_balances b WHERE b.product_id = p.id), 0) AS free
       FROM products p WHERE p.is_active = 1
     ) t`,
  );
  const receipts = documentKpis('RECEIPT');
  const deliveries = documentKpis('DELIVERY');
  const transfers = documentKpis('TRANSFER');
  const adjustments = documentKpis('ADJUSTMENT');
  const pending = pendingCounts();
  const through = completedThroughput();

  return {
    generatedAt: new Date().toISOString(),
    days,
    totals,
    health: {
      low: Number(health?.low ?? 0),
      out: Number(health?.out ?? 0),
      healthy: Number(health?.healthy ?? 0),
    },
    documents: {
      receipts,
      deliveries,
      transfers,
      adjustments,
      pending,
      throughput: through,
    },
    series: movementSeries(days),
    valueByCategory: valueByCategory(),
    topMoving: topMovingProducts(6),
    locations: locationUtilisation(),
    schedule: scheduleLoad(14),
    warehouses: warehouseOverview(),
    unread: unreadNotificationCount(),
    systemHealth: checkHealth(),
  };
}

/** Fast self-check surfaced on the dashboard as a trust signal. */
export function checkHealth() {
  const drift = all<{ productId: string; locationId: string; quantity: number; expected: number }>(
    `SELECT b.product_id AS productId, b.location_id AS locationId, b.quantity,
            COALESCE((SELECT SUM(CASE WHEN m.direction = 'IN' THEN m.quantity ELSE -m.quantity END)
                      FROM stock_moves m WHERE m.product_id = b.product_id AND m.location_id = b.location_id), 0) AS expected
     FROM stock_balances b`,
  ).filter((row) => Math.abs(Number(row.quantity) - Number(row.expected)) > 1e-9);
  const negative = all<{ productId: string; locationId: string; quantity: number }>(
    'SELECT product_id AS productId, location_id AS locationId, quantity FROM stock_balances WHERE quantity < 0',
  );
  return {
    balanced: drift.length === 0 && negative.length === 0,
    driftRows: drift.length,
    negativeRows: negative.length,
    checkedAt: new Date().toISOString(),
  };
}

export function productStockBreakdown(productId: string) {
  const balances = listBalances({ productId });
  const total = balances.reduce((sum, b) => sum + b.quantity, 0);
  const reserved = balances.reduce((sum, b) => sum + b.reserved, 0);
  return {
    balances,
    total,
    reserved,
    free: Math.max(0, total - reserved),
  };
}

export function typeSummary(type: DocumentType): { status: string; count: number; quantity: number }[] {
  return all<{ status: string; count: number; quantity: number }>(
    `SELECT d.status, COUNT(*) AS count, COALESCE(SUM((SELECT SUM(dl.quantity) FROM document_lines dl WHERE dl.document_id = d.id)), 0) AS quantity
     FROM documents d WHERE d.type = ? GROUP BY d.status`,
    [type],
  );
}

export function assignHealth(row: { onHand: number; reserved: number; reorderPoint: number }) {
  return stockHealth(row.onHand, row.reserved, row.reorderPoint);
}

export type { DocumentRow };
