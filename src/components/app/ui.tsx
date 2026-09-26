/**
 * App-level display helpers. Pure presentation — safe from server and client
 * components alike, which keeps table markup consistent across every page.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { cx } from '@/components/ui/primitives';
import { accentOf } from '@/lib/format';

/* -------------------------------------------------------------- stat tiles */

export function StatTile({
  label,
  value,
  hint,
  icon,
  accent = 'indigo',
  href,
  footer,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  accent?: string;
  href?: string;
  footer?: ReactNode;
}) {
  const tone = accentOf(accent);
  const body = (
    <div className="surface p-4 transition-shadow hover:shadow-[var(--shadow-raise)]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11.5px] font-medium uppercase tracking-wider text-ink-400 dark:text-ink-500">{label}</p>
        {icon ? <span className={cx('flex h-8 w-8 items-center justify-center rounded-lg', tone.soft, tone.text)}>{icon}</span> : null}
      </div>
      <p className="tnum mt-2.5 text-[24px] font-semibold leading-none tracking-tight text-ink-900 dark:text-white">{value}</p>
      {hint ? <p className="mt-2 text-[12px] text-ink-500 dark:text-ink-400">{hint}</p> : null}
      {footer ? <div className="mt-3">{footer}</div> : null}
    </div>
  );
  return href ? (
    <Link href={href} className="focus-ring block rounded-[var(--radius-card)]">
      {body}
    </Link>
  ) : (
    body
  );
}

/* ------------------------------------------------------------------ tables */

export function Table({ children, minWidth = 720, className }: { children: ReactNode; minWidth?: number; className?: string }) {
  return (
    <div className={cx('overflow-x-auto', className)}>
      <table className="w-full border-collapse text-[13px] text-ink-700 dark:text-ink-200" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="border-b border-ink-200 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-400 dark:border-ink-800 dark:text-ink-500">
      {children}
    </thead>
  );
}

export function TH({ children, className, align = 'left' }: { children?: ReactNode; className?: string; align?: 'left' | 'right' | 'center' }) {
  return (
    <th
      className={cx('whitespace-nowrap px-3 py-2.5 font-semibold', align === 'right' && 'text-right', align === 'center' && 'text-center', className)}
    >
      {children}
    </th>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-ink-100 dark:divide-ink-800/70">{children}</tbody>;
}

export function TR({ children, className }: { children: ReactNode; className?: string }) {
  return <tr className={cx('transition-colors hover:bg-ink-50 dark:hover:bg-ink-800/40', className)}>{children}</tr>;
}

export function TD({ children, className, align = 'left', colSpan }: { children?: ReactNode; className?: string; align?: 'left' | 'right' | 'center'; colSpan?: number }) {
  return (
    <td
      colSpan={colSpan}
      className={cx('px-3 py-2.5 align-middle', align === 'right' && 'tnum text-right', align === 'center' && 'text-center', className)}
    >
      {children}
    </td>
  );
}

/* ------------------------------------------------------------------ misc */

export function MetaGrid({ items, columns = 4 }: { items: { label: ReactNode; value: ReactNode }[]; columns?: number }) {
  return (
    <dl className={cx('grid gap-x-6 gap-y-4', columns === 3 ? 'sm:grid-cols-3' : columns === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-4')}>
      {items.map((item, index) => (
        <div key={index} className="min-w-0">
          <dt className="text-[11px] font-medium uppercase tracking-wider text-ink-400 dark:text-ink-500">{item.label}</dt>
          <dd className="mt-1 truncate text-[13.5px] font-medium text-ink-800 dark:text-ink-100">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SectionCard({
  title,
  subtitle,
  action,
  children,
  bodyClassName,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
  className?: string;
}) {
  return (
    <section className={cx('surface flex flex-col', className)}>
      <header className="flex items-start justify-between gap-3 border-b border-ink-200/70 px-5 py-3.5 dark:border-ink-800">
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold tracking-tight text-ink-900 dark:text-white">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-[12px] text-ink-500 dark:text-ink-400">{subtitle}</p> : null}
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </header>
      <div className={cx('flex-1', bodyClassName ?? 'p-5')}>{children}</div>
    </section>
  );
}

export function Delta({ value, suffix = '', invert = false }: { value: number; suffix?: string; invert?: boolean }) {
  const positive = value > 0;
  const tone = value === 0 ? 'text-ink-400' : positive !== invert ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
  return (
    <span className={cx('tnum text-[12px] font-semibold', tone)}>
      {positive ? '+' : ''}
      {value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
      {suffix}
    </span>
  );
}

export function Dot({ tone }: { tone: string }) {
  return <span className={cx('inline-block h-2 w-2 shrink-0 rounded-full', accentOf(tone).chip)} />;
}

export function Legend({ items }: { items: { label: string; tone: string }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5 text-[11.5px] text-ink-500 dark:text-ink-400">
          <Dot tone={item.tone} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
