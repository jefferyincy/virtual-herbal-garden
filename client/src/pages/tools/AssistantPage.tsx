import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Icon } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tooltip } from '@/components/ui/Tooltip';
import { PlantReferenceCard } from '@/components/plant/PlantReferenceCard';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
import {
  useAssistantIndex,
  useAssistantModel,
  useConversations,
  type AssistantHitRef,
  type AssistantTurn,
  type Conversation,
} from '@/features/assistant/hooks';
import { search, suggestPrompts } from '@/features/assistant/retrieval';
import type { AssistantCitation } from '@/types/api';

/** Retrieval is capped so a reply reads as a short evidence list, not a data dump. */
const HIT_LIMIT = 5;

const DISCLOSURE = 'Retrieved from the monograph database - not generated';

/**
 * The assistant screen: a grounded retrieval viewer, not a chat with a model.
 *
 * The build has no provider, no key and no `/api/assistant` endpoint, so no reply here is composed
 * prose. Every assistant turn is the ranker's output: the monographs that matched, why they matched
 * (their own matched terms) and their own recorded sources. The "not generated" line is rendered on
 * every reply and the top strip states the missing capability, because a screen that looked like a
 * chatbot would otherwise imply an ability this deployment does not have.
 */
export default function AssistantPage(): ReactNode {
  const { index, isLoading, isError, refetch } = useAssistantIndex();
  const model = useAssistantModel();
  const { conversations, activeId, create, select, append, remove } = useConversations();

  const [draft, setDraft] = useState('');
  const [retrieving, setRetrieving] = useState(false);
  const timerRef = useRef<number | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const active: Conversation | undefined = conversations.find(
    (conversation) => conversation.id === activeId,
  );

  const prompts = useMemo(() => suggestPrompts(index, 3), [index]);
  // Retrieval over an unloaded index would return nothing for every question, so the composer and
  // its suggestions stay disabled until the monographs are actually available.
  const canAsk = !isLoading && !isError && index.length > 0;

  // Clear a pending retrieval if the screen unmounts mid-run; the timeout is real scheduled work,
  // not a filler delay, so it must not fire after teardown.
  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [active?.turns.length, retrieving]);

  /**
   * Runs the real ranker. The indicator shows while the search and the state commit are in flight -
   * the timeout only yields the frame so the dots are painted before the work starts. There is no
   * artificial thinking delay anywhere in this path.
   */
  const ask = useCallback(
    (raw: string) => {
      const question = raw.trim();
      if (!question || retrieving || !canAsk) return;

      const conversationId = activeId ?? create();
      const userTurn: AssistantTurn = {
        id: `turn-${Date.now()}-u`,
        role: 'user',
        content: question,
        hits: [],
        citations: [],
      };
      append(conversationId, userTurn);
      setDraft('');
      setRetrieving(true);

      timerRef.current = window.setTimeout(() => {
        const hits = search(index, question, HIT_LIMIT);
        const hitRefs: AssistantHitRef[] = hits.map((hit) => ({
          slug: hit.doc.slug,
          commonName: hit.doc.commonName,
          botanicalName: hit.doc.botanicalName,
          imageUrl: hit.doc.plant.images[0]?.url ?? null,
          matchedTerms: hit.matchedTerms,
        }));

        // Citations are copied from the records that were actually returned - deduplicated by url
        // only, never rewritten, never invented.
        const citations: AssistantCitation[] = [];
        for (const hit of hits) {
          for (const citation of hit.doc.citations) {
            if (!citations.some((existing) => existing.url === citation.url)) {
              citations.push(citation);
            }
          }
        }

        append(conversationId, {
          id: `turn-${Date.now()}-a`,
          role: 'assistant',
          content: question,
          hits: hitRefs,
          citations,
        });
        setRetrieving(false);
      }, 0);
    },
    [activeId, append, canAsk, create, index, retrieving],
  );

  const startNewChat = () => {
    create();
    setDraft('');
  };

  return (
    <div className="flex h-[calc(100vh-9rem)] min-h-[540px] overflow-hidden rounded-panel border border-line-subtle bg-bg-surface">
      <aside
        aria-label="Conversations"
        className="flex w-[280px] shrink-0 flex-col border-r border-line-subtle bg-bg-surface"
      >
        <div className="flex flex-col gap-3 border-b border-line-subtle p-4">
          <h2 className="mono-label">Conversations</h2>
          <Button fullWidth iconLeft="plus" onClick={startNewChat}>
            New chat
          </Button>
          <p className="text-small text-fg-muted">Stored on this device only.</p>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {conversations.length === 0 ? (
            <p className="px-3 py-4 text-small text-fg-muted">
              No saved chats yet. Ask a question to start one.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {conversations.map((conversation) => {
                const isActive = conversation.id === activeId;
                return (
                  <li key={conversation.id} className="relative">
                    <div
                      className={cn(
                        'group flex items-center gap-2 rounded-input border-l-2 py-2 pl-3 pr-1 transition-colors duration-100 ease-base',
                        isActive
                          ? 'border-accent-500 bg-bg-hover'
                          : 'border-transparent hover:bg-bg-hover',
                      )}
                    >
                      {/* Colour is never the only signal: the selected row also carries `aria-current`. */}
                      <button
                        type="button"
                        onClick={() => select(conversation.id)}
                        aria-current={isActive ? 'true' : undefined}
                        className="flex min-w-0 flex-1 flex-col items-start gap-1 rounded-micro text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
                      >
                        <span className="w-full truncate text-small text-fg">
                          {conversation.title}
                        </span>
                        <span className="mono-label">{formatRelative(conversation.updatedAt)}</span>
                      </button>
                      <Tooltip content="Delete chat" side="left">
                        <button
                          type="button"
                          onClick={() => remove(conversation.id)}
                          aria-label={`Delete chat "${conversation.title}"`}
                          className="flex size-11 items-center justify-center rounded-input text-fg-muted transition-opacity duration-100 ease-base hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </Tooltip>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      <section aria-label="Assistant thread" className="flex min-w-0 flex-1 flex-col bg-bg-base">
        <div
          role="note"
          className="flex items-start gap-3 border-b border-line-subtle bg-warning/15 px-5 py-3"
        >
          <Icon name="info" size={18} className="mt-0.5 shrink-0 text-warning" />
          <p className="max-w-reading text-small text-fg-secondary">
            {model.configured
              ? 'A language model is configured for this deployment.'
              : `${model.reason} Ask a question and the assistant returns the matching monographs with their recorded sources instead of composed prose.`}
          </p>
        </div>

        {isLoading ? (
          <ThreadSkeleton />
        ) : isError ? (
          <div className="flex flex-1 items-center justify-center">
            <ErrorState
              title="Could not load the monograph database"
              message="The assistant retrieves over the plant records, so it cannot answer until the index loads."
              onRetry={refetch}
            />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 py-6">
            {!active || active.turns.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <span className="flex size-12 items-center justify-center rounded-full bg-accent-tint">
                  <Icon name="book-open" size={22} className="text-accent-400" />
                </span>
                <h3 className="text-h3 text-fg">Ask about a seeded monograph</h3>
                <p className="max-w-reading text-small text-fg-secondary">
                  Questions are matched against the monograph text of {index.length} plants. Each
                  reply lists the records that matched, the terms that caused the match, and the
                  sources those records cite.
                </p>
              </div>
            ) : (
              <ol className="mx-auto flex max-w-3xl flex-col gap-6">
                {active.turns.map((turn) =>
                  turn.role === 'user' ? (
                    <li key={turn.id} className="flex justify-end">
                      <p className="max-w-[80%] rounded-card bg-bg-raised px-4 py-3 text-body text-fg">
                        {turn.content}
                      </p>
                    </li>
                  ) : (
                    <li key={turn.id}>
                      <AssistantReply turn={turn} prompts={prompts} onPickPrompt={setDraft} />
                    </li>
                  ),
                )}
                {retrieving && (
                  <li>
                    <TypingIndicator />
                  </li>
                )}
              </ol>
            )}
            <div ref={endRef} />
          </div>
        )}

        {/* The composer stays mounted through every thread state, so a slow index never hides it. */}
        <div className="border-t border-line-subtle bg-bg-surface px-5 py-4">
          {prompts.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {prompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => setDraft(prompt)}
                  className="inline-flex min-h-11 items-center rounded-full border border-line-subtle px-3 text-small text-fg-secondary transition-colors duration-100 ease-base hover:border-line-strong hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          <form
            className="flex items-center gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              ask(draft);
            }}
          >
            <div className="relative min-w-0 flex-1">
              <Input
                aria-label="Search the monograph text"
                placeholder={
                  canAsk
                    ? 'Search monographs - results are retrieved, not generated'
                    : isLoading
                      ? 'Loading the monograph index'
                      : 'Monograph index unavailable'
                }
                value={draft}
                disabled={!canAsk}
                onChange={(event) => setDraft(event.target.value)}
                containerClassName="gap-0"
                className="pr-24"
              />
              <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center">
                {/* No upload endpoint exists, so the control is present but disabled and says why. */}
                <Tooltip content="Image upload is not available - no upload endpoint exists">
                  <button
                    type="button"
                    disabled
                    aria-label="Attach a file (unavailable)"
                    className="flex size-11 cursor-not-allowed items-center justify-center rounded-input text-fg-disabled"
                  >
                    <Icon name="paperclip" size={18} />
                  </button>
                </Tooltip>
                {/* No speech endpoint exists either; the mic is disabled with the reason attached. */}
                <Tooltip content="Voice input is not available - no speech endpoint exists">
                  <button
                    type="button"
                    disabled
                    aria-label="Voice input (unavailable)"
                    className="flex size-11 cursor-not-allowed items-center justify-center rounded-input text-fg-disabled"
                  >
                    <Icon name="mic" size={18} />
                  </button>
                </Tooltip>
              </div>
            </div>
            <button
              type="submit"
              aria-label="Search the monographs"
              disabled={!canAsk || draft.trim().length === 0 || retrieving}
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-500 text-fg-onAccent transition-[background-color,transform] duration-100 ease-base hover:bg-accent-400 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
            >
              <Icon name="send" size={18} />
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}

/**
 * One assistant turn. Order is fixed by the honesty requirement: the "not generated" disclosure,
 * then the retrieved monographs, then the match basis for each, then the records' own citations.
 */
function AssistantReply({
  turn,
  prompts,
  onPickPrompt,
}: {
  turn: AssistantTurn;
  prompts: string[];
  onPickPrompt: (prompt: string) => void;
}): ReactNode {
  if (turn.hits.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        {/* The disclosure is unconditional: every assistant turn must state how it was produced. */}
        <p className="mono-label">{DISCLOSURE}</p>
        <EmptyState
          title="No monograph matched that question"
          description="Retrieval only returns records whose own text contains the question's terms. Nothing is generated to fill the gap - try one of these instead."
          watermark="search"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {prompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => onPickPrompt(prompt)}
                  className="inline-flex min-h-11 items-center rounded-full border border-line-subtle px-3 text-small text-fg-secondary transition-colors duration-100 ease-base hover:border-line-strong hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
                >
                  {prompt}
                </button>
              ))}
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="mono-label">{DISCLOSURE}</p>

      <ol className="flex flex-col gap-4">
        {turn.hits.map((hit) => (
          <li key={hit.slug} className="flex flex-col gap-2">
            {/* The stored turn keeps only what a card renders; the card's input shape is rebuilt here. */}
            <PlantReferenceCard
              plant={{
                _id: hit.slug,
                slug: hit.slug,
                commonName: hit.commonName,
                botanicalName: hit.botanicalName,
                images: hit.imageUrl
                  ? [{ url: hit.imageUrl, alt: hit.commonName, credit: 'Monograph record' }]
                  : [],
              }}
            />
            <p className="mono-label">Matched terms: {hit.matchedTerms.join(', ')}</p>
          </li>
        ))}
      </ol>

      {turn.citations.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {turn.citations.map((citation) => (
            <a
              key={citation.url}
              href={citation.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex min-h-11 items-center gap-1 rounded-full border border-line-subtle px-3 font-mono text-micro uppercase text-fg-secondary transition-colors duration-100 ease-base hover:border-line-strong hover:text-accent-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
            >
              {citation.label}
              <Icon name="external-link" size={12} />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          ))}
        </div>
      ) : (
        <p className="mono-label">No external source is recorded on these monographs.</p>
      )}
    </div>
  );
}

/** Painted only while `retrieving` is true, i.e. while the ranker is actually running. */
function TypingIndicator(): ReactNode {
  return (
    <div className="flex items-center gap-3" role="status" aria-label="Searching the monographs">
      <span className="mono-label">Searching the monographs</span>
      <span className="flex items-center gap-1">
        <span className="size-2 animate-grow-pulse rounded-full bg-accent-500" />
        <span
          className="size-2 animate-grow-pulse rounded-full bg-accent-500"
          style={{ animationDelay: '160ms' }}
        />
        <span
          className="size-2 animate-grow-pulse rounded-full bg-accent-500"
          style={{ animationDelay: '320ms' }}
        />
      </span>
    </div>
  );
}

function ThreadSkeleton(): ReactNode {
  return (
    <div className="flex-1 overflow-hidden px-5 py-6" role="status" aria-label="Loading monographs">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <Skeleton variant="line" width="60%" height={44} className="self-end rounded-card" />
        <Skeleton variant="line" width={160} height={11} />
        <Skeleton variant="card" height={88} />
        <Skeleton variant="card" height={88} />
        <Skeleton variant="line" width="40%" height={11} />
      </div>
    </div>
  );
}
