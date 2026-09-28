import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Table({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): ReactNode {
  return <table className={cn('w-full border-collapse text-left', className)}>{children}</table>;
}

export function THead({
  children,
  columns,
  className,
}: {
  children?: ReactNode;
  columns?: Array<{ label: string; align?: 'left' | 'right'; width?: string }>;
  className?: string;
}): ReactNode {
  return (
    <thead className={cn('border-b border-line-subtle', className)}>
      {columns ? (
        <tr>
          {columns.map((column) => (
            <th
              key={column.label}
              scope="col"
              style={{ width: column.width }}
              className={cn('mono-label px-4 py-3', column.align === 'right' && 'text-right')}
            >
              {column.label}
            </th>
          ))}
        </tr>
      ) : (
        children
      )}
    </thead>
  );
}

export function TBody({ children, className }: { children: ReactNode; className?: string }): ReactNode {
  return <tbody className={className}>{children}</tbody>;
}

export function TR({
  children,
  className,
  selected = false,
}: {
  children: ReactNode;
  className?: string;
  selected?: boolean;
}): ReactNode {
  return (
    <tr
      className={cn(
        'relative border-b border-line-subtle transition-colors duration-100 ease-base last:border-b-0 hover:bg-bg-hover',
        selected && 'bg-accent-tint [&>td:first-child]:border-l-2 [&>td:first-child]:border-accent-500',
        className,
      )}
    >
      {children}
    </tr>
  );
}

export function TH({
  children,
  align = 'left',
  className,
}: {
  children: ReactNode;
  align?: 'left' | 'right';
  className?: string;
}): ReactNode {
  return (
    <th
      scope="col"
      className={cn('mono-label px-4 py-3', align === 'right' && 'text-right', className)}
    >
      {children}
    </th>
  );
}

export function TD({
  children,
  className,
  mono = false,
  align,
}: {
  children: ReactNode;
  className?: string;
  mono?: boolean;
  align?: 'left' | 'right';
}): ReactNode {
  return (
    <td
      className={cn(
        'px-4 py-3 text-body text-fg',
        mono && 'font-mono text-small',
        align === 'right' && 'text-right',
        className,
      )}
    >
      {children}
    </td>
  );
}
