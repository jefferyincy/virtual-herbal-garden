import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type ProgressTone = 'accent' | 'warning' | 'danger';

const FILL_TONES: Record<ProgressTone, string> = {
  accent: 'bg-accent-500 shadow-[0_0_12px_4px_rgba(79,209,139,0.4)]',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

export function ProgressBar({
  value,
  max = 100,
  tone = 'accent',
  size = 'md',
  label,
  className,
}: {
  value: number;
  max?: number;
  tone?: ProgressTone;
  size?: 'sm' | 'md';
  label?: string;
  className?: string;
}): ReactNode {
  const clamped = Math.min(Math.max(value, 0), max);
  const percent = max > 0 ? (clamped / max) * 100 : 0;

  return (
    <div className={cn('flex w-full flex-col gap-1.5', className)}>
      {label && <span className="mono-label">{label}</span>}
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
        className={cn('w-full overflow-hidden rounded-full bg-white/[0.06]', size === 'sm' ? 'h-0.5' : 'h-1')}
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-[320ms] ease-base', FILL_TONES[tone])}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
