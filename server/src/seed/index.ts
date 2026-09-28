/**
 * Seed runner: `npm run seed -w server`.
 *
 * Loads the cited seed data into MongoDB and derives the learning content (lessons, quizzes,
 * badges) from it. Idempotent: every write is an upsert keyed by slug/key, so re-running never
 * deletes user progress or garden plots that reference plant ids.
 *
 * Reference resolution is two-phase because plants point at each other (look-alikes) and at
 * ailments: ailments are upserted first, then plants, then look-alike ids are patched in.
 */
import { Types } from 'mongoose';
import { connectDb, disconnectDb } from '../db.ts';
import { Ailment, Badge, Lesson, Plant, Quiz } from '../models/index.ts';
import { AILMENT_SEED_COUNT, ailmentSeed } from './data/ailments.ts';
import { PLANT_SEED_COUNT, plantSeed } from './data/plants.ts';

// --- Seed record shapes (structural: matched against the concurrent seed files) -------------

type SeedLookAlike = { slug: string; note: string };
type SeedSource = { label: string; url: string };
type SeedImage = { url: string; alt: string; credit: string };

type PlantSeedRecord = {
  slug: string;
  commonName: string;
  botanicalName: string;
  family: string;
  partsUsed: readonly string[];
  preparations: readonly string[];
  ailments: readonly string[];
  activeCompounds: readonly string[];
  description: string;
  medicinalUses: string;
  dosage: string | null;
  contraindications: string | null;
  toxicity: string;
  lookAlikes: readonly SeedLookAlike[];
  region: readonly string[];
  systemsMentioned: readonly string[];
  images: readonly SeedImage[];
  modelUrl: string | null;
  modelScale: number;
  tags: readonly string[];
  sources: readonly SeedSource[];
  verified: boolean;
  unverified?: boolean;
  publishedAt: string | Date | null;
};

type AilmentSeedRecord = {
  slug: string;
  name: string;
  system: string;
  description: string;
};

const plants: PlantSeedRecord[] = plantSeed;
const ailments: AilmentSeedRecord[] = ailmentSeed;

/** Every reference that does not resolve, printed at the end to make the failure actionable. */
const unresolvedRefs: string[] = [];

/** Seed slugs of plants whose own references are broken; those records are never written. */
function brokenPlantSlugs(): Set<string> {
  const ailmentSlugs = new Set(ailments.map((ailment) => ailment.slug));
  const plantSlugs = new Set(plants.map((plant) => plant.slug));
  const broken = new Set<string>();

  for (const plant of plants) {
    for (const slug of plant.ailments) {
      if (!ailmentSlugs.has(slug)) {
        unresolvedRefs.push(`plant "${plant.slug}" -> unknown ailment slug "${slug}"`);
        broken.add(plant.slug);
      }
    }
    for (const ref of plant.lookAlikes) {
      if (!plantSlugs.has(ref.slug)) {
        unresolvedRefs.push(`plant "${plant.slug}" -> unknown look-alike slug "${ref.slug}"`);
        broken.add(plant.slug);
      }
    }
  }
  return broken;
}

type WriteCounts = { plants: number; ailments: number; lessons: number; quizzes: number; badges: number };

async function upsertAilments(): Promise<Map<string, Types.ObjectId>> {
  const idBySlug = new Map<string, Types.ObjectId>();
  for (const ailment of ailments) {
    const doc = await Ailment.findOneAndUpdate(
      { slug: ailment.slug },
      { $set: ailment },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    idBySlug.set(ailment.slug, doc._id);
  }
  return idBySlug;
}

/** Phase 1 for plants: everything except `lookAlikes`, whose ids are not resolvable yet. */
async function upsertPlants(
  ailmentIds: Map<string, Types.ObjectId>,
  broken: Set<string>,
): Promise<{ idBySlug: Map<string, Types.ObjectId>; written: number }> {
  const idBySlug = new Map<string, Types.ObjectId>();
  let written = 0;

  for (const plant of plants) {
    if (broken.has(plant.slug)) continue;

    const resolvedAilments: Types.ObjectId[] = [];
    let missing = false;
    for (const slug of plant.ailments) {
      const id = ailmentIds.get(slug);
      if (!id) {
        unresolvedRefs.push(`plant "${plant.slug}" -> ailment "${slug}" was not written`);
        missing = true;
        continue;
      }
      resolvedAilments.push(id);
    }
    if (missing) continue;

    const dosage = plant.dosage ?? null;
    const contraindications = plant.contraindications ?? null;
    // Data honesty: a record with a null dosage or contraindications has no citable figure and
    // must be flagged unverified, whatever the seed file says.
    const unverified = dosage === null || contraindications === null ? true : (plant.unverified ?? false);

    const doc = await Plant.findOneAndUpdate(
      { slug: plant.slug },
      {
        $set: {
          ...plant,
          ailments: resolvedAilments,
          dosage,
          contraindications,
          unverified,
          lookAlikes: [],
          publishedAt: plant.publishedAt ? new Date(plant.publishedAt) : null,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    idBySlug.set(plant.slug, doc._id);
    written += 1;
  }
  return { idBySlug, written };
}

/** Phase 2 for plants: patch look-alike references now that every plant id exists. */
async function resolveLookAlikes(plantIds: Map<string, Types.ObjectId>): Promise<void> {
  for (const plant of plants) {
    const ownId = plantIds.get(plant.slug);
    if (!ownId) continue;

    const lookAlikes: Array<{ plantId: Types.ObjectId; note: string }> = [];
    for (const ref of plant.lookAlikes) {
      const targetId = plantIds.get(ref.slug);
      if (!targetId) {
        unresolvedRefs.push(`plant "${plant.slug}" -> look-alike "${ref.slug}" did not resolve to a plant id`);
        continue;
      }
      lookAlikes.push({ plantId: targetId, note: ref.note });
    }

    await Plant.updateOne({ _id: ownId }, { $set: { lookAlikes } });
  }
}

const SECTIONS = ['Foundations', 'Compounds', 'Uses and safety'] as const;

/**
 * Lesson prose is derived only from the plant record: description, medicinalUses, the recorded
 * compounds and the verbatim toxicity/contraindications strings. Nothing is invented here.
 */
function lessonBody(plant: PlantSeedRecord): string {
  const compounds = plant.activeCompounds.length
    ? plant.activeCompounds.map((compound) => `- ${compound}`).join('\n')
    : 'No active compounds are recorded from a citable source.';

  const contraindications = plant.contraindications?.trim()
    ? plant.contraindications
    : 'none recorded from a citable source.';

  const sourceLabels = plant.sources.map((source) => source.label).join('; ');

  return [
    '## Overview',
    '',
    plant.description,
    '',
    plant.medicinalUses,
    '',
    '## Key compounds',
    '',
    compounds,
    '',
    '## Use and safety',
    '',
    `Toxicity: ${plant.toxicity}.`,
    '',
    `Contraindications: ${contraindications}`,
    '',
    `Confirm every claim on this page against the sources listed on this plant's profile${sourceLabels ? ` (${sourceLabels})` : ''} before relying on it.`,
    '',
  ].join('\n');
}

async function upsertLessons(plantIds: Map<string, Types.ObjectId>): Promise<number> {
  let written = 0;
  let index = 0;
  const ordered = plants.filter((plant) => plantIds.has(plant.slug));

  for (const plant of ordered) {
    const estMinutes = 5 + (index % 5);
    await Lesson.findOneAndUpdate(
      { slug: `${plant.slug}-fundamentals` },
      {
        $set: {
          plantId: plantIds.get(plant.slug),
          title: `${plant.commonName} fundamentals`,
          body: lessonBody(plant),
          order: index,
          estMinutes,
          published: true,
          section: SECTIONS[index % SECTIONS.length],
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    written += 1;
    index += 1;
  }
  return written;
}

const MIN_QUIZ_FAMILY_SIZE = 4;

type FamilyFact = { stem: string; explanation: string };

/**
 * Pick a fact unique to `plant` inside its family so the four options genuinely discriminate:
 * a compound the others lack, then an ailment, then a part used. The final fallback still
 * states a recorded fact; the explanation is honest about what it distinguishes.
 */
function distinguishingFact(plant: PlantSeedRecord, family: PlantSeedRecord[]): FamilyFact {
  const countWith = (predicate: (other: PlantSeedRecord) => boolean) =>
    family.filter(predicate).length;

  for (const compound of plant.activeCompounds) {
    if (countWith((other) => other.activeCompounds.includes(compound)) === 1) {
      return {
        stem: `Which of these plants records ${compound} among its active compounds?`,
        explanation: `${plant.commonName} is the only plant in this family whose record lists ${compound} as an active compound.`,
      };
    }
  }

  for (const slug of plant.ailments) {
    if (countWith((other) => other.ailments.includes(slug)) === 1) {
      const label = slug.replace(/-/g, ' ');
      return {
        stem: `Which of these plants is traditionally used for ${label}?`,
        explanation: `${plant.commonName} is the only plant in this family whose record links it to ${label}.`,
      };
    }
  }

  for (const part of plant.partsUsed) {
    if (countWith((other) => other.partsUsed.includes(part)) === 1) {
      const label = part.replace(/_/g, ' ');
      return {
        stem: `Which of these plants is used by its ${label}?`,
        explanation: `${plant.commonName} is the only plant in this family whose record lists the ${label} as a part used.`,
      };
    }
  }

  const first = plant.partsUsed[0];
  const fallback = first ? first.replace(/_/g, ' ') : 'recorded preparation';
  return {
    stem: `Which of these plants is prepared from its ${fallback}?`,
    explanation: `The record for ${plant.commonName} lists ${fallback} among its parts used.`,
  };
}

async function upsertQuizzes(
  familyOrder: Map<string, PlantSeedRecord[]>,
  plantIds: Map<string, Types.ObjectId>,
): Promise<{ written: number; skipped: string[] }> {
  const skipped: string[] = [];
  let written = 0;

  for (const [family, members] of familyOrder) {
    // A four-option question needs at least four real plants in the family; with fewer we would
    // have to borrow distractors from another family, which would not be discriminating.
    if (members.length < MIN_QUIZ_FAMILY_SIZE) {
      skipped.push(`${family} (${members.length})`);
      continue;
    }

    const usable = members.filter((plant) => plantIds.has(plant.slug));
    if (usable.length < MIN_QUIZ_FAMILY_SIZE) {
      skipped.push(`${family} (${usable.length} resolved)`);
      continue;
    }

    const questions = usable.map((plant) => {
      const fact = distinguishingFact(plant, usable);
      const distractors = usable.filter((other) => other.slug !== plant.slug).map((other) => other.commonName);
      const position = usable.findIndex((other) => other.slug === plant.slug) % MIN_QUIZ_FAMILY_SIZE;
      const options = distractors.slice(0, 3);
      const insertAt = Math.min(position, options.length);
      options.splice(insertAt, 0, plant.commonName);

      return {
        stem: fact.stem,
        options,
        answerIndex: insertAt,
        explanation: fact.explanation,
        plantId: plantIds.get(plant.slug) ?? null,
      };
    });

    await Quiz.findOneAndUpdate(
      { family },
      {
        $set: {
          title: `${family} identification`,
          difficulty: 'easy',
          timeLimitSec: 480,
          plantIds: usable.map((plant) => plantIds.get(plant.slug)),
          questions,
          published: true,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    written += 1;
  }

  return { written, skipped };
}

/**
 * Badge icons are names from client/src/components/icons.tsx (`IconName`); every value below is
 * a real key in that registry, and the actions come from BADGE_ACTIONS. `earn_badge` is not used
 * because it never matches in the badge evaluator.
 */
function badgeSeed(familyParam: string, familySize: number) {
  return [
    {
      key: 'first-plant',
      name: 'First monograph',
      description: 'Read your first plant monograph.',
      criteria: { action: 'read_plant', target: 1, param: null },
      xpReward: 20,
      icon: 'leaf',
    },
    {
      key: 'ten-plants',
      name: 'Field researcher',
      description: 'Read ten plant monographs.',
      criteria: { action: 'read_plant', target: 10, param: null },
      xpReward: 80,
      icon: 'compass',
    },
    {
      key: 'family-complete',
      name: `Family complete: ${familyParam}`,
      description: `Read every ${familyParam} monograph in the encyclopedia.`,
      criteria: { action: 'read_plant_family', target: familySize, param: familyParam },
      xpReward: 120,
      icon: 'grid',
    },
    {
      key: 'first-lesson',
      name: 'First lesson',
      description: 'Complete your first lesson.',
      criteria: { action: 'complete_lesson', target: 1, param: null },
      xpReward: 20,
      icon: 'book-open',
    },
    {
      key: 'five-lessons',
      name: 'Studious',
      description: 'Complete five lessons.',
      criteria: { action: 'complete_lesson', target: 5, param: null },
      xpReward: 60,
      icon: 'book',
    },
    {
      key: 'quiz-pass',
      name: 'Identified',
      description: 'Pass a quiz.',
      criteria: { action: 'complete_quiz', target: 1, param: null },
      xpReward: 40,
      icon: 'check-circle',
    },
    {
      key: 'quiz-ninety',
      name: 'Sharp eye',
      description: 'Score 90 percent or higher on a quiz.',
      criteria: { action: 'quiz_pass_rate', target: 90, param: null },
      xpReward: 100,
      icon: 'sparkles',
    },
    {
      key: 'streak-seven',
      name: 'Seven day streak',
      description: 'Study for seven days in a row.',
      criteria: { action: 'streak_days', target: 7, param: null },
      xpReward: 70,
      icon: 'flame',
    },
    {
      key: 'first-contribution',
      name: 'Contributor',
      description: 'Have your first contribution approved.',
      criteria: { action: 'contribute_post', target: 1, param: null },
      xpReward: 50,
      icon: 'users',
    },
  ];
}

async function upsertBadges(familyParam: string, familySize: number): Promise<number> {
  const badges = badgeSeed(familyParam, familySize);
  for (const badge of badges) {
    await Badge.findOneAndUpdate(
      { key: badge.key },
      { $set: badge },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }
  return badges.length;
}

async function run(): Promise<void> {
  const counts: WriteCounts = { plants: 0, ailments: 0, lessons: 0, quizzes: 0, badges: 0 };

  const broken = brokenPlantSlugs();
  const ailmentIds = await upsertAilments();
  counts.ailments = ailmentIds.size;

  const { idBySlug: plantIds, written: plantCount } = await upsertPlants(ailmentIds, broken);
  counts.plants = plantCount;

  await resolveLookAlikes(plantIds);
  await seedContent(plantIds, counts);

  if (unresolvedRefs.length > 0) {
    console.error(`[seed] ${unresolvedRefs.length} unresolved reference(s):`);
    for (const ref of unresolvedRefs) console.error(`  - ${ref}`);
    console.error('[seed] records with broken references were not written');
    process.exitCode = 1;
  }

  console.log(
    `[seed] written: plants=${counts.plants} ailments=${counts.ailments} lessons=${counts.lessons} ` +
      `quizzes=${counts.quizzes} badges=${counts.badges}`,
  );
  // A mismatch here means a record was dropped (usually a broken reference above) rather than
  // upserted, which is the one thing a re-run must never do silently.
  if (counts.plants !== PLANT_SEED_COUNT || counts.ailments !== AILMENT_SEED_COUNT) {
    console.log(`[seed] expected: plants=${PLANT_SEED_COUNT} ailments=${AILMENT_SEED_COUNT}`);
  }
}

async function seedContent(plantIds: Map<string, Types.ObjectId>, counts: WriteCounts): Promise<void> {
  const familyOrder = new Map<string, PlantSeedRecord[]>();
  for (const plant of plants) {
    if (!plantIds.has(plant.slug)) continue;
    const members = familyOrder.get(plant.family) ?? [];
    members.push(plant);
    familyOrder.set(plant.family, members);
  }

  counts.lessons = await upsertLessons(plantIds);

  const quizResult = await upsertQuizzes(familyOrder, plantIds);
  counts.quizzes = quizResult.written;

  const [topFamily] = [...familyOrder.entries()].sort((a, b) => b[1].length - a[1].length);
  const familyParam = topFamily?.[0] ?? 'Lamiaceae';
  const familySize = topFamily?.[1].length ?? 1;
  counts.badges = await upsertBadges(familyParam, familySize);

  if (quizResult.skipped.length > 0) {
    console.log(
      `[seed] quizzes skipped for ${quizResult.skipped.length} family(ies) with fewer than ${MIN_QUIZ_FAMILY_SIZE} plants: ${quizResult.skipped.join(', ')}`,
    );
  }
}

async function main(): Promise<void> {
  await connectDb();
  try {
    await run();
  } finally {
    // Always disconnect so the process exits even when a write threw.
    await disconnectDb();
  }
}

main().catch((err: unknown) => {
  console.error('[seed] failed:', err);
  process.exitCode = 1;
});
