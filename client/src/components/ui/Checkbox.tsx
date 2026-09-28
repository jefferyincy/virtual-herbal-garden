import type { InputHTMLAttributes, ReactNode } from 'react';
import { useId } from 'react';
import { Icon } from '@/components/icons';
import { cn } from '@/lib/cn';

export type CheckboxProps = {
  label: ReactNode;
  hint?: string;
  error?: string | null;
} & InputHTMLAttributes<HTMLInputElement>;

export function Checkbox({ label, hint, error, className, id, ...rest }: CheckboxProps): ReactNode {
  const reactId = useId();
  const fieldId = id ?? `checkbox-${reactId}`;
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={fieldId}
        className={cn(
          'flex min-h-11 cursor-pointer items-start gap-3 py-1 text-body text-fg',
          rest.disabled && 'cursor-not-allowed opacity-50',
          className,
        )}
      >
        <input
          {...rest}
          id={fieldId}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className="peer sr-only"
        />
        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-micro border border-line-strong bg-bg-surface text-fg-onAccent transition-colors duration-100 ease-base peer-focus-visible:ring-2 peer-focus-visible:ring-accent-glow peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-bg-base peer-checked:border-accent-500 peer-checked:bg-accent-500 peer-checked:[&>svg]:opacity-100 peer-disabled:opacity-50">
          <Icon
            name="check"
            size={14}
            strokeWidth={2.5}
            className="opacity-0 transition-opacity duration-100 ease-base"
          />
        </span>
        <span className="min-w-0 flex-1">{label}</span>
      </label>
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
