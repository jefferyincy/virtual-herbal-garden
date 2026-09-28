import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@/components/icons';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FilterChip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { SkeletonPlantGrid } from '@/components/ui/Skeleton';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/cn';
import {
  useQuizzes,
  type QuizDifficulty,
  type QuizListItem,
} from '@/features/learn/hooks';

type DifficultyFilter = QuizDifficulty | 'all';

const DIFFICULTIES: DifficultyFilter[] = ['all', 'easy', 'medium', 'hard'];

/** Difficulty is a three-dot ramp; the word beside it keeps colour from being the only signal. */
const DIFFICULTY_FILLED: Record<QuizDifficulty, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
};

const DIFFICULTY_LABEL: Record<QuizDifficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};

export default function QuizzesPage() {
  const [query, setQuery] = useState('');
  const [difficulty, setDifficulty] = useState<DifficultyFilter>('all');
  const { groups, isPending, isError, refetch } = useQuizzes({ q: query, difficulty });

  const totalShown = groups.reduce((sum, group) => sum + group.quizzes.length, 0);

  return (
    <div className="mx-auto w-full max-w-content">
      <PageHeader
        title="Quizzes"
        eyebrow="Learn"
        description="Self-check under a clock. Every question is drawn from the published monographs."
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Input
          aria-label="Search quizzes"
          icon="search"
          placeholder="Search quizzes"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          containerClassName="max-w-xs"
        />
        <div role="group" aria-label="Difficulty" className="flex flex-wrap items-center gap-2">
          {DIFFICULTIES.map((value) => (
            <FilterChip
              key={value}
              active={difficulty === value}
              onClick={() => setDifficulty(value)}
            >
              {value === 'all' ? 'All' : DIFFICULTY_LABEL[value]}
            </FilterChip>
          ))}
        </div>
      </div>

      {isPending && <SkeletonPlantGrid count={6} columns={3} />}

      {isError && (
        <ErrorState
          title="Couldn't load quizzes"
          message="The quiz catalogue did not respond."
          onRetry={() => void refetch()}
        />
      )}

      {!isPending && !isError && totalShown === 0 && (
        <EmptyState
          title="No quizzes match these filters"
          description="Clear the search or switch back to All difficulties."
          watermark="search"
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setQuery('');
                setDifficulty('all');
              }}
            >
              Clear filters
            </Button>
          }
        />
      )}

      {!isPending && !isError && totalShown > 0 && (
        <div className="flex flex-col gap-14">
          {groups.map((group) => (
            <section key={group.family}>
              <h2 className="mb-4 text-h2 text-fg">{group.family}</h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {group.quizzes.map((quiz) => (
                  <QuizCard key={quiz._id} quiz={quiz} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function QuizCard({ quiz }: { quiz: QuizListItem }) {
  const minutes = Math.max(1, Math.round(quiz.timeLimitSec / 60));
  const attempted = quiz.bestPct !== null;
  const dots = DIFFICULTY_FILLED[quiz.difficulty];

  if (quiz.locked) {
    const progress = quiz.unlockProgress;
    return (
      <Card variant="flat" padding="lg" className="flex flex-col gap-4 opacity-60">
        <div className="flex items-start gap-3">
          <Avatar name={quiz.title} size={40} />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-h3 text-fg-secondary">{quiz.title}</h3>
            <p className="mono-label mt-1">
              {quiz.questionCount} questions · {minutes} min
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-fg-muted">
          <Icon name="lock" size={16} />
          <span className="mono-label">Pass 3 lessons to unlock</span>
        </div>
        {progress && (
          <ProgressBar
            value={progress.lessonsCompleted}
            max={progress.lessonsNeeded}
            size="sm"
            label={`${progress.lessonsCompleted} of ${progress.lessonsNeeded} lessons`}
          />
        )}
      </Card>
    );
  }

  return (
    <Card variant="flat" padding="lg" className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <Avatar name={quiz.title} size={40} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-h3 text-fg">{quiz.title}</h3>
          <p className="mono-label mt-1">
            {quiz.questionCount} questions · {minutes} min
          </p>
        </div>
        {quiz.passed && (
          <Icon name="check-circle" size={18} className="shrink-0 text-accent-400" />
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2" title={`Difficulty ${DIFFICULTY_LABEL[quiz.difficulty]}`}>
          <span aria-hidden="true" className="flex items-center gap-1">
            {[0, 1, 2].map((index) => (
              <span
                key={index}
                className={cn(
                  'size-1.5 rounded-full',
                  index < dots ? 'bg-accent-500' : 'bg-line-strong',
                )}
              />
            ))}
          </span>
          <span className="mono-label">{DIFFICULTY_LABEL[quiz.difficulty]}</span>
        </span>

        {attempted && (
          <span className="inline-flex items-center gap-1 rounded-full bg-accent-tint px-2 py-0.5 font-mono text-micro uppercase text-accent-400">
            {Math.round(quiz.bestPct ?? 0)}%
          </span>
        )}
      </div>

      {quiz.passed ? (
        <Link
          to={`/quizzes/${quiz._id}`}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-btn border border-line-strong text-body text-fg transition-colors duration-100 ease-base hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
        >
          Retry
        </Link>
      ) : (
        <Link
          to={`/quizzes/${quiz._id}`}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-btn bg-accent-500 text-body font-semibold text-fg-onAccent transition-[background-color,transform] duration-100 ease-base hover:bg-accent-400 active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
        >
          Start
        </Link>
      )}
    </Card>
  );
}
