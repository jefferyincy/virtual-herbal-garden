import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type ChipTone = 'accent' | 'clay' | 'neutral' | 'warning' | 'danger';
type ChipSize = 'sm' | 'md';

const CHIP_TONES: Record<ChipTone, string> = {
  accent: 'bg-accent-tint text-accent-400',
  clay: 'bg-clay-tint text-clay-400',
  neutral: 'bg-white/[0.04] text-fg-secondary',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-danger-tint text-danger',
};

const CHIP_SIZES: Record<ChipSize, string> = {
  sm: 'text-[10px] px-2 py-0.5',
  md: 'text-micro px-2.5 py-1',
};

export function Chip({
  tone = 'accent',
  size = 'md',
  children,
  className,
}: {
  tone?: ChipTone;
  size?: ChipSize;
  children?: ReactNode;
  className?: string;
}): ReactNode {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-mono uppercase',
        CHIP_SIZES[size],
        CHIP_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function FilterChip({
  active,
  onClick,
  children,
  className,
}: {
  active: boolean;
  onClick: () => void;
  children?: ReactNode;
  className?: string;
}): ReactNode {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-micro uppercase transition-colors duration-100 ease-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base',
        active
          ? 'border border-accent-600 bg-accent-tint text-accent-400'
          : 'border border-line-subtle text-fg-secondary hover:border-line-strong hover:text-fg',
        className,
      )}
    >
      {children}
    </button>
  );
}
