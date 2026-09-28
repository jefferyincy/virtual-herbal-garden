import type { ElementType, ReactNode } from 'react';
import { cn } from '@/lib/cn';

type CardVariant = 'flat' | 'raised' | 'outlined';
type CardPadding = 'none' | 'sm' | 'md' | 'lg';

const CARD_VARIANTS: Record<CardVariant, string> = {
  flat: 'bg-bg-surface border border-line-subtle shadow-l1 top-highlight',
  raised: 'bg-bg-raised border border-line-strong shadow-l2',
  outlined: 'border border-line-strong bg-transparent',
};

const CARD_PADDING: Record<CardPadding, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
};

export function Card({
  variant = 'flat',
  interactive = false,
  as,
  padding = 'md',
  presentation = false,
  children,
  className,
}: {
  variant?: CardVariant;
  interactive?: boolean;
  as?: ElementType;
  padding?: CardPadding;
  presentation?: boolean;
  children?: ReactNode;
  className?: string;
}): ReactNode {
  const Component: ElementType = as ?? 'div';
  return (
    <Component
      role={presentation ? 'presentation' : undefined}
      className={cn(
        'rounded-card',
        CARD_VARIANTS[variant],
        CARD_PADDING[padding],
        interactive &&
          'cursor-pointer transition-transform duration-100 ease-base hover:-translate-y-px hover:border-line-strong',
        className,
      )}
    >
      {children}
    </Component>
  );
}
