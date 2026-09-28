import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Chip } from '@/components/ui/Chip';
import { Watermark } from '@/components/ui/Watermark';
import { Card } from '@/components/ui/Card';
import { ToxicityDot } from '@/components/plant/ToxicityDot';
import { titleCase } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { Plant } from '@/types/api';

export function PlantCard({
  plant,
  interactive = true,
  className,
  footer,
}: {
  plant: Plant;
  interactive?: boolean;
  className?: string;
  footer?: ReactNode;
}): ReactNode {
  const image = plant.images[0];
  const firstPart = plant.partsUsed[0];

  const body = (
    <>
      <div className="relative aspect-[16/9] overflow-hidden bg-bg-sunken">
        {image ? (
          <img src={image.url} alt={image.alt} loading="lazy" className="size-full object-cover" />
        ) : (
          <Watermark name="leaf" size={120} />
        )}
        <Chip tone="neutral" size="sm" className="absolute left-3 top-3">
          {plant.family}
        </Chip>
      </div>
      <div className="flex flex-col gap-2 p-5">
        <span className="botanical text-small text-clay-400">{plant.botanicalName}</span>
        <h3 className="line-clamp-2 text-h3 text-fg">{plant.commonName}</h3>
        {firstPart && (
          <span className="font-mono text-micro uppercase text-fg-muted">
            {titleCase(firstPart)}
          </span>
        )}
        <ToxicityDot toxicity={plant.toxicity} />
        {footer && <div className="mt-1">{footer}</div>}
      </div>
    </>
  );

  if (!interactive) {
    return (
      <Card variant="flat" padding="none" className={cn('overflow-hidden', className)}>
        {body}
      </Card>
    );
  }

  return (
    <Link
      to={`/plants/${plant.slug}`}
      className={cn(
        'group block rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base',
        className,
      )}
    >
      <Card variant="flat" padding="none" interactive className="overflow-hidden">
        {body}
      </Card>
    </Link>
  );
}
