/**
 * The soil bed: one raycast target for tile picking plus the presentation layers that make the grid
 * readable (grid lines, hovered tile, target rim) and the weather dressing.
 *
 * PRESENTATION ONLY. Nothing in this file is persisted or sent to the server: ambience is
 * device-local (`GardenSettingsPanel`) and the server refuses extra fields on a garden anyway, so
 * weather, season and time of day change pixels and never stored garden data.
 */
import { useEffect, useMemo } from 'react';
import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute, PlaneGeometry } from 'three';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import type { GardenSettings } from '@/types/api';
import type { QualityLevel } from './procedural';

/** A grid tile. `x`/`z` are integers inside `0..gridSize-1`, matching the server's 6x6 rule. */
export type TileCoord = { x: number; z: number };

export type WeatherKind = GardenSettings['weather'];
export type SeasonKind = GardenSettings['season'];

/** Background tint behind the scene. Never pure black (DESIGN.md): the darkest is bg-sunken. */
const NIGHT_BACKGROUND = 0x070a08;
const DAY_BACKGROUND = 0x101713;

/** Warm key light through the day (clay-family warmth) and the accent-green rim from DESIGN.md. */
const KEY_NIGHT = 0xd9845f;
const KEY_DAY = 0xf2ddba;
/** Overcast key: a cool grey, so rain/storm reads as dull daylight rather than a lit scene. */
const KEY_OVERCAST = 0xb9c4bd;
const RIM_COLOR = 0x7be0a8;
/** Rain streak tint: cool and desaturated so it reads as water, not the accent green. */
const RAIN_COLOR = 0x9fb8c8;
const TILE_LIGHT = 0x1d2821;
const TILE_DARK = 0x131a15;
/** Lawn and bed-border tones: green-family, kept dark so the bed stays the focal surface. */
const LAWN_COLOR = 0x15211a;
const BORDER_COLOR = 0x2b3a30;
/** Overcast backgrounds: a desaturated cool grey, slightly darker than the clear-sky twins. */
const OVERCAST_NIGHT_BACKGROUND = 0x080b0a;
const OVERCAST_DAY_BACKGROUND = 0x151b19;

/** Season modifiers on top of the time-of-day curve. Presentation only. */
const SEASON_MULTIPLIER: Record<SeasonKind, { key: number; ambient: number; saturation: number }> = {
  spring: { key: 1, ambient: 1, saturation: 1 },
  summer: { key: 1.18, ambient: 1.06, saturation: 1.08 },
  monsoon: { key: 0.82, ambient: 0.92, saturation: 0.9 },
  winter: { key: 0.9, ambient: 1.12, saturation: 0.82 },
};

export type GardenAmbience = {
  background: number;
  keyColor: number;
  keyIntensity: number;
  rimColor: number;
  rimIntensity: number;
  ambientIntensity: number;
  hemisphereIntensity: number;
};

/**
 * Derived (not stored) so the light rig and the canvas background always agree and cannot drift
 * apart from `timeOfDay`. `weather` only tints and dims: rain/mist are overcast (cooler, greyer,
 * lower contrast) while clear keeps the warm key and the time-of-day sky.
 */
export function ambienceFor(timeOfDay: number, season: SeasonKind, weather: WeatherKind = 'clear'): GardenAmbience {
  const hour = ((timeOfDay % 24) + 24) % 24;
  // Sun is up between 06:00 and 18:00; the curve peaks at midday.
  const daylight = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));
  const scale = SEASON_MULTIPLIER[season];
  // Overcast factor: mist is the softest, rain the heaviest, clear the baseline.
  const overcast = weather === 'rain' ? 0.85 : weather === 'mist' ? 0.55 : 0;

  const keyColor = new Color(KEY_NIGHT)
    .lerp(new Color(KEY_DAY), daylight * scale.saturation)
    .lerp(new Color(KEY_OVERCAST), overcast);
  const background = new Color(NIGHT_BACKGROUND)
    .lerp(new Color(DAY_BACKGROUND), daylight * 0.85 * scale.saturation)
    .lerp(new Color(OVERCAST_DAY_BACKGROUND).lerp(new Color(OVERCAST_NIGHT_BACKGROUND), 1 - daylight), overcast);

  return {
    background: background.getHex(),
    keyColor: keyColor.getHex(),
    // Overcast diffuses the key light, so a rainy day is lit but flat, not bright.
    keyIntensity: (0.3 + daylight * 1.15) * scale.key * (1 - overcast * 0.35),
    rimColor: RIM_COLOR,
    // The rim is an accent, so it stays low even under a noon key light.
    rimIntensity: 0.3 + daylight * 0.25 * (1 - overcast * 0.5),
    ambientIntensity: (0.16 + daylight * 0.14) * scale.ambient * (1 + overcast * 0.5),
    hemisphereIntensity: (0.12 + daylight * 0.18) * scale.ambient * (1 + overcast * 0.4),
  };
}

/** Deterministic 0..1 from a tile coordinate, so the soil speckle never flickers between renders. */
function tileNoise(x: number, z: number): number {
  const value = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

/** Decompose a ground-plane world position into a tile, or null when outside the grid. */
function tileAt(worldX: number, worldZ: number, size: number, gridSize: number): TileCoord | null {
  const tile = size / gridSize;
  const x = Math.floor((worldX + size / 2) / tile);
  const z = Math.floor((worldZ + size / 2) / tile);
  if (x < 0 || z < 0 || x >= gridSize || z >= gridSize) return null;
  return { x, z };
}

/**
 * The soil bed as ONE subdivided plane with per-vertex colour and a little height ripple. The tiles
 * are a placement overlay, not the geometry: the bed itself should read as turned earth, so it has
 * no visible square seams when the grid is hidden. Still a single draw call, and the same mesh is the
 * raycast target for tile picking.
 */
function soilBedGeometry(size: number, segments = 48): BufferGeometry {
  const geometry = new PlaneGeometry(size, size, segments, segments).toNonIndexed();
  const position = geometry.getAttribute('position');
  const colors: number[] = [];
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    // Low-frequency ripple: a few broad mounds rather than per-vertex noise, so it reads as soil.
    const ripple = Math.sin(x * 1.3) * Math.cos(y * 1.1) * 0.012 + tileNoise(x * 2.1, y * 2.3) * 0.006;
    position.setZ(index, ripple);
    // Shade each vertex between the soil tones, softened further by the ripple.
    const shade = new Color(TILE_DARK).lerp(new Color(TILE_LIGHT), 0.35 + ripple * 12 + tileNoise(x * 5, y * 5) * 0.3);
    colors.push(shade.r, shade.g, shade.b);
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

/** Accent grid lines as one LineSegments geometry, so the overlay is a single draw call. */
function gridLineGeometry(size: number, gridSize: number): BufferGeometry {
  const tile = size / gridSize;
  const positions: number[] = [];
  for (let index = 0; index <= gridSize; index += 1) {
    const offset = -size / 2 + tile * index;
    positions.push(offset, 0, -size / 2, offset, 0, size / 2);
    positions.push(-size / 2, 0, offset, size / 2, 0, offset);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  return geometry;
}

export function Ground({
  size,
  gridSize,
  showGrid,
  onTileHover,
  onTileClick,
  quality,
  shadows,
  weather,
  timeOfDay,
  season,
}: {
  size: number;
  gridSize: number;
  showGrid: boolean;
  onTileHover?: (tile: TileCoord | null) => void;
  onTileClick?: (tile: TileCoord) => void;
  quality: QualityLevel;
  shadows: boolean;
  weather: WeatherKind;
  timeOfDay: number;
  season: SeasonKind;
}): React.ReactNode {
  const soil = useMemo(() => soilBedGeometry(size), [size]);
  const grid = useMemo(
    () => (showGrid ? gridLineGeometry(size, gridSize) : null),
    [showGrid, size, gridSize],
  );
  const ambience = useMemo(
    () => ambienceFor(timeOfDay, season, weather),
    [timeOfDay, season, weather],
  );

  // Every memoised geometry holds GPU buffers, so it is released when swapped or unmounted.
  useEffect(
    () => () => {
      soil.dispose();
      grid?.dispose();
    },
    [soil, grid],
  );

  const handleMove = (event: ThreeEvent<PointerEvent>) => {
    onTileHover?.(tileAt(event.point.x, event.point.z, size, gridSize));
  };

  return (
    <group>
      {/* Lawn: an apron of grass under and around the bed, so the garden sits in a garden rather
          than floating on the void. Flat-shaded and slightly darker than the soil. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow={shadows}>
        <circleGeometry args={[size * 1.55, 48]} />
        <meshStandardMaterial color={LAWN_COLOR} roughness={0.98} metalness={0} />
      </mesh>

      {/* Bed border: a low rim marking the planted square against the lawn. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.006, 0]}>
        <ringGeometry args={[size * 0.5, size * 0.56, 64, 1]} />
        <meshStandardMaterial color={BORDER_COLOR} roughness={0.9} metalness={0} transparent opacity={0.9} />
      </mesh>

      <mesh
        geometry={soil}
        position={[0, 0.001, 0]}
        receiveShadow={shadows}
        onPointerMove={handleMove}
        onPointerDown={(event) => {
          const target = tileAt(event.point.x, event.point.z, size, gridSize);
          if (target) onTileClick?.(target);
        }}
        // Placement mode keeps the hovered tile as the selection: moving the pointer off the soil to
        // the bottom action bar must NOT clear it, or the "Place plant" button disables before it can
        // be clicked. View mode still clears so no highlight lingers after the pointer leaves the bed.
        onPointerOut={onTileClick ? undefined : () => onTileHover?.(null)}
      >
        <meshStandardMaterial vertexColors color="#ffffff" roughness={0.95} metalness={0} />
      </mesh>

      {grid && (
        <lineSegments geometry={grid} position={[0, 0.014, 0]}>
          <lineBasicMaterial color={RIM_COLOR} transparent opacity={0.16} depthWrite={false} />
        </lineSegments>
      )}

      {weather === 'mist' && (
        // Mist is one large low-opacity plane lifted above the bed, never a particle system.
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, size * 0.55, 0]}>
          <planeGeometry args={[size * 4, size * 4]} />
          <meshBasicMaterial
            color={ambience.background}
            transparent
            opacity={0.32}
            side={DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}

      {weather === 'rain' && <Rain size={size} quality={quality} />}
    </group>
  );
}

/**
 * Falling rain as thin streaks. Each streak is a two-vertex line segment tilted along the fall
 * direction, dropped and wrapped every frame, which reads as falling water far better than dots
 * (WebGL draws one-pixel lines, so the streaks stay hair-fine). `useFrame` keeps the demand loop
 * invalidated while it is mounted; switching weather off removes it and the garden idles again.
 */
function Rain({ size, quality }: { size: number; quality: QualityLevel }): React.ReactNode {
  const { invalidate } = useThree();
  const count = quality === 'low' ? 220 : quality === 'medium' ? 420 : 700;
  const top = size * 1.15;
  const streak = size * 0.05;

  const geometry = useMemo(() => {
    // Slight slant so the rain reads as wind-blown rather than a vertical curtain.
    const dir = [0.16, -1, 0.07];
    const norm = Math.hypot(dir[0] ?? 0, dir[1] ?? 0, dir[2] ?? 0) || 1;
    const dx = (dir[0] ?? 0) / norm;
    const dy = (dir[1] ?? 0) / norm;
    const dz = (dir[2] ?? 0) / norm;

    const positions = new Float32Array(count * 2 * 3);
    const speeds = new Float32Array(count);
    for (let index = 0; index < count; index += 1) {
      const x = (tileNoise(index, count) - 0.5) * size * 2.6;
      const z = (tileNoise(index * 3.1, count * 0.9) - 0.5) * size * 2.6;
      const y = tileNoise(index * 1.7, count * 0.5) * top;
      speeds[index] = 8 + tileNoise(index * 5.3, count) * 8;
      const base = index * 6;
      positions[base + 0] = x;
      positions[base + 1] = y;
      positions[base + 2] = z;
      positions[base + 3] = x - dx * streak;
      positions[base + 4] = y - dy * streak;
      positions[base + 5] = z - dz * streak;
    }
    const buffer = new BufferGeometry();
    buffer.setAttribute('position', new Float32BufferAttribute(positions, 3));
    return { buffer, positions, speeds, dx, dy, dz };
  }, [count, size, top, streak]);

  useEffect(() => () => geometry.buffer.dispose(), [geometry]);

  useFrame((_state, delta) => {
    const step = Math.min(delta, 0.05);
    const { positions, speeds, dx, dy, dz } = geometry;
    for (let index = 0; index < count; index += 1) {
      const base = index * 6;
      const head = (positions[base + 1] ?? 0) - (speeds[index] ?? 0) * step;
      const y = head < 0 ? head + top : head;
      const x = positions[base + 0] ?? 0;
      const z = positions[base + 2] ?? 0;
      positions[base + 1] = y;
      positions[base + 3] = x - dx * streak;
      positions[base + 4] = y - dy * streak;
      positions[base + 5] = z - dz * streak;
    }
    const attr = geometry.buffer.attributes.position;
    if (attr) attr.needsUpdate = true;
    invalidate();
  });

  return (
    <lineSegments geometry={geometry.buffer} frustumCulled={false}>
      <lineBasicMaterial color={RAIN_COLOR} transparent opacity={0.38} depthWrite={false} />
    </lineSegments>
  );
}

/**
 * The targeted tile: accent fill plus a soft rim. Rendered by the scene (not by `Ground`) because the
 * canvas also needs the hovered tile for the placement ghost and the HUD chip.
 */
export function HoveredTile({
  tile: hovered,
  size,
  gridSize,
  quality,
}: {
  tile: TileCoord;
  size: number;
  gridSize: number;
  quality: QualityLevel;
}): React.ReactNode {
  const tile = size / gridSize;
  const segments = quality === 'low' ? 6 : quality === 'medium' ? 16 : 32;
  // Colour is never the only signal, so the rim is paired with a filled tile and a labelled chip.
  return (
    <group
      position={[-size / 2 + tile * (hovered.x + 0.5), 0.02, -size / 2 + tile * (hovered.z + 0.5)]}
    >
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[tile, tile]} />
        <meshBasicMaterial color={RIM_COLOR} transparent opacity={0.16} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <ringGeometry args={[tile * 0.46, tile * 0.52, segments]} />
        <meshBasicMaterial
          color={RIM_COLOR}
          transparent
          opacity={0.6}
          side={DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
