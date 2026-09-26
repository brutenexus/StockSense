import { apiCapability, body, flag, handle, HttpError, notFound, optionalText } from '@/lib/http';
import { deleteLocation, getLocation, updateLocation } from '@/lib/repo/warehouses';
import { LOCATION_KINDS, type LocationKind } from '@/lib/domain/constants';
import { logActivity } from '@/lib/repo/activity';

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  return handle(async () => {
    const user = await apiCapability('manage_warehouses');
    const { id } = await params;
    const current = getLocation(id);
    if (!current) notFound('That location no longer exists.');

    const payload = await body<Record<string, unknown>>(request);
    const kind = optionalText(payload.kind);
    if (kind && !LOCATION_KINDS.includes(kind as LocationKind)) {
      throw new HttpError('Pick a valid location type.', 400, { kind: 'Invalid type' });
    }

    const location = updateLocation(id, {
      name: payload.name === undefined ? undefined : String(payload.name).trim() || current.name,
      shortCode: payload.shortCode === undefined ? undefined : String(payload.shortCode).trim(),
      kind: (kind as LocationKind | undefined) ?? undefined,
      address: payload.address === undefined ? undefined : optionalText(payload.address),
      isActive: payload.isActive === undefined ? undefined : flag(payload.isActive, true) ? 1 : 0,
    });
    if (!location) notFound('That location no longer exists.');

    logActivity({
      userId: user.id,
      userName: user.name,
      action: 'LOCATION_UPDATE',
      entityType: 'location',
      entityId: location.id,
      summary: `Updated location ${location.shortCode}`,
    });

    return { location };
  });
}

export async function DELETE(_request: Request, { params }: Context) {
  return handle(async () => {
    const user = await apiCapability('manage_warehouses');
    const { id } = await params;
    const location = getLocation(id);
    if (!location) notFound('That location no longer exists.');

    const result = deleteLocation(id);
    if (!result.ok) throw new HttpError(result.error ?? 'That location could not be removed.');

    logActivity({
      userId: user.id,
      userName: user.name,
      action: 'LOCATION_DELETE',
      entityType: 'location',
      entityId: id,
      summary: `Removed location ${location.shortCode}`,
    });

    return { ok: true };
  });
}
