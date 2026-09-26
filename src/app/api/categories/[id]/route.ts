import { apiCapability, body, handle, HttpError, notFound, optionalText } from '@/lib/http';
import { deleteCategory, getCategory, updateCategory } from '@/lib/repo/catalog';
import { logActivity } from '@/lib/repo/activity';

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  return handle(async () => {
    const user = await apiCapability('manage_products');
    const { id } = await params;
    const current = getCategory(id);
    if (!current) notFound('That category no longer exists.');

    const payload = await body<Record<string, unknown>>(request);
    const category = updateCategory(id, {
      name: payload.name === undefined ? undefined : String(payload.name).trim() || current.name,
      code: payload.code === undefined ? undefined : optionalText(payload.code),
      color: payload.color === undefined ? undefined : optionalText(payload.color) ?? current.color,
      description: payload.description === undefined ? undefined : optionalText(payload.description),
    });
    if (!category) notFound('That category no longer exists.');

    logActivity({
      userId: user.id,
      userName: user.name,
      action: 'CATEGORY_UPDATE',
      entityType: 'category',
      entityId: category.id,
      summary: `Updated category ${category.name}`,
    });

    return { category };
  });
}

export async function DELETE(_request: Request, { params }: Context) {
  return handle(async () => {
    const user = await apiCapability('manage_products');
    const { id } = await params;
    const category = getCategory(id);
    if (!category) notFound('That category no longer exists.');

    const result = deleteCategory(id);
    if (!result.ok) throw new HttpError(result.error ?? 'That category could not be removed.');

    logActivity({
      userId: user.id,
      userName: user.name,
      action: 'CATEGORY_DELETE',
      entityType: 'category',
      entityId: id,
      summary: `Removed category ${category.name}`,
    });

    return { ok: true };
  });
}
