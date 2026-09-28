/**
 * Grounded retrieval for the plant assistant.
 *
 * This project has no language model, no API key and no `/api/assistant` endpoint, so this module
 * is the entire answer path: a deterministic term-frequency ranker over an exact projection of the
 * seeded monographs. Each document is built from exactly one `Plant` record and carries that
 * record's own `sources`, which is why a hit can never be grounded in anything but the monograph
 * its citation row links to.
 *
 * Pure module: no React, no network, no DOM, no dependency.
 */
import type { Plant } from '@/types/api';

export type RetrievalDoc = {
  slug: string;
  commonName: string;
  botanicalName: string;
  family: string;
  text: string;
  citations: Array<{ label: string; url: string }>;
  plant: Plant;
};

export type RetrievalHit = {
  doc: RetrievalDoc;
  score: number;
  matchedTerms: string[];
};

/** Function words carry no retrieval signal and would make every monograph match every question. */
const STOPWORDS: Record<string, true> = {
  a: true, about: true, all: true, also: true, am: true, an: true, and: true, any: true,
  are: true, as: true, at: true, be: true, because: true, been: true, but: true, by: true,
  can: true, could: true, did: true, do: true, does: true, for: true, from: true, get: true,
  give: true, had: true, has: true, have: true, help: true, helps: true, how: true, i: true,
  if: true, in: true, into: true, is: true, it: true, its: true, know: true, like: true,
  list: true, me: true, more: true, most: true, my: true, need: true, not: true, of: true,
  on: true, or: true, our: true, please: true, should: true, show: true, so: true, some: true,
  tell: true, than: true, that: true, the: true, their: true, them: true, then: true,
  there: true, these: true, this: true, to: true, up: true, use: true, used: true, uses: true,
  using: true, want: true, was: true, we: true, were: true, what: true, when: true,
  where: true, which: true, who: true, why: true, will: true, with: true, would: true,
  you: true, your: true,
};

/**
 * Lowercase, strip everything that is not a letter or digit, split, then drop stopwords and
 * single-character tokens. The same function tokenises both the index and the query, so query
 * terms and document terms can never drift apart.
 */
export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  for (const raw of text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ')) {
    if (raw.length > 1 && STOPWORDS[raw] !== true) tokens.push(raw);
  }
  return tokens;
}

/** Populated ailment refs carry a human name; unpopulated ones are ids and carry no retrievable text. */
function ailmentNames(plant: Plant): string[] {
  const names: string[] = [];
  for (const entry of plant.ailments) {
    if (typeof entry === 'string') continue;
    if (entry.name) names.push(entry.name);
  }
  return names;
}

/**
 * The retrieved projection: exactly the monograph fields that the record's own citations cover.
 * Nothing outside this string is ever scored, so a hit cannot be supported by data the record does
 * not state - retrieval runs over the cited monograph text only.
 */
function project(plant: Plant): string {
  return [
    plant.commonName,
    plant.botanicalName,
    plant.family,
    plant.partsUsed.join(' '),
    plant.preparations.join(' '),
    plant.systemsMentioned.join(' '),
    plant.activeCompounds.join(' '),
    plant.tags.join(' '),
    plant.region.join(' '),
    ailmentNames(plant).join(' '),
    plant.medicinalUses,
    plant.description,
  ].join(' ');
}

export function buildIndex(plants: Plant[]): RetrievalDoc[] {
  return plants.map((plant) => ({
    slug: plant.slug,
    commonName: plant.commonName,
    botanicalName: plant.botanicalName,
    family: plant.family,
    text: project(plant),
    // Citations are copied from the record's own `sources`; no citation is ever constructed here.
    citations: plant.sources.map((source) => ({ label: source.label, url: source.url })),
    plant,
  }));
}

/** A term that appears in the plant's own name counts for more than one buried in a sentence. */
const NAME_TF_WEIGHT = 4;
/** Flat bump so any name hit outranks a body-only hit of comparable frequency. */
const NAME_HIT_BONUS = 2;

/**
 * Rank the index for `query`. A query with no in-vocabulary term returns an empty array - it never
 * degrades into "return everything", because a reply with no evidence must be visibly empty rather
 * than plausible. Ties break on common name so identical scores keep a stable order across renders.
 */
export function search(index: RetrievalDoc[], query: string, limit = 5): RetrievalHit[] {
  const terms = Array.from(new Set(tokenize(query)));
  if (terms.length === 0) return [];

  const hits: RetrievalHit[] = [];

  for (const doc of index) {
    const counts = new Map<string, number>();
    for (const token of tokenize(doc.text)) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
    const nameTokens = new Set([...tokenize(doc.commonName), ...tokenize(doc.botanicalName)]);

    let score = 0;
    const matchedTerms: string[] = [];

    for (const term of terms) {
      const termFrequency = counts.get(term) ?? 0;
      if (termFrequency === 0) continue;
      matchedTerms.push(term);
      score += termFrequency;
      if (nameTokens.has(term)) score += termFrequency * NAME_TF_WEIGHT + NAME_HIT_BONUS;
    }

    if (score > 0) hits.push({ doc, score, matchedTerms: matchedTerms.sort() });
  }

  hits.sort((a, b) => b.score - a.score || a.doc.commonName.localeCompare(b.doc.commonName));
  return hits.slice(0, Math.max(0, Math.trunc(limit)));
}

type Frequency = { value: string; count: number };

/** Frequency order, ties broken alphabetically so suggestions never reshuffle between renders. */
function topByFrequency(values: string[]): Frequency[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = value.trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/**
 * Prompts built from what the index actually contains - a real plant name, a real family and a real
 * ailment from the seeded records - so every suggestion is answerable by retrieval. Templates avoid
 * words that do not occur in the projection: a token-free prompt would return nothing.
 */
export function suggestPrompts(index: RetrievalDoc[], limit = 4): string[] {
  if (index.length === 0) return [];
  const prompts: string[] = [];

  const named = [...index].sort((a, b) => a.commonName.localeCompare(b.commonName))[0];
  if (named) prompts.push(`What is ${named.commonName} used for?`);

  const family = topByFrequency(index.map((doc) => doc.family))[0];
  if (family) prompts.push(`Which plants belong to the ${family.value} family?`);

  const ailment = topByFrequency(index.flatMap((doc) => ailmentNames(doc.plant)))[0];
  if (ailment) prompts.push(`What helps ${ailment.value.toLowerCase()}?`);

  const system = topByFrequency(index.flatMap((doc) => [...doc.plant.systemsMentioned]))[0];
  if (system) prompts.push(`Which plants are studied for ${system.value} medicine?`);

  return prompts.slice(0, Math.max(0, Math.trunc(limit)));
}
