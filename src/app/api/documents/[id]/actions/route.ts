import { apiUser, body, handle, HttpError, notFound, oneOf } from '@/lib/http';
import { TYPE_META } from '@/lib/domain/constants';
import { canCancelDocument, canCreateDocument, canValidateDocument } from '@/lib/domain/permissions';
import { cancelDocument, confirmDocument, getDocument, resetToDraft, validateDocument } from '@/lib/repo/documents';
import { logActivity, syncStockAlerts } from '@/lib/repo/activity';

const ACTIONS = ['confirm', 'validate', 'cancel', 'reset'] as const;
type Action = (typeof ACTIONS)[number];

const LABEL: Record<Action, string> = {
  confirm: 'confirmed',
  validate: 'validated',
  cancel: 'canceled',
  reset: 'returned to draft',
};

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  return handle(async () => {
    const user = await apiUser();
    const { id } = await params;
    const document = getDocument(id);
    if (!document) notFound('That document no longer exists.');

    const payload = await body<{ action?: string }>(request);
    const action = oneOf(payload.action, ACTIONS, 'Action') as Action;

    // Confirm is the floor: whoever may raise the document — or validate it —
    // may move it along. Validating stays a sign-off reserved for managers.
    const allowed =
      action === 'validate'
        ? canValidateDocument(user.role, document.type)
        : action === 'cancel'
          ? canCancelDocument(user.role)
          : canCreateDocument(user.role, document.type) || canValidateDocument(user.role, document.type);

    if (!allowed) {
      throw new HttpError(`Your role cannot ${action} ${TYPE_META[document.type].plural.toLowerCase()}.`, 403);
    }

    let updated = document;
    let moves = 0;
    let promoted: string[] = [];

    if (action === 'confirm') {
      updated = confirmDocument(document.id, user.id);
    } else if (action === 'validate') {
      const result = validateDocument(document.id, user.id);
      updated = result.document;
      moves = result.moves;
      // Receipts and adjustments can unblock deliveries that were waiting on stock.
      // (`validateDocument` already promotes the worklist; this only reports it.)
      promoted = [];
      syncStockAlerts();
    } else if (action === 'cancel') {
      updated = cancelDocument(document.id, user.id);
    } else {
      updated = resetToDraft(document.id, user.id);
    }

    logActivity({
      userId: user.id,
      userName: user.name,
      action: `DOCUMENT_${action.toUpperCase()}`,
      entityType: 'document',
      entityId: updated.id,
      summary: `${updated.reference} ${LABEL[action]} by ${user.name}`,
      meta: { status: updated.status, moves },
    });

    return { document: updated, moves, promoted };
  });
}
