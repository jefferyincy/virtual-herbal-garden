/**
 * Ailment seed records for the Virtual Herbal Garden plant encyclopedia.
 *
 * Pure data module: no imports, no side effects. The 14 slugs below are the only values allowed
 * in a plant record's `ailments` array, and each one is referenced by at least one plant.
 * Descriptions are neutral, system-level framing only - no diagnosis and no treatment advice.
 */

export type AilmentSystem = 'digestive' | 'respiratory' | 'skin' | 'nervous' | 'immune' | 'other';

export type AilmentSeedRecord = {
  slug: string;
  name: string;
  system: AilmentSystem;
  description: string;
};

export const ailmentSeed: AilmentSeedRecord[] = [
  {
    slug: 'indigestion',
    name: 'Indigestion',
    system: 'digestive',
    description:
      'Discomfort in the upper abdomen after eating, commonly described as fullness, bloating or a burning feeling.',
  },
  {
    slug: 'constipation',
    name: 'Constipation',
    system: 'digestive',
    description:
      'Infrequent or difficult passage of stool, often linked to low fibre intake, dehydration or reduced activity.',
  },
  {
    slug: 'nausea',
    name: 'Nausea',
    system: 'digestive',
    description:
      'The sensation of needing to vomit, which can arise from gastrointestinal upset, motion, pregnancy or other causes.',
  },
  {
    slug: 'diarrhoea',
    name: 'Diarrhoea',
    system: 'digestive',
    description:
      'Passage of loose or watery stool more often than usual, most commonly from infection or dietary upset.',
  },
  {
    slug: 'cough',
    name: 'Cough',
    system: 'respiratory',
    description:
      'A reflex that clears the airways, classified as acute or persistent depending on how long it lasts.',
  },
  {
    slug: 'bronchitis',
    name: 'Bronchitis',
    system: 'respiratory',
    description:
      'Inflammation of the bronchial tubes, usually producing a cough with mucus that may be acute or chronic.',
  },
  {
    slug: 'asthma',
    name: 'Asthma',
    system: 'respiratory',
    description:
      'A chronic condition in which the airways narrow and inflame episodically, causing wheeze and breathlessness.',
  },
  {
    slug: 'wounds',
    name: 'Wounds',
    system: 'skin',
    description:
      'Breaks in the skin from injury or surgery, where the body repairs tissue through overlapping healing phases.',
  },
  {
    slug: 'acne',
    name: 'Acne',
    system: 'skin',
    description:
      'A common inflammatory condition of the pilosebaceous follicles, typically involving the face, chest and back.',
  },
  {
    slug: 'inflammation',
    name: 'Inflammation',
    system: 'skin',
    description:
      'The immune system response that follows injury or irritation and shows as redness, heat, swelling or pain.',
  },
  {
    slug: 'anxiety',
    name: 'Anxiety',
    system: 'nervous',
    description:
      'Persistent worry or tension that can occur with physical arousal such as a racing heart or restlessness.',
  },
  {
    slug: 'poor-memory',
    name: 'Poor memory',
    system: 'nervous',
    description:
      'Difficulty retaining or recalling information, which ranges from ordinary lapses to cognitive impairment.',
  },
  {
    slug: 'weak-immunity',
    name: 'Weak immunity',
    system: 'immune',
    description:
      'A general description of frequent or prolonged infections, which may reflect immune function or other factors.',
  },
  {
    slug: 'fever',
    name: 'Fever',
    system: 'immune',
    description:
      'A rise in body temperature above the normal range, most often a response to infection.',
  },
];

export const AILMENT_SEED_COUNT: number = ailmentSeed.length;
