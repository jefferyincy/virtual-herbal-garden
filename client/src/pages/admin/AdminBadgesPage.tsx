import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { Icon } from '@/components/icons';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Drawer } from '@/components/ui/Drawer';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { ErrorState } from '@/components/ui/ErrorState';
import { HexBadgeTile } from '@/components/ui/HexBadgeTile';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { Textarea } from '@/components/ui/Textarea';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import {
  apiErrorMessage,
  BADGE_ACTION_OPTIONS,
  BADGE_ICON_OPTIONS,
  useAdminBadges,
  useAdminPlants,
  useDeleteBadge,
  useSaveBadge,
  type AdminBadgeRow,
  type BadgeActionOption,
  type BadgeWriteInput,
} from '@/features/admin/hooks';

/** How each criteria action reads in the mono criteria line and in the builder. */
const ACTION_META: Record<BadgeActionOption, { verb: string; targetUnit: string; paramLabel: string | null }> = {
  read_plant: { verb: 'Read', targetUnit: 'plants', paramLabel: null },
  complete_lesson: { verb: 'Complete', targetUnit: 'lessons', paramLabel: null },
  complete_quiz: { verb: 'Pass', targetUnit: 'quizzes', paramLabel: null },
  quiz_pass_rate: { verb: 'Score', targetUnit: 'percent', paramLabel: null },
  streak_days: { verb: 'Study', targetUnit: 'days in a row', paramLabel: null },
  read_plant_family: { verb: 'Read', targetUnit: 'plants', paramLabel: 'of family' },
  contribute_post: { verb: 'Get', targetUnit: 'posts approved', paramLabel: null },
  follow_plant: { verb: 'Follow', targetUnit: 'plants', paramLabel: null },
};

const TARGET_CHOICES = [1, 3, 5, 10, 25, 50, 90, 100];

const ICON_SHAPES = new Set<string>(BADGE_ICON_OPTIONS);

/**
 * `HexBadgeTile` always prints its `name` under the hexagon. Where the name is already rendered
 * (the card's h3, or the icon picker's icon key), the duplicate caption is hidden rather than
 * shouted twice - the tile keeps its `aria-label`, so the accessible name is unaffected.
 */
const TILE_CAPTION_HIDDEN = '[&>div>span:last-child]:hidden';
const BADGE_ACTION_SET = new Set<string>(BADGE_ACTION_OPTIONS);

interface Draft {
  _id: string | null;
  key: string;
  name: string;
  description: string;
  action: BadgeActionOption;
  target: number;
  param: string;
  xpReward: number;
  icon: string;
}

function draftFromBadge(badge: AdminBadgeRow | null): Draft {
  if (!badge) {
    return {
      _id: null,
      key: '',
      name: '',
      description: '',
      action: 'read_plant',
      target: 1,
      param: '',
      xpReward: 20,
      icon: 'leaf',
    };
  }
  const action = criteriaAction(badge.criteria.action);
  return {
    _id: badge._id,
    key: badge.key,
    name: badge.name,
    description: badge.description,
    action,
    target: badge.criteria.target,
    param: badge.criteria.param ?? '',
    xpReward: badge.xpReward,
    icon: badge.icon,
  };
}

export default function AdminBadgesPage() {
  const badges = useAdminBadges();
  const plants = useAdminPlants({ status: 'all', page: 1 });
  const save = useSaveBadge();
  const remove = useDeleteBadge();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminBadgeRow | null>(null);

  const items = badges.data?.items ?? [];

  /** Param choices are the plant families the admin plant list has already returned. */
  const families = useMemo(() => {
    const set = new Set<string>();
    for (const plant of plants.data?.items ?? []) set.add(plant.family);
    if (draft?.param) set.add(draft.param);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [plants.data, draft?.param]);

  function update(patch: Partial<Draft>): void {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  function submit(): void {
    if (!draft) return;
    const input: BadgeWriteInput = {
      key: draft.key.trim(),
      name: draft.name.trim(),
      description: draft.description.trim(),
      criteria: {
        action: draft.action,
        target: draft.target,
        param: ACTION_META[draft.action].paramLabel ? draft.param.trim() || null : null,
      },
      xpReward: draft.xpReward,
      icon: ICON_SHAPES.has(draft.icon) ? draft.icon : 'award',
    };
    save.mutate(
      { ...(draft._id ? { id: draft._id } : {}), input },
      { onSuccess: () => setDraft(null) },
    );
  }

  return (
    <div className="mx-auto w-full max-w-content">
      <PageHeader
        title="Badges"
        eyebrow="Admin"
        description="Achievements learners can earn, and the criteria that award them."
        actions={
          <Button iconLeft="plus" onClick={() => setDraft(draftFromBadge(null))}>
            New badge
          </Button>
        }
      />

      {save.isError && <ErrorBanner className="mb-4" message={apiErrorMessage(save.error)} />}

      {badges.isPending && <BadgeGridSkeleton />}

      {badges.isError && (
        <ErrorState
          title="Couldn't load badges"
          message="The admin badge list did not respond."
          onRetry={() => void badges.refetch()}
        />
      )}

      {badges.isSuccess && items.length === 0 && (
        <EmptyState
          title="No badges yet"
          description="Create the first achievement, or run the seed script to generate the starter set."
          watermark="award"
          action={<Button onClick={() => setDraft(draftFromBadge(null))}>New badge</Button>}
        />
      )}

      {badges.isSuccess && items.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((badge) => {
            return (
              <Card key={badge._id} variant="flat" padding="lg" className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className={TILE_CAPTION_HIDDEN}>
                    <HexBadgeTile
                      name={badge.name}
                      icon={iconForTile(badge.icon)}
                      unlocked
                      size={64}
                      description={badge.description}
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <IconAction
                      label={`Edit ${badge.name}`}
                      icon="pencil"
                      onClick={() => setDraft(draftFromBadge(badge))}
                    />
                    <IconAction
                      label={`Duplicate ${badge.name}`}
                      icon="copy"
                      onClick={() =>
                        setDraft({
                          ...draftFromBadge(badge),
                          _id: null,
                          key: `${badge.key}-copy`,
                          name: `${badge.name} copy`,
                        })
                      }
                    />
                    <IconAction
                      label={`Delete ${badge.name}`}
                      icon="trash"
                      danger
                      onClick={() => setConfirmDelete(badge)}
                    />
                  </div>
                </div>

                <h2 className="text-h3 text-fg">{badge.name}</h2>
                <p className="mono-label">{criteriaLine(badge)}</p>
                <p className="text-small text-fg-secondary reading-measure">{badge.description}</p>
                <div className="mt-auto flex items-center justify-between gap-2 border-t border-line-subtle pt-3">
                  <span className="mono-label">Earned by {formatNumber(badge.earnedBy)} users</span>
                  <Chip tone="accent" size="sm">
                    +{formatNumber(badge.xpReward)} XP
                  </Chip>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Drawer
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?._id ? 'Edit badge' : 'New badge'}
        width={520}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              loading={save.isPending}
              disabled={!draft?.key.trim() || !draft?.name.trim()}
              onClick={submit}
            >
              {draft?._id ? 'Save badge' : 'Create badge'}
            </Button>
          </>
        }
      >
        {draft && <BadgeEditor draft={draft} families={families} onUpdate={update} />}
      </Drawer>

      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Delete this badge?"
        description="The badge key is also removed from every user who earned it. This cannot be undone."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={remove.isPending}
              onClick={() => {
                if (!confirmDelete) return;
                remove.mutate(confirmDelete._id, { onSuccess: () => setConfirmDelete(null) });
              }}
            >
              Delete badge
            </Button>
          </>
        }
      >
        {confirmDelete && (
          <p className="text-small text-fg-secondary">
            <span className="text-fg">{confirmDelete.name}</span> · key{' '}
            <span className="font-mono text-micro">{confirmDelete.key}</span> · earned by{' '}
            {formatNumber(confirmDelete.earnedBy)} users
          </p>
        )}
      </Modal>
    </div>
  );
}

/** Unknown keys from the server fall back to the tile's own default so the grid still renders. */
function iconForTile(icon: string): string {
  return ICON_SHAPES.has(icon) ? icon : 'award';
}

/**
 * Badge criteria come back from the server as plain strings. Narrowing through a Set keeps the
 * lookup total: an action this build does not know about reads as `read_plant` rather than
 * crashing the card, and the criteria line still states the real target.
 */
function criteriaAction(action: string): BadgeActionOption {
  return BADGE_ACTION_SET.has(action) ? (action as BadgeActionOption) : 'read_plant';
}

/**
 * e.g. `READ 10 PLANTS · LAMIACEAE` when the criteria carries a param. `earn_badge` is absent from
 * the action list on purpose - the server never evaluates it, so no badge can carry it.
 */
function criteriaLine(badge: Pick<AdminBadgeRow, 'criteria'>): string {
  const meta = ACTION_META[criteriaAction(badge.criteria.action)];
  const parts = [`${meta.verb} ${badge.criteria.target} ${meta.targetUnit}`];
  if (meta.paramLabel && badge.criteria.param) parts.push(badge.criteria.param.toUpperCase());
  return parts.join(' · ').toUpperCase();
}

function IconAction({
  label,
  icon,
  onClick,
  danger = false,
}: {
  label: string;
  icon: 'pencil' | 'copy' | 'trash';
  onClick: () => void;
  danger?: boolean;
}): ReactNode {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'inline-flex size-9 items-center justify-center rounded-btn transition-colors duration-100 ease-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow',
        danger ? 'text-danger hover:bg-danger-tint' : 'text-fg-secondary hover:bg-bg-hover hover:text-fg',
      )}
    >
      <Icon name={icon} size={16} />
    </button>
  );
}

function BadgeEditor({
  draft,
  families,
  onUpdate,
}: {
  draft: Draft;
  families: string[];
  onUpdate: (patch: Partial<Draft>) => void;
}): ReactNode {
  const meta = ACTION_META[draft.action];
  const criteriaPreview = `${meta.verb.toUpperCase()} ${draft.target} ${meta.targetUnit.toUpperCase()}${
    meta.paramLabel && draft.param ? ` · ${draft.param.toUpperCase()}` : ''
  }`;
  // A seeded badge can carry a target the preset list does not contain (e.g. 12). Without it as an
  // option the select cannot represent the record it is editing and the first change silently
  // rewrites the target, so the current value is always spliced into the choices.
  const targetValues = Array.from(new Set([...TARGET_CHOICES, draft.target])).sort((a, b) => a - b);

  return (
    <div className="flex flex-col gap-5">
      <Input
        label="Name"
        value={draft.name}
        onChange={(event) => onUpdate({ name: event.target.value })}
      />
      <Input
        label="Key"
        value={draft.key}
        hint="Unique across all badges. Duplicating a badge appends -copy."
        className="font-mono text-small"
        onChange={(event) => onUpdate({ key: event.target.value })}
      />
      <Textarea
        label="Description"
        rows={2}
        value={draft.description}
        onChange={(event) => onUpdate({ description: event.target.value })}
      />

      <div className="flex flex-col gap-2">
        <span className="text-small text-fg-secondary">Icon</span>
        <div className="flex flex-wrap gap-3">
          {BADGE_ICON_OPTIONS.map((icon) => (
            <button
              key={icon}
              type="button"
              aria-label={`Use the ${icon} icon`}
              aria-pressed={draft.icon === icon}
              onClick={() => onUpdate({ icon })}
              className={cn(
                'rounded-btn p-0.5 transition-colors duration-100 ease-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow',
                draft.icon === icon ? 'ring-2 ring-accent-600' : 'hover:bg-bg-hover',
              )}
            >
              <span className={TILE_CAPTION_HIDDEN}>
                <HexBadgeTile name={icon} icon={icon} unlocked size={44} />
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* The Badge model has no colour field - every badge renders in the accent ramp. These
          swatches are design tokens shown for reference only, so the hexagon preview below is a
          presentation of the palette rather than a value that would ever be persisted. */}
      <div className="flex flex-col gap-2">
        <span className="text-small text-fg-secondary">Icon colour</span>
        <div className="flex flex-wrap items-center gap-2">
          {COLOR_TOKENS.map((token) => (
            <span
              key={token.label}
              className={cn(
                'flex items-center gap-2 rounded-full border border-line-subtle px-2 py-1 font-mono text-micro uppercase text-fg-muted',
              )}
            >
              <span className={cn('size-3 rounded-full', token.swatch)} />
              {token.label}
            </span>
          ))}
        </div>
        <p className="mono-label">Reference only: the server stores no colour, badges render in accent</p>
      </div>

      <div className="flex flex-col gap-3 border-t border-line-subtle pt-4">
        <h3 className="text-h3 text-fg">Criteria</h3>
        <Select
          label="Action"
          options={BADGE_ACTION_OPTIONS.map((action) => ({
            value: action,
            label: ACTION_META[action].verb,
          }))}
          value={draft.action}
          onChange={(event) => {
            const action = event.target.value as BadgeActionOption;
            onUpdate({ action, ...(ACTION_META[action].paramLabel ? {} : { param: '' }) });
          }}
        />
        <Select
          label="Target"
          options={targetValues.map((value) => ({
            value: String(value),
            label: `${value} ${meta.targetUnit}`,
          }))}
          value={String(draft.target)}
          onChange={(event) => onUpdate({ target: Number(event.target.value) })}
        />
        <Select
          label={meta.paramLabel ? 'Family' : 'Param'}
          hint={meta.paramLabel ? undefined : 'This action takes no param.'}
          disabled={!meta.paramLabel}
          placeholder={meta.paramLabel ? 'Select a value' : 'Not used'}
          options={families.map((family) => ({ value: family, label: family }))}
          value={draft.param}
          onChange={(event) => onUpdate({ param: event.target.value })}
        />
        <p className="mono-label">{criteriaPreview}</p>
      </div>

      <Input
        label="XP reward"
        type="number"
        min={0}
        value={draft.xpReward}
        onChange={(event) => onUpdate({ xpReward: Math.max(0, Number(event.target.value) || 0) })}
      />

      <div className="flex flex-col gap-2 border-t border-line-subtle pt-4">
        <span className="text-small text-fg-secondary">Preview</span>
        <div className="flex items-center gap-4 rounded-card border border-accent-600 bg-bg-surface p-4 shadow-l4">
          <div className={TILE_CAPTION_HIDDEN}>
            <HexBadgeTile
              name={draft.name || 'Untitled badge'}
              icon={iconForTile(draft.icon)}
              unlocked
              size={64}
            />
          </div>
          <div className="min-w-0">
            <p className="mono-label">{criteriaPreview}</p>
            <p className="text-body text-fg">{draft.description || 'No description yet.'}</p>
            <p className="mono-label mt-1">Unlocked · +{formatNumber(draft.xpReward)} XP</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Design-token swatches only - no hex literals, no rainbow (DESIGN.md). */
const COLOR_TOKENS: Array<{ label: string; swatch: string }> = [
  { label: 'Accent 500', swatch: 'bg-accent-500' },
  { label: 'Accent 400', swatch: 'bg-accent-400' },
  { label: 'Accent 600', swatch: 'bg-accent-600' },
  { label: 'Clay 500', swatch: 'bg-clay-500' },
  { label: 'Warning', swatch: 'bg-warning' },
  { label: 'Danger', swatch: 'bg-danger' },
];

function BadgeGridSkeleton(): ReactNode {
  return (
    <div role="status" aria-label="Loading badges" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2, 3, 4, 5].map((index) => (
        <Card key={index} variant="flat" padding="lg" className="flex flex-col gap-3">
          <Skeleton variant="circle" width={64} height={64} />
          <Skeleton width={110} height={11} />
          <Skeleton width={160} height={20} />
          <Skeleton width="100%" height={12} />
        </Card>
      ))}
    </div>
  );
}
