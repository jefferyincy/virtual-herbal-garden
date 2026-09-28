/**
 * Regional distribution map.
 *
 * The map is hand-authored SVG - no tiles, no map library. Region positions come from
 * `REGION_COORDS`; a region string the map has no coordinates for is listed separately rather
 * than silently dropped, so a data-entry mistake shows up in the UI instead of hiding a plant.
 *
 * Region counts and the per-region plant rows are derived from one catalogue page (see
 * `usePlantCatalogue`): the spec defines no grouping endpoint and the server caps `pageSize` at
 * 50, so the marker scale and the "unmapped" list are accurate only up to that ceiling. The right
 * panel's count and list come from the authoritative paginated `/api/regions/:region/plants`.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { Watermark } from '@/components/ui/Watermark';
import { Icon } from '@/components/icons';
import { formatNumber, titleCase } from '@/lib/format';
import { usePlantCatalogue, useRegionPlants } from '@/features/plants/hooks';
import type { Plant } from '@/types/api';

/**
 * Approximate plot positions in the 900x800 viewBox, keyed by the seed `region` strings. The map
 * is a schematic of recorded ranges, not a projection: it places each region where it sits in the
 * South Asia-centric frame the catalogue uses.
 */
const REGION_COORDS: Record<string, { x: number; y: number }> = {
  India: { x: 420, y: 610 },
  'South Asia': { x: 470, y: 440 },
  'Southeast Asia': { x: 660, y: 560 },
  Mediterranean: { x: 128, y: 214 },
  'Central Asia': { x: 372, y: 168 },
  'West Asia': { x: 246, y: 312 },
  'North Africa': { x: 112, y: 432 },
  'East Africa': { x: 320, y: 700 },
};

const POPOVER_PREVIEW = 4;

type RegionStat = { region: string; count: number; plants: Plant[] };

export default function MapPage(): ReactNode {
  const [regionFilter, setRegionFilter] = useState('');
  const [familyFilter, setFamilyFilter] = useState('');
  const [nativeOnly, setNativeOnly] = useState(false);
  /** Region whose marker is highlighted; also the popover target until it is dismissed. */
  const [popoverRegion, setPopoverRegion] = useState<string | null>(null);
  /** Region loaded into the right panel - only "View all" moves it, per the screen prompt. */
  const [panelRegion, setPanelRegion] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const catalogue = usePlantCatalogue();

  const families = useMemo(() => {
    const seen = new Set<string>();
    for (const plant of catalogue.items) if (plant.family) seen.add(plant.family);
    return Array.from(seen).sort((a, b) => a.localeCompare(b));
  }, [catalogue.items]);

  /**
   * The schema has no nativeness flag, so the only recorded signal is a plant's own region list.
   * With a region selected, "native" means recorded for that region; with no region selected it
   * means recorded for India or South Asia, the catalogue's native range.
   */
  const nativeRanges = useMemo(
    () => (regionFilter ? [regionFilter] : ['India', 'South Asia']),
    [regionFilter],
  );

  const regionStats = useMemo(() => {
    const byRegion = new Map<string, RegionStat>();
    for (const plant of catalogue.items) {
      if (familyFilter && plant.family !== familyFilter) continue;
      if (nativeOnly && !plant.region.some((region) => nativeRanges.includes(region))) continue;
      for (const region of plant.region) {
        const existing = byRegion.get(region);
        if (existing) {
          existing.count += 1;
          existing.plants.push(plant);
        } else {
          byRegion.set(region, { region, count: 1, plants: [plant] });
        }
      }
    }
    return byRegion;
  }, [catalogue.items, familyFilter, nativeOnly, nativeRanges]);

  const markers = useMemo(
    () =>
      Object.keys(REGION_COORDS)
        .filter((region) => !regionFilter || region === regionFilter)
        .map((region) => ({ region, coords: REGION_COORDS[region], stat: regionStats.get(region) }))
        .filter((marker): marker is { region: string; coords: { x: number; y: number }; stat: RegionStat } =>
          Boolean(marker.coords && marker.stat),
        ),
    [regionFilter, regionStats],
  );

  const maxCount = markers.reduce((max, marker) => Math.max(max, marker.stat.count), 0);

  // Regions the catalogue records that the map has no coordinate for. They are surfaced as text
  // rather than dropped: a typo in a seed record must be visible, not a silently missing plant.
  const unmappedRegions = useMemo(
    () =>
      Array.from(regionStats.values())
        .filter((stat) => !(stat.region in REGION_COORDS))
        .sort((a, b) => b.count - a.count),
    [regionStats],
  );

  function openRegionPanel(region: string): void {
    setPanelRegion(region);
    setPopoverRegion(null);
    setPage(1);
  }

  const controls = (
    <div className="mb-6 flex flex-wrap items-end gap-3">
      <Select
        label="Region"
        aria-label="Filter by region"
        containerClassName="w-full sm:w-[200px]"
        value={regionFilter}
        onChange={(event) => {
          const next = event.target.value;
          setRegionFilter(next);
          setPage(1);
          // Picking a region outright is the same intent as "View all" on its marker.
          setPanelRegion(next || null);
          setPopoverRegion(null);
        }}
        options={[
          { value: '', label: 'All regions' },
          ...Object.keys(REGION_COORDS).map((region) => ({ value: region, label: region })),
        ]}
      />
      <Select
        label="Family"
        aria-label="Filter by family"
        containerClassName="w-full sm:w-[200px]"
        value={familyFilter}
        onChange={(event) => setFamilyFilter(event.target.value)}
        options={[
          { value: '', label: 'All families' },
          ...families.map((family) => ({ value: family, label: family })),
        ]}
      />
      <button
        type="button"
        role="switch"
        aria-checked={nativeOnly}
        onClick={() => setNativeOnly((value) => !value)}
        className="inline-flex h-11 items-center gap-2 rounded-btn border border-line-subtle bg-bg-surface px-3 text-small text-fg-secondary transition-colors duration-100 ease-base hover:border-line-strong hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
      >
        <span
          aria-hidden="true"
          className={`relative h-4 w-8 rounded-full transition-colors duration-100 ease-base ${
            nativeOnly ? 'bg-accent-600' : 'bg-bg-hover'
          }`}
        >
          <span
            className={`absolute top-0.5 size-3 rounded-full bg-fg transition-transform duration-100 ease-base ${
              nativeOnly ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </span>
        Native only
      </button>
      <p className="mono-label max-w-[280px]">
        Native range as recorded: {nativeRanges.join(' / ')}
      </p>
    </div>
  );

  return (
    <div>
      <PageHeader
        eyebrow="ENCYCLOPEDIA"
        title="Distribution map"
        description="Where the catalogue records each medicinal plant. Marker size tracks how many plants a region carries."
      />

      {controls}

      {catalogue.isPending ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton variant="card" className="aspect-[9/8] w-full lg:col-span-2" />
          <Skeleton variant="card" height={420} className="w-full" />
        </div>
      ) : catalogue.isError ? (
        <ErrorState
          title="Couldn't load the map"
          message="The plant catalogue did not respond, so no distribution can be drawn."
          onRetry={() => void catalogue.refetch()}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {markers.length === 0 ? (
              <EmptyState
                title="No regions match these filters"
                description="No plant in the catalogue carries a mapped region under this family or native range."
                action={
                  <Button
                    variant="secondary"
                    iconLeft="refresh"
                    onClick={() => {
                      setFamilyFilter('');
                      setNativeOnly(false);
                      setRegionFilter('');
                    }}
                  >
                    Reset filters
                  </Button>
                }
              />
            ) : (
              <div className="relative overflow-hidden rounded-card border border-line-subtle bg-bg-sunken">
                <svg
                  viewBox="0 0 900 800"
                  role="img"
                  aria-label={`Distribution of ${markers.length} recorded regions`}
                  className="h-auto w-full"
                >
                  {/* Authored coastline and internal boundaries - schematic, faint by design. */}
                  <path
                    className="fill-bg-surface stroke-line-subtle"
                    strokeWidth={1.2}
                    d="M 230,120 Q 330,80 470,95 T 680,125 Q 720,150 710,195 Q 660,225 640,270 T 650,335 Q 630,370 595,420 T 560,490 Q 540,540 520,620 Q 490,690 460,725 Q 440,735 430,710 Q 410,640 375,565 T 340,480 Q 310,430 300,380 T 260,330 Q 220,310 200,260 T 190,190 Z"
                  />
                  <path
                    className="fill-bg-surface stroke-line-subtle"
                    strokeWidth={1}
                    d="M 500,710 Q 525,720 535,745 Q 520,770 498,760 Q 485,735 500,710 Z"
                  />
                  {/* Region boundaries: Western Ghats, Eastern Ghats, Deccan ring, Himalaya arc. */}
                  <g
                    className="stroke-line-subtle"
                    strokeWidth={1}
                    strokeDasharray="3 4"
                    fill="none"
                  >
                    <path d="M 330,420 Q 350,510 380,600 Q 405,655 425,705" />
                    <path d="M 590,420 Q 560,470 540,530 Q 515,610 470,660" />
                    <path d="M 360,450 C 440,430 500,460 520,530 C 500,600 420,620 370,550 Z" />
                    <path d="M 250,150 Q 400,120 560,140 Q 700,160 760,150" />
                  </g>
                  <g className="fill-line-subtle font-mono text-[10px]" aria-hidden="true">
                    <text x="300" y="790">SCHEMATIC - NOT A PROJECTION</text>
                  </g>

                  {markers.map((marker) => {
                    const ratio = maxCount > 0 ? marker.stat.count / maxCount : 0;
                    const radius = 9 + Math.sqrt(ratio) * 20;
                    const active = popoverRegion === marker.region;
                    return (
                      <g
                        key={marker.region}
                        transform={`translate(${marker.coords.x}, ${marker.coords.y})`}
                        className="cursor-pointer"
                        onClick={() => setPopoverRegion(marker.region)}
                      >
                        <circle
                          r={radius}
                          className="fill-accent-500/20 stroke-accent-600"
                          strokeWidth={active ? 2 : 1}
                        />
                        <circle r={Math.max(3, radius * 0.32)} className="fill-accent-400" />
                        <text
                          y={-radius - 6}
                          textAnchor="middle"
                          className="fill-fg font-mono text-[13px]"
                        >
                          {marker.stat.count}
                        </text>
                        <text
                          y={4}
                          x={radius + 8}
                          className="fill-fg-secondary font-mono text-[13px] uppercase"
                        >
                          {marker.region}
                        </text>
                      </g>
                    );
                  })}
                </svg>

                {popoverRegion && (
                  <RegionPopover
                    stat={regionStats.get(popoverRegion)}
                    coords={REGION_COORDS[popoverRegion]}
                    onClose={() => setPopoverRegion(null)}
                    onViewAll={() => openRegionPanel(popoverRegion)}
                  />
                )}

                <div className="absolute bottom-4 left-4 flex flex-wrap items-center gap-2">
                  <Chip tone="neutral">Marker size = plants recorded</Chip>
                  <Chip tone="accent">{formatNumber(maxCount)} at the largest</Chip>
                  {(
                    [
                      ['#1F4A33', 'few'],
                      ['#2F7A4E', 'some'],
                      ['#4FD18B', 'many'],
                      ['#7BE0A8', 'most'],
                    ] as const
                  ).map(([hex, label]) => (
                    <span
                      key={hex}
                      className="inline-flex items-center gap-1.5 rounded-full border border-line-subtle bg-bg-raised/85 px-2 py-0.5 font-mono text-micro uppercase text-fg-secondary"
                    >
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: hex }}
                        aria-hidden="true"
                      />
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {unmappedRegions.length > 0 && (
              <div className="mt-4 rounded-card border border-line-subtle bg-bg-surface p-4">
                <p className="mono-label mb-2">Unmapped regions</p>
                <ul className="flex flex-wrap gap-2">
                  {unmappedRegions.map((stat) => (
                    <li key={stat.region}>
                      <Chip tone="clay">
                        {stat.region} · {formatNumber(stat.count)}
                      </Chip>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-small text-fg-muted">
                  These region names have no coordinate on this map, so they are listed rather than
                  plotted. Add them to the map coordinates or correct the record.
                </p>
              </div>
            )}
          </div>

          <RegionPanel region={panelRegion} page={page} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}

function RegionPopover({
  stat,
  coords,
  onClose,
  onViewAll,
}: {
  stat: RegionStat | undefined;
  coords: { x: number; y: number } | undefined;
  onClose: () => void;
  onViewAll: () => void;
}): ReactNode {
  if (!stat || !coords) return null;
  const preview = stat.plants.slice(0, POPOVER_PREVIEW);

  return (
    // The popover is anchored to the marker: the SVG viewBox is 900x800, so its plot position
    // maps straight onto the container's percentage box.
    <div
      role="dialog"
      aria-label={`${stat.region} region preview`}
      style={{
        left: `${(coords.x / 900) * 100}%`,
        top: `${(coords.y / 800) * 100}%`,
      }}
      className="absolute w-[280px] -translate-x-1/2 translate-y-4 rounded-panel border border-line-strong bg-bg-raised/85 p-4 shadow-l2 backdrop-blur-[16px]"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="mono-label">Selected region</p>
          <h3 className="text-h3 text-fg">{stat.region}</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close region preview"
          className="grid size-9 place-items-center rounded-btn text-fg-muted transition-colors duration-100 ease-base hover:bg-bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
        >
          <Icon name="close" size={16} />
        </button>
      </div>
      <ul className="flex flex-col gap-2">
        {preview.map((plant) => (
          <li key={plant._id} className="flex items-center gap-3">
            <span className="relative size-8 shrink-0 overflow-hidden rounded-micro bg-bg-sunken">
              {plant.images[0] ? (
                <img
                  src={plant.images[0].url}
                  alt={plant.images[0].alt}
                  loading="lazy"
                  className="size-full object-cover"
                />
              ) : (
                <Watermark name="leaf" size={18} />
              )}
            </span>
            <span className="min-w-0 flex-1 truncate text-small text-fg">{plant.commonName}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between border-t border-line-subtle pt-3">
        <span className="mono-label">{formatNumber(stat.count)} recorded</span>
        <Button variant="ghost" size="sm" iconRight="arrow-right" onClick={onViewAll}>
          View all
        </Button>
      </div>
    </div>
  );
}

function RegionPanel({
  region,
  page,
  onPageChange,
}: {
  region: string | null;
  page: number;
  onPageChange: (page: number) => void;
}): ReactNode {
  const plants = useRegionPlants(region ?? undefined, page);

  if (!region) {
    return (
      <Card variant="flat" className="flex flex-col items-center justify-center text-center">
        <EmptyState
          title="No region selected"
          description="Choose a marker on the map to list the plants recorded for that region."
          watermark="map"
        />
      </Card>
    );
  }

  return (
    <Card variant="flat" className="flex max-h-[560px] flex-col">
      <h2 className="text-h2 text-fg">{region}</h2>
      <p className="mono-label mt-1">
        {plants.data
          ? `${formatNumber(plants.data.total)} medicinal plants recorded`
          : 'Counting plants'}
      </p>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
        {plants.isPending ? (
          <div className="flex flex-col gap-2" role="status" aria-label="Loading region plants">
            {[0, 1, 2, 3, 4].map((index) => (
              <Skeleton key={index} height={48} className="w-full rounded-input" />
            ))}
          </div>
        ) : plants.isError ? (
          <ErrorState
            title="Couldn't load this region"
            message="The region plant list did not respond."
            onRetry={() => void plants.refetch()}
          />
        ) : plants.data.items.length === 0 ? (
          <EmptyState
            title="No plants recorded here"
            description="No monograph in the catalogue lists this region yet."
            watermark="leaf"
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {plants.data.items.map((plant) => (
              <li key={plant._id}>
                <Link
                  to={`/plants/${plant.slug}`}
                  className="flex items-center gap-3 rounded-input px-2 py-2 transition-colors duration-100 ease-base hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
                >
                  <span className="relative size-10 shrink-0 overflow-hidden rounded-input bg-bg-sunken">
                    {plant.images[0] ? (
                      <img
                        src={plant.images[0].url}
                        alt={plant.images[0].alt}
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    ) : (
                      <Watermark name="leaf" size={22} />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-body text-fg">{plant.commonName}</span>
                    <span className="botanical truncate text-small text-clay-400">
                      {plant.botanicalName}
                    </span>
                  </span>
                  <span className="mono-label shrink-0">{titleCase(plant.partsUsed[0] ?? '')}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {plants.data && plants.data.totalPages > 1 && (
        <Pagination
          className="mt-4 justify-center"
          page={plants.data.page}
          totalPages={plants.data.totalPages}
          onPageChange={onPageChange}
        />
      )}
    </Card>
  );
}
