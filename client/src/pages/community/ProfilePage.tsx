import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Icon } from '@/components/icons';
import { PageHeader, Section } from '@/components/layout/PageHeader';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { HexBadgeRow } from '@/components/ui/HexBadgeTile';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tooltip } from '@/components/ui/Tooltip';
import { Watermark } from '@/components/ui/Watermark';
import { apiErrorMessage, useProfile, type ProfileResponse } from '@/features/community/hooks';
import { ApiError } from '@/lib/api';
import { formatDate, formatNumber, formatRelative } from '@/lib/format';
import { useSession } from '@/stores/session';
import type { PostType } from '@/types/api';

const TYPE_LABEL: Record<PostType, string> = {
  remedy: 'Remedy',
  question: 'Question',
  note: 'Note',
};

const TYPE_TONE: Record<PostType, 'accent' | 'clay' | 'neutral'> = {
  remedy: 'accent',
  question: 'clay',
  note: 'neutral',
};

const SECONDARY_LINK =
  'inline-flex h-11 items-center justify-center gap-2 rounded-btn border border-line-strong px-4 font-semibold text-fg transition-[background-color,transform] duration-100 ease-base hover:bg-bg-hover active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base';

export default function ProfilePage() {
  const { handle } = useParams<{ handle: string }>();
  const status = useSession((s) => s.status);
  const query = useProfile(handle);
  const profile = query.data;

  if (query.isPending) return <ProfileSkeleton />;

  if (query.isError) {
    // An unknown handle is a plain 404, not a failure worth a retry button.
    return query.error instanceof ApiError && query.error.status === 404 ? (
      <div className="mx-auto w-full max-w-content">
        <PageHeader title="Profile not found" />
        <EmptyState
          title="No such gardener"
          description={`Nothing is registered under @${handle ?? ''}. Check the handle and try again.`}
          watermark="user"
          action={
            <Link to="/leaderboard" className={SECONDARY_LINK}>
              Browse the leaderboard
            </Link>
          }
        />
      </div>
    ) : (
      <div className="mx-auto w-full max-w-content">
        <ErrorState
          title="Couldn't load this profile"
          message={apiErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }

  if (!profile) return <ProfileSkeleton />;

  const { user, stats } = profile;

  return (
    <div className="mx-auto flex w-full max-w-content flex-col">
      <ProfileBanner profile={profile} sessionStatus={status} />
      <span className="sr-only">{formatDate(user.createdAt)}</span>

      <Section title="Badges">
        {profile.badges.length === 0 ? (
          <EmptyState
            title="No badges yet"
            description="Badges appear here as they are earned - reading plants, passing quizzes, keeping a streak."
            watermark="award"
          />
        ) : (
          <HexBadgeRow badges={profile.badges} />
        )}
      </Section>

      <Section
        title="Public gardens"
        actions={
          profile.publicGardens.length > 0 ? (
            <span className="mono-label">{formatNumber(profile.publicGardens.length)} shared</span>
          ) : undefined
        }
      >
        {profile.publicGardens.length === 0 ? (
          <EmptyState
            title="No public gardens"
            description="Gardens shared publicly show up here with their plant counts."
            watermark="home"
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {profile.publicGardens.map((garden) => (
              <GardenCard key={garden._id} garden={garden} />
            ))}
          </div>
        )}
      </Section>

      <Section title="Recent contributions">
        {profile.recentPosts.length === 0 ? (
          <EmptyState
            title="Nothing shared yet"
            description="Approved posts appear here. Pending posts stay private until a moderator reviews them."
            watermark="message"
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {profile.recentPosts.map((post) => (
              <li key={post._id}>
                <Link
                  to={`/community/${post._id}`}
                  className="block rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
                >
                  <Card variant="flat" padding="sm" interactive className="flex items-center gap-3">
                    <Chip tone={TYPE_TONE[post.type]}>{TYPE_LABEL[post.type]}</Chip>
                    <span className="min-w-0 flex-1 truncate text-body text-fg">{post.title}</span>
                    <span className="mono-label shrink-0">
                      {formatNumber(post.upvoteCount)} upvotes
                    </span>
                    <span className="mono-label shrink-0">{formatRelative(post.createdAt)}</span>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <p className="mono-label">
        {formatNumber(stats.posts)} approved {stats.posts === 1 ? 'post' : 'posts'} · joined{' '}
        {formatDate(user.createdAt)}
      </p>
    </div>
  );
}

function ProfileBanner({
  profile,
  sessionStatus,
}: {
  profile: ProfileResponse;
  sessionStatus: 'loading' | 'authenticated' | 'anonymous';
}): ReactNode {
  const { user, stats } = profile;
  const signedIn = sessionStatus === 'authenticated';

  return (
    <header className="relative mb-10 overflow-hidden rounded-card border border-line-subtle bg-bg-surface">
      <div aria-hidden="true" className="accent-halo absolute inset-x-0 -top-24 h-48" />

      <div className="relative flex flex-col gap-6 p-6 sm:flex-row sm:items-start">
        <Avatar name={user.name} level={user.level} size={72} />

        <div className="min-w-0 flex-1">
          <h1 className="text-h1 text-fg">{user.name}</h1>
          <p className="mono-label truncate">@{user.handle}</p>
          {user.bio ? (
            <p className="mt-2 max-w-reading text-body text-fg-secondary">{user.bio}</p>
          ) : (
            <p className="mt-2 text-body text-fg-muted">No bio yet.</p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <StatChip value={formatNumber(user.xp)} label="XP" />
            <StatChip
              value={formatNumber(stats.badges)}
              label={stats.badges === 1 ? 'badge' : 'badges'}
            />
            <StatChip value={formatNumber(stats.plantsRead)} label="plants read" />
            <StatChip
              value={`${formatNumber(stats.streakDays)}-day`}
              label="streak"
            />
          </div>
        </div>

        {/* Per-user actions need a session; an anonymous caller sees no buttons at all. */}
        {signedIn && (
          <div className="flex shrink-0 items-center gap-2">
            {profile.isSelf ? (
              <Link to="/progress" className={SECONDARY_LINK}>
                <Icon name="pencil" size={18} />
                Edit profile
              </Link>
            ) : (
              <>
                {/* Neither following nor direct messaging has an endpoint in this pass, so both
                    are disabled with a reason rather than faking a state the server cannot store.
                    The Tooltip wrapper owns the hover/focus handlers, so a disabled control still
                    explains itself. */}
                <Tooltip content="Following is not available yet" side="top">
                  <Button variant="primary" disabled iconLeft="plus">
                    Follow
                  </Button>
                </Tooltip>
                <Tooltip content="Direct messages are not available yet" side="top">
                  <Button variant="secondary" disabled iconLeft="message">
                    Message
                  </Button>
                </Tooltip>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

/** Mono stat chip: the value is `font-mono` data, the label a `mono-label` caption. */
function StatChip({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <span className="inline-flex items-baseline gap-1.5 rounded-full border border-line-subtle px-3 py-1">
      <span className="font-mono text-small text-fg">{value}</span>
      <span className="mono-label">{label}</span>
    </span>
  );
}

function GardenCard({
  garden,
}: {
  garden: { _id: string; name: string; slug: string; plantCount: number };
}): ReactNode {
  return (
    <Link
      to={`/g/${garden.slug}`}
      className="group block rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
    >
      <Card variant="flat" padding="none" interactive className="overflow-hidden">
        <div className="relative grid h-28 place-items-center overflow-hidden bg-bg-sunken">
          <Watermark name="leaf" size={110} />
        </div>
        <div className="flex items-baseline justify-between gap-2 p-4">
          <span className="min-w-0 truncate text-h3 text-fg">{garden.name}</span>
          <span className="mono-label shrink-0">{formatNumber(garden.plantCount)} plants</span>
        </div>
      </Card>
    </Link>
  );
}

/** Skeleton mirroring the banner + three sections so the layout does not jump on load. */
function ProfileSkeleton(): ReactNode {
  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-10" role="status" aria-label="Loading profile">
      <div className="rounded-card border border-line-subtle bg-bg-surface p-6">
        <div className="flex items-start gap-6">
          <Skeleton variant="circle" width={72} height={72} />
          <div className="flex flex-1 flex-col gap-3">
            <Skeleton width="35%" height={28} />
            <Skeleton width="20%" height={12} />
            <Skeleton width="60%" height={12} />
            <div className="flex gap-2">
              <Skeleton width={90} height={26} />
              <Skeleton width={90} height={26} />
              <Skeleton width={110} height={26} />
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton width={120} height={24} />
        <div className="flex gap-4">
          {[0, 1, 2, 3, 4].map((index) => (
            <Skeleton key={index} width={72} height={72} />
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1].map((index) => (
          <Skeleton key={index} height={160} />
        ))}
      </div>
    </div>
  );
}
