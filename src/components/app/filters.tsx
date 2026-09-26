'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Download, Printer, Search, X } from 'lucide-react';
import { Button, IconButton, Select, cx } from '@/components/ui/primitives';
import { download, toCsv } from '@/lib/format';

/** Merge a param change into the current URL — filters always live in the URL. */
function useParamWriter() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  return (changes: Record<string, string | undefined>, options: { resetPage?: boolean } = { resetPage: true }) => {
    const params = new URLSearchParams(search.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined || value === '') params.delete(key);
      else params.set(key, value);
    }
    if (options.resetPage) params.delete('page');
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };
}

export function SearchField({
  placeholder = 'Search…',
  paramKey = 'q',
  className,
  debounce = 320,
}: {
  placeholder?: string;
  paramKey?: string;
  className?: string;
  debounce?: number;
}) {
  const search = useSearchParams();
  const write = useParamWriter();
  const [value, setValue] = useState(search.get(paramKey) ?? '');
  const current = search.get(paramKey) ?? '';

  useEffect(() => {
    setValue(current);
  }, [current]);

  useEffect(() => {
    if (value === current) return;
    const timer = setTimeout(() => write({ [paramKey]: value.trim() || undefined }), debounce);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <form
      className={cx('relative', className)}
      onSubmit={(event) => {
        event.preventDefault();
        write({ [paramKey]: value.trim() || undefined });
      }}
    >
      <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="focus-ring h-9.5 w-full rounded-lg border border-ink-200 bg-white pl-8.5 pr-8 text-[13px] text-ink-800 placeholder:text-ink-400 focus:border-brand-400 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100"
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setValue('');
            write({ [paramKey]: undefined });
          }}
          className="focus-ring absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-ink-400 hover:text-ink-700 dark:hover:text-ink-200"
        >
          <X size={13} />
        </button>
      ) : null}
    </form>
  );
}

export function FilterSelect({
  paramKey,
  options,
  allLabel = 'All',
  className,
  ariaLabel,
}: {
  paramKey: string;
  options: { value: string; label: string }[];
  allLabel?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const search = useSearchParams();
  const write = useParamWriter();
  const value = search.get(paramKey) ?? '';

  return (
    <Select
      aria-label={ariaLabel ?? allLabel}
      className={cx('h-9.5 w-auto min-w-[9.5rem] text-[13px]', className)}
      value={value}
      onChange={(event) => write({ [paramKey]: event.target.value || undefined })}
    >
      <option value="">{allLabel}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select>
  );
}

export function FilterToggle({
  paramKey,
  label,
  icon,
  tone = 'warning',
}: {
  paramKey: string;
  label: string;
  icon?: React.ReactNode;
  tone?: 'warning' | 'brand';
}) {
  const search = useSearchParams();
  const write = useParamWriter();
  const active = search.get(paramKey) === '1';

  return (
    <Button
      size="sm"
      variant={active ? (tone === 'warning' ? 'secondary' : 'primary') : 'outline'}
      icon={icon}
      onClick={() => write({ [paramKey]: active ? undefined : '1' })}
      className={active && tone === 'warning' ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300' : undefined}
    >
      {label}
    </Button>
  );
}

export function ExportButton({
  rows,
  filename,
  label = 'Export CSV',
}: {
  rows: Record<string, unknown>[];
  filename: string;
  label?: string;
}) {
  return (
    <Button
      size="sm"
      variant="outline"
      icon={<Download size={14} />}
      disabled={rows.length === 0}
      onClick={() => download(filename, toCsv(rows))}
    >
      {label}
    </Button>
  );
}

export function PrintButton({ label = 'Print' }: { label?: string }) {
  return (
    <Button size="sm" variant="outline" icon={<Printer size={14} />} onClick={() => window.print()} className="no-print">
      {label}
    </Button>
  );
}

/** A remembered filter summary that can be cleared in one click. */
export function ActiveFilters({ labels }: { labels: { key: string; label: string }[] }) {
  const search = useSearchParams();
  const write = useParamWriter();
  const active = labels.filter((entry) => search.get(entry.key));
  const term = search.get('q');

  if (!active.length && !term) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {term ? (
        <Chip label={`“${term}”`} onClear={() => write({ q: undefined })} />
      ) : null}
      {active.map((entry) => (
        <Chip key={entry.key} label={entry.label} onClear={() => write({ [entry.key]: undefined })} />
      ))}
    </div>
  );
}

function Chip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 py-1 pl-2.5 pr-1 text-[11.5px] font-medium text-brand-700 ring-1 ring-inset ring-brand-200 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-500/30">
      {label}
      <IconButton label={`Clear ${label}`} onClick={onClear} className="h-5 w-5">
        <X size={12} />
      </IconButton>
    </span>
  );
}

/** Focus-on-mount helper used by "?new=1" links so the dialog is ready to use. */
export function useAutoFocus(active: boolean) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (active) ref.current?.focus();
  }, [active]);
  return ref;
}
