import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/icons';
import { cn } from '@/lib/cn';

export function RadioCard({
  selected,
  onSelect,
  title,
  description,
  icon,
  className,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  description?: string;
  icon?: IconName;
  className?: string;
}): ReactNode {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'relative w-full overflow-hidden rounded-card border p-4 text-left transition-colors duration-100 ease-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base',
        selected
          ? 'border-accent-600 shadow-l4'
          : 'border-line-subtle bg-bg-surface hover:border-line-strong',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-y-0 left-0 w-[3px] bg-accent-500 transition-opacity duration-100 ease-base',
          selected ? 'opacity-100' : 'opacity-0',
        )}
      />
      <span className="flex items-start gap-3">
        {icon && <Icon name={icon} size={20} className="mt-0.5 shrink-0 text-accent-400" />}
        <span className="min-w-0 flex-1">
          <span className="block text-body font-semibold text-fg">{title}</span>
          {description && (
            <span className="mt-1 block text-small text-fg-secondary">{description}</span>
          )}
        </span>
      </span>
    </button>
  );
}
