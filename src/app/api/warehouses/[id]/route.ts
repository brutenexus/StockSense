import { apiCapability, body, flag, handle, HttpError, notFound, optionalText } from '@/lib/http';
import { deleteWarehouse, getWarehouse, updateWarehouse } from '@/lib/repo/warehouses';
import { logActivity } from '@/lib/repo/activity';

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  return handle(async () => {
    const user = await apiCapability('manage_warehouses');
    const { id } = await params;
    const current = getWarehouse(id);
    if (!current) notFound('That warehouse no longer exists.');

    const payload = await body<Record<string, unknown>>(request);
    const warehouse = updateWarehouse(id, {
      name: payload.name === undefined ? undefined : String(payload.name).trim() || current.name,
      shortCode: payload.shortCode === undefined ? undefined : String(payload.shortCode).trim().toUpperCase(),
      address: payload.address === undefined ? undefined : optionalText(payload.address),
      contactName: payload.contactName === undefined ? undefined : optionalText(payload.contactName),
      contactPhone: payload.contactPhone === undefined ? undefined : optionalText(payload.contactPhone),
      isActive: payload.isActive === undefined ? undefined : flag(payload.isActive, true) ? 1 : 0,
      isDefault: payload.isDefault === undefined ? undefined : flag(payload.isDefault) ? 1 : 0,
    });
    if (!warehouse) notFound('That warehouse no longer exists.');

    logActivity({
      userId: user.id,
      userName: user.name,
      action: 'WAREHOUSE_UPDATE',
      entityType: 'warehouse',
      entityId: warehouse.id,
      summary: `Updated warehouse ${warehouse.shortCode} · ${warehouse.name}`,
    });

    return { warehouse };
  });
}

export async function DELETE(_request: Request, { params }: Context) {
  return handle(async () => {
    const user = await apiCapability('manage_warehouses');
    const { id } = await params;
    const warehouse = getWarehouse(id);
    if (!warehouse) notFound('That warehouse no longer exists.');

    const result = deleteWarehouse(id);
    if (!result.ok) throw new HttpError(result.error ?? 'That warehouse could not be removed.');

    logActivity({
      userId: user.id,
      userName: user.name,
      action: 'WAREHOUSE_DELETE',
      entityType: 'warehouse',
      entityId: id,
      summary: `Removed warehouse ${warehouse.shortCode} · ${warehouse.name}`,
    });

    return { ok: true };
  });
}
