import { Icon, type IconName } from '@/components/icons';

const L1_CARD = 'top-highlight rounded-card border border-line-subtle bg-bg-surface shadow-l1';

type Step = {
  n: string;
  icon: IconName;
  title: string;
  lines: [string, string];
};

const steps: Step[] = [
  {
    n: '01',
    icon: 'compass',
    title: 'Explore',
    lines: [
      'Browse the encyclopedia by medical system, ailment or region.',
      'Every plant opens into a full illustrated profile.',
    ],
  },
  {
    n: '02',
    icon: 'search',
    title: 'Inspect',
    lines: [
      'Read taxonomy, plant parts, preparations and reported toxicity.',
      'Each field links back to the source it was drawn from.',
    ],
  },
  {
    n: '03',
    icon: 'book-open',
    title: 'Learn',
    lines: [
      'Work through lessons and spaced-repetition review cards.',
      'Quiz yourself and let progress accumulate in the background.',
    ],
  },
  {
    n: '04',
    icon: 'award',
    title: 'Master',
    lines: [
      'Track mastery per plant and collect the achievement badges.',
      'Grow a garden that maps exactly what you actually know.',
    ],
  },
];

type Source = {
  name: string;
  body: string;
  citation: string;
  href: string;
};

const sources: Source[] = [
  {
    name: 'Ayurvedic pharmacopoeia',
    body: 'The classical and modern compendia of Ayurvedic medicine contribute formulation records and single-drug monographs: which plant part is used, how it is prepared, and the traditional indications attached to it. It is the reason the garden speaks about preparations and dosing units at all.',
    citation: 'AYUSH · Ministry of Ayush, India',
    href: 'https://www.ayush.gov.in/',
  },
  {
    name: 'WHO monographs',
    body: 'The World Health Organization publishes standardised monographs on widely traded medicinal plants. They contribute controlled nomenclature, a defined list of plant parts and a conservative safety position, which anchors the toxicity and look-alike entries that appear on each profile.',
    citation: 'WHO · Publications',
    href: 'https://www.who.int/publications',
  },
  {
    name: 'Peer-reviewed ethnobotany',
    body: 'Peer-reviewed field studies and reviews contribute the documented traditional use of a plant next to what modern pharmacology and clinical reporting say about it. Where a trial disagrees with tradition, both are shown - the garden does not resolve the conflict for you.',
    citation: 'PubMed · NIH / NLM',
    href: 'https://pubmed.ncbi.nlm.nih.gov/',
  },
];

type Phase = { tag: string; label: string };

const phases: Phase[] = [
  { tag: 'P0', label: 'Scaffold, theme, layout shell and navigation - the frame every later screen sits in.' },
  { tag: 'P1', label: 'Accounts: register, sign in, password reset and protected routes.' },
  { tag: 'P2', label: 'The encyclopedia: plant model, seeded records, search, filters and detail pages.' },
  { tag: 'P3', label: 'The garden itself: the 3D plot, placement mode and your saved gardens.' },
  { tag: 'P4', label: 'Learning: lessons, quizzes, spaced-repetition cards, progress and badges.' },
  { tag: 'P5', label: 'Community: posts, comments, upvotes and the moderation queue.' },
  { tag: 'P6', label: 'Administration: plant CMS, user and quiz management, moderation tools.' },
  { tag: 'P7', label: 'One smart feature: photo identification or the cited research assistant.' },
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-[900px]">
      <h1 className="text-h1 text-fg">How it works</h1>
      <p className="mt-4 max-w-reading text-body-lg text-fg-secondary">
        A garden is only useful if you can trust what grows in it. Here is the path a visitor
        takes, where the material comes from, and what the project deliberately refuses to do.
      </p>

      <section className="mt-14">
        <h2 className="text-h2 text-fg">The path through the garden</h2>
        <div className="relative mt-10">
          <div
            aria-hidden="true"
            className="absolute left-0 right-0 top-5 hidden border-t border-dashed border-accent-600/50 md:block"
          />
          <ol className="relative grid gap-10 md:grid-cols-4 md:gap-6">
            {steps.map((step) => (
              <li key={step.n}>
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-accent-600 bg-bg-base font-mono text-micro text-accent-400">
                    {step.n}
                  </span>
                  <Icon name={step.icon} size={20} className="text-fg-muted" />
                </div>
                <h3 className="mt-4 text-h3 text-fg">{step.title}</h3>
                <div className="mt-2 max-w-reading space-y-1 text-small text-fg-secondary">
                  {step.lines.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mt-16">
        <h2 className="text-h2 text-fg">Where the data comes from</h2>
        <div className="mt-8 space-y-6">
          {sources.map((source) => (
            <article key={source.name} className={`${L1_CARD} p-6`}>
              <h3 className="text-h3 text-fg">{source.name}</h3>
              <p className="mt-3 max-w-reading text-body text-fg-secondary">{source.body}</p>
              <a
                href={source.href}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-4 inline-flex items-center gap-2 font-mono text-micro uppercase text-accent-400 hover:text-accent-500"
              >
                {source.citation}
                <Icon name="external-link" size={14} />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-16">
        <h2 className="text-h2 text-fg">Disclaimer</h2>
        <div className={`${L1_CARD} mt-6 p-6`}>
          <div className="flex items-start gap-4">
            <Icon name="alert-triangle" size={24} className="mt-0.5 shrink-0 text-clay-500" />
            <div className="min-w-0 flex-1 space-y-4 text-body text-fg-secondary">
              <p className="max-w-reading">
                This garden is an educational reference, not a medical service. Nothing here is
                advice, diagnosis or a prescription. Verify any plant with a qualified practitioner
                and never use a plant you cannot identify with certainty.
              </p>
              <p className="max-w-reading">
                Dosage figures appear only where a citable source exists. Where the literature is
                silent, the field is intentionally absent rather than estimated - a blank is an
                honest answer.
              </p>
              <p className="max-w-reading">
                Every record carries its sources, so any claim can be checked against the material
                it came from rather than taken on our word.
              </p>
              <p className="max-w-reading">
                Toxicity is always marked. A plant being traditional does not make it safe, and a
                safe dose of one preparation is not a safe dose of another.
              </p>
              <p className="max-w-reading">
                Look-alike notes exist because misidentification is the main real-world hazard:
                several dangerous species resemble edible or medicinal ones closely enough to fool
                an experienced eye.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-16">
        <h2 className="text-h2 text-fg">Roadmap</h2>
        <ul className="mt-6 space-y-4">
          {phases.map((phase) => (
            <li key={phase.tag} className="flex items-start gap-4">
              <span className="mt-0.5 inline-flex min-w-[3.5rem] shrink-0 items-center justify-center rounded-full bg-accent-tint px-3 py-1 font-mono text-micro uppercase text-accent-400">
                {phase.tag}
              </span>
              <p className="max-w-reading text-body text-fg-secondary">{phase.label}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
