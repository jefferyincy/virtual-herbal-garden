/**
 * The garden route (`/garden`). Full-bleed: the orchestrator marks this route `layout: 'canvas'`, so the
 * shell adds no padding and the WebGL surface fills the viewport under the top nav.
 *
 * Flow: the caller's first garden is loaded; a caller with no garden gets the create flow instead. The
 * visit stamp fires once per mount (see the ref guard below), never once per render.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import { z } from 'zod';
import { Icon } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { KeyboardHint } from '@/components/ui/KeyboardHint';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/api';
import { GardenHud } from '@/features/gardens/GardenHud';
import { GardenSettingsPanel } from '@/features/gardens/GardenSettingsPanel';
import { GardenScene, type ResetViewHandle } from '@/features/gardens/scene/GardenScene';
import {
  GARDEN_MAX_PLOTS,
  useCreateGarden,
  useFrameRate,
  useGarden,
  useGardenSettings,
  useGardens,
  useRemovePlot,
  useRendererDpr,
  useVisitGarden,
} from '@/features/gardens/hooks';

/** Canvas-shaped loading placeholder; the garden is full-bleed, so this matches its box exactly. */
function GardenCanvasSkeleton(): React.ReactNode {
  return (
    <div
      role="status"
      aria-label="Loading your garden"
      className="flex size-full items-center justify-center bg-bg-sunken"
    >
      <div className="flex flex-col items-center gap-3">
        <Skeleton variant="card" width={280} height={160} />
        <Skeleton width={160} height={12} />
        <Skeleton width={120} height={12} />
      </div>
    </div>
  );
}

/** The server's 422 envelope carries `details: [{path, message}]`; validated, not asserted. */
const fieldErrorSchema = z.array(z.object({ message: z.string() }));

/** The create-garden dialog. Surfaces validation details from a 422 instead of failing silently. */
function CreateGardenModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (gardenId: string) => void;
}): React.ReactNode {
  const [name, setName] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const create = useCreateGarden();

  const parsedDetails = create.error instanceof ApiError
    ? fieldErrorSchema.safeParse(create.error.details)
    : null;
  const details = parsedDetails?.success
    ? parsedDetails.data.map((entry) => entry.message)
    : [];

  const submit = () => {
    create.mutate(
      { name: name.trim(), isPublic },
      {
        onSuccess: (data) => {
          onCreated(data.garden._id);
          onClose();
        },
      },
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Start your first garden"
      description="Name it now - the shareable address is fixed at creation and never changes."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={create.isPending} disabled={!name.trim()} onClick={submit}>
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
        {create.isError && (
          <ErrorBanner
            message={
              create.error instanceof ApiError
                ? create.error.message
                : 'The garden could not be created.'
            }
            onRetry={details.length > 0 ? undefined : submit}
          />
        )}
        {details.length > 0 && (
          <ul className="flex flex-col gap-1">
            {details.map((message) => (
              <li key={message} className="text-small text-danger">
                {message}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

export default function GardenPage(): React.ReactNode {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const reducedMotion = useReducedMotion();
  const gardens = useGardens();
  const { settings } = useGardenSettings();
  const fps = useFrameRate();
  const dpr = useRendererDpr();

  const [createOpen, setCreateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedPlotId, setSelectedPlotId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [projected, setProjected] = useState<{ x: number; y: number } | null>(null);
  const resetViewRef: ResetViewHandle = useRef(null);

  // `?g=` lets the directory open a specific garden. It is a preference, not a requirement: an id that
  // is not in the caller's list (stale link, someone else's garden) falls back to the first garden
  // rather than failing, because the list response is already the authority on what is readable.
  const requestedId = searchParams.get('g');
  const primaryGarden =
    gardens.data?.items.find((item) => item._id === requestedId) ?? gardens.data?.items[0] ?? null;
  const gardenId = primaryGarden?._id;
  const garden = useGarden(gardenId);
  const visitGarden = useVisitGarden();
  const removePlot = useRemovePlot(gardenId ?? '');

  // Once per mount, not once per render: the guard keeps the stamp from re-firing when the list
  // refetches (the visit invalidates the list, which would otherwise loop). `mutate` is stable.
  const visit = visitGarden.mutate;
  const visitedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!gardenId || visitedRef.current === gardenId) return;
    visitedRef.current = gardenId;
    visit(gardenId);
  }, [gardenId, visit]);

  // Escape clears the selection so the HUD card cannot be left orphaned by a camera move.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedPlotId(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const createModal = (
    <CreateGardenModal
      open={createOpen}
      onClose={() => setCreateOpen(false)}
      onCreated={() => {
        toast.push({ variant: 'success', title: 'Garden created' });
      }}
    />
  );

  if (gardens.isLoading) return <GardenCanvasSkeleton />;

  if (gardens.isError) {
    return (
      <div className="flex size-full items-center justify-center bg-bg-sunken p-6">
        <ErrorState
          title="Your gardens could not be loaded"
          message="The garden list request failed. Check your connection and try again."
          onRetry={() => void gardens.refetch()}
        />
      </div>
    );
  }

  if (!primaryGarden) {
    return (
      <div className="relative flex size-full items-center justify-center bg-bg-sunken dot-grid">
        <EmptyState
          title="No gardens yet"
          description="A garden is a 6x6 bed where every tile holds one herb. Plant your first one and it grows here."
          action={<Button iconLeft="plus" onClick={() => setCreateOpen(true)}>Start your first garden</Button>}
          className="max-w-[520px] rounded-panel border border-line-subtle bg-bg-surface/80 backdrop-blur-[16px]"
        />
        {createModal}
      </div>
    );
  }

  if (garden.isLoading) return <GardenCanvasSkeleton />;

  if (garden.isError || !garden.data) {
    return (
      <div className="flex size-full items-center justify-center bg-bg-sunken p-6">
        <ErrorState
          title="This garden could not be opened"
          message={`"${primaryGarden.name}" could not be loaded. It may have been deleted in another tab.`}
          onRetry={() => void garden.refetch()}
        />
      </div>
    );
  }

  const plots = garden.data.garden.plots;
  const selectedPlot = plots.find((plot) => plot._id === selectedPlotId) ?? null;
  const selectedPlant = selectedPlot?.plantId ?? null;

  return (
    <div className="relative size-full bg-bg-sunken">
      <GardenScene
        plots={plots}
        selectedPlotId={selectedPlotId ?? undefined}
        onSelectPlot={(plotId) => setSelectedPlotId(plotId)}
        onClearSelection={() => setSelectedPlotId(null)}
        settings={settings}
        className="size-full"
        resetViewRef={resetViewRef}
        onProjectSelected={setProjected}
        reducedMotion={Boolean(reducedMotion)}
      />

      <GardenHud
        plotCount={plots.length}
        maxPlots={GARDEN_MAX_PLOTS}
        mode="view"
        onOpenSettings={() => setSettingsOpen(true)}
        onPlace={() => navigate('/garden/place')}
        onResetView={() => resetViewRef.current?.()}
        fps={fps}
        dpr={dpr}
        selectedPlant={
          selectedPlant
            ? {
                slug: selectedPlant.slug,
                commonName: selectedPlant.commonName,
                botanicalName: selectedPlant.botanicalName,
              }
            : null
        }
        projectedScreenPosition={projected}
        onCloseSelection={() => setSelectedPlotId(null)}
        onRemoveSelected={selectedPlot ? () => setConfirmRemoveId(selectedPlot._id) : undefined}
      />

      <div className="pointer-events-none absolute bottom-4 left-4 hidden flex-col gap-1 lg:flex">
        <p className="mono-label">{garden.data.garden.name}</p>
        <div className="flex items-center gap-3">
          <KeyboardHint keys={['Drag', 'Orbit']} />
          <KeyboardHint keys={['Scroll', 'Zoom']} />
          <KeyboardHint keys={['Click', 'Select']} />
          <KeyboardHint keys={['Esc', 'Clear']} />
        </div>
        <Link
          to="/gardens"
          className="pointer-events-auto mt-1 inline-flex w-fit items-center gap-1 rounded-btn text-small text-fg-secondary transition-colors duration-100 ease-base hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
        >
          <Icon name="arrow-left" size={14} />
          All gardens
        </Link>
      </div>

      <GardenSettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        fps={fps}
        dpr={dpr}
      />

      <Modal
        open={confirmRemoveId !== null}
        onClose={() => setConfirmRemoveId(null)}
        title="Remove this plant?"
        description="The tile becomes free again. Nothing else about the garden changes."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmRemoveId(null)}>
              Keep plant
            </Button>
            <Button
              variant="danger"
              loading={removePlot.isPending}
              onClick={() => {
                if (!confirmRemoveId) return;
                const plotId = confirmRemoveId;
                removePlot.mutate(plotId, {
                  onSuccess: () => {
                    setSelectedPlotId(null);
                    setConfirmRemoveId(null);
                    toast.push({ variant: 'success', title: 'Plant removed' });
                  },
                  onError: () => {
                    setConfirmRemoveId(null);
                    toast.push({
                      variant: 'danger',
                      title: 'Could not remove the plant',
                      description: 'The garden was not changed. Reload and try again.',
                    });
                  },
                });
              }}
            >
              Remove plant
            </Button>
          </>
        }
      >
        <p className="text-body text-fg-secondary">
          {selectedPlant ? selectedPlant.commonName : 'This plant'} will be lifted from the bed.
        </p>
      </Modal>

      {createModal}
    </div>
  );
}
