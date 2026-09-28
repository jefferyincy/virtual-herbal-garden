/**
 * Data layer for the 3D garden feature.
 *
 * Every network call goes through `api` - no component in this feature fetches directly. Keys that
 * the rest of the app also reads (`queryKeys.gardens`, `queryKeys.garden(id)`,
 * `queryKeys.publicGarden(slug)`, `queryKeys.plants`) come from `lib/query.ts`; the page-scoped
 * variants below are composed from those prefixes so one invalidation reaches every reader.
 *
 * Ambience (time of day, season, weather, quality, shadows, sound) is DEVICE-LOCAL, never server
 * state: `PATCH /api/gardens/:id` is `.strict()` and accepts only `name` / `isPublic`, so the
 * settings live in `localStorage` under `vhg:garden-settings` and are validated on read.
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query';
import type {
  Garden,
  GardenPlot,
  GardenSettings,
  Paginated,
  Plant,
  Toxicity,
} from '@/types/api';

/* ------------------------------------------------------------------ response shapes */

/** A `/api/gardens` list row. The list deliberately omits `plots`; it carries `plantCount`. */
export interface GardenListRow {
  _id: string;
  name: string;
  slug: string;
  isPublic: boolean;
  plantCount: number;
  thumbnails: string[];
  lastVisitedAt: string | null;
  createdAt: string;
}

/**
 * A plant as the garden routes populate `plots[].plantId` (server `PLANT_PLOT_FIELDS`). The shared
 * `Garden` type only models the unpopulated id, so the populated contract is declared here.
 */
export type PlotPlant = Pick<
  Plant,
  | '_id'
  | 'slug'
  | 'commonName'
  | 'botanicalName'
  | 'family'
  | 'images'
  | 'modelUrl'
  | 'modelScale'
  | 'toxicity'
>;

/** A plot with its plant resolved; `null` when the plant no longer exists in the catalogue. */
export type GardenPlotDetail = Omit<GardenPlot, 'plantId'> & { plantId: PlotPlant | null };

/** `GET /api/gardens/:idOrSlug` returns the garden with populated plots. */
export type GardenDetail = Omit<Garden, 'plots'> & { plots: GardenPlotDetail[] };

export type PlotStage = GardenPlot['stage'];

/** The stripped plant projection served to anonymous visitors by `/api/g/:slug`. */
export interface PublicGardenPlant {
  slug: string;
  commonName: string;
  botanicalName: string;
  family: string;
  image: string | null;
  toxicity: Toxicity;
}

export interface PublicGardenPlot {
  id: string;
  x: number;
  z: number;
  stage: PlotStage;
  /** Always null today: no curated-note field exists server-side yet. */
  curatedNote: string | null;
  plant: PublicGardenPlant | null;
}

export interface PublicGardenPayload {
  garden: {
    name: string;
    slug: string;
    isPublic: boolean;
    plantCount: number;
    plots: PublicGardenPlot[];
  };
  owner: { name: string; handle: string } | null;
}

/* ------------------------------------------------------------------ cache keys */

/**
 * The grid is 6x6 with integer tiles 0..5 (server `GARDEN_GRID`). This constant, `isTileFree` and
 * `GARDEN_MAX_PLOTS` are the client's single source of truth for the placement rule.
 */
export const GARDEN_GRID = 6;
export const GARDEN_MAX_PLOTS = GARDEN_GRID * GARDEN_GRID;

/** One plant per tile. Mirrors the server's "That plot is already planted" 409. */
export function isTileFree(
  plots: ReadonlyArray<Pick<GardenPlot, 'x' | 'z'>>,
  x: number,
  z: number,
): boolean {
  return !plots.some((plot) => plot.x === x && plot.z === z);
}

const gardenKeys = {
  list: (page: number) => [queryKeys.gardens[0], 'list', page] as const,
  /** List-only prefix: invalidating it never refetches a garden detail. */
  listRoot: [queryKeys.gardens[0], 'list'] as const,
  detail: (id: string) => queryKeys.garden(id),
  palette: [queryKeys.plants[0], 'garden-palette'] as const,
};

/* ------------------------------------------------------------------ queries */

export function useGardens(page = 1) {
  return useQuery({
    queryKey: gardenKeys.list(page),
    queryFn: ({ signal }) =>
      api.get<Paginated<GardenListRow>>('/gardens', { query: { page }, signal }),
  });
}

export function useGarden(idOrSlug: string | undefined) {
  const id = idOrSlug ?? '';
  return useQuery({
    queryKey: gardenKeys.detail(id),
    enabled: Boolean(id),
    queryFn: ({ signal }) => api.get<{ garden: GardenDetail }>(`/gardens/${id}`, { signal }),
  });
}

export function usePublicGarden(slug: string | undefined) {
  const key = slug ?? '';
  return useQuery({
    queryKey: queryKeys.publicGarden(key),
    enabled: Boolean(key),
    queryFn: ({ signal }) => api.get<PublicGardenPayload>(`/g/${key}`, { signal }),
  });
}

/** The placement palette: the first 50 plants, which is the whole seeded catalogue. */
export function usePlaceablePlants() {
  return useQuery({
    queryKey: gardenKeys.palette,
    queryFn: ({ signal }) => api.get<Paginated<Plant>>('/plants', { query: { pageSize: 50 }, signal }),
  });
}

/* ------------------------------------------------------------------ mutations */

export function useCreateGarden() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; isPublic?: boolean }) =>
      api.post<{ garden: Garden }>('/gardens', input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.gardens });
    },
  });
}

export function usePlantPlot(gardenId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { x: number; z: number; plantId: string }) =>
      api.post<{ plot: GardenPlotDetail | null; plots: GardenPlotDetail[] }>(
        `/gardens/${gardenId}/plots`,
        input,
      ),
    onSuccess: (data) => {
      // The route answers with the created plot plus the whole re-rendered plot grid (`plots`), not
      // a garden envelope, so the cached detail is rebuilt around the existing garden fields. The
      // list row's `plantCount` changed, so only the list prefix is invalidated.
      client.setQueryData<{ garden: GardenDetail } | undefined>(
        gardenKeys.detail(gardenId),
        (previous) => (previous ? { garden: { ...previous.garden, plots: data.plots } } : previous),
      );
      void client.invalidateQueries({ queryKey: gardenKeys.listRoot });
    },
    // No handler for failures on purpose. A 409 means another session took the tile: the server is
    // authoritative, the caches are left untouched, and the mutation rejects so the caller can show
    // the conflict and re-read the garden.
  });
}

export function useRemovePlot(gardenId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (plotId: string) => api.del<void>(`/gardens/${gardenId}/plots/${plotId}`),
    onSuccess: (_data, plotId) => {
      // A 204 carries no body, and the removed plot is known exactly, so the detail cache is
      // edited in place rather than refetched.
      client.setQueryData<{ garden: GardenDetail } | undefined>(
        gardenKeys.detail(gardenId),
        (previous) =>
          previous
            ? {
                garden: {
                  ...previous.garden,
                  plots: previous.garden.plots.filter((plot) => plot._id !== plotId),
                },
              }
            : previous,
      );
      void client.invalidateQueries({ queryKey: gardenKeys.listRoot });
    },
  });
}

/** Fire-and-forget visit stamp. Callers MUST invoke it once per garden per mount. */
export function useVisitGarden() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (gardenId: string) => api.post<void>(`/gardens/${gardenId}/visit`),
    // Only the list moves (its "visited" line and the ACTIVE chip). Invalidating the whole
    // `['gardens']` prefix here would refetch the garden the page just loaded.
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: gardenKeys.listRoot });
    },
  });
}

export function useDeleteGarden() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (gardenId: string) => api.del<void>(`/gardens/${gardenId}`),
    onSuccess: (_data, gardenId) => {
      client.removeQueries({ queryKey: gardenKeys.detail(gardenId) });
      void client.invalidateQueries({ queryKey: queryKeys.gardens });
    },
  });
}

/** Rename / visibility. `PATCH` accepts only `{name?, isPublic?}` and rejects anything else. */
export function useUpdateGarden() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...changes }: { id: string; name?: string; isPublic?: boolean }) =>
      api.patch<{ garden: GardenDetail }>(`/gardens/${id}`, changes),
    onSuccess: (data, variables) => {
      client.setQueryData(gardenKeys.detail(variables.id), { garden: data.garden });
      void client.invalidateQueries({ queryKey: gardenKeys.listRoot });
    },
  });
}

/* ------------------------------------------------------------------ device-local ambience */

const SETTINGS_STORAGE_KEY = 'vhg:garden-settings';

/** Documented fallbacks, used when storage is empty, unavailable, or holds a corrupt value. */
export const DEFAULT_GARDEN_SETTINGS: GardenSettings = {
  // 18:40 - the mockup's twilight, and a 5-minute step boundary on the panel's slider.
  timeOfDay: 18 + 40 / 60,
  season: 'spring',
  weather: 'clear',
  quality: 'high',
  shadows: true,
  ambientAudio: false,
  volume: 0.4,
};

/** Mirrors `GardenSettings`. Unknown keys are ignored; a missing or mistyped one falls back. */
const gardenSettingsSchema = z.object({
  timeOfDay: z.number().min(0).max(24),
  season: z.enum(['spring', 'summer', 'monsoon', 'winter']),
  weather: z.enum(['clear', 'rain', 'mist']),
  quality: z.enum(['low', 'medium', 'high']),
  shadows: z.boolean(),
  ambientAudio: z.boolean(),
  volume: z.number().min(0).max(1),
});

let settingsCache: GardenSettings | null = null;
const settingsListeners = new Set<() => void>();

/**
 * Validate a stored value, falling back to the documented defaults when it is missing, unreadable or
 * corrupt. Exported because it is the whole contract of `vhg:garden-settings` and is exercised
 * directly; `readStoredSettings` wraps it with the storage read and the module cache.
 */
export function parseGardenSettings(raw: string | null): GardenSettings {
  if (!raw) return DEFAULT_GARDEN_SETTINGS;
  try {
    const parsed = gardenSettingsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_GARDEN_SETTINGS;
  } catch {
    // Corrupt JSON (truncated write, hand-edited value): keep the documented defaults.
    return DEFAULT_GARDEN_SETTINGS;
  }
}

/** Reads and validates once, then serves the same object until a write replaces it. */
function readStoredSettings(): GardenSettings {
  if (settingsCache) return settingsCache;
  if (typeof window === 'undefined') {
    settingsCache = DEFAULT_GARDEN_SETTINGS;
    return settingsCache;
  }
  try {
    settingsCache = parseGardenSettings(window.localStorage.getItem(SETTINGS_STORAGE_KEY));
  } catch {
    // Storage unreadable (private mode, blocked cookies): keep the documented defaults.
    settingsCache = DEFAULT_GARDEN_SETTINGS;
  }
  return settingsCache;
}

function writeSettings(next: GardenSettings): void {
  settingsCache = next;
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked: the in-memory value still drives this session.
  }
  for (const listener of settingsListeners) listener();
}

function subscribeSettings(listener: () => void): () => void {
  settingsListeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== SETTINGS_STORAGE_KEY) return;
    settingsCache = null;
    readStoredSettings();
    listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    settingsListeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function useGardenSettings(): {
  settings: GardenSettings;
  setSettings: (next: GardenSettings) => void;
  reset: () => void;
} {
  const settings = useSyncExternalStore(
    subscribeSettings,
    readStoredSettings,
    () => DEFAULT_GARDEN_SETTINGS,
  );
  const setSettings = useCallback((next: GardenSettings) => writeSettings(next), []);
  const reset = useCallback(() => writeSettings(DEFAULT_GARDEN_SETTINGS), []);
  return useMemo(() => ({ settings, setSettings, reset }), [settings, setSettings, reset]);
}

/* ------------------------------------------------------------------ measurement */

/**
 * Measures the real frame cadence over a sliding 1s window. The HUD's FPS readout must never be a
 * hardcoded number; when the tab is hidden the browser stops the loop and the last value stands.
 */
export function useFrameRate(): number {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    let handle = 0;
    let frames = 0;
    let windowStart = performance.now();
    const tick = (now: number) => {
      frames += 1;
      const elapsed = now - windowStart;
      if (elapsed >= 1000) {
        setFps(Math.round((frames * 1000) / elapsed));
        frames = 0;
        windowStart = now;
      }
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    // Cancelled on unmount: the garden routes swap surfaces often and a stray loop would keep
    // waking the browser.
    return () => cancelAnimationFrame(handle);
  }, []);
  return fps;
}

/** The DPR the canvas is allowed to use - `<Canvas dpr={[1, 1.5]}>` caps it at 1.5. */
export function useRendererDpr(): number {
  const read = useCallback(
    () => (typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, 1.5)),
    [],
  );
  const [dpr, setDpr] = useState(read);
  useEffect(() => {
    const onResize = () => setDpr(read());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [read]);
  return dpr;
}
