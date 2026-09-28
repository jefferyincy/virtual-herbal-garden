import { Link } from 'react-router-dom';
import { Icon } from '@/components/icons';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { HexBadgeRow } from '@/components/ui/HexBadgeTile';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Skeleton } from '@/components/ui/Skeleton';
import { useLessons, useMyProgress, type LessonGroup } from '@/features/learn/hooks';
import { useSession } from '@/stores/session';
import { cn } from '@/lib/cn';

const PRIMARY_LINK =
  'inline-flex h-11 items-center justify-center gap-2 rounded-btn bg-accent-500 px-4 font-semibold text-fg-onAccent transition-[background-color,transform] duration-100 ease-base hover:bg-accent-400 active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base';

export default function LearnPage() {
  const lessons = useLessons();
  const authed = useSession((s) => s.status === 'authenticated');
  const progress = useMyProgress();

  const groups: LessonGroup[] = lessons.data?.groups ?? [];
  const totalLessons = groups.reduce((sum, group) => sum + group.lessons.length, 0);
  const completedLessons = groups.reduce(
    (sum, group) => sum + group.lessons.filter((lesson) => lesson.completed).length,
    0,
  );
  const nextLesson = lessons.data?.nextLesson ?? null;

  return (
    <div className="mx-auto w-full max-w-content">
      <PageHeader
        title="Lessons"
        eyebrow="Learn"
        description="Short, sourced monographs from the garden. Finish a lesson to earn XP toward your next level."
      />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          {lessons.isPending && <LessonsSkeleton />}

          {lessons.isError && (
            <ErrorState
              title="Couldn't load lessons"
              message="The lesson index did not respond."
              onRetry={() => void lessons.refetch()}
            />
          )}

          {!lessons.isPending && !lessons.isError && totalLessons === 0 && (
            <EmptyState
              title="No lessons yet"
              description="Lessons are derived from the published plant monographs. Check back once the garden is seeded."
              watermark="book-open"
              action={
                <Link to="/plants" className={PRIMARY_LINK}>
                  Browse plants
                </Link>
              }
            />
          )}

          {!lessons.isPending && !lessons.isError && totalLessons > 0 && (
            <div className="flex flex-col gap-10">
              {nextLesson && (
                <Card variant="flat" className="border-accent-600" padding="lg">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="mono-label text-accent-400">Continue</p>
                      <h2 className="mt-1 text-h3 text-fg">{nextLesson.title}</h2>
                      <p className="mt-1 font-mono text-micro uppercase text-fg-muted">
                        {completedLessons} of {totalLessons} complete
                      </p>
                    </div>
                    <Link to={`/learn/lesson/${nextLesson.slug}`} className={PRIMARY_LINK}>
                      Continue
                      <Icon name="arrow-right" size={18} />
                    </Link>
                  </div>
                  <ProgressBar
                    className="mt-5"
                    value={completedLessons}
                    max={totalLessons}
                    label="Course progress"
                  />
                </Card>
              )}

              {groups.map((group) => (
                <section key={group.section}>
                  <h2 className="mono-label mb-3">{group.section}</h2>
                  <ul className="overflow-hidden rounded-card border border-line-subtle bg-bg-surface">
                    {group.lessons.map((lesson) => (
                      <li key={lesson._id} className="border-b border-line-subtle last:border-b-0">
                        <Link
                          to={`/learn/lesson/${lesson.slug}`}
                          className="flex min-h-[44px] items-center gap-4 px-4 py-3 transition-colors duration-100 ease-base hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
                        >
                          <span className="w-6 shrink-0 font-mono text-micro text-fg-muted">
                            {String(lesson.order + 1).padStart(2, '0')}
                          </span>
                          <span
                            className={cn(
                              'min-w-0 flex-1 truncate text-body',
                              lesson.completed ? 'text-fg-secondary' : 'text-fg',
                            )}
                          >
                            {lesson.title}
                          </span>
                          <span className="mono-label shrink-0">{lesson.estMinutes} min</span>
                          {lesson.completed && (
                            <Icon
                              name="check-circle"
                              size={18}
                              className="shrink-0 text-accent-400"
                            />
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>

        {authed && (
          <aside className="flex flex-col gap-8">
            <section>
              <h2 className="mono-label mb-3">Your badges</h2>
              {progress.isPending ? (
                <div className="flex gap-4">
                  <Skeleton variant="circle" width={72} height={72} />
                  <Skeleton variant="circle" width={72} height={72} />
                </div>
              ) : progress.isError ? (
                <p className="text-small text-fg-secondary">Badges unavailable right now.</p>
              ) : (progress.data?.badges.length ?? 0) === 0 ? (
                <p className="text-small text-fg-secondary">
                  No badges yet - finish a lesson to start collecting them.
                </p>
              ) : (
                <HexBadgeRow badges={progress.data?.badges ?? []} max={6} />
              )}
            </section>

            <section>
              <h2 className="mono-label mb-3">Streak</h2>
              {progress.isPending ? (
                <Skeleton width="60%" height={28} />
              ) : (
                <div className="flex items-center gap-2 text-fg">
                  <Icon name="flame" size={20} className="text-warning" />
                  <span className="font-mono text-h3">{progress.data?.streak.current ?? 0}</span>
                  <span className="text-small text-fg-secondary">day streak</span>
                </div>
              )}
            </section>

            <section>
              <Link
                to="/progress"
                className="inline-flex items-center gap-1 rounded-btn text-small text-accent-400 transition-colors duration-100 ease-base hover:text-accent-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
              >
                Full progress
                <Icon name="arrow-right" size={14} />
              </Link>
            </section>
          </aside>
        )}
      </div>
    </div>
  );
}

/** Skeleton rows matching the section + lesson-row rhythm so the layout does not jump. */
function LessonsSkeleton() {
  return (
    <div role="status" aria-label="Loading lessons" className="flex flex-col gap-10">
      <div className="rounded-card border border-accent-600 bg-bg-surface p-6">
        <Skeleton width={80} height={11} />
        <Skeleton className="mt-3" width="50%" height={20} />
        <Skeleton className="mt-4" width="100%" height={4} />
      </div>
      {[0, 1].map((section) => (
        <div key={section}>
          <Skeleton width={120} height={11} />
          <div className="mt-3 overflow-hidden rounded-card border border-line-subtle bg-bg-surface">
            {[0, 1, 2].map((row) => (
              <div
                key={row}
                className="flex items-center gap-4 border-b border-line-subtle px-4 py-3 last:border-b-0"
              >
                <Skeleton width={20} height={12} />
                <Skeleton width="55%" height={14} />
                <Skeleton className="ml-auto" width={48} height={11} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
