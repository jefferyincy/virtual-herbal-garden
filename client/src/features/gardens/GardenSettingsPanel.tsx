/**
 * Garden settings: the single implementation of the ambience/performance/sound panel, shared by the
 * in-garden overlay and the `/garden/settings` route.
 *
 * Local dialog semantics come from the shared overlay helpers (`useOverlay` + `trapTab` in
 * `components/ui/Modal`): scroll lock, focus on open, focus restore, Escape, and a Tab cycle. A plain
 * `Modal` cannot be used because the panel is capped at 520px and collapses to the `Drawer` primitive
 * on small screens - both of which `Modal`'s fixed sizes cannot express.
 *
 * Everything edited here is DEVICE-LOCAL. The garden API's PATCH body is `.strict()` and accepts only
 * `name` / `isPublic`, so ambience is written to `localStorage` through `useGardenSettings`, never to
 * the server.
 */
import { useEffect, useId, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Icon } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Chip, FilterChip } from '@/components/ui/Chip';
import { Drawer } from '@/components/ui/Drawer';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { trapTab, useOverlay } from '@/components/ui/Modal';
import { cn } from '@/lib/cn';
import type { GardenSettings } from '@/types/api';
import { DEFAULT_GARDEN_SETTINGS, useGardenSettings } from './hooks';

/** Small-screen breakpoint, matching Tailwind's `sm`. Duplicated from Drawer because it is not exported. */
function useIsSmallScreen(): boolean {
  const [small, setSmall] = useState(() =>
    typeof window === 'undefined' ? false : !window.matchMedia('(min-width: 640px)').matches,
  );
  useEffect(() => {
    const query = window.matchMedia('(min-width: 640px)');
    const update = () => setSmall(!query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return small;
}

const SEASONS: Array<{ value: GardenSettings['season']; label: string }> = [
  { value: 'spring', label: 'Spring' },
  { value: 'summer', label: 'Summer' },
  { value: 'monsoon', label: 'Monsoon' },
  { value: 'winter', label: 'Winter' },
];

const WEATHER: Array<{ value: GardenSettings['weather']; label: string; icon: 'sun' | 'rain' | 'mist' }> = [
  { value: 'clear', label: 'Clear', icon: 'sun' },
  { value: 'rain', label: 'Rain', icon: 'rain' },
  { value: 'mist', label: 'Mist', icon: 'mist' },
];

const QUALITY: Array<{ value: GardenSettings['quality']; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

/** 24h decimal -> `HH:MM`, the mockup's mono clock. */
function clockLabel(timeOfDay: number): string {
  const hours = Math.floor(timeOfDay) % 24;
  const minutes = Math.round((timeOfDay - Math.floor(timeOfDay)) * 60) % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** Section shell: icon + heading + rule, matching the mockup's grouping. */
function PanelSection({
  title,
  icon,
  aside,
  children,
}: {
  title: string;
  icon: 'sun' | 'chart' | 'volume';
  aside?: React.ReactNode;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <section className="border-t border-line-subtle pt-5 first:border-t-0 first:pt-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-small font-semibold uppercase tracking-[0.08em] text-fg-secondary">
          <Icon name={icon} size={16} className="text-accent-400" />
          {title}
        </h3>
        {aside}
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

export function GardenSettingsPanel({
  open,
  onClose,
  fps,
  dpr,
}: {
  open: boolean;
  onClose: () => void;
  fps: number;
  dpr: number;
}): React.ReactNode {
  const { settings, setSettings } = useGardenSettings();
  const [draft, setDraft] = useState<GardenSettings>(settings);
  const small = useIsSmallScreen();
  const reduced = useReducedMotion();
  const panelRef = useOverlay(open && !small, onClose);
  const titleId = useId();

  // The draft is re-seeded from storage every time the panel opens, so a cancelled edit never leaks
  // into the next open.
  useEffect(() => {
    if (open) setDraft(settings);
  }, [open, settings]);

  const patch = (changes: Partial<GardenSettings>) => setDraft((prev) => ({ ...prev, ...changes }));
  const apply = () => {
    setSettings(draft);
    onClose();
  };

  const body = (
    <div className="flex flex-col gap-5">
      <PanelSection
        title="Ambience"
        icon="sun"
        aside={<span className="mono-label">Device-local</span>}
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <label htmlFor="garden-time-of-day" className="text-small text-fg-secondary">
              Time of day
            </label>
            <span className="font-mono text-micro uppercase text-accent-400">
              {clockLabel(draft.timeOfDay)}
            </span>
          </div>
          {/*
            Day/night arc: a half-circle with the sun and moon at its ends and a marker whose position
            is the slider value. The marker uses an inline percentage because it is dynamic - the one
            documented exception to the no-inline-style rule.
          */}
          <div className="relative flex items-end justify-between">
            <Icon name="sun" size={16} className="text-clay-400" />
            <div aria-hidden="true" className="relative mx-3 mb-0.5 h-6 flex-1">
              <span className="absolute inset-x-0 bottom-0 block h-6 rounded-t-full border-x border-t border-line-strong" />
              <span
                className="absolute bottom-0 block size-2 -translate-x-1/2 rounded-full bg-accent-500 ring-2 ring-accent-glow"
                style={{
                  left: `${(draft.timeOfDay / 24) * 100}%`,
                  bottom: `${Math.round(Math.sin((draft.timeOfDay / 24) * Math.PI) * 20)}px`,
                }}
              />
            </div>
            <Icon name="moon" size={16} className="text-fg-muted" />
          </div>
          <input
            id="garden-time-of-day"
            type="range"
            min={0}
            max={24}
            step={5 / 60}
            value={draft.timeOfDay}
            onChange={(event) => patch({ timeOfDay: Number(event.target.value) })}
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-bg-hover accent-accent-500"
          />
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-small text-fg-secondary">Season</span>
          <SegmentedControl
            options={SEASONS}
            value={draft.season}
            onChange={(value) => patch({ season: value as GardenSettings['season'] })}
          />
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-small text-fg-secondary">Weather</span>
          <div className="flex flex-wrap gap-2">
            {WEATHER.map((option) => (
              <FilterChip
                key={option.value}
                active={draft.weather === option.value}
                onClick={() => patch({ weather: option.value })}
              >
                <Icon name={option.icon} size={13} />
                {option.label}
              </FilterChip>
            ))}
          </div>
        </div>
      </PanelSection>

      <PanelSection title="Performance" icon="chart" aside={<span className="mono-label">{`${fps} FPS · DPR ${dpr}`}</span>}>
        <div className="flex flex-col gap-2">
          <span className="text-small text-fg-secondary">Quality</span>
          <SegmentedControl
            options={QUALITY}
            value={draft.quality}
            onChange={(value) => patch({ quality: value as GardenSettings['quality'] })}
          />
        </div>
        <Checkbox
          label="Soft shadows"
          hint="Higher quality multiplies the shadow map resolution."
          checked={draft.shadows}
          onChange={(event) => patch({ shadows: event.target.checked })}
        />
      </PanelSection>

      <PanelSection
        title="Sound"
        icon="volume"
        aside={draft.ambientAudio ? <Chip tone="accent">On</Chip> : undefined}
      >
        <Checkbox
          label="Ambient audio"
          checked={draft.ambientAudio}
          onChange={(event) => patch({ ambientAudio: event.target.checked })}
        />
        {draft.ambientAudio && (
          // Honest state, not a fake player: no ambient track ships with this project, so the toggle
          // records the preference and says so instead of pretending to play something.
          <p className="mono-label text-warning">
            No ambient track is bundled with this build - the toggle records your preference.
          </p>
        )}
        <div className="flex items-center gap-3">
          <label htmlFor="garden-volume" className="text-small text-fg-secondary">
            Volume
          </label>
          <input
            id="garden-volume"
            type="range"
            min={0}
            max={1}
            step={0.05}
            disabled={!draft.ambientAudio}
            value={draft.volume}
            onChange={(event) => patch({ volume: Number(event.target.value) })}
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-bg-hover accent-accent-500 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <span className="font-mono text-micro text-fg-muted">{Math.round(draft.volume * 100)}</span>
        </div>
      </PanelSection>
    </div>
  );

  const footer = (
    <div className="flex items-center justify-between gap-2">
      <Button
        variant="ghost"
        iconLeft="refresh"
        onClick={() => setDraft(DEFAULT_GARDEN_SETTINGS)}
      >
        Reset defaults
      </Button>
      <Button iconLeft="check" onClick={apply}>
        Apply
      </Button>
    </div>
  );

  // Mobile: the Drawer primitive already provides the bottom-sheet form, focus trap and scroll lock.
  if (small) {
    return (
      <Drawer open={open} onClose={onClose} title="Garden settings" footer={footer} width={520}>
        {body}
      </Drawer>
    );
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <motion.div
            className="absolute inset-0 bg-[rgba(5,8,6,0.72)] backdrop-blur-[8px]"
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduced ? undefined : { opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.18 }}
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0, y: 8 }}
            transition={{ duration: reduced ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
            onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => trapTab(event, panelRef)}
            className={cn(
              'relative flex max-h-[calc(100vh-4rem)] w-full max-w-[520px] flex-col overflow-hidden',
              'rounded-panel border border-line-strong bg-bg-raised shadow-l2 focus-visible:outline-none',
            )}
          >
            <div className="flex items-center justify-between gap-3 border-b border-line-subtle px-6 py-4">
              <h2 id={titleId} className="text-h3 text-fg">
                Garden settings
              </h2>
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="rounded-btn p-1.5 text-fg-muted transition-colors duration-100 ease-base hover:bg-bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
              >
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{body}</div>
            <div className="border-t border-line-subtle px-6 py-4">{footer}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
