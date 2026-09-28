import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon, type IconName } from '@/components/icons';
import { PageHeader, Section } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { HexBadgeTile } from '@/components/ui/HexBadgeTile';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tabs } from '@/components/ui/Tabs';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
import {
  useMarkNotificationsRead,
  useNotifications,
  useMyBadges,
  type NotificationFilter,
  type NotificationType,
} from '@/features/learn/hooks';
import type { NotificationRow } from '@/types/api';

type TabValue = 'all' | 'unread' | 'mentions';

/**
 * `Mentions` is served by the real `reply` notification type (`?type=reply`); the API has no
 * separate "mentioned me" concept, and replies to your posts are the app's only mention surface.
 * The tab is emitted because that filter is genuine - a tab the server could not back would be
 * omitted rather than show misleading results.
 */
const TABS: Array<{ value: TabValue; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'mentions', label: 'Mentions' },
];

const TAB_TYPE: Record<TabValue, NotificationType | undefined> = {
  all: undefined,
  unread: undefined,
  mentions: 'reply',
};

const TYPE_META: Record<NotificationType, { icon: IconName; tone: string }> = {
  badge: { icon: 'award', tone: 'bg-accent-tint text-accent-400' },
  reply: { icon: 'message', tone: 'bg-clay-tint text-clay-400' },
  streak: { icon: 'flame', tone: 'bg-warning/15 text-warning' },
  moderation: { icon: 'shield', tone: 'bg-danger-tint text-danger' },
  system: { icon: 'info', tone: 'bg-white/[0.06] text-fg-secondary' },
};

/** Today and yesterday get names; anything older shows its date. */
function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const daysAgo = Math.round((startOfToday - startOfDay) / 86_400_000);
  if (daysAgo <= 0) return 'Today';
  if (daysAgo === 1) return 'Yesterday';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabValue>('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  const filter: NotificationFilter = {
    unread: tab === 'unread' ? true : undefined,
    type: TAB_TYPE[tab],
  };
  const notifications = useNotifications(filter);
  const markRead = useMarkNotificationsRead();
  const badges = useMyBadges();

  const items = notifications.data?.items ?? [];
  const unreadCount = notifications.data?.unreadCount ?? 0;
  const groups = groupByDay(items);

  const handleRow = (row: NotificationRow) => {
    if (!row.read) markRead.mutate([row._id]);
    if (row.badgeKey) {
      setExpanded((prev) => (prev === row._id ? null : row._id));
      return;
    }
    if (row.href) navigate(row.href);
  };

  return (
    <div className="mx-auto w-full max-w-[640px]">
      <PageHeader
        title="Notifications"
        actions={
          <Button
            variant="ghost"
            disabled={unreadCount === 0}
            loading={markRead.isPending}
            onClick={() => markRead.mutate(undefined)}
          >
            Mark all read
          </Button>
        }
      />

      <Tabs
        tabs={TABS.map((entry) =>
          entry.value === 'unread' ? { ...entry, count: unreadCount } : entry,
        )}
        value={tab}
        onChange={(value) => setTab(value === 'unread' ? 'unread' : value === 'mentions' ? 'mentions' : 'all')}
        className="mb-6"
      />

      {notifications.isPending && <InboxSkeleton />}

      {notifications.isError && (
        <ErrorState
          title="Couldn't load notifications"
          message="Your inbox did not respond."
          onRetry={() => void notifications.refetch()}
        />
      )}

      {notifications.isSuccess && items.length === 0 && (
        <EmptyState
          title="You're all caught up"
          description="No notifications in this view. New activity will appear here."
          watermark="bell"
        />
      )}

      {notifications.isSuccess && items.length > 0 && (
        <div className="flex flex-col gap-8">
          {groups.map((group) => (
            <Section key={group.label} title={<span className="mono-label">{group.label}</span>}>
              <ul className="overflow-hidden rounded-card border border-line-subtle bg-bg-surface">
                {group.rows.map((row) => (
                  <NotificationItem
                    key={row._id}
                    row={row}
                    expanded={expanded === row._id}
                    badges={badges.data?.items ?? []}
                    onSelect={handleRow}
                  />
                ))}
              </ul>
            </Section>
          ))}
        </div>
      )}
    </div>
  );
}

function NotificationItem({
  row,
  expanded,
  badges,
  onSelect,
}: {
  row: NotificationRow;
  expanded: boolean;
  badges: Array<{ key: string; name: string; icon: string; earnedAt: string }>;
  onSelect: (row: NotificationRow) => void;
}) {
  const meta = TYPE_META[row.type];
  const badge = row.badgeKey ? badges.find((entry) => entry.key === row.badgeKey) : undefined;

  return (
    <li className="border-b border-line-subtle last:border-b-0">
      <button
        type="button"
        onClick={() => onSelect(row)}
        aria-expanded={row.badgeKey ? expanded : undefined}
        className={cn(
          'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors duration-100 ease-base hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow',
          !row.read && 'bg-accent-tint/30',
        )}
      >
        <span className="mt-2 flex w-2 shrink-0 justify-center">
          {!row.read && (
            <span
              aria-label="Unread"
              role="img"
              className="size-1.5 rounded-full bg-accent-500"
            />
          )}
        </span>

        <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-full', meta.tone)}>
          <Icon name={meta.icon} size={18} />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-body font-semibold text-fg">{row.title}</span>
          <span className="block text-small text-fg-secondary">{row.body}</span>
        </span>

        <span className="mono-label shrink-0">{formatRelative(row.createdAt)}</span>
      </button>

      {expanded && badge && (
        <div className="flex items-center gap-4 border-t border-line-subtle px-4 py-4">
          <HexBadgeTile name={badge.name} icon={badge.icon} unlocked size={56} />
          <span className="flex items-center gap-1 text-small">
            <Icon name="award" size={14} className="text-accent-400" />
            <Link
              to={`/progress#badge-${badge.key}`}
              className="rounded-btn text-accent-400 transition-colors duration-100 ease-base hover:text-accent-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
            >
              View badge
            </Link>
          </span>
        </div>
      )}
    </li>
  );
}

function groupByDay(rows: NotificationRow[]): Array<{ label: string; rows: NotificationRow[] }> {
  const groups: Array<{ label: string; rows: NotificationRow[] }> = [];
  for (const row of rows) {
    const label = dayLabel(row.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.rows.push(row);
    else groups.push({ label, rows: [row] });
  }
  return groups;
}

function InboxSkeleton() {
  return (
    <div role="status" aria-label="Loading notifications" className="flex flex-col gap-8">
      {[0, 1].map((group) => (
        <div key={group}>
          <Skeleton width={72} height={11} />
          <div className="mt-3 overflow-hidden rounded-card border border-line-subtle">
            {[0, 1].map((row) => (
              <div key={row} className="flex items-start gap-3 border-b border-line-subtle px-4 py-3 last:border-b-0">
                <Skeleton variant="circle" width={36} height={36} />
                <div className="flex-1">
                  <Skeleton width="45%" height={14} />
                  <Skeleton className="mt-2" width="75%" height={12} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
