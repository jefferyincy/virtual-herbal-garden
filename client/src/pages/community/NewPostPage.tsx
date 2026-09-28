import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Icon } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Input } from '@/components/ui/Input';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import {
  apiErrorMessage,
  useCreatePost,
  usePlantSearch,
  type CreatePostInput,
} from '@/features/community/hooks';
import { formatRelative } from '@/lib/format';
import { useSession } from '@/stores/session';
import type { PostType } from '@/types/api';

const TITLE_MIN = 4;
const TITLE_MAX = 160;
const BODY_MIN = 20;
const BODY_MAX = 8000;
const MAX_PLANTS = 5;

const TYPE_OPTIONS: Array<{ value: PostType; label: string; icon: 'leaf' | 'message' | 'pencil' }> = [
  { value: 'remedy', label: 'Remedy', icon: 'leaf' },
  { value: 'question', label: 'Question', icon: 'message' },
  { value: 'note', label: 'Note', icon: 'pencil' },
];

type SelectedPlant = {
  slug: string;
  commonName: string;
  botanicalName: string;
  imageUrl: string | null;
};

type DraftState = {
  type: PostType;
  title: string;
  body: string;
  plants: SelectedPlant[];
  sources: string[];
  savedAt: string;
};

/**
 * There is no draft endpoint in this pass, so a saved draft lives in `vhg:post-draft` on this
 * device only - never on the server - and the form says so. The store is untrusted input (older
 * builds, hand edits), so it is parsed once at the boundary.
 */
const DRAFT_KEY = 'vhg:post-draft';

const selectedPlantSchema = z.object({
  slug: z.string(),
  commonName: z.string(),
  botanicalName: z.string().default(''),
  imageUrl: z.string().nullable().default(null),
});

const draftSchema = z.object({
  type: z.enum(['remedy', 'question', 'note']),
  title: z.string(),
  body: z.string(),
  plants: z.array(selectedPlantSchema).max(MAX_PLANTS).default([]),
  sources: z.array(z.string()).default([]),
  savedAt: z.string(),
});

function readDraft(): DraftState | null {
  if (typeof window === 'undefined') return null;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(DRAFT_KEY);
  } catch {
    // Storage can be disabled entirely; the form still works for the current session.
    return null;
  }
  if (!raw) return null;

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = draftSchema.safeParse(parsedJson);
  return parsed.success ? parsed.data : null;
}

function clearStoredDraft(): void {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Nothing to do: a failed removal cannot break submission, which already cleared state.
  }
}

export default function NewPostPage() {
  const navigate = useNavigate();
  const { push } = useToast();
  const status = useSession((s) => s.status);
  const createPost = useCreatePost();

  const [type, setType] = useState<PostType>('remedy');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [plants, setPlants] = useState<SelectedPlant[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [sourceInput, setSourceInput] = useState('');
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [restoredAt, setRestoredAt] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  // Restore once on mount. The effect runs before any keystroke, so nothing the user typed can be
  // overwritten by the stored copy.
  useEffect(() => {
    const draft = readDraft();
    if (!draft) return;
    setType(draft.type);
    setTitle(draft.title);
    setBody(draft.body);
    setPlants(draft.plants);
    setSources(draft.sources);
    setRestoredAt(draft.savedAt);
  }, []);

  const remedyNeedsSource = type === 'remedy' && sources.length === 0;
  const titleError =
    title.length > 0 && title.trim().length < TITLE_MIN
      ? `Use at least ${TITLE_MIN} characters`
      : null;
  const bodyError =
    body.length > 0 && body.trim().length < BODY_MIN ? `Use at least ${BODY_MIN} characters` : null;

  const canSubmit =
    !remedyNeedsSource &&
    title.trim().length >= TITLE_MIN &&
    title.trim().length <= TITLE_MAX &&
    body.trim().length >= BODY_MIN &&
    body.trim().length <= BODY_MAX;

  const addSource = () => {
    const value = sourceInput.trim();
    if (value.length === 0) return;
    if (!z.string().url().safeParse(value).success) {
      setSourceError('Enter a full URL, including https://');
      return;
    }
    setSourceError(null);
    setSourceInput('');
    setSources((current) => [...current, value]);
  };

  const saveDraft = () => {
    const draft: DraftState = {
      type,
      title,
      body,
      plants,
      sources,
      savedAt: new Date().toISOString(),
    };
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      setRestoredAt(draft.savedAt);
      push({
        variant: 'info',
        title: 'Draft saved on this device',
        description: 'It is stored in this browser only and never sent to the server.',
      });
    } catch {
      push({
        variant: 'warning',
        title: "Couldn't save the draft",
        description: 'Browser storage is unavailable, so the draft was not kept.',
      });
    }
  };

  const submit = () => {
    if (!canSubmit || createPost.isPending) return;
    setServerError(null);

    const input: CreatePostInput = {
      type,
      title: title.trim(),
      body: body.trim(),
      ...(plants.length > 0 ? { plantIds: plants.map((plant) => plant.slug) } : {}),
      ...(sources.length > 0 ? { sources } : {}),
    };

    createPost.mutate(input, {
      onSuccess: (result) => {
        // The server owns the draft's fate from here: clearing it prevents a stale local copy of a
        // post that already exists remotely.
        clearStoredDraft();
        navigate(`/community/${result.post._id}`);
      },
      onError: (error) => {
        setServerError(apiErrorMessage(error));
      },
    });
  };

  if (status === 'loading') {
    return (
      <div className="mx-auto w-full max-w-[640px]" role="status" aria-label="Checking your session">
        <div className="mb-8 h-10 w-56 animate-shimmer rounded-input bg-white/[0.06]" />
        <div className="h-72 animate-shimmer rounded-card bg-white/[0.06]" />
      </div>
    );
  }

  if (status === 'anonymous') {
    return (
      <div className="mx-auto w-full max-w-[640px]">
        <EmptyState
          title="Sign in to share"
          description="Posting a remedy, question or note needs an account so moderators know who to answer."
          watermark="lock"
          action={
            <Link
              to="/login"
              className="inline-flex h-11 items-center gap-2 rounded-btn bg-accent-500 px-4 font-semibold text-fg-onAccent transition-colors duration-100 ease-base hover:bg-accent-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
            >
              <Icon name="user" size={18} />
              Sign in
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-6">
      <div>
        <h1 className="text-h1 text-fg">Share something</h1>
        <p className="mt-2 text-body text-fg-secondary">
          Remedies, questions and field notes from your own practice. Cite what you can.
        </p>
      </div>

      <form
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="flex flex-col gap-2">
          <span className="text-small text-fg-secondary">Type</span>
          <SegmentedControl
            options={TYPE_OPTIONS}
            value={type}
            onChange={(value) => setType(value as PostType)}
          />
        </div>

        <Input
          label="Title"
          placeholder="What is this about?"
          value={title}
          maxLength={TITLE_MAX}
          error={titleError}
          hint={`${title.length}/${TITLE_MAX}`}
          onChange={(event) => setTitle(event.target.value)}
        />

        <Textarea
          label="Details"
          placeholder="Describe the preparation, the context and what you observed."
          rows={8}
          value={body}
          maxLength={BODY_MAX}
          error={bodyError}
          counter={{ value: body.length, max: BODY_MAX }}
          onChange={(event) => setBody(event.target.value)}
        />

        <PlantTagger selected={plants} onChange={setPlants} />

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline gap-2">
            <span className="text-small text-fg-secondary">Sources</span>
            {type === 'remedy' && (
              <span className="font-mono text-micro uppercase text-clay-400">Required</span>
            )}
          </div>
          <p className="text-small text-fg-muted">Remedies must cite a source</p>

          <div className="flex items-start gap-2">
            <Input
              placeholder="https://..."
              value={sourceInput}
              error={sourceError}
              onChange={(event) => {
                setSourceInput(event.target.value);
                if (sourceError) setSourceError(null);
              }}
            />
            <Button variant="secondary" iconLeft="plus" onClick={addSource}>
              Add
            </Button>
          </div>

          {sources.length > 0 && (
            <ul className="flex flex-col gap-1">
              {sources.map((source, index) => (
                <li
                  key={source}
                  className="flex items-center gap-2 rounded-input border border-line-subtle bg-bg-surface px-3 py-2"
                >
                  <Icon name="external-link" size={14} className="shrink-0 text-fg-muted" />
                  <span className="min-w-0 flex-1 truncate text-small text-fg-secondary">{source}</span>
                  <button
                    type="button"
                    aria-label={`Remove source ${index + 1}`}
                    onClick={() => setSources((current) => current.filter((_, at) => at !== index))}
                    className="shrink-0 rounded-btn p-1 text-fg-muted transition-colors duration-100 ease-base hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
                  >
                    <Icon name="close" size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Client-side mirror of the server rule: the persistent helper line above states the
              requirement, and this notice explains why Submit is disabled - the two never repeat
              the same sentence. */}
          {remedyNeedsSource && (
            <p className="flex items-center gap-1 text-small text-danger">
              <Icon name="alert-circle" size={14} />
              Add at least one source before submitting this remedy
            </p>
          )}
        </div>

        <div className="flex items-start gap-3 rounded-card border border-line-subtle bg-bg-surface p-4">
          <Icon name="shield" size={18} className="mt-0.5 shrink-0 text-fg-muted" />
          <p className="text-small text-fg-secondary">
            Posts are reviewed by a moderator before they appear in the public feed. Your post is
            visible only to you until it is approved.
          </p>
        </div>

        {serverError && <ErrorBanner message={serverError} />}

        {restoredAt && (
          <p className="mono-label">
            Draft restored from this device · saved {formatRelative(restoredAt)}
          </p>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-line-subtle pt-4">
          <div className="flex flex-col gap-1">
            <Button variant="ghost" iconLeft="download" onClick={saveDraft} disabled={createPost.isPending}>
              Save draft
            </Button>
            {/* Honest about where the draft lives: there is no server-side draft endpoint. */}
            <span className="mono-label">Drafts are stored on this device only</span>
          </div>

          <div className="flex flex-col items-end gap-1">
            <Button
              type="submit"
              variant="primary"
              loading={createPost.isPending}
              disabled={!canSubmit}
            >
              Submit for review
            </Button>
            <span className="mono-label">Posts are reviewed before appearing publicly</span>
          </div>
        </div>
      </form>
    </div>
  );
}

function PlantTagger({
  selected,
  onChange,
}: {
  selected: SelectedPlant[];
  onChange: (next: SelectedPlant[]) => void;
}): ReactNode {
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const search = usePlantSearch(term);
  const atLimit = selected.length >= MAX_PLANTS;

  const chosenSlugs = useMemo(() => new Set(selected.map((plant) => plant.slug)), [selected]);
  const matches = search.results.filter((plant) => !chosenSlugs.has(plant.slug));

  const pick = (plant: (typeof search.results)[number]) => {
    if (atLimit) return;
    onChange([
      ...selected,
      {
        slug: plant.slug,
        commonName: plant.commonName,
        botanicalName: plant.botanicalName,
        imageUrl: plant.images[0]?.url ?? null,
      },
    ]);
    setTerm('');
    setOpen(false);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-small text-fg-secondary">Tag plants</span>
        <span className="mono-label">
          {selected.length}/{MAX_PLANTS}
        </span>
      </div>

      <div className="relative">
        <Input
          icon="search"
          placeholder={atLimit ? 'Plant limit reached' : 'Search a plant by name'}
          value={term}
          disabled={atLimit}
          hint={atLimit ? `Remove one to tag another (maximum ${MAX_PLANTS})` : undefined}
          onChange={(event) => {
            setTerm(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Delayed so a click on a result lands before the list unmounts.
            window.setTimeout(() => setOpen(false), 150);
          }}
        />

        {open && term.trim().length > 0 && (
          <div
            role="listbox"
            aria-label="Plant matches"
            className="absolute left-0 right-0 top-full z-20 mt-1 rounded-card border border-line-strong bg-bg-raised p-1 shadow-l2"
          >
            {search.isPending ? (
              <p className="px-3 py-2 text-small text-fg-muted">Searching…</p>
            ) : search.isError ? (
              <p className="px-3 py-2 text-small text-danger" role="alert">
                {apiErrorMessage(search.error)}
              </p>
            ) : matches.length === 0 ? (
              <p className="px-3 py-2 text-small text-fg-muted">
                No plants match &ldquo;{term.trim()}&rdquo;
              </p>
            ) : (
              matches.map((plant) => (
                <button
                  key={plant.slug}
                  type="button"
                  role="option"
                  aria-selected={false}
                  disabled={atLimit}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => pick(plant)}
                  className="flex w-full items-center gap-3 rounded-btn px-2 py-2 text-left transition-colors duration-100 ease-base hover:bg-bg-hover disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
                >
                  <PlantThumb url={plant.images[0]?.url ?? null} name={plant.commonName} size={28} />
                  <span className="min-w-0">
                    <span className="block truncate text-small text-fg">{plant.commonName}</span>
                    <span className="botanical block truncate text-micro text-clay-400">
                      {plant.botanicalName}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((plant) => (
            <span
              key={plant.slug}
              className="inline-flex items-center gap-2 rounded-full border border-line-subtle bg-bg-surface py-1 pl-1 pr-2"
            >
              <PlantThumb url={plant.imageUrl} name={plant.commonName} size={24} />
              <span className="text-small text-fg">{plant.commonName}</span>
              <button
                type="button"
                aria-label={`Remove ${plant.commonName}`}
                onClick={() => onChange(selected.filter((entry) => entry.slug !== plant.slug))}
                className="rounded-full p-0.5 text-fg-muted transition-colors duration-100 ease-base hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
              >
                <Icon name="close" size={14} />
              </button>
            </span>
          ))}
        </div>
      )}

      {selected.length > 0 && (
        <p className="text-small text-fg-muted">
          Tagged plants appear as reference cards on the published post.
        </p>
      )}
    </div>
  );
}

function PlantThumb({
  url,
  name,
  size,
}: {
  url: string | null;
  name: string;
  size: number;
}): ReactNode {
  return (
    <span
      style={{ width: size, height: size }}
      className="grid shrink-0 place-items-center overflow-hidden rounded-full bg-bg-sunken"
    >
      {url ? (
        <img src={url} alt={name} loading="lazy" className="size-full object-cover" />
      ) : (
        <Icon name="leaf" size={Math.round(size * 0.55)} className="text-fg-muted" />
      )}
    </span>
  );
}
