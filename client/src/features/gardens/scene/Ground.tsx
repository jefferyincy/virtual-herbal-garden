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
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ThreeEvent } from '@react-three/fiber';
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
const RIM_COLOR = 0x7be0a8;
const TILE_LIGHT = 0x1d2821;
const TILE_DARK = 0x131a15;

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
 * apart from `timeOfDay`.
 */
export function ambienceFor(timeOfDay: number, season: SeasonKind): GardenAmbience {
  const hour = ((timeOfDay % 24) + 24) % 24;
  // Sun is up between 06:00 and 18:00; the curve peaks at midday.
  const daylight = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));
  const scale = SEASON_MULTIPLIER[season];
  const keyColor = new Color(KEY_NIGHT).lerp(new Color(KEY_DAY), daylight * scale.saturation);
  const background = new Color(NIGHT_BACKGROUND).lerp(
    new Color(DAY_BACKGROUND),
    daylight * 0.85 * scale.saturation,
  );

  return {
    background: background.getHex(),
    keyColor: keyColor.getHex(),
    keyIntensity: (0.3 + daylight * 1.15) * scale.key,
    rimColor: RIM_COLOR,
    // The rim is an accent, so it stays low even under a noon key light.
    rimIntensity: 0.3 + daylight * 0.25,
    ambientIntensity: (0.16 + daylight * 0.14) * scale.ambient,
    hemisphereIntensity: (0.12 + daylight * 0.18) * scale.ambient,
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
 * All tiles as ONE mesh with per-vertex colours: the variation is visible but the bed costs a single
 * draw call no matter how large the grid grows. Built in the XY plane and rotated flat at the end.
 */
function tiledSoilGeometry(size: number, gridSize: number): BufferGeometry {
  const tile = size / gridSize;
  const parts: PlaneGeometry[] = [];
  for (let row = 0; row < gridSize; row += 1) {
    for (let column = 0; column < gridSize; column += 1) {
      const quad = new PlaneGeometry(tile * 0.985, tile * 0.985);
      const shade = new Color(TILE_DARK).lerp(new Color(TILE_LIGHT), tileNoise(column, row));
      const colors: number[] = [];
      for (let vertex = 0; vertex < 4; vertex += 1) colors.push(shade.r, shade.g, shade.b);
      quad.setAttribute('color', new Float32BufferAttribute(colors, 3));
      // Plane y maps to world -Z under rotateX(-90deg), so the row offset is negated here.
      quad.translate(-size / 2 + tile * (column + 0.5), -(-size / 2 + tile * (row + 0.5)), 0);
      parts.push(quad);
    }
  }
  const merged = mergeGeometries(parts) ?? new PlaneGeometry(size, size);
  for (const part of parts) part.dispose();
  merged.rotateX(-Math.PI / 2);
  return merged;
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
  const soil = useMemo(() => tiledSoilGeometry(size, gridSize), [size, gridSize]);
  const grid = useMemo(
    () => (showGrid ? gridLineGeometry(size, gridSize) : null),
    [showGrid, size, gridSize],
  );
  const ambience = useMemo(() => ambienceFor(timeOfDay, season), [timeOfDay, season]);

  // Every memoised geometry holds GPU buffers, so it is released when swapped or unmounted.
  useEffect(
    () => () => {
      soil.dispose();
      grid?.dispose();
    },
    [soil, grid],
  );

  // Rain is a capped point field, fixed in place: no rAF loop and no per-frame allocation.
  const rainPoints = useMemo(() => {
    if (weather !== 'rain') return null;
    const count = quality === 'low' ? 180 : 360;
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      const a = tileNoise(index, count);
      const b = tileNoise(index * 1.7, count * 0.5);
      positions[index * 3 + 0] = (a - 0.5) * size;
      positions[index * 3 + 1] = 0.15 + b * size * 0.85;
      positions[index * 3 + 2] = (b - 0.5) * size;
    }
    return positions;
  }, [weather, quality, size]);

  const handleMove = (event: ThreeEvent<PointerEvent>) => {
    onTileHover?.(tileAt(event.point.x, event.point.z, size, gridSize));
  };

  return (
    <group>
      {/* Opaque base under the speckle so the hairline gaps between tiles never show through. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow={shadows}>
        <planeGeometry args={[size, size]} />
        <meshStandardMaterial color={TILE_DARK} roughness={0.96} metalness={0} />
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
        onPointerOut={() => onTileHover?.(null)}
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

      {rainPoints && (
        <points>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[rainPoints, 3]} />
          </bufferGeometry>
          <pointsMaterial color={RIM_COLOR} size={0.045} transparent opacity={0.4} depthWrite={false} />
        </points>
      )}
    </group>
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
