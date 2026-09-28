import type { ReactNode } from 'react';
import { Icon } from '@/components/icons';
import { cn } from '@/lib/cn';

export function ErrorBanner({
  message,
  onRetry,
  onDismiss,
  className,
}: {
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
}): ReactNode {
  return (
    <div
      role="alert"
      className={cn(
        'flex items-center gap-3 rounded-card border border-danger bg-danger-tint p-3',
        className,
      )}
    >
      <Icon name="alert-triangle" size={18} className="shrink-0 text-danger" />
      <p className="min-w-0 flex-1 text-small text-fg">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded-btn px-2 py-1 text-small text-fg-secondary transition-colors duration-100 ease-base hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
        >
          Retry
        </button>
      )}
      {onDismiss && (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="shrink-0 rounded-btn p-1 text-fg-secondary transition-colors duration-100 ease-base hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
        >
          <Icon name="close" size={16} />
        </button>
      )}
    </div>
  );
}
