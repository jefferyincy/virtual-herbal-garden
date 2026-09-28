import type { ReactNode } from 'react';
import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Icon } from '@/components/icons';
import { trapTab, useOverlay } from '@/components/ui/Modal';

/** Bottom-sheet breakpoint: matches Tailwind's `sm` (640px) used by the panel classes below. */
function useIsSmallScreen(): boolean {
  const [small, setSmall] = useState(() =>
    typeof window === 'undefined' ? false : !window.matchMedia('(min-width: 640px)').matches,
  );
  useEffect(() => {
    const query = window.matchMedia('(min-width: 640px)');
    const update = () => setSmall(!query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return small;
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  side = 'right',
  width = 520,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children?: ReactNode;
  footer?: ReactNode;
  side?: 'left' | 'right';
  width?: number;
}): ReactNode {
  const panelRef = useOverlay(open, onClose);
  const titleId = useId();
  const reduced = useReducedMotion();
  const small = useIsSmallScreen();

  const offset = small ? { y: '100%' } : { x: side === 'right' ? '100%' : '-100%' };
  const duration = reduced ? 0 : 0.32;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div
            className="absolute inset-0 bg-[rgba(5,8,6,0.72)] backdrop-blur-[8px]"
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduced ? undefined : { opacity: 0 }}
            transition={{ duration }}
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={reduced ? false : offset}
            animate={{ x: 0, y: 0 }}
            exit={reduced ? undefined : offset}
            transition={{ duration, ease: [0.22, 1, 0.36, 1] }}
            onKeyDown={(event) => trapTab(event, panelRef)}
            style={{ width: small ? undefined : `min(${width}px, 100vw)` }}
            className={[
              'absolute flex flex-col border-line-strong bg-bg-raised shadow-l2 focus-visible:outline-none',
              'inset-x-0 bottom-0 max-h-[85vh] rounded-t-panel',
              'sm:inset-y-0 sm:bottom-auto sm:max-h-none sm:w-auto sm:rounded-none',
              !small && side === 'right' ? 'sm:right-0 sm:border-l' : '',
              !small && side === 'left' ? 'sm:left-0 sm:border-r' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <div className="flex items-center justify-between gap-3 border-b border-line-subtle px-5 py-4">
              <h2 id={titleId} className="text-h3 text-fg">
                {title}
              </h2>
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="rounded-btn p-1.5 text-fg-muted transition-colors duration-100 ease-base hover:bg-bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
              >
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-body text-fg-secondary">
              {children}
            </div>
            {footer && (
              <div className="flex items-center justify-end gap-2 border-t border-line-subtle px-5 py-4">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
