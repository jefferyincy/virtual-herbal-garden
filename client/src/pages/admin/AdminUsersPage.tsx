import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import { Icon } from '@/components/icons';
import { PageHeader } from '@/components/layout/PageHeader';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip, FilterChip } from '@/components/ui/Chip';
import { Dropdown } from '@/components/ui/Dropdown';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/Table';
import { Textarea } from '@/components/ui/Textarea';
import { formatDate, formatNumber, formatRelative, titleCase } from '@/lib/format';
import {
  apiErrorMessage,
  useAdminUsers,
  useSetUserBanned,
  useSetUserRole,
  type AdminUser,
} from '@/features/admin/hooks';
import type { Role } from '@/types/api';

type RoleFilter = 'all' | Role | 'banned';

const ROLE_FILTERS: Array<{ value: RoleFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'student', label: 'Students' },
  { value: 'expert', label: 'Experts' },
  { value: 'admin', label: 'Admins' },
  { value: 'banned', label: 'Banned' },
];

const ROLE_ITEMS: Array<{ label: string; value: Role }> = [
  { label: 'Student', value: 'student' },
  { label: 'Expert', value: 'expert' },
  { label: 'Admin', value: 'admin' },
];

export default function AdminUsersPage() {
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [banTarget, setBanTarget] = useState<AdminUser | null>(null);
  const [banReason, setBanReason] = useState('');

  const filters = {
    q,
    role: roleFilter === 'banned' || roleFilter === 'all' ? ('all' as const) : roleFilter,
    ...(roleFilter === 'banned' ? { banned: true } : {}),
    page,
  };

  const users = useAdminUsers(filters);
  const setRole = useSetUserRole();
  const setBanned = useSetUserBanned();

  const items = users.data?.items ?? [];
  const focused = items.find((item) => item._id === focusedId) ?? null;

  function resetTo(update: () => void): void {
    update();
    setPage(1);
    setExpandedId(null);
    setFocusedId(null);
  }

  const mutationError = setRole.error ?? setBanned.error;

  return (
    <div className="mx-auto w-full max-w-content">
      <PageHeader
        title="Users"
        eyebrow="Admin"
        description="Learner accounts, roles and moderation state."
        actions={
          <Button variant="secondary" iconLeft="refresh" onClick={() => void users.refetch()}>
            Refresh
          </Button>
        }
      />

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Input
          containerClassName="w-full sm:w-72"
          label="Search"
          icon="search"
          placeholder="Name, handle or email"
          value={q}
          onChange={(event) => resetTo(() => setQ(event.target.value))}
        />
        <div className="flex flex-wrap items-center gap-2 pb-1">
          {ROLE_FILTERS.map((filter) => (
            <FilterChip
              key={filter.value}
              active={roleFilter === filter.value}
              onClick={() => resetTo(() => setRoleFilter(filter.value))}
            >
              {filter.label}
            </FilterChip>
          ))}
        </div>
      </div>

      {/* `pendingExpertApplications` is honestly 0: the server has no expert-application flow, and
          the field is kept visible rather than hidden so the number is never invented. */}
      <p className="mono-label mb-4">
        {users.data
          ? `${formatNumber(users.data.totalUsers)} users · ${formatNumber(users.data.activeToday)} active today · ${formatNumber(users.data.pendingExpertApplications)} pending expert applications`
          : 'Loading users'}
      </p>

      {mutationError && (
        <ErrorBanner
          className="mb-4"
          message={apiErrorMessage(mutationError)}
          onDismiss={() => {
            setRole.reset();
            setBanned.reset();
          }}
        />
      )}

      {users.isPending && <SkeletonTable rows={8} columns={7} />}

      {users.isError && (
        <ErrorState
          title="Couldn't load users"
          message="The admin user list did not respond."
          onRetry={() => void users.refetch()}
        />
      )}

      {users.isSuccess && items.length === 0 && (
        <EmptyState
          title="No users match these filters"
          description="Try a different search term or role filter."
          watermark="users"
          action={
            <Button
              variant="secondary"
              onClick={() =>
                resetTo(() => {
                  setQ('');
                  setRoleFilter('all');
                })
              }
            >
              Clear filters
            </Button>
          }
        />
      )}

      {users.isSuccess && items.length > 0 && (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <Card variant="flat" padding="none" className="min-w-0 flex-1 overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <tr>
                    <TH>User</TH>
                    <TH>Role</TH>
                    <TH align="right">XP</TH>
                    <TH>Joined</TH>
                    <TH>Last active</TH>
                    <TH>Status</TH>
                    <TH align="right">Detail</TH>
                  </tr>
                </THead>
                <TBody>
                  {items.map((user) => {
                    const expanded = expandedId === user._id;
                    const focusedRow = focusedId === user._id;
                    return (
                      <UserRows
                        key={user._id}
                        user={user}
                        expanded={expanded}
                        focused={focusedRow}
                        roleError={
                          setRole.isError && setRole.variables?.id === user._id
                            ? apiErrorMessage(setRole.error)
                            : null
                        }
                        banError={
                          setBanned.isError && setBanned.variables?.id === user._id
                            ? apiErrorMessage(setBanned.error)
                            : null
                        }
                        onToggle={() => {
                          setExpandedId(expanded ? null : user._id);
                          // Expanding a row also pins it: the spec's "selecting a row shows the
                          // right-side detail panel" behaviour, without a third click target.
                          if (!expanded) setFocusedId(user._id);
                        }}
                        onFocus={() => setFocusedId(focusedRow ? null : user._id)}
                        onChangeRole={(role) => setRole.mutate({ id: user._id, role })}
                        onOpenBan={() => {
                          setBanReason('');
                          setBanTarget(user);
                        }}
                        onReinstate={() => setBanned.mutate({ id: user._id, banned: false })}
                      />
                    );
                  })}
                </TBody>
              </Table>
            </div>
          </Card>

          <aside className="w-full shrink-0 lg:w-[300px]">
            <Card variant="flat" padding="lg" className="flex flex-col gap-3">
              <h2 className="text-h3 text-fg">Selected user</h2>
              {focused ? (
                <>
                  <div className="flex items-center gap-3">
                    <Avatar name={focused.name} level={focused.level} size={44} />
                    <div className="min-w-0">
                      <p className="truncate text-body text-fg">{focused.name}</p>
                      <p className="mono-label truncate">@{focused.handle}</p>
                    </div>
                  </div>
                  {/* Only the fields the endpoint actually returns: there is no activity-timeline
                      source in the admin API, so none is invented here. */}
                  <dl className="flex flex-col gap-2 border-t border-line-subtle pt-3">
                    <DetailRow label="XP" value={formatNumber(focused.xp)} />
                    <DetailRow label="Level" value={String(focused.level)} />
                    <DetailRow label="Badges" value={String(focused.badgeCount)} />
                    <DetailRow label="Joined" value={formatDate(focused.joinedAt)} />
                    <DetailRow label="Last active" value={formatRelative(focused.lastActiveAt)} />
                    <DetailRow label="Role" value={titleCase(focused.role)} />
                  </dl>
                </>
              ) : (
                <p className="text-small text-fg-secondary">
                  Pin a row to see that user's details here.
                </p>
              )}
            </Card>
          </aside>
        </div>
      )}

      {users.isSuccess && users.data && users.data.totalPages > 1 && (
        <Pagination
          className="mt-6"
          page={users.data.page}
          totalPages={users.data.totalPages}
          onPageChange={(next) => {
            setPage(next);
            setExpandedId(null);
            setFocusedId(null);
          }}
        />
      )}

      <Modal
        open={banTarget !== null}
        onClose={() => setBanTarget(null)}
        title={banTarget?.banned ? 'Reinstate this user?' : 'Ban this user?'}
        description={
          banTarget?.banned
            ? 'Their account becomes active again immediately.'
            : 'They lose access to the app and their refresh tokens are revoked. The reason is optional.'
        }
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setBanTarget(null)}>
              Cancel
            </Button>
            <Button
              variant={banTarget?.banned ? 'primary' : 'danger'}
              loading={setBanned.isPending}
              onClick={() => {
                if (!banTarget) return;
                setBanned.mutate(
                  {
                    id: banTarget._id,
                    banned: !banTarget.banned,
                    ...(banReason.trim() ? { reason: banReason.trim() } : {}),
                  },
                  {
                    onSuccess: () => {
                      setBanTarget(null);
                      setBanReason('');
                    },
                  },
                );
              }}
            >
              {banTarget?.banned ? 'Reinstate' : 'Ban user'}
            </Button>
          </>
        }
      >
        {banTarget && (
          <div className="flex flex-col gap-3">
            <p className="text-small text-fg-secondary">
              <span className="text-fg">{banTarget.name}</span> · {banTarget.email}
            </p>
            {!banTarget.banned && (
              <Textarea
                label="Reason"
                rows={3}
                value={banReason}
                onChange={(event) => setBanReason(event.target.value)}
              />
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="mono-label">{label}</dt>
      <dd className="text-small text-fg-secondary">{value}</dd>
    </div>
  );
}

function UserRows({
  user,
  expanded,
  focused,
  roleError,
  banError,
  onToggle,
  onFocus,
  onChangeRole,
  onOpenBan,
  onReinstate,
}: {
  user: AdminUser;
  expanded: boolean;
  focused: boolean;
  /** The server's own message for a rejected change on THIS row, shown next to the action. */
  roleError: string | null;
  banError: string | null;
  onToggle: () => void;
  onFocus: () => void;
  onChangeRole: (role: Role) => void;
  onOpenBan: () => void;
  onReinstate: () => void;
}): ReactNode {
  const rowRef = useRef<HTMLTableRowElement>(null);

  return (
    <>
      <TR selected={focused}>
        <TD>
          <div className="flex items-center gap-3">
            <Avatar name={user.name} level={user.level} size={36} />
            <div className="min-w-0">
              <p className="truncate text-body text-fg">{user.name}</p>
              <p className="truncate font-mono text-micro text-fg-muted">@{user.handle}</p>
            </div>
          </div>
        </TD>
        <TD>
          <Dropdown
            align="start"
            trigger={
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-line-subtle bg-white/[0.04] px-2.5 py-1 font-mono text-micro uppercase text-fg-secondary transition-colors duration-100 ease-base hover:border-line-strong hover:text-fg"
                aria-label={`Change role for ${user.name}`}
              >
                {user.role}
                <Icon name="chevron-down" size={12} />
              </span>
            }
            items={ROLE_ITEMS.map((item) => ({
              label: `${item.label}${item.value === user.role ? ' (current)' : ''}`,
              disabled: item.value === user.role,
              onSelect: () => onChangeRole(item.value),
            }))}
          />
        </TD>
        <TD align="right" mono>
          {formatNumber(user.xp)}
        </TD>
        <TD>
          <span className="mono-label">{formatDate(user.joinedAt)}</span>
        </TD>
        <TD>
          <span className="text-small text-fg-secondary">{formatRelative(user.lastActiveAt)}</span>
        </TD>
        <TD>
          <Chip tone={user.banned ? 'danger' : 'accent'} size="sm">
            {user.banned ? 'Banned' : 'Active'}
          </Chip>
        </TD>
        <TD align="right">
          <span className="inline-flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                rowRef.current?.scrollIntoView({ block: 'nearest' });
                onFocus();
              }}
            >
              {focused ? 'Unpin' : 'Pin'}
            </Button>
            <Button variant="ghost" size="sm" onClick={onToggle} aria-expanded={expanded}>
              {expanded ? 'Hide' : 'Detail'}
            </Button>
          </span>
        </TD>
      </TR>

      {expanded && (
        <tr ref={rowRef} className="border-b border-line-subtle bg-bg-surface">
          <td colSpan={7} className="px-4 py-4">
            {roleError && <ErrorBanner className="mb-3" message={roleError} />}
            {banError && <ErrorBanner className="mb-3" message={banError} />}
            <div className="flex flex-wrap items-start gap-8">
              <div className="flex gap-8">
                <StatBlock label="XP" value={formatNumber(user.xp)} />
                <StatBlock label="Level" value={String(user.level)} />
                <StatBlock label="Badges" value={String(user.badgeCount)} />
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <span className="text-small text-fg-secondary">{user.email}</span>
                <Dropdown
                  align="end"
                  trigger={
                    <span className="inline-flex h-9 items-center gap-2 rounded-btn border border-line-strong px-3 text-small text-fg">
                      Change role
                      <Icon name="chevron-down" size={14} />
                    </span>
                  }
                  items={ROLE_ITEMS.map((item) => ({
                    label: `${item.label}${item.value === user.role ? ' (current)' : ''}`,
                    disabled: item.value === user.role,
                    onSelect: () => onChangeRole(item.value),
                  }))}
                />
                {user.banned ? (
                  <Button variant="secondary" size="sm" iconLeft="refresh" onClick={onReinstate}>
                    Reinstate
                  </Button>
                ) : (
                  <Button variant="danger" size="sm" iconLeft="shield" onClick={onOpenBan}>
                    Ban user
                  </Button>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function StatBlock({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <div className="flex flex-col gap-1">
      <span className="mono-label">{label}</span>
      <span className="font-mono text-body text-fg">{value}</span>
    </div>
  );
}
