import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@/components/icons';
import { PageHeader, Section } from '@/components/layout/PageHeader';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import { useLeaderboard, type LeaderboardWindow } from '@/features/learn/hooks';
import { useSession } from '@/stores/session';
import type { LeaderboardRow } from '@/types/api';

/**
 * The weekly window rolls over at the next Monday 00:00 local time. Computing it from the clock
 * means the label stays correct without a hardcoded offset drifting stale.
 */
function nextWeeklyReset(now: Date): Date {
  const reset = new Date(now);
  const day = reset.getDay();
  const daysUntilMonday = (8 - day) % 7 || 7;
  reset.setDate(reset.getDate() + daysUntilMonday);
  reset.setHours(0, 0, 0, 0);
  return reset;
}

function describeCountdown(target: Date, now: Date): string {
  const totalMinutes = Math.max(0, Math.floor((target.getTime() - now.getTime()) / 60_000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** Rank 1 owns the tallest column; heights step down with rank. */
const PODIUM_HEIGHTS = ['h-52', 'h-40', 'h-32'];

export default function LeaderboardPage() {
  const [range, setRange] = useState<LeaderboardWindow>('week');
  const leaderboard = useLeaderboard(range);
  const authed = useSession((s) => s.status === 'authenticated');

  const rows = leaderboard.data?.rows ?? [];
  const currentUserRank = leaderboard.data?.currentUserRank ?? null;
  const [now] = useState(() => new Date());

  const resetLabel = useMemo(() => {
    const target = nextWeeklyReset(now);
    return `Resets in ${describeCountdown(target, now)} · Monday 00:00`;
  }, [now]);

  const podium = rows.slice(0, 3);
  const rest = rows.slice(3);
  const currentRow = rows.find((row) => row.isCurrentUser) ?? null;
  const pinnedRank = currentRow?.rank ?? currentUserRank;
  const showPinnedOutsideList =
    authed && !currentRow && typeof pinnedRank === 'number' && pinnedRank > 0;

  return (
    <div className="mx-auto w-full max-w-[900px]">
      <PageHeader
        title="Leaderboard"
        eyebrow="Community"
        description="Ranked by XP earned in the selected window."
        actions={
          <SegmentedControl
            value={range}
            onChange={(value) => setRange(value === 'all' ? 'all' : 'week')}
            options={[
              { value: 'week', label: 'This week' },
              { value: 'all', label: 'All time' },
            ]}
          />
        }
      />

      <p className="mono-label mb-6">
        {range === 'week' ? resetLabel : 'All-time XP since the first session · no reset'}
      </p>

      {leaderboard.isPending && <BoardSkeleton />}

      {leaderboard.isError && (
        <ErrorState
          title="Couldn't load the leaderboard"
          message="The ranking did not respond."
          onRetry={() => void leaderboard.refetch()}
        />
      )}

      {leaderboard.isSuccess && rows.length === 0 && (
        <EmptyState
          title="No rankings yet"
          description="Nobody has earned XP in this window. Complete a lesson to put yourself on the board."
          watermark="trophy"
        />
      )}

      {leaderboard.isSuccess && rows.length > 0 && (
        <>
          <section aria-label="Top three" className="relative">
            <span
              aria-hidden="true"
              className="accent-halo pointer-events-none absolute left-0 top-0 h-56 w-1/3"
            />
            <ol className="relative grid grid-cols-3 items-end gap-3">
              {podium.map((row, index) => (
                <PodiumColumn
                  key={row.user._id}
                  row={row}
                  position={index}
                  height={PODIUM_HEIGHTS[index] ?? 'h-32'}
                />
              ))}
            </ol>
          </section>

          {rest.length > 0 && (
            <Section className="mt-10">
              <ul className="overflow-hidden rounded-card border border-line-subtle bg-bg-surface">
                {rest.map((row) => (
                  <RankRow key={row.user._id} row={row} />
                ))}
              </ul>
            </Section>
          )}

          {authed && (currentRow || showPinnedOutsideList) && (
            <div className="sticky bottom-4 mt-6">
              <div className="flex items-center gap-3 rounded-card border border-accent-600 border-l-[3px] bg-bg-raised px-4 py-3 shadow-l2">
                <span className="w-8 shrink-0 font-mono text-small text-accent-400">
                  {pinnedRank ?? '—'}
                </span>
                <Avatar name={currentRow?.user.name ?? 'You'} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-body text-fg">
                      {currentRow?.user.name ?? 'You'}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-accent-tint px-2 py-0.5 font-mono text-micro uppercase text-accent-400">
                      You
                    </span>
                  </span>
                  <span className="mono-label">Level {currentRow?.user.level ?? '—'}</span>
                </span>
                <span className="shrink-0 font-mono text-body text-fg">
                  {currentRow ? `${formatNumber(currentRow.user.xp)} XP` : 'XP hidden'}
                </span>
              </div>
              {showPinnedOutsideList && (
                <p className="mono-label mt-2 text-center">
                  Ranks between the list above and row {pinnedRank} are not shown
                </p>
              )}
            </div>
          )}

          {!authed && (
            <p className="mt-6 flex items-center justify-center gap-1 text-small text-fg-muted">
              <Link
                to="/login"
                className="rounded-btn text-accent-400 transition-colors duration-100 ease-base hover:text-accent-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
              >
                Sign in
              </Link>
              to see your own rank.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function PodiumColumn({
  row,
  position,
  height,
}: {
  row: LeaderboardRow;
  position: number;
  height: string;
}) {
  return (
    <li className="flex flex-col items-center gap-3">
      <Avatar
        name={row.user.name}
        size={position === 0 ? 64 : 52}
        className="ring-2 ring-accent-glow"
      />
      <span className="min-w-0 text-center">
        <span className="block truncate text-small text-fg">{row.user.name}</span>
        <span className="mono-label block">{formatNumber(row.user.xp)} XP</span>
      </span>
      <div
        className={cn(
          'flex w-full flex-col items-center justify-start gap-1 rounded-t-card border border-line-subtle bg-bg-surface pt-3',
          height,
        )}
      >
        <span className="font-mono text-h3 text-fg">{row.rank}</span>
        <Icon name="award" size={16} className="text-accent-400" />
      </div>
    </li>
  );
}

function RankRow({ row }: { row: LeaderboardRow }) {
  return (
    <li className="flex items-center gap-3 border-b border-line-subtle px-4 py-3 last:border-b-0">
      <span className="w-8 shrink-0 font-mono text-small text-fg-muted">{row.rank}</span>
      <Avatar name={row.user.name} size={36} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body text-fg">{row.user.name}</span>
        <span className="mono-label">Level {row.user.level}</span>
      </span>
      <span className="shrink-0 font-mono text-body text-fg-secondary">
        {formatNumber(row.user.xp)} XP
      </span>
    </li>
  );
}

function BoardSkeleton() {
  return (
    <div role="status" aria-label="Loading leaderboard">
      <div className="grid grid-cols-3 items-end gap-3">
        <Skeleton variant="card" height={160} />
        <Skeleton variant="card" height={208} />
        <Skeleton variant="card" height={128} />
      </div>
      <div className="mt-10 overflow-hidden rounded-card border border-line-subtle">
        {[0, 1, 2, 3].map((index) => (
          <div
            key={index}
            className="flex items-center gap-3 border-b border-line-subtle px-4 py-3 last:border-b-0"
          >
            <Skeleton width={20} height={13} />
            <Skeleton variant="circle" width={36} height={36} />
            <Skeleton width="40%" height={14} />
            <Skeleton className="ml-auto" width={64} height={14} />
          </div>
        ))}
      </div>
    </div>
  );
}
