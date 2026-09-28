/**
 * Data layer for the plant encyclopedia (build spec section 4 encyclopedia endpoints).
 *
 * Every network call goes through `api` - no component in this feature calls fetch directly.
 * Keys for shared resources come from `lib/query.ts`; keys that only exist here are defined below.
 */
import { useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query';
import type { Paginated, Plant, PlantFilters } from '@/types/api';
import {
  MEDICAL_SYSTEM_VALUES,
  PLANT_PART_VALUES,
  type AilmentsResponse,
  type CompareResponse,
  type PlantDetail,
  type PlantFacets,
  type PlantQuery,
} from '@/features/plants/types';

const plantKeys = {
  list: (filters: PlantQuery) => [...queryKeys.plants, 'list', filters] as const,
  /** One page of the catalogue, reused as the facet, map and compare-picker source. */
  catalogue: (pageSize: number) => [...queryKeys.plants, 'catalogue', pageSize] as const,
  compare: (slugs: readonly string[]) => [...queryKeys.plants, 'compare', slugs] as const,
  ailmentPlants: (slug: string, page: number) =>
    [...queryKeys.ailments, 'plants', slug, page] as const,
  regionPlants: (region: string, page: number) => ['plants', 'region', region, page] as const,
};

/** Hard ceiling the server applies to `pageSize`; the derived views depend on it. */
export const FACET_PAGE_SIZE = 50;

export function usePlants(filters: PlantFilters) {
  return useQuery({
    queryKey: plantKeys.list(filters),
    queryFn: ({ signal }) =>
      api.get<Paginated<Plant>>('/plants', { query: { ...filters }, signal }),
    // Paging and chip toggles must not drop the previous page back to a skeleton.
    placeholderData: keepPreviousData,
  });
}

export function usePlant(slugOrId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.plant(slugOrId ?? ''),
    enabled: Boolean(slugOrId),
    queryFn: ({ signal }) => api.get<PlantDetail>(`/plants/${slugOrId}`, { signal }),
  });
}

/**
 * Facet option lists for the filter rail.
 *
 * The spec defines no facets endpoint - only `GET /api/plants` - so we derive the lists from a
 * single catalogue page. That caps the families/parts/regions/systems we can offer at the first
 * 50 plants (the server's maximum page size); a scale-up must add a real facets endpoint rather
 * than widen this fetch.
 */
export function usePlantFacets() {
  const catalogue = usePlantCatalogue();

  const facets = useMemo<PlantFacets>(() => {
    const families = new Set<string>();
    const parts = new Set<(typeof PLANT_PART_VALUES)[number]>();
    const regions = new Set<string>();
    const systems = new Set<(typeof MEDICAL_SYSTEM_VALUES)[number]>();

    for (const plant of catalogue.items) {
      if (plant.family) families.add(plant.family);
      for (const part of plant.partsUsed) parts.add(part);
      for (const region of plant.region) regions.add(region);
      for (const system of plant.systemsMentioned) systems.add(system);
    }

    const bySweepOrder = <T extends string>(order: readonly T[], present: Set<T>): T[] =>
      order.filter((value) => present.has(value));

    return {
      families: Array.from(families).sort((a, b) => a.localeCompare(b)),
      parts: bySweepOrder(PLANT_PART_VALUES, parts),
      regions: Array.from(regions).sort((a, b) => a.localeCompare(b)),
      systems: bySweepOrder(MEDICAL_SYSTEM_VALUES, systems),
    };
  }, [catalogue.items]);

  return { ...catalogue, facets };
}

/**
 * The first 50 catalogue rows with the fields every derived view needs.
 *
 * As with the facets, the spec defines no aggregation endpoint, so the map's region counts and
 * its per-region plant rows come from this one fetch; the 50-row ceiling is the server's page
 * maximum and a scale-up must replace it with a real grouping endpoint.
 */
export function usePlantCatalogue() {
  const query = useQuery({
    queryKey: plantKeys.catalogue(FACET_PAGE_SIZE),
    queryFn: ({ signal }) =>
      api.get<Paginated<Plant>>('/plants', {
        query: { page: 1, pageSize: FACET_PAGE_SIZE, sort: 'name' },
        signal,
      }),
  });

  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  return { ...query, items, truncated: (query.data?.total ?? 0) > items.length };
}

export function useAilments() {
  return useQuery({
    queryKey: queryKeys.ailments,
    queryFn: ({ signal }) => api.get<AilmentsResponse>('/ailments', { signal }),
  });
}

export function useAilmentPlants(slug: string | undefined, page: number) {
  return useQuery({
    queryKey: plantKeys.ailmentPlants(slug ?? '', page),
    enabled: Boolean(slug),
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      api.get<Paginated<Plant>>(`/ailments/${slug}/plants`, { query: { page }, signal }),
  });
}

export function useRegionPlants(region: string | undefined, page: number) {
  return useQuery({
    queryKey: plantKeys.regionPlants(region ?? '', page),
    enabled: Boolean(region),
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      api.get<Paginated<Plant>>(`/regions/${region}/plants`, { query: { page }, signal }),
  });
}

export function useCompare(slugs: string[]) {
  return useQuery({
    queryKey: plantKeys.compare(slugs),
    enabled: slugs.length >= 2,
    queryFn: ({ signal }) =>
      api.get<CompareResponse>('/plants/compare', { query: { ids: slugs.join(',') }, signal }),
  });
}
