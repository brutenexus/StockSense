import { apiCapability, apiUser, body, handle, HttpError, optionalText, text } from '@/lib/http';
import { createCategory, listCategories } from '@/lib/repo/catalog';
import { logActivity } from '@/lib/repo/activity';

export async function GET() {
  return handle(async () => {
    await apiUser();
    return { items: listCategories() };
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const user = await apiCapability('manage_products');
    const payload = await body<Record<string, unknown>>(request);
    const name = text(payload.name, 'Category name');

    if (listCategories().some((category) => category.name.toLowerCase() === name.toLowerCase())) {
      throw new HttpError('A category with that name already exists.', 400, { name: 'Already exists' });
    }

    const category = createCategory({
      name,
      code: optionalText(payload.code),
      color: optionalText(payload.color) ?? 'slate',
      description: optionalText(payload.description),
    });

    logActivity({
      userId: user.id,
      userName: user.name,
      action: 'CATEGORY_CREATE',
      entityType: 'category',
      entityId: category.id,
      summary: `Created category ${category.name}`,
    });

    return { category };
  });
}
