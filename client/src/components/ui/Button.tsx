import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from '@/components/icons';
import { cn } from '@/lib/cn';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export type ButtonProps = {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  loading?: boolean;
  iconLeft?: IconName;
  iconRight?: IconName;
  fullWidth?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>;

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-btn font-semibold transition-[background-color,border-color,color,transform] duration-100 ease-base active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base';

const SIZES: Record<NonNullable<ButtonProps['size']>, string> = {
  md: 'h-11 px-4 text-body',
  sm: 'h-9 px-3 text-small',
};

const VARIANTS: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-accent-500 text-fg-onAccent hover:bg-accent-400 active:bg-accent-600',
  secondary: 'border border-line-strong bg-transparent text-fg hover:bg-bg-hover',
  ghost: 'text-fg-secondary hover:bg-bg-hover hover:text-fg',
  danger: 'border border-danger bg-danger-tint text-danger hover:bg-danger/20',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  iconLeft,
  iconRight,
  fullWidth = false,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps): ReactNode {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(BASE, SIZES[size], VARIANTS[variant], fullWidth && 'w-full', className)}
    >
      {loading ? (
        <LoadingSpinner size={16} />
      ) : (
        iconLeft && <Icon name={iconLeft} size={18} />
      )}
      {!loading && children}
      {!loading && iconRight && <Icon name={iconRight} size={18} />}
    </button>
  );
}
