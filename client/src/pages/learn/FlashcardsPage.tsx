import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@/components/icons';
import { Card } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Skeleton } from '@/components/ui/Skeleton';
import { Watermark } from '@/components/ui/Watermark';
import { cn } from '@/lib/cn';
import { useDueFlashcards, useGradeFlashcard, useMyProgress } from '@/features/learn/hooks';
import type { SrsRating } from '@/types/api';

const RATINGS: SrsRating[] = ['again', 'hard', 'good', 'easy'];

const RATING_LABEL: Record<SrsRating, string> = {
  again: 'Again',
  hard: 'Hard',
  good: 'Good',
  easy: 'Easy',
};

/** `good` carries the accent treatment; the rest stay outlined so the ramp reads as a scale. */
const RATING_TONE: Record<SrsRating, string> = {
  again: 'border-line-strong hover:border-danger hover:bg-danger-tint',
  hard: 'border-line-strong hover:border-warning hover:bg-bg-hover',
  good: 'border-accent-600 bg-accent-tint hover:bg-accent-tint',
  easy: 'border-line-strong hover:border-accent-600 hover:bg-bg-hover',
};

export default function FlashcardsPage() {
  const [limit, setLimit] = useState(20);
  const due = useDueFlashcards(limit);
  const grade = useGradeFlashcard();
  const progress = useMyProgress();

  const [reviewed, setReviewed] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [lastInterval, setLastInterval] = useState<string | null>(null);

  const card = due.data?.items[0];
  const remaining = due.data?.items.length ?? 0;
  const sessionTotal = reviewed + remaining;
  const previews = grade.data?.previewIntervals;

  const rate = (rating: SrsRating) => {
    if (!card) return;
    grade.mutate(
      { plantId: card.plantId, rating },
      {
        onSuccess: (result) => {
          // The mutation invalidates the due queue, so the graded card leaves the head of the list
          // on its own - the local counter only feeds the progress bar and the completed summary.
          setLastInterval(result.intervalLabel);
          setReviewed((count) => count + 1);
          setFlipped(false);
        },
      },
    );
  };

  const dueCount = due.data?.dueCount ?? 0;
  const newAvailable = due.data?.newAvailable ?? 0;

  return (
    <div className="flex min-h-screen flex-col bg-bg-base">
      <header className="border-b border-line-subtle px-6 py-3">
        <div className="mx-auto flex w-full max-w-content items-center gap-3">
          <Link
            to="/learn"
            aria-label="Back to lessons"
            className="inline-flex size-11 items-center justify-center rounded-btn text-fg-secondary transition-colors duration-100 ease-base hover:bg-bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
          >
            <Icon name="arrow-left" size={20} />
          </Link>
          <span className="mono-label shrink-0">{dueCount} cards due</span>
          <ProgressBar
            className="mx-2 min-w-0 flex-1"
            value={reviewed}
            max={Math.max(1, sessionTotal)}
            size="sm"
          />
          {lastInterval && <span className="mono-label shrink-0">Next in {lastInterval}</span>}
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-[560px]">
          {due.isPending && <CardSkeleton />}

          {due.isError && (
            <ErrorState
              title="Couldn't load your review queue"
              message="The flashcard queue did not respond."
              onRetry={() => void due.refetch()}
            />
          )}

          {!due.isPending && !due.isError && card && (
            <>
              <button
                type="button"
                aria-pressed={flipped}
                onClick={() => setFlipped((prev) => !prev)}
                className="w-full rounded-card border border-line-subtle bg-bg-surface p-8 text-left top-highlight shadow-l1 transition-transform duration-100 ease-base hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
              >
                {flipped ? (
                  <div className="flex flex-col gap-3">
                    <span className="mono-label">Back · {reviewed + 1} of {sessionTotal}</span>
                    <span className="text-h2 text-fg">{card.plant.commonName}</span>
                    <span className="botanical text-body-lg text-clay-400">
                      {card.plant.botanicalName}
                    </span>
                    <span className="text-small text-fg-secondary">
                      Family · {card.plant.family}
                    </span>
                    <span className="mono-label">
                      Part used · {card.plant.partsUsed[0] ?? 'not recorded'}
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-6 py-6 text-center">
                    <span className="mono-label">Front · {reviewed + 1} of {sessionTotal}</span>
                    {card.plant.images[0] ? (
                      <img
                        src={card.plant.images[0].url}
                        alt={card.plant.images[0].alt}
                        className="max-h-40 rounded-input object-cover"
                      />
                    ) : (
                      <span className="relative flex h-40 w-full items-center justify-center">
                        <Watermark name="leaf" size={120} />
                      </span>
                    )}
                    <span className="text-h2 text-fg">{card.question}</span>
                  </div>
                )}
              </button>

              {!flipped && (
                <p className="mt-4 text-center text-small text-fg-muted">
                  Tap to flip
                </p>
              )}

              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {RATINGS.map((rating) => (
                  <button
                    key={rating}
                    type="button"
                    disabled={grade.isPending}
                    onClick={() => rate(rating)}
                    className={cn(
                      'flex min-h-[44px] flex-col items-start gap-1 rounded-card border px-4 py-3 text-left transition-colors duration-100 ease-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow disabled:cursor-not-allowed disabled:opacity-50',
                      RATING_TONE[rating],
                    )}
                  >
                    <span className="text-small text-fg">{RATING_LABEL[rating]}</span>
                    <span className="font-mono text-micro uppercase text-fg-muted">
                      {/* Intervals come only from the grade response, so the first card of a
                          session has nothing to preview and shows a dash rather than a guess. */}
                      {previews?.[rating] ?? '—'}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          {!due.isPending && !due.isError && !card && (
            <Card variant="flat" padding="none" className="text-center">
              {reviewed > 0 ? (
                <div className="flex flex-col items-center gap-3 px-6 py-12">
                  <Icon name="check-circle" size={32} className="text-accent-400" />
                  <h2 className="text-h3 text-fg">Session complete</h2>
                  <p className="max-w-reading text-small text-fg-secondary">
                    You reviewed {reviewed} {reviewed === 1 ? 'card' : 'cards'}.
                  </p>
                  <div className="mt-2 flex flex-wrap justify-center gap-3">
                    <Link
                      to="/learn"
                      className="inline-flex h-11 items-center justify-center rounded-btn bg-accent-500 px-4 font-semibold text-fg-onAccent transition-colors duration-100 ease-base hover:bg-accent-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
                    >
                      Back to lessons
                    </Link>
                    <Link
                      to="/plants"
                      className="inline-flex h-11 items-center justify-center rounded-btn border border-line-strong px-4 text-fg transition-colors duration-100 ease-base hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
                    >
                      Browse plants
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 px-6 py-12">
                  <Icon name="sparkles" size={32} className="text-accent-400" />
                  <h2 className="text-h3 text-fg">Nothing due right now</h2>
                  <p className="max-w-reading text-small text-fg-secondary">
                    {newAvailable > 0
                      ? `${newAvailable} new ${newAvailable === 1 ? 'plant is' : 'plants are'} ready to learn. Read a plant to add it to your review queue.`
                      : 'Your queue is clear. Read more plants to build it up.'}
                  </p>
                  <Link
                    to="/plants"
                    className="mt-2 inline-flex h-11 items-center justify-center rounded-btn bg-accent-500 px-4 font-semibold text-fg-onAccent transition-colors duration-100 ease-base hover:bg-accent-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
                  >
                    Read plants
                  </Link>
                </div>
              )}
            </Card>
          )}
        </div>
      </main>

      <footer className="border-t border-line-subtle px-6 py-3">
        <div className="mx-auto flex w-full max-w-content items-center gap-2">
          <Icon name="flame" size={16} className="text-warning" />
          <span className="mono-label">
            Streak {progress.data?.streak.current ?? 0} · level {progress.data?.level ?? '—'}
          </span>
          {(due.data?.total ?? 0) > limit && (
            <button
              type="button"
              className="ml-auto rounded-btn text-small text-fg-secondary transition-colors duration-100 ease-base hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
              onClick={() => setLimit((prev) => prev + 20)}
            >
              Load more
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div role="status" aria-label="Loading flashcards">
      <Skeleton variant="card" height={320} />
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {RATINGS.map((rating) => (
          <Skeleton key={rating} variant="card" height={64} />
        ))}
      </div>
    </div>
  );
}
