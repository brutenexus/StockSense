import { notFound, redirect } from 'next/navigation';
import { getDocument } from '@/lib/repo/documents';
import { documentHref } from '@/lib/domain/routes';

/** Opens a document when only its id is known (notification deep links). */
export default async function FindDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const document = getDocument(id);
  if (!document) notFound();
  redirect(documentHref(document.type, document.id));
}
