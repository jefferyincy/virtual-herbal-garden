/**
 * Traditional-use browser: complaints in a grouped left rail, matching plants in the main column.
 *
 * This list is a record of traditional use, not a prescription - the count line says so, and the
 * toxicity marker on a card links the reader to the plant's safety notes.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Chip, FilterChip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Pagination } from '@/components/ui/Pagination';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tooltip } from '@/components/ui/Tooltip';
import { Watermark } from '@/components/ui/Watermark';
import { Icon } from '@/components/icons';
import { formatNumber, titleCase } from '@/lib/format';
import { useAilmentPlants, useAilments } from '@/features/plants/hooks';
import {
  AILMENT_SYSTEM_LABELS,
  AILMENT_SYSTEM_ORDER,
  type AilmentGroup,
  type AilmentWithCount,
} from '@/features/plants/types';
import type { Plant } from '@/types/api';

export default function AilmentsPage(): ReactNode {
  const [searchParams, setSearchParams] = useSearchParams();
  const [railQuery, setRailQuery] = useState('');
  const [page, setPage] = useState(1);

  const ailments = useAilments();
  const selectedParam = searchParams.get('selected')?.trim() || undefined;

  const groups = useMemo<AilmentGroup[]>(() => {
    const bySystem = new Map<string, AilmentWithCount[]>();
    for (const ailment of ailments.data?.items ?? []) {
      const bucket = bySystem.get(ailment.system);
      if (bucket) bucket.push(ailment);
      else bySystem.set(ailment.system, [ailment]);
    }
    return AILMENT_SYSTEM_ORDER.map((system) => ({
      system,
      label: AILMENT_SYSTEM_LABELS[system],
      items: bySystem.get(system) ?? [],
    })).filter((group) => group.items.length > 0);
  }, [ailments.data]);

  const allAilments = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const selected =
    allAilments.find((ailment) => ailment.slug === selectedParam) ?? allAilments[0] ?? null;

  // Arriving without `?selected=` must still be a shareable, back-button-correct URL, so the
  // first ailment is written into the query once the list resolves.
  useEffect(() => {
    if (!selectedParam && selected) {
      setSearchParams((prev) => {
        const params = new URLSearchParams(prev);
        params.set('selected', selected.slug);
        return params;
      });
    }
  }, [selectedParam, selected, setSearchParams]);

  // Page 3 of one ailment must not carry over to the next.
  const selectedSlug = selected?.slug;
  useEffect(() => {
    setPage(1);
  }, [selectedSlug]);

  const plants = useAilmentPlants(selectedSlug, page);
  const railTerm = railQuery.trim().toLowerCase();

  function selectAilment(slug: string): void {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.set('selected', slug);
      return params;
    });
  }

  return (
    <div>
      {/* No page-level h1 here: the selected ailment's name is the h1, per the screen prompt. */}
      <p className="mono-label mb-6">ENCYCLOPEDIA · AILMENTS</p>

      {ailments.isPending ? (
        <div className="grid gap-8 lg:grid-cols-[248px_1fr]">
          <Skeleton width="100%" height={420} className="rounded-card" />
          <div className="flex flex-col gap-4">
            <Skeleton width="35%" height={40} />
            <Skeleton width="25%" height={14} />
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} variant="card" height={120} className="w-full" />
            ))}
          </div>
        </div>
      ) : ailments.isError ? (
        <ErrorState
          title="Couldn't load ailments"
          message="The ailment index did not respond. Check your connection and try again."
          onRetry={() => void ailments.refetch()}
        />
      ) : allAilments.length === 0 ? (
        <EmptyState
          title="No ailments recorded"
          description="No ailment entries exist in the catalogue yet."
        />
      ) : (
        <div className="grid gap-8 lg:grid-cols-[248px_1fr]">
          <aside
            aria-label="Ailment filters"
            className="lg:sticky lg:top-topnav lg:max-h-[calc(100vh-theme(spacing.topnav)-2rem)] lg:self-start lg:overflow-y-auto lg:pb-8 lg:pr-1"
          >
            <Input
              type="search"
              icon="search"
              aria-label="Search ailments"
              placeholder="Search complaints"
              value={railQuery}
              onChange={(event) => setRailQuery(event.target.value)}
            />
            <div className="mt-4 flex flex-col gap-5">
              {groups.map((group) => {
                const visible = group.items.filter(
                  (ailment) => railTerm === '' || ailment.name.toLowerCase().includes(railTerm),
                );
                if (visible.length === 0) return null;
                return (
                  <div key={group.system} className="flex flex-col gap-2">
                    <p className="mono-label">{group.label}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {visible.map((ailment) => (
                        <FilterChip
                          key={ailment._id}
                          active={selected?.slug === ailment.slug}
                          onClick={() => selectAilment(ailment.slug)}
                        >
                          {ailment.name}
                          <span className="text-fg-muted">{ailment.plantCount}</span>
                        </FilterChip>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>

          <div className="min-w-0">
            <h1 className="text-h1 text-fg">{selected?.name ?? 'Select an ailment'}</h1>
            {selected?.description && (
              <p className="reading-measure mt-2 text-body text-fg-secondary">{selected.description}</p>
            )}
            <p className="mt-1 text-small text-fg-muted">
              These are reports of traditional use, not treatment recommendations.
            </p>
            <p className="mono-label mt-3">
              {plants.data
                ? `${formatNumber(plants.data.total)} plants traditionally used`
                : 'Counting plants'}
            </p>

            <div className="mt-6">
              {plants.isPending ? (
                <div className="flex flex-col gap-3" role="status" aria-label="Loading plants">
                  {[0, 1, 2, 3].map((index) => (
                    <Skeleton key={index} variant="card" height={104} className="w-full" />
                  ))}
                </div>
              ) : plants.isError ? (
                <ErrorState
                  title="Couldn't load these plants"
                  message="The plant list for this ailment did not respond."
                  onRetry={() => void plants.refetch()}
                />
              ) : plants.data.items.length === 0 ? (
                <EmptyState
                  title="No plants recorded for this ailment yet"
                  description="No monograph in the catalogue currently lists this complaint."
                />
              ) : (
                <>
                  <ul className="flex flex-col gap-3">
                    {plants.data.items.map((plant) => (
                      <li key={plant._id}>
                        <AilmentPlantRow plant={plant} />
                      </li>
                    ))}
                  </ul>
                  {plants.data.totalPages > 1 && (
                    <Pagination
                      className="mt-8"
                      page={plants.data.page}
                      totalPages={plants.data.totalPages}
                      onPageChange={setPage}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AilmentPlantRow({ plant }: { plant: Plant }): ReactNode {
  const image = plant.images[0];
  const part = plant.partsUsed[0];
  const preparation = plant.preparations[0];

  return (
    <div className="flex flex-col gap-4 rounded-card border border-line-subtle bg-bg-surface p-4 sm:flex-row sm:items-start">
      <span className="relative aspect-square w-full shrink-0 overflow-hidden rounded-input bg-bg-sunken sm:size-20">
        {image ? (
          <img src={image.url} alt={image.alt} loading="lazy" className="size-full object-cover" />
        ) : (
          <Watermark name="leaf" size={40} />
        )}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={`/plants/${plant.slug}`}
            className="text-h3 text-fg transition-colors duration-100 ease-base hover:text-accent-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
          >
            {plant.commonName}
          </Link>
          {plant.toxicity !== 'none' && (
            <Tooltip content="Marked for toxicity - check the safety notes">
              <span
                role="img"
                aria-label="Marked for toxicity"
                className="inline-flex size-4 items-center justify-center rounded-full bg-clay-tint text-clay-400"
              >
                <Icon name="alert-circle" size={12} />
              </span>
            </Tooltip>
          )}
        </div>
        <span className="botanical text-small text-clay-400">{plant.botanicalName}</span>
        <div className="flex flex-wrap gap-1.5">
          {part && <Chip tone="neutral">{titleCase(part)}</Chip>}
          {preparation && <Chip tone="neutral">{titleCase(preparation)}</Chip>}
        </div>
        <p className="reading-measure line-clamp-2 text-small text-fg-secondary">
          {plant.medicinalUses}
        </p>
      </div>

      <Link
        to={`/plants/${plant.slug}`}
        className="inline-flex h-11 shrink-0 items-center gap-1 self-start rounded-btn px-3 text-small text-fg-secondary transition-colors duration-100 ease-base hover:bg-bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
      >
        View plant
        <Icon name="arrow-right" size={14} />
      </Link>
    </div>
  );
}
