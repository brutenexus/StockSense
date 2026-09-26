import { apiCapability, apiUser, body, flag, handle, HttpError, listParam, optionalText, query, text } from '@/lib/http';
import { createLocation, listLocations } from '@/lib/repo/warehouses';
import { LOCATION_KINDS, type LocationKind } from '@/lib/domain/constants';
import { logActivity } from '@/lib/repo/activity';

export async function GET(request: Request) {
  return handle(async () => {
    await apiUser();
    const source = query(request);
    const warehouseIds = listParam(source, 'warehouse');
    const all = listLocations({ includeInactive: flag(source.get('includeInactive')) });
    return { items: warehouseIds.length ? all.filter((location) => warehouseIds.includes(location.warehouseId)) : all };
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const user = await apiCapability('manage_warehouses');
    const payload = await body<Record<string, unknown>>(request);
    const kind = optionalText(payload.kind) ?? 'INTERNAL';
    if (!LOCATION_KINDS.includes(kind as LocationKind)) {
      throw new HttpError('Pick a valid location type.', 400, { kind: 'Invalid type' });
    }
    const shortCode = text(payload.shortCode, 'Short code');

    const location = createLocation({
      warehouseId: text(payload.warehouseId, 'Warehouse'),
      name: text(payload.name, 'Location name'),
      shortCode,
      kind: kind as LocationKind,
      parentId: optionalText(payload.parentId),
      address: optionalText(payload.address),
    });

    logActivity({
      userId: user.id,
      userName: user.name,
      action: 'LOCATION_CREATE',
      entityType: 'location',
      entityId: location.id,
      summary: `Added location ${location.shortCode} · ${location.name}`,
    });

    return { location };
  });
}
