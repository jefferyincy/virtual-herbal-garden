/**
 * Data layer for auth and onboarding.
 *
 * Every network call goes through `api`. Session-changing writes go through `useSession`, because
 * the store owns the in-memory access token and the `status` flag the route guards read; the two
 * endpoints that predate a session (`forgot`, `reset`) are called with `auth: false` so a stale
 * 401 can never trigger a pointless refresh rotation.
 *
 * Anything that changes the user invalidates `queryKeys.me`, which is the cache key the rest of the
 * app fetches the viewer from.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { queryKeys } from '@/lib/query';
import { useSession } from '@/stores/session';
import type { Paginated, Plant, User } from '@/types/api';
import type { OnboardingInput } from '@/features/auth/schemas';

/* ------------------------------------------------------------------ errors */

/**
 * The message the server actually sent. `error.issues` never reaches here - zod failures are
 * handled by the form that owns the schema - so this is only about turning an unknown thrown value
 * into something safe to render.
 */
export function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Try again.';
}

/**
 * `details: Array<{path, message}>` from a 422, keyed by field name. Empty for every other error,
 * so a form can merge it over its own field errors unconditionally.
 */
export function apiFieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || !Array.isArray(error.details)) return {};
  const mapped: Record<string, string> = {};
  for (const entry of error.details) {
    if (!entry || typeof entry !== 'object') continue;
    if (!('path' in entry) || !('message' in entry)) continue;
    mapped[String(entry.path)] = String(entry.message);
  }
  return mapped;
}

/**
 * zod's `issues[].path` is an array of keys and the first entry names the field on these flat
 * forms, so `safeParse` failures become the same `Record<field, message>` a form already holds for
 * its own validation. Typed structurally to keep zod out of the data layer.
 */
export function issuesToFieldErrors(
  issues: ReadonlyArray<{ path: ReadonlyArray<string | number>; message: string }>,
): Record<string, string> {
  const mapped: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path[0];
    if (typeof key === 'string') mapped[key] ??= issue.message;
  }
  return mapped;
}

/* ------------------------------------------------------------------ login / register */

export function useLogin() {
  const login = useSession((s) => s.login);
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) => login(email, password),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
}

export function useRegister() {
  const register = useSession((s) => s.register);
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: { name: string; email: string; password: string }) => register(input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
}

/* ------------------------------------------------------------------ password reset */

export type ForgotResponse = { ok: true; devToken?: string };

/** Unauthenticated by definition - the caller has no session yet. */
export function useForgotPassword() {
  return useMutation({
    mutationFn: ({ email }: { email: string }) =>
      api.post<ForgotResponse>('/auth/forgot', { email }, { auth: false }),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: ({ token, password }: { token: string; password: string }) =>
      api.post<{ ok: true }>('/auth/reset', { token, password }, { auth: false }),
  });
}

/* ------------------------------------------------------------------ onboarding */

export type OnboardingResponse = { user: User };

export function useCompleteOnboarding() {
  const client = useQueryClient();
  const setUser = useSession((s) => s.setUser);

  return useMutation({
    mutationFn: (input: OnboardingInput) =>
      api.patch<OnboardingResponse>('/auth/onboarding', {
        interests: input.interests,
        experience: input.experience,
        followedPlants: input.followedPlants,
      }),
    // Seed the store from the response so the shell (XP, level, avatar) updates without a refetch.
    onSuccess: (data) => {
      setUser(data.user);
      void client.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
}

/* ------------------------------------------------------------------ queries */

/** The viewer. Disabled until a session exists - an anonymous call would only 401. */
export function useMe() {
  const authed = useSession((s) => s.status === 'authenticated');

  return useQuery({
    queryKey: queryKeys.me,
    enabled: authed,
    queryFn: async ({ signal }) => (await api.get<{ user: User }>('/auth/me', { signal })).user,
  });
}

const FOLLOWABLE_PAGE_SIZE = 50;

/**
 * The catalogue the onboarding plant picker follows plants from. Keyed under the shared `plants`
 * prefix so an admin edit invalidates it too.
 */
export function useFollowablePlants() {
  return useQuery({
    queryKey: [...queryKeys.plants, 'followable', FOLLOWABLE_PAGE_SIZE] as const,
    queryFn: ({ signal }) =>
      api.get<Paginated<Plant>>('/plants', { query: { pageSize: FOLLOWABLE_PAGE_SIZE }, signal }),
  });
}
