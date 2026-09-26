import { apiCapability, apiUser, body, flag, handle, HttpError, optionalText, text } from '@/lib/http';
import { createWarehouse, listWarehouses } from '@/lib/repo/warehouses';
import { logActivity } from '@/lib/repo/activity';

export async function GET() {
  return handle(async () => {
    await apiUser();
    return { items: listWarehouses(true) };
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const user = await apiCapability('manage_warehouses');
    const payload = await body<Record<string, unknown>>(request);
    const name = text(payload.name, 'Warehouse name');
    const shortCode = text(payload.shortCode, 'Short code').toUpperCase();
    if (!/^[A-Z0-9]{2,6}$/.test(shortCode)) {
      throw new HttpError('Short code must be 2–6 letters or digits.', 400, { shortCode: 'Use 2–6 letters or digits' });
    }

    const existing = listWarehouses(true).find((warehouse) => warehouse.shortCode === shortCode);
    if (existing) throw new HttpError('Another warehouse already uses that short code.', 400, { shortCode: 'Already in use' });

    const warehouse = createWarehouse({
      name,
      shortCode,
      address: optionalText(payload.address),
      contactName: optionalText(payload.contactName),
      contactPhone: optionalText(payload.contactPhone),
      isDefault: flag(payload.isDefault),
    });

    logActivity({
      userId: user.id,
      userName: user.name,
      action: 'WAREHOUSE_CREATE',
      entityType: 'warehouse',
      entityId: warehouse.id,
      summary: `Created warehouse ${warehouse.shortCode} · ${warehouse.name}`,
    });

    return { warehouse };
  });
}
