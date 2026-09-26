import { apiAnyCapability, body, handle, HttpError, notFound, number, optionalText, text } from '@/lib/http';
import { getProduct } from '@/lib/repo/catalog';
import { getLocation } from '@/lib/repo/warehouses';
import { currentQuantity, recomputeBalances } from '@/lib/repo/inventory';
import { confirmDocument, createDocument, validateDocument } from '@/lib/repo/documents';
import { canCreateDocument } from '@/lib/domain/permissions';
import { can } from '@/lib/domain/constants';
import { logActivity, syncStockAlerts } from '@/lib/repo/activity';
import { todayInput } from '@/lib/format';

type Context = { params: Promise<{ id: string }> };

/**
 * "Update the stock from here" — the product page shortcut from the mock-up.
 *
 * Rather than writing a balance directly, this books a real `ADJUSTMENT`
 * document and validates it, so the change shows up in the ledger, the move
 * history and the audit trail exactly like a counted adjustment would.
 */
export async function POST(request: Request, { params }: Context) {
  return handle(async () => {
    const user = await apiAnyCapability('create_adjustment', 'manage_products');
    const { id } = await params;

    const product = getProduct(id);
    if (!product) notFound('That product no longer exists.');

    const payload = await body<Record<string, unknown>>(request);
    const locationId = text(payload.locationId, 'Location');
    const counted = number(payload.quantity, Number.NaN);
    if (!Number.isFinite(counted) || counted < 0) {
      throw new HttpError('Enter a counted quantity of 0 or more.', 400, { quantity: 'Enter a quantity of 0 or more' });
    }

    const location = getLocation(locationId);
    if (!location) notFound('That storage location no longer exists.');

    const recorded = currentQuantity(product.id, location.id);
    if (Math.abs(counted - recorded) < 1e-9) {
      return { unchanged: true, product, document: null, moves: 0 };
    }

    if (!canCreateDocument(user.role, 'ADJUSTMENT') && !can(user.role, 'manage_products')) {
      throw new HttpError('Your role cannot post adjustments.', 403);
    }

    const note = optionalText(payload.note) ?? `Stock updated from the product page (was ${recorded})`;
    const document = createDocument(
      {
        type: 'ADJUSTMENT',
        warehouseId: location.warehouseId,
        fromLocationId: location.id,
        partnerName: 'Stock update',
        scheduleDate: todayInput(),
        responsibleId: user.id,
        notes: note,
        lines: [{ productId: product.id, quantity: counted, note }],
      },
      user.id,
    );

    confirmDocument(document.id, user.id);
    const { document: done, moves } = validateDocument(document.id, user.id);

    syncStockAlerts();
    // Cheap safety net: the ledger decides the truth, the balances follow it.
    recomputeBalances();

    logActivity({
      userId: user.id,
      userName: user.name,
      action: 'STOCK_UPDATE',
      entityType: 'product',
      entityId: product.id,
      summary: `Updated ${product.sku} at ${location.shortCode}: ${recorded} → ${counted}`,
      meta: { documentId: done.id, reference: done.reference, moves },
    });

    return { unchanged: false, document: done, moves, product: getProduct(product.id) };
  });
}
