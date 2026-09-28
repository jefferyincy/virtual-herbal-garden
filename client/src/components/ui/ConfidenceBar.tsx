import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function ConfidenceBar({
  value,
  showValue = true,
  className,
}: {
  value: number;
  showValue?: boolean;
  className?: string;
}): ReactNode {
  const clamped = Math.min(Math.max(value, 0), 1);
  const percent = Math.round(clamped * 100);
  const colour = clamped >= 0.8 ? '#7BE0A8' : clamped >= 0.5 ? '#4FD18B' : '#2F7A4E';

  return (
    <div className={cn('flex w-full items-center gap-2', className)}>
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Confidence"
        className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]"
      >
        <div
          className="h-full rounded-full transition-[width] duration-[320ms] ease-base"
          style={{ width: `${percent}%`, backgroundColor: colour }}
        />
      </div>
      {showValue && (
        <span className="shrink-0 font-mono text-micro text-fg-secondary">{percent}%</span>
      )}
    </div>
  );
}
