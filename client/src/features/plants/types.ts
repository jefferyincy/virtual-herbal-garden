/**
 * View types and vocabularies for the plant encyclopedia.
 *
 * `types/api.ts` is the shared contract and is owned centrally, so anything these screens need
 * beyond it - the compare table shape, the resolved look-alike list, the facet option lists -
 * lives here.
 */
import type { Ailment, MedicalSystem, Plant, PlantFilters, PlantPart } from '@/types/api';

/** One row of the compare table. Mirrors the server's `compareRows()` output byte for byte. */
export type CompareRow = { label: string; values: Array<string | null>; differs: boolean };

/** `GET /api/plants/compare` returns the plants in the requested order plus the eight rows. */
export type CompareResponse = { plants: Plant[]; rows: CompareRow[] };

/** `GET /api/plants/:slug` returns the document plus its resolved look-alike records. */
export type PlantDetail = Plant & { lookAlikePlants: Plant[] };

/** An ailment reference after `populate`; the list endpoints leave it a bare id. */
export type PlantAilmentRef = Pick<Ailment, '_id' | 'name' | 'system'> & { slug?: string };

export type AilmentSystemValue = Ailment['system'];

export type AilmentWithCount = Ailment & { plantCount: number };

/** `GET /api/ailments` is flat; the browser groups it by system client-side. */
export type AilmentsResponse = { items: AilmentWithCount[] };

export type AilmentGroup = { system: AilmentSystemValue; label: string; items: AilmentWithCount[] };

export type PlantSort = NonNullable<PlantFilters['sort']>;

/** `PlantFilters` plus the one extra knob `usePlantFacets()` needs for its single 50-item fetch. */
export type PlantQuery = PlantFilters & { pageSize?: number };

/** Option lists for the filter rail; derived from one catalogue page (see `usePlantFacets`). */
export type PlantFacets = {
  families: string[];
  parts: PlantPart[];
  regions: string[];
  systems: MedicalSystem[];
};

/**
 * Runtime vocabularies. A `?part=` or `?sort=` value that is not in these lists must fall back to
 * "unset" rather than reach the server, and a union type alone cannot be iterated at runtime.
 * `satisfies` keeps each list tied to the contract union it mirrors.
 */
export const PLANT_SORTS = ['name', 'recent', 'family'] as const satisfies readonly PlantSort[];

export const PLANT_PART_VALUES = [
  'leaf',
  'root',
  'stem',
  'bark',
  'flower',
  'fruit',
  'seed',
  'rhizome',
  'whole_plant',
  'resin',
  'latex',
] as const satisfies readonly PlantPart[];

export const MEDICAL_SYSTEM_VALUES = [
  'ayurveda',
  'siddha',
  'unani',
  'western',
] as const satisfies readonly MedicalSystem[];

/** Display order of the ailment rail groups. */
export const AILMENT_SYSTEM_ORDER = [
  'digestive',
  'respiratory',
  'skin',
  'nervous',
  'immune',
  'other',
] as const satisfies readonly AilmentSystemValue[];

export const AILMENT_SYSTEM_LABELS: Record<AilmentSystemValue, string> = {
  digestive: 'Digestive',
  respiratory: 'Respiratory',
  skin: 'Skin',
  nervous: 'Nervous',
  immune: 'Immune',
  other: 'Other',
};
