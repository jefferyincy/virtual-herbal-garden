import type { ReactNode } from 'react';
import { Icon } from '@/components/icons';
import { cn } from '@/lib/cn';

export function SafetyBanner({
  heading = 'Safety and dosage',
  children,
  className,
}: {
  heading?: string;
  children?: ReactNode;
  className?: string;
}): ReactNode {
  return (
    <section
      role="note"
      aria-label={heading}
      className={cn('rounded-card border-l-[3px] border-danger bg-danger-tint px-5 py-4', className)}
    >
      <div className="flex items-start gap-3">
        <Icon name="alert-triangle" size={20} className="mt-0.5 shrink-0 text-danger" />
        <div className="min-w-0 flex-1">
          <h3 className="text-h3 text-danger">{heading}</h3>
          <div className="mt-1.5 text-small text-fg-secondary">
            {children ?? (
              <p>
                Educational reference only - not medical advice. Verify every preparation with a
                qualified practitioner and cite a primary source before use, especially for
                children, pregnancy, and anyone taking medication.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
