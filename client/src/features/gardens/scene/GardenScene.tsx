/**
 * The WebGL garden surface. This module (and `PlantMesh`, `Ground`, `procedural`) is the ONLY place
 * `@react-three/fiber` / `@react-three/drei` are imported, so the 3D bundle cannot leak into the rest
 * of the app - `App.tsx` lazy-loads the garden pages and this file is only reachable from them.
 *
 * Rendering contract:
 *  - `dpr={[1, 1.5]}` caps device pixel ratio at 1.5 (build spec section 3).
 *  - `frameloop="demand"`: the renderer draws only when something calls `invalidate()`, so an idle
 *    garden costs no GPU time. OrbitControls already invalidates on camera change; pointer events and
 *    prop updates invalidate through R3F itself; the idle drift below invalidates on a throttled timer.
 *  - plants are procedural meshes - no GLB loader exists because no seeded plant has a `modelUrl`.
 */
import { Suspense, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Vector3 } from 'three';
import { Link } from 'react-router-dom';
import { Icon } from '@/components/icons';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import type { GardenSettings } from '@/types/api';
import { GARDEN_GRID, type GardenPlotDetail, type PlotPlant } from '../hooks';
import { Ground, HoveredTile, ambienceFor, type TileCoord } from './Ground';
import { PlantMesh } from './PlantMesh';
import type { QualityLevel } from './procedural';

/** Bed size in world units. One unit is one tile, so a plant's coordinates map 1:1 to the grid. */
const GROUND_SIZE = GARDEN_GRID;
/** Throttle for the idle drift: ~11fps of redraws keeps the idle cost near zero. */
const DRIFT_INTERVAL_MS = 90;
const CAMERA_START = [4.4, 3.6, 5.4] as const;

/**
 * A real probe, not a feature guess: the app must not mount a Canvas the browser cannot back. Headless
 * or software-rendered browsers (`--disable-gpu`, remote desktops) return null here, and the garden
 * then renders the list fallback instead of a black rectangle.
 */
function supportsWebGL2(): boolean {
  try {
    const probe = document.createElement('canvas');
    return Boolean(probe.getContext('webgl2'));
  } catch {
    return false;
  }
}

/** Canvas-shaped placeholder shown while the lazy boundary resolves the scene graph. */
function CanvasSkeleton({ className }: { className?: string }): React.ReactNode {
  return (
    <div
      role="status"
      aria-label="Loading the garden"
      className={cn('flex size-full items-center justify-center bg-bg-sunken', className)}
    >
      <div className="flex flex-col items-center gap-3">
        <Skeleton variant="card" width={280} height={160} />
        <Skeleton width={140} height={12} />
      </div>
    </div>
  );
}

/** Grid tile -> world position at the tile centre. Plots are authored against this mapping. */
function tileWorldPosition(tile: TileCoord, gridSize: number): [number, number, number] {
  const unit = GROUND_SIZE / gridSize;
  return [-GROUND_SIZE / 2 + unit * (tile.x + 0.5), 0, -GROUND_SIZE / 2 + unit * (tile.z + 0.5)];
}

/**
 * Projects the selected plant's crown into screen space for the HUD card. Runs inside `useFrame`
 * because only the canvas knows the live camera matrix; the last emitted point is cached so an
 * unchanged projection does not re-render the parent every frame.
 */
function SelectionProjector({
  position,
  onProject,
}: {
  position: [number, number, number] | null;
  onProject: (point: { x: number; y: number } | null) => void;
}): null {
  const last = useRef<{ x: number; y: number } | null>(null);

  useFrame(({ camera, size }) => {
    if (!position) {
      if (last.current !== null) {
        last.current = null;
        onProject(null);
      }
      return;
    }
    const projected = new Vector3(position[0], position[1] + 0.55, position[2]).project(camera);
    const point = {
      x: Math.round((projected.x * 0.5 + 0.5) * size.width),
      y: Math.round((-projected.y * 0.5 + 0.5) * size.height),
    };
    if (last.current?.x === point.x && last.current?.y === point.y) return;
    last.current = point;
    onProject(point);
  });

  return null;
}

/** The imperative handle a parent needs to re-frame the bed; see the `resetViewRef` note below. */
export type ResetViewHandle = MutableRefObject<(() => void) | null>;

/** Camera controls + the idle drift. Kept together because both act on the same controls instance. */
function SceneControls({
  resetViewRef,
  driftEnabled,
  idleAnimation,
}: {
  resetViewRef?: ResetViewHandle;
  driftEnabled: boolean;
  /** Keeps the demand loop ticking so plant sway animates even when the camera drift is off. */
  idleAnimation: boolean;
}): React.ReactNode {
  const controlsRef = useRef<React.ComponentRef<typeof OrbitControls> | null>(null);
  const { invalidate } = useThree();

  // The reset handler re-frames via the controls' saved state. A ref is the only channel: the controls
  // instance lives inside the canvas tree, while the HUD button lives in the DOM.
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    controls.saveState();
    if (resetViewRef) {
      resetViewRef.current = () => {
        controls.reset();
        invalidate();
      };
    }
    return () => {
      if (resetViewRef) resetViewRef.current = null;
    };
  }, [resetViewRef, invalidate]);

  // Idle drift is presentation only and is skipped under prefers-reduced-motion (the caller passes
  // `driftEnabled={false}`), so no camera motion happens for users who asked for none. The interval
  // only invalidates the demand loop; `autoRotate` is advanced by the controls' own frame update.
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    controls.autoRotate = driftEnabled;
    controls.autoRotateSpeed = 0.35;
    // The demand loop must tick while anything animates: the camera drift, or the plant sway.
    if (!driftEnabled && !idleAnimation) return;
    const timer = window.setInterval(() => invalidate(), DRIFT_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [driftEnabled, idleAnimation, invalidate]);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      // Limited orbit: the bed is viewed like a diorama, never from underneath or from far out.
      minDistance={4.5}
      maxDistance={13}
      minPolarAngle={0.35}
      maxPolarAngle={Math.PI / 2.35}
      enablePan={false}
      target={[0, 0.3, 0]}
    />
  );
}

export function GardenScene({
  plots,
  gridSize = GARDEN_GRID,
  mode = 'view',
  selectedPlotId,
  onSelectPlot,
  hoveredTile,
  onHoverTile,
  onTileClick,
  onClearSelection,
  ghostPlant,
  settings,
  className,
  resetViewRef,
  onProjectSelected,
  reducedMotion = false,
}: {
  plots: GardenPlotDetail[];
  gridSize?: number;
  mode?: 'view' | 'place';
  selectedPlotId?: string;
  onSelectPlot?: (plotId: string) => void;
  hoveredTile?: TileCoord | null;
  onHoverTile?: (tile: TileCoord | null) => void;
  onTileClick?: (tile: TileCoord) => void;
  onClearSelection?: () => void;
  ghostPlant?: PlotPlant | null;
  settings: GardenSettings;
  className?: string;
  resetViewRef?: ResetViewHandle;
  onProjectSelected?: (point: { x: number; y: number } | null) => void;
  /** `prefers-reduced-motion`: disables the idle camera drift. */
  reducedMotion?: boolean;
}): React.ReactNode {
  const [webglAvailable] = useState(supportsWebGL2);
  const [internalHover, setInternalHover] = useState<TileCoord | null>(null);
  const ambience = useMemo(
    () => ambienceFor(settings.timeOfDay, settings.season, settings.weather),
    [settings.timeOfDay, settings.season, settings.weather],
  );
  const quality: QualityLevel = settings.quality;
  // The `hoveredTile` prop is a controlled override; without it the canvas still highlights the tile.
  const activeHover = hoveredTile === undefined ? internalHover : hoveredTile;

  const selectedPosition = useMemo<[number, number, number] | null>(() => {
    const plot = plots.find((candidate) => candidate._id === selectedPlotId);
    if (!plot) return null;
    const [x, , z] = tileWorldPosition({ x: plot.x, z: plot.z }, gridSize);
    return [x, 0.35, z];
  }, [plots, selectedPlotId, gridSize]);

  const handleHoverTile = (tile: TileCoord | null) => {
    setInternalHover(tile);
    onHoverTile?.(tile);
  };

  if (!webglAvailable) {
    // No WebGL2: explain it and offer the garden list as the way forward, rather than a dead canvas.
    return (
      <div className={cn('flex size-full items-center justify-center bg-bg-sunken', className)}>
        <ErrorState
          title="This browser cannot render the 3D garden"
          message="WebGL2 is unavailable here, so the walkable garden cannot be drawn. Your gardens, plants and notes are unaffected - open the garden list to browse and manage them."
        >
          <Link
            to="/gardens"
            className="inline-flex h-11 items-center gap-2 rounded-btn border border-line-strong px-4 text-body font-semibold text-fg transition duration-[120ms] ease-base hover:-translate-y-px hover:bg-bg-hover"
          >
            <Icon name="list" size={18} />
            Open the garden list
          </Link>
        </ErrorState>
      </div>
    );
  }

  return (
    <Suspense fallback={<CanvasSkeleton className={className} />}>
      <Canvas
        className={className}
        dpr={[1, 1.5]}
        shadows={settings.shadows}
        // Static frames only: nothing renders until an interaction or prop change invalidates the loop.
        frameloop="demand"
        camera={{ position: [CAMERA_START[0], CAMERA_START[1], CAMERA_START[2]], fov: 42, near: 0.1, far: 60 }}
        gl={{ antialias: quality !== 'low', powerPreference: 'high-performance' }}
        onPointerMissed={() => onClearSelection?.()}
      >
        <color attach="background" args={[ambience.background]} />
        {/* Low ambient + warm key + accent-green rim (DESIGN.md imagery rule). Fog keeps the bed from
            ending in a hard edge against the background. */}
        <ambientLight intensity={ambience.ambientIntensity} color={ambience.rimColor} />
        <hemisphereLight
          intensity={ambience.hemisphereIntensity}
          color={ambience.keyColor}
          groundColor={ambience.rimColor}
        />
        <directionalLight
          castShadow={settings.shadows}
          position={[4.5, 7, 3.5]}
          intensity={ambience.keyIntensity}
          color={ambience.keyColor}
          shadow-mapSize-width={quality === 'high' ? 1024 : 512}
          shadow-mapSize-height={quality === 'high' ? 1024 : 512}
        />
        {/* Accent rim from behind: the green edge that ties the scene to the palette. */}
        <directionalLight position={[-5, 2.2, -4.2]} intensity={ambience.rimIntensity} color={ambience.rimColor} />

        <Suspense fallback={null}>
          <group position={[0, 0, 0]}>
            <Ground
              size={GROUND_SIZE}
              gridSize={gridSize}
              // The grid is a placement affordance; in view mode the bed stays clean.
              showGrid={mode === 'place'}
              onTileHover={handleHoverTile}
              onTileClick={mode === 'place' ? onTileClick : undefined}
              quality={quality}
              shadows={settings.shadows}
              weather={settings.weather}
              timeOfDay={settings.timeOfDay}
              season={settings.season}
            />

            {activeHover && mode === 'place' && (
              <HoveredTile tile={activeHover} size={GROUND_SIZE} gridSize={gridSize} quality={quality} />
            )}

            {plots.map((plot) => {
              if (!plot.plantId) return null;
              const [x, , z] = tileWorldPosition({ x: plot.x, z: plot.z }, gridSize);
              return (
                <PlantMesh
                  key={plot._id}
                  plant={plot.plantId}
                  position={[x, 0, z]}
                  stage={plot.stage}
                  quality={quality}
                  isSelected={plot._id === selectedPlotId}
                  onSelect={mode === 'view' ? () => onSelectPlot?.(plot._id) : undefined}
                />
              );
            })}

            {mode === 'place' && ghostPlant && activeHover && (
              // Placement ghost: translucent, unselectable, sitting exactly on the targeted tile.
              <PlantMesh
                plant={ghostPlant}
                position={tileWorldPosition(activeHover, gridSize)}
                stage="mature"
                quality={quality}
                ghost
              />
            )}
          </group>
        </Suspense>

        <SceneControls
          resetViewRef={resetViewRef}
          driftEnabled={mode === 'view' && !selectedPlotId && !reducedMotion}
          idleAnimation={plots.length > 0 && !reducedMotion}
        />
        {onProjectSelected && (
          <SelectionProjector position={selectedPosition} onProject={onProjectSelected} />
        )}
      </Canvas>
    </Suspense>
  );
}
