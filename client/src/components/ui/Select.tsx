import type { ReactNode, SelectHTMLAttributes } from 'react';
import { useId } from 'react';
import { Icon } from '@/components/icons';
import { cn } from '@/lib/cn';

export type SelectProps = {
  label?: string;
  error?: string | null;
  hint?: string;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  containerClassName?: string;
} & SelectHTMLAttributes<HTMLSelectElement>;

export function Select({
  label,
  error,
  hint,
  options,
  placeholder,
  containerClassName,
  className,
  id,
  ...rest
}: SelectProps): ReactNode {
  const reactId = useId();
  const fieldId = id ?? `select-${reactId}`;
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className={cn('flex w-full flex-col gap-1.5', containerClassName)}>
      {label && (
        <label htmlFor={fieldId} className="text-small text-fg-secondary">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          {...rest}
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'h-11 w-full appearance-none rounded-input border bg-bg-surface pl-3 pr-10 text-body text-fg transition-colors duration-100 ease-base focus:outline-none focus:ring-[3px] focus:ring-accent-tint',
            error
              ? 'border-danger focus:border-danger focus:ring-danger-tint'
              : 'border-line-subtle focus:border-accent-600',
            className,
          )}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <Icon
          name="chevron-down"
          size={18}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted"
        />
      </div>
      {error ? (
        <p id={errorId} role="alert" className="flex items-center gap-1 text-small text-danger">
          <Icon name="alert-circle" size={14} />
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-small text-fg-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
