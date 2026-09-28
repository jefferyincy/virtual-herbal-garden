import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Page header: h1, optional one-line description, optional mono breadcrumb line, actions right.
 * Every non-canvas screen starts with this so heading rhythm and spacing stay identical.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** Mono uppercase micro-label above the title, e.g. "ENCYCLOPEDIA". */
  eyebrow?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-8 flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        {eyebrow && <p className="mb-2 font-mono text-micro uppercase text-fg-muted">{eyebrow}</p>}
        <h1 className="text-h1 text-fg">{title}</h1>
        {description && <p className="mt-2 max-w-reading text-body text-fg-secondary">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Section wrapper with 64px rhythm and optional h2 + actions row. */
export function Section({
  title,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('mb-16 last:mb-0', className)}>
      {(title || actions) && (
        <div className="mb-4 flex items-end justify-between gap-4">
          {title && <h2 className="text-h2 text-fg">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}
