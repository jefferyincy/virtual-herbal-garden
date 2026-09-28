import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon, type IconName } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { RadioCard } from '@/components/ui/RadioCard';
import { Skeleton } from '@/components/ui/Skeleton';
import { Watermark } from '@/components/ui/Watermark';
import { cn } from '@/lib/cn';
import { apiErrorMessage, useCompleteOnboarding, useFollowablePlants } from '@/features/auth/hooks';
import {
  onboardingExperienceSchema,
  onboardingInterestsSchema,
  onboardingPlantsSchema,
  onboardingSchema,
} from '@/features/auth/schemas';
import type { Experience, Plant } from '@/types/api';

const STEP_COUNT = 3;

/**
 * One entry per step. Declared as a tuple so the per-step label and intro stay paired, and read
 * through `STEPS[step] ?? STEPS[0]` because `noUncheckedIndexedAccess` makes a numeric index
 * `| undefined`.
 */
const STEPS = [
  {
    label: 'Your herbal practice',
    intro: 'Which traditions do you want the garden to lead with? Pick as many as apply.',
  },
  {
    label: 'Your experience level',
    intro: 'This sets how much a monograph assumes you already know.',
  },
  {
    label: 'Pick plants to follow',
    intro: 'Follow plants to get their lessons, quizzes and review cards first.',
  },
] as const;

/** The six practices the onboarding mockup lists. The label is also the value stored on the user. */
const PRACTICES: Array<{ label: string; icon: IconName }> = [
  { label: 'Ayurveda', icon: 'leaf' },
  { label: 'Siddha', icon: 'sparkles' },
  { label: 'Unani', icon: 'moon' },
  { label: 'Western herbalism', icon: 'book-open' },
  { label: 'Home remedies', icon: 'home' },
  { label: 'Just curious', icon: 'compass' },
];

const EXPERIENCE_LEVELS: Array<{ value: Experience; title: string; description: string }> = [
  { value: 'beginner', title: 'Beginner', description: "I'm new to medicinal plants" },
  { value: 'intermediate', title: 'Intermediate', description: 'I know the common ones' },
  { value: 'advanced', title: 'Advanced', description: 'I read the pharmacopoeias' },
];

export default function OnboardingPage() {
  const navigate = useNavigate();
  const complete = useCompleteOnboarding();

  const [step, setStep] = useState(0);
  const [interests, setInterests] = useState<string[]>([]);
  const [experience, setExperience] = useState<Experience | null>(null);
  const [followed, setFollowed] = useState<string[]>([]);

  const current = STEPS[step] ?? STEPS[0];
  const isLastStep = step === STEP_COUNT - 1;

  // Each step's gate is the same zod rule the final submit enforces, so a step cannot be passed
  // while holding a value the API would reject.
  const stepComplete =
    step === 0
      ? onboardingInterestsSchema.safeParse({ interests }).success
      : step === 1
        ? onboardingExperienceSchema.safeParse({ experience }).success
        : onboardingPlantsSchema.safeParse({ followedPlants: followed }).success;

  function toggleInterest(value: string): void {
    setInterests((prev) => (prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]));
  }

  function togglePlant(id: string): void {
    setFollowed((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  function submit(): void {
    const parsed = onboardingSchema.safeParse({ interests, experience, followedPlants: followed });
    if (!parsed.success) return;
    complete.mutate(parsed.data, { onSuccess: () => navigate('/garden', { replace: true }) });
  }

  return (
    <div className="mx-auto flex w-full max-w-content flex-col">
      <StepIndicator step={step} />

      <h1 className="mt-8 text-h1 text-fg">{current.label}</h1>
      <p className="mt-2 max-w-reading text-body text-fg-secondary">{current.intro}</p>

      <div className="mt-8 flex-1">
        {step === 0 && (
          <PracticeStep selected={interests} onToggle={toggleInterest} />
        )}

        {step === 1 && (
          <div role="radiogroup" aria-label="Experience level" className="flex max-w-[560px] flex-col gap-3">
            {EXPERIENCE_LEVELS.map((level) => (
              <RadioCard
                key={level.value}
                selected={experience === level.value}
                onSelect={() => setExperience(level.value)}
                title={level.title}
                description={level.description}
              />
            ))}
          </div>
        )}

        {step === 2 && <PlantStep selected={followed} onToggle={togglePlant} />}
      </div>

      <div className="sticky bottom-0 z-10 mt-8 border-t border-line-subtle bg-bg-base/90 py-4 backdrop-blur-[12px]">
        {complete.isError && <ErrorBanner message={apiErrorMessage(complete.error)} className="mb-3" />}

        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={() => setStep((prev) => prev - 1)} disabled={step === 0}>
            Back
          </Button>

          {isLastStep && <span className="mono-label">{followed.length} selected</span>}

          {isLastStep ? (
            <Button onClick={submit} loading={complete.isPending} disabled={!stepComplete}>
              Enter the garden
            </Button>
          ) : (
            <Button onClick={() => setStep((prev) => prev + 1)} disabled={!stepComplete} iconRight="arrow-right">
              Next
            </Button>
          )}
        </div>

        {/* Explains a disabled control in words: colour and dimming are never the only signal. */}
        {!stepComplete && (
          <p className="mt-2 text-small text-fg-muted">
            {step === 0
              ? 'Pick at least one practice to continue.'
              : step === 1
                ? 'Choose your experience level to continue.'
                : 'Follow at least one plant to continue.'}
          </p>
        )}
      </div>
    </div>
  );
}

/** Mono step label plus three segments; the segments restate the label rather than replacing it. */
function StepIndicator({ step }: { step: number }) {
  return (
    <div className="flex flex-col gap-3">
      <span className="mono-label">
        Step {step + 1} of {STEP_COUNT}
      </span>
      <div className="flex gap-2" aria-hidden="true">
        {Array.from({ length: STEP_COUNT }, (_, index) => (
          <ProgressBar key={index} value={index <= step ? 1 : 0} max={1} size="sm" />
        ))}
      </div>
      <ol className="flex flex-wrap gap-x-6 gap-y-1">
        {STEPS.map((item, index) => (
          <li
            key={item.label}
            className={cn('text-small', index === step ? 'text-fg' : 'text-fg-muted')}
            aria-current={index === step ? 'step' : undefined}
          >
            {item.label}
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Multi-select, so these are `role="checkbox"` buttons: a RadioCard would announce single-select
 * semantics and lose the "pick as many as apply" affordance.
 */
function PracticeStep({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {PRACTICES.map((practice) => {
        const active = selected.includes(practice.label);
        return (
          <button
            key={practice.label}
            type="button"
            role="checkbox"
            aria-checked={active}
            onClick={() => onToggle(practice.label)}
            className={cn(
              'flex min-h-[88px] flex-col items-start gap-3 rounded-card border p-4 text-left transition-colors duration-100 ease-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base',
              active
                ? 'border-accent-600 bg-accent-tint shadow-l4'
                : 'border-line-subtle bg-bg-surface hover:-translate-y-px hover:border-line-strong',
            )}
          >
            <Icon name={practice.icon} size={22} className="text-accent-400" />
            <span className="text-body font-semibold text-fg">{practice.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function PlantStep({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const plants = useFollowablePlants();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const all = plants.data?.items ?? [];
    const needle = query.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(
      (plant) =>
        plant.commonName.toLowerCase().includes(needle) ||
        plant.botanicalName.toLowerCase().includes(needle) ||
        plant.family.toLowerCase().includes(needle),
    );
  }, [plants.data, query]);

  const totalPlants = plants.data?.total ?? plants.data?.items.length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          aria-label="Search plants"
          icon="search"
          type="search"
          placeholder="Search plants"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          containerClassName="max-w-xs"
          disabled={plants.isPending || plants.isError}
        />
      </div>

      {plants.isPending ? (
        <PlantGridSkeleton />
      ) : plants.isError ? (
        <ErrorState
          title="Could not load plants"
          message={apiErrorMessage(plants.error)}
          onRetry={() => void plants.refetch()}
        />
      ) : totalPlants === 0 ? (
        <EmptyState
          title="No plants exist yet"
          description="No monographs are published yet, so there is nothing to follow. You can follow plants later from any monograph."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No plants match this search"
          description={`Nothing in the catalogue matches "${query.trim()}". Try a common name, a botanical name or a family.`}
          watermark="search"
        />
      ) : (
        <div className="max-h-[420px] overflow-y-auto pb-28">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((plant) => (
              <PlantTile
                key={plant._id}
                plant={plant}
                selected={selected.includes(plant._id)}
                onToggle={() => onToggle(plant._id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The corner Checkbox is the accessible control; the tile body is a second click target for mouse
 * and touch. Clicks that originate inside the checkbox label are ignored here, otherwise one click
 * on the box would toggle twice (once natively, once through the tile).
 */
function PlantTile({
  plant,
  selected,
  onToggle,
}: {
  plant: Plant;
  selected: boolean;
  onToggle: () => void;
}) {
  const image = plant.images[0];
  const checkboxId = `follow-${plant._id}`;

  return (
    <div
      onClick={(event) => {
        if (event.target instanceof HTMLElement && event.target.closest('label,input')) return;
        onToggle();
      }}
      className={cn(
        'relative cursor-pointer overflow-hidden rounded-card border transition-colors duration-100 ease-base',
        selected
          ? 'border-accent-600 bg-accent-tint shadow-l4'
          : 'border-line-subtle bg-bg-surface hover:-translate-y-px hover:border-line-strong',
      )}
    >
      <div className="relative aspect-[4/3] w-full bg-bg-sunken">
        {image ? (
          <img src={image.url} alt={image.alt} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <Watermark name="leaf" size={96} />
        )}
      </div>

      <div className="absolute right-2 top-2 rounded-micro bg-bg-base/70 p-1 backdrop-blur-[8px]">
        <Checkbox
          id={checkboxId}
          checked={selected}
          onChange={onToggle}
          label={<span className="sr-only">Follow {plant.commonName}</span>}
        />
      </div>

      <div className="flex flex-col gap-0.5 p-3">
        <span className="text-body font-semibold text-fg">{plant.commonName}</span>
        <span className="botanical text-small text-fg-secondary">{plant.botanicalName}</span>
      </div>
    </div>
  );
}

function PlantGridSkeleton() {
  return (
    <div role="status" aria-label="Loading plants" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="overflow-hidden rounded-card border border-line-subtle bg-bg-surface">
          <Skeleton className="aspect-[4/3] w-full rounded-none" />
          <div className="flex flex-col gap-2 p-3">
            <Skeleton width="60%" height={16} />
            <Skeleton width="45%" height={12} />
          </div>
        </div>
      ))}
    </div>
  );
}
