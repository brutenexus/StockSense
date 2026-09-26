/**
 * Document references.
 *
 * Mock-up spec: `<Warehouse>/<Operation>/<ID>` — e.g. `WH/IN/0001`,
 * `WH/OUT/0002`. `Warehouse` is the warehouse short code, `Operation` is the
 * IN/OUT/INT/ADJ segment and `ID` is a per-(warehouse, operation) auto
 * incremented counter, zero padded to keep lists readable.
 */
import { TYPE_META, type DocumentType } from './constants';

export const REFERENCE_PAD = 4;

/** Operation segments allowed in a reference — the same codes we generate. */
const OPERATION_SEGMENTS = new Set(['IN', 'OUT', 'INT', 'ADJ']);

const WAREHOUSE_RE = /^[A-Z0-9]{1,8}$/;
const SEQUENCE_RE = /^[0-9]{3,8}$/;

export function counterKey(warehouseShortCode: string, type: DocumentType): string {
  return `${warehouseShortCode.toUpperCase()}/${TYPE_META[type].refCode}`;
}

export function formatReference(
  warehouseShortCode: string,
  type: DocumentType,
  sequence: number,
  pad = REFERENCE_PAD,
): string {
  const code = (warehouseShortCode || 'WH').toUpperCase().replace(/[^A-Z0-9]/g, '') || 'WH';
  const id = String(Math.max(1, Math.floor(sequence))).padStart(pad, '0');
  return `${code}/${TYPE_META[type].refCode}/${id}`;
}

/**
 * Splits on the separators rather than matching one compound pattern: there is
 * nothing to escape, and a malformed fragment fails loudly instead of quietly
 * shifting the capture groups.
 */
export function parseReference(reference: string): { warehouse: string; op: string; id: number } | null {
  const parts = (reference || '').split('/');
  if (parts.length !== 3) return null;
  const [warehouse, op, id] = parts as [string, string, string];
  if (!WAREHOUSE_RE.test(warehouse)) return null;
  if (!OPERATION_SEGMENTS.has(op)) return null;
  if (!SEQUENCE_RE.test(id)) return null;
  return { warehouse, op, id: Number(id) };
}

export function isValidReference(reference: string): boolean {
  return parseReference(reference) !== null;
}

/** Human label for the counter segment, used in settings/tooltips. */
export function operationLabel(type: DocumentType): string {
  return TYPE_META[type].refCode;
}
