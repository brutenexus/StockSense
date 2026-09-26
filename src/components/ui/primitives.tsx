/**
 * Presentational primitives.
 *
 * Intentionally free of `'use client'` and React hooks so both server and
 * client components can compose them without dragging a boundary along.
 */
import clsx from 'clsx';
import type { ReactNode } from 'react';
import { STATUS_META, type DocumentStatus } from '@/lib/domain/constants';
import { accentOf, initials, statusTone } from '@/lib/format';

export const cx = clsx;

/* ------------------------------------------------------------- button */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'outline';
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800 disabled:bg-brand-300 dark:disabled:bg-brand-900',
  secondary:
    'bg-ink-100 text-ink-700 hover:bg-ink-200 active:bg-ink-300 dark:bg-ink-800 dark:text-ink-100 dark:hover:bg-ink-700',
  outline:
    'border border-ink-300 bg-white text-ink-700 hover:bg-ink-50 hover:border-ink-400 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100 dark:hover:bg-ink-800',
  ghost: 'text-ink-600 hover:bg-ink-100 hover:text-ink-900 dark:text-ink-300 dark:hover:bg-ink-800 dark:hover:text-white',
  danger: 'bg-rose-600 text-white shadow-sm hover:bg-rose-700 active:bg-rose-800 disabled:bg-rose-300',
  success: 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 active:bg-emerald-800 disabled:bg-emerald-300',
};

const SIZES: Record<ButtonSize, string> = {
  xs: 'h-7 gap-1.5 rounded-md px-2 text-xs',
  sm: 'h-8.5 gap-1.5 rounded-lg px-3 text-[13px]',
  md: 'h-10 gap-2 rounded-lg px-4 text-sm',
  lg: 'h-11 gap-2 rounded-xl px-5 text-sm',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  icon,
  trailing,
  loading,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  trailing?: ReactNode;
  loading?: boolean;
}) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={cx(
        'focus-ring inline-flex select-none items-center justify-center font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-70',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    >
      {loading ? <Spinner size={size === 'xs' || size === 'sm' ? 13 : 15} /> : icon}
      {children}
      {trailing}
    </button>
  );
}

export function IconButton({
  className,
  label,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      className={cx(
        'focus-ring inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 dark:text-ink-400 dark:hover:bg-ink-800 dark:hover:text-white',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={cx('animate-spin', className)}
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" fill="none" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/* ------------------------------------------------------------- surfaces */

export function Card({
  className,
  children,
  as: Tag = 'div',
  ...rest
}: { className?: string; children: ReactNode; as?: 'div' | 'section' | 'article' } & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag {...rest} className={cx('surface', className)}>
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  icon,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('flex items-start justify-between gap-4 border-b border-ink-200/70 px-5 py-4 dark:border-ink-800', className)}>
      <div className="flex items-start gap-3">
        {icon ? <div className="mt-0.5 text-ink-400">{icon}</div> : null}
        <div>
          <h3 className="text-[15px] font-semibold tracking-tight text-ink-900 dark:text-white">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-[13px] text-ink-500 dark:text-ink-400">{subtitle}</p> : null}
        </div>
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  breadcrumb,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {breadcrumb ? <div className="mb-1 text-xs text-ink-500 dark:text-ink-400">{breadcrumb}</div> : null}
        {eyebrow ? (
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-600 dark:text-brand-400">{eyebrow}</div>
        ) : null}
        <h1 className="truncate text-[22px] font-semibold tracking-tight text-ink-900 dark:text-white">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink-500 dark:text-ink-400">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('flex flex-col items-center justify-center gap-2 px-6 py-14 text-center', className)}>
      {icon ? (
        <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-ink-100 text-ink-400 dark:bg-ink-800 dark:text-ink-500">
          {icon}
        </div>
      ) : null}
      <p className="text-sm font-semibold text-ink-800 dark:text-ink-100">{title}</p>
      {description ? <p className="max-w-sm text-[13px] text-ink-500 dark:text-ink-400">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton h-4 w-full', className)} />;
}

/* ---------------------------------------------------------------- inputs */

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
  htmlFor,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      {label ? (
        <label htmlFor={htmlFor} className="text-[12.5px] font-medium text-ink-700 dark:text-ink-200">
          {label}
          {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="text-[12px] font-medium text-rose-600 dark:text-rose-400">{error}</p>
      ) : hint ? (
        <p className="text-[12px] text-ink-500 dark:text-ink-400">{hint}</p>
      ) : null}
    </div>
  );
}

const CONTROL =
  'w-full rounded-lg border border-ink-300 bg-white px-3 text-sm text-ink-900 placeholder:text-ink-400 transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 focus:outline-none disabled:cursor-not-allowed disabled:bg-ink-100 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50 dark:placeholder:text-ink-500 dark:disabled:bg-ink-800';

export function Input({ className, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cx(CONTROL, 'h-10', className)} />;
}

export function Textarea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={cx(CONTROL, 'min-h-[84px] py-2 leading-relaxed', className)} />;
}

export function Select({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={cx(CONTROL, 'h-10 cursor-pointer appearance-none bg-[length:16px] pr-9', className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 0.6rem center',
        ...rest.style,
      }}
    >
      {children}
    </select>
  );
}

export function Checkbox({ className, label, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode }) {
  return (
    <label className={cx('inline-flex cursor-pointer select-none items-center gap-2 text-[13px] text-ink-700 dark:text-ink-200', className)}>
      <input
        type="checkbox"
        {...rest}
        className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-2 focus:ring-brand-500/40 dark:border-ink-600 dark:bg-ink-800"
      />
      {label}
    </label>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label?: ReactNode }) {
  return (
    <label className="inline-flex cursor-pointer select-none items-center gap-2.5 text-[13px] text-ink-700 dark:text-ink-200">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx(
          'focus-ring relative h-5.5 w-10 shrink-0 rounded-full transition-colors',
          checked ? 'bg-brand-600' : 'bg-ink-300 dark:bg-ink-700',
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white shadow-sm transition-all',
            checked ? 'left-5' : 'left-0.5',
          )}
        />
      </button>
      {label}
    </label>
  );
}

/* ----------------------------------------------------------------- badges */

export function Badge({
  tone = 'neutral',
  className,
  children,
  dot,
}: {
  tone?: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'violet';
  className?: string;
  children: ReactNode;
  dot?: boolean;
}) {
  const tones: Record<string, string> = {
    neutral: 'bg-ink-100 text-ink-700 ring-ink-200 dark:bg-ink-800 dark:text-ink-200 dark:ring-ink-700',
    brand: 'bg-brand-50 text-brand-700 ring-brand-200 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-500/30',
    success: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30',
    warning: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30',
    danger: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30',
    info: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/30',
    violet: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-500/30',
  };
  const dots: Record<string, string> = {
    neutral: 'bg-ink-400',
    brand: 'bg-brand-500',
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    danger: 'bg-rose-500',
    info: 'bg-sky-500',
    violet: 'bg-violet-500',
  };
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-medium ring-1 ring-inset',
        tones[tone],
        className,
      )}
    >
      {dot ? <span className={cx('h-1.5 w-1.5 rounded-full', dots[tone])} /> : null}
      {children}
    </span>
  );
}

export function StatusPill({ status, className }: { status: DocumentStatus | string; className?: string }) {
  const meta = STATUS_META[status as DocumentStatus];
  return (
    <span
      title={meta?.hint}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-semibold ring-1 ring-inset',
        statusTone(status),
        className,
      )}
    >
      {meta?.label ?? status}
    </span>
  );
}

export function HealthPill({ health }: { health: 'HEALTHY' | 'LOW_STOCK' | 'OUT_OF_STOCK' }) {
  if (health === 'OUT_OF_STOCK') return <Badge tone="danger" dot>Out of stock</Badge>;
  if (health === 'LOW_STOCK') return <Badge tone="warning" dot>Low stock</Badge>;
  return <Badge tone="success" dot>In stock</Badge>;
}

export function Avatar({ name, accent = 'indigo', size = 32 }: { name: string; accent?: string | null; size?: number }) {
  const tone = accentOf(accent ?? 'indigo');
  return (
    <span
      className={cx('inline-flex shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-white', tone.chip)}
      style={{ width: size, height: size }}
    >
      {initials(name)}
    </span>
  );
}

export function ProgressBar({ value, tone = 'bg-brand-500', className }: { value: number; tone?: string; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-ink-200 dark:bg-ink-800', className)}>
      <div className={cx('h-full rounded-full transition-[width]', tone)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Divider({ className, label }: { className?: string; label?: string }) {
  if (!label) return <div className={cx('h-px w-full bg-ink-200 dark:bg-ink-800', className)} />;
  return (
    <div className={cx('flex items-center gap-3', className)}>
      <div className="h-px flex-1 bg-ink-200 dark:bg-ink-800" />
      <span className="text-[11px] font-medium uppercase tracking-wider text-ink-400">{label}</span>
      <div className="h-px flex-1 bg-ink-200 dark:bg-ink-800" />
    </div>
  );
}

export function KeyValue({ label, value, className }: { label: ReactNode; value: ReactNode; className?: string }) {
  return (
    <div className={cx('flex flex-col gap-0.5', className)}>
      <span className="text-[11px] font-medium uppercase tracking-wider text-ink-400 dark:text-ink-500">{label}</span>
      <span className="text-[13.5px] font-medium text-ink-800 dark:text-ink-100">{value}</span>
    </div>
  );
}

export function Tooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <span className="group/tt relative inline-flex">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-ink-900 px-2 py-1 text-[11.5px] font-medium text-white shadow-lg group-hover/tt:block dark:bg-ink-700">
        {content}
      </span>
    </span>
  );
}
