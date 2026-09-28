import type { MutableRefObject, ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/icons';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { ErrorState } from '@/components/ui/ErrorState';
import { KeyboardHint } from '@/components/ui/KeyboardHint';
import { Modal } from '@/components/ui/Modal';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Skeleton } from '@/components/ui/Skeleton';
import { Textarea } from '@/components/ui/Textarea';
import { Dropdown } from '@/components/ui/Dropdown';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
import {
  apiErrorMessage,
  useDeletePost,
  useModeratePost,
  useModerationDiff,
  useModerationQueue,
  type ModerationAction,
  type ModerationVersion,
} from '@/features/admin/hooks';
import type { PostStatus, PostType } from '@/types/api';

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

const TYPE_TONE: Record<PostType, 'accent' | 'clay' | 'neutral'> = {
  remedy: 'accent',
  question: 'clay',
  note: 'neutral',
};

/** Actions whose contract requires a reviewer note; the buttons stay disabled without one. */
const NOTE_REQUIRED: ReadonlyArray<ModerationAction> = ['reject', 'request_changes'];

export default function AdminModerationPage() {
  const [status, setStatus] = useState<PostStatus>('pending');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const queue = useModerationQueue(status);
  const diff = useModerationDiff(activeId ?? undefined);
  const moderate = useModeratePost();
  const removePost = useDeletePost();

  const items = queue.data?.items ?? [];

  // Keep a selection that is valid for the current queue without clobbering an explicit choice.
  const activeIndex = items.findIndex((item) => item._id === activeId);
  useEffect(() => {
    if (items.length === 0) {
      if (activeId !== null) setActiveId(null);
      return;
    }
    if (activeIndex === -1) setActiveId(items[0]?._id ?? null);
  }, [items, activeId, activeIndex]);

  // The note belongs to one post; carrying it across a selection change would apply one review's
  // wording to another post.
  useEffect(() => {
    setNote('');
  }, [activeId]);

  const activeItem = activeIndex >= 0 ? items[activeIndex] : undefined;
  const hasNote = note.trim().length > 0;

  function runAction(action: ModerationAction): void {
    if (!activeId) return;
    if (NOTE_REQUIRED.includes(action) && !hasNote) return;
    moderate.mutate(
      { id: activeId, action, ...(hasNote ? { note: note.trim() } : {}) },
      { onSuccess: () => setNote('') },
    );
  }

  /**
   * The keyboard hints under the buttons are a user-visible promise, so the bindings are really
   * implemented. They listen on the document (not a focused container) because the reviewer's
   * hands stay on the keyboard after clicking into the diff. Typing is excluded by checking the
   * event target, otherwise a note containing "a" would approve the post.
   *
   * No dependency array on purpose: the listener closes over the current queue, selection and
   * note, so it is re-registered on every render rather than reading stale state.
   */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) {
          return;
        }
      }
      if (event.key === 'a' || event.key === 'A') {
        event.preventDefault();
        runAction('approve');
      } else if (event.key === 'r' || event.key === 'R') {
        event.preventDefault();
        runAction('reject');
      } else if (event.key === 'j' || event.key === 'J') {
        event.preventDefault();
        moveSelection(1);
      } else if (event.key === 'k' || event.key === 'K') {
        event.preventDefault();
        moveSelection(-1);
      }
    }

    function moveSelection(step: 1 | -1): void {
      if (items.length === 0) return;
      const current = items.findIndex((item) => item._id === activeId);
      const next = Math.min(Math.max((current === -1 ? 0 : current) + step, 0), items.length - 1);
      const target = items[next];
      if (target) setActiveId(target._id);
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  });

  const mutationError = moderate.error ?? removePost.error;

  return (
    <div className="mx-auto w-full max-w-content">
      <PageHeader
        title="Moderation"
        eyebrow="Admin"
        description="Community contributions awaiting a reviewer decision."
        actions={
          <span className="mono-label">
            {queue.data ? `${queue.data.pendingCount} pending · ${queue.data.flaggedCount} flagged` : ''}
          </span>
        }
      />

      {mutationError && (
        <ErrorBanner
          className="mb-4"
          message={apiErrorMessage(mutationError)}
          onDismiss={() => {
            moderate.reset();
            removePost.reset();
          }}
        />
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <QueuePane
          status={status}
          onStatusChange={(next) => {
            setStatus(next as PostStatus);
            setActiveId(null);
          }}
          loading={queue.isPending}
          error={queue.isError}
          onRetry={() => void queue.refetch()}
          items={items}
          activeId={activeId}
          onSelect={setActiveId}
          rowRefs={rowRefs}
          counts={
            queue.data
              ? { total: queue.data.total, pending: queue.data.pendingCount, flagged: queue.data.flaggedCount }
              : null
          }
        />

        <div className="min-w-0 flex-1">
          {queue.isError && (
            <ErrorState
              title="Couldn't load the moderation queue"
              message="The queue endpoint did not respond."
              onRetry={() => void queue.refetch()}
            />
          )}

          {!queue.isError && !queue.isPending && items.length === 0 && (
            <EmptyState
              title="You're all caught up"
              description={`Nothing is waiting in the ${status} queue.`}
              watermark="check-circle"
            />
          )}

          {!queue.isError && activeItem && (
            <div className="flex flex-col gap-4">
              <Card variant="flat" padding="lg">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Chip tone={TYPE_TONE[activeItem.type]} size="sm">
                        {activeItem.type}
                      </Chip>
                      <span className="mono-label">{formatRelative(activeItem.createdAt)}</span>
                    </div>
                    <h2 className="mt-2 text-h3 text-fg">{activeItem.title}</h2>
                    <p className="mono-label mt-1">
                      by {activeItem.author.name} · @{activeItem.author.handle}
                    </p>
                  </div>
                  <Dropdown
                    trigger={
                      <span className="inline-flex h-9 items-center gap-2 rounded-btn px-3 text-small text-fg-secondary hover:bg-bg-hover hover:text-fg">
                        More
                        <Icon name="chevron-down" size={14} />
                      </span>
                    }
                    items={[
                      {
                        label: 'Delete post',
                        icon: 'trash',
                        danger: true,
                        onSelect: () => setConfirmDelete(true),
                      },
                    ]}
                  />
                </div>

                {activeItem.plantIds.length > 0 && (
                  <p className="mono-label mt-3">
                    {activeItem.plantIds.length} linked plant
                    {activeItem.plantIds.length === 1 ? '' : 's'}
                  </p>
                )}
              </Card>

              {diff.isPending && <DiffSkeleton />}

              {diff.isError && (
                <ErrorState
                  title="Couldn't load the diff"
                  message="The revision comparison did not respond."
                  onRetry={() => void diff.refetch()}
                />
              )}

              {diff.isSuccess && diff.data && (
                <DiffView
                  submitted={diff.data.submitted}
                  current={diff.data.current}
                  changedLines={diff.data.changedLines}
                />
              )}

              <Card variant="flat" padding="lg" className="flex flex-col gap-3">
                <Textarea
                  label="Reviewer note"
                  rows={3}
                  value={note}
                  counter={{ value: note.length, max: 1000 }}
                  onChange={(event) => setNote(event.target.value)}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    loading={moderate.isPending && moderate.variables?.action === 'approve'}
                    onClick={() => runAction('approve')}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={!hasNote}
                    title={hasNote ? undefined : 'A note is required to request changes'}
                    loading={moderate.isPending && moderate.variables?.action === 'request_changes'}
                    onClick={() => runAction('request_changes')}
                  >
                    Request changes
                  </Button>
                  <Button
                    variant="danger"
                    disabled={!hasNote}
                    title={hasNote ? undefined : 'A note is required to reject'}
                    loading={moderate.isPending && moderate.variables?.action === 'reject'}
                    onClick={() => runAction('reject')}
                  >
                    Reject
                  </Button>
                  {!hasNote && (
                    <p className="text-small text-fg-secondary">
                      A reviewer note is required before rejecting or requesting changes.
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 border-t border-line-subtle pt-3">
                  <span className="mono-label">Shortcuts</span>
                  <KeyboardHint keys={['A', 'approve']} />
                  <KeyboardHint keys={['R', 'reject']} />
                  <KeyboardHint keys={['J', 'K', 'next']} />
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this post?"
        description="The post and its comments disappear from the community feed. This cannot be undone."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={removePost.isPending}
              onClick={() => {
                if (!activeId) return;
                removePost.mutate(activeId, {
                  onSuccess: () => {
                    setConfirmDelete(false);
                    setActiveId(null);
                  },
                });
              }}
            >
              Delete post
            </Button>
          </>
        }
      >
        {activeItem && <p className="text-small text-fg-secondary">{activeItem.title}</p>}
      </Modal>
    </div>
  );
}

function QueuePane({
  status,
  onStatusChange,
  loading,
  error,
  onRetry,
  items,
  activeId,
  onSelect,
  rowRefs,
  counts,
}: {
  status: PostStatus;
  onStatusChange: (value: string) => void;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  items: Array<{
    _id: string;
    type: PostType;
    title: string;
    author: { name: string; handle: string };
    createdAt: string;
    sources: string[];
  }>;
  activeId: string | null;
  onSelect: (id: string) => void;
  rowRefs: MutableRefObject<Array<HTMLButtonElement | null>>;
  counts: { total: number; pending: number; flagged: number } | null;
}): ReactNode {
  return (
    <aside className="w-full shrink-0 lg:w-[320px]">
      <Card variant="flat" padding="md" className="flex flex-col gap-3">
        <SegmentedControl size="sm" options={STATUS_OPTIONS} value={status} onChange={onStatusChange} />
        <p className="mono-label">
          {counts ? `${counts.total} in queue` : 'Loading queue'}
        </p>

        {loading && (
          <div role="status" aria-label="Loading queue" className="flex flex-col gap-2">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} width="100%" height={64} />
            ))}
          </div>
        )}

        {error && (
          <div className="flex flex-col gap-2">
            <p className="text-small text-danger">The queue did not load.</p>
            <Button variant="secondary" size="sm" iconLeft="refresh" onClick={onRetry}>
              Retry
            </Button>
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <p className="text-small text-fg-secondary">Nothing in this queue.</p>
        )}

        {!loading && !error && items.length > 0 && (
          <ul className="flex flex-col">
            {items.map((item, index) => {
              const active = item._id === activeId;
              return (
                <li key={item._id} className="border-b border-line-subtle last:border-b-0">
                  <button
                    ref={(node) => {
                      rowRefs.current[index] = node;
                    }}
                    type="button"
                    aria-current={active ? 'true' : undefined}
                    onClick={() => onSelect(item._id)}
                    className={cn(
                      'relative flex w-full flex-col items-start gap-1 py-3 pl-3 pr-2 text-left transition-colors duration-100 ease-base hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow',
                      active && 'bg-accent-tint',
                    )}
                  >
                    {active && (
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-0 left-0 w-[3px] bg-accent-500"
                      />
                    )}
                    <span className="flex items-center gap-2">
                      <Chip tone={TYPE_TONE[item.type]} size="sm">
                        {item.type}
                      </Chip>
                      <span className="mono-label">{formatRelative(item.createdAt)}</span>
                    </span>
                    <span className="line-clamp-2 text-small text-fg">{item.title}</span>
                    <span className="mono-label">
                      {item.author.name} · {item.sources.length} sources
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </aside>
  );
}

function DiffView({
  submitted,
  current,
  changedLines,
}: {
  submitted: ModerationVersion;
  current: ModerationVersion | null;
  changedLines: number[];
}): ReactNode {
  const changed = useMemo(() => new Set(changedLines), [changedLines]);

  return (
    <Card variant="flat" padding="none" className="overflow-hidden">
      <VersionPane
        label="SUBMITTED"
        version={submitted}
        changed={changed}
        tone="submitted"
      />
      {current === null ? (
        <div className="border-t border-line-strong bg-bg-sunken px-5 py-6">
          <p className="mono-label">CURRENT</p>
          <p className="mt-2 text-body text-fg-secondary">
            No previously published version. This is a first submission, so there is nothing to
            compare against.
          </p>
        </div>
      ) : (
        <VersionPane label="CURRENT" version={current} changed={changed} tone="current" />
      )}
    </Card>
  );
}

function VersionPane({
  label,
  version,
  changed,
  tone,
}: {
  label: string;
  version: ModerationVersion;
  changed: Set<number>;
  tone: 'submitted' | 'current';
}): ReactNode {
  const lines = version.body.split('\n');

  return (
    <section className={cn(tone === 'current' && 'border-t border-line-strong bg-bg-sunken opacity-70')}>
      <header
        className={cn(
          'flex items-center justify-between gap-3 px-5 py-3',
          tone === 'submitted' ? 'bg-bg-surface' : '',
        )}
      >
        <span className="mono-label">{label}</span>
        <span className="mono-label">{formatRelative(version.at)}</span>
      </header>
      <h3 className="px-5 pb-2 text-h3 text-fg">{version.title}</h3>
      <div className="px-5 pb-4">
        {lines.map((line, index) => {
          const isChanged = changed.has(index);
          return (
            <p
              key={index}
              className={cn(
                'border-l-2 px-3 py-0.5 text-body text-fg-secondary',
                isChanged ? 'border-accent-500 bg-accent-tint text-fg' : 'border-transparent',
              )}
            >
              {line || '\u00a0'}
            </p>
          );
        })}
      </div>
      {version.sources.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-line-subtle px-5 py-3">
          {version.sources.map((source, index) => (
            <Chip key={`${source}-${index}`} tone="neutral" size="sm">
              {source}
            </Chip>
          ))}
        </div>
      )}
    </section>
  );
}

function DiffSkeleton(): ReactNode {
  return (
    <Card variant="flat" padding="lg" className="flex flex-col gap-3">
      <Skeleton width={96} height={11} />
      <Skeleton width="100%" height={14} />
      {[0, 1, 2, 3, 4].map((index) => (
        <Skeleton key={index} width={index % 2 === 0 ? '92%' : '76%'} height={12} />
      ))}
    </Card>
  );
}
