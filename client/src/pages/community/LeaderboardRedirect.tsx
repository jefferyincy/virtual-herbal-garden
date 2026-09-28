import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Icon } from '@/components/icons';
import { PageHeader } from '@/components/layout/PageHeader';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Table, TBody, TD, THead, TR } from '@/components/ui/Table';
import { apiErrorMessage, useContributors } from '@/features/community/hooks';
import { formatNumber } from '@/lib/format';

/**
 * `/leaderboard` is owned by the Learn phase, whose `pages/learn/LeaderboardPage` renders the
 * weekly and all-time podium. Two components must never answer the same path, so this one defers
 * to that screen: mounted at any alias it redirects to `/leaderboard`.
 *
 * The ticket suggested redirecting to `/progress`; `/progress` hosts the learner progress screen
 * and shows no ranking at all, so a redirect there would silently drop the leaderboard. The route
 * the Learn screen actually owns is the honest target.
 *
 * It only falls back to the table below when it *is* mounted at `/leaderboard` itself (i.e. the
 * Learn screen was not wired to that path), so the route never 404s - and the fallback is a plain
 * all-time XP table, never a duplicate of the podium screen.
 */
export default function LeaderboardRedirect(): ReactNode {
  const { pathname } = useLocation();

  if (pathname !== '/leaderboard') return <Navigate to="/leaderboard" replace />;

  return <ContributorsFallback />;
}

function ContributorsFallback(): ReactNode {
  const contributors = useContributors();
  const rows = contributors.data?.rows ?? [];

  return (
    <div className="mx-auto w-full max-w-[900px]">
      <PageHeader
        eyebrow="Community"
        title="Leaderboard"
        description="The Learn section owns the full weekly and all-time boards. This is the all-time XP list."
        actions={
          <span className="mono-label">
            <Icon name="trophy" size={14} className="mr-1 inline align-[-2px]" />
            Window all
          </span>
        }
      />

      {contributors.isPending ? (
        <div className="flex flex-col gap-2" role="status" aria-label="Loading leaderboard">
          {[0, 1, 2, 3, 4].map((index) => (
            <Skeleton key={index} width="100%" height={44} />
          ))}
        </div>
      ) : contributors.isError ? (
        <ErrorState
          title="Couldn't load the leaderboard"
          message={apiErrorMessage(contributors.error)}
          onRetry={() => void contributors.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No contributions yet"
          description="XP earned by reading plants, passing quizzes and sharing remedies appears here."
          watermark="trophy"
        />
      ) : (
        <>
          <Table>
            <THead
              columns={[
                { label: 'Rank', width: '80px' },
                { label: 'Learner' },
                { label: 'XP', align: 'right' },
              ]}
            />
            <TBody>
              {rows.map((row) => (
                <TR key={row.user._id} className={row.isCurrentUser ? 'border-l-2 border-l-accent-500' : undefined}>
                  <TD mono>{row.rank}</TD>
                  <TD>
                    <span className="flex items-center gap-3">
                      <Avatar name={row.user.name} level={row.user.level} size={28} />
                      <span className="min-w-0 truncate text-body text-fg">{row.user.name}</span>
                      {row.isCurrentUser && <span className="mono-label text-accent-400">You</span>}
                    </span>
                  </TD>
                  <TD mono align="right">
                    {formatNumber(row.user.xp)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>

          {/* The source is stated plainly: a lifetime XP total, which is all `window=all` returns
              here - not a weekly board and not a trend. */}
          <p className="mono-label mt-4">All-time xp leaders · top {rows.length}</p>
        </>
      )}
    </div>
  );
}
