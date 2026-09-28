import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Icon } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { SafetyBanner } from '@/components/ui/SafetyBanner';
import { Skeleton } from '@/components/ui/Skeleton';
import { PlantReferenceCard } from '@/components/plant/PlantReferenceCard';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useCompleteLesson, useLesson, type LessonDetailResponse } from '@/features/learn/hooks';

/* ------------------------------------------------------------------ markdown */

/**
 * The seed's markdown surface is intentionally narrow: `## heading`, `- list items`, `**bold**`
 * and blank-line-separated paragraphs (`server/src/seed/index.ts` builds every lesson body from
 * exactly those four constructs). Rather than pull in a markdown dependency for four constructs -
 * and to keep the raw lesson text off `dangerouslySetInnerHTML` entirely - this file parses them
 * into React elements. Text reaches the DOM only as React children, so anything the parser does
 * not recognise is escaped by React and rendered literally.
 */
type Block =
  | { kind: 'heading'; text: string; anchor: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'paragraph'; text: string };

function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'paragraph', text: paragraph.join(' ') });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list.length > 0) {
      blocks.push({ kind: 'list', items: list });
      list = [];
    }
  };

  for (const rawLine of source.split('\n')) {
    const line = rawLine.trim();
    if (line === '') {
      flushParagraph();
      flushList();
      continue;
    }
    if (line.startsWith('## ')) {
      flushParagraph();
      flushList();
      const text = line.slice(3).trim();
      blocks.push({ kind: 'heading', text, anchor: slugifyHeading(text) });
      continue;
    }
    if (line.startsWith('- ')) {
      flushParagraph();
      list.push(line.slice(2).trim());
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return blocks;
}

/** Splits a paragraph into plain text and `**bold**` runs. */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /\*\*([^*]+)\*\*/g;
  let cursor = 0;
  let index = 0;
  let match = pattern.exec(text);
  while (match !== null) {
    if (match.index > cursor) parts.push(text.slice(cursor, match.index));
    parts.push(
      <strong key={`${keyPrefix}-b${index}`} className="font-semibold text-fg">
        {match[1] ?? ''}
      </strong>,
    );
    cursor = match.index + match[0].length;
    index += 1;
    match = pattern.exec(text);
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

/* ------------------------------------------------------------------ page */

export default function LessonPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const lesson = useLesson(slug);
  const complete = useCompleteLesson();
  const [completedLocally, setCompletedLocally] = useState(false);
  const [activeHeading, setActiveHeading] = useState<string | null>(null);
  const headingRefs = useRef<Map<string, HTMLElement>>(new Map());

  const data: LessonDetailResponse | undefined = lesson.data;
  const body = data?.lesson.body ?? '';
  const blocks = useMemo(() => parseMarkdown(body), [body]);
  const headings = useMemo(
    () => blocks.filter((block): block is Extract<Block, { kind: 'heading' }> => block.kind === 'heading'),
    [blocks],
  );

  /** Mark the heading nearest the top of the viewport; the TOC dot follows it. */
  useEffect(() => {
    if (headings.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const first = visible[0];
        if (first?.target.id) setActiveHeading(first.target.id);
      },
      { rootMargin: '-88px 0px -60% 0px', threshold: 0 },
    );
    headingRefs.current.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [headings]);

  const notFound = lesson.error instanceof ApiError && lesson.error.status === 404;

  if (lesson.isPending) return <LessonSkeleton />;

  if (notFound) {
    return (
      <div className="mx-auto w-full max-w-reading py-16">
        <ErrorState
          title="Lesson not found"
          message="That lesson slug does not exist, or it is still unpublished."
        >
          <Link
            to="/learn"
            className="inline-flex h-11 items-center justify-center rounded-btn border border-line-strong px-4 text-fg transition-colors duration-100 ease-base hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
          >
            Back to lessons
          </Link>
        </ErrorState>
      </div>
    );
  }

  if (lesson.isError || !data) {
    return (
      <div className="mx-auto w-full max-w-reading py-16">
        <ErrorState
          title="Couldn't load this lesson"
          message="The lesson did not respond."
          onRetry={() => void lesson.refetch()}
        />
      </div>
    );
  }

  const { lesson: content, plant, prev, position } = data;
  const completed = data.completed || completedLocally;
  const needsSafety = plant !== null && (plant.toxicity !== 'none' || plant.contraindications !== null);
  const progressPct = position.total > 0 ? (position.index / position.total) * 100 : 0;

  return (
    <div className="mx-auto w-full max-w-content pb-24">
      {/* The accent rail sits on the first pixel of the sticky bar: the reader's course position. */}
      <div className="sticky top-0 z-30 -mx-6 border-b border-line-subtle bg-bg-base/95 backdrop-blur">
        <ProgressBar value={progressPct} size="sm" className="gap-0" />
        <div className="flex items-center gap-3 px-6 py-3">
          <Link
            to="/learn"
            aria-label="Back to lessons"
            className="inline-flex size-11 items-center justify-center rounded-btn text-fg-secondary transition-colors duration-100 ease-base hover:bg-bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
          >
            <Icon name="arrow-left" size={20} />
          </Link>
          <span className="min-w-0 flex-1 truncate text-small text-fg-secondary">
            {content.title}
          </span>
          <span className="mono-label shrink-0">
            {position.index} of {position.total}
          </span>
        </div>
      </div>

      <div className="grid gap-12 pt-10 lg:grid-cols-[minmax(0,720px)_200px] lg:justify-center">
        <article className="min-w-0">
          <h1 className="text-h1 text-fg">{content.title}</h1>
          {plant && (
            <p className="botanical mt-2 text-body-lg text-clay-400">{plant.botanicalName}</p>
          )}
          <p className="mono-label mt-3">
            {content.section ?? 'General'} · {content.estMinutes} min
          </p>

          <div className="mt-8 flex flex-col gap-5">
            {blocks.map((block, index) => {
              if (block.kind === 'heading') {
                return (
                  <h2
                    key={`h-${block.anchor}-${index}`}
                    id={block.anchor}
                    ref={(node) => {
                      if (node) headingRefs.current.set(block.anchor, node);
                      else headingRefs.current.delete(block.anchor);
                    }}
                    className="mt-6 scroll-mt-24 text-h2 text-fg"
                  >
                    {block.text}
                  </h2>
                );
              }
              if (block.kind === 'list') {
                return (
                  <ul key={`ul-${index}`} className="flex flex-col gap-2">
                    {block.items.map((item, itemIndex) => (
                      <li
                        key={`li-${index}-${itemIndex}`}
                        className="reading-measure flex gap-3 text-body-lg text-fg-secondary"
                      >
                        <span className="mt-[0.65em] size-1 shrink-0 rounded-full bg-accent-500" />
                        <span>{renderInline(item, `li-${index}-${itemIndex}`)}</span>
                      </li>
                    ))}
                  </ul>
                );
              }
              return (
                <p key={`p-${index}`} className="reading-measure text-body-lg text-fg-secondary">
                  {renderInline(block.text, `p-${index}`)}
                </p>
              );
            })}
          </div>

          {plant && (
            <div className="mt-10">
              <PlantReferenceCard plant={plant} linkLabel="Read profile" />
            </div>
          )}

          {plant && needsSafety && (
            <SafetyBanner className="mt-6" heading={`Safety - ${plant.commonName}`}>
              <dl className="flex flex-col gap-2">
                <div className="flex gap-3">
                  <dt className="mono-label w-32 shrink-0">Toxicity</dt>
                  <dd className="text-small text-fg-secondary">{plant.toxicity}</dd>
                </div>
                {plant.contraindications && (
                  <div className="flex gap-3">
                    <dt className="mono-label w-32 shrink-0">Contraindications</dt>
                    <dd className="text-small text-fg-secondary">{plant.contraindications}</dd>
                  </div>
                )}
              </dl>
            </SafetyBanner>
          )}
        </article>

        <aside className="hidden lg:block">
          {headings.length > 0 && (
            <nav aria-label="Lesson sections" className="sticky top-24">
              <p className="mono-label mb-3">On this page</p>
              <ul className="flex flex-col gap-2">
                {headings.map((heading) => {
                  const active = activeHeading === heading.anchor;
                  return (
                    <li key={`toc-${heading.anchor}`}>
                      <a
                        href={`#${heading.anchor}`}
                        className={cn(
                          'flex items-center gap-2 rounded-btn px-2 py-1 text-small transition-colors duration-100 ease-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow',
                          active ? 'text-fg' : 'text-fg-muted hover:text-fg-secondary',
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            'size-1.5 shrink-0 rounded-full',
                            active ? 'bg-accent-500' : 'bg-line-strong',
                          )}
                        />
                        {heading.text}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </nav>
          )}
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line-subtle bg-bg-base/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-content items-center gap-3 px-6 py-3">
          <Button
            variant="ghost"
            iconLeft="arrow-left"
            disabled={!prev}
            onClick={() => {
              if (prev) navigate(`/learn/lesson/${prev.slug}`);
            }}
          >
            Previous
          </Button>
          <span className="mono-label mx-auto">
            {position.index} of {position.total}
          </span>
          {completed ? (
            <span className="inline-flex h-11 items-center gap-2 rounded-btn border border-accent-600 bg-accent-tint px-4 text-body text-accent-400">
              <Icon name="check-circle" size={18} />
              Completed
            </span>
          ) : (
            <Button
              iconRight="check-circle"
              loading={complete.isPending}
              onClick={() => {
                complete.mutate(content._id, {
                  onSuccess: () => setCompletedLocally(true),
                });
              }}
            >
              Mark complete +20 XP
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function LessonSkeleton() {
  return (
    <div role="status" aria-label="Loading lesson" className="mx-auto w-full max-w-content pb-24">
      <div className="sticky top-0 z-30 -mx-6 border-b border-line-subtle bg-bg-base px-6 py-3">
        <Skeleton width="40%" height={13} />
      </div>
      <div className="grid gap-12 pt-10 lg:grid-cols-[minmax(0,720px)_200px] lg:justify-center">
        <div className="flex flex-col gap-5">
          <Skeleton width="70%" height={40} />
          <Skeleton width="40%" height={18} />
          <Skeleton width="25%" height={11} />
          <Skeleton className="mt-6" width="35%" height={28} />
          <Skeleton width="100%" height={17} />
          <Skeleton width="96%" height={17} />
          <Skeleton width="88%" height={17} />
          <Skeleton className="mt-6" width="35%" height={28} />
          <Skeleton width="60%" height={17} />
        </div>
        <div className="hidden flex-col gap-3 lg:flex">
          <Skeleton width={90} height={11} />
          <Skeleton width="100%" height={13} />
          <Skeleton width="80%" height={13} />
        </div>
      </div>
    </div>
  );
}
