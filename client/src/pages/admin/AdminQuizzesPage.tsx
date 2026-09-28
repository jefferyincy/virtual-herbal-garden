import type { ReactNode } from 'react';
import { useEffect, useId, useMemo, useState } from 'react';
import { Icon } from '@/components/icons';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { Textarea } from '@/components/ui/Textarea';
import { Tooltip } from '@/components/ui/Tooltip';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import {
  apiErrorMessage,
  useAdminPlants,
  useAdminQuizzes,
  useDeleteQuiz,
  useSaveQuiz,
  type QuizQuestionInput,
  type QuizWriteInput,
} from '@/features/admin/hooks';
import type { Quiz } from '@/types/api';

const DIFFICULTY_OPTIONS: Array<{ value: Quiz['difficulty']; label: string }> = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
];

interface Draft {
  _id: string | null;
  title: string;
  family: string;
  difficulty: Quiz['difficulty'];
  timeLimitSec: number;
  questions: Array<QuizQuestionInput & { key: string }>;
  /** Plant links are authored elsewhere (each question carries its own id); the builder preserves
   *  the record's list so a save never silently drops it. */
  plantIds: string[];
  published: boolean;
}

function newQuestionKey(): string {
  return `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function blankQuestion(): QuizQuestionInput & { key: string } {
  return { key: newQuestionKey(), stem: '', options: ['', '', '', ''], answerIndex: 0, explanation: '', plantId: null };
}

function draftFromQuiz(quiz: Quiz | null): Draft {
  if (!quiz) {
    return {
      _id: null,
      title: '',
      family: '',
      difficulty: 'easy',
      timeLimitSec: 0,
      questions: [blankQuestion()],
      plantIds: [],
      published: false,
    };
  }
  return {
    _id: quiz._id,
    title: quiz.title,
    family: quiz.family,
    difficulty: quiz.difficulty,
    timeLimitSec: quiz.timeLimitSec,
    questions: quiz.questions.map((question) => ({
      key: question._id || newQuestionKey(),
      stem: question.stem,
      options: question.options,
      answerIndex: question.answerIndex,
      explanation: question.explanation,
      plantId: question.plantId,
    })),
    plantIds: quiz.plantIds,
    published: quiz.published,
  };
}

export default function AdminQuizzesPage() {
  const quizzes = useAdminQuizzes();
  const plants = useAdminPlants({ status: 'all', page: 1 });
  const save = useSaveQuiz();
  const remove = useDeleteQuiz();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const items = quizzes.data?.items ?? [];

  /** Families are pooled from the plants the admin list has already returned - no invented facet. */
  const families = useMemo(() => {
    const set = new Set<string>();
    for (const plant of plants.data?.items ?? []) set.add(plant.family);
    if (draft?.family) set.add(draft.family);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [plants.data, draft?.family]);

  useEffect(() => {
    if (draft || items.length === 0) return;
    setDraft(draftFromQuiz(items[0] ?? null));
  }, [items, draft]);

  const question = draft?.questions[previewIndex];
  const totalMinutes = draft ? Math.round(draft.timeLimitSec / 60) : 0;

  function selectQuiz(quiz: Quiz): void {
    setDraft(draftFromQuiz(quiz));
    setEditingKey(null);
    setPreviewIndex(0);
  }

  function update(patch: Partial<Draft>): void {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  function updateQuestion(key: string, patch: Partial<QuizQuestionInput>): void {
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            questions: prev.questions.map((entry) =>
              entry.key === key ? { ...entry, ...patch } : entry,
            ),
          }
        : prev,
    );
  }

  /** Reordering and duplication are client-side array operations; the server stores a flat
   *  questions array, so the persisted order is exactly this array order. */
  function moveQuestion(index: number, step: -1 | 1): void {
    setDraft((prev) => {
      if (!prev) return prev;
      const target = index + step;
      if (target < 0 || target >= prev.questions.length) return prev;
      const next = [...prev.questions];
      const moved = next[index];
      const replaced = next[target];
      if (!moved || !replaced) return prev;
      next[index] = replaced;
      next[target] = moved;
      return { ...prev, questions: next };
    });
  }

  function duplicateQuestion(index: number): void {
    setDraft((prev) => {
      if (!prev) return prev;
      const source = prev.questions[index];
      if (!source) return prev;
      const copy = { ...source, key: newQuestionKey(), options: [...source.options] };
      const next = [...prev.questions];
      next.splice(index + 1, 0, copy);
      return { ...prev, questions: next };
    });
  }

  function deleteQuestion(index: number): void {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = prev.questions.filter((_, position) => position !== index);
      return { ...prev, questions: next.length > 0 ? next : [blankQuestion()] };
    });
    setPreviewIndex((prev) => Math.max(0, prev - 1));
  }

  function submit(published: boolean): void {
    if (!draft) return;
    const input: QuizWriteInput = {
      title: draft.title.trim(),
      family: draft.family.trim(),
      difficulty: draft.difficulty,
      timeLimitSec: draft.timeLimitSec,
      plantIds: draft.plantIds,
      questions: draft.questions.map((entry) => ({
        stem: entry.stem,
        options: entry.options,
        answerIndex: entry.answerIndex,
        explanation: entry.explanation,
        plantId: entry.plantId,
      })),
      published,
    };

    save.mutate(
      { ...(draft._id ? { id: draft._id } : {}), input },
      {
        onSuccess: (saved) => {
          setDraft(draftFromQuiz(saved));
          setEditingKey(null);
        },
      },
    );
  }

  return (
    <div className="mx-auto w-full max-w-content">
      <PageHeader
        title="Quizzes"
        eyebrow="Admin"
        description="Build the question sets learners are served."
        actions={
          <Button
            iconLeft="plus"
            onClick={() => {
              setDraft(draftFromQuiz(null));
              setEditingKey(null);
              setPreviewIndex(0);
            }}
          >
            New quiz
          </Button>
        }
      />

      {save.isError && <ErrorBanner className="mb-4" message={apiErrorMessage(save.error)} />}

      {quizzes.isPending && <BuilderSkeleton />}

      {quizzes.isError && (
        <ErrorState
          title="Couldn't load quizzes"
          message="The admin quiz list did not respond."
          onRetry={() => void quizzes.refetch()}
        />
      )}

      {quizzes.isSuccess && items.length === 0 && !draft && (
        <EmptyState
          title="No quizzes yet"
          description="Create the first question set, or run the seed script to generate family quizzes."
          watermark="list"
          action={<Button onClick={() => setDraft(draftFromQuiz(null))}>New quiz</Button>}
        />
      )}

      {quizzes.isSuccess && items.length > 0 && !draft && (
        <Card variant="flat" padding="lg" className="flex flex-col gap-2">
          <p className="text-body text-fg">Select a quiz to edit.</p>
          <p className="text-small text-fg-secondary">
            Or start a new one with the button above.
          </p>
        </Card>
      )}

      {quizzes.isSuccess && draft && (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {items.map((quiz) => (
              <button
                key={quiz._id}
                type="button"
                onClick={() => selectQuiz(quiz)}
                aria-pressed={draft._id === quiz._id}
                className={cn(
                  'rounded-full border px-3 py-1.5 font-mono text-micro uppercase transition-colors duration-100 ease-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow',
                  draft._id === quiz._id
                    ? 'border-accent-600 bg-accent-tint text-accent-400'
                    : 'border-line-subtle text-fg-secondary hover:border-line-strong hover:text-fg',
                )}
              >
                {quiz.title}
              </button>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_300px]">
            <QuizSettings
              draft={draft}
              families={families}
              onUpdate={update}
              questionCount={draft.questions.length}
            />

            <div className="flex min-w-0 flex-col gap-3">
              {draft.questions.map((entry, index) => (
                <QuestionCard
                  key={entry.key}
                  entry={entry}
                  index={index}
                  total={draft.questions.length}
                  expanded={editingKey === entry.key}
                  onToggle={() => setEditingKey(editingKey === entry.key ? null : entry.key)}
                  onUpdate={(patch) => updateQuestion(entry.key, patch)}
                  onMove={(step) => moveQuestion(index, step)}
                  onDuplicate={() => duplicateQuestion(index)}
                  onDelete={() => deleteQuestion(index)}
                  onPreview={() => setPreviewIndex(index)}
                />
              ))}
              <Button
                variant="secondary"
                iconLeft="plus"
                className="self-start"
                onClick={() => {
                  const next = blankQuestion();
                  setDraft({ ...draft, questions: [...draft.questions, next] });
                  setEditingKey(next.key);
                }}
              >
                Add question
              </Button>
            </div>

            <aside className="flex flex-col gap-4 xl:sticky xl:top-4 xl:self-start">
              <Card variant="flat" padding="lg" className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-h3 text-fg">Learner preview</h2>
                  <span className="mono-label">
                    {Math.min(previewIndex + 1, draft.questions.length)}/
                    {draft.questions.length}
                  </span>
                </div>
                {/* The served quiz strips `answerIndex` and `explanation` (types/api.ts
                    QuizServed), so the preview must not reveal the correct option either. */}
                <p className="mono-label">Correct answers hidden, as learners see them</p>
                {question ? (
                  <div className="flex flex-col gap-3">
                    <p className="text-body text-fg">{question.stem || 'Untitled question'}</p>
                    <ul className="flex flex-col gap-2">
                      {question.options.map((option, index) => (
                        <li
                          key={index}
                          className="flex items-center gap-2 rounded-input border border-line-subtle px-3 py-2 text-small text-fg-secondary"
                        >
                          <span className="font-mono text-micro text-fg-muted">
                            {String.fromCharCode(65 + index)}
                          </span>
                          {option || <span className="text-fg-disabled">Empty option</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-small text-fg-secondary">This quiz has no questions yet.</p>
                )}
              </Card>

              <Card variant="flat" padding="lg" className="flex flex-col gap-3">
                {/* There is no generation endpoint anywhere in the API: quiz generation happens in
                    the seed script (server/src/seed). The control is disabled and says so rather
                    than faking a generator. */}
                <Tooltip content="Quiz generation runs in the seed script (server/src/seed). There is no generation endpoint to call.">
                  <span className="inline-flex">
                    <Button variant="secondary" disabled iconLeft="sparkles" className="w-full">
                      Generate from plants
                    </Button>
                  </span>
                </Tooltip>
                <p className="mono-label">
                  Unavailable: generation happens in the seed script
                </p>
                <p className="mono-label">
                  {formatNumber(draft.questions.length)} questions · {formatNumber(draft.plantIds.length)} linked
                  plants
                </p>
              </Card>
            </aside>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line-subtle pt-4">
            <Button
              variant="ghost"
              loading={save.isPending && save.variables?.input.published === false}
              disabled={!draft._id && !draft.title.trim()}
              onClick={() => submit(false)}
            >
              Save draft
            </Button>
            <Button
              variant="secondary"
              iconLeft="eye"
              disabled={draft.questions.length === 0}
              onClick={() => setPreviewIndex(0)}
            >
              Preview quiz
            </Button>
            <Button
              loading={save.isPending && save.variables?.input.published === true}
              onClick={() => submit(true)}
            >
              Publish
            </Button>
            <span className="mono-label ml-auto">
              {formatNumber(draft.questions.length)} questions · {formatNumber(totalMinutes)} min
            </span>
            {draft._id && (
              <Button variant="danger" iconLeft="trash" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            )}
          </div>

          <Modal
            open={confirmDelete}
            onClose={() => setConfirmDelete(false)}
            title="Delete this quiz?"
            description="Attempts already recorded stay in the learner's history, but the quiz disappears from the catalogue."
            size="sm"
            footer={
              <>
                <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  loading={remove.isPending}
                  onClick={() => {
                    if (!draft._id) return;
                    remove.mutate(draft._id, {
                      onSuccess: () => {
                        setConfirmDelete(false);
                        setDraft(draftFromQuiz(null));
                      },
                    });
                  }}
                >
                  Delete quiz
                </Button>
              </>
            }
          >
            <p className="text-small text-fg-secondary">{draft.title}</p>
          </Modal>
        </>
      )}
    </div>
  );
}

function QuizSettings({
  draft,
  families,
  questionCount,
  onUpdate,
}: {
  draft: Draft;
  families: string[];
  questionCount: number;
  onUpdate: (patch: Partial<Draft>) => void;
}): ReactNode {
  return (
    <Card variant="flat" padding="lg" className="flex flex-col gap-4">
      <h2 className="text-h3 text-fg">Settings</h2>
      <Input
        label="Title"
        value={draft.title}
        onChange={(event) => onUpdate({ title: event.target.value })}
      />
      <Select
        label="Family"
        placeholder="Select a family"
        options={families.map((family) => ({ value: family, label: family }))}
        value={draft.family}
        onChange={(event) => onUpdate({ family: event.target.value })}
      />
      {families.length === 0 && (
        <p className="text-small text-fg-muted">No plant families loaded yet.</p>
      )}
      <div className="flex flex-col gap-2">
        <span className="text-small text-fg-secondary">Difficulty</span>
        <SegmentedControl
          size="sm"
          options={DIFFICULTY_OPTIONS}
          value={draft.difficulty}
          onChange={(value) => onUpdate({ difficulty: value as Quiz['difficulty'] })}
        />
      </div>
      <Input
        label="Time limit"
        type="number"
        min={0}
        value={draft.timeLimitSec}
        onChange={(event) => onUpdate({ timeLimitSec: Math.max(0, Number(event.target.value) || 0) })}
      />
      <p className="mono-label -mt-2">Seconds · 0 = untimed</p>
      {/* The Quiz model has no `randomise` field and the learner runner serves the stored array
          order, so this control is presentation-only by definition. It is shown disabled with the
          reason stated rather than implemented against nothing. */}
      <Checkbox
        label="Randomise questions"
        hint="Unavailable: the Quiz model has no such field and learners are served the stored order."
        checked={false}
        disabled
        onChange={() => undefined}
      />
      <p className="mono-label">{formatNumber(questionCount)} questions</p>
    </Card>
  );
}

function QuestionCard({
  entry,
  index,
  total,
  expanded,
  onToggle,
  onUpdate,
  onMove,
  onDuplicate,
  onDelete,
  onPreview,
}: {
  entry: QuizQuestionInput & { key: string };
  index: number;
  total: number;
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (patch: Partial<QuizQuestionInput>) => void;
  onMove: (step: -1 | 1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onPreview: () => void;
}): ReactNode {
  const correct = entry.options[entry.answerIndex];

  return (
    <Card variant="flat" padding="md" className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span className="mt-1 text-fg-muted" aria-hidden="true">
          <Icon name="grip" size={18} />
        </span>
        <span className="mono-label mt-1 w-6 shrink-0">{String(index + 1).padStart(2, '0')}</span>
        <div className="min-w-0 flex-1">
          <p className="text-body text-fg">{entry.stem || 'Untitled question'}</p>
          <ul className="mt-2 flex flex-col gap-1">
            {entry.options.map((option, optionIndex) => {
              const isCorrect = optionIndex === entry.answerIndex;
              return (
                <li key={optionIndex} className="flex items-center gap-2 text-small">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'size-2 rounded-full',
                      isCorrect ? 'bg-accent-500' : 'bg-white/[0.12]',
                    )}
                  />
                  <span className={isCorrect ? 'text-accent-400' : 'text-fg-secondary'}>
                    {option || <span className="text-fg-disabled">Empty option</span>}
                  </span>
                </li>
              );
            })}
          </ul>
          {correct === undefined && (
            <p className="mt-1 text-small text-warning">No correct option marked.</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <IconButton label="Move up" icon="chevron-up" disabled={index === 0} onClick={() => onMove(-1)} />
          <IconButton
            label="Move down"
            icon="chevron-down"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
          />
          <IconButton label="Preview this question" icon="eye" onClick={onPreview} />
          <IconButton label="Duplicate" icon="copy" onClick={onDuplicate} />
          <IconButton label="Delete" icon="trash" danger onClick={onDelete} />
          <IconButton
            label={expanded ? 'Close editor' : 'Edit question'}
            icon={expanded ? 'chevron-up' : 'pencil'}
            onClick={onToggle}
          />
        </div>
      </div>

      {expanded && (
        <div className="flex flex-col gap-3 border-t border-line-subtle pt-3">
          <Textarea
            label="Question"
            rows={2}
            value={entry.stem}
            onChange={(event) => onUpdate({ stem: event.target.value })}
          />
          {entry.options.map((option, optionIndex) => (
            <RadioOption
              key={optionIndex}
              groupName={`correct-${entry.key}`}
              index={optionIndex}
              value={option}
              selected={entry.answerIndex === optionIndex}
              onSelect={() => onUpdate({ answerIndex: optionIndex })}
              onChange={(value) =>
                onUpdate({
                  options: entry.options.map((current, position) =>
                    position === optionIndex ? value : current,
                  ),
                })
              }
            />
          ))}
          <Textarea
            label="Explanation"
            rows={2}
            hint="Shown to the learner only after they answer."
            value={entry.explanation}
            onChange={(event) => onUpdate({ explanation: event.target.value })}
          />
        </div>
      )}
    </Card>
  );
}

function RadioOption({
  groupName,
  index,
  value,
  selected,
  onSelect,
  onChange,
}: {
  groupName: string;
  index: number;
  value: string;
  selected: boolean;
  onSelect: () => void;
  onChange: (value: string) => void;
}): ReactNode {
  const inputId = useId();

  return (
    <div className="flex items-center gap-3">
      <input
        id={inputId}
        type="radio"
        name={groupName}
        checked={selected}
        onChange={onSelect}
        aria-label={`Mark option ${String.fromCharCode(65 + index)} as correct`}
        className="size-4 shrink-0 accent-accent-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
      />
      <Input
        containerClassName="flex-1"
        value={value}
        placeholder={`Option ${String.fromCharCode(65 + index)}`}
        onChange={(event) => onChange(event.target.value)}
      />
      {selected && (
        <Chip tone="accent" size="sm">
          Correct
        </Chip>
      )}
    </div>
  );
}

function IconButton({
  label,
  icon,
  onClick,
  disabled = false,
  danger = false,
}: {
  label: string;
  icon: 'chevron-up' | 'chevron-down' | 'eye' | 'copy' | 'trash' | 'pencil';
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}): ReactNode {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex size-9 items-center justify-center rounded-btn transition-colors duration-100 ease-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow disabled:cursor-not-allowed disabled:opacity-40',
        danger ? 'text-danger hover:bg-danger-tint' : 'text-fg-secondary hover:bg-bg-hover hover:text-fg',
      )}
    >
      <Icon name={icon} size={16} />
    </button>
  );
}

function BuilderSkeleton(): ReactNode {
  return (
    <div role="status" aria-label="Loading quizzes" className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_300px]">
      <Card variant="flat" padding="lg" className="flex flex-col gap-3">
        <Skeleton width={100} height={20} />
        <Skeleton width="100%" height={44} />
        <Skeleton width="100%" height={44} />
        <Skeleton width="100%" height={36} />
      </Card>
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((index) => (
          <Card key={index} variant="flat" padding="md" className="flex flex-col gap-3">
            <Skeleton width="70%" height={16} />
            <Skeleton width="50%" height={12} />
            <Skeleton width="60%" height={12} />
          </Card>
        ))}
      </div>
      <Card variant="flat" padding="lg" className="flex flex-col gap-3">
        <Skeleton width={120} height={20} />
        <Skeleton width="100%" height={120} />
      </Card>
    </div>
  );
}
