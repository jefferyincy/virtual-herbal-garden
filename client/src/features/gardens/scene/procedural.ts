/**
 * Procedural herb geometry. Pure module: no React, no @react-three/fiber - just deterministic
 * maths plus three.js primitives, so the same plant can be built inside `<Canvas>` and (in a
 * future thumbnail worker) outside it.
 *
 * DETERMINISM IS THE REQUIREMENT. No `Math.random()` anywhere: the garden must look identical for
 * every viewer and on every reload, otherwise two people looking at the same shared garden would
 * see different plants, and a plant would "change species" on refresh. All variation comes from
 * `hashString(plant._id)`, which is stable across sessions, devices and users.
 */
import {
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * DESIGN.md's single-hue green series (charts + foliage). Index 0 is the darkest, 4 the palest;
 * `colorIndex` picks within it so no plant leaves the palette.
 */
export const GREEN_RAMP = ['#1F4A33', '#2F7A4E', '#4FD18B', '#7BE0A8', '#B4F0CE'] as const;

/** Warm accent used for the flowering-stage accent, from DESIGN.md's terracotta secondary. */
export const FLOWER_COLOR = '#E39A72';

export type QualityLevel = 'low' | 'medium' | 'high';

/** Which silhouette builder a family uses. Kept beside the profile so family quirks stay in one place. */
export type HerbForm =
  | 'squareStem'
  | 'sheath'
  | 'feather'
  | 'pinnate'
  | 'shrub'
  | 'rosette'
  | 'soft'
  | 'leathery'
  | 'glossy'
  | 'heart'
  | 'mat'
  | 'vine';

export type HerbShape = {
  /** Number of upright stems. */
  stemCount: number;
  /** Height of the tallest stem, in grid-tile units (1 tile = 1 unit). */
  stemHeight: number;
  /** Leaf pairs (or whorls) per stem. Drives the leaf count with `stemCount`. */
  leafDensity: number;
  /** Leaf blade length. */
  leafLength: number;
  /** Leaf blade width at its widest point. */
  leafWidth: number;
  /** How far leaves splay from the stem, 0 (hugging) .. 1 (flat). */
  spread: number;
  /** Index into `GREEN_RAMP`. */
  colorIndex: number;
  /** Stem lean from vertical, in radians. */
  tilt: number;
  /** Silhouette builder for this family. */
  form: HerbForm;
};

type FamilyProfile = {
  form: HerbForm;
  stemCount: [number, number];
  stemHeight: [number, number];
  leafDensity: [number, number];
  leafLength: [number, number];
  /** Width as a fraction of length - leaf proportions, not an absolute size. */
  widthRatio: number;
  spread: number;
  /** Base ramp index; per-plant jitter moves it by at most one step. */
  colorIndex: number;
  tilt: number;
};

/**
 * Per-family profiles. Each one is recognisably different at a glance and matches the family's
 * described habit (build spec section 4 garden prompt + the seeded families in server/src/seed).
 */
const FAMILY_PROFILES: Record<string, FamilyProfile> = {
  // Thin square stems with dense opposite leaves - the mint silhouette.
  Lamiaceae: { form: 'squareStem', stemCount: [3, 5], stemHeight: [0.62, 0.86], leafDensity: [4, 6], leafLength: [0.13, 0.18], widthRatio: 0.55, spread: 0.7, colorIndex: 2, tilt: 0.12 },
  // Tall rolled sheaths carrying broad blades.
  Zingiberaceae: { form: 'sheath', stemCount: [2, 3], stemHeight: [0.9, 1.25], leafDensity: [4, 5], leafLength: [0.3, 0.42], widthRatio: 0.34, spread: 0.45, colorIndex: 1, tilt: 0.06 },
  // Fine feathery foliage on a pale stalk.
  Apiaceae: { form: 'feather', stemCount: [3, 6], stemHeight: [0.7, 1.0], leafDensity: [5, 7], leafLength: [0.1, 0.14], widthRatio: 0.3, spread: 0.85, colorIndex: 3, tilt: 0.16 },
  // Pinnate leaflets in rows along a wiry stem.
  Fabaceae: { form: 'pinnate', stemCount: [2, 4], stemHeight: [0.55, 0.8], leafDensity: [4, 6], leafLength: [0.09, 0.13], widthRatio: 0.45, spread: 0.8, colorIndex: 2, tilt: 0.2 },
  // Spreading shrub with oval leaves.
  Solanaceae: { form: 'shrub', stemCount: [3, 5], stemHeight: [0.6, 0.9], leafDensity: [4, 6], leafLength: [0.16, 0.22], widthRatio: 0.5, spread: 0.9, colorIndex: 1, tilt: 0.3 },
  // Rosette of thick tapered leaves straight from the crown.
  Asphodelaceae: { form: 'rosette', stemCount: [1, 1], stemHeight: [0.42, 0.6], leafDensity: [6, 9], leafLength: [0.34, 0.46], widthRatio: 0.22, spread: 1, colorIndex: 3, tilt: 0.05 },
  // Soft rounded leaves on a tall stalk.
  Malvaceae: { form: 'soft', stemCount: [1, 2], stemHeight: [0.85, 1.15], leafDensity: [4, 6], leafLength: [0.2, 0.26], widthRatio: 0.82, spread: 0.75, colorIndex: 2, tilt: 0.1 },
  // Small leathery leaves on woody stems.
  Myrtaceae: { form: 'leathery', stemCount: [2, 3], stemHeight: [0.6, 0.85], leafDensity: [5, 7], leafLength: [0.08, 0.11], widthRatio: 0.62, spread: 0.6, colorIndex: 1, tilt: 0.18 },
  // Glossy lanceolate leaves - bay, cinnamon.
  Lauraceae: { form: 'glossy', stemCount: [1, 2], stemHeight: [0.8, 1.1], leafDensity: [5, 7], leafLength: [0.24, 0.32], widthRatio: 0.3, spread: 0.65, colorIndex: 3, tilt: 0.09 },
  // Pinnate toothed leaflets - neem.
  Meliaceae: { form: 'pinnate', stemCount: [1, 2], stemHeight: [0.85, 1.2], leafDensity: [5, 7], leafLength: [0.12, 0.17], widthRatio: 0.4, spread: 0.8, colorIndex: 1, tilt: 0.14 },
  // Climbing heart leaves.
  Piperaceae: { form: 'heart', stemCount: [2, 4], stemHeight: [0.5, 0.78], leafDensity: [4, 6], leafLength: [0.15, 0.2], widthRatio: 0.78, spread: 0.95, colorIndex: 2, tilt: 0.34 },
  // Creeping mat - low, wide, many small leaves.
  Plantaginaceae: { form: 'mat', stemCount: [2, 4], stemHeight: [0.16, 0.26], leafDensity: [4, 6], leafLength: [0.12, 0.17], widthRatio: 0.5, spread: 1, colorIndex: 3, tilt: 0.5 },
  // Twining vine with a visibly bent stem.
  Menispermaceae: { form: 'vine', stemCount: [2, 3], stemHeight: [0.7, 1.0], leafDensity: [4, 5], leafLength: [0.17, 0.23], widthRatio: 0.72, spread: 0.9, colorIndex: 2, tilt: 0.4 },
};

/** Fallback for a family the seed adds later: a mid-size leafy herb, never a missing silhouette. */
const DEFAULT_PROFILE: FamilyProfile = FAMILY_PROFILES.Lamiaceae as FamilyProfile;

/**
 * FNV-1a, 32-bit. Stable for a given string across engines and runs (integer ops only), which is
 * what makes the procedural garden reproducible - see the file header.
 */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Deterministic value in [0, 1) derived from a seed and a name for the field being varied. */
function unitFrom(seed: number, salt: string): number {
  const mixed = (seed ^ hashString(salt)) >>> 0;
  return mixed / 0x100000000;
}

/** Deterministic value in [min, max] derived from a seed and a salt. */
function rangeFrom(seed: number, salt: string, min: number, max: number): number {
  return min + unitFrom(seed, salt) * (max - min);
}

/** `colorIndex` steps ±1 around the family base so a bed is not one flat shade. */
function rampIndex(seed: number, base: number): number {
  const step = unitFrom(seed, 'color') < 0.34 ? -1 : unitFrom(seed, 'color') > 0.66 ? 1 : 0;
  return Math.min(GREEN_RAMP.length - 1, Math.max(0, base + step));
}

/**
 * Build the deterministic shape for one plant. `id` is the plant document id (or any stable
 * per-plant key); passing random or index-based values would break the header's determinism rule.
 */
export function herbShapeFor(input: { family: string; id: string }): HerbShape {
  const profile = FAMILY_PROFILES[input.family] ?? DEFAULT_PROFILE;
  const seed = hashString(input.id);
  const leafLength = rangeFrom(seed, 'len', profile.leafLength[0], profile.leafLength[1]);

  return {
    form: profile.form,
    stemCount: Math.round(rangeFrom(seed, 'stems', profile.stemCount[0], profile.stemCount[1])),
    stemHeight: rangeFrom(seed, 'height', profile.stemHeight[0], profile.stemHeight[1]),
    leafDensity: Math.round(
      rangeFrom(seed, 'density', profile.leafDensity[0], profile.leafDensity[1]),
    ),
    leafLength,
    leafWidth: leafLength * profile.widthRatio,
    spread: profile.spread,
    colorIndex: rampIndex(seed, profile.colorIndex),
    tilt: profile.tilt,
  };
}

/** Leaf/edge tessellation per quality tier. Low must still read as the same species. */
const SEGMENTS_BY_QUALITY: Record<QualityLevel, { blade: number; radial: number; maxLeaves: number }> = {
  low: { blade: 1, radial: 3, maxLeaves: 54 },
  medium: { blade: 2, radial: 4, maxLeaves: 90 },
  high: { blade: 3, radial: 6, maxLeaves: 140 },
};

/**
 * A single leaf blade in local space: length along +Y, width along X, projecting +Z. Both faces
 * share the (0, 0, 1) normal and the material renders DoubleSide, so a blade is lit from either
 * side without the cost of a closed solid.
 */
function bladeGeometry(length: number, width: number, segments: number): BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const step = Math.max(1, Math.round(segments));

  for (let index = 0; index <= step; index += 1) {
    const t = index / step;
    // Widest around a third of the way up, pointed at both ends.
    const halfWidth = Math.max(0.001, (width / 2) * Math.sin(Math.PI * t ** 0.75));
    const y = t * length;
    const z = Math.sin(Math.PI * t) * length * 0.16;
    positions.push(-halfWidth, y, z, 0, y + halfWidth * 0.22, z, halfWidth, y, z);
    normals.push(0, 0, 1, 0, 0, 1, 0, 0, 1);
    uvs.push(0, t, 0.5, t, 1, t);
  }

  for (let index = 0; index < step; index += 1) {
    const base = index * 3;
    indices.push(base, base + 3, base + 1, base + 1, base + 3, base + 4);
    indices.push(base + 1, base + 4, base + 2, base + 2, base + 4, base + 5);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

/**
 * Per-silhouette leaf arrangement and stem proportions. Kept separate from the family profile so a
 * family only picks a form and the geometric consequence of that form stays in one table.
 */
const FORM_TRAITS: Record<
  HerbForm,
  {
    arrangement: 'opposite' | 'alternate' | 'whorled' | 'basal';
    /** Stem links: 1 is straight, more gives `vine`/`shrub`/`feather` a visible bend. */
    chain: number;
    /** Stem thickness as a fraction of leaf length. */
    stemRadius: number;
    /** Overall blade scale, so sheaths read as broad blades and feathers as fine ones. */
    leafScale: number;
    /** Multiplier on `shape.spread`: how flat the blades sit against the stem. */
    splay: number;
  }
> = {
  squareStem: { arrangement: 'opposite', chain: 1, stemRadius: 0.05, leafScale: 1, splay: 0.85 },
  sheath: { arrangement: 'whorled', chain: 1, stemRadius: 0.12, leafScale: 1.15, splay: 0.35 },
  feather: { arrangement: 'alternate', chain: 2, stemRadius: 0.035, leafScale: 0.8, splay: 1.05 },
  pinnate: { arrangement: 'alternate', chain: 1, stemRadius: 0.04, leafScale: 0.85, splay: 0.95 },
  shrub: { arrangement: 'alternate', chain: 2, stemRadius: 0.06, leafScale: 1, splay: 1 },
  rosette: { arrangement: 'basal', chain: 1, stemRadius: 0.05, leafScale: 1.1, splay: 1.2 },
  soft: { arrangement: 'alternate', chain: 1, stemRadius: 0.05, leafScale: 1, splay: 0.8 },
  leathery: { arrangement: 'opposite', chain: 1, stemRadius: 0.05, leafScale: 0.9, splay: 0.6 },
  glossy: { arrangement: 'alternate', chain: 1, stemRadius: 0.055, leafScale: 1.1, splay: 0.7 },
  heart: { arrangement: 'alternate', chain: 2, stemRadius: 0.045, leafScale: 1, splay: 1 },
  mat: { arrangement: 'basal', chain: 1, stemRadius: 0.045, leafScale: 1, splay: 1.25 },
  vine: { arrangement: 'alternate', chain: 3, stemRadius: 0.04, leafScale: 1, splay: 1 },
};

/** Where a leaf sits on its stem and how many leaves one stem carries. */
function leafPlacement(shape: HerbShape, traits: (typeof FORM_TRAITS)[HerbForm]): {
  count: number;
  azimuth: (index: number) => number;
} {
  if (traits.arrangement === 'basal') {
    return { count: shape.leafDensity, azimuth: (index) => index * 2.399 };
  }
  if (traits.arrangement === 'opposite') {
    // Opposite pairs: leaf 2n and 2n+1 share a node and face 180 degrees apart.
    return { count: shape.leafDensity, azimuth: (index) => Math.floor(index / 2) * 2.399 + (index % 2) * Math.PI };
  }
  if (traits.arrangement === 'whorled') {
    return { count: shape.leafDensity, azimuth: (index) => (index % 4) * (Math.PI / 2) };
  }
  return { count: shape.leafDensity, azimuth: (index) => index * 2.399 };
}

/**
 * Build one merged BufferGeometry for a plant, origin at soil level, height along +Y. Capped leaf
 * counts and low segment counts keep the whole 36-tile bed inside a small triangle budget; the
 * caller renders this as a single mesh, so there is no per-leaf draw call and no per-frame
 * allocation.
 */
export function buildHerbGeometry(shape: HerbShape, quality: QualityLevel): BufferGeometry {
  const segments = SEGMENTS_BY_QUALITY[quality];
  const traits = FORM_TRAITS[shape.form];
  const placement = leafPlacement(shape, traits);
  const parts: BufferGeometry[] = [];

  for (let stem = 0; stem < shape.stemCount; stem += 1) {
    const stemAzimuth = (stem / Math.max(1, shape.stemCount)) * Math.PI * 2;
    const direction = stem % 2 === 0 ? 1 : -1;
    const stemHeight = shape.stemHeight * (0.84 + (stem % 3) * 0.08);
    const linkHeight = stemHeight / traits.chain;
    let base: [number, number, number] = [0, 0, 0];

    for (let link = 0; link < traits.chain; link += 1) {
      const linkTilt = shape.tilt * (0.6 + link * 0.55) * direction;
      const radius = shape.leafLength * traits.stemRadius;
      const cylinder = new CylinderGeometry(radius * 0.75, radius, linkHeight, segments.radial);
      cylinder.translate(0, linkHeight / 2, 0);
      cylinder.rotateZ(linkTilt);
      cylinder.rotateY(stemAzimuth);
      cylinder.translate(base[0], base[1], base[2]);
      parts.push(cylinder);

      // Advance along the link's own axis so chained links bend instead of stacking vertically.
      const tipX = -linkHeight * Math.sin(linkTilt);
      base = [
        base[0] + tipX * Math.cos(stemAzimuth),
        base[1] + linkHeight * Math.cos(linkTilt),
        base[2] - tipX * Math.sin(stemAzimuth),
      ];
    }

    const leafCount = Math.min(placement.count, Math.ceil(segments.maxLeaves / Math.max(1, shape.stemCount)));
    for (let leaf = 0; leaf < leafCount; leaf += 1) {
      const t = (leaf + 0.7) / (leafCount + 0.4);
      const scale = traits.leafScale * (traits.arrangement === 'basal' ? 1 : 0.75 + t * 0.45);
      const blade = bladeGeometry(shape.leafLength * scale, shape.leafWidth * scale, segments.blade);

      const azimuth = placement.azimuth(leaf);
      if (traits.arrangement === 'basal') {
        // Rosette/mat: every blade leaves the crown, splayed nearly flat against the soil.
        blade.rotateX(Math.min(1.45, shape.spread * traits.splay));
        blade.rotateY(azimuth);
        blade.translate(0, 0.01, 0);
      } else {
        // Blades droop away from the stem, more so further up, then rotate to their node azimuth.
        const droop = Math.min(1.4, shape.spread * traits.splay * (0.55 + t * 0.6));
        blade.rotateX(droop);
        blade.rotateY(azimuth);
        const along = (leaf + 0.5) / leafCount;
        const linkIndex = Math.min(traits.chain - 1, Math.floor(along * traits.chain));
        const linkTilt = shape.tilt * (0.6 + linkIndex * 0.55) * direction;
        const tipX = -linkHeight * Math.sin(linkTilt);
        blade.translate(
          tipX * Math.cos(stemAzimuth) * along +
            Math.sin(stemAzimuth) * shape.leafLength * traits.stemRadius,
          linkHeight * Math.cos(linkTilt) * along * traits.chain,
          -tipX * Math.sin(stemAzimuth) * along +
            Math.cos(stemAzimuth) * shape.leafLength * traits.stemRadius,
        );
      }
      parts.push(blade);
    }
  }

  const merged = mergeGeometries(parts) ?? new BufferGeometry();
  // The source parts are never rendered, so they are freed here rather than left to the GC.
  for (const part of parts) part.dispose();
  return merged;
}
