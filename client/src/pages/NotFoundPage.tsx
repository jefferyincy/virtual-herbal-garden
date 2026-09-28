import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '@/components/icons';

const PRIMARY_BTN =
  'inline-flex h-11 items-center justify-center gap-2 rounded-btn bg-accent-500 px-4 font-semibold text-fg-onAccent transition duration-[120ms] ease-base hover:-translate-y-px hover:bg-accent-400 active:scale-[0.985]';
const SECONDARY_BTN =
  'inline-flex h-11 items-center justify-center gap-2 rounded-btn border border-line-strong px-4 text-fg transition duration-[120ms] ease-base hover:-translate-y-px hover:bg-bg-hover active:scale-[0.985]';
const L1_CARD = 'top-highlight rounded-card border border-line-subtle bg-bg-surface shadow-l1';

type Suggestion = {
  common: string;
  botanical: string;
  image: string;
};

const suggestions: Suggestion[] = [
  {
    common: 'Tulsi',
    botanical: 'Ocimum tenuiflorum',
    image: '/reference/studio_botanical_photography_of_tulsi_holy_basil_ocimum_tenuiflorum_sprig_with.png',
  },
  {
    common: 'Sage',
    botanical: 'Salvia officinalis',
    image: '/reference/dark_moody_botanical_photography_of_fresh_sage_leaves_salvia_officinalis_macro.png',
  },
  {
    common: 'Liquorice',
    botanical: 'Glycyrrhiza glabra',
    image: '/reference/dark_moody_botanical_photography_of_licorice_root_pieces_and_dried_glycyrrhiza.png',
  },
];

export default function NotFoundPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    navigate(trimmed ? `/plants?q=${encodeURIComponent(trimmed)}` : '/plants');
  }

  return (
    <div className="relative flex min-h-[70vh] flex-col items-center justify-center overflow-hidden py-16 text-center">
      <Icon
        name="leaf"
        size={520}
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-fg opacity-[0.05]"
      />

      <div className="relative flex w-full max-w-[560px] flex-col items-center">
        <p className="font-mono text-display text-accent-500">404</p>
        <h2 className="mt-2 text-h2 text-fg">This plant doesn&apos;t grow here</h2>
        <p className="mt-3 text-small text-fg-secondary">
          The page you asked for is not in this garden. Try a search, or one of the specimens below.
        </p>

        <form onSubmit={onSubmit} className="mt-8 flex w-full items-stretch gap-2">
          <label htmlFor="notfound-search" className="sr-only">
            Search plants
          </label>
          <input
            id="notfound-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search plants..."
            className="h-11 min-w-0 flex-1 rounded-input border border-line-subtle bg-bg-surface px-3 text-body text-fg placeholder:text-fg-muted focus:border-accent-600 focus:outline-none"
          />
          <button type="submit" className={PRIMARY_BTN}>
            <Icon name="search" size={18} />
            Search
          </button>
        </form>

        <ul className="mt-10 grid w-full gap-4 sm:grid-cols-3">
          {suggestions.map((plant) => (
            <li key={plant.botanical}>
              <Link
                to="/plants"
                className={`${L1_CARD} block overflow-hidden text-left transition duration-[180ms] ease-base hover:-translate-y-px hover:border-line-strong`}
              >
                <div className="relative aspect-[4/3] bg-bg-surface">
                  <Icon
                    name="leaf"
                    size={40}
                    aria-hidden="true"
                    className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-fg-muted opacity-20"
                  />
                  <img
                    src={plant.image}
                    alt={`${plant.common} (${plant.botanical})`}
                    loading="lazy"
                    className="relative h-full w-full object-cover"
                  />
                </div>
                <div className="p-4">
                  <p className="text-small text-fg">{plant.common}</p>
                  <p className="botanical text-small text-clay-400">{plant.botanical}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link to="/gardens" className={PRIMARY_BTN}>
            <Icon name="grid" size={18} />
            Visit the gardens
          </Link>
          <Link to="/plants" className={SECONDARY_BTN}>
            Search the encyclopedia
          </Link>
        </div>
      </div>
    </div>
  );
}
