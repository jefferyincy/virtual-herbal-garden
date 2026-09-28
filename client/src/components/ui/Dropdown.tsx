import type { KeyboardEvent, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '@/components/icons';
import { cn } from '@/lib/cn';

export type DropdownItem = {
  label: string;
  onSelect: () => void;
  icon?: IconName;
  danger?: boolean;
  disabled?: boolean;
};

export function Dropdown({
  trigger,
  items,
  align = 'end',
  className,
  menuClassName,
}: {
  trigger: ReactNode;
  items: DropdownItem[];
  align?: 'start' | 'end';
  className?: string;
  menuClassName?: string;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!open) return;
    const onDocPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDocPointerDown);
    return () => document.removeEventListener('pointerdown', onDocPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      const first = itemRefs.current.findIndex((node) => node && !node.disabled);
      if (first >= 0) itemRefs.current[first]?.focus();
    }
  }, [open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  const move = (from: number, direction: 1 | -1) => {
    const count = items.length;
    for (let step = 1; step <= count; step += 1) {
      const index = (((from + direction * step) % count) + count) % count;
      const node = itemRefs.current[index];
      if (node && !node.disabled) {
        node.focus();
        return;
      }
    }
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLElement>, index: number) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(index, 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(index, -1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      move(-1, 1);
    } else if (event.key === 'End') {
      event.preventDefault();
      move(items.length, -1);
    }
  };

  return (
    <div ref={rootRef} className={cn('relative inline-flex', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className="inline-flex items-center gap-2 rounded-btn transition-colors duration-100 ease-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
      >
        {trigger}
      </button>
      {open && (
        <div
          role="menu"
          className={cn(
            'absolute top-full z-50 mt-2 min-w-[180px] rounded-card border border-line-strong bg-bg-raised p-1 shadow-l2',
            align === 'end' ? 'right-0' : 'left-0',
            menuClassName,
          )}
        >
          {items.map((item, index) => (
            <button
              key={item.label}
              ref={(node) => {
                itemRefs.current[index] = node;
              }}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onKeyDown={(event) => onMenuKeyDown(event, index)}
              onClick={() => {
                item.onSelect();
                close(true);
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-input px-3 py-2 text-left text-body transition-colors duration-100 ease-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow disabled:cursor-not-allowed disabled:opacity-50',
                item.danger
                  ? 'text-danger hover:bg-danger-tint'
                  : 'text-fg hover:bg-bg-hover',
              )}
            >
              {item.icon && <Icon name={item.icon} size={16} />}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
