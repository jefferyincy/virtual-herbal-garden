import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@/components/icons';
import { PageHeader, Section } from '@/components/layout/PageHeader';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { HexBadgeTile } from '@/components/ui/HexBadgeTile';
import { Pagination } from '@/components/ui/Pagination';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Skeleton, SkeletonTable } from '@/components/ui/Skeleton';
import { StatCard } from '@/components/ui/StatCard';
import { TBody, TD, THead, TR, Table } from '@/components/ui/Table';
import { Tooltip } from '@/components/ui/Tooltip';
import { cn } from '@/lib/cn';
import { formatDate, formatRelative } from '@/lib/format';
import {
  useBadges,
  useMyProgress,
  useProgressTable,
  type ProgressRow,
} from '@/features/learn/hooks';

const MAX_MASTERY = 5;

export default function ProgressPage() {
  const [page, setPage] = useState(1);
  const me = useMyProgress();
  const badges = useBadges();
  const table = useProgressTable(page);

  const summary = table.data?.summary;

  return (
    <div className="mx-auto w-full max-w-content">
      <PageHeader
        title="Progress"
        eyebrow="Learn"
        description="Every plant you have read, how well it stuck, and when it comes back for review."
      />

      {me.isPending && <StatsSkeleton />}

      {me.isError && (
        <ErrorState
          title="Couldn't load your progress"
          message="Your learner record did not respond."
          onRetry={() => void me.refetch()}
        />
      )}

      {me.isSuccess && me.data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="XP" value={me.data.xp} tone="accent" />
            <StatCard label="Level" value={me.data.level} />
            <StatCard label="Current streak" value={`${me.data.streak.current}d`} />
            <StatCard
              label="Plants read"
              value={`${me.data.stats.plantsRead ?? 0}/${summary?.totalPlants ?? 0}`}
            />
          </div>

          <Card variant="flat" padding="lg" className="mt-4">
            <p className="mono-label">
              Level {me.data.level} · {me.data.levelProgress.intoLevel}/{me.data.levelProgress.span} XP
            </p>
            <ProgressBar
              className="mt-3"
              value={me.data.levelProgress.pct}
              label={`${me.data.levelProgress.pct}% to the next level`}
            />
          </Card>

          <Section title="Badges" className="mt-16">
            {badges.isPending && (
              <div className="flex flex-wrap gap-4">
                {[0, 1, 2, 3].map((index) => (
                  <Skeleton key={index} variant="circle" width={72} height={72} />
                ))}
              </div>
            )}
            {badges.isError && (
              <p className="text-small text-fg-secondary">Badges could not be loaded.</p>
            )}
            {badges.isSuccess && (badges.data.items.length === 0 ? (
              <p className="text-small text-fg-secondary">No badges defined yet.</p>
            ) : (
              <div className="flex flex-wrap items-start gap-6">
                {badges.data.items.map((badge) => {
                  const earned = me.data.badges.some((entry) => entry.key === badge.key);
                  return (
                    <div key={badge.key} className={cn(!earned && 'opacity-50')}>
                      <HexBadgeTile
                        name={badge.name}
                        icon={badge.icon}
                        unlocked={earned}
                        description={badge.description}
                      />
                      <p className="mono-label mt-1 text-center">
                        {earned ? 'Earned' : `${badge.earnedBy} earned`}
                      </p>
                    </div>
                  );
                })}
              </div>
            ))}
          </Section>

          <Section
            title="Plants"
            actions={
              summary ? (
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-micro uppercase',
                    summary.dueNow > 0 ? 'bg-warning/15 text-warning' : 'bg-white/[0.04] text-fg-muted',
                  )}
                >
                  <Icon name="clock" size={13} />
                  {summary.dueNow} due now
                </span>
              ) : undefined
            }
          >
            {table.isPending && <SkeletonTable rows={6} columns={4} />}

            {table.isError && (
              <ErrorState
                title="Couldn't load the plant table"
                message="Your per-plant progress did not respond."
                onRetry={() => void table.refetch()}
              />
            )}

            {table.isSuccess && table.data.items.length === 0 && (
              <EmptyState
                title="Nothing here yet"
                description="Read your first lesson and plant page, and this table fills in with mastery and review dates."
                watermark="leaf"
                action={
                  <div className="flex flex-wrap justify-center gap-3">
                    <Link
                      to="/learn"
                      className="inline-flex h-11 items-center justify-center rounded-btn bg-accent-500 px-4 font-semibold text-fg-onAccent transition-colors duration-100 ease-base hover:bg-accent-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
                    >
                      Start a lesson
                    </Link>
                    <Link
                      to="/gardens"
                      className="inline-flex h-11 items-center justify-center rounded-btn border border-line-strong px-4 text-fg transition-colors duration-100 ease-base hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
                    >
                      Your gardens
                    </Link>
                  </div>
                }
              />
            )}

            {table.isSuccess && table.data.items.length > 0 && (
              <>
                <div className="overflow-hidden rounded-card border border-line-subtle bg-bg-surface">
                  <Table>
                    <THead
                      columns={[
                        { label: 'Plant' },
                        { label: 'Read' },
                        { label: 'Mastery' },
                        { label: 'Review due', align: 'right' },
                      ]}
                    />
                    <TBody>
                      {table.data.items.map((row) => (
                        <ProgressTableRow key={row.plantId} row={row} />
                      ))}
                    </TBody>
                  </Table>
                </div>
                {table.data.totalPages > 1 && (
                  <div className="mt-4 flex justify-end">
                    <Pagination
                      page={table.data.page}
                      totalPages={table.data.totalPages}
                      onPageChange={setPage}
                    />
                  </div>
                )}
              </>
            )}
          </Section>

          <Section title="Recent activity">
            {me.data.recentActivity.length === 0 ? (
              <p className="text-small text-fg-secondary">
                Nothing yet - read a lesson, take a quiz, or post a remedy and it shows up here.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {me.data.recentActivity.map((item, index) => (
                  <li
                    key={`${item.kind}-${item.at}-${index}`}
                    className="flex items-center gap-3 rounded-card border border-line-subtle bg-bg-surface px-4 py-3"
                  >
                    <Icon
                      name={item.kind === 'quiz' ? 'chart' : item.kind === 'post' ? 'message' : 'book-open'}
                      size={18}
                      className="shrink-0 text-fg-muted"
                    />
                    {item.href ? (
                      <Link
                        to={item.href}
                        className="min-w-0 flex-1 truncate text-body text-fg transition-colors duration-100 ease-base hover:text-accent-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
                      >
                        {item.label}
                      </Link>
                    ) : (
                      <span className="min-w-0 flex-1 truncate text-body text-fg">{item.label}</span>
                    )}
                    <span className="mono-label shrink-0">{formatRelative(item.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

function ProgressTableRow({ row }: { row: ProgressRow }) {
  const image = row.plant.images[0];
  return (
    <TR>
      <TD>
        <Link
          to={`/plants/${row.plant.slug}`}
          className="flex items-center gap-3 transition-colors duration-100 ease-base hover:text-accent-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
        >
          <Avatar name={row.plant.commonName} src={image?.url} size={32} />
          <span className="min-w-0">
            <span className="block truncate text-body text-fg">{row.plant.commonName}</span>
            <span className="botanical block truncate text-small text-clay-400">
              {row.plant.botanicalName}
            </span>
          </span>
        </Link>
      </TD>
      <TD>
        <span className="inline-flex items-center gap-2">
          <Icon
            name={row.read ? 'check-circle' : 'dot'}
            size={16}
            className={row.read ? 'text-accent-400' : 'text-fg-disabled'}
          />
          <span className="mono-label">{row.read ? 'Read' : 'Unread'}</span>
        </span>
      </TD>
      <TD>
        <span
          className="inline-flex items-center gap-1"
          role="img"
          aria-label={`Mastery ${row.mastery} of ${MAX_MASTERY}`}
        >
          {Array.from({ length: MAX_MASTERY }, (_, index) => (
            <span
              key={index}
              aria-hidden="true"
              className={cn(
                'size-1.5 rounded-full',
                index < row.mastery ? 'bg-accent-500' : 'bg-line-strong',
              )}
            />
          ))}
        </span>
      </TD>
      <TD align="right">
        <Tooltip content={formatDate(row.srs.dueAt)}>
          <span className="font-mono text-small text-fg-secondary">
            {formatRelative(row.srs.dueAt)}
          </span>
        </Tooltip>
      </TD>
    </TR>
  );
}

function StatsSkeleton() {
  return (
    <div role="status" aria-label="Loading progress" className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} variant="card" height={104} />
        ))}
      </div>
      <Skeleton variant="card" height={88} />
    </div>
  );
}
