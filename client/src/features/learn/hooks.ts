/**
 * Data layer for the Learn phase (build spec section 4 learning endpoints).
 *
 * Every network call goes through `api` - no component in this feature ever calls fetch.
 * Query keys that other features also read (`progress`, `badges`, `leaderboard`, `notifications`,
 * `me`) come from `lib/query.ts` so invalidation from here reaches the rest of the app; keys that
 * only exist inside Learn are defined next to the hooks that use them.
 *
 * Helper types that the server returns but `types/api.ts` does not model (envelopes, stat blobs)
 * are declared here on purpose - `types/api.ts` is the shared contract and is not edited by this
 * feature.
 */
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/stores/session';
import type {
  Badge,
  DueCard,
  GradeResult,
  LeaderboardRow,
  NotificationRow,
  Paginated,
  Plant,
  Quiz,
  SrsRating,
  SrsState,
} from '@/types/api';

/* ------------------------------------------------------------------ shared cache keys */

const lessonKeys = {
  all: ['lessons'] as const,
  detail: (slug: string) => ['lessons', slug] as const,
};

const quizKeys = {
  all: ['quizzes'] as const,
  detail: (id: string) => ['quizzes', id] as const,
  attempts: (id: string, page: number) => ['quizzes', id, 'attempts', page] as const,
};

const badgeKeys = {
  all: [queryKeys.badges[0], 'all'] as const,
  mine: [queryKeys.badges[0], 'mine'] as const,
};

const progressKeys = {
  me: [queryKeys.progress[0], 'me'] as const,
  table: (page: number) => [queryKeys.progress[0], 'table', page] as const,
};

const notificationKeys = {
  list: (filter: NotificationFilter) =>
    [
      queryKeys.notifications[0],
      filter.unread ? 'unread' : 'all',
      filter.type ?? 'any',
      filter.page ?? 1,
    ] as const,
};

/**
 * Invalidate every query a lesson/quiz/flashcard write can move: the learner's own XP and
 * streak, the plant table, badges and both leaderboard windows. The bare `['leaderboard']`
 * prefix covers `queryKeys.leaderboard('week')` and `queryKeys.leaderboard('all')`.
 */
function refreshLearnerState(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: queryKeys.progress });
  void client.invalidateQueries({ queryKey: queryKeys.me });
  void client.invalidateQueries({ queryKey: queryKeys.badges });
  void client.invalidateQueries({ queryKey: ['leaderboard'] });
}

/* ------------------------------------------------------------------ response shapes */

export interface LessonListItem {
  _id: string;
  slug: string;
  title: string;
  section: string | null;
  order: number;
  estMinutes: number;
  completed: boolean;
  plant: Pick<Plant, 'slug' | 'commonName' | 'botanicalName' | 'images'> | null;
}

export interface LessonGroup {
  section: string;
  lessons: LessonListItem[];
}

export interface LessonsResponse {
  sections: Array<{ name: string; lessonCount: number }>;
  groups: LessonGroup[];
  nextLesson: { slug: string; title: string } | null;
}

export interface LessonContent {
  _id: string;
  slug: string;
  title: string;
  body: string;
  section: string | null;
  order: number;
  estMinutes: number;
}

export interface LessonNeighbour {
  slug: string;
  title: string;
  order: number;
}

export interface LessonDetailResponse {
  lesson: LessonContent;
  plant: Plant | null;
  siblings: LessonNeighbour[];
  prev: LessonNeighbour | null;
  next: LessonNeighbour | null;
  position: { index: number; total: number };
  completed: boolean;
}

export interface EarnedBadge {
  key: string;
  name: string;
  icon: string;
}

export interface CompleteLessonResult {
  completed: true;
  xpAwarded: number;
  level: number;
  levelUp: boolean;
  badgesEarned: EarnedBadge[];
}

export type QuizDifficulty = Quiz['difficulty'];

export interface QuizListItem {
  _id: string;
  family: string;
  title: string;
  difficulty: QuizDifficulty;
  questionCount: number;
  timeLimitSec: number;
  plantIds: string[];
  bestPct: number | null;
  passed: boolean;
  attempts: number;
  locked: boolean;
  unlockProgress: { lessonsNeeded: number; lessonsCompleted: number } | null;
}

export interface QuizFamilyGroup {
  family: string;
  quizzes: QuizListItem[];
}

export interface QuizzesResponse {
  groups: QuizFamilyGroup[];
}

export interface ServedQuestion {
  _id: string;
  stem: string;
  options: string[];
}

export interface QuizDetailResponse {
  quiz: {
    _id: string;
    family: string;
    title: string;
    difficulty: QuizDifficulty;
    timeLimitSec: number;
    questionCount: number;
  };
  questions: ServedQuestion[];
  attempts: number;
  bestPct: number | null;
}

export interface AttemptReviewRow {
  questionId: string;
  chosenIndex: number;
  correct: boolean;
  stem: string;
  options: string[];
  answerIndex: number;
  explanation: string;
}

export interface SubmittedAttempt {
  _id: string;
  quizId: string;
  score: number;
  total: number;
  secondsTaken: number;
  xpAwarded: number;
  createdAt: string;
}

export interface SubmitAttemptResponse {
  attempt: SubmittedAttempt;
  results: AttemptReviewRow[];
  passed: boolean;
  level: number;
  levelUp: boolean;
  badgesEarned: EarnedBadge[];
}

export interface AttemptSummary {
  _id: string;
  score: number;
  total: number;
  secondsTaken: number;
  xpAwarded: number;
  createdAt: string;
}

export type QuizAttemptsResponse = Paginated<AttemptSummary> & {
  bestPct: number | null;
  passed: boolean;
};

export interface DueFlashcardsResponse {
  items: DueCard[];
  dueCount: number;
  newAvailable: number;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** The grade endpoint returns the interval previews used by the rating buttons. */
export type FlashcardGradeResult = GradeResult & {
  previewIntervals: Record<SrsRating, string>;
};

export interface ProgressRow {
  plantId: string;
  read: boolean;
  mastery: number;
  srs: SrsState;
  plant: Pick<Plant, 'slug' | 'commonName' | 'botanicalName' | 'family' | 'images'>;
}

export type ProgressTableResponse = Paginated<ProgressRow> & {
  summary: { plantsRead: number; totalPlants: number; mastered: number; dueNow: number };
};

/**
 * `/progress/me` returns a stat blob that `types/api.ts` does not model. Fields are optional so a
 * screen renders an em dash instead of `NaN` if the server adds or drops one.
 */
export interface LearnerStats {
  plantsRead?: number;
  lessonsCompleted?: number;
  quizzesPassed?: number;
  attempts?: number;
  mastered?: number;
  dueNow?: number;
  followedPlants?: number;
  posts?: number;
}

export interface RecentActivityItem {
  kind: 'read' | 'quiz' | 'post';
  label: string;
  at: string;
  href: string;
}

export interface MyProgressResponse {
  xp: number;
  level: number;
  levelProgress: { intoLevel: number; span: number; pct: number };
  streak: { current: number; longest: number; lastActiveAt: string | null };
  badges: Array<Pick<Badge, 'key' | 'name' | 'icon' | 'xpReward'> & { earnedAt: string }>;
  stats: LearnerStats;
  recentActivity: RecentActivityItem[];
}

export type LeaderboardWindow = 'week' | 'all';

export interface LeaderboardResponse {
  window: LeaderboardWindow;
  rows: LeaderboardRow[];
  currentUserRank: number | null;
}

export interface BadgesResponse {
  items: Array<Badge & { earnedBy: number }>;
}

export interface MyBadgesResponse {
  items: Array<Badge & { earnedAt: string }>;
}

export type NotificationType = NotificationRow['type'];

export interface NotificationFilter {
  unread?: boolean;
  type?: NotificationType;
  page?: number;
}

export interface NotificationsResponse extends Paginated<NotificationRow> {
  unreadCount: number;
}

/* ------------------------------------------------------------------ queries */

export function useLessons() {
  return useQuery({
    queryKey: lessonKeys.all,
    queryFn: ({ signal }) => api.get<LessonsResponse>('/lessons', { signal }),
  });
}

export function useLesson(slug: string | undefined) {
  return useQuery({
    queryKey: lessonKeys.detail(slug ?? ''),
    enabled: Boolean(slug),
    queryFn: ({ signal }) => api.get<LessonDetailResponse>(`/lessons/${slug}`, { signal }),
  });
}

export interface QuizFilters {
  q?: string;
  difficulty?: QuizDifficulty | 'all';
}

/**
 * The list endpoint takes no filter parameters, so search and difficulty are applied here rather
 * than by re-fetching: the whole quiz catalogue is one response and the filtered view must stay
 * client-instant while the user types.
 */
export function useQuizzes(filters: QuizFilters = {}) {
  const query = useQuery({
    queryKey: quizKeys.all,
    queryFn: ({ signal }) => api.get<QuizzesResponse>('/quizzes', { signal }),
  });

  const q = (filters.q ?? '').trim().toLowerCase();
  const difficulty = filters.difficulty ?? 'all';

  const groups = useMemo(() => {
    const source = query.data?.groups ?? [];
    return source
      .map((group) => ({
        family: group.family,
        quizzes: group.quizzes.filter(
          (quiz) =>
            (difficulty === 'all' || quiz.difficulty === difficulty) &&
            (q === '' ||
              quiz.title.toLowerCase().includes(q) ||
              quiz.family.toLowerCase().includes(q)),
        ),
      }))
      .filter((group) => group.quizzes.length > 0);
  }, [query.data, q, difficulty]);

  return { ...query, groups };
}

export function useQuiz(id: string | undefined) {
  return useQuery({
    queryKey: quizKeys.detail(id ?? ''),
    enabled: Boolean(id),
    queryFn: ({ signal }) => api.get<QuizDetailResponse>(`/quizzes/${id}`, { signal }),
  });
}

export function useQuizAttempts(id: string | undefined, page: number) {
  return useQuery({
    queryKey: quizKeys.attempts(id ?? '', page),
    enabled: Boolean(id),
    queryFn: ({ signal }) =>
      api.get<QuizAttemptsResponse>(`/quizzes/${id}/attempts`, { query: { page }, signal }),
  });
}

export function useDueFlashcards(limit = 20) {
  const authed = useSession((s) => s.status === 'authenticated');
  return useQuery({
    queryKey: [...queryKeys.dueFlashcards, limit] as const,
    enabled: authed,
    queryFn: ({ signal }) =>
      api.get<DueFlashcardsResponse>('/flashcards/due', { query: { limit }, signal }),
  });
}

export function useProgressTable(page: number) {
  const authed = useSession((s) => s.status === 'authenticated');
  return useQuery({
    queryKey: progressKeys.table(page),
    enabled: authed,
    queryFn: ({ signal }) => api.get<ProgressTableResponse>('/progress', { query: { page }, signal }),
  });
}

export function useMyProgress() {
  const authed = useSession((s) => s.status === 'authenticated');
  return useQuery({
    queryKey: progressKeys.me,
    enabled: authed,
    queryFn: ({ signal }) => api.get<MyProgressResponse>('/progress/me', { signal }),
  });
}

export function useLeaderboard(window: LeaderboardWindow) {
  return useQuery({
    queryKey: queryKeys.leaderboard(window),
    queryFn: ({ signal }) =>
      api.get<LeaderboardResponse>('/leaderboard', { query: { window }, signal }),
  });
}

export function useBadges() {
  return useQuery({
    queryKey: badgeKeys.all,
    queryFn: ({ signal }) => api.get<BadgesResponse>('/badges', { signal }),
  });
}

export function useMyBadges() {
  const authed = useSession((s) => s.status === 'authenticated');
  return useQuery({
    queryKey: badgeKeys.mine,
    enabled: authed,
    queryFn: ({ signal }) => api.get<MyBadgesResponse>('/badges/mine', { signal }),
  });
}

export function useNotifications(filter: NotificationFilter = {}) {
  const authed = useSession((s) => s.status === 'authenticated');
  return useQuery({
    queryKey: notificationKeys.list(filter),
    enabled: authed,
    queryFn: ({ signal }) =>
      api.get<NotificationsResponse>('/notifications', {
        query: { unread: filter.unread, type: filter.type, page: filter.page },
        signal,
      }),
  });
}

/* ------------------------------------------------------------------ mutations */

export function useCompleteLesson() {
  const client = useQueryClient();
  const { push } = useToast();

  return useMutation({
    mutationFn: (lessonId: string) =>
      api.post<CompleteLessonResult>(`/lessons/${lessonId}/complete`),
    onSuccess: (result) => {
      // The lessons list carries the `completed` flag and overall progress, so both are stale.
      void client.invalidateQueries({ queryKey: lessonKeys.all });
      refreshLearnerState(client);
      push({
        variant: 'success',
        title: 'Lesson complete',
        description: result.levelUp
          ? `+${result.xpAwarded} XP · reached level ${result.level}`
          : `+${result.xpAwarded} XP`,
      });
    },
  });
}

export interface AttemptInput {
  quizId: string;
  answers: Array<{ questionId: string; chosenIndex: number }>;
  secondsTaken: number;
}

export function useSubmitAttempt() {
  const client = useQueryClient();
  const { push } = useToast();

  return useMutation({
    mutationFn: ({ quizId, answers, secondsTaken }: AttemptInput) =>
      api.post<SubmitAttemptResponse>(`/quizzes/${quizId}/attempt`, { answers, secondsTaken }),
    onSuccess: (result, input) => {
      void client.invalidateQueries({ queryKey: quizKeys.all });
      void client.invalidateQueries({ queryKey: quizKeys.detail(input.quizId) });
      void client.invalidateQueries({ queryKey: [quizKeys.all[0], input.quizId, 'attempts'] });
      refreshLearnerState(client);
      push({
        variant: result.passed ? 'success' : 'info',
        title: result.passed ? 'Quiz passed' : 'Quiz submitted',
        description: `${result.attempt.score}/${result.attempt.total} · +${result.attempt.xpAwarded} XP`,
      });
    },
  });
}

export interface GradeFlashcardInput {
  plantId: string;
  rating: SrsRating;
}

export function useGradeFlashcard() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ plantId, rating }: GradeFlashcardInput) =>
      api.post<FlashcardGradeResult>(`/flashcards/${plantId}/grade`, { rating }),
    onSuccess: () => {
      // Grading always awards 0 XP (`GradeResult.xpAwarded` is 0 by contract), so a toast here
      // would fire once per card and say nothing - the interval label shown on the next card is
      // the real feedback.
      void client.invalidateQueries({ queryKey: queryKeys.dueFlashcards });
      void client.invalidateQueries({ queryKey: queryKeys.progress });
    },
  });
}

export function useMarkNotificationsRead() {
  const client = useQueryClient();
  const { push } = useToast();

  return useMutation({
    mutationFn: (ids?: string[]) =>
      api.post<{ updated: number }>('/notifications/read', ids ? { ids } : {}),
    onSuccess: (result) => {
      void client.invalidateQueries({ queryKey: queryKeys.notifications });
      push({
        variant: 'info',
        title: 'Notifications updated',
        description: `${result.updated} marked as read`,
      });
    },
  });
}
