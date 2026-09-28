import type { ReactNode } from 'react';
import { Icon } from '@/components/icons';
import { cn } from '@/lib/cn';

export function LoadingSpinner({
  size = 20,
  className,
}: {
  size?: number;
  className?: string;
}): ReactNode {
  return <Icon name="spinner" size={size} className={cn('animate-spin text-accent-500', className)} />;
}
