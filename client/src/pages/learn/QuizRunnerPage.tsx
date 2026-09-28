import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Icon } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { ErrorState } from '@/components/ui/ErrorState';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Skeleton } from '@/components/ui/Skeleton';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatClock } from '@/lib/format';
import {
  useQuiz,
  useSubmitAttempt,
  type ServedQuestion,
  type SubmitAttemptResponse,
} from '@/features/learn/hooks';

export default function QuizRunnerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const quiz = useQuiz(id);
  const submit = useSubmitAttempt();

  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const startedAt = useRef<number>(Date.now());
  const submitted = useRef(false);
  /**
   * The auto-submit interval is created once and cannot close over fresh state, so the payload it
   * reads comes from refs. Without this a timeout would submit an empty answer sheet.
   */
  const answersRef = useRef<Record<string, number>>({});
  const questionsRef = useRef<ServedQuestion[]>([]);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const questions = useMemo(() => quiz.data?.questions ?? [], [quiz.data]);
  questionsRef.current = questions;
  answersRef.current = answers;

  const total = questions.length;
  const answeredCount = Object.keys(answers).length;
  const current = questions[index];
  const timeLimitSec = quiz.data?.quiz.timeLimitSec ?? 0;

  const finish = (forced: boolean) => {
    if (submitted.current || !id) return;
    submitted.current = true;
    const payload = questionsRef.current.map((question) => ({
      questionId: question._id,
      // Auto-submit at zero may leave questions blank; -1 is the server's "no answer" sentinel.
      chosenIndex: answersRef.current[question._id] ?? -1,
    }));
    const secondsTaken = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
    submit.mutate(
      { quizId: id, answers: payload, secondsTaken },
      {
        onSuccess: (result: SubmitAttemptResponse) => {
          navigate(`/quizzes/${id}/result?attempt=${result.attempt._id}`, { state: result });
        },
        onError: (cause) => {
          submitted.current = false;
          // A 400 means the server rejected the payload (mismatched questions or overtime);
          // stay on the page so the learner keeps their answers.
          setError(
            cause instanceof ApiError
              ? cause.message
              : 'Could not submit this attempt. Check your connection and try again.',
          );
          if (forced) void quiz.refetch();
        },
      },
    );
  };

  /**
   * Countdown. The server allows a grace margin on `secondsTaken`, so a submit that lands a
   * second or two past the limit is still accepted - a small overrun must not fail the attempt.
   */
  useEffect(() => {
    if (timeLimitSec <= 0 || submitted.current) return;
    setRemaining(timeLimitSec);
    const started = Date.now();
    const tick = window.setInterval(() => {
      const left = timeLimitSec - Math.floor((Date.now() - started) / 1000);
      setRemaining(Math.max(0, left));
      if (left <= 0) {
        window.clearInterval(tick);
        finish(true);
      }
    }, 1000);
    return () => window.clearInterval(tick);
  }, [timeLimitSec, id]);

  useEffect(() => {
    startedAt.current = Date.now();
  }, [id]);

  const notFound = quiz.error instanceof ApiError && quiz.error.status === 404;
  const locked = quiz.error instanceof ApiError && quiz.error.status === 403;

  if (quiz.isPending) return <RunnerSkeleton />;

  if (locked) {
    return (
      <div className="mx-auto w-full max-w-reading py-16">
        <EmptyState
          title="This quiz is locked"
          description="Pass the lessons in this family to unlock the quiz."
          watermark="lock"
          action={
            <Link
              to="/learn"
              className="inline-flex h-11 items-center justify-center rounded-btn bg-accent-500 px-4 font-semibold text-fg-onAccent transition-colors duration-100 ease-base hover:bg-accent-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
            >
              Back to lessons
            </Link>
          }
        />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="mx-auto w-full max-w-reading py-16">
        <ErrorState title="Quiz not found" message="That quiz id does not exist or is unpublished.">
          <Link to="/quizzes" className="text-small text-accent-400">
            Back to quizzes
          </Link>
        </ErrorState>
      </div>
    );
  }

  if (quiz.isError || !quiz.data) {
    return (
      <div className="mx-auto w-full max-w-reading py-16">
        <ErrorState
          title="Couldn't load this quiz"
          message="The quiz did not respond."
          onRetry={() => void quiz.refetch()}
        />
      </div>
    );
  }

  if (total === 0 || !current) {
    return (
      <div className="mx-auto w-full max-w-reading py-16">
        <EmptyState
          title="This quiz has no questions"
          description="Nothing to answer yet - the quiz is still being written."
          watermark="book"
        />
      </div>
    );
  }

  const unanswered = total - answeredCount;
  const selected = answers[current._id];
  const atLast = index === total - 1;

  const choose = (optionIndex: number) => {
    setAnswers((prev) => ({ ...prev, [current._id]: optionIndex }));
  };

  const move = (direction: -1 | 1) => {
    setIndex((prev) => Math.min(total - 1, Math.max(0, prev + direction)));
  };

  /** Radiogroup keyboard contract: arrows move the selection, Home/End jump to the ends. */
  const onOptionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, optionIndex: number) => {
    const last = current.options.length - 1;
    let next = optionIndex;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = optionIndex === last ? 0 : optionIndex + 1;
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = optionIndex === 0 ? last : optionIndex - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    else return;
    event.preventDefault();
    choose(next);
    optionRefs.current[next]?.focus();
  };

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 pb-28">
      <div className="flex items-center gap-3">
        <Link
          to="/quizzes"
          aria-label="Back to quizzes"
          className="inline-flex size-11 items-center justify-center rounded-btn text-fg-secondary transition-colors duration-100 ease-base hover:bg-bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
        >
          <Icon name="arrow-left" size={20} />
        </Link>
        <span className="min-w-0 flex-1 truncate text-small text-fg-secondary">
          {quiz.data.quiz.title}
        </span>
        {timeLimitSec > 0 && (
          <span className="font-mono text-body text-fg tabular-nums" aria-live="off">
            {/* Before the first tick the clock reads the full limit rather than blank. */}
            {formatClock(remaining ?? timeLimitSec)}
          </span>
        )}
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <div>
        <p className="mono-label">
          Question {index + 1} of {total}
        </p>
        <ProgressBar className="mt-2" value={answeredCount} max={total} size="sm" label="Answered" />
      </div>

      <Card variant="flat" padding="lg">
        <h1 className="text-h2 text-fg">{current.stem}</h1>

        <div role="radiogroup" aria-label={`Question ${index + 1}`} className="mt-6 flex flex-col gap-2">
          {current.options.map((option, optionIndex) => {
            const isSelected = selected === optionIndex;
            return (
              <button
                key={`${current._id}-${optionIndex}`}
                ref={(node) => {
                  optionRefs.current[optionIndex] = node;
                }}
                type="button"
                role="radio"
                aria-checked={isSelected}
                tabIndex={isSelected || (selected === undefined && optionIndex === 0) ? 0 : -1}
                onClick={() => choose(optionIndex)}
                onKeyDown={(event) => onOptionKeyDown(event, optionIndex)}
                className={cn(
                  'flex min-h-[44px] w-full items-center gap-3 rounded-input border px-4 py-3 text-left text-body transition-colors duration-100 ease-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow',
                  isSelected
                    ? 'border-accent-600 bg-accent-tint text-fg'
                    : 'border-line-subtle text-fg-secondary hover:border-line-strong hover:bg-bg-hover hover:text-fg',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex size-5 shrink-0 items-center justify-center rounded-full border',
                    isSelected ? 'border-accent-500 bg-accent-500' : 'border-line-strong',
                  )}
                >
                  {isSelected && <Icon name="check" size={12} className="text-fg-onAccent" />}
                </span>
                <span className="min-w-0 flex-1">{option}</span>
              </button>
            );
          })}
        </div>
      </Card>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line-subtle bg-bg-base/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[720px] items-center gap-3 px-6 py-3">
          <Button variant="ghost" iconLeft="arrow-left" disabled={index === 0} onClick={() => move(-1)}>
            Back
          </Button>
          <Button
            variant="secondary"
            className="ml-auto"
            iconRight="arrow-right"
            disabled={atLast}
            onClick={() => move(1)}
          >
            Next
          </Button>
          <Button
            loading={submit.isPending}
            disabled={unanswered > 0}
            onClick={() => finish(false)}
          >
            {unanswered > 0 ? `${unanswered} unanswered` : 'Submit'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function RunnerSkeleton() {
  return (
    <div role="status" aria-label="Loading quiz" className="mx-auto flex w-full max-w-[720px] flex-col gap-6">
      <Skeleton width="40%" height={13} />
      <Skeleton width="100%" height={4} />
      <div className="rounded-card border border-line-subtle bg-bg-surface p-6">
        <Skeleton width="80%" height={28} />
        <div className="mt-6 flex flex-col gap-2">
          <Skeleton width="100%" height={44} />
          <Skeleton width="100%" height={44} />
          <Skeleton width="100%" height={44} />
        </div>
      </div>
    </div>
  );
}
