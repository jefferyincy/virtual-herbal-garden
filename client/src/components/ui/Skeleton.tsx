import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

const VARIANT_RADIUS: Record<'line' | 'card' | 'circle', string> = {
  line: 'rounded',
  card: 'rounded-card',
  circle: 'rounded-full',
};

export function Skeleton({
  variant = 'line',
  width,
  height,
  className,
}: {
  variant?: 'line' | 'card' | 'circle';
  width?: number | string;
  height?: number | string;
  className?: string;
}): ReactNode {
  return (
    <span
      aria-hidden="true"
      style={{ width, height }}
      className={cn(
        'block animate-shimmer bg-white/[0.06]',
        VARIANT_RADIUS[variant],
        className,
      )}
    />
  );
}

export function SkeletonRow({ columns = 4 }: { columns?: number }): ReactNode {
  return (
    <tr aria-hidden="true" className="border-b border-line-subtle">
      {Array.from({ length: columns }, (_, index) => (
        <td key={index} className="px-4 py-3">
          <Skeleton width={index === 0 ? '70%' : '45%'} height={14} />
        </td>
      ))}
    </tr>
  );
}

export function SkeletonTable({ rows = 6, columns = 5 }: { rows?: number; columns?: number }): ReactNode {
  return (
    <div role="status" aria-label="Loading">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-line-subtle">
            {Array.from({ length: columns }, (_, index) => (
              <th key={index} scope="col" className="px-4 py-3">
                <Skeleton width={72} height={11} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, index) => (
            <SkeletonRow key={index} columns={columns} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SkeletonPlantGrid({ count = 6, columns = 3 }: { count?: number; columns?: number }): ReactNode {
  return (
    <div role="status" aria-label="Loading">
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: count }, (_, index) => (
          <div
            key={index}
            aria-hidden="true"
            className="overflow-hidden rounded-card border border-line-subtle bg-bg-surface"
          >
            <Skeleton className="aspect-[16/9] w-full rounded-none" />
            <div className="flex flex-col gap-2 p-5">
              <Skeleton width="50%" height={11} />
              <Skeleton width="80%" height={18} />
              <Skeleton width="35%" height={12} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
