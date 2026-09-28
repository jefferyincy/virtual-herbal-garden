import { Link, useLocation, useParams } from 'react-router-dom';
import { Icon } from '@/components/icons';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { ErrorState } from '@/components/ui/ErrorState';
import { HexBadgeTile } from '@/components/ui/HexBadgeTile';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { useQuizAttempts, type SubmitAttemptResponse } from '@/features/learn/hooks';

/**
 * The attempt payload (per-question correct answers and explanations) is only ever returned by
 * `POST /api/quizzes/:id/attempt`; there is no `GET /api/attempts/:id`. So the response is handed
 * over through router state. A refresh drops that state, and the fallback below re-reads
 * `GET /api/quizzes/:id/attempts` for the score summary only - the detailed review cannot be
 * recovered, and the page says so instead of inventing one.
 */
export default function QuizResultPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const state = location.state as SubmitAttemptResponse | null;

  // Passing no id disables the fallback entirely when the submission payload is already in hand,
  // so the result screen never pays for a second request it will not read.
  const attempts = useQuizAttempts(state ? undefined : id, 1);
  const latest = attempts.data?.items[0] ?? null;

  if (state) return <ResultView result={state} quizId={id ?? ''} />;

  if (attempts.isPending) {
    return (
      <div role="status" aria-label="Loading result" className="mx-auto w-full max-w-[720px] py-10">
        <Skeleton width="30%" height={56} />
        <Skeleton className="mt-4" width="100%" height={4} />
        <Skeleton className="mt-8" width="100%" height={120} />
      </div>
    );
  }

  if (attempts.isError) {
    return (
      <div className="mx-auto w-full max-w-reading py-16">
        <ErrorState
          title="Couldn't load this result"
          message="The attempt summary did not respond."
          onRetry={() => void attempts.refetch()}
        />
      </div>
    );
  }

  if (!latest) {
    return (
      <div className="mx-auto w-full max-w-reading py-16">
        <EmptyState
          title="No attempts recorded"
          description="This quiz has no submitted attempts yet."
          watermark="chart"
          action={
            <Link
              to={id ? `/quizzes/${id}` : '/quizzes'}
              className="inline-flex h-11 items-center justify-center rounded-btn bg-accent-500 px-4 font-semibold text-fg-onAccent transition-colors duration-100 ease-base hover:bg-accent-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
            >
              Take the quiz
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 py-10">
      <ErrorBanner message="Detailed review is unavailable after a refresh - it is only returned at submission time." />
      <SummaryCard
        score={latest.score}
        total={latest.total}
        xpAwarded={latest.xpAwarded}
        passed={attempts.data?.passed ?? false}
        badges={[]}
      />
      <div className="flex flex-wrap gap-3">
        <Link
          to={id ? `/quizzes/${id}` : '/quizzes'}
          className="inline-flex h-11 items-center justify-center rounded-btn bg-accent-500 px-4 font-semibold text-fg-onAccent transition-colors duration-100 ease-base hover:bg-accent-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
        >
          Retry quiz
        </Link>
        <Link to="/quizzes" className="inline-flex h-11 items-center justify-center rounded-btn border border-line-strong px-4 text-fg transition-colors duration-100 ease-base hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow">
          Back to quizzes
        </Link>
      </div>
    </div>
  );
}

function ResultView({ result, quizId }: { result: SubmitAttemptResponse; quizId: string }) {
  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-8 py-10">
      <SummaryCard
        score={result.attempt.score}
        total={result.attempt.total}
        xpAwarded={result.attempt.xpAwarded}
        passed={result.passed}
        levelUp={result.levelUp}
        level={result.level}
        badges={result.badgesEarned}
      />

      <section>
        <h2 className="mb-4 text-h2 text-fg">Review</h2>
        <ol className="flex flex-col gap-4">
          {result.results.map((row, index) => (
            <li key={row.questionId}>
              <Card variant="flat" padding="lg" className="flex flex-col gap-4">
                <div className="flex items-start gap-3">
                  <span className="mono-label mt-1 shrink-0">{String(index + 1).padStart(2, '0')}</span>
                  <h3 className="min-w-0 flex-1 text-h3 text-fg">{row.stem}</h3>
                  <Icon
                    name={row.correct ? 'check-circle' : 'x-circle'}
                    size={20}
                    className={cn('shrink-0', row.correct ? 'text-accent-400' : 'text-danger')}
                  />
                </div>

                <ul className="flex flex-col gap-2">
                  {row.options.map((option, optionIndex) => {
                    const isAnswer = optionIndex === row.answerIndex;
                    const isChosen = optionIndex === row.chosenIndex;
                    return (
                      <li
                        key={`${row.questionId}-${optionIndex}`}
                        className={cn(
                          'flex items-start gap-3 rounded-input border px-4 py-2.5 text-small',
                          isAnswer
                            ? 'border-accent-600 bg-accent-tint text-fg'
                            : isChosen
                              ? 'border-danger bg-danger-tint text-fg'
                              : 'border-line-subtle text-fg-secondary',
                        )}
                      >
                        <span className="min-w-0 flex-1">{option}</span>
                        {isAnswer && <span className="mono-label shrink-0 text-accent-400">Correct</span>}
                        {isChosen && !isAnswer && (
                          <span className="mono-label shrink-0 text-danger">Your answer</span>
                        )}
                      </li>
                    );
                  })}
                </ul>

                {row.explanation && (
                  <p className="reading-measure border-l-[3px] border-accent-600 pl-4 text-small text-fg-secondary">
                    {row.explanation}
                  </p>
                )}
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <div className="flex flex-wrap gap-3">
        <Link
          to={`/quizzes/${quizId}`}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-btn bg-accent-500 px-4 font-semibold text-fg-onAccent transition-[background-color,transform] duration-100 ease-base hover:bg-accent-400 active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
        >
          <Icon name="refresh" size={18} />
          Retry quiz
        </Link>
        <Link
          to="/quizzes"
          className="inline-flex h-11 items-center justify-center rounded-btn border border-line-strong px-4 text-fg transition-colors duration-100 ease-base hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
        >
          Back to quizzes
        </Link>
      </div>
    </div>
  );
}

function SummaryCard({
  score,
  total,
  xpAwarded,
  passed,
  levelUp = false,
  level,
  badges,
}: {
  score: number;
  total: number;
  xpAwarded: number;
  passed: boolean;
  levelUp?: boolean;
  level?: number;
  badges: Array<{ key: string; name: string; icon: string }>;
}) {
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;

  return (
    <Card variant="flat" padding="lg" className="border-accent-600">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mono-label">Score</p>
          <p className="mt-1 text-display text-fg tabular-nums">
            {score}
            <span className="text-h2 text-fg-muted">/{total}</span>
          </p>
        </div>
        <Chip tone={passed ? 'accent' : 'warning'}>
          {passed ? 'Passed' : 'Not passed'}
        </Chip>
      </div>

      <ProgressBar
        className="mt-5"
        value={score}
        max={total}
        tone={passed ? 'accent' : 'warning'}
        label={`${pct}% correct`}
      />

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1 rounded-full bg-accent-tint px-2.5 py-1 font-mono text-micro uppercase text-accent-400">
          +{xpAwarded} XP
        </span>
        {levelUp && typeof level === 'number' && (
          <span className="inline-flex items-center gap-1 font-mono text-micro uppercase text-accent-400">
            <Icon name="arrow-up" size={14} />
            Level {level}
          </span>
        )}
      </div>

      {badges.length > 0 && (
        <div className="mt-6">
          <p className="mono-label mb-3">Badges earned</p>
          <div className="flex flex-wrap items-start gap-4">
            {badges.map((badge) => (
              <HexBadgeTile key={badge.key} name={badge.name} icon={badge.icon} unlocked size={64} />
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
