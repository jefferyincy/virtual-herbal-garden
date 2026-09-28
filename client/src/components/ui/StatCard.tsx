import type { ReactNode } from 'react';
import { Icon } from '@/components/icons';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';

export function StatCard({
  label,
  value,
  delta,
  deltaDirection,
  sparkline,
  tone = 'default',
  action,
  className,
}: {
  label: string;
  value: string | number;
  delta?: number;
  deltaDirection?: 'up' | 'down';
  sparkline?: number[];
  tone?: 'default' | 'accent' | 'warning';
  action?: { label: string; onClick: () => void };
  className?: string;
}): ReactNode {
  const valueTone =
    tone === 'accent' ? 'text-accent-400' : tone === 'warning' ? 'text-warning' : 'text-fg';

  return (
    <Card variant="flat" padding="md" className={cn('flex flex-col gap-2', className)}>
      <span className="mono-label">{label}</span>
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className={cn('text-h2 font-semibold', valueTone)}>{value}</span>
          {typeof delta === 'number' && (
            <span
              className={cn(
                'flex items-center gap-1 text-small',
                deltaDirection === 'down' ? 'text-danger' : 'text-accent-400',
              )}
            >
              <Icon
                name="arrow-up"
                size={14}
                className={deltaDirection === 'down' ? 'rotate-180' : undefined}
              />
              {Math.abs(delta)}
            </span>
          )}
        </div>
        {sparkline && sparkline.length > 1 && <Sparkline points={sparkline} />}
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="inline-flex items-center gap-1 self-start rounded-btn px-1 py-0.5 text-small text-fg-secondary transition-colors duration-100 ease-base hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
        >
          {action.label}
          <Icon name="arrow-right" size={14} />
        </button>
      )}
    </Card>
  );
}

function Sparkline({ points }: { points: number[] }): ReactNode {
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const step = points.length > 1 ? 64 / (points.length - 1) : 0;
  const coords = points
    .map((point, index) => `${index * step},${20 - ((point - min) / span) * 20}`)
    .join(' ');

  return (
    <svg
      width={64}
      height={20}
      viewBox="0 0 64 20"
      fill="none"
      aria-hidden="true"
      className="shrink-0 text-accent-400"
    >
      <polyline
        points={coords}
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
