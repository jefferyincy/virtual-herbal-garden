import type { ReactNode } from 'react';
import { Icon } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Try again',
  className,
  children,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
  children?: ReactNode;
}): ReactNode {
  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center justify-center gap-4 px-6 py-12 text-center', className)}
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-danger-tint">
        <Icon name="alert-circle" size={24} className="text-danger" />
      </span>
      <div className="flex flex-col items-center gap-2">
        <h3 className="text-h3 text-fg">{title}</h3>
        {message && <p className="max-w-reading text-small text-fg-secondary">{message}</p>}
      </div>
      {children}
      {onRetry && (
        <Button variant="secondary" iconLeft="refresh" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
