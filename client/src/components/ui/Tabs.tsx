import type { KeyboardEvent, ReactNode } from 'react';
import { useRef } from 'react';
import { cn } from '@/lib/cn';

export function Tabs({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: Array<{ value: string; label: string; count?: number }>;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}): ReactNode {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = tabs.length - 1;
    let next = index;
    if (event.key === 'ArrowRight') next = index === last ? 0 : index + 1;
    else if (event.key === 'ArrowLeft') next = index === 0 ? last : index - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    else return;
    event.preventDefault();
    const target = tabs[next];
    if (!target) return;
    onChange(target.value);
    refs.current[next]?.focus();
  };

  return (
    <div role="tablist" className={cn('flex items-center gap-1 border-b border-line-subtle', className)}>
      {tabs.map((tab, index) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              'inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-body transition-colors duration-100 ease-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base',
              active
                ? 'border-accent-500 text-fg'
                : 'border-transparent text-fg-secondary hover:text-fg',
            )}
          >
            {tab.label}
            {typeof tab.count === 'number' && (
              <span className="font-mono text-micro uppercase text-fg-muted">{tab.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
