import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function KeyboardHint({
  keys,
  className,
}: {
  keys: string[];
  className?: string;
}): ReactNode {
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      {keys.map((key, index) => (
        <span key={`${key}-${index}`} className="inline-flex items-center gap-1">
          {index > 0 && (
            <span aria-hidden="true" className="text-fg-disabled">
              ·
            </span>
          )}
          <kbd className="rounded-micro border border-line-subtle bg-bg-surface px-1.5 py-0.5 font-mono text-micro uppercase text-fg-muted">
            {key}
          </kbd>
        </span>
      ))}
    </span>
  );
}
