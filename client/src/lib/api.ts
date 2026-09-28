/**
 * The only network entry point in the client. Nothing else calls fetch.
 *
 * Auth model (build spec section 3):
 *  - access token lives in memory only, supplied by the session store through configureApi()
 *  - refresh token is an httpOnly cookie the browser attaches automatically (credentials: include)
 *  - a 401 triggers exactly one refresh retry, then a hard logout
 */

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, message: string, code: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type SessionHooks = {
  getAccessToken: () => string | null;
  /** Resolve true when a new access token has been installed. */
  refresh: () => Promise<boolean>;
  onUnauthorized: () => void;
};

let session: SessionHooks = {
  getAccessToken: () => null,
  refresh: async () => false,
  onUnauthorized: () => {},
};

/** Called once by the session store at module init. */
export function configureApi(hooks: SessionHooks): void {
  session = hooks;
}

export type QueryValue =
  | string
  | number
  | boolean
  | undefined
  | null
  | ReadonlyArray<string | number | boolean>;

export type RequestOptions = {
  query?: Record<string, QueryValue>;
  body?: unknown;
  signal?: AbortSignal;
  /** Set false for endpoints that must never trigger a refresh retry (login, refresh itself). */
  auth?: boolean;
};

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  if (!query) return `/api${path}`;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, String(item));
    } else {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return `/api${path}${qs ? `?${qs}` : ''}`;
}

async function send(method: string, path: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = session.getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let body: BodyInit | undefined;
  if (options.body instanceof FormData) {
    body = options.body;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  return fetch(buildUrl(path, options.query), {
    method,
    headers,
    body,
    credentials: 'include',
    ...(options.signal ? { signal: options.signal } : {}),
  });
}

async function toApiError(res: Response): Promise<ApiError> {
  let message = res.statusText || 'Request failed';
  let code = 'error';
  let details: unknown = undefined;
  try {
    const payload = (await res.json()) as {
      error?: { message?: string; code?: string; details?: unknown };
    };
    if (payload?.error) {
      message = payload.error.message ?? message;
      code = payload.error.code ?? code;
      details = payload.error.details;
    }
  } catch {
    // Non-JSON error body (proxy failure, HTML error page) - keep the status text.
  }
  return new ApiError(res.status, message, code, details);
}

export async function request<T>(
  method: string,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const auth = options.auth !== false;
  let res = await send(method, path, options);

  if (res.status === 401 && auth) {
    const refreshed = await session.refresh();
    if (refreshed) {
      res = await send(method, path, options);
    } else {
      session.onUnauthorized();
    }
  }

  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('POST', path, { ...options, body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PATCH', path, { ...options, body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PUT', path, { ...options, body }),
  del: <T>(path: string, options?: RequestOptions) => request<T>('DELETE', path, options),
  upload: <T>(path: string, form: FormData, options?: RequestOptions) =>
    request<T>('POST', path, { ...options, body: form }),
};
