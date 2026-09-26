import {
  apiCapability,
  apiUser,
  body,
  flag,
  handle,
  HttpError,
  notFound,
  optionalNumber,
  optionalText,
  text,
} from '@/lib/http';
import { deleteProduct, getProduct, updateProduct } from '@/lib/repo/catalog';
import { productStockBreakdown } from '@/lib/repo/insights';
import { firstError, validateProduct } from '@/lib/domain/validation';
import { logActivity, syncStockAlerts } from '@/lib/repo/activity';

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  return handle(async () => {
    await apiUser();
    const { id } = await params;
    const product = getProduct(id);
    if (!product) notFound('That product no longer exists.');
    return { product, stock: productStockBreakdown(id) };
  });
}

export async function PATCH(request: Request, { params }: Context) {
  return handle(async () => {
    const user = await apiCapability('manage_products');
    const { id } = await params;
    const current = getProduct(id);
    if (!current) notFound('That product no longer exists.');

    const payload = await body<Record<string, unknown>>(request);
    const patch: Record<string, unknown> = {};

    if (payload.sku !== undefined) patch.sku = text(payload.sku, 'SKU');
    if (payload.name !== undefined) patch.name = text(payload.name, 'Product name');
    if (payload.barcode !== undefined) patch.barcode = optionalText(payload.barcode);
    if (payload.description !== undefined) patch.description = optionalText(payload.description);
    if (payload.categoryId !== undefined) patch.categoryId = optionalText(payload.categoryId);
    if (payload.uom !== undefined) patch.uom = text(payload.uom, 'Unit of measure');
    if (payload.costPrice !== undefined) patch.costPrice = optionalNumber(payload.costPrice);
    if (payload.salePrice !== undefined) patch.salePrice = optionalNumber(payload.salePrice);
    if (payload.reorderPoint !== undefined) patch.reorderPoint = optionalNumber(payload.reorderPoint);
    if (payload.reorderQty !== undefined) patch.reorderQty = optionalNumber(payload.reorderQty);
    if (payload.accent !== undefined) patch.accent = text(payload.accent, 'Accent');
    if (payload.isActive !== undefined) patch.isActive = flag(payload.isActive, true);

    const validated = validateProduct({
      sku: (patch.sku as string) ?? current.sku,
      name: (patch.name as string) ?? current.name,
      costPrice: (patch.costPrice as number) ?? current.costPrice,
      salePrice: (patch.salePrice as number) ?? current.salePrice,
      reorderPoint: (patch.reorderPoint as number) ?? current.reorderPoint,
    });
    if (!validated.ok) throw new HttpError(firstError(validated), 400, validated.errors);

    const product = updateProduct(id, patch);
    if (!product) notFound('That product no longer exists.');

    syncStockAlerts();
    logActivity({
      userId: user.id,
      userName: user.name,
      action: 'PRODUCT_UPDATE',
      entityType: 'product',
      entityId: product.id,
      summary: `Updated product ${product.sku} · ${product.name}`,
      meta: { fields: Object.keys(patch) },
    });

    return { product };
  });
}

export async function DELETE(_request: Request, { params }: Context) {
  return handle(async () => {
    const user = await apiCapability('manage_products');
    const { id } = await params;
    const product = getProduct(id);
    if (!product) notFound('That product no longer exists.');

    const result = deleteProduct(id);
    if (!result.ok) throw new HttpError(result.error ?? 'The product could not be removed.');

    syncStockAlerts();
    logActivity({
      userId: user.id,
      userName: user.name,
      action: 'PRODUCT_DELETE',
      entityType: 'product',
      entityId: id,
      summary: `Removed product ${product.sku} · ${product.name}`,
      meta: result.error ? { archived: true } : null,
    });

    return { ok: true, notice: result.error ?? null };
  });
}
