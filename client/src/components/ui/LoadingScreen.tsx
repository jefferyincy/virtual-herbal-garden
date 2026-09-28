import type { ReactNode } from 'react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { cn } from '@/lib/cn';

export function LoadingScreen({
  label = 'Loading',
  className,
}: {
  label?: string;
  className?: string;
}): ReactNode {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex min-h-[60vh] flex-col items-center justify-center gap-3', className)}
    >
      <LoadingSpinner />
      <span className="text-small text-fg-muted">{label}</span>
    </div>
  );
}
