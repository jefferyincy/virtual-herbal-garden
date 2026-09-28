import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@/components/icons';
import { Watermark } from '@/components/ui/Watermark';
import { cn } from '@/lib/cn';
import type { Plant } from '@/types/api';

type PlantReference = Pick<Plant, '_id' | 'slug' | 'commonName' | 'botanicalName' | 'images'>;

export function PlantReferenceCard({
  plant,
  linkLabel = 'View profile',
  compact = false,
  className,
}: {
  plant: Plant | PlantReference;
  linkLabel?: string;
  compact?: boolean;
  className?: string;
}): ReactNode {
  const image = plant.images[0];

  return (
    <div
      className={cn(
        'flex items-center gap-4 rounded-card border border-line-subtle bg-bg-surface p-4',
        className,
      )}
    >
      {!compact && (
        <div className="relative size-16 shrink-0 overflow-hidden rounded-input bg-bg-sunken">
          {image ? (
            <img src={image.url} alt={image.alt} loading="lazy" className="size-full object-cover" />
          ) : (
            <Watermark name="leaf" size={40} />
          )}
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-h3 text-fg">{plant.commonName}</span>
        <span className="botanical text-small text-clay-400">{plant.botanicalName}</span>
      </div>
      {linkLabel && (
        <Link
          to={`/plants/${plant.slug}`}
          className="inline-flex shrink-0 items-center gap-1 rounded-btn text-small text-accent-400 transition-colors duration-100 ease-base hover:text-accent-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
        >
          {linkLabel}
          <Icon name="arrow-right" size={14} />
        </Link>
      )}
    </div>
  );
}
