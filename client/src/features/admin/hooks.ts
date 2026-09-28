/**
 * Data layer for the Admin phase (build spec section 4 admin endpoints).
 *
 * Every network call goes through `api` - no screen in this feature ever calls fetch. Query keys
 * that other features also read (`plants`, `badges`, `ailments`, `posts`, `quizzes`) are built on
 * the prefix constants from `lib/query.ts` where one exists, so a write performed here invalidates
 * the learner-facing caches too; keys that only exist inside Admin are declared next to the hooks
 * that use them.
 *
 * Envelopes the server returns but `types/api.ts` does not model (the admin user row, the
 * moderation queue, the plants/badges list wrappers) are declared here on purpose: `types/api.ts`
 * is the shared contract and is not edited by this feature.
 */
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { queryKeys } from '@/lib/query';
import { useToast } from '@/components/ui/Toast';
import type {
  AdminStats,
  Ailment,
  Badge,
  MedicalSystem,
  Paginated,
  Plant,
  PlantPart,
  Post,
  PostStatus,
  Preparation,
  Quiz,
  Role,
  SourceRef,
  Toxicity,
} from '@/types/api';

/* ------------------------------------------------------------------ badge vocabulary */

/**
 * Mirror of the server's `BADGE_ICON_NAMES` (server/src/models/enums.ts, owned by the badges
 * route). The server rejects any icon outside that list with a 422, so this array MUST stay in
 * sync with it - adding an icon here without adding it there produces a form that fails only on
 * submit. Verified against the server list; same order, same membership.
 */
export const BADGE_ICON_OPTIONS = [
  'leaf',
  'book',
  'book-open',
  'award',
  'flame',
  'users',
  'message',
  'star',
  'trophy',
  'check-circle',
  'sparkles',
  'compass',
  'layers',
  'shield',
  'home',
  'chart',
  'hexagon',
  'clock',
  'list',
  'globe',
  'map',
  'grid',
  'search',
  'dot',
  'calendar',
] as const;

export type BadgeIconOption = (typeof BADGE_ICON_OPTIONS)[number];

/**
 * Badge criteria actions, minus `earn_badge`. The server evaluates criteria against a learner's
 * stats and `earn_badge` (N badges already earned) needs cross-badge state it deliberately does
 * not track, so it never matches - offering it in the builder would create a badge nobody can
 * earn. It is excluded here on purpose; do not add it back.
 */
export const BADGE_ACTION_OPTIONS = [
  'read_plant',
  'complete_lesson',
  'complete_quiz',
  'quiz_pass_rate',
  'streak_days',
  'read_plant_family',
  'contribute_post',
  'follow_plant',
] as const;

export type BadgeActionOption = (typeof BADGE_ACTION_OPTIONS)[number];

/* ------------------------------------------------------------------ query keys */

const adminKeys = {
  stats: queryKeys.adminStats,
  users: (filters: AdminUserFilters) =>
    [
      ...queryKeys.adminUsers,
      filters.q ?? '',
      filters.role ?? 'all',
      filters.banned === undefined ? 'any' : filters.banned ? 'banned' : 'active',
      filters.page ?? 1,
    ] as const,
  queue: (status: PostStatus) => ['admin', 'moderation', 'queue', status] as const,
  queuePrefix: ['admin', 'moderation'] as const,
  diff: (id: string) => ['admin', 'moderation', 'diff', id] as const,
  plants: (filters: AdminPlantFilters) =>
    [
      'admin',
      'plants',
      filters.q ?? '',
      filters.status ?? 'all',
      filters.family ?? 'all',
      filters.page ?? 1,
    ] as const,
  plantsPrefix: ['admin', 'plants'] as const,
  plantEdit: (slugOrId: string) => ['admin', 'plant-edit', slugOrId] as const,
  quizzes: ['admin', 'quizzes'] as const,
  badges: ['admin', 'badges'] as const,
};

/** Learner-facing quiz cache (build spec section 4) uses the bare `['quizzes']` prefix. */
const LEARNER_QUIZ_PREFIX = 'quizzes';

/**
 * Every admin mutation can move the dashboard counters (users, plants, queue depth), so the whole
 * `['admin']` prefix is invalidated rather than one list key at a time. Callers add the
 * learner-facing prefixes a specific write also affects.
 */
function invalidateAdmin(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: ['admin'] });
}

/* ------------------------------------------------------------------ response shapes */

export interface AdminUser {
  _id: string;
  name: string;
  email: string;
  handle: string;
  role: Role;
  xp: number;
  level: number;
  joinedAt: string;
  lastActiveAt: string;
  banned: boolean;
  badgeCount: number;
}

export interface AdminUserFilters {
  q?: string;
  role?: Role | 'all';
  banned?: boolean;
  page?: number;
}

export interface AdminUsersResponse extends Paginated<AdminUser> {
  totalUsers: number;
  activeToday: number;
  /** Always 0 - the server has no expert-application flow. Kept visible rather than hidden. */
  pendingExpertApplications: number;
}

export type AdminPlantStatus = 'all' | 'published' | 'draft';

export interface AdminPlantRow extends Plant {
  lessonsCount: number;
  status: 'published' | 'draft';
}

export interface AdminPlantFilters {
  q?: string;
  status?: AdminPlantStatus;
  family?: string;
  page?: number;
}

export type AdminPlantsResponse = Paginated<AdminPlantRow>;

export interface ModerationQueueItem {
  _id: string;
  type: Post['type'];
  title: string;
  body: string;
  author: { name: string; handle: string };
  createdAt: string;
  reviewerNote: string | null;
  sources: string[];
  plantIds: string[];
}

export interface ModerationQueueResponse {
  items: ModerationQueueItem[];
  total: number;
  pendingCount: number;
  flaggedCount: number;
}

export interface ModerationVersion {
  body: string;
  title: string;
  sources: string[];
  at: string;
}

export interface ModerationDiffResponse {
  submitted: ModerationVersion;
  /** null when the post has never been published - the pane says so instead of rendering blank. */
  current: ModerationVersion | null;
  changedLines: number[];
}

export type ModerationAction = 'approve' | 'reject' | 'request_changes';

/** Writable plant fields. `slug` is server-derived and deliberately not part of this shape. */
export interface PlantWriteInput {
  commonName: string;
  botanicalName: string;
  family: string;
  partsUsed: PlantPart[];
  preparations: Preparation[];
  ailments: string[];
  activeCompounds: string[];
  description: string;
  medicinalUses: string;
  dosage: string | null;
  contraindications: string | null;
  toxicity: Toxicity;
  region: string[];
  systemsMentioned: MedicalSystem[];
  tags: string[];
  sources: SourceRef[];
  unverified: boolean;
}

export interface PlantWritePayload {
  id?: string;
  input: PlantWriteInput;
}

export type BulkPlantAction = 'publish' | 'unpublish' | 'delete';

export type AdminQuizzesResponse = { items: Quiz[] };

export interface QuizQuestionInput {
  stem: string;
  options: string[];
  answerIndex: number;
  explanation: string;
  plantId: string | null;
}

export interface QuizWriteInput {
  title: string;
  family: string;
  difficulty: Quiz['difficulty'];
  timeLimitSec: number;
  plantIds: string[];
  questions: QuizQuestionInput[];
  published: boolean;
}

export interface QuizWritePayload {
  id?: string;
  input: QuizWriteInput;
}

export type AdminBadgeRow = Badge & { earnedBy: number };

export type AdminBadgesResponse = { items: AdminBadgeRow[] };

export interface BadgeWriteInput {
  key: string;
  name: string;
  description: string;
  criteria: { action: BadgeActionOption; target: number; param: string | null };
  xpReward: number;
  icon: string;
}

export interface BadgeWritePayload {
  id?: string;
  input: BadgeWriteInput;
}

export type AilmentOption = Ailment & { plantCount: number };

export type AilmentOptionsResponse = { items: AilmentOption[] };

/**
 * The message the server actually sent, with a 422's field errors appended. The shared error
 * envelope carries `details: Array<{path, message}>` for validation failures, and the admin forms
 * have to show which field failed rather than only "validation error".
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

/* ------------------------------------------------------------------ dashboard */

export function useAdminStats() {
  return useQuery({
    queryKey: adminKeys.stats,
    queryFn: ({ signal }) => api.get<AdminStats>('/admin/stats', { signal }),
  });
}

/* ------------------------------------------------------------------ users */

export function useAdminUsers(filters: AdminUserFilters) {
  return useQuery({
    queryKey: adminKeys.users(filters),
    queryFn: ({ signal }) =>
      api.get<AdminUsersResponse>('/admin/users', {
        query: {
          q: filters.q,
          role: filters.role && filters.role !== 'all' ? filters.role : undefined,
          banned: filters.banned,
          page: filters.page ?? 1,
        },
        signal,
      }),
  });
}

export function useSetUserRole() {
  const client = useQueryClient();
  const { push } = useToast();

  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) =>
      api.patch<{ user: AdminUser }>(`/admin/users/${id}/role`, { role }),
    onSuccess: (result) => {
      invalidateAdmin(client);
      push({
        variant: 'success',
        title: 'Role updated',
        description: `${result.user.name} is now ${result.user.role}`,
      });
    },
  });
}

export function useSetUserBanned() {
  const client = useQueryClient();
  const { push } = useToast();

  return useMutation({
    mutationFn: ({ id, banned, reason }: { id: string; banned: boolean; reason?: string }) =>
      api.post<{ user: AdminUser }>(`/admin/users/${id}/ban`, {
        banned,
        ...(reason ? { reason } : {}),
      }),
    onSuccess: (result, variables) => {
      invalidateAdmin(client);
      push({
        variant: variables.banned ? 'warning' : 'success',
        title: variables.banned ? 'User banned' : 'User reinstated',
        description: result.user.name,
      });
    },
  });
}

/* ------------------------------------------------------------------ moderation */

export function useModerationQueue(status: PostStatus) {
  return useQuery({
    queryKey: adminKeys.queue(status),
    queryFn: ({ signal }) =>
      api.get<ModerationQueueResponse>('/admin/moderation/queue', { query: { status }, signal }),
  });
}

export function useModerationDiff(id: string | undefined) {
  return useQuery({
    queryKey: adminKeys.diff(id ?? ''),
    enabled: Boolean(id),
    queryFn: ({ signal }) =>
      api.get<ModerationDiffResponse>(`/admin/moderation/${id}/diff`, { signal }),
  });
}

export function useModeratePost() {
  const client = useQueryClient();
  const { push } = useToast();

  return useMutation({
    mutationFn: ({
      id,
      action,
      note,
    }: {
      id: string;
      action: ModerationAction;
      note?: string;
    }) =>
      api.patch<{ post: Post }>(`/posts/${id}/moderate`, {
        action,
        ...(note ? { note } : {}),
      }),
    onSuccess: (result, variables) => {
      void client.invalidateQueries({ queryKey: adminKeys.queuePrefix });
      void client.invalidateQueries({ queryKey: queryKeys.posts });
      invalidateAdmin(client);
      push({
        variant: variables.action === 'approve' ? 'success' : 'info',
        title: 'Moderation saved',
        description: `${result.post.title} - ${variables.action.replace('_', ' ')}`,
      });
    },
  });
}

export function useDeletePost() {
  const client = useQueryClient();
  const { push } = useToast();

  return useMutation({
    mutationFn: (id: string) => api.del<void>(`/admin/posts/${id}`),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: adminKeys.queuePrefix });
      void client.invalidateQueries({ queryKey: queryKeys.posts });
      invalidateAdmin(client);
      push({ variant: 'warning', title: 'Post deleted' });
    },
  });
}

/* ------------------------------------------------------------------ plants */

export function useAdminPlants(filters: AdminPlantFilters) {
  return useQuery({
    queryKey: adminKeys.plants(filters),
    queryFn: ({ signal }) =>
      api.get<AdminPlantsResponse>('/admin/plants', {
        query: {
          q: filters.q,
          status: filters.status ?? 'all',
          family: filters.family,
          page: filters.page ?? 1,
        },
        signal,
      }),
  });
}

const BULK_PAST_TENSE: Record<BulkPlantAction, string> = {
  publish: 'published',
  unpublish: 'unpublished',
  delete: 'deleted',
};

export function useBulkPlantAction() {
  const client = useQueryClient();
  const { push } = useToast();

  return useMutation({
    mutationFn: ({ ids, action }: { ids: string[]; action: BulkPlantAction }) =>
      api.post<{ modified: number }>('/admin/plants/bulk', { ids, action }),
    onSuccess: (result, variables) => {
      void client.invalidateQueries({ queryKey: adminKeys.plantsPrefix });
      void client.invalidateQueries({ queryKey: queryKeys.plants });
      invalidateAdmin(client);
      push({
        variant: variables.action === 'delete' ? 'warning' : 'success',
        title: `${result.modified} plant${result.modified === 1 ? '' : 's'} ${BULK_PAST_TENSE[variables.action]}`,
      });
    },
  });
}

export function usePlantForEdit(slugOrId: string | undefined) {
  return useQuery({
    queryKey: adminKeys.plantEdit(slugOrId ?? ''),
    enabled: Boolean(slugOrId),
    queryFn: ({ signal }) => api.get<Plant>(`/plants/${slugOrId}`, { signal }),
  });
}

export function useSavePlant() {
  const client = useQueryClient();
  const { push } = useToast();

  return useMutation({
    mutationFn: ({ id, input }: PlantWritePayload) =>
      id
        ? api.patch<Plant>(`/plants/${id}`, input)
        : api.post<Plant>('/plants', input),
    onSuccess: (saved, variables) => {
      void client.invalidateQueries({ queryKey: adminKeys.plantsPrefix });
      void client.invalidateQueries({ queryKey: queryKeys.plants });
      void client.invalidateQueries({ queryKey: queryKeys.plant(saved.slug) });
      invalidateAdmin(client);
      push({
        variant: 'success',
        title: variables.id ? 'Plant saved' : 'Plant created',
        description: saved.commonName,
      });
    },
  });
}

export function useDeletePlant() {
  const client = useQueryClient();
  const { push } = useToast();

  return useMutation({
    mutationFn: (id: string) => api.del<void>(`/plants/${id}`),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: adminKeys.plantsPrefix });
      void client.invalidateQueries({ queryKey: queryKeys.plants });
      invalidateAdmin(client);
      push({ variant: 'warning', title: 'Plant deleted' });
    },
  });
}

export function useAilmentOptions() {
  return useQuery({
    queryKey: [...queryKeys.ailments, 'options'] as const,
    queryFn: ({ signal }) => api.get<AilmentOptionsResponse>('/ailments', { signal }),
  });
}

/* ------------------------------------------------------------------ quizzes */

export function useAdminQuizzes() {
  return useQuery({
    queryKey: adminKeys.quizzes,
    queryFn: ({ signal }) => api.get<AdminQuizzesResponse>('/admin/quizzes', { signal }),
  });
}

export function useSaveQuiz() {
  const client = useQueryClient();
  const { push } = useToast();

  return useMutation({
    mutationFn: ({ id, input }: QuizWritePayload) =>
      id ? api.patch<Quiz>(`/admin/quizzes/${id}`, input) : api.post<Quiz>('/admin/quizzes', input),
    onSuccess: (saved, variables) => {
      void client.invalidateQueries({ queryKey: adminKeys.quizzes });
      // The learner quiz catalogue is keyed by the bare `['quizzes']` prefix.
      void client.invalidateQueries({ queryKey: [LEARNER_QUIZ_PREFIX] });
      push({
        variant: 'success',
        title: variables.id ? 'Quiz saved' : 'Quiz created',
        description: `${saved.title} - ${saved.published ? 'published' : 'draft'}`,
      });
    },
  });
}

export function useDeleteQuiz() {
  const client = useQueryClient();
  const { push } = useToast();

  return useMutation({
    mutationFn: (id: string) => api.del<void>(`/admin/quizzes/${id}`),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: adminKeys.quizzes });
      void client.invalidateQueries({ queryKey: [LEARNER_QUIZ_PREFIX] });
      push({ variant: 'warning', title: 'Quiz deleted' });
    },
  });
}

/* ------------------------------------------------------------------ badges */

export function useAdminBadges() {
  return useQuery({
    queryKey: adminKeys.badges,
    queryFn: ({ signal }) => api.get<AdminBadgesResponse>('/admin/badges', { signal }),
  });
}

export function useSaveBadge() {
  const client = useQueryClient();
  const { push } = useToast();

  return useMutation({
    mutationFn: ({ id, input }: BadgeWritePayload) =>
      id
        ? api.patch<Badge>(`/admin/badges/${id}`, input)
        : api.post<Badge>('/admin/badges', input),
    onSuccess: (saved, variables) => {
      void client.invalidateQueries({ queryKey: adminKeys.badges });
      void client.invalidateQueries({ queryKey: queryKeys.badges });
      push({
        variant: 'success',
        title: variables.id ? 'Badge saved' : 'Badge created',
        description: saved.name,
      });
    },
  });
}

export function useDeleteBadge() {
  const client = useQueryClient();
  const { push } = useToast();

  return useMutation({
    mutationFn: (id: string) => api.del<void>(`/admin/badges/${id}`),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: adminKeys.badges });
      void client.invalidateQueries({ queryKey: queryKeys.badges });
      push({ variant: 'warning', title: 'Badge deleted' });
    },
  });
}
