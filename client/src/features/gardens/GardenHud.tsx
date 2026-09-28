/**
 * Floating HUD for the garden. DOM only - the only glass surface DESIGN.md permits
 * (`bg-bg-raised/85 backdrop-blur-[16px] rounded-panel border border-line-strong shadow-l2`).
 *
 * The FPS readout is measured, never hardcoded: the hooks sampled here count real
 * `requestAnimationFrame` deltas over a 1s window. A parent that already measures (the settings
 * panel shares one measurement for the whole page) can pass `fps`/`dpr` and skip the duplicate loop.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Tooltip } from '@/components/ui/Tooltip';
import { cn } from '@/lib/cn';
import { useFrameRate, useRendererDpr } from './hooks';

const GLASS =
  'bg-bg-raised/85 backdrop-blur-[16px] rounded-panel border border-line-strong shadow-l2';

/** The minimum a HUD card needs; keeps the HUD usable from both the owner and the public payload. */
export type HudPlant = {
  slug: string;
  commonName: string;
  botanicalName: string;
};

export function GardenHud({
  plotCount,
  maxPlots,
  mode,
  onOpenSettings,
  onPlace,
  onCancel,
  onResetView,
  fps,
  dpr,
  overlapWarning,
  selectedPlant,
  projectedScreenPosition,
  onCloseSelection,
  onRemoveSelected,
  canPlace = true,
  placing = false,
  className,
}: {
  plotCount: number;
  maxPlots: number;
  mode: 'view' | 'place';
  onOpenSettings: () => void;
  onPlace?: () => void;
  onCancel?: () => void;
  onResetView: () => void;
  fps?: number;
  dpr?: number;
  overlapWarning?: string | null;
  selectedPlant?: HudPlant | null;
  projectedScreenPosition?: { x: number; y: number } | null;
  onCloseSelection?: () => void;
  onRemoveSelected?: () => void;
  canPlace?: boolean;
  placing?: boolean;
  className?: string;
}): React.ReactNode {
  const measuredFps = useFrameRate();
  const measuredDpr = useRendererDpr();
  const shownFps = fps ?? measuredFps;
  const shownDpr = dpr ?? measuredDpr;

  // The card tracks the plant on screen, so it is clamped to keep the whole panel inside the viewport
  // when the projection lands near an edge.
  const cardStyle = useMemo(() => {
    if (!projectedScreenPosition) return null;
    return {
      left: `clamp(160px, ${projectedScreenPosition.x}px, calc(100% - 160px))`,
      top: `clamp(150px, ${projectedScreenPosition.y - 16}px, calc(100% - 24px))`,
    };
  }, [projectedScreenPosition]);

  return (
    <div className={cn('pointer-events-none absolute inset-0 select-none', className)}>
      <div className="absolute right-4 top-4 flex flex-col items-end gap-2">
        <div className={cn(GLASS, 'pointer-events-auto flex items-center gap-3 px-3 py-2')}>
          <span className="mono-label">
            {plotCount} / {maxPlots} plots used
          </span>
          <span aria-hidden="true" className="h-4 w-px bg-line-strong" />
          <span className="mono-label" title="Measured over the last second">
            {shownFps} FPS · DPR {shownDpr}
          </span>
        </div>
        {overlapWarning && (
          <Chip tone="warning" className="pointer-events-auto">
            <Icon name="alert-triangle" size={12} />
            {`Too close to ${overlapWarning}`}
          </Chip>
        )}
      </div>

      {selectedPlant && cardStyle && (
        <div
          style={cardStyle}
          className={cn(
            GLASS,
            'pointer-events-auto absolute w-[260px] -translate-x-1/2 -translate-y-full p-4',
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-body font-semibold text-fg">{selectedPlant.commonName}</p>
              <p className="botanical truncate text-small text-clay-400">{selectedPlant.botanicalName}</p>
            </div>
            {onCloseSelection && (
              <button
                type="button"
                aria-label="Close plant card"
                onClick={onCloseSelection}
                className="-mr-1 -mt-1 shrink-0 rounded-btn p-1.5 text-fg-muted transition-colors duration-100 ease-base hover:bg-bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
              >
                <Icon name="close" size={16} />
              </button>
            )}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <Link
              to={`/plants/${selectedPlant.slug}`}
              className="inline-flex items-center gap-1 rounded-btn text-small text-accent-400 transition-colors duration-100 ease-base hover:text-accent-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
            >
              View profile
              <Icon name="arrow-right" size={14} />
            </Link>
            {/* Removal is only offered while viewing: in placement mode the tile is the subject. */}
            {mode === 'view' && onRemoveSelected && (
              <Button variant="ghost" size="sm" onClick={onRemoveSelected}>
                Remove
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-4 flex justify-center">
        <div className={cn(GLASS, 'pointer-events-auto flex items-center gap-2 p-2')}>
          {mode === 'place' ? (
            <>
              <Button variant="ghost" onClick={onCancel} disabled={!onCancel}>
                Cancel
              </Button>
              <Button
                iconLeft="check"
                onClick={onPlace}
                loading={placing}
                disabled={!onPlace || !canPlace}
                title={canPlace ? undefined : 'Select a free tile first'}
              >
                Place plant
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" iconLeft="settings" onClick={onOpenSettings}>
                Garden settings
              </Button>
              <Button iconLeft="leaf" onClick={onPlace}>
                Place plants
              </Button>
              <Tooltip content="Return the camera to its starting angle">
                <Button variant="ghost" iconLeft="compass" onClick={onResetView} aria-label="Reset view">
                  Reset view
                </Button>
              </Tooltip>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
