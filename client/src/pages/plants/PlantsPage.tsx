/**
 * Encyclopedia: filterable, URL-driven, paginated plant grid.
 *
 * All filter state lives in `useSearchParams`, so a filtered view is shareable and the browser
 * back button steps through filter changes. Invalid or empty values are dropped before they
 * reach the server - a param of `''` must never become `?family=` on the wire.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Pagination } from '@/components/ui/Pagination';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { SkeletonPlantGrid } from '@/components/ui/Skeleton';
import { PlantCard } from '@/components/plant/PlantCard';
import { Icon } from '@/components/icons';
import { formatNumber } from '@/lib/format';
import { FilterRail } from '@/features/plants/FilterRail';
import { usePlantFacets, usePlants } from '@/features/plants/hooks';
import {
  MEDICAL_SYSTEM_VALUES,
  PLANT_PART_VALUES,
  PLANT_SORTS,
  type PlantSort,
} from '@/features/plants/types';
import type { MedicalSystem, PlantFilters, PlantPart } from '@/types/api';

const SEARCH_DEBOUNCE_MS = 300;

/** Filter keys the rail owns; `q` and `page` are handled separately. */
const RAIL_KEYS = ['family', 'part', 'region', 'system', 'toxic', 'ailment'] as const;

function readText(params: URLSearchParams, key: string): string | undefined {
  const value = params.get(key)?.trim();
  return value ? value : undefined;
}

/** Guards a raw param against its runtime vocabulary; anything else is treated as unset. */
function readEnum<T extends string>(
  params: URLSearchParams,
  key: string,
  allowed: readonly T[],
): T | undefined {
  const value = readText(params, key);
  if (!value) return undefined;
  return (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

function readToxic(params: URLSearchParams): boolean | undefined {
  const value = params.get('toxic');
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function readPage(params: URLSearchParams): number {
  const page = Number(params.get('page') ?? '');
  return Number.isFinite(page) && page >= 1 ? Math.trunc(page) : 1;
}

export default function PlantsPage(): ReactNode {
  const [searchParams, setSearchParams] = useSearchParams();
  const [railOpen, setRailOpen] = useState(false);

  const filters = useMemo<PlantFilters>(
    () => ({
      q: readText(searchParams, 'q'),
      family: readText(searchParams, 'family'),
      part: readEnum(searchParams, 'part', PLANT_PART_VALUES),
      region: readText(searchParams, 'region'),
      system: readEnum(searchParams, 'system', MEDICAL_SYSTEM_VALUES),
      toxic: readToxic(searchParams),
      sort: readEnum(searchParams, 'sort', PLANT_SORTS),
      ailment: readText(searchParams, 'ailment'),
      page: readPage(searchParams),
    }),
    [searchParams],
  );

  // `toxic: false` is an active filter but falsy, so it cannot go through a plain Boolean test.
  const activeCount = RAIL_KEYS.filter((key) =>
    key === 'toxic' ? filters.toxic !== undefined : Boolean(filters[key]),
  ).length;
  const qFromUrl = filters.q ?? '';
  const [field, setField] = useState(qFromUrl);

  // The 404 page's search box links straight to `/plants?q=...`, so the field follows the URL.
  useEffect(() => {
    setField(qFromUrl);
  }, [qFromUrl]);

  // Debounced write of the search box into `q`; a pending keystroke is cancelled on unmount.
  useEffect(() => {
    if (field === qFromUrl) return;
    const timer = setTimeout(() => {
      updateParams((params) => {
        const trimmed = field.trim();
        if (trimmed) params.set('q', trimmed);
        else params.delete('q');
        params.delete('page');
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // Deliberately keyed on the field and the URL value only: depending on setSearchParams
    // identity would restart the debounce on every unrelated param change.
  }, [field, qFromUrl, setSearchParams]);

  const plants = usePlants(filters);
  const { facets, isPending: facetsPending, isError: facetsError } = usePlantFacets();

  function updateParams(mutate: (params: URLSearchParams) => void): void {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      mutate(next);
      return next;
    });
  }

  function toggleFilter(key: (typeof RAIL_KEYS)[number], value: string): void {
    updateParams((params) => {
      if (params.get(key) === value) params.delete(key);
      else params.set(key, value);
      params.delete('page');
    });
  }

  function setSort(sort: PlantSort): void {
    updateParams((params) => params.set('sort', sort));
  }

  function clearFilters(): void {
    updateParams((params) => {
      for (const key of RAIL_KEYS) params.delete(key);
      params.delete('page');
    });
  }

  /** The empty state's action also drops `q`, or clearing the rail could leave the grid empty. */
  function clearEverything(): void {
    updateParams((params) => {
      for (const key of RAIL_KEYS) params.delete(key);
      params.delete('q');
      params.delete('page');
    });
    setField('');
  }

  const headerActions = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Input
        type="search"
        value={field}
        onChange={(event) => setField(event.target.value)}
        placeholder="Search plants"
        aria-label="Search plants"
        icon="search"
        containerClassName="w-[200px] sm:w-64"
      />
      <Link
        to="/plants/compare"
        className="inline-flex h-11 items-center justify-center gap-2 rounded-btn border border-line-strong px-4 text-body text-fg transition-[background-color,border-color,transform] duration-100 ease-base hover:-translate-y-px hover:bg-bg-hover active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
      >
        <Icon name="layers" size={18} />
        Compare
      </Link>
      <Button
        variant="secondary"
        iconLeft="filter"
        onClick={() => setRailOpen(true)}
        className="lg:hidden"
      >
        Filters
        {activeCount > 0 && (
          <span className="ml-1 rounded-full bg-accent-tint px-1.5 font-mono text-micro text-accent-400">
            {activeCount}
          </span>
        )}
      </Button>
    </div>
  );

  return (
    <div>
      <PageHeader
        eyebrow="ENCYCLOPEDIA"
        title="Plants"
        description="Cited monographs for every medicinal plant in the garden - filter by family, part used, region, medical system or toxicity."
        actions={headerActions}
      />

      <div className="grid gap-8 lg:grid-cols-[248px_1fr]">
        <FilterRail
          filters={filters}
          facets={facets}
          facetsLoading={facetsPending}
          facetsError={facetsError}
          activeCount={activeCount}
          onToggleFamily={(family) => toggleFilter('family', family)}
          onTogglePart={(part: PlantPart) => toggleFilter('part', part)}
          onToggleRegion={(region) => toggleFilter('region', region)}
          onToggleSystem={(system: MedicalSystem) => toggleFilter('system', system)}
          onToxic={(toxic) => {
            updateParams((params) => {
              if (toxic === undefined) params.delete('toxic');
              else params.set('toxic', String(toxic));
              params.delete('page');
            });
          }}
          onClear={clearFilters}
          open={railOpen}
          onClose={() => setRailOpen(false)}
        />

        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <SegmentedControl
              options={[
                { value: 'name', label: 'Name' },
                { value: 'recent', label: 'Recent' },
                { value: 'family', label: 'Family' },
              ]}
              value={filters.sort ?? 'name'}
              onChange={(value) => setSort(value as PlantSort)}
            />
            <span className="mono-label">
              {plants.data
                ? `${formatNumber(plants.data.items.length)} of ${formatNumber(plants.data.total)} plants`
                : 'Loading plants'}
            </span>
          </div>

          {plants.isPending ? (
            <SkeletonPlantGrid count={6} />
          ) : plants.isError ? (
            <ErrorState
              title="Couldn't load plants"
              message="The encyclopedia did not respond. Check your connection and try again."
              onRetry={() => void plants.refetch()}
            />
          ) : plants.data.items.length === 0 ? (
            <EmptyState
              title="No plants match these filters"
              description="Nothing in the catalogue matches this combination. Clear the filters to see every monograph."
              action={
                <Button variant="secondary" iconLeft="close" onClick={clearEverything}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {plants.data.items.map((plant) => (
                  <PlantCard key={plant._id} plant={plant} />
                ))}
              </div>
              {plants.data.totalPages > 1 && (
                <Pagination
                  className="mt-8"
                  page={plants.data.page}
                  totalPages={plants.data.totalPages}
                  onPageChange={(page) =>
                    updateParams((params) => {
                      if (page <= 1) params.delete('page');
                      else params.set('page', String(page));
                    })
                  }
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
