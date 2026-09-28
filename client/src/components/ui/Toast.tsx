import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Icon, type IconName } from '@/components/icons';
import { cn } from '@/lib/cn';

export type ToastVariant = 'success' | 'info' | 'warning' | 'danger';
export type ToastInput = { variant: ToastVariant; title: string; description?: string };
export type ToastRecord = ToastInput & { id: string };

type ToastContextValue = {
  push: (toast: ToastInput) => void;
  dismiss: (id: string) => void;
  toasts: ToastRecord[];
};

const ToastContext = createContext<ToastContextValue | null>(null);

const MAX_VISIBLE = 4;
const AUTO_DISMISS_MS = 4000;

const VARIANT_ICON: Record<ToastVariant, IconName> = {
  success: 'check-circle',
  info: 'info',
  warning: 'alert-triangle',
  danger: 'alert-circle',
};

const VARIANT_BAR: Record<ToastVariant, string> = {
  success: 'bg-accent-500',
  info: 'bg-fg-muted',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

const VARIANT_ICON_TONE: Record<ToastVariant, string> = {
  success: 'text-accent-400',
  info: 'text-fg-secondary',
  warning: 'text-warning',
  danger: 'text-danger',
};

export function AnalysisProvider({ children }: { children: ReactNode }): ReactNode {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (toast: ToastInput) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((prev) => [...prev, { ...toast, id }].slice(-MAX_VISIBLE));
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), AUTO_DISMISS_MS),
      );
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(() => ({ push, dismiss, toasts }), [push, dismiss, toasts]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within an AnalysisProvider');
  }
  return context;
}

export function ToastViewport(): ReactNode {
  const { toasts, dismiss } = useToast();
  const reduced = useReducedMotion();

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-[60] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout={!reduced}
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0, y: 8 }}
            transition={{ duration: reduced ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-stretch overflow-hidden rounded-card border border-line-strong bg-bg-raised shadow-l2"
          >
            <span aria-hidden="true" className={cn('w-[3px] shrink-0', VARIANT_BAR[toast.variant])} />
            <div className="flex flex-1 items-start gap-2 p-3">
              <Icon
                name={VARIANT_ICON[toast.variant]}
                size={18}
                className={cn('mt-0.5 shrink-0', VARIANT_ICON_TONE[toast.variant])}
              />
              <div className="min-w-0 flex-1">
                <p className="text-body font-semibold text-fg">{toast.title}</p>
                {toast.description && (
                  <p className="mt-0.5 text-small text-fg-secondary">{toast.description}</p>
                )}
              </div>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => dismiss(toast.id)}
                className="shrink-0 rounded-btn p-1 text-fg-muted transition-colors duration-100 ease-base hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
