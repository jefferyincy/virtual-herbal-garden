import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Icon } from '@/components/icons';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { Chip, FilterChip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { SafetyBanner } from '@/components/ui/SafetyBanner';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Skeleton } from '@/components/ui/Skeleton';
import { Textarea } from '@/components/ui/Textarea';
import { ToxicityDot } from '@/components/plant/ToxicityDot';
import { ApiError } from '@/lib/api';
import { titleCase } from '@/lib/format';
import {
  apiErrorMessage,
  useAilmentOptions,
  useDeletePlant,
  usePlantForEdit,
  useSavePlant,
  type PlantWriteInput,
} from '@/features/admin/hooks';
import type {
  MedicalSystem,
  PlantPart,
  Preparation,
  SourceRef,
  Toxicity,
} from '@/types/api';

const PLANT_PART_VALUES: PlantPart[] = [
  'leaf',
  'root',
  'stem',
  'bark',
  'flower',
  'fruit',
  'seed',
  'rhizome',
  'whole_plant',
  'resin',
  'latex',
];

const PREPARATION_VALUES: Preparation[] = [
  'decoction',
  'infusion',
  'powder',
  'paste',
  'oil',
  'juice',
  'fomentation',
  'decoction_oil',
  'fresh',
];

const MEDICAL_SYSTEM_VALUES: MedicalSystem[] = ['ayurveda', 'siddha', 'unani', 'western'];

const TOXICITY_OPTIONS: Array<{ value: Toxicity; label: string }> = [
  { value: 'none', label: 'None known' },
  { value: 'low', label: 'Low' },
  { value: 'high', label: 'High' },
];

interface Draft {
  commonName: string;
  botanicalName: string;
  family: string;
  partsUsed: PlantPart[];
  preparations: Preparation[];
  systemsMentioned: MedicalSystem[];
  ailments: string[];
  activeCompounds: string[];
  description: string;
  medicinalUses: string;
  dosage: string;
  noDosageSource: boolean;
  contraindications: string;
  noContraindicationsSource: boolean;
  toxicity: Toxicity;
  region: string[];
  tags: string[];
  sources: SourceRef[];
  unverified: boolean;
}

const EMPTY_DRAFT: Draft = {
  commonName: '',
  botanicalName: '',
  family: '',
  partsUsed: [],
  preparations: [],
  systemsMentioned: [],
  ailments: [],
  activeCompounds: [],
  description: '',
  medicinalUses: '',
  dosage: '',
  noDosageSource: false,
  contraindications: '',
  noContraindicationsSource: false,
  toxicity: 'none',
  region: [],
  tags: [],
  sources: [],
  unverified: false,
};

function isHttpUrl(value: string): boolean {
  if (!value.trim()) return false;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Ailments arrive populated on some endpoints and as ids on others - normalise both to ids. */
function ailmentIds(ailments: Draft['ailments'] | Array<{ _id: string } | string>): string[] {
  const ids: string[] = [];
  for (const entry of ailments) {
    if (typeof entry === 'string') ids.push(entry);
    else if (entry && typeof entry === 'object') ids.push(entry._id);
  }
  return ids;
}

export default function AdminPlantEditPage() {
  const params = useParams<{ id?: string }>();
  const editId = params.id;
  const isEdit = Boolean(editId);
  const navigate = useNavigate();

  const existing = usePlantForEdit(editId);
  const ailments = useAilmentOptions();
  const save = useSavePlant();
  const remove = useDeletePlant();

  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!existing.data) return;
    const plant = existing.data;
    setDraft({
      commonName: plant.commonName,
      botanicalName: plant.botanicalName,
      family: plant.family,
      partsUsed: plant.partsUsed,
      preparations: plant.preparations,
      systemsMentioned: plant.systemsMentioned,
      ailments: ailmentIds(plant.ailments),
      activeCompounds: plant.activeCompounds,
      description: plant.description,
      medicinalUses: plant.medicinalUses,
      dosage: plant.dosage ?? '',
      noDosageSource: plant.dosage === null,
      contraindications: plant.contraindications ?? '',
      noContraindicationsSource: plant.contraindications === null,
      toxicity: plant.toxicity,
      region: plant.region,
      tags: plant.tags,
      sources: plant.sources,
      unverified: plant.unverified ?? false,
    });
  }, [existing.data]);

  /** Server-side validation failures arrive as `details: Array<{path, message}>` on a 422. */
  const serverFieldErrors = useMemo(() => {
    const error = save.error;
    if (!(error instanceof ApiError) || !Array.isArray(error.details)) return {};
    const mapped: Record<string, string> = {};
    for (const entry of error.details) {
      if (!entry || typeof entry !== 'object') continue;
      if (!('path' in entry) || !('message' in entry)) continue;
      const path = String(entry.path);
      const message = String(entry.message);
      mapped[path] = message;
    }
    return mapped;
  }, [save.error]);

  const mergedErrors: Record<string, string> = { ...serverFieldErrors, ...fieldErrors };

  function update(patch: Partial<Draft>): void {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  function toggleValue<T extends string>(values: T[], value: T): T[] {
    return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
  }

  /** Mirrors the server rule in routes/plants.ts: a null dosage or contraindications means no
   *  citable source was found, so the record is unverified however the client sets the flag. */
  const derivedDosage = draft.noDosageSource ? null : draft.dosage.trim() || null;
  const derivedContraindications = draft.noContraindicationsSource
    ? null
    : draft.contraindications.trim() || null;
  const willBeUnverified =
    derivedDosage === null || derivedContraindications === null ? true : draft.unverified;

  function validate(): Record<string, string> {
    const errors: Record<string, string> = {};
    if (!draft.commonName.trim()) errors.commonName = 'Common name is required';
    if (!draft.botanicalName.trim()) errors.botanicalName = 'Botanical name is required';
    if (!draft.family.trim()) errors.family = 'Family is required';
    if (derivedDosage === null && !draft.noDosageSource) {
      errors.dosage = 'Enter a dosage with a citable source, or mark that none was found';
    }
    if (derivedContraindications === null && !draft.noContraindicationsSource) {
      errors.contraindications = 'Enter contraindications, or mark that none were found';
    }
    draft.sources.forEach((source, index) => {
      if (!source.label.trim()) errors[`sources.${index}.label`] = 'Label is required';
      if (!isHttpUrl(source.url)) errors[`sources.${index}.url`] = 'Enter a valid http(s) URL';
    });
    return errors;
  }

  function submit(): void {
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const input: PlantWriteInput = {
      commonName: draft.commonName.trim(),
      botanicalName: draft.botanicalName.trim(),
      family: draft.family.trim(),
      partsUsed: draft.partsUsed,
      preparations: draft.preparations,
      ailments: draft.ailments,
      activeCompounds: draft.activeCompounds,
      description: draft.description.trim(),
      medicinalUses: draft.medicinalUses.trim(),
      dosage: derivedDosage,
      contraindications: derivedContraindications,
      toxicity: draft.toxicity,
      region: draft.region,
      systemsMentioned: draft.systemsMentioned,
      tags: draft.tags,
      sources: draft.sources.map((source) => ({ label: source.label.trim(), url: source.url.trim() })),
      unverified: willBeUnverified,
    };

    save.mutate(
      { ...(editId ? { id: editId } : {}), input },
      // The toast is pushed by the hook; the screen's job is to return to the list.
      { onSuccess: () => navigate('/admin/plants') },
    );
  }

  const notFound = existing.error instanceof ApiError && existing.error.status === 404;

  return (
    <div className="mx-auto w-full max-w-content">
      <PageHeader
        title={isEdit ? 'Edit plant' : 'New plant'}
        eyebrow="Admin"
        description={
          isEdit
            ? 'Changes go live on the public monograph as soon as they are saved.'
            : 'A new monograph starts unpublished until it has citations.'
        }
        actions={
          <Link
            to="/admin/plants"
            className="inline-flex h-11 items-center gap-2 rounded-btn px-3 text-body text-fg-secondary transition-colors duration-100 ease-base hover:text-fg"
          >
            <Icon name="arrow-left" size={18} />
            Back to plants
          </Link>
        }
      />

      {isEdit && existing.isPending && <FormSkeleton />}

      {isEdit && notFound && (
        <EmptyState
          title="Plant not found"
          description="This monograph does not exist, or it was deleted while you had the editor open."
          watermark="leaf"
          action={
            <Link
              to="/admin/plants"
              className="inline-flex h-11 items-center gap-2 rounded-btn border border-line-strong px-4 text-fg transition-colors duration-100 ease-base hover:bg-bg-hover"
            >
              Back to plants
            </Link>
          }
        />
      )}

      {isEdit && existing.isError && !notFound && (
        <ErrorState
          title="Couldn't load this plant"
          message="The plant record did not respond."
          onRetry={() => void existing.refetch()}
        />
      )}

      {(!isEdit || existing.isSuccess) && (
        <>
          {save.isError && (
            <ErrorBanner className="mb-4" message={apiErrorMessage(save.error)} />
          )}
          {Object.keys(serverFieldErrors).length > 0 && (
            <ErrorBanner
              className="mb-4"
              message={`Validation failed: ${Object.values(serverFieldErrors).join('; ')}`}
            />
          )}
          {draft.sources.length === 0 && (
            <div className="mb-4 flex items-center gap-3 rounded-card border border-warning bg-warning/10 p-3">
              <Icon name="alert-triangle" size={18} className="shrink-0 text-warning" />
              <p className="text-small text-fg">
                No sources yet. A monograph without a citation cannot be trusted, and the server
                marks it unverified.
              </p>
            </div>
          )}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="flex flex-col gap-4">
              <Card variant="flat" padding="lg" className="flex flex-col gap-4">
                <h2 className="text-h3 text-fg">Identity</h2>
                <Input
                  label="Slug"
                  value={existing.data?.slug ?? ''}
                  readOnly
                  hint={
                    isEdit
                      ? 'Derived from the common name when the plant was created.'
                      : 'Derived from the common name on save - the server generates it.'
                  }
                  className="font-mono text-small text-fg-secondary"
                />
                <Input
                  label="Common name"
                  value={draft.commonName}
                  error={mergedErrors.commonName ?? null}
                  onChange={(event) => update({ commonName: event.target.value })}
                />
                <Input
                  label="Botanical name"
                  value={draft.botanicalName}
                  error={mergedErrors.botanicalName ?? null}
                  onChange={(event) => update({ botanicalName: event.target.value })}
                />
                <p className="botanical -mt-2 text-small text-fg-muted">
                  Rendered in italics everywhere it appears.
                </p>
                <Input
                  label="Family"
                  value={draft.family}
                  error={mergedErrors.family ?? null}
                  onChange={(event) => update({ family: event.target.value })}
                />
              </Card>

              <Card variant="flat" padding="lg" className="flex flex-col gap-5">
                <h2 className="text-h3 text-fg">Taxonomy</h2>
                <ChipGroup label="Parts used">
                  {PLANT_PART_VALUES.map((value) => (
                    <FilterChip
                      key={value}
                      active={draft.partsUsed.includes(value)}
                      onClick={() => update({ partsUsed: toggleValue(draft.partsUsed, value) })}
                    >
                      {titleCase(value)}
                    </FilterChip>
                  ))}
                </ChipGroup>
                <ChipGroup label="Preparations">
                  {PREPARATION_VALUES.map((value) => (
                    <FilterChip
                      key={value}
                      active={draft.preparations.includes(value)}
                      onClick={() => update({ preparations: toggleValue(draft.preparations, value) })}
                    >
                      {titleCase(value)}
                    </FilterChip>
                  ))}
                </ChipGroup>
                <ChipGroup label="Systems mentioned">
                  {MEDICAL_SYSTEM_VALUES.map((value) => (
                    <FilterChip
                      key={value}
                      active={draft.systemsMentioned.includes(value)}
                      onClick={() =>
                        update({ systemsMentioned: toggleValue(draft.systemsMentioned, value) })
                      }
                    >
                      {titleCase(value)}
                    </FilterChip>
                  ))}
                </ChipGroup>
              </Card>

              <AilmentPicker
                selected={draft.ailments}
                loading={ailments.isPending}
                options={ailments.data?.items ?? []}
                onChange={(next) => update({ ailments: next })}
              />

              <Card variant="flat" padding="lg" className="flex flex-col gap-4">
                <h2 className="text-h3 text-fg">Content</h2>
                <TagInput
                  label="Active compounds"
                  hint="Press Enter or comma to add"
                  values={draft.activeCompounds}
                  onChange={(next) => update({ activeCompounds: next })}
                />
                <Textarea
                  label="Description"
                  rows={5}
                  value={draft.description}
                  onChange={(event) => update({ description: event.target.value })}
                />
                <Textarea
                  label="Medicinal uses"
                  rows={5}
                  value={draft.medicinalUses}
                  onChange={(event) => update({ medicinalUses: event.target.value })}
                />
              </Card>

              <Card variant="flat" padding="lg" className="flex flex-col gap-4">
                <h2 className="text-h3 text-fg">Dosage and safety</h2>
                {/* Data-honesty affordance: turning this on sends null, which is the honest value
                    when no citable figure exists - the server then forces `unverified: true`. */}
                <Textarea
                  label="Dosage"
                  rows={4}
                  value={draft.noDosageSource ? '' : draft.dosage}
                  disabled={draft.noDosageSource}
                  error={mergedErrors.dosage ?? null}
                  onChange={(event) => update({ dosage: event.target.value })}
                />
                <Checkbox
                  label="No citable source found"
                  hint="Saves null instead of a guessed figure."
                  checked={draft.noDosageSource}
                  onChange={(event) => update({ noDosageSource: event.target.checked })}
                />
                <Textarea
                  label="Contraindications"
                  rows={4}
                  value={draft.noContraindicationsSource ? '' : draft.contraindications}
                  disabled={draft.noContraindicationsSource}
                  error={mergedErrors.contraindications ?? null}
                  onChange={(event) => update({ contraindications: event.target.value })}
                />
                <Checkbox
                  label="No citable source found"
                  hint="Saves null instead of an unsourced claim."
                  checked={draft.noContraindicationsSource}
                  onChange={(event) => update({ noContraindicationsSource: event.target.checked })}
                />
                <div className="flex flex-col gap-2">
                  <span className="text-small text-fg-secondary">Toxicity</span>
                  <SegmentedControl
                    options={TOXICITY_OPTIONS.map((option) => ({
                      value: option.value,
                      label: option.label,
                    }))}
                    value={draft.toxicity}
                    onChange={(value) => update({ toxicity: value as Toxicity })}
                  />
                </div>
              </Card>

              <Card variant="flat" padding="lg" className="flex flex-col gap-4">
                <h2 className="text-h3 text-fg">Distribution and tags</h2>
                <TagInput
                  label="Regions"
                  hint="Press Enter or comma to add"
                  values={draft.region}
                  onChange={(next) => update({ region: next })}
                />
                <TagInput
                  label="Tags"
                  hint="Press Enter or comma to add"
                  values={draft.tags}
                  onChange={(next) => update({ tags: next })}
                />
              </Card>

              <SourcesEditor
                sources={draft.sources}
                errors={mergedErrors}
                onChange={(next) => update({ sources: next })}
              />
            </div>

            <aside className="flex flex-col gap-4 xl:sticky xl:top-4 xl:self-start">
              <Card variant="flat" padding="lg" className="flex flex-col gap-3">
                <h2 className="text-h3 text-fg">Public preview</h2>
                <ToxicityDot toxicity={draft.toxicity} />
                <div className="flex items-center gap-2">
                  <Chip tone={willBeUnverified ? 'warning' : 'accent'} size="sm">
                    {willBeUnverified ? 'Unverified' : 'Verified'}
                  </Chip>
                  <span className="mono-label">
                    {willBeUnverified ? 'missing citation' : 'sourced'}
                  </span>
                </div>
                <div className="flex flex-col gap-2 border-t border-line-subtle pt-3">
                  <Checkbox
                    label="Mark this record unverified"
                    hint="The server forces this on whenever dosage or contraindications are null."
                    checked={draft.unverified}
                    onChange={(event) => update({ unverified: event.target.checked })}
                  />
                  <p className="text-small text-fg-secondary">
                    The public page shows the flag exactly as saved.
                  </p>
                </div>
                <dl className="flex flex-col gap-2 border-t border-line-subtle pt-3">
                  <PreviewRow label="Parts" value={draft.partsUsed.map(titleCase).join(', ')} />
                  <PreviewRow label="Preparations" value={draft.preparations.map(titleCase).join(', ')} />
                  <PreviewRow label="Ailments" value={String(draft.ailments.length)} />
                  <PreviewRow label="Sources" value={String(draft.sources.length)} />
                </dl>
              </Card>

              <SafetyBanner heading="Safety and dosage">
                {draft.noContraindicationsSource || !draft.contraindications.trim() ? (
                  <p>
                    No citable contraindication record yet - the public page will say so rather than
                    invent one.
                  </p>
                ) : (
                  <p className="reading-measure">{draft.contraindications}</p>
                )}
              </SafetyBanner>
            </aside>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line-subtle pt-4">
            <Button loading={save.isPending} onClick={submit}>
              {isEdit ? 'Save changes' : 'Create plant'}
            </Button>
            <Button variant="ghost" onClick={() => navigate('/admin/plants')}>
              Cancel
            </Button>
            {isEdit && (
              <Button
                variant="danger"
                className="ml-auto"
                iconLeft="trash"
                onClick={() => setConfirmDelete(true)}
              >
                Delete plant
              </Button>
            )}
          </div>

          <Modal
            open={confirmDelete}
            onClose={() => setConfirmDelete(false)}
            title="Delete this plant?"
            description="Its lessons and every look-alike reference pointing at it are affected. This cannot be undone."
            size="sm"
            footer={
              <>
                <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  loading={remove.isPending}
                  onClick={() => {
                    if (!editId) return;
                    remove.mutate(editId, { onSuccess: () => navigate('/admin/plants') });
                  }}
                >
                  Delete plant
                </Button>
              </>
            }
          >
            <p className="text-small text-fg-secondary">
              <span className="text-fg">{draft.commonName}</span> ·{' '}
              <span className="botanical">{draft.botanicalName}</span>
            </p>
          </Modal>
        </>
      )}
    </div>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="mono-label">{label}</dt>
      <dd className="min-w-0 truncate text-small text-fg-secondary">{value || '-'}</dd>
    </div>
  );
}

function ChipGroup({ label, children }: { label: string; children: ReactNode }): ReactNode {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-small text-fg-secondary">{label}</span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function AilmentPicker({
  selected,
  options,
  loading,
  onChange,
}: {
  selected: string[];
  options: Array<{ _id: string; name: string; system: string }>;
  loading: boolean;
  onChange: (next: string[]) => void;
}): ReactNode {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? options.filter(
        (option) =>
          option.name.toLowerCase().includes(needle) || option.system.toLowerCase().includes(needle),
      )
    : options;

  return (
    <Card variant="flat" padding="lg" className="flex flex-col gap-3">
      <h2 className="text-h3 text-fg">Ailments</h2>
      {loading ? (
        <Skeleton width="100%" height={72} />
      ) : options.length === 0 ? (
        <p className="text-small text-fg-secondary">No ailments are defined yet.</p>
      ) : (
        <>
          <Input
            label="Filter ailments"
            icon="search"
            placeholder="Name or system"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="max-h-64 overflow-y-auto rounded-input border border-line-subtle p-3">
            <div className="flex flex-wrap gap-2">
              {visible.map((option) => (
                <FilterChip
                  key={option._id}
                  active={selected.includes(option._id)}
                  onClick={() =>
                    onChange(
                      selected.includes(option._id)
                        ? selected.filter((id) => id !== option._id)
                        : [...selected, option._id],
                    )
                  }
                >
                  {option.name}
                </FilterChip>
              ))}
            </div>
          </div>
          <p className="mono-label">{selected.length} selected</p>
        </>
      )}
    </Card>
  );
}

function TagInput({
  label,
  hint,
  values,
  onChange,
}: {
  label: string;
  hint?: string;
  values: string[];
  onChange: (next: string[]) => void;
}): ReactNode {
  const [input, setInput] = useState('');

  function commit(): void {
    const value = input.trim();
    if (!value) return;
    const duplicate = values.some((entry) => entry.toLowerCase() === value.toLowerCase());
    if (!duplicate) onChange([...values, value]);
    setInput('');
  }

  return (
    <div className="flex flex-col gap-2">
      <Input
        label={label}
        hint={hint}
        placeholder="Add and press Enter"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ',') {
            event.preventDefault();
            commit();
          }
          if (event.key === 'Backspace' && !input && values.length > 0) {
            onChange(values.slice(0, -1));
          }
        }}
        onBlur={commit}
      />
      {values.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {values.map((value) => (
            <span key={value} className="inline-flex items-center">
              <Chip tone="neutral" size="sm">
                {value}
                <button
                  type="button"
                  aria-label={`Remove ${value}`}
                  onClick={() => onChange(values.filter((entry) => entry !== value))}
                  className="ml-1 rounded-full p-0.5 transition-colors duration-100 ease-base hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
                >
                  <Icon name="close" size={12} />
                </button>
              </Chip>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function SourcesEditor({
  sources,
  errors,
  onChange,
}: {
  sources: SourceRef[];
  errors: Record<string, string>;
  onChange: (next: SourceRef[]) => void;
}): ReactNode {
  return (
    <Card variant="flat" padding="lg" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-h3 text-fg">Sources</h2>
        <span className="mono-label">{sources.length} cited</span>
      </div>
      {sources.length === 0 && (
        <p className="text-small text-warning">
          No citable source found yet. Add at least one so the record can be verified.
        </p>
      )}
      <div className="flex flex-col gap-4">
        {sources.map((source, index) => (
          <div
            key={index}
            className="flex flex-col gap-3 rounded-input border border-line-subtle p-3 sm:flex-row sm:items-end"
          >
            <Input
              label="Label"
              value={source.label}
              error={errors[`sources.${index}.label`] ?? null}
              onChange={(event) =>
                onChange(
                  sources.map((entry, position) =>
                    position === index ? { ...entry, label: event.target.value } : entry,
                  ),
                )
              }
            />
            <Input
              label="URL"
              type="url"
              value={source.url}
              error={errors[`sources.${index}.url`] ?? null}
              onChange={(event) =>
                onChange(
                  sources.map((entry, position) =>
                    position === index ? { ...entry, url: event.target.value } : entry,
                  ),
                )
              }
            />
            <Button
              variant="ghost"
              iconLeft="trash"
              aria-label={`Remove source ${index + 1}`}
              onClick={() => onChange(sources.filter((_, position) => position !== index))}
            >
              Remove
            </Button>
          </div>
        ))}
      </div>
      <Button
        variant="secondary"
        iconLeft="plus"
        className="self-start"
        onClick={() => onChange([...sources, { label: '', url: '' }])}
      >
        Add source
      </Button>
    </Card>
  );
}

function FormSkeleton(): ReactNode {
  return (
    <div role="status" aria-label="Loading plant" className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-4">
        {[0, 1, 2].map((index) => (
          <Card key={index} variant="flat" padding="lg" className="flex flex-col gap-4">
            <Skeleton width={140} height={20} />
            <Skeleton width="100%" height={44} />
            <Skeleton width="100%" height={44} />
            <Skeleton width="70%" height={44} />
          </Card>
        ))}
      </div>
      <Card variant="flat" padding="lg" className="flex flex-col gap-3">
        <Skeleton width={120} height={20} />
        <Skeleton width="100%" height={80} />
        <Skeleton width="100%" height={120} />
      </Card>
    </div>
  );
}
