'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button, IconButton, cx } from './primitives';

/** Renders children into document.body once mounted (portal-safe for SSR). */
function Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

function useLockBody(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  useLockBody(open);
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;
  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
        <button
          type="button"
          aria-label="Close dialog"
          onClick={onClose}
          className="fixed inset-0 cursor-default bg-ink-950/45 backdrop-blur-[2px] animate-[fade-in_0.2s_ease-out]"
        />
        <div
          role="dialog"
          aria-modal="true"
          className={cx(
            'relative z-10 my-auto w-full rounded-2xl border border-ink-200 bg-white shadow-[var(--shadow-pop)] animate-[pop_0.18s_ease-out] dark:border-ink-800 dark:bg-ink-900',
            widths[size],
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-ink-200/80 px-5 py-4 dark:border-ink-800">
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight text-ink-900 dark:text-white">{title}</h2>
              {subtitle ? <p className="mt-0.5 text-[12.5px] text-ink-500 dark:text-ink-400">{subtitle}</p> : null}
            </div>
            <IconButton label="Close" onClick={onClose}>
              <X size={17} />
            </IconButton>
          </div>
          <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
          {footer ? (
            <div className="flex items-center justify-end gap-2 border-t border-ink-200/80 px-5 py-3.5 dark:border-ink-800">{footer}</div>
          ) : null}
        </div>
      </div>
    </Portal>
  );
}

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 'max-w-md',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useLockBody(open);
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);
  if (!open) return null;

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex justify-end">
        <button type="button" aria-label="Close panel" onClick={onClose} className="absolute inset-0 cursor-default bg-ink-950/40 backdrop-blur-[2px]" />
        <aside
          className={cx(
            'relative z-10 flex h-full w-full flex-col border-l border-ink-200 bg-white shadow-[var(--shadow-pop)] animate-[rise_0.22s_ease-out] dark:border-ink-800 dark:bg-ink-900',
            width,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-ink-200/80 px-5 py-4 dark:border-ink-800">
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight text-ink-900 dark:text-white">{title}</h2>
              {subtitle ? <p className="mt-0.5 text-[12.5px] text-ink-500 dark:text-ink-400">{subtitle}</p> : null}
            </div>
            <IconButton label="Close" onClick={onClose}>
              <X size={17} />
            </IconButton>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer ? <div className="flex items-center justify-end gap-2 border-t border-ink-200/80 px-5 py-3.5 dark:border-ink-800">{footer}</div> : null}
        </aside>
      </div>
    </Portal>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  tone = 'primary',
  onConfirm,
  onCancel,
  loading,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  tone?: 'primary' | 'danger' | 'success';
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant={tone} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-[13.5px] leading-relaxed text-ink-600 dark:text-ink-300">{description}</p>
    </Modal>
  );
}

/* --------------------------------------------------------------- dropdown */

export function Dropdown({
  trigger,
  children,
  align = 'right',
  className,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: ReactNode | ((props: { close: () => void }) => ReactNode);
  align?: 'left' | 'right';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((value) => !value) })}
      {open ? (
        <div
          className={cx(
            'absolute z-40 mt-2 min-w-[210px] overflow-hidden rounded-xl border border-ink-200 bg-white p-1 shadow-[var(--shadow-raise)] animate-[pop_0.14s_ease-out] dark:border-ink-700 dark:bg-ink-900',
            align === 'right' ? 'right-0' : 'left-0',
            className,
          )}
        >
          {typeof children === 'function' ? children({ close }) : children}
        </div>
      ) : null}
    </div>
  );
}

export function MenuItem({
  icon,
  children,
  onClick,
  tone = 'default',
  disabled,
  hint,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onClick?: () => void;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  hint?: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45',
        tone === 'danger'
          ? 'text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10'
          : 'text-ink-700 hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800',
      )}
    >
      {icon ? <span className="text-ink-400">{icon}</span> : null}
      <span className="flex-1">{children}</span>
      {hint ? <span className="text-[11px] text-ink-400">{hint}</span> : null}
    </button>
  );
}
