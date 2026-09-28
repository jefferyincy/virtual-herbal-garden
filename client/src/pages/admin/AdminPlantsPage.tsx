import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '@/components/icons';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { Chip } from '@/components/ui/Chip';
import { Dropdown } from '@/components/ui/Dropdown';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/Table';
import { cn } from '@/lib/cn';
import { formatDate, formatNumber, titleCase } from '@/lib/format';
import { apiErrorMessage, useAdminPlants, useBulkPlantAction } from '@/features/admin/hooks';
import type { AdminPlantRow, AdminPlantStatus, BulkPlantAction } from '@/features/admin/hooks';

const STATUS_OPTIONS: Array<{ value: AdminPlantStatus; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'published', label: 'Published' },
  { value: 'draft', label: 'Draft' },
];

type PendingAction = { rows: AdminPlantRow[]; action: BulkPlantAction };

export default function AdminPlantsPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<AdminPlantStatus>('all');
  const [family, setFamily] = useState('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<PendingAction | null>(null);

  const plants = useAdminPlants({ q, status, family, page });
  const bulk = useBulkPlantAction();

  const rows = plants.data?.items ?? [];

  /**
   * The admin plant endpoints expose no distinct-family facet, so the filter's options are pooled
   * from the rows this screen has already loaded (they accumulate as the user pages and searches)
   * rather than invented. `all` is always offered, and the active value is kept even if the current
   * result set no longer contains it.
   */
  const [familiesSeen, setFamiliesSeen] = useState<string[]>([]);
  useEffect(() => {
    const items = plants.data?.items;
    if (!items) return;
    setFamiliesSeen((prev) => {
      const next = new Set(prev);
      for (const row of items) next.add(row.family);
      return next.size === prev.length ? prev : Array.from(next).sort((a, b) => a.localeCompare(b));
    });
  }, [plants.data]);

  const familyValues = family !== 'all' && !familiesSeen.includes(family)
    ? [...familiesSeen, family].sort((a, b) => a.localeCompare(b))
    : familiesSeen;

  function applyFilter(update: () => void): void {
    update();
    setPage(1);
    setSelected(new Set());
  }

  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row._id));
  const someSelected = rows.some((row) => selected.has(row._id));
  const selectedRows = rows.filter((row) => selected.has(row._id));

  function toggleAll(checked: boolean): void {
    setSelected(checked ? new Set(rows.map((row) => row._id)) : new Set());
  }

  function toggleRow(id: string, checked: boolean): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  const mutationError = bulk.error;

  return (
    <div className="mx-auto w-full max-w-content">
      <PageHeader
        title="Plants"
        eyebrow="Admin"
        description="Every monograph in the encyclopedia, published or still in draft."
        actions={
          <Link
            to="/admin/plants/new"
            className="inline-flex h-11 items-center gap-2 rounded-btn bg-accent-500 px-4 font-semibold text-fg-onAccent transition-colors duration-100 ease-base hover:bg-accent-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
          >
            <Icon name="plus" size={18} />
            New plant
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Input
          containerClassName="w-full sm:w-64"
          label="Search"
          icon="search"
          placeholder="Common or botanical name"
          value={q}
          onChange={(event) => applyFilter(() => setQ(event.target.value))}
        />
        <Select
          containerClassName="w-full sm:w-40"
          label="Status"
          options={STATUS_OPTIONS}
          value={status}
          onChange={(event) => applyFilter(() => setStatus(event.target.value as AdminPlantStatus))}
        />
        <Select
          containerClassName="w-full sm:w-52"
          label="Family"
          hint="Families present in loaded plants"
          options={[
            { value: 'all', label: 'All families' },
            ...familyValues.map((value) => ({ value, label: value })),
          ]}
          value={family}
          onChange={(event) => applyFilter(() => setFamily(event.target.value))}
        />
        <Dropdown
          align="start"
          trigger={
            <span className="inline-flex h-11 items-center gap-2 rounded-btn border border-line-strong px-4 text-body text-fg">
              Bulk actions
              <Icon name="chevron-down" size={16} />
            </span>
          }
          items={[
            {
              label: 'Publish selected',
              icon: 'check-circle',
              disabled: selected.size === 0,
              onSelect: () => setPending({ rows: selectedRows, action: 'publish' }),
            },
            {
              label: 'Unpublish selected',
              icon: 'eye-off',
              disabled: selected.size === 0,
              onSelect: () => setPending({ rows: selectedRows, action: 'unpublish' }),
            },
            {
              label: 'Delete selected',
              icon: 'trash',
              danger: true,
              disabled: selected.size === 0,
              onSelect: () => setPending({ rows: selectedRows, action: 'delete' }),
            },
          ]}
        />
      </div>

      {mutationError && (
        <ErrorBanner
          className="mb-4"
          message={apiErrorMessage(mutationError)}
          onDismiss={() => bulk.reset()}
        />
      )}

      {plants.isPending && <SkeletonTable rows={8} columns={7} />}

      {plants.isError && (
        <ErrorState
          title="Couldn't load plants"
          message="The admin plant list did not respond."
          onRetry={() => void plants.refetch()}
        />
      )}

      {plants.isSuccess && rows.length === 0 && (
        <EmptyState
          title={q || status !== 'all' || family !== 'all' ? 'No plants match these filters' : 'No plants yet'}
          description={
            q || status !== 'all' || family !== 'all'
              ? 'Clear the filters to see the whole catalogue.'
              : 'Create the first monograph to start the encyclopedia.'
          }
          action={
            <Button
              variant="secondary"
              onClick={() => applyFilter(() => {
                setQ('');
                setStatus('all');
                setFamily('all');
              })}
            >
              Clear filters
            </Button>
          }
        />
      )}

      {plants.isSuccess && rows.length > 0 && (
        <Card variant="flat" padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <tr>
                  <TH className="w-12">
                    <SelectAllCheckbox
                      checked={allSelected}
                      indeterminate={someSelected && !allSelected}
                      onChange={toggleAll}
                    />
                  </TH>
                  <TH>Plant</TH>
                  <TH>Family</TH>
                  <TH>Toxicity</TH>
                  <TH align="right">Lessons</TH>
                  <TH>Status</TH>
                  <TH>Updated</TH>
                  <TH align="right">Actions</TH>
                </tr>
              </THead>
              <TBody>
                {rows.map((row) => {
                  const isSelected = selected.has(row._id);
                  const image = row.images[0];
                  return (
                    <TR key={row._id} selected={isSelected}>
                      <TD>
                        <Checkbox
                          label={<span className="sr-only">Select {row.commonName}</span>}
                          checked={isSelected}
                          onChange={(event) => toggleRow(row._id, event.target.checked)}
                        />
                      </TD>
                      <TD>
                        <div className="flex items-center gap-3">
                          {image ? (
                            <img
                              src={image.url}
                              alt={image.alt}
                              width={40}
                              height={40}
                              loading="lazy"
                              className="size-10 shrink-0 rounded-input border border-line-subtle object-cover"
                            />
                          ) : (
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-input border border-line-subtle bg-bg-raised text-fg-muted">
                              <Icon name="leaf" size={18} />
                            </span>
                          )}
                          <span className="min-w-0">
                            <span className="block truncate text-body text-fg">{row.commonName}</span>
                            <span className="botanical block truncate text-small text-fg-secondary">
                              {row.botanicalName}
                            </span>
                          </span>
                        </div>
                      </TD>
                      <TD>
                        <Chip tone="neutral" size="sm">
                          {row.family}
                        </Chip>
                      </TD>
                      <TD>
                        <ToxicityCell toxicity={row.toxicity} />
                      </TD>
                      <TD align="right">
                        <span className="mono-label">{formatNumber(row.lessonsCount)}</span>
                      </TD>
                      <TD>
                        <Chip tone={row.status === 'published' ? 'accent' : 'neutral'} size="sm">
                          {row.status === 'published' ? 'Published' : 'Draft'}
                        </Chip>
                      </TD>
                      <TD>
                        <span className="mono-label">{formatDate(row.updatedAt)}</span>
                      </TD>
                      <TD align="right">
                        <Dropdown
                          trigger={
                            <span
                              className="inline-flex size-9 items-center justify-center rounded-btn text-fg-secondary hover:bg-bg-hover hover:text-fg"
                              aria-label={`Actions for ${row.commonName}`}
                            >
                              <Icon name="more" size={18} />
                            </span>
                          }
                          items={[
                            {
                              label: 'Edit',
                              icon: 'pencil',
                              onSelect: () => navigate(`/admin/plants/${row._id}/edit`),
                            },
                            {
                              label: row.status === 'published' ? 'Unpublish' : 'Publish',
                              icon: row.status === 'published' ? 'eye-off' : 'check-circle',
                              onSelect: () =>
                                setPending({
                                  rows: [row],
                                  action: row.status === 'published' ? 'unpublish' : 'publish',
                                }),
                            },
                            {
                              label: 'Delete',
                              icon: 'trash',
                              danger: true,
                              onSelect: () => setPending({ rows: [row], action: 'delete' }),
                            },
                          ]}
                        />
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </div>

          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 border-t border-line-strong bg-bg-surface px-4 py-3">
              <span className="mono-label">{formatNumber(selected.size)} selected</span>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  iconLeft="check-circle"
                  onClick={() => setPending({ rows: selectedRows, action: 'publish' })}
                >
                  Publish
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  iconLeft="eye-off"
                  onClick={() => setPending({ rows: selectedRows, action: 'unpublish' })}
                >
                  Unpublish
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  iconLeft="trash"
                  onClick={() => setPending({ rows: selectedRows, action: 'delete' })}
                >
                  Delete
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {plants.isSuccess && plants.data && plants.data.totalPages > 1 && (
        <Pagination
          className="mt-6"
          page={plants.data.page}
          totalPages={plants.data.totalPages}
          onPageChange={(next) => {
            setPage(next);
            setSelected(new Set());
          }}
        />
      )}

      <Modal
        open={pending !== null}
        onClose={() => setPending(null)}
        title={pending ? `${titleCase(pending.action)} ${pending.rows.length === 1 ? 'plant' : 'plants'}` : ''}
        description={
          pending?.action === 'delete'
            ? 'Deleting removes the monograph, its lessons and its look-alike references. This cannot be undone.'
            : 'This changes the published state of the selected monographs.'
        }
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button
              variant={pending?.action === 'delete' ? 'danger' : 'primary'}
              loading={bulk.isPending}
              onClick={() => {
                if (!pending) return;
                // Every path - row menu and footer bar alike - goes through the bulk endpoint so a
                // single-row action behaves exactly like the same action on a selection.
                bulk.mutate(
                  { ids: pending.rows.map((row) => row._id), action: pending.action },
                  {
                    onSuccess: () => {
                      setSelected(new Set());
                      setPending(null);
                    },
                  },
                );
              }}
            >
              {pending?.action === 'delete' ? 'Delete' : titleCase(pending?.action ?? '')}
            </Button>
          </>
        }
      >
        {pending && (
          <ul className="max-h-48 overflow-y-auto text-small text-fg-secondary">
            {pending.rows.map((row) => (
              <li key={row._id} className="truncate py-0.5">
                {row.commonName} · <span className="botanical">{row.botanicalName}</span>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  );
}

/**
 * The shared `Checkbox` primitive neither forwards a ref nor accepts `indeterminate`, and the
 * tri-state has no HTML attribute - it can only be set as a DOM property after mount.
 */
function SelectAllCheckbox({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: (checked: boolean) => void;
}): ReactNode {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <label className="flex size-6 cursor-pointer items-center justify-center">
      <span className="sr-only">Select all plants on this page</span>
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-5 rounded-micro border border-line-strong bg-bg-surface accent-accent-500 transition-colors duration-100 ease-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
      />
    </label>
  );
}

function ToxicityCell({ toxicity }: { toxicity: AdminPlantRow['toxicity'] }): ReactNode {
  const dot = cn(
    'size-2 shrink-0 rounded-full ring-2 ring-bg-surface',
    toxicity === 'none' && 'bg-accent-500',
    toxicity === 'low' && 'bg-warning',
    toxicity === 'high' && 'bg-danger',
  );

  return (
    <span className="inline-flex items-center gap-2">
      <span
        role="img"
        aria-label={`${toxicity} toxicity`}
        title={`${toxicity} toxicity`}
        className={dot}
      />
      <span
        className={cn(
          'font-mono text-micro uppercase',
          toxicity === 'none' && 'text-accent-400',
          toxicity === 'low' && 'text-warning',
          toxicity === 'high' && 'text-danger',
        )}
      >
        {toxicity}
      </span>
    </span>
  );
}

/** Server 409/422 messages must match what the API said - the shared helper appends field errors. */

