/** Presentation helpers. Safe to import from client components. */
import { STATUS_META, type DocumentStatus } from './domain/constants';

export const CURRENCY = 'Rs';

export function formatMoney(value: number | null | undefined, options?: { compact?: boolean }): string {
  const n = Number(value ?? 0);
  if (options?.compact) {
    const abs = Math.abs(n);
    if (abs >= 1_00_00_000) return `${CURRENCY} ${(n / 1_00_00_000).toFixed(2)}Cr`;
    if (abs >= 1_00_000) return `${CURRENCY} ${(n / 1_00_000).toFixed(2)}L`;
    if (abs >= 1_000) return `${CURRENCY} ${(n / 1_000).toFixed(1)}K`;
  }
  return `${CURRENCY} ${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export function formatQty(value: number | null | undefined, uom?: string | null): string {
  const n = Number(value ?? 0);
  const rendered = Number.isInteger(n) ? n.toLocaleString('en-IN') : n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  return uom ? `${rendered} ${uom}` : rendered;
}

export function formatNumber(value: number | null | undefined): string {
  return Number(value ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

export function formatPercent(value: number, digits = 1): string {
  return `${Number(value ?? 0).toFixed(digits)}%`;
}

export function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: string | Date | null | undefined, fallback = '—'): string {
  const date = toDate(value);
  if (!date) return fallback;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateShort(value: string | Date | null | undefined, fallback = '—'): string {
  const date = toDate(value);
  if (!date) return fallback;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

export function formatDateTime(value: string | Date | null | undefined, fallback = '—'): string {
  const date = toDate(value);
  if (!date) return fallback;
  return `${formatDate(date)} · ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

export function formatTime(value: string | Date | null | undefined, fallback = '—'): string {
  const date = toDate(value);
  if (!date) return fallback;
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function relativeTime(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return '—';
  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 365 * 24 * 3600_000],
    ['month', 30 * 24 * 3600_000],
    ['day', 24 * 3600_000],
    ['hour', 3600_000],
    ['minute', 60_000],
    ['second', 1000],
  ];
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  for (const [unit, ms] of units) {
    if (abs >= ms || unit === 'second') {
      return formatter.format(Math.round(diff / ms), unit);
    }
  }
  return 'just now';
}

export function isoDateInput(value: string | Date | null | undefined): string {
  const date = toDate(value) ?? new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export function todayInput(): string {
  return isoDateInput(new Date());
}

export function isOverdue(scheduleDate: string | null | undefined, status: DocumentStatus | string): boolean {
  const date = toDate(scheduleDate);
  if (!date) return false;
  if (status === 'DONE' || status === 'CANCELED') return false;
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  return date.getTime() < endOfToday.getTime();
}

/** Tailwind class bundles per status tone, matching the design tokens. */
export const TONE_CLASS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800/70 dark:text-slate-300 dark:ring-slate-700',
  waiting: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30',
  ready: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/30',
  done: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30',
  canceled: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30',
};

export const ACCENT_CLASS: Record<string, { chip: string; bar: string; text: string; soft: string }> = {
  indigo: { chip: 'bg-indigo-500', bar: 'bg-indigo-500', text: 'text-indigo-600 dark:text-indigo-400', soft: 'bg-indigo-50 dark:bg-indigo-500/10' },
  sky: { chip: 'bg-sky-500', bar: 'bg-sky-500', text: 'text-sky-600 dark:text-sky-400', soft: 'bg-sky-50 dark:bg-sky-500/10' },
  emerald: { chip: 'bg-emerald-500', bar: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', soft: 'bg-emerald-50 dark:bg-emerald-500/10' },
  amber: { chip: 'bg-amber-500', bar: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400', soft: 'bg-amber-50 dark:bg-amber-500/10' },
  rose: { chip: 'bg-rose-500', bar: 'bg-rose-500', text: 'text-rose-600 dark:text-rose-400', soft: 'bg-rose-50 dark:bg-rose-500/10' },
  violet: { chip: 'bg-violet-500', bar: 'bg-violet-500', text: 'text-violet-600 dark:text-violet-400', soft: 'bg-violet-50 dark:bg-violet-500/10' },
  teal: { chip: 'bg-teal-500', bar: 'bg-teal-500', text: 'text-teal-600 dark:text-teal-400', soft: 'bg-teal-50 dark:bg-teal-500/10' },
  orange: { chip: 'bg-orange-500', bar: 'bg-orange-500', text: 'text-orange-600 dark:text-orange-400', soft: 'bg-orange-50 dark:bg-orange-500/10' },
  slate: { chip: 'bg-slate-500', bar: 'bg-slate-500', text: 'text-slate-600 dark:text-slate-300', soft: 'bg-slate-100 dark:bg-slate-500/10' },
};

export function statusTone(status: string): string {
  const meta = STATUS_META[status as DocumentStatus];
  return TONE_CLASS[meta?.tone ?? 'draft'] ?? TONE_CLASS.draft;
}

export function accentOf(name: string | null | undefined) {
  return ACCENT_CLASS[name ?? 'slate'] ?? ACCENT_CLASS.slate;
}

export function initials(name: string): string {
  return (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return `${count} ${count === 1 ? singular : plural ?? `${singular}s`}`;
}

export function csvEscape(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: Record<string, unknown>[], headers?: string[]): string {
  if (!rows.length) return (headers ?? []).join(',');
  const cols = headers ?? Object.keys(rows[0]!);
  const body = rows.map((row) => cols.map((col) => csvEscape(row[col])).join(','));
  return [cols.join(','), ...body].join('\n');
}

export function download(filename: string, content: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
