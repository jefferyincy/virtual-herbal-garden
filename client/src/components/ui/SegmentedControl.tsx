import type { KeyboardEvent, ReactNode } from 'react';
import { useRef } from 'react';
import { Icon, type IconName } from '@/components/icons';
import { cn } from '@/lib/cn';

export function SegmentedControl({
  options,
  value,
  onChange,
  size = 'md',
  className,
}: {
  options: Array<{ value: string; label: string; icon?: IconName }>;
  value: string;
  onChange: (value: string) => void;
  size?: 'sm' | 'md';
  className?: string;
}): ReactNode {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = options.length - 1;
    let next = index;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = index === last ? 0 : index + 1;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = index === 0 ? last : index - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    else return;
    event.preventDefault();
    const target = options[next];
    if (!target) return;
    onChange(target.value);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      className={cn('inline-flex rounded-btn border border-line-subtle bg-bg-surface p-0.5', className)}
    >
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-[7px] font-medium transition-colors duration-100 ease-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow',
              size === 'sm' ? 'h-7 px-2.5 text-small' : 'h-9 px-3.5 text-body',
              active ? 'bg-bg-hover text-fg shadow-l1' : 'text-fg-secondary hover:text-fg',
            )}
          >
            {option.icon && <Icon name={option.icon} size={16} />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
