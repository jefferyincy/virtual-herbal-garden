import type { KeyboardEvent as ReactKeyboardEvent, MutableRefObject, ReactNode } from 'react';
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/icons';
import { cn } from '@/lib/cn';

/** Focusable element query used by the overlay focus traps. */
export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Shared overlay behaviour for Modal and Drawer: body scroll lock, focus on open, focus
 * restoration on close, and Escape-to-close. Tab cycling is handled by `trapTab`.
 */
export function useOverlay(open: boolean, onClose: () => void): MutableRefObject<HTMLDivElement | null> {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const restoreTarget = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const first = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (first ?? panel).focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      restoreTarget?.focus();
    };
  }, [open]);

  return panelRef;
}

/** Keeps Tab / Shift+Tab cycling inside the panel while the overlay is open. */
export function trapTab(
  event: ReactKeyboardEvent<HTMLDivElement>,
  panelRef: MutableRefObject<HTMLDivElement | null>,
): void {
  if (event.key !== 'Tab') return;
  const panel = panelRef.current;
  if (!panel) return;
  const nodes = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (node) => node.offsetParent !== null,
  );
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (!first || !last) {
    event.preventDefault();
    return;
  }
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

const SIZES = { sm: 'max-w-[440px]', md: 'max-w-[560px]', lg: 'max-w-[720px]' } as const;

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}): ReactNode {
  const panelRef = useOverlay(open, onClose);
  const titleId = useId();
  const descriptionId = useId();

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(5,8,6,0.72)] p-4 backdrop-blur-[8px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onKeyDown={(event) => trapTab(event, panelRef)}
        className={cn(
          'relative max-h-[calc(100vh-2rem)] w-full overflow-y-auto rounded-panel border border-line-strong bg-bg-raised shadow-l2 focus-visible:outline-none',
          SIZES[size],
        )}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-btn p-1.5 text-fg-muted transition-colors duration-100 ease-base hover:bg-bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
        >
          <Icon name="close" size={18} />
        </button>
        <div className="flex flex-col gap-1 px-6 pb-4 pt-6 pr-12">
          <h2 id={titleId} className="text-h3 text-fg">
            {title}
          </h2>
          {description && (
            <p id={descriptionId} className="text-small text-fg-secondary">
              {description}
            </p>
          )}
        </div>
        {children && <div className="px-6 pb-2 text-body text-fg-secondary">{children}</div>}
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-line-subtle px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
