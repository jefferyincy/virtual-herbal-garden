import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/icons';
import { cn } from '@/lib/cn';

export function Watermark({
  name = 'leaf',
  size = 180,
  className,
}: {
  name?: IconName;
  size?: number;
  className?: string;
}): ReactNode {
  return (
    <Icon
      name={name}
      size={size}
      className={cn(
        'pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-fg opacity-[0.05]',
        className,
      )}
    />
  );
}
