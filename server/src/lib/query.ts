/**
 * Shared list-endpoint helpers (plants today; posts and the admin tables later).
 * Every list route must clamp paging and escape user text before it reaches a RegExp.
 */

/**
 * Escape every RegExp metacharacter so user input is matched literally.
 * Without this, a search for "a+b(" either throws or matches the whole collection.
 *
 * Control characters are stripped first: a NUL byte reaches `new RegExp` as "embedded null byte"
 * (an unhandled throw -> 500) and no legitimate search term or region name contains one.
 */
export function escapeRegExp(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const DEFAULT_PAGE_SIZE = 12;
export const MAX_PAGE_SIZE = 50;

export type PageInput = { page?: number; pageSize?: number };

export type PageWindow = { skip: number; limit: number; page: number; pageSize: number };

/** Clamp page/pageSize into a safe window. A negative or zero page falls back to page 1. */
export function pagination(
  query: PageInput,
  opts: { defaultSize?: number; maxSize?: number } = {},
): PageWindow {
  const defaultSize = opts.defaultSize ?? DEFAULT_PAGE_SIZE;
  const maxSize = opts.maxSize ?? MAX_PAGE_SIZE;

  const page = Math.max(1, Math.trunc(query.page ?? 1) || 1);
  const requested = Math.trunc(query.pageSize ?? defaultSize) || defaultSize;
  const pageSize = Math.min(Math.max(requested, 1), maxSize);

  return { skip: (page - 1) * pageSize, limit: pageSize, page, pageSize };
}

/** Shape the client's `Paginated<T>` interface expects. `totalPages` is never below 1. */
export function paginated<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
): { items: T[]; page: number; pageSize: number; total: number; totalPages: number } {
  return {
    items,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/**
 * Case-insensitive OR-regex across `fields`. An empty/whitespace term yields `{}` so the
 * caller can spread it without adding a matcher that would exclude every document.
 */
export function searchFilter(q: string | undefined, fields: string[]): Record<string, unknown> {
  const term = q?.trim();
  if (!term) return {};
  const pattern = escapeRegExp(term);
  return { $or: fields.map((field) => ({ [field]: { $regex: pattern, $options: 'i' } })) };
}
