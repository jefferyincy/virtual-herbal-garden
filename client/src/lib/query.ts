import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Never retry a client error: 4xx means the request itself is wrong.
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status < 500) return false;
        return failureCount < 2;
      },
    },
    mutations: { retry: false },
  },
});

/** Shared query keys. Feature-local keys are defined next to their hooks. */
export const queryKeys = {
  me: ['me'] as const,
  health: ['health'] as const,
  plants: ['plants'] as const,
  plant: (slug: string) => ['plants', slug] as const,
  ailments: ['ailments'] as const,
  progress: ['progress'] as const,
  dueFlashcards: ['flashcards', 'due'] as const,
  leaderboard: (window: string) => ['leaderboard', window] as const,
  badges: ['badges'] as const,
  gardens: ['gardens'] as const,
  garden: (id: string) => ['gardens', id] as const,
  publicGarden: (slug: string) => ['g', slug] as const,
  posts: ['posts'] as const,
  post: (id: string) => ['posts', id] as const,
  notifications: ['notifications'] as const,
  adminStats: ['admin', 'stats'] as const,
  adminUsers: ['admin', 'users'] as const,
};
