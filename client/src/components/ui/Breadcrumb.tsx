import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@/components/icons';
import { cn } from '@/lib/cn';

export function Breadcrumb({
  items,
  className,
}: {
  items: Array<{ label: string; to?: string }>;
  className?: string;
}): ReactNode {
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-2 text-small">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-2">
              {last || !item.to ? (
                <span aria-current="page" className="text-fg">
                  {item.label}
                </span>
              ) : (
                <Link
                  to={item.to}
                  className={cn(
                    'text-fg-muted transition-colors duration-100 ease-base hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow',
                  )}
                >
                  {item.label}
                </Link>
              )}
              {!last && <Icon name="chevron-right" size={14} className="text-fg-disabled" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
