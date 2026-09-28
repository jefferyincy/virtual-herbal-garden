/**
 * Placement mode (`/garden/place`). Full-bleed canvas in `mode='place'` with the accent grid, the tile
 * under the pointer highlighted, and a translucent ghost of the chosen species locked to it.
 *
 * Two distinct tile states, deliberately handled differently:
 *  - OCCUPIED: another plot already sits on the tile. It is not selectable at all - `isTileFree` gates
 *    both the ghost and the primary action, so the server can never answer 409 for a locally known
 *    conflict.
 *  - ADJACENT: the tile is free and selectable, but Manhattan distance 1 to a DIFFERENT species draws
 *    a "Too close to X" warning. Adjacency is a horticultural suggestion, not a rule, so it never
 *    blocks placement.
 *
 * A 409 still has to be handled: another session can take the tile between render and click. The user
 * stays in placement mode, the tile is marked occupied, and the conflict is surfaced - never a crash
 * and never a silently dropped action.
 */
import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import { Icon } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { Plant } from '@/types/api';
import { PlacementOverlay } from '@/features/gardens/PlacementOverlay';
import { GardenScene, type ResetViewHandle } from '@/features/gardens/scene/GardenScene';
import type { TileCoord } from '@/features/gardens/scene/Ground';
import {
  GARDEN_GRID,
  GARDEN_MAX_PLOTS,
  isTileFree,
  useGarden,
  useGardenSettings,
  useGardens,
  usePlaceablePlants,
  usePlantPlot,
} from '@/features/gardens/hooks';

/** Manhattan distance 1 means the tiles share an edge, not just a corner. */
function isAdjacent(a: TileCoord, b: TileCoord): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.z - b.z) === 1;
}

export default function PlaceModePage(): React.ReactNode {
  const navigate = useNavigate();
  const toast = useToast();
  const reducedMotion = useReducedMotion();
  const resetViewRef: ResetViewHandle = useRef(null);

  const gardens = useGardens();
  const primaryGarden = gardens.data?.items[0] ?? null;
  const gardenId = primaryGarden?._id ?? '';
  const garden = useGarden(primaryGarden?._id);
  const palette = usePlaceablePlants();
  const { settings } = useGardenSettings();
  const plantPlot = usePlantPlot(gardenId);

  const [activePlantId, setActivePlantId] = useState<string | null>(null);
  const [hoveredTile, setHoveredTile] = useState<TileCoord | null>(null);
  const [tileError, setTileError] = useState<string | null>(null);
  // Tiles the server rejected as taken: kept locally so the grid stays honest until the refetch lands.
  const [takenTiles, setTakenTiles] = useState<TileCoord[]>([]);

  const plants = palette.data?.items ?? [];
  const activePlant: Plant | null =
    plants.find((plant) => plant._id === activePlantId) ?? plants[0] ?? null;

  const plots = garden.data?.garden.plots ?? [];
  const plotCount = plots.length;
  const atCapacity = plotCount >= GARDEN_MAX_PLOTS;

  const occupied = useMemo(() => {
    const known = plots.map((plot) => ({ x: plot.x, z: plot.z }));
    return [...known, ...takenTiles];
  }, [plots, takenTiles]);

  const tileFree = hoveredTile ? isTileFree(occupied, hoveredTile.x, hoveredTile.z) : false;

  /**
   * The nearest edge-adjacent neighbour of a DIFFERENT species. Same-species neighbours are not a
   * warning: planting a bed of one herb is a legitimate choice, and the mockup only warns on a clash.
   */
  const neighbour = useMemo(() => {
    if (!hoveredTile || !activePlant) return null;
    return (
      plots.find(
        (plot) =>
          plot.plantId !== null &&
          plot.plantId._id !== activePlant._id &&
          isAdjacent(hoveredTile, { x: plot.x, z: plot.z }),
      )?.plantId ?? null
    );
  }, [hoveredTile, plots, activePlant]);

  const canPlace = Boolean(activePlant && hoveredTile && tileFree && !atCapacity);

  const placeAt = (tile: TileCoord) => {
    if (!activePlant || atCapacity) return;
    plantPlot.mutate(
      { x: tile.x, z: tile.z, plantId: activePlant._id },
      {
        onSuccess: () => {
          // Placement mode STAYS open: users plant several species in a row, and bouncing back to
          // /garden after every tile would make the bed tedious to fill.
          toast.push({
            variant: 'success',
            title: `${activePlant.commonName} planted`,
            description: 'Pick another tile to keep planting.',
          });
        },
        onError: (error) => {
          // 409: the tile was taken by another session between render and click. Keep the user in
          // placement mode, mark the tile occupied so the ghost/primary button stop offering it, and
          // say what happened instead of dropping the action.
          if (error instanceof ApiError && error.status === 409) {
            setTakenTiles((prev) => [...prev, tile]);
            setTileError('That tile was planted from another session. Choose a free tile.');
            void garden.refetch();
            return;
          }
          setTileError(
            error instanceof ApiError ? error.message : 'The plant could not be placed. Try again.',
          );
        },
      },
    );
  };

  const submit = () => {
    if (hoveredTile && canPlace) placeAt(hoveredTile);
  };

  if (gardens.isLoading || garden.isLoading || palette.isLoading) {
    return (
      <div
        role="status"
        aria-label="Loading placement mode"
        className="flex size-full items-center justify-center bg-bg-sunken"
      >
        <Skeleton variant="card" width={280} height={160} />
      </div>
    );
  }

  if (gardens.isError || garden.isError) {
    return (
      <div className="flex size-full items-center justify-center bg-bg-sunken p-6">
        <ErrorState
          title="Placement mode could not be opened"
          message="Your garden could not be loaded. Check your connection and try again."
          onRetry={() => void (gardens.isError ? gardens.refetch() : garden.refetch())}
        />
      </div>
    );
  }

  if (!primaryGarden) {
    return (
      <div className="flex size-full items-center justify-center bg-bg-sunken p-6">
        <EmptyState
          title="No garden to plant into"
          description="Create a garden first, then come back to fill its 6x6 bed."
          action={<Button onClick={() => navigate('/gardens')}>Go to my gardens</Button>}
        />
      </div>
    );
  }

  if (palette.isError) {
    return (
      <div className="flex size-full items-center justify-center bg-bg-sunken p-6">
        <ErrorState
          title="The plant catalogue could not be loaded"
          message="The placement palette needs the plant list. Try again in a moment."
          onRetry={() => void palette.refetch()}
        />
      </div>
    );
  }

  if (plants.length === 0) {
    // No species to plant: link out to the encyclopedia rather than showing an empty rail.
    return (
      <div className="flex size-full items-center justify-center bg-bg-sunken p-6">
        <EmptyState
          title="No plants available"
          description="The catalogue returned no species, so there is nothing to place in the bed."
          action={
            <Button iconLeft="grid" onClick={() => navigate('/plants')}>
              Browse the encyclopedia
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="relative size-full bg-bg-sunken">
      <GardenScene
        plots={plots}
        mode="place"
        hoveredTile={hoveredTile}
        onHoverTile={(tile) => {
          setHoveredTile(tile);
          setTileError(null);
        }}
        onTileClick={(tile) => {
          setTileError(null);
          // Clicking a free grid tile plants the selected species there - the primary gesture, kept
          // alongside the hover + "Place plant" button. An occupied tile explains itself instead.
          if (!isTileFree(occupied, tile.x, tile.z)) {
            setHoveredTile(tile);
            setTileError('That tile is already planted. Pick a free tile.');
            return;
          }
          setHoveredTile(tile);
          placeAt(tile);
        }}
        ghostPlant={tileFree ? activePlant : null}
        settings={settings}
        className="size-full"
        resetViewRef={resetViewRef}
        reducedMotion={Boolean(reducedMotion)}
      />

      <PlacementOverlay
        plants={plants}
        activePlantId={activePlant?._id ?? null}
        onSelect={setActivePlantId}
        plotCount={plotCount}
        maxPlots={GARDEN_MAX_PLOTS}
        className="absolute left-4 top-4 max-h-[calc(100%-2rem)] overflow-y-auto"
      />

      <div className="pointer-events-none absolute right-4 top-4 flex flex-col items-end gap-2">
        <div className="pointer-events-auto rounded-panel border border-line-strong bg-bg-raised/85 px-3 py-2 shadow-l2 backdrop-blur-[16px]">
          <span className="mono-label">
            {plotCount} / {GARDEN_MAX_PLOTS} plots used
          </span>
        </div>
        {neighbour && (
          <Chip tone="warning">
            <Icon name="alert-triangle" size={12} />
            {`Too close to ${neighbour.commonName}`}
          </Chip>
        )}
        {atCapacity && (
          <Chip tone="warning">
            <Icon name="grid" size={12} />
            Bed full - remove a plant to place another
          </Chip>
        )}
      </div>

      {hoveredTile && activePlant && (
        // Tile chip above the ghost. A check icon for a free tile, a warning triangle for a neighbour
        // clash, so the state is never carried by colour alone.
        <div
          className={cn(
            'pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[calc(50%+120px)]',
            'rounded-panel border bg-bg-raised/85 px-3 py-2 shadow-l2 backdrop-blur-[16px]',
            neighbour ? 'border-warning/60' : 'border-line-strong',
          )}
        >
          <span className="flex items-center gap-2 text-small text-fg">
            <Icon
              name={neighbour ? 'alert-triangle' : 'check'}
              size={15}
              className={neighbour ? 'text-warning' : 'text-accent-400'}
            />
            {neighbour
              ? `Too close to ${neighbour.commonName}`
              : `${activePlant.commonName} · ${tileFree ? 'fits here' : 'tile occupied'}`}
          </span>
          <span className="mono-label mt-1 block">
            TILE X {hoveredTile.x} · Z {hoveredTile.z} · GRID {GARDEN_GRID}x{GARDEN_GRID}
          </span>
        </div>
      )}

      {tileError && (
        <ErrorBanner
          message={tileError}
          onDismiss={() => setTileError(null)}
          className="absolute inset-x-4 bottom-24 mx-auto max-w-[520px]"
        />
      )}

      <div className="absolute inset-x-0 bottom-4 flex justify-center">
        <div className="flex items-center gap-2 rounded-panel border border-line-strong bg-bg-raised/85 p-2 shadow-l2 backdrop-blur-[16px]">
          <Button variant="ghost" onClick={() => navigate('/garden')}>
            Cancel
          </Button>
          <Button
            iconLeft="check"
            loading={plantPlot.isPending}
            disabled={!canPlace}
            onClick={submit}
            title={
              atCapacity
                ? 'The bed is full'
                : !hoveredTile
                  ? 'Hover a tile on the bed first'
                  : !tileFree
                    ? 'That tile is already planted'
                    : undefined
            }
          >
            Place plant
          </Button>
        </div>
      </div>

      {!hoveredTile && (
        <p className="mono-label pointer-events-none absolute inset-x-0 bottom-20 text-center">
          Hover a tile on the bed, then place
        </p>
      )}
    </div>
  );
}
