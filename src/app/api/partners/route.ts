import { apiCapability, apiUser, body, handle, HttpError, optionalText, query, text } from '@/lib/http';
import { createPartner, listPartners } from '@/lib/repo/catalog';
import { PARTNER_KINDS, type PartnerKind } from '@/lib/domain/constants';
import { logActivity } from '@/lib/repo/activity';

export async function GET(request: Request) {
  return handle(async () => {
    await apiUser();
    const kind = query(request).get('kind');
    return {
      items: listPartners({
        kind: kind && PARTNER_KINDS.includes(kind as PartnerKind) ? (kind as PartnerKind) : undefined,
        search: query(request).get('q') ?? undefined,
        includeInactive: query(request).get('includeInactive') === '1',
      }),
    };
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const user = await apiCapability('manage_products');
    const payload = await body<Record<string, unknown>>(request);
    const kind = optionalText(payload.kind) ?? 'VENDOR';
    if (!PARTNER_KINDS.includes(kind as PartnerKind)) {
      throw new HttpError('Pick a valid contact type.', 400, { kind: 'Invalid type' });
    }

    const partner = createPartner({
      name: text(payload.name, 'Name'),
      kind: kind as PartnerKind,
      contactName: optionalText(payload.contactName),
      email: optionalText(payload.email),
      phone: optionalText(payload.phone),
      address: optionalText(payload.address),
      gstin: optionalText(payload.gstin),
    });

    logActivity({
      userId: user.id,
      userName: user.name,
      action: 'PARTNER_CREATE',
      entityType: 'partner',
      entityId: partner.id,
      summary: `Added ${kind === 'CUSTOMER' ? 'customer' : kind === 'VENDOR' ? 'vendor' : 'contact'} ${partner.name}`,
    });

    return { partner };
  });
}
