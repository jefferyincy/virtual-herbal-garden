# Shared agent context - Virtual Herbal Garden

Read this file fully before writing code. It is the contract every workstream shares.
Repo root: `/home/jeffery/Documents/project/fsd`

## Product

A dark-mode botanical study app: walk a 3D herb garden, read cited plant monographs, take
quizzes, review with spaced repetition, share remedies, and administer content.
The spec lives in `docs/build-pack.md` (four documents in one file: kickoff, build spec,
design system, screen prompts) and `docs/DESIGN.md`. Read the relevant section for your task.

## Stack (fixed - do not substitute, do not add dependencies)

client: Vite, React 18, TypeScript, React Router v6, TailwindCSS, TanStack Query, Zustand,
react-hook-form, zod, framer-motion, `@react-three/fiber` + `@react-three/drei` (garden routes
only, lazy). server: Express 4, Mongoose 8, JWT, bcrypt, zod, multer. db: MongoDB.
All of these are already installed. There is no `@hookform/resolvers`, no test framework
beyond `node:test`, no UI kit, no CSS-in-JS, no extra date library.

Runtimes: server runs through `tsx` (Node 26 executes TypeScript; relative imports use explicit
`.ts` extensions - follow `server/src/app.ts`). Client is bundled by Vite.

## Design rules (DESIGN.md - follow exactly, do not approximate)

- Dark mode only. NEVER pure black, NEVER pure white. No emoji anywhere, in code or UI copy.
- No gradients on buttons. Glassmorphism ONLY on floating HUD panels. No decorative looping
  animation (the sole exception is the growing-state pulse, `animate-grow-pulse`).
- Body text never centred and never below 13px. Line length capped at 68ch (`reading-measure`).
- Max two type sizes per card. Minimum tap target 44x44. Colour is NEVER the only signal -
  pair it with an icon or a label.
- Italicise EVERY botanical name using the `botanical` class (`font-serif italic`).
- ALL numeric and taxonomic data uses `mono-label` (font-mono, 11px, uppercase, tracked) or
  `font-mono`.
- Motion: fast 120ms, base 180ms, slow 320ms, easing `ease-base`. Hover = `translateY(-1px)` +
  brighter border. Press = `scale(0.985)`. `prefers-reduced-motion` is handled globally; do not
  add loops. Visible focus ring on every interactive element.
- Elevation: L0 = `bg-bg-surface border border-line-subtle`; L1 = L0 + `shadow-l1` +
  `top-highlight`; L2 = `bg-bg-raised border border-line-strong shadow-l2`; L3 = L2 + overlay
  `rgba(5,8,6,0.72)` with 8px backdrop blur; L4 = `border-accent-600 shadow-l4`.
- Charts: single-hue green ramp ONLY `#1F4A33 -> #2F7A4E -> #4FD18B -> #7BE0A8 -> #B4F0CE`;
  grid `rgba(255,255,255,0.05)`; axis labels `text-fg-muted` 11px mono; no rainbow, no 3D
  charts, no chartjunk; legends are pill chips.
- Text over imagery always sits on a scrim.

## Tailwind tokens (client/tailwind.config.js - use these names, never hex literals in classes)

- `bg-bg-base`, `bg-bg-sunken`, `bg-bg-surface`, `bg-bg-raised`, `bg-bg-hover`
- `border-line-subtle`, `border-line-strong`
- `text-fg`, `text-fg-secondary`, `text-fg-muted`, `text-fg-disabled`, `text-fg-onAccent`
- `bg-accent-500`, `hover:bg-accent-400`, `bg-accent-600`, `bg-accent-tint`, `text-accent-400`,
  `ring-accent-glow`
- `text-clay-400`, `bg-clay-tint`, `text-warning`, `text-danger`, `bg-danger-tint`
- `shadow-l1`, `shadow-l2`, `shadow-l4`
- type: `text-micro`, `text-small`, `text-body`, `text-body-lg`, `text-h3`, `text-h2`, `text-h1`,
  `text-display`; radius: `rounded-micro`, `rounded-input`, `rounded-btn`, `rounded-card`,
  `rounded-panel`, `rounded-full`
- layout: `w-sidebar` (248px), `h-topnav` (64px), `max-w-content` (1200px), `max-w-reading` (68ch)
- animation: `animate-grow-pulse`, `animate-shimmer`
- global CSS classes in `client/src/index.css`: `grain` (needs a `relative` parent), `dot-grid`,
  `top-highlight`, `accent-halo`, `mono-label`, `botanical`, `reading-measure`
- Inline `style` is allowed ONLY for dynamic percentages/widths and the documented ramp hexes.

## Existing client modules - import them, NEVER re-implement

```ts
import { cn } from '@/lib/cn';                       // cn(...parts)
import { Icon, type IconName } from '@/components/icons';   // <Icon name="leaf" size={20} />
import { api, ApiError } from '@/lib/api';           // the ONLY network entry point
import { queryKeys, queryClient } from '@/lib/query';
import { formatDate, formatRelative, formatNumber, formatInterval, formatClock, titleCase } from '@/lib/format';
import { useSession } from '@/stores/session';       // {user, accessToken, status: 'loading'|'authenticated'|'anonymous', login, register, refresh, logout, setUser, hydrateMe}
import { PageHeader, Section } from '@/components/layout/PageHeader';
import type { /* contract types */ } from '@/types/api';
```
`Icon` names available (pick the closest; do NOT edit icons.tsx): leaf, search, menu, close, check,
chevron-down, chevron-left, chevron-right, chevron-up, plus, minus, book, book-open, award, flame,
users, message, arrow-up, arrow-right, arrow-left, bookmark, settings, filter, shield,
alert-triangle, info, grid, sun, moon, rain, mist, volume, camera, upload, mic, paperclip, send,
star, home, chart, trophy, bell, user, logout, eye, eye-off, lock, mail, sparkles, compass, map,
globe, layers, list, trash, pencil, copy, grip, more, external-link, refresh, download, share,
check-circle, alert-circle, x-circle, hexagon, play, clock, calendar, dots, spinner, dot.

`api` usage: `api.get<T>(path, {query, signal})`, `api.post<T>(path, body, opts)`,
`api.patch`, `api.del`, `api.upload<T>(path, formData)`. Paths are relative to `/api`
(e.g. `api.get('/plants', {query: {page: 1}})`). `ApiError` exposes `.status`, `.code`,
`.details`. A 401 triggers exactly one refresh retry internally - never handle it yourself.
NEVER call `fetch` directly. NEVER put `fetch` in a component.

## Design-system primitives (exist on disk - import, NEVER create or re-implement)

```ts
Button    // {variant?: 'primary'|'secondary'|'ghost'|'danger'; size?: 'sm'|'md'; loading?; iconLeft?: IconName; iconRight?: IconName; fullWidth?} & ButtonHTMLAttributes
Input     // {label?; error?: string|null; hint?; icon?: IconName; containerClassName?} & InputHTMLAttributes
Textarea  // same + {rows?, counter?: {value: number; max: number}}
Checkbox  // {label: ReactNode; hint?; error?} & InputHTMLAttributes
Select    // {label?; error?; hint?; options: Array<{value; label}>; placeholder?} & SelectHTMLAttributes
Chip      // {tone?: 'accent'|'clay'|'neutral'|'warning'|'danger'; size?: 'sm'|'md'; className?}
FilterChip // {active: boolean; onClick: () => void; children}   (same module as Chip)
Card      // {variant?: 'flat'|'raised'|'outlined'; interactive?; padding?: 'none'|'sm'|'md'|'lg'; as?; presentation?; className?}
Tabs      // {tabs: Array<{value; label; count?}>; value; onChange: (v: string) => void}
SegmentedControl // {options: Array<{value; label; icon?: IconName}>; value; onChange; size?: 'sm'|'md'}
RadioCard // {selected: boolean; onSelect: () => void; title: string; description?; icon?: IconName}
Modal     // {open; onClose; title; description?; children?; footer?; size?: 'sm'|'md'|'lg'}
Drawer    // {open; onClose; title; children?; footer?; side?: 'right'; width?: number}
Badge     // {tone?: 'neutral'|'accent'|'clay'|'warning'|'danger'; children}   (small pill)
StatCard  // {label; value: string|number; delta?: number; deltaDirection?: 'up'|'down'; sparkline?: number[]; tone?: 'default'|'accent'|'warning'; action?: {label; onClick}}
Avatar    // {name; src?; level?; size?; active?}; AvatarStack({people, max?, size?})
Tooltip   // {content; children; side?; delayMs?}
Dropdown  // {trigger: ReactNode; items: Array<{label; onSelect; icon?: IconName; danger?; disabled?}>; align?: 'start'|'end'}
Breadcrumb// {items: Array<{label: string; to?: string}>}
Pagination// {page; totalPages; onPageChange}
ProgressBar // {value; max?; tone?: 'accent'|'danger'|'warning'; size?: 'sm'|'md'; label?}
ConfidenceBar // {value (0..1); showValue?}
KeyboardHint  // {keys: string[]}
HexBadgeTile  // {name; icon; unlocked; size?; description?}; HexBadgeRow({badges, max?})
Toast     // AnalysisProvider, useToast()->{push, dismiss, toasts}, ToastViewport
LoadingScreen // {label?}; LoadingSpinner // {size?}
Skeleton  // {variant?: 'line'|'card'|'circle'; width?; height?; className?}; SkeletonRow, SkeletonTable({rows?, columns?}), SkeletonPlantGrid({count?, columns?})
EmptyState // {title; description?; action?: ReactNode; watermark?: IconName}
ErrorState // {title?; message?; onRetry?; retryLabel?; children?}
ErrorBanner // {message; onRetry?; onDismiss?}
OfflineBanner // no props
SafetyBanner  // {heading?; children?}  <-- MANDATORY on every plant view, never dismissible
Watermark // {name?: IconName; size?; className?}
Table, THead({children, columns?}), TBody, TR({children, className?, selected?}), TH({children, align?, mono?}), TD({children, className?, mono?, align?})
PlantCard({plant: Plant; interactive?; className?; footer?: ReactNode})   // links to /plants/:slug
PlantReferenceCard({plant, linkLabel?='View profile', compact?, className?})
ToxicityDot({toxicity: Toxicity; withLabel?=true})
```

## Server contracts you consume

Error envelope is ALWAYS `{error: {code, message, details?}}`. Codes in use: `bad_request`,
`unauthorized`, `forbidden`, `not_found`, `conflict`, `validation_error`, `rate_limited`,
`internal_error`. A 422 carries `details: Array<{path, message}>` for field errors.

Auth: access token in memory, refresh token in an httpOnly cookie. Endpoints under `/api/auth`:
`register`, `login`, `refresh`, `logout`, `forgot`, `reset`, `me`, `onboarding`
(`PATCH /api/auth/onboarding` with `{interests?, experience?, followedPlants?, name?}`).
`forgot` returns `202 {ok: true}` and, when `!isProd`, also `devToken`.

Paged envelope: `Paginated<T> = {items: T[]; page: number; pageSize: number; total: number; totalPages: number}`.

`client/src/types/api.ts` holds every shared type (Plant, Ailment, User, PublicUser, Lesson, Quiz,
QuizServed, Attempt, Progress, DueCard, GradeResult, SrsRating, Badge, Garden, GardenPlot, Post,
Comment, NotificationRow, AdminStats, IdentifyMatch, IdentifyResponse, AssistantMessage,
AssistantCitation, Paginated, PlantFilters, LeaderboardRow, SourceRef, PlantImage, LookAlike).
Read it before typing anything. If a field you need is missing, extend that file only if your
ticket allows it; otherwise work with what exists and say so in your summary.

## Hard rules

- TypeScript strict, `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess` are all ON.
  Index access yields `T | undefined` - guard array reads.
- Use `import type` for type-only imports (project rule; no inline `import("...")` annotations).
- No `any`, no `@ts-ignore`, no `as unknown as` escape hatches.
- No one-line wrapper functions whose whole body is a single expression.
- Comment only non-obvious invariants (security lines, ordering requirements, idempotency guards,
  timing/a11y behaviour, why a derived metric is derived). NEVER comment to restate code.
- Every screen implements loading, empty and error states explicitly. This is a build-spec
  requirement, not a nicety.
- Internal navigation uses `Link`/`useNavative`/`useNavigate` from react-router-dom; never
  `<a href="/...">` for an internal route.
- Do NOT run builds, typecheck, tests, lint, formatters, or dev servers. Edit files only. The
  orchestrator runs all gates centrally after you finish. Do not create throwaway scripts inside
  the repo; if you must probe something, use /tmp and delete it.
- Only create or edit the files listed in your ticket's Target. Other agents are editing sibling
  files concurrently.
- Do NOT wire routers into `server/src/app.ts` or `server/src/routes/index.ts`, and do NOT edit
  `client/src/app/routes.tsx` or `client/src/App.tsx` - the orchestrator performs all
  integration wiring centrally.

## Screen prompts

`docs/build-pack.md` section 4 contains the 33 screen prompts, each describing a screen's exact
layout and content. Your ticket names which apply. Follow the prompt's content literally (labels,
counts, mono labels, states) while implementing with the design tokens above and NEVER copying
markup from the Stitch export. Mockup PNGs are at `client/public/reference/*.png` (visual target
only) and the original HTML export is at `reference/stitch_interactive_3d_herb_garden/`.
