import { DOCUMENT_TYPES, type DocumentType } from './constants';

/** URL segments for the operations area: /operations/<segment>. */
export const TYPE_SEGMENTS: Record<DocumentType, string> = {
  RECEIPT: 'receipts',
  DELIVERY: 'deliveries',
  TRANSFER: 'transfers',
  ADJUSTMENT: 'adjustments',
};

const ALIASES: Record<string, DocumentType> = {
  receipt: 'RECEIPT',
  receipts: 'RECEIPT',
  delivery: 'DELIVERY',
  deliveries: 'DELIVERY',
  transfer: 'TRANSFER',
  transfers: 'TRANSFER',
  adjustment: 'ADJUSTMENT',
  adjustments: 'ADJUSTMENT',
  count: 'ADJUSTMENT',
  counts: 'ADJUSTMENT',
};

export function documentTypeFromSegment(segment: string | undefined): DocumentType | null {
  if (!segment) return null;
  return ALIASES[segment.toLowerCase()] ?? null;
}

export function documentHref(type: DocumentType, id: string): string {
  return `/operations/${TYPE_SEGMENTS[type]}/${id}`;
}

export function isDocumentType(value: unknown): value is DocumentType {
  return typeof value === 'string' && DOCUMENT_TYPES.includes(value as DocumentType);
}
