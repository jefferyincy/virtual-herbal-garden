/**
 * `/garden/settings`: the route form of the garden settings panel.
 *
 * This page renders the SAME `GardenSettingsPanel` the in-garden HUD opens - one implementation, two
 * entry points - so a setting changed here and a setting changed from the overlay can never diverge.
 * `open` is forced true and `onClose` navigates back to the garden, because the panel is the whole
 * page here.
 *
 * The panel is drawn over the loaded garden scene when the caller has one; a caller with no garden (or
 * a garden that fails to load) still gets a working route over a plain `bg-bg-base` backdrop, so
 * `/garden/settings` is never broken.
 */
import { useNavigate } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import { GardenSettingsPanel } from '@/features/gardens/GardenSettingsPanel';
import { GardenScene } from '@/features/gardens/scene/GardenScene';
import {
  useFrameRate,
  useGarden,
  useGardenSettings,
  useGardens,
  useRendererDpr,
} from '@/features/gardens/hooks';

export default function GardenSettingsPage(): React.ReactNode {
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const gardens = useGardens();
  const { settings } = useGardenSettings();
  const fps = useFrameRate();
  const dpr = useRendererDpr();

  const gardenId = gardens.data?.items[0]?._id;
  const garden = useGarden(gardenId);
  const plots = garden.data?.garden.plots ?? [];
  const hasScene = gardenId !== undefined && garden.isSuccess;

  return (
    <div className="relative size-full bg-bg-base">
      {hasScene ? (
        // Static, non-interactive backdrop: the panel owns the pointer, so the scene must not consume
        // clicks or offer selection while it is open.
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <GardenScene
            plots={plots}
            settings={settings}
            className="size-full"
            reducedMotion={Boolean(reducedMotion)}
          />
        </div>
      ) : (
        // Keep the same blurred-veil look over a plain backdrop so the route works without a garden.
        <div aria-hidden="true" className="absolute inset-0 bg-bg-base dot-grid" />
      )}

      <GardenSettingsPanel
        open
        onClose={() => navigate('/garden')}
        fps={fps}
        dpr={dpr}
      />
    </div>
  );
}
