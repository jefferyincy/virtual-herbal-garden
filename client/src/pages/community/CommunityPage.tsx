import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@/components/icons';
import { PageHeader } from '@/components/layout/PageHeader';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tabs } from '@/components/ui/Tabs';
import { Tooltip } from '@/components/ui/Tooltip';
import { useToast } from '@/components/ui/Toast';
import { Watermark } from '@/components/ui/Watermark';
import {
  apiErrorMessage,
  CONTRIBUTOR_LIMIT,
  useContributors,
  usePosts,
  useRecentPlants,
  useUpvotePost,
  type PostPlant,
  type PostSummary,
} from '@/features/community/hooks';
import { cn } from '@/lib/cn';
import { formatNumber, formatRelative } from '@/lib/format';
import { useSession } from '@/stores/session';
import type { PostType } from '@/types/api';

type TabValue = 'all' | PostType;

const TAB_OPTIONS: Array<{ value: TabValue; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'remedy', label: 'Remedies' },
  { value: 'question', label: 'Questions' },
  { value: 'note', label: 'Notes' },
];

const TYPE_LABEL: Record<PostType, string> = {
  remedy: 'Remedy',
  question: 'Question',
  note: 'Note',
};

/** Plural form used by the empty filter state ("No remedies yet"). */
const TYPE_PLURAL: Record<PostType, string> = {
  remedy: 'remedies',
  question: 'questions',
  note: 'notes',
};

const TYPE_TONE: Record<PostType, 'accent' | 'clay' | 'neutral'> = {
  remedy: 'accent',
  question: 'clay',
  note: 'neutral',
};

const PRIMARY_LINK =
  'inline-flex h-11 items-center justify-center gap-2 rounded-btn bg-accent-500 px-4 font-semibold text-fg-onAccent transition-[background-color,transform] duration-100 ease-base hover:bg-accent-400 active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base';

export default function CommunityPage() {
  const [tab, setTab] = useState<TabValue>('all');
  const currentUserId = useSession((s) => s.user?._id ?? null);

  const filter = useMemo(() => (tab === 'all' ? {} : { type: tab }), [tab]);
  const feed = usePosts(filter);

  const items = feed.data?.items ?? [];
  const page = feed.data?.page ?? 1;
  const totalPages = feed.data?.totalPages ?? 1;

  return (
    <div className="mx-auto grid w-full max-w-content gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="w-full max-w-[720px]">
        <PageHeader
          title="Community"
          description="Remedies, questions and field notes from other learners. Every post is reviewed before it appears here."
          actions={
            <Link to="/community/new" className={PRIMARY_LINK}>
              <Icon name="plus" size={18} />
              Share something
            </Link>
          }
        />

        {/* Sticky so the filter stays reachable while the column scrolls. */}
        <div className="sticky top-16 z-10 -mx-1 bg-bg-base/90 px-1 backdrop-blur-[12px]">
          <Tabs
            tabs={TAB_OPTIONS}
            value={tab}
            onChange={(value) => setTab(value as TabValue)}
            className="mb-6"
          />
        </div>

        {feed.isPending ? (
          <FeedSkeleton />
        ) : feed.isError ? (
          <ErrorState
            title="Couldn't load the feed"
            message={apiErrorMessage(feed.error)}
            onRetry={() => void feed.refetch()}
          />
        ) : items.length === 0 ? (
          <EmptyState
            title={tab === 'all' ? 'No posts yet' : `No ${TYPE_PLURAL[tab]} yet`}
            description={
              tab === 'all'
                ? 'Nothing has cleared review yet. Share a remedy, ask a question or post a field note.'
                : 'Nothing in this filter has cleared review yet. Try another tab.'
            }
            action={
              tab === 'all' ? (
                <Link to="/community/new" className={PRIMARY_LINK}>
                  Share something
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => setTab('all')}
                  className="inline-flex h-11 items-center rounded-btn border border-line-strong px-4 text-body text-fg transition-colors duration-100 ease-base hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
                >
                  View all posts
                </button>
              )
            }
          />
        ) : (
          <>
            {/* `keepPreviousData` means a filter change keeps the old rows mounted, so the pending
                hint is a quiet overlay rather than a blank column. */}
            <div
              className={cn(
                'flex flex-col gap-4',
                feed.isFetching && 'opacity-60 transition-opacity duration-200 ease-base',
              )}
            >
              {items.map((post) => (
                <PostCard
                  key={post._id}
                  post={post}
                  isOwn={currentUserId !== null && post.author?._id === currentUserId}
                />
              ))}
            </div>

            {totalPages > 1 && (
              <p className="mono-label mt-6">
                Page {page} of {totalPages} · {formatNumber(feed.data?.total ?? 0)} posts
              </p>
            )}
          </>
        )}
      </div>

      <aside className="flex w-full flex-col gap-6 lg:pt-24">
        <ContributorsPanel />
        <RecentPlantsPanel />
      </aside>
    </div>
  );
}

function PostCard({ post, isOwn }: { post: PostSummary; isOwn: boolean }): ReactNode {
  const upvote = useUpvotePost();
  const { push } = useToast();
  const author = post.author;

  const handleUpvote = () => {
    upvote.mutate(post._id, {
      onError: (error) => {
        push({ variant: 'warning', title: "Couldn't upvote", description: apiErrorMessage(error) });
      },
    });
  };

  return (
    <Card
      as="article"
      variant="flat"
      padding="md"
      className={cn(
        'relative flex flex-col gap-3',
        post.expertApproved && 'overflow-hidden border-l-0 pl-[calc(1.25rem+3px)]',
      )}
    >
      {/* Expert-approved marker: a small accent bar plus the labelled chip and the check icon, so
          the state never rests on colour alone. */}
      {post.expertApproved && (
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-accent-500" />
      )}

      <div className="flex items-center gap-3">
        {author ? (
          <Link
            to={`/u/${author.handle}`}
            className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
          >
            <Avatar name={author.name} level={author.level} size={36} />
          </Link>
        ) : (
          <Avatar name="Deleted user" size={36} />
        )}
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {author ? (
            <Link
              to={`/u/${author.handle}`}
              className="truncate text-small font-medium text-fg transition-colors duration-100 ease-base hover:text-accent-400"
            >
              {author.name}
            </Link>
          ) : (
            <span className="truncate text-small font-medium text-fg-muted">Deleted user</span>
          )}
          <span className="mono-label">{formatRelative(post.createdAt)}</span>
          <Chip tone={TYPE_TONE[post.type]}>{TYPE_LABEL[post.type]}</Chip>
          {post.expertApproved && (
            <span className="inline-flex items-center gap-1 text-micro text-accent-400">
              <Icon name="check-circle" size={14} />
              Expert approved
            </span>
          )}
          {/* A pending post only reaches this list for its own author (or a moderator); the chip
              tells the author plainly that it is not public yet. */}
          {post.status === 'pending' && isOwn && <Chip tone="warning">Awaiting review</Chip>}
        </div>
      </div>

      <h3 className="text-h3 text-fg">
        <Link
          to={`/community/${post._id}`}
          className="transition-colors duration-100 ease-base hover:text-accent-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
        >
          {post.title}
        </Link>
      </h3>

      <p className="line-clamp-3 text-small text-fg-secondary">{post.body}</p>

      {post.plantIds.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {post.plantIds.map((plant) => (
            <TaggedPlant key={plant.slug} plant={plant} />
          ))}
        </div>
      )}

      {post.sources.length > 0 && (
        <p className="line-clamp-1 text-small text-fg-muted">
          {post.sources.length} cited {post.sources.length === 1 ? 'source' : 'sources'}
        </p>
      )}

      <div className="flex items-center gap-1 border-t border-line-subtle pt-2">
        <button
          type="button"
          aria-pressed={upvote.data?.upvoted ?? false}
          disabled={upvote.isPending}
          onClick={handleUpvote}
          className={cn(
            'inline-flex h-11 items-center gap-2 rounded-btn px-3 text-small transition-colors duration-100 ease-base disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow',
            upvote.data?.upvoted ? 'text-accent-400' : 'text-fg-secondary hover:bg-bg-hover hover:text-fg',
          )}
        >
          <Icon name="arrow-up" size={16} />
          <span className="font-mono">{formatNumber(post.upvoteCount)}</span>
          <span className="sr-only">Upvote this post</span>
        </button>

        <Link
          to={`/community/${post._id}`}
          className="inline-flex h-11 items-center gap-2 rounded-btn px-3 text-small text-fg-secondary transition-colors duration-100 ease-base hover:bg-bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
        >
          <Icon name="message" size={16} />
          <span className="font-mono">{formatNumber(post.commentCount)}</span>
          <span className="sr-only">comments</span>
        </Link>

        {/* Bookmarking has NO endpoint in this pass, so it renders as a disabled control with an
            explanatory tooltip rather than a button that silently does nothing. */}
        <Tooltip content="Bookmarking is not available yet" side="top">
          <button
            type="button"
            disabled
            aria-label="Bookmark (not available yet)"
            className="inline-flex h-11 items-center rounded-btn px-3 text-fg-disabled"
          >
            <Icon name="bookmark" size={16} />
          </button>
        </Tooltip>
      </div>
    </Card>
  );
}

function TaggedPlant({ plant }: { plant: PostPlant }): ReactNode {
  // `images` is absent on a plant that has no photograph yet; the leaf glyph covers that case.
  const image = plant.images?.[0];
  return (
    <Link
      to={`/plants/${plant.slug}`}
      className="inline-flex items-center gap-2 rounded-full border border-line-subtle py-1 pl-1 pr-3 transition-colors duration-100 ease-base hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
    >
      <span className="grid size-6 shrink-0 place-items-center overflow-hidden rounded-full bg-bg-sunken">
        {image ? (
          <img src={image.url} alt={image.alt} loading="lazy" className="size-full object-cover" />
        ) : (
          <Icon name="leaf" size={12} className="text-fg-muted" />
        )}
      </span>
      <span className="text-small text-fg-secondary">{plant.commonName}</span>
    </Link>
  );
}

function ContributorsPanel(): ReactNode {
  const contributors = useContributors();
  const rows = (contributors.data?.rows ?? []).slice(0, CONTRIBUTOR_LIMIT);

  return (
    <Card variant="flat" padding="md" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-h3 text-fg">Top contributors</h2>
        {/* Honest source label: `window=all` is a lifetime XP total, not a weekly or trending
            board, so the panel says so instead of implying recent activity. */}
        <span className="mono-label">All-time xp</span>
      </div>

      {contributors.isPending ? (
        <div className="flex flex-col gap-3" role="status" aria-label="Loading contributors">
          {[0, 1, 2, 3, 4].map((index) => (
            <div key={index} className="flex items-center gap-3">
              <Skeleton variant="circle" width={28} height={28} />
              <Skeleton width="55%" height={12} />
            </div>
          ))}
        </div>
      ) : contributors.isError ? (
        <div className="flex flex-col gap-2">
          <p className="text-small text-fg-secondary">Couldn&rsquo;t load contributors.</p>
          <button
            type="button"
            onClick={() => void contributors.refetch()}
            className="self-start rounded-btn px-2 py-1 text-small text-fg-secondary transition-colors duration-100 ease-base hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
          >
            Retry
          </button>
        </div>
      ) : rows.length === 0 ? (
        <p className="text-small text-fg-secondary">No contributions recorded yet.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.user._id} className="flex items-center gap-3">
              <span className="w-4 shrink-0 font-mono text-micro text-fg-muted">{row.rank}</span>
              <Avatar name={row.user.name} level={row.user.level} size={28} />
              <Link
                to={`/u/${row.user.handle}`}
                className="min-w-0 flex-1 truncate text-small text-fg transition-colors duration-100 ease-base hover:text-accent-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
              >
                {row.user.name}
              </Link>
              <span className="mono-label shrink-0">{formatNumber(row.user.xp)} xp</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function RecentPlantsPanel(): ReactNode {
  const plants = useRecentPlants();
  const rows = plants.data ?? [];

  return (
    <Card variant="flat" padding="md" className="relative flex flex-col gap-3 overflow-hidden">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-h3 text-fg">Recently added</h2>
        {/* Deliberately NOT "Trending": the only signal the API exposes is `publishedAt`, so a
            recency list is what this can honestly claim. */}
        <span className="mono-label">Latest entries</span>
      </div>

      {plants.isPending ? (
        <div className="flex flex-col gap-3" role="status" aria-label="Loading plants">
          {[0, 1, 2].map((index) => (
            <div key={index} className="flex items-center gap-3">
              <Skeleton variant="circle" width={32} height={32} />
              <Skeleton width="60%" height={12} />
            </div>
          ))}
        </div>
      ) : plants.isError ? (
        <div className="flex flex-col gap-2">
          <p className="text-small text-fg-secondary">Couldn&rsquo;t load the plant list.</p>
          <button
            type="button"
            onClick={() => void plants.refetch()}
            className="self-start rounded-btn px-2 py-1 text-small text-fg-secondary transition-colors duration-100 ease-base hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
          >
            Retry
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="relative py-6">
          <Watermark name="leaf" size={120} />
          <p className="relative text-small text-fg-secondary">No published plants yet.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((plant) => {
            const image = plant.images[0];
            return (
              <li key={plant.slug}>
                <Link
                  to={`/plants/${plant.slug}`}
                  className="flex items-center gap-3 rounded-btn p-1 transition-colors duration-100 ease-base hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
                >
                  <span className="size-8 shrink-0 overflow-hidden rounded-input bg-bg-sunken">
                    {image ? (
                      <img
                        src={image.url}
                        alt={image.alt}
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    ) : (
                      <Icon name="leaf" size={16} className="m-2 text-fg-muted" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-small text-fg">{plant.commonName}</span>
                    <span className="botanical block truncate text-micro text-clay-400">
                      {plant.botanicalName}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** Skeleton cards matching the real card rhythm so the column does not jump on load. */
function FeedSkeleton(): ReactNode {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Loading posts">
      {[0, 1, 2, 3].map((index) => (
        <Card key={index} variant="flat" padding="md" className="flex flex-col gap-3" presentation>
          <div className="flex items-center gap-3">
            <Skeleton variant="circle" width={36} height={36} />
            <Skeleton width={140} height={12} />
          </div>
          <Skeleton width="70%" height={20} />
          <Skeleton width="100%" height={12} />
          <Skeleton width="92%" height={12} />
          <Skeleton width="40%" height={12} />
        </Card>
      ))}
    </div>
  );
}
