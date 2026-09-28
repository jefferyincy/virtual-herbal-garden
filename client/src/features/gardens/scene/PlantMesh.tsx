/**
 * One procedural herb on the bed. Built from `herbShapeFor` + `buildHerbGeometry`; no GLB is ever
 * fetched (every seeded plant has `modelUrl: null`, and `modelScale` describes a model that does not
 * exist, so it is deliberately unused - the shape profile already carries the plant's scale).
 *
 * Geometry is memoised per plant + quality so a re-render (selection, hover, settings change) never
 * rebuilds meshes, and the merged BufferGeometry is a single mesh per plant.
 */
import { useEffect, useMemo, useRef } from 'react';
import { DoubleSide, type Group } from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import type { PlotPlant, PlotStage } from '../hooks';
import {
  FLOWER_COLOR,
  GREEN_RAMP,
  buildHerbGeometry,
  hashString,
  herbShapeFor,
  type QualityLevel,
} from './procedural';

/** Growth stage scales the whole plant so progress is visible on the bed, not just in the data. */
const STAGE_SCALE: Record<PlotStage, number> = {
  seedling: 0.45,
  growing: 0.7,
  mature: 1,
  flowering: 1.05,
};

const SELECTION_RING_COLOR = '#7BE0A8';

export function PlantMesh({
  plant,
  position,
  onSelect,
  isSelected = false,
  stage,
  quality,
  ghost = false,
}: {
  plant: PlotPlant;
  position: readonly [number, number, number];
  onSelect?: () => void;
  isSelected?: boolean;
  stage: PlotStage;
  quality: QualityLevel;
  /** Placement preview: translucent, unclickable, with an accent outline instead of a grow state. */
  ghost?: boolean;
}): React.ReactNode {
  const shape = useMemo(() => herbShapeFor({ family: plant.family, id: plant._id }), [plant.family, plant._id]);
  const geometry = useMemo(() => buildHerbGeometry(shape, quality), [shape, quality]);
  const leafColor = GREEN_RAMP[shape.colorIndex] ?? GREEN_RAMP[2];
  const scale = STAGE_SCALE[stage];

  // BufferGeometry holds GPU buffers, so it is released explicitly when the mesh goes away.
  useEffect(() => () => geometry.dispose(), [geometry]);

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    if (!onSelect) return;
    // Stop the ground plane from also reading this click as a tile tap.
    event.stopPropagation();
    onSelect();
  };

  // Idle sway: a small per-plant phase offset (hash of the id) so the bed never moves in lockstep.
  // Presentation only, and skipped for ghosts - a placement preview should sit still on its tile.
  const swayRef = useRef<Group>(null);
  const phase = useMemo(() => (hashString(plant._id) / 0x100000000) * Math.PI * 2, [plant._id]);
  useFrame((state) => {
    const node = swayRef.current;
    if (!node || ghost) return;
    const t = state.clock.elapsedTime;
    node.rotation.z = Math.sin(t * 0.9 + phase) * 0.035;
    node.rotation.x = Math.cos(t * 0.7 + phase) * 0.02;
  });

  return (
    <group ref={swayRef} position={[position[0], position[1], position[2]]} scale={scale}>
      <mesh
        geometry={geometry}
        castShadow={!ghost}
        receiveShadow={!ghost}
        onClick={handleClick}
        onPointerDown={onSelect ? (event) => event.stopPropagation() : undefined}
      >
        <meshStandardMaterial
          color={leafColor}
          roughness={0.62}
          metalness={0}
          // Blades are single-sided planes; the material renders both faces so no leaf is invisible
          // from behind.
          side={DoubleSide}
          transparent={ghost}
          opacity={ghost ? 0.5 : 1}
          depthWrite={!ghost}
          emissive={isSelected ? SELECTION_RING_COLOR : '#000000'}
          emissiveIntensity={isSelected ? 0.35 : 0}
        />
      </mesh>

      {stage === 'flowering' && !ghost && (
        // Flowering accent: two small blossoms at the crown, colour-only so it stays a low-poly bud.
        <group position={[0, shape.stemHeight * 0.98, 0]}>
          <mesh castShadow={false}>
            <icosahedronGeometry args={[shape.leafLength * 0.34, 0]} />
            <meshStandardMaterial color={FLOWER_COLOR} roughness={0.5} metalness={0} />
          </mesh>
          <mesh position={[shape.leafLength * 0.42, -shape.leafLength * 0.16, shape.leafLength * 0.22]}>
            <icosahedronGeometry args={[shape.leafLength * 0.22, 0]} />
            <meshStandardMaterial color={FLOWER_COLOR} roughness={0.5} metalness={0} />
          </mesh>
        </group>
      )}

      {(isSelected || ghost) && (
        // DESIGN.md's "soft radial accent glow behind the selected plant": a flat accent mesh on the
        // soil rather than a CSS glow, so it sits in the world and scales with the camera.
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]} scale={1 / scale}>
          <ringGeometry args={[0.3, 0.35, 32]} />
          <meshBasicMaterial
            color={SELECTION_RING_COLOR}
            transparent
            opacity={ghost ? 0.9 : 0.55}
            side={DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
}
