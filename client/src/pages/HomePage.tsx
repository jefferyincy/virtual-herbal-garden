import { Link } from 'react-router-dom';
import { Icon, type IconName } from '@/components/icons';

const PRIMARY_BTN =
  'inline-flex h-11 items-center justify-center gap-2 rounded-btn bg-accent-500 px-4 font-semibold text-fg-onAccent transition duration-[120ms] ease-base hover:-translate-y-px hover:bg-accent-400 active:scale-[0.985]';
const SECONDARY_BTN =
  'inline-flex h-11 items-center justify-center gap-2 rounded-btn border border-line-strong px-4 text-fg transition duration-[120ms] ease-base hover:-translate-y-px hover:bg-bg-hover active:scale-[0.985]';
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
    body: 'Classical formulation records and single-drug monographs describing how each plant is prepared and used in practice.',
    citation: 'AYUSH · Ministry of Ayush, India',
    href: 'https://www.ayush.gov.in/',
  },
  {
    name: 'WHO monographs',
    body: 'Standardised reference volumes on widely traded medicinal plants, used here for nomenclature and safety entries.',
    citation: 'WHO · Publications',
    href: 'https://www.who.int/publications',
  },
  {
    name: 'Peer-reviewed ethnobotany',
    body: 'Field studies and reviews documenting traditional use alongside modern pharmacology and reported adverse effects.',
    citation: 'PubMed · NIH / NLM',
    href: 'https://pubmed.ncbi.nlm.nih.gov/',
  },
];

export default function HomePage() {
  return (
    <div className="pb-4">
      <section className="grain relative overflow-hidden rounded-panel border border-line-subtle bg-bg-surface">
        <div aria-hidden="true" className="accent-halo pointer-events-none absolute inset-0" />
        <div aria-hidden="true" className="dot-grid pointer-events-none absolute inset-0 opacity-30" />
        <div className="relative px-6 py-14 sm:px-10 sm:py-20">
          <p className="mono-label">Virtual Herbal Garden</p>
          <h1 className="mt-4 max-w-[18ch] text-display text-fg">
            Walk the garden. Learn every plant.
          </h1>
          <p className="mt-6 max-w-reading text-body-lg text-fg-secondary">
            A nocturnal field guide you can move through: regional medicinal plants, their
            preparations, their hazards, and the sources every claim rests on.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link to="/plants" className={PRIMARY_BTN}>
              <Icon name="leaf" size={18} />
              Browse the encyclopedia
            </Link>
            <Link to="/about" className={SECONDARY_BTN}>
              How it works
              <Icon name="arrow-right" size={18} />
            </Link>
          </div>
          <p className="mt-8 inline-flex items-center gap-2 rounded-full bg-accent-tint px-3 py-1 font-mono text-micro uppercase text-accent-400">
            <Icon name="info" size={14} />
            Study aid - not medical advice
          </p>
        </div>
      </section>

      <section className="mt-16">
        <h2 className="text-h2 text-fg">How it works</h2>
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
        <p className="mt-3 max-w-reading text-body text-fg-secondary">
          Seed records cite the categories below. Nothing in the garden is invented: if a field has
          no citable value, it stays empty rather than guessed.
        </p>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {sources.map((source) => (
            <article key={source.name} className={`${L1_CARD} flex flex-col p-6`}>
              <h3 className="text-h3 text-fg">{source.name}</h3>
              <p className="mt-3 flex-1 text-small text-fg-secondary">{source.body}</p>
              <a
                href={source.href}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-5 inline-flex items-center gap-2 font-mono text-micro uppercase text-accent-400 hover:text-accent-500"
              >
                {source.citation}
                <Icon name="external-link" size={14} />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </article>
          ))}
        </div>
      </section>

      <section className={`${L1_CARD} mt-16 p-6 sm:p-8`}>
        <div className="flex flex-wrap items-start gap-4">
          <Icon name="alert-triangle" size={24} className="mt-0.5 shrink-0 text-clay-500" />
          <div className="min-w-0 flex-1">
            <h2 className="text-h3 text-fg">Educational use only</h2>
            <p className="mt-3 max-w-reading text-small text-fg-secondary">
              Every record here is a study aid. Verify any preparation with a qualified
              practitioner before use, and never use a plant you cannot identify with certainty.
            </p>
          </div>
          <Link to="/plants" className={PRIMARY_BTN}>
            Browse the encyclopedia
          </Link>
        </div>
      </section>
    </div>
  );
}
