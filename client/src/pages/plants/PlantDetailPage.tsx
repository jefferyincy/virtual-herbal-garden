/**
 * Plant monograph. The safety banner is the first thing in the content column and is never
 * dismissible - the build spec makes it mandatory on every plant view.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Chip } from '@/components/ui/Chip';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SafetyBanner } from '@/components/ui/SafetyBanner';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tabs } from '@/components/ui/Tabs';
import { Watermark } from '@/components/ui/Watermark';
import { Icon } from '@/components/icons';
import { PlantReferenceCard } from '@/components/plant/PlantReferenceCard';
import { ToxicityDot } from '@/components/plant/ToxicityDot';
import { ApiError } from '@/lib/api';
import { titleCase } from '@/lib/format';
import { useSession } from '@/stores/session';
import { usePlant } from '@/features/plants/hooks';
import type { PlantAilmentRef, PlantDetail } from '@/features/plants/types';
import type { Plant } from '@/types/api';

export default function PlantDetailPage(): ReactNode {
  const { slug } = useParams<{ slug: string }>();
  const [tab, setTab] = useState('overview');
  const isAdmin = useSession((s) => s.user?.role === 'admin');
  const plant = usePlant(slug);

  if (plant.isPending) return <PlantDetailSkeleton />;

  if (plant.isError) {
    // A 404 is a content problem, not a transport problem: it gets a route back, not a retry.
    const missing = plant.error instanceof ApiError && plant.error.status === 404;
    if (missing) {
      return (
        <ErrorState
          title="Plant not found"
          message="No monograph exists for that address. It may have been renamed or removed."
        >
          <Link
            to="/plants"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-btn border border-line-strong px-4 text-body text-fg transition-colors duration-100 ease-base hover:bg-bg-hover"
          >
            <Icon name="arrow-left" size={18} />
            Back to plants
          </Link>
        </ErrorState>
      );
    }
    return (
      <ErrorState
        title="Couldn't load this plant"
        message="The monograph did not respond. Check your connection and try again."
        onRetry={() => void plant.refetch()}
      />
    );
  }

  const data = plant.data;
  const image = data.images[0];
  const ailments = data.ailments.filter(isAilmentRef);

  return (
    <div>
      <Breadcrumb
        className="mb-6"
        items={[{ label: 'Plants', to: '/plants' }, { label: data.commonName }]}
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,320px)_1fr]">
        <section aria-label="Specimen image" className="relative">
          <div className="relative aspect-[4/5] overflow-hidden rounded-card border border-line-subtle bg-bg-sunken">
            {image ? (
              <img src={image.url} alt={image.alt} className="size-full object-cover" />
            ) : (
              <Watermark name="leaf" size={160} />
            )}
          </div>
          {image && <p className="mt-2 font-mono text-micro uppercase text-fg-muted">{image.credit}</p>}
        </section>

        <div className="min-w-0">
          <PageHeader
            eyebrow={data.family.toUpperCase()}
            title={data.commonName}
            description={<span className="botanical text-body-lg text-clay-400">{data.botanicalName}</span>}
            className="mb-4"
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  to="/plants"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-btn border border-line-strong px-4 text-body text-fg transition-colors duration-100 ease-base hover:bg-bg-hover"
                >
                  <Icon name="arrow-left" size={18} />
                  All plants
                </Link>
                {isAdmin && (
                  <Link
                    to={`/admin/plants/${data._id}/edit`}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-btn bg-accent-500 px-4 font-semibold text-fg-onAccent transition-colors duration-100 ease-base hover:bg-accent-400"
                  >
                    <Icon name="pencil" size={18} />
                    Edit plant
                  </Link>
                )}
              </div>
            }
          />

          <div className="mb-5 flex flex-wrap items-center gap-3">
            <Chip tone="neutral">{data.family}</Chip>
            <ToxicityDot toxicity={data.toxicity} />
          </div>

          {/* Above the fold, never dismissible. */}
          <SafetyBanner heading={`Safety - ${data.commonName}`}>
            <SafetyBody plant={data} />
          </SafetyBanner>

          {data.unverified ? (
            <p className="mt-4 rounded-card border border-clay-400/30 bg-clay-tint px-4 py-3 text-small text-clay-400">
              <Icon name="info" size={16} className="mr-2 inline align-text-bottom" />
              Some fields below lack a cited source and are shown as unknown rather than filled with
              an invented figure.
            </p>
          ) : data.verified ? (
            <p className="mt-4 flex items-center gap-2 text-small text-accent-400">
              <Icon name="check-circle" size={16} />
              Fields on this monograph are cited - see the sources section.
            </p>
          ) : null}
        </div>
      </div>

      <Tabs
        className="mt-10"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'overview', label: 'Overview' },
          { value: 'uses', label: 'Uses' },
          { value: 'compounds', label: 'Compounds' },
          { value: 'safety', label: 'Safety' },
          { value: 'lookalikes', label: 'Look-alikes' },
        ]}
      />

      <div className="mt-6">
        {tab === 'overview' && <OverviewTab plant={data} />}
        {tab === 'uses' && <UsesTab plant={data} ailments={ailments} />}
        {tab === 'compounds' && <CompoundsTab plant={data} />}
        {tab === 'safety' && <SafetyTab plant={data} />}
        {tab === 'lookalikes' && <LookAlikesTab plant={data} />}
      </div>

      <SourcesSection plant={data} />
    </div>
  );
}

function isAilmentRef(value: Plant['ailments'][number]): value is PlantAilmentRef {
  return typeof value === 'object' && value !== null && 'name' in value;
}

/** Reads the id out of a `lookAlikes.plantId` that may be a string, an ObjectId or a populated doc. */
function lookAlikeTargetId(plantId: unknown): string | null {
  if (typeof plantId === 'string') return plantId;
  if (plantId !== null && typeof plantId === 'object' && '_id' in plantId) {
    const id: unknown = plantId._id;
    return typeof id === 'string' ? id : null;
  }
  return null;
}

function SafetyBody({ plant }: { plant: Plant }): ReactNode {
  const toxicityLine =
    plant.toxicity === 'none'
      ? 'No toxicity is recorded for this plant in the cited sources.'
      : `Toxicity is recorded as ${plant.toxicity}.`;

  return (
    <div className="flex flex-col gap-2">
      <p>{toxicityLine}</p>
      {plant.contraindications && <p>Contraindications: {plant.contraindications}</p>}
      {plant.dosage === null ? (
        <p>
          No dosage figure is recorded for this plant because no citable source for one was found.
          Do not guess a dose from this page.
        </p>
      ) : (
        <p>Recorded dosage: {plant.dosage}</p>
      )}
    </div>
  );
}

function SpecRow({ label, value }: { label: string; value: ReactNode }): ReactNode {
  return (
    <div className="border-b border-line-subtle py-3 last:border-b-0">
      <p className="mono-label mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5">{value}</div>
    </div>
  );
}

function NoneRecorded({ children }: { children: string }): ReactNode {
  return <p className="text-body text-fg-muted">{children}</p>;
}

function OverviewTab({ plant }: { plant: Plant }): ReactNode {
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <p className="reading-measure text-body-lg text-fg-secondary">{plant.description}</p>
      <div className="rounded-card border border-line-subtle bg-bg-surface px-5 py-2">
        <SpecRow
          label="Parts used"
          value={
            plant.partsUsed.length === 0 ? (
              <NoneRecorded>None recorded</NoneRecorded>
            ) : (
              plant.partsUsed.map((part) => (
                <Chip key={part} tone="neutral">
                  {titleCase(part)}
                </Chip>
              ))
            )
          }
        />
        <SpecRow
          label="Preparations"
          value={
            plant.preparations.length === 0 ? (
              <NoneRecorded>None recorded</NoneRecorded>
            ) : (
              plant.preparations.map((preparation) => (
                <Chip key={preparation} tone="neutral">
                  {titleCase(preparation)}
                </Chip>
              ))
            )
          }
        />
        <SpecRow
          label="Regions"
          value={
            plant.region.length === 0 ? (
              <NoneRecorded>None recorded</NoneRecorded>
            ) : (
              plant.region.map((region) => (
                <Chip key={region} tone="neutral">
                  {region}
                </Chip>
              ))
            )
          }
        />
        <SpecRow
          label="Systems"
          value={
            plant.systemsMentioned.length === 0 ? (
              <NoneRecorded>None recorded</NoneRecorded>
            ) : (
              plant.systemsMentioned.map((system) => (
                <Chip key={system} tone="accent">
                  {titleCase(system)}
                </Chip>
              ))
            )
          }
        />
      </div>
    </div>
  );
}

function UsesTab({ plant, ailments }: { plant: Plant; ailments: PlantAilmentRef[] }): ReactNode {
  return (
    <div className="flex flex-col gap-6">
      <p className="reading-measure text-body-lg text-fg-secondary">{plant.medicinalUses || 'No uses recorded.'}</p>
      {ailments.length > 0 && (
        <div>
          <p className="mono-label mb-2">Recorded for</p>
          <div className="flex flex-wrap gap-1.5">
            {ailments.map((ailment) => (
              <Link
                key={ailment._id}
                to={`/ailments?selected=${ailment.slug ?? ailment._id}`}
                className="inline-flex items-center gap-1 rounded-full border border-line-subtle bg-accent-tint px-2.5 py-1 font-mono text-micro uppercase text-accent-400 transition-colors duration-100 ease-base hover:border-accent-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
              >
                {ailment.name}
                <Icon name="arrow-right" size={12} />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CompoundsTab({ plant }: { plant: Plant }): ReactNode {
  if (plant.activeCompounds.length === 0) {
    return (
      <EmptyState
        title="No compounds recorded"
        description="No active compounds are recorded for this plant in the cited sources."
        watermark="hexagon"
      />
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {plant.activeCompounds.map((compound) => (
        <li
          key={compound}
          className="rounded-input border border-line-subtle bg-bg-surface px-4 py-2.5 font-mono text-small text-fg"
        >
          {compound}
        </li>
      ))}
    </ul>
  );
}

function SafetyTab({ plant }: { plant: Plant }): ReactNode {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-card border border-line-subtle bg-bg-surface p-5">
        <p className="mono-label mb-2">Toxicity</p>
        <ToxicityDot toxicity={plant.toxicity} />
      </div>
      <div className="rounded-card border border-line-subtle bg-bg-surface p-5">
        <p className="mono-label mb-2">Contraindications</p>
        <p className="text-body text-fg-secondary">
          {plant.contraindications ?? 'None recorded from a citable source.'}
        </p>
      </div>
      <div className="rounded-card border border-line-subtle bg-bg-surface p-5 lg:col-span-2">
        <p className="mono-label mb-2">Dosage</p>
        <p className="text-body text-fg-secondary">
          {plant.dosage ??
            'No dosage figure is recorded because no citable source for one was found. This page deliberately leaves it blank rather than estimate.'}
        </p>
      </div>
    </div>
  );
}

function LookAlikesTab({ plant }: { plant: PlantDetail }): ReactNode {
  const noteById = useMemo(() => {
    const byId = new Map<string, string>();
    // The server populates `lookAlikes.plantId`, so it arrives as the referenced document even
    // though the shared contract types it as a plain id string. Handle both shapes.
    for (const lookAlike of plant.lookAlikes) {
      const id = lookAlikeTargetId(lookAlike.plantId);
      if (id) byId.set(id, lookAlike.note);
    }
    return byId;
  }, [plant.lookAlikes]);

  if (plant.lookAlikePlants.length === 0) {
    return (
      <EmptyState
        title="No look-alikes recorded"
        description="No confusing species are recorded for this plant in the cited sources."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3 rounded-card border-l-[3px] border-danger bg-danger-tint px-5 py-4">
        <Icon name="alert-triangle" size={20} className="mt-0.5 shrink-0 text-danger" />
        <div>
          <h3 className="text-h3 text-danger">Confusion in the wild is the main hazard</h3>
          <p className="mt-1 text-small text-fg-secondary">
            These species share a habitat and a silhouette. Never harvest or substitute a plant on
            appearance alone - check the look-alike note against a cited identification.
          </p>
        </div>
      </div>
      <ul className="flex flex-col gap-3">
        {plant.lookAlikePlants.map((lookAlike) => (
          <li key={lookAlike._id} className="flex flex-col gap-2">
            <PlantReferenceCard plant={lookAlike} />
            <p className="reading-measure pl-4 text-small text-fg-secondary">
              {noteById.get(String(lookAlike._id)) ?? 'No distinguishing note is recorded.'}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SourcesSection({ plant }: { plant: Plant }): ReactNode {
  if (plant.sources.length === 0) {
    return (
      <section className="mt-12">
        <h2 className="text-h2 text-fg">Sources</h2>
        <p className="mt-2 text-small text-fg-muted">
          No citable source is recorded for this monograph, so its fields are shown as unknown.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-12">
      <h2 className="text-h2 text-fg">Sources</h2>
      <ul className="mt-4 flex flex-col gap-2">
        {plant.sources.map((source) => (
          <li key={source.url}>
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-2 text-body text-accent-400 transition-colors duration-100 ease-base hover:text-accent-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
            >
              <span className="mono-label">{source.label}</span>
              <Icon name="external-link" size={14} />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Mirrors the real layout: image column, title block, safety banner, then the tab bar. */
function PlantDetailSkeleton(): ReactNode {
  return (
    <div role="status" aria-label="Loading plant">
      <Skeleton width={220} height={16} className="mb-6" />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,320px)_1fr]">
        <Skeleton variant="card" className="aspect-[4/5] w-full" />
        <div className="flex flex-col gap-3">
          <Skeleton width={120} height={11} />
          <Skeleton width="45%" height={40} />
          <Skeleton width="30%" height={17} />
          <Skeleton width={260} height={24} className="rounded-full" />
          <Skeleton variant="card" height={140} className="mt-2 w-full" />
        </div>
      </div>
      <Skeleton width="60%" height={40} className="mt-10" />
      <Skeleton variant="card" height={220} className="mt-6 w-full" />
    </div>
  );
}
