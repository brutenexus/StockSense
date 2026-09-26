import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cx } from './primitives';

export type TabItem = {
  value: string;
  label: string;
  count?: number;
  href: string;
  tone?: string;
};

/**
 * URL-driven tabs. Being links rather than client state means the filtered
 * view is server-rendered, shareable and survives a refresh.
 */
export function LinkTabs({ items, className, size = 'md' }: { items: TabItem[]; className?: string; size?: 'sm' | 'md' }) {
  return (
    <div className={cx('flex flex-wrap items-center gap-1', className)}>
      {items.map((item) => (
        <Link
          key={item.value}
          href={item.href}
          aria-current={item.count === undefined ? undefined : 'page'}
          className={cx(
            'focus-ring inline-flex items-center gap-1.5 rounded-lg font-medium transition-colors',
            size === 'sm' ? 'h-7 px-2.5 text-[12px]' : 'h-8.5 px-3 text-[13px]',
            item.tone === 'active'
              ? 'bg-ink-900 text-white shadow-sm dark:bg-white dark:text-ink-900'
              : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900 dark:text-ink-400 dark:hover:bg-ink-800 dark:hover:text-white',
          )}
        >
          {item.label}
          {item.count !== undefined ? (
            <span
              className={cx(
                'tnum rounded-full px-1.5 text-[11px] font-semibold',
                item.tone === 'active' ? 'bg-white/20 text-white dark:bg-ink-900/15 dark:text-ink-900' : 'bg-ink-200/80 text-ink-600 dark:bg-ink-800 dark:text-ink-300',
              )}
            >
              {item.count}
            </span>
          ) : null}
        </Link>
      ))}
    </div>
  );
}

export function Segmented({ items, className, size = 'md' }: { items: TabItem[]; className?: string; size?: 'sm' | 'md' }) {
  return (
    <div className={cx('inline-flex items-center gap-0.5 rounded-lg bg-ink-100 p-0.5 dark:bg-ink-800', className)}>
      {items.map((item) => (
        <Link
          key={item.value}
          href={item.href}
          title={item.label}
          className={cx(
            'focus-ring inline-flex items-center gap-1.5 rounded-[7px] font-medium transition-colors',
            size === 'sm' ? 'h-6.5 px-2 text-[11.5px]' : 'h-7.5 px-2.5 text-[12.5px]',
            item.tone === 'active'
              ? 'bg-white text-ink-900 shadow-sm dark:bg-ink-900 dark:text-white'
              : 'text-ink-500 hover:text-ink-800 dark:text-ink-400 dark:hover:text-ink-100',
          )}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  buildHref,
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  buildHref: (page: number) => string;
  className?: string;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (pageCount <= 1) {
    return <p className={cx('text-[12px] text-ink-500 dark:text-ink-400', className)}>{total} record{total === 1 ? '' : 's'}</p>;
  }
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const window = [page - 1, page, page + 1].filter((p) => p >= 1 && p <= pageCount);

  return (
    <div className={cx('flex flex-wrap items-center justify-between gap-3', className)}>
      <p className="tnum text-[12px] text-ink-500 dark:text-ink-400">
        Showing <span className="font-semibold text-ink-700 dark:text-ink-200">{from}–{to}</span> of {total}
      </p>
      <div className="flex items-center gap-1">
        <PageLink href={buildHref(Math.max(1, page - 1))} disabled={page === 1} label="Previous page">
          <ChevronLeft size={15} />
        </PageLink>
        {window[0] !== 1 ? (
          <>
            <PageLink href={buildHref(1)}>1</PageLink>
            {window[0]! > 2 ? <span className="px-1 text-ink-400">…</span> : null}
          </>
        ) : null}
        {window.map((p) => (
          <PageLink key={p} href={buildHref(p)} active={p === page}>
            {p}
          </PageLink>
        ))}
        {window[window.length - 1] !== pageCount ? (
          <>
            {window[window.length - 1]! < pageCount - 1 ? <span className="px-1 text-ink-400">…</span> : null}
            <PageLink href={buildHref(pageCount)}>{pageCount}</PageLink>
          </>
        ) : null}
        <PageLink href={buildHref(Math.min(pageCount, page + 1))} disabled={page === pageCount} label="Next page">
          <ChevronRight size={15} />
        </PageLink>
      </div>
    </div>
  );
}

function PageLink({
  href,
  children,
  active,
  disabled,
  label,
}: {
  href: string;
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  if (disabled) {
    return (
      <span aria-label={label} className="inline-flex h-7.5 min-w-7.5 cursor-not-allowed items-center justify-center rounded-lg px-2 text-[12.5px] text-ink-300 dark:text-ink-600">
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'focus-ring tnum inline-flex h-7.5 min-w-7.5 items-center justify-center rounded-lg px-2 text-[12.5px] font-medium transition-colors',
        active
          ? 'bg-brand-600 text-white shadow-sm'
          : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900 dark:text-ink-300 dark:hover:bg-ink-800 dark:hover:text-white',
      )}
    >
      {children}
    </Link>
  );
}
