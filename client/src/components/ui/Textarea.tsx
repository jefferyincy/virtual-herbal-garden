import type { TextareaHTMLAttributes, ReactNode } from 'react';
import { useId } from 'react';
import { Icon, type IconName } from '@/components/icons';
import { cn } from '@/lib/cn';

export type TextareaProps = {
  label?: string;
  error?: string | null;
  hint?: string;
  icon?: IconName;
  containerClassName?: string;
  rows?: number;
  counter?: { value: number; max: number };
} & TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({
  label,
  error,
  hint,
  icon,
  containerClassName,
  className,
  id,
  rows = 6,
  counter,
  ...rest
}: TextareaProps): ReactNode {
  const reactId = useId();
  const fieldId = id ?? `textarea-${reactId}`;
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
        {icon && (
          <Icon
            name={icon}
            size={18}
            className="pointer-events-none absolute left-3 top-3 text-fg-muted"
          />
        )}
        <textarea
          {...rest}
          id={fieldId}
          rows={rows}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'min-h-[144px] w-full resize-y rounded-input border bg-bg-surface px-3 py-2.5 text-body text-fg placeholder:text-fg-muted transition-colors duration-100 ease-base focus:outline-none focus:ring-[3px] focus:ring-accent-tint',
            error
              ? 'border-danger focus:border-danger focus:ring-danger-tint'
              : 'border-line-subtle focus:border-accent-600',
            icon && 'pl-10',
            className,
          )}
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
      {counter && (
        <p className="text-right font-mono text-micro text-fg-muted">
          {counter.value}/{counter.max}
        </p>
      )}
    </div>
  );
}
