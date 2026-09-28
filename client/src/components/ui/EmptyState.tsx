import type { ReactNode } from 'react';
import type { IconName } from '@/components/icons';
import { Watermark } from '@/components/ui/Watermark';
import { cn } from '@/lib/cn';

export function EmptyState({
  title,
  description,
  action,
  watermark = 'leaf',
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  watermark?: IconName;
  className?: string;
}): ReactNode {
  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center gap-3 overflow-hidden px-6 py-16 text-center',
        className,
      )}
    >
      <Watermark name={watermark} size={200} />
      <div className="relative flex flex-col items-center gap-2">
        <h3 className="text-h3 text-fg">{title}</h3>
        {description && <p className="max-w-reading text-small text-fg-secondary">{description}</p>}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}
