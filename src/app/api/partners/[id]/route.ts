import { apiCapability, body, flag, handle, HttpError, notFound, optionalText } from '@/lib/http';
import { deletePartner, getPartner, updatePartner } from '@/lib/repo/catalog';
import { PARTNER_KINDS, type PartnerKind } from '@/lib/domain/constants';
import { logActivity } from '@/lib/repo/activity';

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  return handle(async () => {
    const user = await apiCapability('manage_products');
    const { id } = await params;
    const current = getPartner(id);
    if (!current) notFound('That contact no longer exists.');

    const payload = await body<Record<string, unknown>>(request);
    const kind = optionalText(payload.kind);
    if (kind && !PARTNER_KINDS.includes(kind as PartnerKind)) {
      throw new HttpError('Pick a valid contact type.', 400, { kind: 'Invalid type' });
    }

    const partner = updatePartner(id, {
      name: payload.name === undefined ? undefined : String(payload.name).trim() || current.name,
      kind: (kind as PartnerKind | undefined) ?? undefined,
      contactName: payload.contactName === undefined ? undefined : optionalText(payload.contactName),
      email: payload.email === undefined ? undefined : optionalText(payload.email),
      phone: payload.phone === undefined ? undefined : optionalText(payload.phone),
      address: payload.address === undefined ? undefined : optionalText(payload.address),
      gstin: payload.gstin === undefined ? undefined : optionalText(payload.gstin),
      isActive: payload.isActive === undefined ? undefined : flag(payload.isActive, true) ? 1 : 0,
    });
    if (!partner) notFound('That contact no longer exists.');

    logActivity({
      userId: user.id,
      userName: user.name,
      action: 'PARTNER_UPDATE',
      entityType: 'partner',
      entityId: partner.id,
      summary: `Updated contact ${partner.name}`,
    });

    return { partner };
  });
}

export async function DELETE(_request: Request, { params }: Context) {
  return handle(async () => {
    const user = await apiCapability('manage_products');
    const { id } = await params;
    const partner = getPartner(id);
    if (!partner) notFound('That contact no longer exists.');

    const result = deletePartner(id);
    if (!result.ok) throw new HttpError(result.error ?? 'That contact could not be removed.');

    logActivity({
      userId: user.id,
      userName: user.name,
      action: 'PARTNER_DELETE',
      entityType: 'partner',
      entityId: id,
      summary: `Removed contact ${partner.name}`,
    });

    return { ok: true };
  });
}
