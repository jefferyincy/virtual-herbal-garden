import type { ReactNode } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

type Side = 'top' | 'bottom' | 'left' | 'right';

const SIDE_POSITION: Record<Side, string> = {
  top: 'bottom-full left-1/2 mb-2 -translate-x-1/2',
  bottom: 'top-full left-1/2 mt-2 -translate-x-1/2',
  left: 'right-full top-1/2 mr-2 -translate-y-1/2',
  right: 'left-full top-1/2 ml-2 -translate-y-1/2',
};

export function Tooltip({
  content,
  children,
  side = 'top',
  delayMs = 200,
  className,
}: {
  content: string;
  children: ReactNode;
  side?: Side;
  delayMs?: number;
  className?: string;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();

  const show = () => {
    clear();
    timer.current = setTimeout(() => setOpen(true), delayMs);
  };
  const hide = () => {
    clear();
    setOpen(false);
  };
  const clear = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  useEffect(() => clear, []);

  return (
    <span
      className={cn('relative inline-flex', className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      <span aria-describedby={open ? id : undefined} className="inline-flex">
        {children}
      </span>
      {open && (
        <span
          id={id}
          role="tooltip"
          className={cn(
            'pointer-events-none absolute z-50 max-w-[240px] whitespace-normal rounded-input border border-line-strong bg-bg-raised px-2 py-1 text-micro text-fg shadow-l2',
            SIDE_POSITION[side],
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}
