/**
 * Side-by-side comparison of two or three plants.
 *
 * The eight rows and their `differs` flags come from the server so the table cannot drift from
 * the monograph fields it summarises; the column set is URL-driven (`?ids=slug,slug`).
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/Table';
import { Watermark } from '@/components/ui/Watermark';
import { Icon } from '@/components/icons';
import { cn } from '@/lib/cn';
import { useCompare, usePlants } from '@/features/plants/hooks';
import type { CompareResponse } from '@/features/plants/types';
import type { Plant } from '@/types/api';

const MAX_COLUMNS = 3;
const URL_KEYS = ['ids'] as const;

function parseIds(params: URLSearchParams): string[] {
  const raw = params.get('ids') ?? '';
  return raw
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean)
    .slice(0, MAX_COLUMNS);
}

export default function ComparePage(): ReactNode {
  const [searchParams, setSearchParams] = useSearchParams();
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);

  const ids = useMemo(() => parseIds(searchParams), [searchParams]);
  const compare = useCompare(ids);

  function writeIds(next: string[]): void {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      for (const key of URL_KEYS) params.delete(key);
      if (next.length > 0) params.set('ids', next.join(','));
      return params;
    });
  }

  // The response is the source of truth for what is on screen: a slug that no longer resolves is
  // dropped server-side, so editing a column must rewrite the ids from the resolved list, not
  // from the raw URL, or the picker would swap the wrong column.
  const slugs = useMemo(
    () => compare.data?.plants.map((plant) => plant.slug) ?? ids,
    [compare.data, ids],
  );

  const replaceSlot = (index: number, slug: string): void => {
    const next = [...slugs];
    if (index >= next.length) next.push(slug);
    else next[index] = slug;
    writeIds(next);
    setPickerIndex(null);
  };

  return (
    <div>
      <PageHeader
        eyebrow="ENCYCLOPEDIA"
        title="Compare plants"
        description="Set two or three monographs side by side. Rows that differ are marked; identical rows are dimmed."
        actions={
          <Link
            to="/plants"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-btn border border-line-strong px-4 text-body text-fg transition-colors duration-100 ease-base hover:bg-bg-hover"
          >
            <Icon name="arrow-left" size={18} />
            All plants
          </Link>
        }
      />

      {ids.length < 2 ? (
        <EmptyState
          title="Pick at least two plants"
          description="Add two or three plants from the encyclopedia and their monographs will be compared field by field."
          action={
            <Link
              to="/plants"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-btn bg-accent-500 px-4 font-semibold text-fg-onAccent transition-colors duration-100 ease-base hover:bg-accent-400"
            >
              <Icon name="grid" size={18} />
              Browse plants
            </Link>
          }
        />
      ) : compare.isPending ? (
        <SkeletonTable rows={8} columns={ids.length + 1} />
      ) : compare.isError ? (
        <ErrorState
          title="Couldn't load the comparison"
          message="Two of those plants could not be resolved. Check the links and try again."
          onRetry={() => void compare.refetch()}
        />
      ) : (
        <ComparisonBody
          data={compare.data}
          onPick={(index) => setPickerIndex(index)}
          onRemove={(index) => writeIds(slugs.filter((_, i) => i !== index))}
        />
      )}

      <PlantPickerModal
        open={pickerIndex !== null}
        onClose={() => setPickerIndex(null)}
        excluded={slugs}
        onSelect={(plant) => {
          if (pickerIndex === null) return;
          replaceSlot(pickerIndex, plant.slug);
        }}
      />
    </div>
  );
}

function ComparisonBody({
  data,
  onPick,
  onRemove,
}: {
  data: CompareResponse;
  onPick: (index: number) => void;
  onRemove: (index: number) => void;
}): ReactNode {
  const columns = data.plants;
  // Tailwind cannot see a runtime-interpolated class name, so both column counts are spelled out.
  const gridColumns =
    columns.length === 3
      ? 'md:grid-cols-[220px_1fr_1fr_1fr]'
      : 'md:grid-cols-[220px_1fr_1fr]';

  return (
    <div>
      <div className="sticky top-topnav z-10 -mx-1 bg-bg-base/90 px-1 pb-2 pt-2 backdrop-blur-[12px]">
        <div className={cn('hidden gap-3 md:grid', gridColumns)}>
          <span className="mono-label self-end pb-3">Attribute</span>
          {columns.map((plant, index) => (
            <ComparisonColumnHeader
              key={plant._id}
              plant={plant}
              onChange={() => onPick(index)}
              onRemove={columns.length > 2 ? () => onRemove(index) : undefined}
            />
          ))}
        </div>

        {/* A third column is offered as a full-width strip so it cannot shift the header grid
            out of alignment with the table columns below it. */}
        {columns.length < MAX_COLUMNS && (
          <button
            type="button"
            onClick={() => onPick(columns.length)}
            className="mt-2 hidden h-11 w-full items-center justify-center gap-2 rounded-card border border-dashed border-line-strong text-small text-fg-secondary transition-colors duration-100 ease-base hover:border-accent-600 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow md:flex"
          >
            <Icon name="plus" size={16} />
            Add plant
          </button>
        )}

        {/* Below md the sticky header collapses to a horizontal scroller of the same cards. */}
        <div className="flex gap-3 overflow-x-auto pb-1 md:hidden">
          {columns.map((plant, index) => (
            <ComparisonColumnHeader
              key={plant._id}
              plant={plant}
              onChange={() => onPick(index)}
              onRemove={columns.length > 2 ? () => onRemove(index) : undefined}
              className="w-[200px] shrink-0"
            />
          ))}
          {columns.length < MAX_COLUMNS && (
            <button
              type="button"
              onClick={() => onPick(columns.length)}
              className="flex w-[160px] shrink-0 items-center justify-center gap-2 rounded-card border border-dashed border-line-strong text-small text-fg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
            >
              <Icon name="plus" size={16} />
              Add plant
            </button>
          )}
        </div>
      </div>

      <Table className="mt-4 table-fixed">
        <THead>
          <tr>
            <TH className="w-[220px]">Attribute</TH>
            {data.rows[0]?.values.map((_, index) => (
              <TH key={`column-${index}`}>{columns[index]?.commonName ?? 'Not selected'}</TH>
            ))}
          </tr>
        </THead>
        <TBody>
          {data.rows.map((row) => (
            <TR
              key={row.label}
              className={cn(
                row.differs &&
                  '[&>td:first-child]:border-l-[3px] [&>td:first-child]:border-clay-500',
              )}
            >
              <TD className="mono-label align-top">{row.label}</TD>
              {row.values.map((value, index) => (
                <TD
                  key={`${row.label}-${index}`}
                  className={cn('align-top', !row.differs && 'text-fg-muted')}
                >
                  {value ?? <span className="font-mono text-fg-disabled">Not recorded</span>}
                </TD>
              ))}
            </TR>
          ))}
        </TBody>
      </Table>

      <div className="mt-8 flex flex-col gap-3 rounded-card border-l-[3px] border-danger bg-danger-tint px-5 py-4">
        <div className="flex items-start gap-3">
          <Icon name="alert-triangle" size={20} className="mt-0.5 shrink-0 text-danger" />
          <h3 className="text-h3 text-danger">
            These plants are sometimes confused in the wild - see look-alike notes
          </h3>
        </div>
        <ul className="flex flex-wrap gap-4">
          {columns.map((plant, index) => (
            <li key={plant._id} className="flex items-center gap-3">
              <span className="relative size-14 shrink-0 overflow-hidden rounded-input bg-bg-sunken">
                {plant.images[0] ? (
                  <img
                    src={plant.images[0].url}
                    alt={plant.images[0].alt}
                    loading="lazy"
                    className="size-full object-cover"
                  />
                ) : (
                  <Watermark name="leaf" size={32} />
                )}
              </span>
              <span className="flex flex-col">
                <span className="mono-label">{`Specimen ${String.fromCharCode(65 + index)}`}</span>
                <span className="text-small text-fg">{plant.commonName}</span>
                <span className="botanical text-small text-clay-400">{plant.botanicalName}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ComparisonColumnHeader({
  plant,
  onChange,
  onRemove,
  className,
}: {
  plant: Plant;
  onChange: () => void;
  onRemove?: () => void;
  className?: string;
}): ReactNode {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-card border border-line-subtle bg-bg-surface p-3',
        className,
      )}
    >
      <span className="relative size-12 shrink-0 overflow-hidden rounded-input bg-bg-sunken">
        {plant.images[0] ? (
          <img
            src={plant.images[0].url}
            alt={plant.images[0].alt}
            loading="lazy"
            className="size-full object-cover"
          />
        ) : (
          <Watermark name="leaf" size={28} />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-small text-fg">{plant.commonName}</span>
        <span className="botanical truncate text-small text-clay-400">{plant.botanicalName}</span>
      </span>
      <span className="flex shrink-0 items-center">
        <button
          type="button"
          onClick={onChange}
          aria-label={`Change ${plant.commonName}`}
          className="grid size-11 place-items-center rounded-btn text-fg-muted transition-colors duration-100 ease-base hover:bg-bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
        >
          <Icon name="refresh" size={16} />
        </button>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${plant.commonName}`}
            className="grid size-11 place-items-center rounded-btn text-fg-muted transition-colors duration-100 ease-base hover:bg-bg-hover hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
          >
            <Icon name="close" size={16} />
          </button>
        )}
      </span>
    </div>
  );
}

function PlantPickerModal({
  open,
  onClose,
  excluded,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  excluded: string[];
  onSelect: (plant: Plant) => void;
}): ReactNode {
  const [query, setQuery] = useState('');
  const plants = usePlants({ q: query.trim() || undefined, sort: 'name' });
  const candidates = (plants.data?.items ?? []).filter((plant) => !excluded.includes(plant.slug));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a plant"
      description="Plants already in the comparison are hidden."
    >
      <div className="flex flex-col gap-3">
        <Input
          type="search"
          icon="search"
          aria-label="Search plants to compare"
          placeholder="Search plants"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoFocus
        />
        {plants.isPending ? (
          <p className="text-small text-fg-muted">Loading plants…</p>
        ) : plants.isError ? (
          <p className="text-small text-danger">Couldn&apos;t load plants. Try again.</p>
        ) : candidates.length === 0 ? (
          <p className="text-small text-fg-muted">No plants match that search.</p>
        ) : (
          <ul className="flex max-h-[320px] flex-col gap-1 overflow-y-auto">
            {candidates.map((plant) => (
              <li key={plant._id}>
                <button
                  type="button"
                  onClick={() => onSelect(plant)}
                  className="flex w-full items-center gap-3 rounded-input px-2 py-2 text-left transition-colors duration-100 ease-base hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
                >
                  <span className="relative size-9 shrink-0 overflow-hidden rounded-micro bg-bg-sunken">
                    {plant.images[0] ? (
                      <img
                        src={plant.images[0].url}
                        alt={plant.images[0].alt}
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    ) : (
                      <Watermark name="leaf" size={20} />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-body text-fg">{plant.commonName}</span>
                    <span className="botanical truncate text-small text-fg-secondary">
                      {plant.botanicalName}
                    </span>
                  </span>
                  <span className="mono-label shrink-0">{plant.family}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
