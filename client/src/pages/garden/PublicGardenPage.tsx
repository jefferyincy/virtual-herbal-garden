/**
 * `/g/:slug` - the read-only shared garden.
 *
 * This page DELIBERATELY does not use `AppShell`: the mockup gives it a slim top banner instead of the
 * full nav so a visitor arriving from a share link lands on the garden, not on the app chrome. It also
 * does not render the owner HUD - only a plot-count chip and a read-only bottom bar - because an
 * anonymous visitor can see a garden but cannot change it.
 *
 * The endpoint 404s for a private or unknown garden, so the not-public state is rendered from a 404 -
 * never a stack trace, and never a distinction between "private" and "missing" (the server deliberately
 * does not leak which one it is, so this page must not either).
 */
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import { Icon } from '@/components/icons';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Watermark } from '@/components/ui/Watermark';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { GardenScene } from '@/features/gardens/scene/GardenScene';
import type { PlotPlant } from '@/features/gardens/hooks';
import { useGardenSettings, usePublicGarden } from '@/features/gardens/hooks';
import type { GardenPlotDetail, PublicGardenPlot, PlotStage } from '@/features/gardens/hooks';

/** The public payload is a projection of a plot; the scene needs the fuller shape to render. */
function toScenePlot(plot: PublicGardenPlot): GardenPlotDetail {
  const plant: PlotPlant | null = plot.plant
    ? {
        _id: plot.plant.slug,
        slug: plot.plant.slug,
        commonName: plot.plant.commonName,
        botanicalName: plot.plant.botanicalName,
        family: plot.plant.family,
        images: plot.plant.image
          ? [{ url: plot.plant.image, alt: plot.plant.commonName, credit: '' }]
          : [],
        modelUrl: null,
        modelScale: 1,
        toxicity: plot.plant.toxicity,
      }
    : null;
  return { _id: plot.id, x: plot.x, z: plot.z, plantedAt: '', stage: plot.stage, plantId: plant };
}

/** `curatedNote` marks a plant the owner annotated. The server always sends null today. */
function hasCuratedNote(plot: PublicGardenPlot): boolean {
  return plot.curatedNote !== null;
}

const STAGE_LABEL: Record<PlotStage, string> = {
  seedling: 'Seedling',
  growing: 'Growing',
  mature: 'Mature',
  flowering: 'Flowering',
};

export default function PublicGardenPage(): React.ReactNode {
  const { slug } = useParams<{ slug: string }>();
  const reducedMotion = useReducedMotion();
  const garden = usePublicGarden(slug);
  const { settings } = useGardenSettings();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const payload = garden.data;
  const plots = payload?.garden.plots ?? [];
  const scenePlots = useMemo(() => plots.map(toScenePlot), [plots]);
  const selected = plots.find((plot) => plot.id === selectedId) ?? null;
  // The bottom bar shows the first three planted species, as the mockup's read-only strip.
  const featured = plots.slice(0, 3);

  if (garden.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-sunken p-6">
        <Skeleton variant="card" width={320} height={180} />
      </div>
    );
  }

  if (garden.isError || !payload) {
    const notFound = garden.error instanceof ApiError && garden.error.status === 404;
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-sunken p-6">
        {notFound ? (
          // Private and unknown share the same 404 server-side on purpose, so this copy covers both.
          <EmptyState
            watermark="lock"
            title="This garden is not public"
            description="The link may be private, or the garden may have been deleted. Ask the owner to share it again."
            action={
              <Link
                to="/"
                className="inline-flex h-11 items-center gap-2 rounded-btn bg-accent-500 px-4 font-semibold text-fg-onAccent transition duration-[120ms] ease-base hover:-translate-y-px hover:bg-accent-400"
              >
                Visit Virtual Herbal Garden
              </Link>
            }
          />
        ) : (
          <ErrorState
            title="This garden could not be loaded"
            message="The request failed on the way here. Check your connection and try again."
            onRetry={() => void garden.refetch()}
          />
        )}
      </div>
    );
  }

  const ownerName = payload.owner?.name ?? 'A gardener';

  return (
    <div className="flex min-h-screen flex-col bg-bg-sunken">
      {/* Slim share banner: identity + read-only contract + the conversion action, no nav links. */}
      <header className="flex flex-wrap items-center gap-3 border-b border-line-subtle bg-bg-base/80 px-4 py-3 backdrop-blur-[12px] sm:px-6">
        <Avatar name={ownerName} size={36} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-h3 text-fg">{payload.garden.name}</h1>
          <p className="mono-label">
            Public · {payload.garden.plantCount} plants
            {payload.owner ? ` · ${payload.owner.handle}` : ''}
          </p>
        </div>
        <Link
          to="/register"
          className="inline-flex h-10 items-center gap-2 rounded-btn border border-line-strong px-4 text-small font-semibold text-fg transition duration-[120ms] ease-base hover:-translate-y-px hover:bg-bg-hover"
        >
          Make your own
        </Link>
      </header>

      <div className="relative min-h-0 flex-1">
        <GardenScene
          plots={scenePlots}
          selectedPlotId={selectedId ?? undefined}
          onSelectPlot={(plotId) => setSelectedId(plotId)}
          onClearSelection={() => setSelectedId(null)}
          settings={settings}
          className="size-full"
          reducedMotion={Boolean(reducedMotion)}
        />

        <div className="pointer-events-none absolute right-4 top-4">
          <div className="rounded-panel border border-line-strong bg-bg-raised/85 px-3 py-2 shadow-l2 backdrop-blur-[16px]">
            <span className="mono-label">{payload.garden.plantCount} plants</span>
          </div>
        </div>

        {selected?.plant && (
          <div className="absolute bottom-28 right-4 w-[280px] rounded-panel border border-line-strong bg-bg-raised/85 p-4 shadow-l2 backdrop-blur-[16px]">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-body font-semibold text-fg">{selected.plant.commonName}</p>
                <p className="botanical truncate text-small text-clay-400">
                  {selected.plant.botanicalName}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close plant card"
                onClick={() => setSelectedId(null)}
                className="-mr-1 -mt-1 shrink-0 rounded-btn p-1.5 text-fg-muted transition-colors duration-100 ease-base hover:bg-bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
              >
                <Icon name="close" size={16} />
              </button>
            </div>
            <p className="mono-label mt-2">
              {selected.plant.family} · {STAGE_LABEL[selected.stage]} · tile {selected.x},{selected.z}
            </p>
            {/*
              Curated star: wired to `curatedNote`, which the server always sends as null today. The
              affordance stays so a curated flag lights up the moment the field carries data - it is
              waiting on data, not dead code.
            */}
            {hasCuratedNote(selected) && (
              <p className="mt-2 flex items-center gap-1 text-small text-accent-400">
                <Icon name="star" size={14} />
                Owner's note
              </p>
            )}
            {/* No "Plant this" button: the visitor does not own this garden. */}
            <Link
              to={`/plants/${selected.plant.slug}`}
              className="mt-3 inline-flex items-center gap-1 rounded-btn text-small text-accent-400 transition-colors duration-100 ease-base hover:text-accent-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
            >
              View full profile
              <Icon name="arrow-right" size={14} />
            </Link>
          </div>
        )}

        <div className="absolute inset-x-0 bottom-4 flex justify-center px-4">
          <div className="flex max-w-full items-stretch gap-2 overflow-x-auto rounded-panel border border-line-strong bg-bg-raised/85 p-2 shadow-l2 backdrop-blur-[16px]">
            {featured.length === 0 && (
              <span className="mono-label px-3 py-2">This bed is empty</span>
            )}
            {featured.map((plot) =>
              plot.plant ? (
                <button
                  key={plot.id}
                  type="button"
                  onClick={() => setSelectedId(plot.id)}
                  className={cn(
                    'flex w-[180px] shrink-0 items-center gap-3 rounded-card border p-2 text-left transition-colors duration-100 ease-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow',
                    plot.id === selectedId
                      ? 'border-accent-600 bg-accent-tint'
                      : 'border-line-subtle hover:border-line-strong hover:bg-bg-hover',
                  )}
                >
                  <span className="relative size-11 shrink-0 overflow-hidden rounded-input bg-bg-sunken">
                    {plot.plant.image ? (
                      <img
                        src={plot.plant.image}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    ) : (
                      <Watermark name="leaf" size={28} />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1">
                      <span className="truncate text-small text-fg">{plot.plant.commonName}</span>
                      {hasCuratedNote(plot) && (
                        <Icon name="star" size={12} className="shrink-0 text-accent-400" />
                      )}
                    </span>
                    <span className="botanical block truncate text-micro text-clay-400">
                      {plot.plant.botanicalName}
                    </span>
                  </span>
                </button>
              ) : null,
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
