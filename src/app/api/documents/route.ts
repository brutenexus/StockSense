import {
  apiUser,
  body,
  flag,
  forbidden,
  handle,
  HttpError,
  intParam,
  listParam,
  number,
  oneOf,
  optionalText,
  query,
  text,
  textParam,
} from '@/lib/http';
import { DOCUMENT_STATUSES, DOCUMENT_TYPES, TYPE_META, type DocumentStatus, type DocumentType } from '@/lib/domain/constants';
import { canCreateDocument } from '@/lib/domain/permissions';
import { firstError, validateDocument, type DocumentInput } from '@/lib/domain/validation';
import { createDocument, listDocuments, type DocumentFilters, type DocumentPayload } from '@/lib/repo/documents';
import { logActivity } from '@/lib/repo/activity';

export async function GET(request: Request) {
  return handle(async () => {
    await apiUser();
    const source = query(request);
    const type = textParam(source, 'type');
    const status = listParam(source, 'status');

    const result = listDocuments({
      type: type && DOCUMENT_TYPES.includes(type as never) ? (type as DocumentType) : 'ALL',
      status: status.length ? (status.filter((entry) => DOCUMENT_STATUSES.includes(entry as never)) as DocumentStatus[]) : 'ALL',
      warehouseId: textParam(source, 'warehouse'),
      partnerId: textParam(source, 'partner'),
      productId: textParam(source, 'product'),
      responsibleId: textParam(source, 'responsible'),
      search: textParam(source, 'q'),
      late: flag(textParam(source, 'late')),
      sort: (textParam(source, 'sort') as DocumentFilters['sort']) ?? 'created',
      direction: textParam(source, 'dir') === 'asc' ? 'asc' : 'desc',
      limit: intParam(source, 'limit', 40),
      offset: intParam(source, 'offset', 0),
    });

    return result;
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const user = await apiUser();
    const payload = await body<Record<string, unknown>>(request);
    const type = oneOf(payload.type, DOCUMENT_TYPES, 'Document type');
    if (!canCreateDocument(user.role, type)) forbidden(`Your role cannot create ${TYPE_META[type].plural.toLowerCase()}.`);

    const lines = Array.isArray(payload.lines) ? payload.lines : [];
    const input: DocumentInput = {
      type,
      warehouseId: text(payload.warehouseId, 'Warehouse'),
      fromLocationId: optionalText(payload.fromLocationId),
      toLocationId: optionalText(payload.toLocationId),
      partnerId: optionalText(payload.partnerId),
      partnerName: optionalText(payload.partnerName),
      scheduleDate: optionalText(payload.scheduleDate),
      responsibleId: optionalText(payload.responsibleId),
      operationType: optionalText(payload.operationType),
      address: optionalText(payload.address),
      priority: optionalText(payload.priority) ?? 'NORMAL',
      notes: optionalText(payload.notes),
      lines: lines.map((raw) => {
        const line = raw as Record<string, unknown>;
        const quantity = type === 'ADJUSTMENT' ? number(line.counted ?? line.quantity) : number(line.quantity);
        return {
          productId: String(line.productId ?? ''),
          quantity,
          counted: quantity,
          unitCost: line.unitCost === undefined ? undefined : number(line.unitCost),
          note: optionalText(line.note) ?? undefined,
        };
      }),
    };

    const validated = validateDocument(input);
    if (!validated.ok) throw new HttpError(firstError(validated), 400, validated.errors);

    const document = createDocument(toPayload(validated.value), user.id);
    logActivity({
      userId: user.id,
      userName: user.name,
      action: 'DOCUMENT_CREATE',
      entityType: 'document',
      entityId: document.id,
      summary: `Drafted ${document.reference} · ${TYPE_META[type].label}`,
      meta: { type, lines: lines.length },
    });

    return { document };
  });
}

export function toPayload(input: DocumentInput): DocumentPayload {
  return {
    type: input.type as DocumentType,
    warehouseId: input.warehouseId,
    fromLocationId: input.fromLocationId ?? null,
    toLocationId: input.toLocationId ?? null,
    partnerId: input.partnerId ?? null,
    partnerName: input.partnerName ?? null,
    scheduleDate: input.scheduleDate ?? null,
    responsibleId: input.responsibleId ?? null,
    operationType: input.operationType ?? null,
    address: input.address ?? null,
    priority: input.priority ?? 'NORMAL',
    notes: input.notes ?? null,
    lines: input.lines.map((line) => ({
      productId: line.productId,
      quantity: line.quantity,
      unitCost: line.unitCost,
      note: line.note ?? null,
    })),
  };
}

