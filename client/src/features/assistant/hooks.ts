/**
 * Data layer for the P7 retrieval assistant.
 *
 * Everything the feature can do is defined here:
 *  - `useAssistantIndex` fetches the seeded monographs once and projects them into retrieval docs.
 *  - `useConversations` keeps chat threads in localStorage.
 *  - `useAssistantModel` reports the model state, which in this build is "none configured".
 *
 * There is no `/api/assistant` endpoint and no provider key in this project, so no hook here ever
 * asks a server to compose an answer. Every network call goes through `api` - no component in this
 * feature calls fetch.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { api } from '@/lib/api';
import type { AssistantCitation, Paginated, Plant } from '@/types/api';
import { buildIndex, type RetrievalDoc } from './retrieval';

/** Feature-local key: the assistant always wants the full window, not another screen's page. */
const assistantKeys = { index: ['assistant', 'plant-index'] as const };

export function useAssistantIndex(): {
  index: RetrievalDoc[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
} {
  const query = useQuery({
    queryKey: assistantKeys.index,
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) =>
      api.get<Paginated<Plant>>('/plants', { query: { pageSize: 50 }, signal }),
  });

  const index = useMemo(() => buildIndex(query.data?.items ?? []), [query.data]);

  return {
    index,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => {
      void query.refetch();
    },
  };
}

/* ------------------------------------------------------------------ conversations */

/** The part of a retrieved monograph a stored turn keeps: enough to re-render a reference card. */
export interface AssistantHitRef {
  slug: string;
  commonName: string;
  botanicalName: string;
  imageUrl: string | null;
  /** The query terms that actually occurred in this monograph, so the match basis stays visible. */
  matchedTerms: string[];
}

export interface AssistantTurn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Assistant turns only: the monographs retrieval returned, in rank order. */
  hits: AssistantHitRef[];
  /** Copied from each hit's own `sources`; the client never synthesises a citation. */
  citations: AssistantCitation[];
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  turns: AssistantTurn[];
}

export interface ConversationsApi {
  conversations: Conversation[];
  activeId: string | null;
  create: () => string;
  select: (id: string) => void;
  append: (id: string, turn: AssistantTurn) => void;
  remove: (id: string) => void;
}

/**
 * Conversations live in localStorage because the spec has no chat-persistence endpoint: there is
 * nothing on the server to store a thread in, and inventing one would imply the assistant keeps
 * state across devices when it cannot. Device-local, clearly labelled in the UI.
 *
 * The store is untrusted input (older builds, hand edits, a half-written quota failure), so it is
 * parsed once at the boundary with zod and only the schema's output type is consumed.
 */
const STORAGE_KEY = 'vhg:assistant';
const STORE_VERSION = 1;
const MAX_CONVERSATIONS = 40;
const MAX_TURNS = 60;
const TITLE_LENGTH = 64;

const citationSchema = z.object({ label: z.string(), url: z.string() });

const hitRefSchema = z.object({
  slug: z.string(),
  commonName: z.string(),
  botanicalName: z.string().default(''),
  imageUrl: z.string().nullable().default(null),
  matchedTerms: z.array(z.string()).default([]),
});

const turnSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  hits: z.array(hitRefSchema).default([]),
  citations: z.array(citationSchema).default([]),
});

const conversationSchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  turns: z.array(turnSchema).default([]),
});

const storedSchema = z.object({
  version: z.literal(STORE_VERSION),
  conversations: z.array(conversationSchema).default([]),
  activeId: z.string().nullable().default(null),
});

type StoredState = { conversations: Conversation[]; activeId: string | null };

function newId(): string {
  // crypto.randomUUID needs a secure context; the fallback keeps ids unique in any context.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Unknown store contents degrade to an empty rail rather than breaking the screen. */
function readStored(): StoredState {
  if (typeof window === 'undefined') return { conversations: [], activeId: null };
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage can be disabled entirely; the assistant still works for the current session.
    return { conversations: [], activeId: null };
  }
  if (!raw) return { conversations: [], activeId: null };

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return { conversations: [], activeId: null };
  }

  const parsed = storedSchema.safeParse(parsedJson);
  if (!parsed.success) return { conversations: [], activeId: null };

  const conversations: Conversation[] = parsed.data.conversations
    .slice(0, MAX_CONVERSATIONS)
    .map((conversation) => ({ ...conversation, turns: conversation.turns.slice(-MAX_TURNS) }));
  const storedActive = parsed.data.activeId;
  const activeId =
    storedActive && conversations.some((conversation) => conversation.id === storedActive)
      ? storedActive
      : (conversations[0]?.id ?? null);

  return { conversations, activeId };
}

function writeStored(state: StoredState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: STORE_VERSION,
        conversations: state.conversations.slice(0, MAX_CONVERSATIONS),
        activeId: state.activeId,
      }),
    );
  } catch {
    // Quota exceeded or storage disabled: the in-memory threads stay usable for this session.
  }
}

function titleFor(content: string): string {
  const trimmed = content.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= TITLE_LENGTH) return trimmed || 'New chat';
  return `${trimmed.slice(0, TITLE_LENGTH - 1)}...`;
}

export function useConversations(): ConversationsApi {
  const [state, setState] = useState<StoredState>(() => readStored());

  useEffect(() => {
    writeStored(state);
  }, [state]);

  const create = useCallback((): string => {
    const id = newId();
    const now = new Date().toISOString();
    setState((prev) => ({
      conversations: [
        { id, title: 'New chat', createdAt: now, updatedAt: now, turns: [] },
        ...prev.conversations,
      ].slice(0, MAX_CONVERSATIONS),
      activeId: id,
    }));
    return id;
  }, []);

  const select = useCallback((id: string) => {
    setState((prev) =>
      prev.conversations.some((conversation) => conversation.id === id)
        ? { ...prev, activeId: id }
        : prev,
    );
  }, []);

  const append = useCallback((id: string, turn: AssistantTurn) => {
    setState((prev) => ({
      activeId: id,
      conversations: prev.conversations.map((conversation) => {
        if (conversation.id !== id) return conversation;
        // The title is the first user message, so the rail reads like the mockup's chat list.
        const isFirstUserTurn =
          turn.role === 'user' && !conversation.turns.some((entry) => entry.role === 'user');
        return {
          ...conversation,
          title: isFirstUserTurn ? titleFor(turn.content) : conversation.title,
          updatedAt: new Date().toISOString(),
          turns: [...conversation.turns, turn].slice(-MAX_TURNS),
        };
      }),
    }));
  }, []);

  const remove = useCallback((id: string) => {
    setState((prev) => {
      const conversations = prev.conversations.filter((conversation) => conversation.id !== id);
      return {
        conversations,
        activeId: prev.activeId === id ? (conversations[0]?.id ?? null) : prev.activeId,
      };
    });
  }, []);

  return { conversations: state.conversations, activeId: state.activeId, create, select, append, remove };
}

/* ------------------------------------------------------------------ model status */

export interface AssistantModel {
  configured: boolean;
  reason: string;
}

/**
 * The honest model state for this build: there is no provider, no API key and no `/api/assistant`
 * endpoint, so the assistant cannot compose prose and `configured` is false. The UI must therefore
 * show retrieved monographs with their own citations instead of a generated answer, and say so
 * plainly. This stays correct until a real provider and key exist - it is not a placeholder value
 * waiting to be flipped on: flipping it without a provider would make the client lie.
 */
const MODEL_STATUS: AssistantModel = {
  configured: false,
  reason:
    'No language model is configured for this deployment. Replies are retrieved from the monograph database, not generated.',
};

export function useAssistantModel(): AssistantModel {
  // Stable identity: consumers render the "no model configured" notice and never re-render on it.
  return useMemo(() => MODEL_STATUS, []);
}
