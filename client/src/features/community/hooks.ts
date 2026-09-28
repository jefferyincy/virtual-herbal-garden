/**
 * Data layer for the Social phase (build spec section 4 post/comment endpoints).
 *
 * Every network call goes through `api` - no community screen ever calls fetch. The post keys
 * come from `lib/query.ts` (`queryKeys.posts`, `queryKeys.post(id)`) so a moderation write
 * performed by the Admin feature invalidates the same caches the feed reads.
 *
 * Envelopes the server returns but `types/api.ts` does not model are declared here on purpose:
 * `types/api.ts` is the shared contract and is not edited by this feature.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { queryKeys } from '@/lib/query';
import { useToast } from '@/components/ui/Toast';
import type {
  Comment,
  LeaderboardRow,
  Paginated,
  Plant,
  Post,
  PostStatus,
  PostType,
} from '@/types/api';

/* ------------------------------------------------------------------ response shapes */

/**
 * The feed/detail contract names the author `author` whereas `Post` in `types/api.ts` names it
 * `userId`; this shape is what the posts route actually serialises.
 */
export type PostAuthor = {
  _id: string;
  name: string;
  handle: string;
  role: 'student' | 'expert' | 'admin';
  level: number;
};

/**
 * `plantIds` arrives populated. The projection matches `Post['plantIds']` in `types/api.ts`; the
 * extra `toxicity` the detail route may add is not consumed here.
 */
export type PostPlant = Pick<Plant, '_id' | 'slug' | 'commonName' | 'botanicalName' | 'images'>;

/**
 * A feed row: `Post` with the author/plant fields named as the route serialises them and the
 * server-only fields (`reviewerId`, the raw `upvotes` array) dropped, because the route never
 * sends them.
 */
export type PostSummary = Omit<Post, 'userId' | 'plantIds' | 'reviewerId' | 'upvotes'> & {
  author: PostAuthor | null;
  plantIds: PostPlant[];
};

export interface PostComment extends Omit<Comment, 'userId' | 'postId'> {
  author: PostAuthor | null;
  /** The route populates the post id; the detail reply nesting only needs it for grouping. */
  postId?: string;
}

export type PostDetail = PostSummary & {
  /** The route returns this alongside the post; `reviewerNote` comes from `Post` itself. */
  canModerate: boolean;
  comments?: PostComment[];
};

export interface PostFilter {
  type?: PostType | 'all';
  /** Only a moderator may widen this past `approved`; the server enforces the same rule. */
  status?: PostStatus | 'all';
  plantId?: string;
  author?: string;
  sort?: 'new' | 'top';
  page?: number;
}

export interface CreatePostInput {
  type: PostType;
  title: string;
  body: string;
  plantIds?: string[];
  sources?: string[];
}

export interface ModeratePostInput {
  action: 'approve' | 'reject' | 'request_changes';
  note?: string;
}

export interface UpvoteResult {
  upvoteCount: number;
  upvoted: boolean;
}

/** Badge rows are keyed by badge key so this shape stays independent of `Badge`'s `_id`. */
export interface ProfileBadge {
  key: string;
  name: string;
  icon: string;
  earnedAt: string;
  xpReward: number;
}

export interface ProfileResponse {
  user: { name: string; handle: string; bio: string; level: number; xp: number; createdAt: string };
  stats: { badges: number; plantsRead: number; streakDays: number; posts: number };
  badges: ProfileBadge[];
  publicGardens: Array<{ _id: string; name: string; slug: string; plantCount: number }>;
  recentPosts: Array<{
    _id: string;
    type: PostType;
    title: string;
    createdAt: string;
    upvoteCount: number;
  }>;
  isSelf: boolean;
}

/** `GET /leaderboard?window=all` - the same envelope the Learn leaderboard screen reads. */
export interface ContributorsResponse {
  window: 'week' | 'all';
  rows: LeaderboardRow[];
  currentUserRank: number | null;
}

const SEARCH_DEBOUNCE_MS = 250;
const SEARCH_PAGE_SIZE = 5;
/** The feed rail shows the top five; the response itself is the shared all-time board. */
export const CONTRIBUTOR_LIMIT = 5;

export const communityKeys = {
  feed: (filter: PostFilter) =>
    [
      queryKeys.posts[0],
      'feed',
      filter.type ?? 'all',
      filter.status ?? 'all',
      filter.plantId ?? '',
      filter.author ?? '',
      filter.sort ?? 'new',
      filter.page ?? 1,
    ] as const,
  detail: (id: string) => queryKeys.post(id),
  profile: (handle: string) => ['users', handle, 'profile'] as const,
  plantSearch: (q: string) => [...queryKeys.plants, 'search', q] as const,
  recentPlants: [...queryKeys.plants, 'recent'] as const,
};

/**
 * A write moves the feed (counts, ordering, visibility) and that post's detail cache. Both
 * prefixes are invalidated: the bare `['posts']` prefix covers every `communityKeys.feed(...)`
 * filter combination as well as `queryKeys.post(id)`.
 */
function refreshPostCaches(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: queryKeys.posts });
}

/**
 * The error envelope's `details` is `Array<{path, message}>` for a 422. Re-exported so the
 * create form can surface the server's own message (`Remedies must cite at least one source`)
 * inline instead of a generic failure line.
 */
export function apiErrorMessage(error: Error): string {
  if (!(error instanceof ApiError)) return error.message;
  if (!Array.isArray(error.details)) return error.message;
  const fieldMessages: string[] = [];
  for (const entry of error.details) {
    if (entry && typeof entry === 'object' && 'message' in entry && typeof entry.message === 'string') {
      fieldMessages.push(entry.message);
    }
  }
  return fieldMessages.length > 0 ? `${error.message}: ${fieldMessages.join('; ')}` : error.message;
}

/* ------------------------------------------------------------------ queries */

export function usePosts(filter: PostFilter = {}) {
  return useQuery({
    queryKey: communityKeys.feed(filter),
    // Switching tabs must not blank the column: the previous page stays rendered while the new
    // filter resolves, which is what `keepPreviousData` is for.
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      api.get<Paginated<PostSummary>>('/posts', {
        query: {
          type: filter.type && filter.type !== 'all' ? filter.type : undefined,
          status: filter.status && filter.status !== 'all' ? filter.status : undefined,
          plantId: filter.plantId,
          author: filter.author,
          sort: filter.sort,
          page: filter.page,
        },
        signal,
      }),
  });
}

export function usePost(id: string | undefined) {
  return useQuery({
    queryKey: communityKeys.detail(id ?? ''),
    enabled: Boolean(id),
    queryFn: ({ signal }) => api.get<{ post: PostDetail; canModerate: boolean }>(`/posts/${id}`, { signal }),
  });
}

/* ------------------------------------------------------------------ mutations */

export function useCreatePost() {
  const client = useQueryClient();
  const { push } = useToast();

  return useMutation({
    mutationFn: (input: CreatePostInput) => api.post<{ post: PostSummary }>('/posts', input),
    onSuccess: () => {
      refreshPostCaches(client);
      push({
        variant: 'success',
        title: 'Submitted for review',
        description: 'Your post is awaiting a moderator decision.',
      });
    },
  });
}

export function useUpvotePost() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.post<UpvoteResult>(`/posts/${id}/upvote`),
    onSuccess: (_result, id) => {
      // No toast: the button's own count is the feedback, and a toast per tap would be noise.
      void client.invalidateQueries({ queryKey: queryKeys.posts });
      void client.invalidateQueries({ queryKey: communityKeys.detail(id) });
    },
  });
}

export function useComment(postId: string | undefined) {
  const client = useQueryClient();
  const { push } = useToast();

  return useMutation({
    mutationFn: (input: { body: string; parentId?: string }) =>
      api.post<{ comment: PostComment }>(`/posts/${postId}/comments`, {
        body: input.body,
        ...(input.parentId ? { parentId: input.parentId } : {}),
      }),
    onSuccess: () => {
      // The server returns the fresh comment; the detail query owns the threaded list, so both it
      // and the feed's comment count are stale after a successful post.
      void client.invalidateQueries({ queryKey: queryKeys.posts });
      if (postId) void client.invalidateQueries({ queryKey: communityKeys.detail(postId) });
      push({ variant: 'success', title: 'Comment posted' });
    },
  });
}

export function useUpvoteComment() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (commentId: string) => api.post<UpvoteResult>(`/comments/${commentId}/upvote`),
    onSuccess: () => {
      // Comments ride inside the post detail response, so the detail cache is the target. The key
      // is unknown here (the caller only holds a comment id), hence the prefix invalidation.
      refreshPostCaches(client);
    },
  });
}

export function useModeratePost() {
  const client = useQueryClient();
  const { push } = useToast();

  return useMutation({
    mutationFn: ({ id, action, note }: ModeratePostInput & { id: string }) =>
      api.patch<{ post: PostSummary }>(`/posts/${id}/moderate`, {
        action,
        // The server requires a note for reject/request_changes and rejects an empty string, so a
        // missing note is omitted rather than sent blank.
        ...(note ? { note } : {}),
      }),
    onSuccess: (result, variables) => {
      refreshPostCaches(client);
      push({
        variant: variables.action === 'approve' ? 'success' : 'info',
        title: 'Moderation saved',
        description: `${result.post.title} - ${variables.action.replace('_', ' ')}`,
      });
    },
  });
}

/* ------------------------------------------------------------------ profile */

export function useProfile(handle: string | undefined) {
  return useQuery({
    queryKey: communityKeys.profile(handle ?? ''),
    enabled: Boolean(handle),
    queryFn: ({ signal }) => api.get<ProfileResponse>(`/users/${handle}/profile`, { signal }),
  });
}

/* ------------------------------------------------------------------ side rails */

/**
 * `GET /api/plants` has no "newest" sort, so the rail sorts the latest published page by
 * `publishedAt` client-side. It is therefore labelled "Recently added" from real
 * `publishedAt` values - not a trending list, which nothing in the API could support.
 */
export function useRecentPlants(limit = 4) {
  return useQuery({
    queryKey: communityKeys.recentPlants,
    queryFn: async ({ signal }) => {
      const page = await api.get<Paginated<Plant>>('/plants', {
        query: { sort: 'recent', pageSize: Math.max(limit, 8) },
        signal,
      });
      return page.items
        .filter((plant) => Boolean(plant.publishedAt))
        .slice(0, limit);
    },
  });
}

/**
 * All-time XP leaders (`window=all`); the feed labels them as such. The query deliberately shares
 * `queryKeys.leaderboard('all')` with the Learn phase's own hook, so both screens read one cached
 * response and an XP write invalidates them together. The rail renders the first few rows.
 */
export function useContributors() {
  return useQuery({
    queryKey: queryKeys.leaderboard('all'),
    queryFn: ({ signal }) =>
      api.get<ContributorsResponse>('/leaderboard', { query: { window: 'all' }, signal }),
  });
}

/**
 * Plant tag autocomplete. The raw input is debounced before it becomes a query, so typing does
 * not fire a request per keystroke; an empty term disables the query entirely and the picker
 * shows no list rather than the whole encyclopedia.
 */
export function usePlantSearch(term: string, pageSize = SEARCH_PAGE_SIZE) {
  const debounced = useDebouncedValue(term, SEARCH_DEBOUNCE_MS);
  const q = debounced.trim();

  const query = useQuery({
    queryKey: communityKeys.plantSearch(q),
    enabled: q.length > 0,
    queryFn: ({ signal }) =>
      api.get<Paginated<Plant>>('/plants', { query: { q, pageSize }, signal }),
  });

  const results = useMemo(() => query.data?.items ?? [], [query.data]);
  return { ...query, results, debouncedTerm: q };
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
