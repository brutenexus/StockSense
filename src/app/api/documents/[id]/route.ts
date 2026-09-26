import { apiUser, body, forbidden, handle, HttpError, notFound, number, optionalText } from '@/lib/http';
import { TYPE_META } from '@/lib/domain/constants';
import { canCreateDocument } from '@/lib/domain/permissions';
import { firstError, validateDocument, type DocumentInput } from '@/lib/domain/validation';
import { deleteDocument, getDocument, updateDocument } from '@/lib/repo/documents';
import { logActivity } from '@/lib/repo/activity';
import { toPayload } from '../route';

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  return handle(async () => {
    const user = await apiUser();
    const { id } = await params;
    const current = getDocument(id);
    if (!current) notFound('That document no longer exists.');
    if (!canCreateDocument(user.role, current.type)) forbidden(`Your role cannot edit ${TYPE_META[current.type].plural.toLowerCase()}.`);
    if (current.status === 'DONE') throw new HttpError('A validated document can no longer be edited.');

    const payload = await body<Record<string, unknown>>(request);
    const lines = Array.isArray(payload.lines) ? payload.lines : undefined;

    const input: DocumentInput = {
      type: current.type,
      warehouseId: optionalText(payload.warehouseId) ?? current.warehouseId,
      fromLocationId: payload.fromLocationId === undefined ? current.fromLocationId : optionalText(payload.fromLocationId),
      toLocationId: payload.toLocationId === undefined ? current.toLocationId : optionalText(payload.toLocationId),
      partnerId: payload.partnerId === undefined ? current.partnerId : optionalText(payload.partnerId),
      partnerName: payload.partnerName === undefined ? current.partnerName : optionalText(payload.partnerName),
      scheduleDate: payload.scheduleDate === undefined ? current.scheduleDate : optionalText(payload.scheduleDate),
      responsibleId: payload.responsibleId === undefined ? current.responsibleId : optionalText(payload.responsibleId),
      operationType: payload.operationType === undefined ? current.operationType : optionalText(payload.operationType),
      address: payload.address === undefined ? current.address : optionalText(payload.address),
      priority: optionalText(payload.priority) ?? current.priority,
      notes: payload.notes === undefined ? current.notes : optionalText(payload.notes),
      lines:
        lines?.map((raw) => {
          const line = raw as Record<string, unknown>;
          const quantity = current.type === 'ADJUSTMENT' ? number(line.counted ?? line.quantity) : number(line.quantity);
          return { productId: String(line.productId ?? ''), quantity, counted: quantity, unitCost: line.unitCost === undefined ? undefined : number(line.unitCost), note: optionalText(line.note) ?? undefined };
        }) ?? [],
    };

    const validated = validateDocument(input);
    if (!validated.ok) throw new HttpError(firstError(validated), 400, validated.errors);

    const document = updateDocument(id, toPayload(validated.value));
    if (!document) notFound('That document no longer exists.');

    logActivity({
      userId: user.id,
      userName: user.name,
      action: 'DOCUMENT_UPDATE',
      entityType: 'document',
      entityId: document.id,
      summary: `Updated ${document.reference}`,
    });

    return { document };
  });
}

export async function DELETE(_request: Request, { params }: Context) {
  return handle(async () => {
    const user = await apiUser();
    const { id } = await params;
    const current = getDocument(id);
    if (!current) notFound('That document no longer exists.');
    if (!canCreateDocument(user.role, current.type)) forbidden();
    if (current.status !== 'DRAFT' && current.status !== 'CANCELED') {
      throw new HttpError('Only draft or canceled documents can be deleted. Cancel it first.');
    }

    deleteDocument(id);
    logActivity({
      userId: user.id,
      userName: user.name,
      action: 'DOCUMENT_DELETE',
      entityType: 'document',
      entityId: id,
      summary: `Deleted ${current.reference}`,
    });

    return { ok: true };
  });
}
