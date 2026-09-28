import { create } from 'zustand';
import { api, ApiError, configureApi } from '@/lib/api';
import type { AuthPayload, User } from '@/types/api';

/**
 * Session store. Holds the access token in memory only (never localStorage, never a cookie
 * the JS can read). The refresh token is an httpOnly cookie and is invisible to this module.
 *
 * Wiring: configureApi() hands the api client the token getter plus the single refresh routine,
 * so the retry-once-on-401 rule lives in one place.
 */

type SessionState = {
  user: User | null;
  accessToken: string | null;
  /** 'loading' until the initial /auth/me probe settles. */
  status: 'loading' | 'authenticated' | 'anonymous';
  login: (email: string, password: string) => Promise<User>;
  register: (input: { name: string; email: string; password: string }) => Promise<User>;
  refresh: () => Promise<boolean>;
  logout: () => Promise<void>;
  setUser: (user: User) => void;
  hydrateMe: () => Promise<void>;
};

let inFlightRefresh: Promise<boolean> | null = null;

export const useSession = create<SessionState>((set, get) => ({
  user: null,
  accessToken: null,
  status: 'loading',

  async login(email, password) {
    const payload = await api.post<AuthPayload>('/auth/login', { email, password }, { auth: false });
    set({ user: payload.user, accessToken: payload.accessToken, status: 'authenticated' });
    return payload.user;
  },

  async register(input) {
    const payload = await api.post<AuthPayload>('/auth/register', input, { auth: false });
    set({ user: payload.user, accessToken: payload.accessToken, status: 'authenticated' });
    return payload.user;
  },

  async refresh() {
    // Collapse concurrent refreshes: a burst of 401s must cause exactly one rotation.
    if (inFlightRefresh) return inFlightRefresh;
    inFlightRefresh = (async () => {
      try {
        const payload = await api.post<AuthPayload>('/auth/refresh', undefined, { auth: false });
        set({ user: payload.user, accessToken: payload.accessToken, status: 'authenticated' });
        return true;
      } catch {
        set({ user: null, accessToken: null, status: 'anonymous' });
        return false;
      } finally {
        inFlightRefresh = null;
      }
    })();
    return inFlightRefresh;
  },

  async logout() {
    try {
      await api.post<void>('/auth/logout', undefined, { auth: false });
    } catch (err) {
      // A failed logout must still clear local state.
      if (!(err instanceof ApiError)) throw err;
    }
    set({ user: null, accessToken: null, status: 'anonymous' });
  },

  setUser(user) {
    set({ user, status: 'authenticated' });
  },

  async hydrateMe() {
    const current = get();
    if (current.status === 'authenticated') return;
    const ok = await get().refresh();
    if (!ok) set({ status: 'anonymous' });
  },
}));

configureApi({
  getAccessToken: () => useSession.getState().accessToken,
  refresh: () => useSession.getState().refresh(),
  onUnauthorized: () => {
    useSession.setState({ user: null, accessToken: null, status: 'anonymous' });
  },
});

export const selectIsAuthed = (s: SessionState) => s.status === 'authenticated';
export const selectRole = (s: SessionState) => s.user?.role ?? null;
