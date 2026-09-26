'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cx } from './primitives';

type ToastTone = 'success' | 'error' | 'info' | 'warning';
type Toast = { id: string; tone: ToastTone; title: string; description?: string };

type ToastApi = {
  push: (toast: Omit<Toast, 'id'>) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const TONES: Record<ToastTone, { ring: string; icon: ReactNode; accent: string }> = {
  success: { ring: 'ring-emerald-200 dark:ring-emerald-500/30', icon: <CheckCircle2 size={17} />, accent: 'text-emerald-600 dark:text-emerald-400' },
  error: { ring: 'ring-rose-200 dark:ring-rose-500/30', icon: <XCircle size={17} />, accent: 'text-rose-600 dark:text-rose-400' },
  warning: { ring: 'ring-amber-200 dark:ring-amber-500/30', icon: <AlertTriangle size={17} />, accent: 'text-amber-600 dark:text-amber-400' },
  info: { ring: 'ring-sky-200 dark:ring-sky-500/30', icon: <Info size={17} />, accent: 'text-sky-600 dark:text-sky-400' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: string) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((list) => [...list.slice(-3), { ...toast, id }]);
    },
    [],
  );

  const api = useMemo<ToastApi>(
    () => ({
      push,
      success: (title, description) => push({ tone: 'success', title, description }),
      error: (title, description) => push({ tone: 'error', title, description }),
      info: (title, description) => push({ tone: 'info', title, description }),
      warning: (title, description) => push({ tone: 'warning', title, description }),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,380px)] flex-col gap-2">
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={() => remove(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, toast.tone === 'error' ? 7000 : 4200);
    return () => clearTimeout(timer);
  }, [onDismiss, toast.tone]);

  const tone = TONES[toast.tone];
  return (
    <div
      role="status"
      className={cx(
        'pointer-events-auto flex items-start gap-3 rounded-xl border border-ink-200/70 bg-white/95 p-3.5 shadow-[var(--shadow-raise)] ring-1 backdrop-blur animate-[rise_0.2s_ease-out] dark:border-ink-800 dark:bg-ink-900/95',
        tone.ring,
      )}
    >
      <span className={cx('mt-0.5 shrink-0', tone.accent)}>{tone.icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-ink-900 dark:text-white">{toast.title}</p>
        {toast.description ? <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-500 dark:text-ink-400">{toast.description}</p> : null}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="text-ink-400 transition-colors hover:text-ink-700 dark:hover:text-ink-200"
      >
        <X size={15} />
      </button>
    </div>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}
