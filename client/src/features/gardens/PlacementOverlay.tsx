/**
 * The placement palette: a narrow left rail of plant thumbnails, keyboard navigable as a listbox.
 *
 * The palette only offers plants while there is somewhere to put them. Selecting past capacity is
 * blocked with a warning chip rather than failing silently at the server (which would answer 400 on
 * an out-of-grid tile and 409 on an occupied one) - the user is told before the request is made.
 */
import { useRef } from 'react';
import { Icon } from '@/components/icons';
import { Chip } from '@/components/ui/Chip';
import { Tooltip } from '@/components/ui/Tooltip';
import { Watermark } from '@/components/ui/Watermark';
import { cn } from '@/lib/cn';
import type { Plant } from '@/types/api';

/** The rail shows at most this many species, matching the mockup's six slots. */
const MAX_PALETTE_SLOTS = 6;

export function PlacementOverlay({
  plants,
  activePlantId,
  onSelect,
  plotCount,
  maxPlots,
  className,
}: {
  plants: Plant[];
  activePlantId: string | null;
  onSelect: (plantId: string) => void;
  plotCount: number;
  maxPlots: number;
  className?: string;
}): React.ReactNode {
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const palette = plants.slice(0, MAX_PALETTE_SLOTS);
  const full = plotCount >= maxPlots;

  const move = (from: number, direction: 1 | -1) => {
    const count = palette.length;
    if (count === 0) return;
    const next = (((from + direction) % count) + count) % count;
    const target = palette[next];
    if (!target) return;
    onSelect(target._id);
    optionRefs.current[next]?.focus();
  };

  return (
    <div
      className={cn(
        'bg-bg-raised/85 backdrop-blur-[16px] rounded-panel border border-line-strong shadow-l2',
        'flex w-[88px] flex-col gap-2 p-2 sm:w-[112px]',
        className,
      )}
    >
      <p className="mono-label px-1 pt-1">Nursery tray</p>

      {full && (
        // Capacity is a warning, not a silent no-op: the bed is full, so nothing can be chosen.
        <Chip tone="warning" className="justify-center">
          <Icon name="alert-triangle" size={12} />
          {`${plotCount} / ${maxPlots}`}
        </Chip>
      )}

      <div
        role="listbox"
        aria-label="Plants available to place"
        aria-orientation="vertical"
        className="flex flex-col gap-2"
        onKeyDown={(event) => {
          const index = palette.findIndex((plant) => plant._id === activePlantId);
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            move(index < 0 ? -1 : index, 1);
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            move(index <= 0 ? palette.length : index, -1);
          }
        }}
      >
        {palette.map((plant, index) => {
          const active = plant._id === activePlantId;
          const image = plant.images[0];
          return (
            <button
              key={plant._id}
              ref={(node) => {
                optionRefs.current[index] = node;
              }}
              type="button"
              role="option"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              disabled={full}
              onClick={() => onSelect(plant._id)}
              className={cn(
                'relative flex flex-col items-center gap-1 rounded-card border p-1.5 transition-colors duration-100 ease-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow disabled:cursor-not-allowed disabled:opacity-50',
                active
                  ? 'border-accent-600 bg-accent-tint'
                  : 'border-line-subtle bg-bg-surface hover:border-line-strong hover:bg-bg-hover',
              )}
            >
              <span className="relative aspect-square w-full overflow-hidden rounded-input bg-bg-sunken">
                {image ? (
                  <img src={image.url} alt={image.alt} loading="lazy" className="size-full object-cover" />
                ) : (
                  <Watermark name="leaf" size={44} />
                )}
              </span>
              <Tooltip content={plant.commonName}>
                <span className="line-clamp-2 text-center text-micro uppercase tracking-[0.08em] text-fg-secondary">
                  {plant.commonName}
                </span>
              </Tooltip>
            </button>
          );
        })}
      </div>
    </div>
  );
}
