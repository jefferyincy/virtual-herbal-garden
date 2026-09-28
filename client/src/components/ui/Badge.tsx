import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type BadgeTone = 'neutral' | 'accent' | 'clay' | 'warning' | 'danger';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-white/[0.06] text-fg-secondary',
  accent: 'bg-accent-tint text-accent-400',
  clay: 'bg-clay-tint text-clay-400',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-danger-tint text-danger',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: BadgeTone;
  children?: ReactNode;
  className?: string;
}): ReactNode {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-micro uppercase',
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
