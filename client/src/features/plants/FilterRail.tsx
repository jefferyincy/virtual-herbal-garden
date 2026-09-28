/**
 * Encyclopedia filter rail.
 *
 * Desktop: a sticky left rail. Below `lg` the same groups move into a right-hand Drawer, opened
 * from the plants page header - the rail itself is never duplicated, `renderGroups()` is shared.
 */
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { FilterChip } from '@/components/ui/Chip';
import { Drawer } from '@/components/ui/Drawer';
import { Skeleton } from '@/components/ui/Skeleton';
import { Icon } from '@/components/icons';
import { titleCase } from '@/lib/format';
import type { MedicalSystem, PlantFilters, PlantPart } from '@/types/api';
import type { PlantFacets } from '@/features/plants/types';

export type FilterRailProps = {
  filters: PlantFilters;
  facets: PlantFacets;
  /** True while the single facet-derivation fetch is in flight. */
  facetsLoading: boolean;
  /** True when that fetch failed, so the rail can say why it is empty. */
  facetsError: boolean;
  /** Number of active filters other than `q`; drives the header badge and the clear action. */
  activeCount: number;
  onToggleFamily: (family: string) => void;
  onTogglePart: (part: PlantPart) => void;
  onToggleRegion: (region: string) => void;
  onToggleSystem: (system: MedicalSystem) => void;
  onToxic: (toxic: boolean | undefined) => void;
  onClear: () => void;
  /** Drawer state; ignored at `lg` and above. */
  open: boolean;
  onClose: () => void;
};

export function FilterRail({
  filters,
  facets,
  facetsLoading,
  facetsError,
  activeCount,
  onToggleFamily,
  onTogglePart,
  onToggleRegion,
  onToggleSystem,
  onToxic,
  onClear,
  open,
  onClose,
}: FilterRailProps): ReactNode {
  const groups = (
    <FilterGroups
      filters={filters}
      facets={facets}
      facetsLoading={facetsLoading}
      facetsError={facetsError}
      activeCount={activeCount}
      onToggleFamily={onToggleFamily}
      onTogglePart={onTogglePart}
      onToggleRegion={onToggleRegion}
      onToggleSystem={onToggleSystem}
      onToxic={onToxic}
      onClear={onClear}
    />
  );

  return (
    <>
      <aside
        aria-label="Plant filters"
        className="hidden lg:sticky lg:top-topnav lg:block lg:max-h-[calc(100vh-theme(spacing.topnav)-2rem)] lg:self-start lg:overflow-y-auto lg:pb-8 lg:pr-1"
      >
        {groups}
      </aside>
      <Drawer open={open} onClose={onClose} title="Filters" side="right" width={340}>
        {groups}
      </Drawer>
    </>
  );
}

function FilterGroups({
  filters,
  facets,
  facetsLoading,
  facetsError,
  activeCount,
  onToggleFamily,
  onTogglePart,
  onToggleRegion,
  onToggleSystem,
  onToxic,
  onClear,
}: Omit<FilterRailProps, 'open' | 'onClose'>): ReactNode {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">

        <span className="mono-label">
          {activeCount === 0 ? 'No filters' : `${activeCount} active`}
        </span>
        {activeCount > 0 && (
          <Button variant="ghost" size="sm" iconLeft="close" onClick={onClear}>
            Clear filters
          </Button>
        )}
      </div>

      <FacetGroup title="Family">
        {facetsLoading ? (
          <FacetSkeleton />
        ) : facetsError ? (
          <FacetError />
        ) : facets.families.length === 0 ? (
          <p className="text-small text-fg-muted">No families recorded yet.</p>
        ) : (
          facets.families.map((family) => (
            <FilterChip
              key={family}
              active={filters.family === family}
              onClick={() => onToggleFamily(family)}
            >
              {family}
            </FilterChip>
          ))
        )}
      </FacetGroup>

      <FacetGroup title="Part used">
        {facetsLoading ? (
          <FacetSkeleton />
        ) : facetsError ? (
          <FacetError />
        ) : (
          facets.parts.map((part) => (
            <FilterChip
              key={part}
              active={filters.part === part}
              onClick={() => onTogglePart(part)}
            >
              {titleCase(part)}
            </FilterChip>
          ))
        )}
      </FacetGroup>

      <FacetGroup title="Region">
        {facetsLoading ? (
          <FacetSkeleton />
        ) : facetsError ? (
          <FacetError />
        ) : (
          facets.regions.map((region) => (
            <FilterChip
              key={region}
              active={filters.region === region}
              onClick={() => onToggleRegion(region)}
            >
              {region}
            </FilterChip>
          ))
        )}
      </FacetGroup>

      <FacetGroup title="System">
        {facetsLoading ? (
          <FacetSkeleton />
        ) : facetsError ? (
          <FacetError />
        ) : (
          facets.systems.map((system) => (
            <FilterChip
              key={system}
              active={filters.system === system}
              onClick={() => onToggleSystem(system)}
            >
              {titleCase(system)}
            </FilterChip>
          ))
        )}
      </FacetGroup>

      <FacetGroup title="Toxicity">
        <FilterChip
          active={filters.toxic === true}
          onClick={() => onToxic(filters.toxic === true ? undefined : true)}
        >
          <Icon name="alert-triangle" size={12} />
          Toxic only
        </FilterChip>
        <FilterChip
          active={filters.toxic === false}
          onClick={() => onToxic(filters.toxic === false ? undefined : false)}
        >
          <Icon name="shield" size={12} />
          No known toxicity
        </FilterChip>
      </FacetGroup>
    </div>
  );
}

function FacetGroup({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <div className="flex flex-col gap-2">
      <p className="mono-label">{title}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

/** The rail is derived from the catalogue call, so its failure is reported where the gap shows. */
function FacetError(): ReactNode {
  return (
    <p className="flex items-center gap-1.5 text-small text-fg-muted">
      <Icon name="info" size={14} />
      Options unavailable - the catalogue did not load.
    </p>
  );
}

/** Shimmer stand-in whose height matches one wrapped chip row. */
function FacetSkeleton(): ReactNode {
  return (
    <span className="flex flex-wrap gap-1.5" role="status" aria-label="Loading filters">
      {[64, 88, 72, 96, 80].map((width) => (
        <Skeleton key={width} width={width} height={24} className="rounded-full" />
      ))}
    </span>
  );
}
