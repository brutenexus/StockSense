import {
  apiCapability,
  apiUser,
  body,
  flag,
  handle,
  HttpError,
  intParam,
  number,
  optionalNumber,
  optionalText,
  query,
  text,
  textParam,
} from '@/lib/http';
import { listProducts, createProductWithStock, findProductBySkuOrBarcode, type ProductListOptions } from '@/lib/repo/catalog';
import { getLocation } from '@/lib/repo/warehouses';
import { firstError, validateProduct } from '@/lib/domain/validation';
import { logActivity, syncStockAlerts } from '@/lib/repo/activity';
import { UOMS } from '@/lib/domain/constants';

const SORTS: ProductListOptions['sort'][] = ['name', 'sku', 'onHand', 'value', 'updated', 'health'];
const HEALTHS: NonNullable<ProductListOptions['health']>[] = ['HEALTHY', 'LOW_STOCK', 'OUT_OF_STOCK', 'ALL'];

export async function GET(request: Request) {
  return handle(async () => {
    await apiUser();
    const source = query(request);
    const sort = textParam(source, 'sort');
    const health = textParam(source, 'health');

    const result = listProducts({
      search: textParam(source, 'q') ?? textParam(source, 'search'),
      categoryId: textParam(source, 'category'),
      warehouseId: textParam(source, 'warehouse'),
      locationId: textParam(source, 'location'),
      health: health && HEALTHS.includes(health as never) ? (health as ProductListOptions['health']) : 'ALL',
      sort: sort && SORTS.includes(sort as never) ? (sort as ProductListOptions['sort']) : 'name',
      direction: textParam(source, 'dir') === 'desc' ? 'desc' : 'asc',
      includeInactive: flag(textParam(source, 'includeInactive')),
      limit: intParam(source, 'limit', 25),
      offset: intParam(source, 'offset', 0),
    });

    return { items: result.items, total: result.total };
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const user = await apiCapability('manage_products');
    const payload = await body<Record<string, unknown>>(request);

    const input = {
      sku: text(payload.sku, 'SKU'),
      name: text(payload.name, 'Product name'),
      barcode: optionalText(payload.barcode),
      description: optionalText(payload.description),
      categoryId: optionalText(payload.categoryId),
      uom: optionalText(payload.uom) ?? 'Unit',
      costPrice: optionalNumber(payload.costPrice),
      salePrice: optionalNumber(payload.salePrice),
      reorderPoint: optionalNumber(payload.reorderPoint),
      reorderQty: optionalNumber(payload.reorderQty),
      accent: optionalText(payload.accent) ?? 'slate',
      initialStock: optionalNumber(payload.initialStock),
    };

    const validated = validateProduct(input);
    if (!validated.ok) throw new HttpError(firstError(validated), 400, validated.errors);
    if (!UOMS.includes(input.uom as never)) throw new HttpError('Pick a valid unit of measure.', 400, { uom: 'Invalid unit' });
    if (findProductBySkuOrBarcode(input.sku)) {
      throw new HttpError('That SKU is already used by another product.', 400, { sku: 'This SKU already exists' });
    }

    let opening: { locationId: string; quantity: number; note?: string } | null = null;
    const openingLocationId = optionalText(payload.locationId);
    if (openingLocationId && input.initialStock > 0) {
      const location = getLocation(openingLocationId);
      if (!location) throw new HttpError('That location no longer exists.', 400, { locationId: 'Choose a location' });
      opening = { locationId: location.id, quantity: input.initialStock, note: 'Opening stock captured when the product was created' };
    }

    const product = createProductWithStock(
      {
        sku: input.sku,
        name: input.name,
        barcode: input.barcode,
        description: input.description,
        categoryId: input.categoryId,
        uom: input.uom,
        costPrice: input.costPrice,
        salePrice: input.salePrice,
        reorderPoint: input.reorderPoint,
        reorderQty: input.reorderQty,
        accent: input.accent,
      },
      opening,
      { id: user.id, name: user.name },
    );

    syncStockAlerts();
    logActivity({
      userId: user.id,
      userName: user.name,
      action: 'PRODUCT_CREATE',
      entityType: 'product',
      entityId: product.id,
      summary: `Created product ${product.sku} · ${product.name}`,
      meta: { sku: product.sku, opening: opening ? number(opening.quantity) : 0 },
    });

    return { product };
  });
}
