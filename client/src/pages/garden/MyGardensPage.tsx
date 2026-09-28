/**
 * `/gardens` - the garden directory. PageHeader, a responsive card grid, a ghost "create" card, and
 * the full state set (loading / empty / error). Each card can open, rename, publish or delete its
 * garden; every destructive action is confirmed.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Chip } from '@/components/ui/Chip';
import { Dropdown } from '@/components/ui/Dropdown';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/layout/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { Skeleton, SkeletonPlantGrid } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { Watermark } from '@/components/ui/Watermark';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
import {
  useCreateGarden,
  useDeleteGarden,
  useGardens,
  useUpdateGarden,
  type GardenListRow,
} from '@/features/gardens/hooks';

const GHOST_CARD =
  'flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line-strong bg-transparent p-6 text-center transition-colors duration-100 ease-base hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow';

/** Creation dialog, shared by the header button and the ghost card. */
function CreateGardenModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (garden: GardenListRow) => void;
}): React.ReactNode {
  const [name, setName] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const create = useCreateGarden();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New garden"
      description="A garden is a 6x6 bed: 36 tiles, one herb each."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={create.isPending}
            disabled={!name.trim()}
            onClick={() =>
              create.mutate(
                { name: name.trim(), isPublic },
                {
                  onSuccess: (data) => {
                    onCreated({
                      _id: data.garden._id,
                      name: data.garden.name,
                      slug: data.garden.slug,
                      isPublic: data.garden.isPublic,
                      plantCount: data.garden.plots.length,
                      thumbnails: [],
                      lastVisitedAt: data.garden.lastVisitedAt,
                      createdAt: data.garden.createdAt,
                    });
                    setName('');
                    onClose();
                  },
                },
              )
            }
          >
            Create garden
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input
          label="Garden name"
          placeholder="My herb garden"
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
        />
        <Checkbox
          label="Make this garden public"
          hint="A public garden has a read-only share link at /g/your-slug."
          checked={isPublic}
          onChange={(event) => setIsPublic(event.target.checked)}
        />
      </div>
      {create.isError && (
        <ErrorBanner
          className="mt-4"
          message={create.error instanceof ApiError ? create.error.message : 'Could not create the garden.'}
        />
      )}
    </Modal>
  );
}

/** One garden card: thumbnail, name, mono stats line, thumbnail overlap row and the overflow menu. */
function GardenCard({
  garden,
  isActive,
  onOpen,
  onRename,
  onTogglePublic,
  onDelete,
}: {
  garden: GardenListRow;
  isActive: boolean;
  onOpen: () => void;
  onRename: () => void;
  onTogglePublic: () => void;
  onDelete: () => void;
}): React.ReactNode {
  const cover = garden.thumbnails[0];

  return (
    <div className="top-highlight flex flex-col overflow-hidden rounded-card border border-line-subtle bg-bg-surface shadow-l1">
      <div className="relative aspect-[16/9] overflow-hidden bg-bg-sunken">
        {cover ? (
          // The server only ever returns real image URLs here, but the fallback below covers an empty
          // thumbnail list so an <img> can never point at nothing.
          <img src={cover} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <Watermark name="leaf" size={140} />
        )}
        <div className="absolute left-3 top-3 flex items-center gap-2">
          {isActive && <Chip tone="accent" size="sm">Active</Chip>}
          {garden.isPublic && <Chip tone="clay" size="sm">Public</Chip>}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 flex-1 truncate text-h3 text-fg">{garden.name}</h3>
          <Dropdown
            align="end"
            trigger={
              <span
                aria-label={`Actions for ${garden.name}`}
                className="inline-flex size-8 items-center justify-center rounded-btn text-fg-muted hover:bg-bg-hover hover:text-fg"
              >
                <Icon name="dots" size={18} />
              </span>
            }
            items={[
              { label: 'Open', icon: 'arrow-right', onSelect: onOpen },
              { label: 'Rename', icon: 'pencil', onSelect: onRename },
              {
                label: garden.isPublic ? 'Make private' : 'Make public',
                icon: garden.isPublic ? 'lock' : 'globe',
                onSelect: onTogglePublic,
              },
              { label: 'Delete', icon: 'trash', danger: true, onSelect: onDelete },
            ]}
          />
        </div>

        <p className="mono-label">
          {garden.plantCount} plants · visited {formatRelative(garden.lastVisitedAt)}
        </p>

        <div className="mt-1 flex items-center gap-0.5">
          {garden.thumbnails.slice(0, 4).map((thumbnail, index) => (
            <span
              key={thumbnail}
              className={cn(
                'size-7 overflow-hidden rounded-full border border-bg-surface bg-bg-sunken',
                index > 0 && '-ml-2',
              )}
            >
              <img src={thumbnail} alt="" loading="lazy" className="size-full object-cover" />
            </span>
          ))}
          {garden.thumbnails.length === 0 && (
            <span className="mono-label">No plants planted yet</span>
          )}
        </div>

        <div className="mt-auto pt-3">
          <Link
            to={`/garden?g=${garden._id}`}
            className="inline-flex items-center gap-1 rounded-btn text-small text-accent-400 transition-colors duration-100 ease-base hover:text-accent-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
          >
            Enter garden
            <Icon name="arrow-right" size={14} />
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function MyGardensPage(): React.ReactNode {
  const navigate = useNavigate();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const gardens = useGardens(page);
  const updateGarden = useUpdateGarden();
  const deleteGarden = useDeleteGarden();

  const [createOpen, setCreateOpen] = useState(false);
  const [renaming, setRenaming] = useState<GardenListRow | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleting, setDeleting] = useState<GardenListRow | null>(null);

  const rows = gardens.data?.items ?? [];
  // "Active" is the most recently visited garden in this page of results.
  const activeId = rows.reduce<GardenListRow | null>((newest, row) => {
    if (!row.lastVisitedAt) return newest;
    if (!newest?.lastVisitedAt) return row;
    return row.lastVisitedAt > newest.lastVisitedAt ? row : newest;
  }, null)?._id;

  const openGarden = (row: GardenListRow) => navigate(`/garden?g=${row._id}`);

  return (
    <div>
      <PageHeader
        title="My gardens"
        description="Every bed you have planted, newest first."
        eyebrow="Garden directory"
        actions={
          <Button iconLeft="plus" onClick={() => setCreateOpen(true)}>
            New garden
          </Button>
        }
      />

      {gardens.isLoading && <SkeletonPlantGrid count={6} columns={3} />}

      {gardens.isError && (
        <ErrorState
          title="Your gardens could not be loaded"
          message="The directory request failed. Check your connection and try again."
          onRetry={() => void gardens.refetch()}
        />
      )}

      {gardens.isSuccess && rows.length === 0 && (
        <div className="rounded-card border border-line-subtle bg-bg-surface">
          <EmptyState
            title="No gardens yet"
            description="Start with a name. The bed comes empty, and every tile you plant grows in the 3D garden."
            action={
              <Button iconLeft="plus" onClick={() => setCreateOpen(true)}>
                Start your first garden
              </Button>
            }
          />
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((row) => (
              <GardenCard
                key={row._id}
                garden={row}
                isActive={row._id === activeId}
                onOpen={() => openGarden(row)}
                onRename={() => {
                  setRenaming(row);
                  setRenameValue(row.name);
                }}
                onTogglePublic={() =>
                  updateGarden.mutate(
                    { id: row._id, isPublic: !row.isPublic },
                    {
                      onSuccess: () =>
                        toast.push({
                          variant: 'success',
                          title: row.isPublic ? 'Garden is private' : 'Garden is public',
                          description: row.isPublic
                            ? 'The share link no longer resolves for visitors.'
                            : `Anyone with /g/${row.slug} can view it read-only.`,
                        }),
                      onError: () =>
                        toast.push({ variant: 'danger', title: 'Could not change visibility' }),
                    },
                  )
                }
                onDelete={() => setDeleting(row)}
              />
            ))}

            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className={GHOST_CARD}
            >
              <Icon name="plus" size={24} className="text-fg-muted" />
              <span className="text-body text-fg-secondary">Create a new garden</span>
              <span className="mono-label">36 tiles · 6x6 bed</span>
            </button>
          </div>

          {(gardens.data?.totalPages ?? 1) > 1 && (
            <div className="mt-8">
              <Pagination
                page={gardens.data?.page ?? 1}
                totalPages={gardens.data?.totalPages ?? 1}
                onPageChange={setPage}
              />
            </div>
          )}
        </>
      )}

      <CreateGardenModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(created) => {
          toast.push({ variant: 'success', title: `${created.name} is ready` });
        }}
      />

      <Modal
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        title="Rename garden"
        description="The name is editable. The public share address is not - renaming never breaks an existing link."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button
              loading={updateGarden.isPending}
              disabled={!renameValue.trim()}
              onClick={() => {
                if (!renaming) return;
                updateGarden.mutate(
                  { id: renaming._id, name: renameValue.trim() },
                  {
                    onSuccess: () => {
                      setRenaming(null);
                      toast.push({ variant: 'success', title: 'Garden renamed' });
                    },
                    onError: (error) =>
                      toast.push({
                        variant: 'danger',
                        title: 'Could not rename the garden',
                        description: error instanceof ApiError ? error.message : undefined,
                      }),
                  },
                );
              }}
            >
              Save name
            </Button>
          </>
        }
      >
        <Input
          label="Garden name"
          value={renameValue}
          maxLength={80}
          onChange={(event) => setRenameValue(event.target.value)}
        />
      </Modal>

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name ?? 'this garden'}?`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Keep garden
            </Button>
            <Button
              variant="danger"
              loading={deleteGarden.isPending}
              onClick={() => {
                if (!deleting) return;
                deleteGarden.mutate(deleting._id, {
                  onSuccess: () => {
                    toast.push({ variant: 'success', title: `${deleting.name} deleted` });
                    setDeleting(null);
                  },
                  onError: () =>
                    toast.push({ variant: 'danger', title: 'Could not delete the garden' }),
                });
              }}
            >
              Delete garden
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {/*
            Spelled out because the consequence is not obvious: the bed is the only place the plots
            live, so deleting it drops every placement, and a public share link stops resolving.
          */}
          <p className="text-body text-fg-secondary">
            This removes all {deleting?.plantCount ?? 0} planted tiles with the garden. Plants stay in
            the encyclopedia, and the garden cannot be restored.
          </p>
          {deleting?.isPublic && (
            <p className="text-body text-fg-secondary">
              Its public link <span className="font-mono">/g/{deleting.slug}</span> will stop working
              for visitors.
            </p>
          )}
        </div>
      </Modal>

      {gardens.isFetching && !gardens.isLoading && (
        <div className="mt-4 flex items-center gap-2">
          <Skeleton width={120} height={12} />
        </div>
      )}
    </div>
  );
}
