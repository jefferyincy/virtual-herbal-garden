import type { ReactNode } from 'react';
import { Icon } from '@/components/icons';
import { cn } from '@/lib/cn';

function pageWindow(page: number, totalPages: number): Array<number | 'gap'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  const pages = new Set<number>([1, totalPages, page - 1, page, page + 1]);
  const sorted = Array.from(pages)
    .filter((value) => value >= 1 && value <= totalPages)
    .sort((a, b) => a - b);
  const output: Array<number | 'gap'> = [];
  sorted.forEach((value, index) => {
    if (index > 0 && value - (sorted[index - 1] ?? value) > 1) output.push('gap');
    output.push(value);
  });
  return output;
}

export function Pagination({
  page,
  totalPages,
  onPageChange,
  className,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}): ReactNode {
  const items = pageWindow(page, totalPages);
  const navButton =
    'inline-flex size-9 items-center justify-center rounded-btn border border-line-subtle text-fg-secondary transition-colors duration-100 ease-base hover:border-line-strong hover:text-fg disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow';

  return (
    <nav aria-label="Pagination" className={cn('flex items-center gap-2', className)}>
      <button
        type="button"
        aria-label="Previous page"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className={navButton}
      >
        <Icon name="chevron-left" size={16} />
      </button>

      <div className="flex items-center gap-1">
        {items.map((item, index) =>
          item === 'gap' ? (
            <span
              key={`gap-${index}`}
              aria-hidden="true"
              className="px-1 font-mono text-small text-fg-muted"
            >
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              aria-label={`Page ${item}`}
              aria-current={item === page ? 'page' : undefined}
              onClick={() => onPageChange(item)}
              className={cn(
                'inline-flex size-9 items-center justify-center rounded-btn font-mono text-small transition-colors duration-100 ease-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow',
                item === page
                  ? 'bg-accent-tint text-accent-400'
                  : 'text-fg-secondary hover:bg-bg-hover hover:text-fg',
              )}
            >
              {item}
            </button>
          ),
        )}
      </div>

      <button
        type="button"
        aria-label="Next page"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        className={navButton}
      >
        <Icon name="chevron-right" size={16} />
      </button>
    </nav>
  );
}
