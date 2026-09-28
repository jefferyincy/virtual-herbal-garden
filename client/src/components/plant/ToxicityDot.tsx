import type { ReactNode } from 'react';
import type { Toxicity } from '@/types/api';
import { cn } from '@/lib/cn';

const TOXICITY_META: Record<Toxicity, { label: string; dot: string; tone: string }> = {
  none: { label: 'None known', dot: 'bg-accent-500', tone: 'text-accent-400' },
  low: { label: 'Low', dot: 'bg-warning', tone: 'text-warning' },
  high: { label: 'High', dot: 'bg-danger', tone: 'text-danger' },
};

export function ToxicityDot({
  toxicity,
  withLabel = true,
  className,
}: {
  toxicity: Toxicity;
  withLabel?: boolean;
  className?: string;
}): ReactNode {
  const meta = TOXICITY_META[toxicity];
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span
        role="img"
        aria-label={`${meta.label} toxicity`}
        title={`${meta.label} toxicity`}
        className={cn('size-2 shrink-0 rounded-full ring-2 ring-bg-surface', meta.dot)}
      />
      {withLabel && <span className={cn('font-mono text-micro uppercase', meta.tone)}>{meta.label}</span>}
    </span>
  );
}
