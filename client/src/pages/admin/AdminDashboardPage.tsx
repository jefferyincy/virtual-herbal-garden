import type { ReactNode } from 'react';
import { useId, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '@/components/icons';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatCard } from '@/components/ui/StatCard';
import { formatNumber, formatRelative } from '@/lib/format';
import { useAdminStats } from '@/features/admin/hooks';
import type { AdminStats, PostStatus } from '@/types/api';

/** The only palette a chart may use (DESIGN.md): single-hue green ramp, no rainbow. */
const RAMP = ['#1F4A33', '#2F7A4E', '#4FD18B', '#7BE0A8', '#B4F0CE'] as const;

const RANGE_LABEL = 'Last 30 days';

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const stats = useAdminStats();

  return (
    <div className="mx-auto w-full max-w-content">
      <PageHeader
        title="Overview"
        eyebrow="Admin"
        description="Content, audience and moderation health for the whole garden."
        actions={
          <span className="mono-label inline-flex items-center gap-1.5 rounded-full border border-line-subtle bg-bg-surface px-2.5 py-1">
            <Icon name="calendar" size={13} />
            {RANGE_LABEL}
          </span>
        }
      />

      {stats.isPending && <DashboardSkeleton />}

      {stats.isError && (
        <ErrorState
          title="Couldn't load the overview"
          message="The admin statistics endpoint did not respond."
          onRetry={() => void stats.refetch()}
        />
      )}

      {stats.isSuccess && stats.data && <DashboardBody data={stats.data} onReview={() => navigate('/admin/moderation')} />}
    </div>
  );
}

function DashboardBody({ data, onReview }: { data: AdminStats; onReview: () => void }): ReactNode {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total users"
          value={formatNumber(data.totalUsers)}
          // The server sends a percentage change over the same 30-day window as the range chip.
          delta={data.userDeltaPct}
          deltaDirection={data.userDeltaPct < 0 ? 'down' : 'up'}
        />
        <StatCard
          label="Published plants"
          value={formatNumber(data.publishedPlants)}
          delta={data.plantDelta}
          deltaDirection={data.plantDelta < 0 ? 'down' : 'up'}
        />
        <StatCard
          label="DAU"
          value={formatNumber(data.dau)}
          sparkline={data.dauSparkline}
          tone="accent"
        />
        <StatCard
          label="Pending moderation"
          value={formatNumber(data.pendingModeration)}
          tone="warning"
          action={{ label: 'Review', onClick: onReview }}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card variant="flat" padding="lg" className="lg:col-span-2">
          <h2 className="text-h3 text-fg">Active users · 30 days</h2>
          <p className="mono-label mt-1">Distinct daily active users</p>
          <div className="mt-4">
            <ActiveUsersChart values={data.activeUsers30d} />
          </div>
        </Card>

        <MostViewedPlants plants={data.topPlants} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <QuizPassRate rows={data.quizPassRate} />
        <RecentModeration rows={data.recentModeration} />
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ area chart */

const CHART_W = 720;
const CHART_H = 200;

function ActiveUsersChart({ values }: { values: number[] }): ReactNode {
  const gradientId = useId();

  const summary = useMemo(() => {
    const start = values[0] ?? 0;
    const latest = values[values.length - 1] ?? 0;
    const peak = values.reduce((highest, value) => Math.max(highest, value), 0);
    // A flat all-zero series still needs a divisor; the shape is then a flat line at the baseline.
    const scale = Math.max(peak, 1);
    const step = values.length > 1 ? CHART_W / (values.length - 1) : 0;
    const points = values.map((value, index) => ({
      x: index * step,
      y: CHART_H - (value / scale) * CHART_H,
    }));
    return { start, latest, peak, scale, points };
  }, [values]);

  const first = summary.points[0];
  const last = summary.points[summary.points.length - 1];

  if (values.length === 0 || !first || !last) {
    return <p className="text-small text-fg-secondary">No activity recorded in the last 30 days.</p>;
  }

  const polyline = summary.points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
  const polygon = `${first.x.toFixed(2)},${CHART_H} ${polyline} ${last.x.toFixed(2)},${CHART_H}`;
  const mid = Math.round(summary.scale / 2);

  return (
    <div className="flex gap-3">
      <div className="flex flex-col justify-between py-0.5">
        <span className="mono-label">{formatNumber(summary.scale)}</span>
        <span className="mono-label">{formatNumber(mid)}</span>
        <span className="mono-label">0</span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {/* role="img" plus a text summary: a visual-only chart is not acceptable - a screen reader
            has to be able to read the start, latest and peak values the picture encodes. */}
        <svg
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Active users over the last 30 days: ${formatNumber(summary.start)} at the start of the range, ${formatNumber(summary.latest)} on the latest day, peaking at ${formatNumber(summary.peak)}.`}
          className="h-[200px] w-full"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={RAMP[3]} stopOpacity="0.45" />
              <stop offset="55%" stopColor={RAMP[1]} stopOpacity="0.18" />
              <stop offset="100%" stopColor={RAMP[0]} stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {[0, 1, 2, 3, 4].map((index) => (
            <line
              key={index}
              x1={0}
              x2={CHART_W}
              y1={(CHART_H / 4) * index}
              y2={(CHART_H / 4) * index}
              stroke="rgba(255,255,255,0.05)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          <polygon points={polygon} fill={`url(#${gradientId})`} />
          <polyline
            points={polyline}
            fill="none"
            stroke={RAMP[4]}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <circle cx={last.x} cy={last.y} r={3} fill={RAMP[4]} vectorEffect="non-scaling-stroke" />
        </svg>

        <div className="flex justify-between">
          <span className="mono-label">30d ago</span>
          <span className="mono-label">15d ago</span>
          <span className="mono-label">today</span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ panels */

/**
 * The stats endpoint returns no image for a top plant, so the row marker is the botanical leaf
 * glyph rather than a photo URL the server never sent.
 */
function MostViewedPlants({ plants }: { plants: AdminStats['topPlants'] }): ReactNode {
  const rows = plants.slice(0, 6);
  const peak = rows.reduce((highest, row) => Math.max(highest, row.views), 0);

  return (
    <Card variant="flat" padding="lg">
      <h2 className="text-h3 text-fg">Most viewed plants</h2>
      {/* `views` is derived server-side from read counts, so it is labelled as such rather than
          called page views. */}
      <p className="mono-label mt-1">Counts derived from read counts</p>

      {rows.length === 0 ? (
        <p className="mt-4 text-small text-fg-secondary">No plant reads recorded yet.</p>
      ) : (
        <ol className="mt-3 flex flex-col gap-1">
          {rows.map((row, index) => (
            <li key={row.plantId} className="relative flex items-center gap-3 rounded-input px-2 py-2">
              <span
                aria-hidden="true"
                style={{ width: `${peak > 0 ? (row.views / peak) * 100 : 0}%` }}
                className="absolute inset-y-0 left-0 rounded-input bg-accent-tint"
              />
              <span className="mono-label relative w-4 shrink-0">{index + 1}</span>
              <span
                aria-hidden="true"
                className="relative flex size-9 shrink-0 items-center justify-center rounded-input border border-line-subtle bg-bg-raised text-accent-400"
              >
                <Icon name="leaf" size={18} />
              </span>
              <span className="relative min-w-0 flex-1">
                <span className="block truncate text-body text-fg">{row.commonName}</span>
                <span className="botanical block truncate text-small text-fg-secondary">
                  {row.botanicalName}
                </span>
              </span>
              <span className="mono-label relative shrink-0">{formatNumber(row.views)}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function QuizPassRate({ rows }: { rows: AdminStats['quizPassRate'] }): ReactNode {
  return (
    <Card variant="flat" padding="lg">
      <h2 className="text-h3 text-fg">Quiz pass rate</h2>
      <p className="mono-label mt-1">Share of attempts passed, by family</p>

      {rows.length === 0 ? (
        <p className="mt-4 text-small text-fg-secondary">No quiz attempts recorded yet.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-4">
          {rows.map((row, index) => {
            const pct = Math.min(Math.max(row.passRate, 0), 100);
            return (
              <li key={row.family} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-mono text-small text-fg">{row.family}</span>
                  <span className="mono-label">{formatNumber(pct)}%</span>
                </div>
                <div
                  role="img"
                  aria-label={`${row.family}: ${formatNumber(pct)} percent pass rate`}
                  className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]"
                >
                  <div
                    style={{ width: `${pct}%`, backgroundColor: RAMP[index % RAMP.length] ?? RAMP[0] }}
                    className="h-full rounded-full"
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

const ACTION_TONE: Record<PostStatus, 'accent' | 'danger' | 'warning'> = {
  approved: 'accent',
  rejected: 'danger',
  pending: 'warning',
};

const ACTION_LABEL: Record<PostStatus, string> = {
  approved: 'Approved',
  rejected: 'Rejected',
  pending: 'Pending',
};

function RecentModeration({ rows }: { rows: AdminStats['recentModeration'] }): ReactNode {
  return (
    <Card variant="flat" padding="lg">
      <h2 className="text-h3 text-fg">Recent moderation</h2>
      <p className="mono-label mt-1">Latest decisions across the queue</p>

      {rows.length === 0 ? (
        <p className="mt-4 text-small text-fg-secondary">No moderation activity yet.</p>
      ) : (
        <ul className="mt-4 flex flex-col">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-start gap-3 border-b border-line-subtle py-3 last:border-b-0"
            >
              <span className="mt-0.5 shrink-0">
                <Chip tone={ACTION_TONE[row.action]} size="sm">
                  {ACTION_LABEL[row.action]}
                </Chip>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body text-fg">{row.title}</span>
                <span className="mono-label mt-0.5 block">
                  {row.reviewer} · {formatRelative(row.at)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ loading */

function DashboardSkeleton(): ReactNode {
  return (
    <div role="status" aria-label="Loading overview">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Card key={index} variant="flat" padding="md" className="flex flex-col gap-3">
            <Skeleton width={96} height={11} />
            <Skeleton width={72} height={28} />
          </Card>
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card variant="flat" padding="lg" className="lg:col-span-2">
          <Skeleton width={180} height={14} />
          <Skeleton className="mt-4" width="100%" height={200} />
        </Card>
        <Card variant="flat" padding="lg" className="flex flex-col gap-3">
          <Skeleton width={140} height={14} />
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <Skeleton key={index} width="100%" height={28} />
          ))}
        </Card>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {[0, 1].map((index) => (
          <Card key={index} variant="flat" padding="lg" className="flex flex-col gap-3">
            <Skeleton width={140} height={14} />
            <Skeleton width="100%" height={96} />
          </Card>
        ))}
      </div>
    </div>
  );
}
