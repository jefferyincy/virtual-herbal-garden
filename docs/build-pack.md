# Virtual Herbal Garden — complete build pack

Four documents in one file. For a coding agent, feed the whole thing; it is self-contained.

| § | Document | What it is |
|---|---|---|
| 1 | OMP kickoff prompt | the instruction set for the build agent |
| 2 | Build spec | Tailwind theme, data model, API surface, routes, formulas |
| 3 | Design system | tokens, components, motion, accessibility rules |
| 4 | Screen prompts | all 33 Stitch screen prompts (mockup reference) |

---

# §1 — OMP kickoff prompt

You are the build agent for this project. Mockups already exist (HTML/CSS export from Google
Stitch). Your job is to implement the real application and wire it end to end.

## Step 0 — Recon before any code

Do this first and report back:

1. `ls -la`, read `package.json` (if present), `git log --oneline -10`, `git status`.
2. Locate the Stitch export and any assets (models, images). State the paths you found.
3. Locate `DESIGN.md` and the screen-prompt files. Read `DESIGN.md` fully.
4. Report: what already exists, what is missing, and whether this is a fresh scaffold.

Do not delete, move, or restructure anything you did not create. If something looks wrong,
say so and ask.

## Step 1 — Stack (fixed; do not substitute)

```
client  Vite + React 18 + TypeScript, React Router v6, TailwindCSS, TanStack Query,
        Zustand, react-hook-form + zod, framer-motion,
        @react-three/fiber + @react-three/drei (garden routes only, lazy-loaded)
server  Node + Express, Mongoose, JWT (access + refresh), bcrypt, zod, multer (or cloudinary)
db      MongoDB
```

Ask before adding any dependency outside this list.

## Step 2 — Source of truth

- `DESIGN.md` — visual tokens. The Tailwind theme block in `build-spec.md` §3 is the verbatim
  mapping; use it as written.
- `virtual-herbal-garden-screen-prompts.md` — the canonical screen list. One React component
  per screen, named after the screen.
- The Stitch export — **visual reference only**. Never copy its HTML/CSS/markup into the app.
  Re-implement each screen with the design tokens and Tailwind. The mockup is the target look;
  it is not the source code.
- `build-spec.md` — data model, API surface, route table, phase gates. Follow it.

## Step 3 — Wiring rules

- All network access goes through one API client module and TanStack Query hooks. No `fetch`
  inside a component.
- Auth: access token in memory, refresh token in an httpOnly cookie. A 401 triggers exactly one
  refresh retry, then logout. Protected and role-gated routes enforced on both client and server.
- The 3D garden routes are lazy-loaded behind a Suspense boundary. GLB models load on demand,
  never all at once. Cap DPR at 1.5.
- Every screen implements loading, empty, and error states per the "Shared states kit" prompts.
- The toxicity/safety banner on every plant view is mandatory and never dismissible.
- Server validates every request body with zod. Never trust client input.

## Step 4 — Build order, with a gate after each phase

```
P0  scaffold, Tailwind theme, layout shell, nav, error boundaries
P1  auth: register / login / refresh / logout / reset, protected routes
P2  plants: model + seed 20 plants + CRUD API + encyclopedia + detail
P3  garden: 3D scene, clickable plants, placement mode, my gardens
P4  learn: lessons, quizzes, attempts, SRS flashcards, progress, XP
P5  social: posts, comments, upvotes, moderation queue
P6  admin: plant CMS, moderation, users, quizzes, badges
P7  one smart feature — ask me which one first (photo identify OR RAG assistant)
```

After every phase, before reporting:

1. `npm run build` must pass on both client and server with zero errors.
2. The seed script must run clean against a fresh database.
3. Smoke-test the routes you built (curl for API, a browser pass for UI). Report what you
   actually ran and what it returned.
4. Write a short gate report: what is done, what is stubbed, what is broken, file:line for
   anything non-obvious.

Do not start the next phase until the current one has a green build. If a gate fails, fix it or
report the blocker — never report a phase complete without a passing build.

## Step 5 — Data honesty

- Seed plants must use real species with real medicinal data from citable sources. Put the
  source in each record.
- Do not invent dosage numbers, toxicity claims, or citations. If a field is unknown, set it
  null and mark it in the record as `unverified: true`.
- Mark any plant with known toxicity clearly.

## Step 6 — Rules

- Never commit secrets. Ship a `.env.example` and read from `process.env`.
- No emoji anywhere in the UI.
- Ask when a requirement is ambiguous. Do not invent features that are not in the screen list.
- No Docker, no Kubernetes, no CI pipeline in this pass.
- Do not write tests for every component. Do write tests for the SRS scheduler, the XP rules,
  and the auth refresh flow — those three have real logic worth locking down.
- Keep commits small and scoped to one phase.

## Your first reply

Answer with exactly three things, then stop and wait:

1. What you found in recon — real file paths.
2. The P0 plan as a concrete todo list.
3. Any blocking questions.

---

# §2 — Build spec

Derived from `DESIGN.md`. Tokens here are the verbatim source of truth for the codebase.

## 1. Tailwind theme block

```js
// tailwind.config.js
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: { base: '#0A0D0B', sunken: '#070A08', surface: '#121713', raised: '#171E19', hover: '#1D251F' },
        line: { subtle: 'rgba(255,255,255,0.06)', strong: 'rgba(255,255,255,0.11)' },
        fg: { DEFAULT: '#E6EDE8', secondary: '#9BACA0', muted: '#6A7A6F', disabled: '#47524A', onAccent: '#06110B' },
        accent: {
          400: '#7BE0A8', 500: '#4FD18B', 600: '#35A96D',
          tint: 'rgba(79,209,139,0.12)', glow: 'rgba(79,209,139,0.28)',
        },
        clay: { 400: '#E39A72', 500: '#D9845F', tint: 'rgba(217,132,95,0.12)' },
        warning: '#E0A458',
        danger: { DEFAULT: '#D9645C', tint: 'rgba(217,100,92,0.12)' },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui'],
        serif: ['"Instrument Serif"', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        micro: ['11px', { lineHeight: '1.4', letterSpacing: '0.08em', fontWeight: '500' }],
        small: ['13px', { lineHeight: '1.5' }],
        body: ['15px', { lineHeight: '1.6' }],
        'body-lg': ['17px', { lineHeight: '1.65' }],
        h3: ['20px', { lineHeight: '1.3', letterSpacing: '-0.005em' }],
        h2: ['28px', { lineHeight: '1.2', letterSpacing: '-0.01em' }],
        h1: ['40px', { lineHeight: '1.15', letterSpacing: '-0.015em' }],
        display: ['56px', { lineHeight: '1.05', letterSpacing: '-0.02em' }],
      },
      borderRadius: { micro: '4px', input: '8px', btn: '10px', card: '16px', panel: '20px' },
      boxShadow: {
        l1: 'inset 0 1px 0 0 rgba(255,255,255,0.08)',
        l2: '0 12px 32px rgba(0,0,0,0.45)',
        l4: '0 8px 32px rgba(79,209,139,0.28)',
      },
      transitionTimingFunction: { base: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      maxWidth: { reading: '68ch' },
    },
  },
  plugins: [],
}
```

Fonts: Inter + JetBrains Mono from `@fontsource`; Instrument Serif from Google Fonts (it has no
variable axis — load 400 italic only).

## 2. Shared primitives (build in P0)

```
components/ui/Button.tsx        variant: primary | secondary | ghost | danger   size: sm | md
components/ui/Input.tsx         label, error, hint, icon
components/ui/Chip.tsx          accent | clay | neutral
components/ui/Card.tsx          flat | raised | interactive
components/ui/Tabs.tsx          underline style
components/ui/SegmentedControl.tsx
components/ui/Modal.tsx         portal + focus trap + escape
components/ui/Drawer.tsx        right side, mobile becomes bottom sheet
components/ui/Toast.tsx         success | info | warning | danger, 4s auto-dismiss
components/ui/Skeleton.tsx      card | row | table variants
components/ui/EmptyState.tsx    watermark + h3 + line + action
components/ui/ErrorState.tsx    message + retry
components/ui/SafetyBanner.tsx  REQUIRED on every plant view
components/ui/Badge hex tile, StatCard, Avatar, Tooltip, Dropdown, Breadcrumb,
              Pagination, ProgressBar, ConfidenceBar, KeyboardHint
components/layout/AppShell.tsx  sidebar 248px + top nav h64 + content max 1200
components/layout/PageHeader.tsx
components/plant/PlantCard.tsx, PlantReferenceCard.tsx, ToxicityDot.tsx
```

CSS additions in `index.css`: grain noise overlay (2.5%), dot-grid background texture (3%),
`.top-highlight` gradient line, `prefers-reduced-motion` guard.

## 3. Mongoose collections

```js
users      { name, email(unique,lower), passwordHash, role: student|expert|admin,
             xp, level, streak{current,longest,lastActiveAt}, badges:[{key,earnedAt}],
             followedPlants:[ObjectId], interests:[String], experience: beginner|intermediate|advanced }
plants     { slug(unique), commonName, botanicalName, family, partsUsed:[enum],
             preparations:[enum], ailments:[ObjectId], activeCompounds:[String],
             description, medicinalUses, dosage, contraindications, toxicity: none|low|high,
             lookAlikes:[{plantId,note}], region:[String], systemsMentioned:[ayurveda|siddha|unani|western],
             images:[{url,alt,credit}], modelUrl, modelScale, tags:[String],
             sources:[{label,url}], verified:Boolean, publishedAt }
lessons    { plantId, slug, title, body(md), order, estMinutes }
quizzes    { family, title, difficulty, plantIds:[], timeLimitSec, questions:[{
             stem, options:[String], answerIndex, explanation, plantId }], published }
attempts   { userId, quizId, score, total, answers:[{questionId, chosenIndex, correct}],
             secondsTaken, xpAwarded, createdAt }
progress   { userId, plantId, read:Boolean, mastery:0..5, srs:{
             ease, intervalDays, dueAt, reps, lapses } }   // SM-2, unique on (userId,plantId)
gardens    { userId, name, slug, isPublic, plots:[{ x, z, plantId, plantedAt, stage }] }
posts      { userId, type: remedy|question|note, title, body, plantIds:[], sources:[String],
             status: pending|approved|rejected, reviewerId, reviewerNote, upvotes:[userId] }
comments   { postId, userId, body, upvotes:[], markedUseful:Boolean }
badges     { key(unique), name, description, criteria:{action,target,param}, xpReward, icon }
bookmarks  { userId, plantId, note }
```

Indexes: `plants.slug` unique, `plants` text index on commonName + botanicalName + tags,
`progress` compound unique (userId, plantId) + index on (userId, srs.dueAt),
`posts` index on (status, createdAt).

## 4. API surface

```
POST   /api/auth/register            POST /api/auth/login      POST /api/auth/refresh
POST   /api/auth/logout              POST /api/auth/forgot     POST /api/auth/reset
GET    /api/auth/me

GET    /api/plants                   ?q,family,part,ailment,region,system,toxic,page,sort
GET    /api/plants/:slug
GET    /api/plants/compare?ids=a,b[,c]
GET    /api/ailments                 GET  /api/ailments/:id/plants
GET    /api/regions/:region/plants
POST   /api/plants  PATCH /api/plants/:id  DELETE /api/plants/:id        [admin]

GET    /api/lessons/:slug            POST /api/lessons/:id/complete
GET    /api/quizzes                  GET  /api/quizzes/:id
POST   /api/quizzes/:id/attempt      GET  /api/quizzes/:id/attempts
GET    /api/flashcards/due?limit=20  POST /api/flashcards/:plantId/grade  {rating}
GET    /api/progress                 GET  /api/progress/me
GET    /api/leaderboard?window=week|all
GET    /api/badges  POST /api/badges  PATCH /api/badges/:id              [admin]

GET    /api/gardens  POST /api/gardens  GET /api/gardens/:id
PATCH  /api/gardens/:id              POST /api/gardens/:id/plots
DELETE /api/gardens/:id/plots/:plotId
GET    /api/g/:slug                                                       [public, no auth]

GET    /api/posts ?type,status,plantId,page
POST   /api/posts  GET /api/posts/:id  POST /api/posts/:id/upvote
POST   /api/posts/:id/comments       POST /api/comments/:id/upvote
PATCH  /api/posts/:id/moderate        {action,note}                       [moderator]

GET    /api/admin/stats              GET /api/admin/users
PATCH  /api/admin/users/:id/role     POST /api/admin/users/:id/ban
POST   /api/identify   (multipart)                                        [P6, optional]
POST   /api/assistant  {messages}                                         [P6, optional]
```

## 5. Client route table

```
/                       /about          /login  /register  /reset  /onboarding
/garden                 /garden/place   /garden/settings  /gardens
/g/:slug                /plants         /plants/:slug     /plants/compare
/ailments                /map
/learn                  /learn/lesson/:slug  /quizzes  /quizzes/:id  /quizzes/:id/result
/flashcards             /progress       /certificate/:id
/community              /community/new  /community/:id    /u/:handle  /leaderboard
/notifications          /identify       /assistant
/admin                  /admin/plants   /admin/plants/new  /admin/plants/:id/edit
/admin/moderation        /admin/users    /admin/quizzes    /admin/badges
*   (404)
```

Route generation order follows the screen list in `virtual-herbal-garden-screen-prompts.md`.

## 6. Domain logic that needs real tests

```
server/services/srs.js     SM-2: ease floor 1.3, first correct interval 1d, second 6d,
                           then interval * ease; lapse resets reps and multiplies ease by 0.8.
                           Test: new card, correct streak, lapse, ease floor, due-date rollover.
server/services/xp.js      read plant +5, lesson complete +20, quiz pass +1 per correct,
                           first-time bonus +10, badge award adds badge.xpReward.
                           Level curve: level = floor(sqrt(xp / 100)) + 1.
                           Test: thresholds, no double-award, badge trigger boundaries.
server/routes/auth.js      refresh rotation, reuse detection, 401 path.
```

## 7. Env

```
PORT=4000
MONGO_URI=mongodb://127.0.0.1:27017/herbal_garden
JWT_ACCESS_SECRET=          JWT_REFRESH_SECRET=
ACCESS_TTL=15m              REFRESH_TTL=7d
CLIENT_ORIGIN=http://localhost:5173
CORS + cookie: httpOnly, sameSite=lax, secure in prod
```

---

# §3 — Design system

## Theme
Dark mode only. Minimal, modern, botanical. A field guide at night: near-black green surfaces, one living green accent, generous negative space, and small precise details that reward close looking. Restrained — never neon, never glassy everywhere, never busy.

## Colour

```
Background
  bg-base        #0A0D0B   app background (never pure black)
  bg-sunken      #070A08   behind canvas / wells
  bg-surface     #121713   cards, panels
  bg-raised      #171E19   popovers, dropdowns, modals
  bg-hover       #1D251F   row + card hover
  border-subtle  rgba(255,255,255,0.06)
  border-strong  rgba(255,255,255,0.11)

Text
  text-primary   #E6EDE8
  text-secondary #9BACA0
  text-muted     #6A7A6F
  text-disabled  #47524A
  text-on-accent #06110B

Accent — Living Green (primary, single brand colour)
  accent-400     #7BE0A8   highlights, glow, active chart line
  accent-500     #4FD18B   primary buttons, active states, progress
  accent-600     #35A96D   pressed, borders on accent elements
  accent-tint     rgba(79,209,139,0.12)   chip + badge fills
  accent-glow     rgba(79,209,139,0.28)   halos, focus rings

Warm accent — Terracotta (secondary, used sparingly: botanical names,
spec labels, curated accents, and the safety system)
  clay-400       #E39A72
  clay-500       #D9845F
  clay-tint      rgba(217,132,95,0.12)

Semantic
  warning        #E0A458
  danger         #D9645C
  danger-tint    rgba(217,100,92,0.12)
  success        #4FD18B   (= accent-500)
```

Rules: one accent colour per screen besides semantic states. Accent covers at most 10% of any screen. Text never sits on `accent-500` at full area — buttons only. Never `#000000`, never `#FFFFFF`.

## Typography

```
UI + body      Inter (fallback Geist, SF Pro Text)
Botanical      Instrument Serif Italic — all Latin binomials, always italic
               e.g. *Ocimum tenuiflorum*
Data / labels  JetBrains Mono — taxonomy chips, IDs, dosage numbers, timers
```

```
display   56px / 1.05 / 600 / -0.02em    hero headline only
h1        40px / 1.15 / 600 / -0.015em   page titles
h2        28px / 1.20 / 600 / -0.01em    section titles
h3        20px / 1.30 / 600 / -0.005em   card titles
body-lg   17px / 1.65 / 400
body      15px / 1.60 / 400
small     13px / 1.50 / 400              captions, helper text
micro     11px / 1.40 / 500 / +0.08em / UPPERCASE   mono labels: "LAMIACEAE"
```

Max two type sizes per card. Body text never centred and never below 13px. Line length capped at 68ch for reading views.

## Spacing & Layout
4px base, 8px grid: `4 8 12 16 24 32 48 64 96`.
Web desktop, 1440px frame, 12-column grid, 24px gutters, 1200px max content width.
Sidebar 248px. Page padding 32px. Card padding 20px / 24px. Section spacing 64px.
Breathe: generous whitespace is the primary design element — do not fill empty space.

## Radius
```
4px    micro chips, tags
8px    inputs, selects, small buttons
10px   buttons, nav items
16px   cards, panels
20px   modals, floating HUD panels
999px  pills, avatars, status dots
```

## Elevation (dark mode lifts with light + border, not shadow)
```
L0  flat: surface + 1px border-subtle
L1  card: surface + border-subtle + inner top highlight 1px rgba(255,255,255,0.08)
L2  raised: bg-raised + border-strong + 0 12px 32px rgba(0,0,0,0.45)
L3  modal: L2 + overlay rgba(5,8,6,0.72) with 8px backdrop blur
L4  accent glow: 1px accent-600 border + 0 8px 32px accent-glow  (selected / focused only)
```

## Signature details (the attractive part — apply subtly, never all at once)
- Fine grain noise overlay at 2.5% opacity across dark backgrounds
- 1px top highlight line on cards: `linear-gradient(90deg, transparent, rgba(255,255,255,0.09), transparent)`
- Soft radial accent glow behind the hero and behind the currently selected plant
- Faint botanical line-art watermarks at 5% opacity in empty states and side panels
- Hairline contour-line or dot-grid pattern as page background texture, 3% opacity
- Mono uppercase micro-labels as small deliberate accents on data ("PARTS USED · LEAF")
- Thin 2px accent progress bars with a 40% opacity trailing glow
- Status dots with a soft pulse (1.6s) for live/growing state

## Motion
```
fast    120ms   hover, colour
base    180ms   transforms, panels
slow    320ms   drawers, page transitions
easing  cubic-bezier(0.22, 1, 0.36, 1)
hover   translateY(-1px) + border brightens
press   scale(0.985)
focus-visible  2px accent ring at 40% opacity, 2px offset — always visible
```
Subtle and physical. No bouncing, no spinning loaders wider than 20px, no motion that loops forever except the growing-state pulse. Honour `prefers-reduced-motion`.

## Components

```
Primary button     accent-500 fill, text-on-accent, 10px radius, h44, 600 weight,
                   hover accent-400, press accent-600
Secondary button   transparent, 1px border-strong, text-primary, same size
Ghost button       text-secondary, hover bg-hover
Danger button      danger-tint fill + danger border + danger text (never solid red)
Input              bg-surface, 1px border-subtle, 8px radius, h44, placeholder text-muted,
                   focus border accent-600 + 3px accent-tint ring
Select / combobox  same as input, chevron line icon
Chip / tag         accent-tint bg, accent-400 text, 999px radius, 11px mono uppercase
Filter chip        unticked: border-subtle + text-secondary. Ticked: accent-tint + accent text
Card               16px radius, L1, image top with 16px top radius, title h3, 2-line clamp
Stat card          micro mono label, 28px 600 value, delta in small with arrow icon
Tabs               underline 2px accent-500 on active, text-secondary inactive, no boxes
Top nav            h64, bg-base at 80% + 12px blur, logo left, links centre, actions right
HUD panel          bg-raised at 85% + 16px blur, 20px radius, L2 — the ONLY glass surface
Modal              L3, 20px radius, max-width 560px, close icon top-right, primary right
Table              no zebra; hairline row dividers; header micro mono uppercase text-muted
Toast              bottom-right, bg-raised, 1px accent left bar for success, auto-dismiss 4s
Skeleton           surface blocks at 6% white, slow 1.4s shimmer, match real layout exactly
Empty state        centred line-art watermark, h3, one line of text-secondary, one action
Tooltip            12px, bg-raised, border-strong, appears after 200ms
Badge tile         hexagonal, unlocked = accent gradient edge + accent glow;
                   locked = bg-surface + 30% opacity content
Avatar             circle, 1px border-strong, level ring in accent for active users
```

Safety banner (required on every plant view): full-width, `danger-tint` background, 3px solid `danger` left bar, warning triangle line icon, `danger` heading, `text-secondary` body. Never a toast, never dismissible.

## Iconography
Single line-icon set, 1.5px stroke, 20px default / 24px in nav. Rounded caps and joins. No filled icons except active nav state. No emoji anywhere in the UI.

## Data visualisation
Single-hue green ramp for series: `#1F4A33 → #2F7A4E → #4FD18B → #7BE0A8 → #B4F0CE`.
Grid lines `rgba(255,255,255,0.05)`, axis labels `text-muted` 11px mono. No rainbow palettes, no 3D charts, no chartjunk. Legends are pill chips. One highlighted series in accent-400, all others in text-muted.

## Imagery
Plant photography on dark or cut-out, with a soft green rim light. 3D garden scenes lit with a warm key light plus a green rim to match the palette. Illustrations are botanical line art in single-weight stroke on transparent. Never place bright, saturated photos on flat dark without a blur or gradient scrim behind text.

## Accessibility
Contrast: body text ≥ 7:1 on bg-base, secondary text ≥ 4.5:1, never below 4.5:1. Never rely on colour alone — pair with icon or label. Minimum tap target 44×44. Every interactive element has a visible focus ring. Text over imagery always sits on a scrim.

## Rules
Do: keep surfaces flat and layered with borders · use one accent · let whitespace carry the layout · italicise every botanical name · reserve glass for floating HUD panels · use mono for all numeric and taxonomic data.

Don't: pure black or pure white · gradients on buttons · neon or high-saturation greens · glassmorphism on standard cards · drop shadows on text · more than two type sizes per card · emoji · decorative animation that loops · centred body paragraphs · colour as the only signal.

## Prompt prefix (paste before every screen prompt)
```
Dark mode web app, minimal modern botanical design system. Background #0A0D0B, cards #121713
with 1px hairline borders and a subtle 1px top highlight, primary accent living green #4FD18B
used sparingly, warm terracotta #D9845F as a secondary accent, text #E6EDE8 / #9BACA0.
Inter for UI, Instrument Serif Italic for botanical names, JetBrains Mono for small uppercase
data labels. 16px radius cards, 10px buttons, 8px grid, generous whitespace, flat surfaces,
line icons at 1.5px stroke, no emoji, no gradients on buttons, no glassmorphism except floating
overlay panels, no pure black. Desktop 1440px, 12-column grid, 248px sidebar where applicable.
```

---

# §4 — Screen prompts (33 screens)

Prefix each of these with the prompt-prefix block from DESIGN.md (`Dark mode web app, minimal modern botanical design system…`). Desktop 1440 unless noted.

## Auth & onboarding

```
A web app screen: login page. Split layout — left 45% is a full-height dark panel with a
large botanical line-art illustration of herbs and the wordmark "Virtual Herbal Garden" plus
a single line of text "Walk through a garden. Learn every plant."; right 55% is centred on
bg-base with a max-420px column: h1 "Welcome back", one line of text-secondary, an email
input, a password input with a show/hide icon, a row with a "Remember me" checkbox on the
left and a "Forgot password?" link on the right, a full-width primary "Sign in" button, a
hairline divider with "or", a secondary "Continue with Google" button with the Google glyph,
and a footer line "New here? Create an account". Small accent glow behind the illustration.
```

```
A web app screen: registration page. Same split layout as login, mirrored — illustration
panel on the right this time. Left column: h1 "Create your garden", a name input, email
input, password input with a live strength meter (four thin segments filling in accent green
with a mono label reading "STRONG"), a terms checkbox, a full-width primary "Create account"
button, and a footer "Already have an account? Sign in". Under the password field, three mono
micro-labels showing requirements with small check icons — 8+ characters, one number, one
symbol.
```

```
A web app screen: password reset. Single centred card, max-width 440px, on bg-base with a
faint dot-grid texture. Two states shown side by side on the canvas: state one asks for an
email with an h2 "Reset your password", one line of helper text, an email input and a
primary "Send reset link" button; state two shows a success state with a centred accent-green
envelope icon in a circular accent-tint badge, h2 "Check your inbox", a line naming the email
address in text-primary, a "Resend in 0:42" mono countdown chip, and a ghost "Back to sign in"
link.
```

```
A web app screen: a 3-step onboarding flow, three separate frames on one canvas. Step 1
"Your herbal practice" — h2 plus a grid of six selectable cards with line icons and labels:
Ayurveda, Siddha, Unani, Western herbalism, Home remedies, Just curious; selected cards get an
accent border and accent glow. Step 2 "Your experience level" — three stacked wide radio cards:
Beginner "I'm new to medicinal plants", Intermediate "I know the common ones", Advanced
"I read the pharmacopoeias"; the selected card shows an accent left bar. Step 3 "Pick plants to
follow" — a search field over a scrollable grid of 12 plant cards each with a thumbnail and a
checkbox in the corner, with a sticky bottom bar reading "4 selected" and a primary button
"Enter the garden"; a thin 3-segment progress bar sits at the top with step labels.
```

## Public pages

```
A web app screen: "How it works" page. Centred max-900px column on bg-base. h1 "How it works".
Below it a horizontal 4-step diagram connected by a thin dashed accent line, each step a small
numbered circle, a line icon, a short h3 and two lines of text: Explore "Walk the 3D garden",
Inspect "Click any plant", Learn "Read cited monographs", Master "Quiz, review, badge up".
Then a section titled "Where the data comes from" listing three source cards (Ayurvedic
pharmacopoeia, WHO monographs, peer-reviewed ethnobotany) each with a small mono citation
label and a link icon. Bottom: a full-width L1 card with a safety statement in text-secondary
and a terracotta warning triangle icon, plus a primary "Start exploring" button.
```

```
A web app screen: 404 page for a botanical site. Centred composition on bg-base with a
botanical line-art watermark at low opacity behind. A large 404 in mono, h2 "This plant
doesn't grow here", one line of text-secondary, then a row of three thumbnails of popular
plants as "try instead" suggestions with names under them, and two buttons: primary "Back to
the garden", secondary "Search the encyclopedia". Also a small "Search plants" field above
the plant row.
```

## Garden core (remaining)

```
A web app screen: plant placement mode inside the 3D garden. Same dark low-poly garden
canvas, but with a placement overlay: a glowing accent-green square grid on the soil with one
tile highlighted under the cursor, a semi-transparent ghost model of the selected plant floating
on that tile, and a small floating glass chip above it reading "Tulsi · fits here" with an
accent check icon. A bottom-centre action bar with "Cancel" ghost and "Place plant" primary
buttons. Left: a narrow vertical palette of 6 plant thumbnails to choose from, the active one
with an accent border. Top-right: a live plant-count chip "12 / 24 plots used" and an
overlap-warning chip in warning amber reading "Too close to Mint".
```

```
A web app screen: garden settings panel. A modal-style panel, max-520px, bg-raised, 20px
radius, over a dimmed blurred garden scene. Section "Ambience" with a time-of-day slider
showing a small day/night arc with a sun and moon icon at the ends and "18:40" in mono; a
season segmented control (Spring / Summer / Monsoon / Winter) with Spring active; a weather
toggle row (Clear / Rain / Mist) as three icon chips. Section "Performance" with a quality
segmented control (Low / Medium / High), a shadows toggle, and a small mono readout "62 FPS ·
DPR 1.5". Section "Sound" with an ambient audio toggle and a volume slider. Footer: "Reset
defaults" ghost on the left, "Apply" primary on the right.
```

```
A web app screen: "My gardens" list page. Top nav plus a page header row: h1 "My gardens" with
a primary "New garden" button on the right. Below, a responsive grid of three garden cards —
each card has a landscape thumbnail render of that 3D garden, the garden name in h3, a mono
line "24 plants · visited 3 days ago", a small row of overlapping plant-avatar thumbnails, and
a "..." overflow icon. One card has a small accent chip "ACTIVE" in the corner. Bottom of the
page: a dashed-border ghost card with a plus icon and "Create a new garden". Empty-state
version of this page shown beside it: a botanical line-art watermark, h3 "No gardens yet",
one line of text-secondary, and a primary "Start your first garden" button.
```

```
A web app screen: public shared garden page, read-only. Same 3D garden canvas but with a slim
top banner instead of the full nav: a small avatar, "Prajol's herb garden" in h3, a mono line
"Public · 38 plants", and on the right an outlined "Make your own" button. HUD is stripped:
only a plant-count chip top-right and a bottom bar of three read-only plant cards. Clicking a
plant shows a compact glass info card with the plant name, italic botanical name and a "View
full profile" link, but no "Plant this" button. A subtle accent glow marks plants with a
curated-note star icon.
```

## Encyclopedia (remaining)

```
A web app screen: plant comparison page. Two sticky column headers at the top, each a plant
card with thumbnail, common name and italic botanical name, plus a small "change" ghost icon
and a third dashed "Add plant" slot. Below, an attribute table with mono uppercase row labels
in the left rail: Family, Parts used, Active compounds, Medicinal uses, Dosage, Contraindications,
Toxicity, Region. Rows where the two plants differ show a small terracotta accent bar on the
left edge; identical rows are dimmed to text-muted. Below the table, a wide danger-tint warning
band with a triangle icon reading "These plants are sometimes confused in the wild — see
look-alike notes", and two small side-by-side thumbnail images labelled with their names.
```

```
A web app screen: ailment browser. Left rail lists common complaints as selectable filter
chips grouped by body system (Digestive, Respiratory, Skin, Nervous, Immune), with "Sore
throat" active in accent-tint. Main area: h1 "Sore throat", a mono count line "14 plants
traditionally used", then result cards in a single column — each card has a plant thumbnail on
the left, the name and italic botanical name, a mono chip showing the part used ("LEAF") and
another showing the preparation ("DECOCTION"), a two-line clamp of the traditional use note,
and a "View plant" ghost link on the right. A small terracotta "caution" dot sits on two cards
with a tooltip-style label "Not for children under 12".
```

```
A web app screen: regional distribution map page. A large dark-styled map of South Asia
occupying two-thirds of the screen, with region boundaries in faint lines and clusters of
accent-green circular markers sized by plant count; one marker is selected showing a small
glass popover listing 4 plant names with thumbnails. Right one-third panel: h2 "Tamil Nadu",
a mono line "62 medicinal plants recorded", then a scrollable list of plant rows with small
thumbnails and names. Above the map, a row of filter chips: region select, plant family select
and a "Native only" toggle. Map uses dark tiles, accent markers, no rainbow colours.
```

## Learning (remaining)

```
A web app screen: lesson reader. Centred max-720px reading column on bg-base with a sticky
top bar showing a back arrow, the lesson title in small text and a thin 2px accent progress
bar across the very top at 60%. Lesson content: h1, an italic botanical name, body paragraphs
at body-lg with 68ch measure, a pull quote with a 3px accent left bar, a two-column property
spec list using mono labels, an inline plant reference card (thumbnail, name, "Read profile"
link) embedded mid-text, and a small hand-drawn botanical figure with a caption. Right side
TOC rail with the current section marked by an accent dot. Bottom sticky bar: "Previous"
ghost, page indicator "3 of 7" in mono, and a primary "Mark complete +20 XP" button.
```

```
A web app screen: quiz list. Page header "Quizzes" with a search field and a difficulty filter
row of chips (All / Easy / Medium / Hard). Below, a grid of quiz cards grouped under a
section heading per plant family ("Lamiaceae"). Each card: a coloured-initial avatar, the quiz
title in h3, a mono line "10 questions · 8 min", a row of three small difficulty dots, a best
score badge showing "90%" in accent, and a primary "Start" button; completed quizzes show a
small accent check icon and an outlined "Retry" instead. One card is in a locked state with a
lock icon, dimmed content and a mono label "PASS 3 LESSONS TO UNLOCK", plus a small progress
bar showing 2/3.
```

```
A web app screen: flashcard review session. Full-screen dark layout with a top bar: a back
arrow, "18 cards due" in mono, and a thin accent progress bar. Centre: a single large card,
16px radius, bg-surface with a subtle top highlight — front face shows a mono micro-label
"FRONT · 3 of 18", a plant silhouette illustration, and the question "Which part is used for
fever?" in h2. A small "Tap to flip" hint in text-muted under the card. Bottom: four rating
buttons in a row, each a wide outlined card with a label and a mono interval under it —
Again "1m", Hard "8m", Good "2d", Easy "6d" — with Good highlighted in accent. Small mono
footer reading "Streak +1 · 12-day streak" with a flame icon.
```

```
A web app screen: certificate page. A4-proportioned landscape card, centred on bg-base, with
a 1px accent-600 border, an inner hairline frame, a faint botanical line-art watermark across
the background and a soft radial accent glow in one corner. Content: the wordmark small and
uppercase mono at the top, "Certificate of Completion" in display type, a line of body text
"awarded to", the learner's name in a large serif italic, the course name "Medicinal Plant
Fundamentals", a mono line with the date and a verification code "VHG-2026-08412", a small
hexagonal badge tile at the bottom-left and a signature line with a script signature at the
bottom-right. Two actions under the card: primary "Download PDF" and secondary "Share".
```

## Social

```
A web app screen: community feed. Left sidebar with the main nav. Centre column max-720px:
a sticky tab bar (All / Remedies / Questions / Notes) with an underlined active tab, then post
cards — each with a small avatar, the author name and a mono timestamp, a type chip ("REMEDY"
in accent-tint, "QUESTION" in clay-tint), the post body clamped to 3 lines, a tagged plant row
with a small thumbnail and name, and a footer action row: upvote with count, comment count,
bookmark icon; one card has a small accent bar on the left edge marking it as approved by an
expert. Right rail: a "Top contributors" list of 5 small rows with avatars and XP, and a
"Trending plants" list with thumbnails.
```

```
A web app screen: single post view. Centred max-720px column. At the top a back arrow and
breadcrumb. The post: author row with avatar, name, mono timestamp and an expert checkmark;
an h1 title; body text at body-lg; an embedded plant reference card; a cited-source line in
small text-secondary with a link icon; an action bar with upvote, share, bookmark and a
"Report" ghost link on the far right. Below, a comments section: an input with a primary
"Post comment" button, then threaded comment rows with 24px avatars, names, body text, and a
small row of reply, upvote and mono timestamp; one comment has a 3px accent left bar with a
mono label "MARKED AS USEFUL".
```

```
A web app screen: create post page. Centred max-640px form. h1 "Share something". A segmented
type selector at the top (Remedy / Question / Note) with Remedy active. A title input, a large
textarea with a character counter in mono, a "Tag plants" autocomplete field showing two
selected plant chips with small thumbnails and an x icon, and a "Sources" input with a
required marker and helper text "Remedies must cite a source". A small info strip in
text-secondary explaining moderation with a shield icon. Footer: "Save draft" ghost on the
left, "Submit for review" primary on the right; a small mono note reads "Posts are reviewed
before appearing publicly".
```

```
A web app screen: public user profile. Top banner area with a soft radial accent glow and a
large 72px avatar with an accent level ring. Beside it: the name in h1, "@handle" in mono
text-muted, a one-line bio, and a row of mono stat chips — "1,240 XP", "18 badges", "42
plants read", "12-day streak". A follow button (primary) and a message button (secondary) on
the right. Below: a section "Badges" as a row of six hexagonal tiles, unlocked in accent with
glow and locked at 30% opacity; then a section "Public gardens" as two garden thumbnail cards
with names and plant counts; then a section "Recent contributions" as three compact post rows.
```

```
A web app screen: leaderboard. Centred max-900px. A header row: h1 "Leaderboard", a segmented
toggle (This week / All time) with This week active, and a mono line "Resets in 3d 4h". Below, a
podium of the top three: three columns of increasing height with avatar in a circular accent
ring, name, mono XP, a rank number and a small badge icon, the first-place column with a soft
accent glow behind it. Then a ranked list of rows 4 to 20: rank in mono, small avatar, name and
level, XP on the right; the current user's row pinned at the bottom of the list with an accent
left bar and a "You" label, slightly raised with a shadow to read as floating over the list.
```

```
A web app screen: notifications inbox. Left sidebar nav, centre max-640px list. Page header
"Notifications" with a "Mark all read" ghost link. Below, grouped by day with mono date
labels ("TODAY", "YESTERDAY"). Each row: a 36px circular icon badge tinted by type — accent
for badge unlocked, clay for reply, warning amber for streak at risk, danger for moderation
outcome — a bold first line, a second line of text-secondary, and a mono timestamp on the
right; rows on the left have a small unread accent dot. One row is expanded showing a badge
unlock with a small hexagonal badge visual and an inline "View badge" link. A small tab row at
the top for All / Unread / Mentions.
```

## Smart features

```
A web app screen: plant identification from a photo. Two-column layout. Left (55%): a large
photo upload dropzone on bg-surface with a dashed accent-tint border, a camera line icon and
"Drop a leaf photo or browse" plus a mono hint "JPG or PNG up to 10 MB"; the dropzone is shown
in a used state with a leaf photo and a crop overlay with draggable accent corner handles.
Right (45%): h2 "Best matches", then three result cards each with a thumbnail, the plant name,
the italic botanical name and a confidence bar in accent green with a mono percentage — the top
match at 92% with a filled accent bar, the second at 61%, the third at 34%. Under the top match,
an inline warning strip in warning amber with a triangle icon: "Confidence below 95% — verify
with a second source before using any plant." Bottom: a primary "Open plant profile" and a
secondary "Identify another".
```

```
A web app screen: AI assistant chat over the plant database. Full-height two-column layout.
Left rail 280px: "Conversations" heading, a primary "New chat" button, and a list of past
chat rows with truncated titles and mono timestamps, one active with an accent left bar.
Right: a chat thread on bg-base — user bubbles right-aligned in bg-raised with 16px radius,
assistant replies left-aligned with no bubble, just body text; assistant messages include
inline plant reference cards (thumbnail, name, italic botanical name, "View profile" link) and
a citation row of small mono chips like "WHO MONOGRAPH" and "API VOL.2" with link icons. One
assistant message shows a typing indicator as three pulsing accent dots. Bottom: an input bar
with a rounded field, a paperclip icon, a mic icon and a circular accent send button; above it
a row of three suggested-prompt pills such as "What helps a sore throat?".
```

## Admin

```
A web app admin screen: dashboard overview. Left sidebar 248px with an "ADMIN" mono section
label and nav items (Dashboard, Plants, Moderation, Users, Quizzes, Badges) with icons. Main
area: h1 "Overview" with a mono date range chip. Top row of four stat cards: Total users
"4,182" with a +12% delta, Published plants "240" with a +3 delta, DAU "612" with a small
sparkline in accent, Pending moderation "14" with a warning amber accent and a "Review" link.
Below: a two-thirds width area chart titled "Active users · 30 days" in accent green with a
soft area fill, and a one-third panel titled "Most viewed plants" as a ranked list of 6 rows
with small thumbnails, names and mono view counts with thin bar fills behind them. Bottom row:
a "Quiz pass rate" list of 4 horizontal bars in the green ramp, and a "Recent moderation"
compact activity feed.
```

```
A web app admin screen: plant CMS list. Left sidebar nav with Plants active. Page header:
h1 "Plants", a primary "New plant" button, and a row of controls — a search field, a status
filter (All / Published / Draft), a family dropdown and a "Bulk actions" outlined button. Below,
a data table: columns for a small thumbnail plus common name, italic botanical name, family in
a mono chip, a toxicity dot, lessons count, status as a pill chip (accent for Published,
text-muted for Draft), and an updated mono date, with a "..." row action menu. One row is
selected showing an accent left bar and a checkbox. A footer bar shows "24 selected" with
Publish, Unpublish and Delete actions. Pagination row at the bottom with mono page numbers.
```

```
A web app admin screen: moderation queue. Two-pane layout. Left pane 320px: a list of pending
items as rows with a type chip (REMEDY / NOTE), the submitter name, a mono relative time and a
small flag count; the active row has an accent left bar. Right pane: a split diff view — the
submitted content on top in bg-surface with a mono "SUBMITTED" label and the current published
version below dimmed with a "CURRENT" label, changed lines marked with accent and danger
left bars. Below the diff, a "Reviewer note" textarea and a row of actions: "Approve" primary,
"Request changes" secondary, "Reject" danger-outlined. A small mono helper row at the top
right reads "14 pending · 3 flagged"; keyboard shortcuts are hinted in mono under the buttons
("A approve · R reject · J/K next").
```

```
A web app admin screen: user management. Left sidebar nav with Users active. Header "Users"
with a search field and filter chips (All / Students / Experts / Admins / Banned). A data table:
columns for avatar plus name, email in text-secondary, role as a dropdown-styled chip, XP in
mono, mono join date, last active relative time, and a status pill. One row is expanded
revealing a small detail panel with three stat blocks and two actions: "Change role" secondary
and "Ban user" danger-outlined. Above the table a mono summary line "4,182 users · 612 active
today · 3 pending expert applications". A small side panel on the right shows the selected
user's recent activity as a compact timeline.
```

```
A web app admin screen: quiz builder. Three-column layout. Left: quiz settings — title input,
family dropdown, difficulty segmented control, time limit input, and a "Randomise questions"
toggle. Centre: the question list as reorderable cards, each with a drag handle, a mono number,
the question text, four answer options with a radio marking the correct one in accent, and
icons for edit, duplicate and delete; one card is expanded in edit mode with a rich text
question field, four option inputs, a correct-answer selector and an "Explanation" textarea.
Right: a sticky preview panel rendering the question as it will look to a learner, plus a
"Generate from plants" outlined button with a small mono note "12 questions from 4 selected
plants". Footer bar: "Save draft" ghost, "Preview quiz" secondary, "Publish" primary, with a
mono counter "18 questions · 15 min".
```

```
A web app admin screen: badge manager. Header "Badges" with a primary "New badge" button. Below,
a grid of badge cards — each with a hexagonal badge visual at the top (unlocked state in accent
with glow), the badge name in h3, a mono criteria line like "READ 10 PLANTS · FAMILY
LAMIACEAE", a small mono stat "earned by 412 users", and edit/duplicate/delete icons. One card
is open in an edit drawer on the right showing: badge name input, hex icon picker with a small
grid of alternatives, icon colour swatches, and a criteria builder as a row of three dropdowns
("Read" · "10 plants" · "of family Lamiaceae") with an "Add condition" ghost button, plus an XP
reward number input and a preview of the badge as it appears when unlocked.
```

## Shared states kit

```
A web app screen: a component states kit on one canvas, dark botanical theme, in labelled rows.
Row one, "Empty states": three panels — no search results reading "No plants match these
filters" with a botanical line-art watermark and a "Clear filters" button; an empty garden
reading "Nothing planted yet"; an empty inbox reading "You're all caught up". Row two,
"Loading": skeleton versions of a plant card grid at 6% white with a 1.4s shimmer, a skeleton
table with greyed bar rows, and a small 20px accent spinner. Row three, "Errors": an inline
field error with a danger border and a small mono message; a failed-fetch panel with a danger
icon, "Couldn't load plants", a mono retry countdown and "Try again" secondary button; an
offline banner across the top in warning amber reading "You're offline — changes won't save".
Row four, "Toasts": four stacked toasts bottom-right — success with a 3px accent left bar
reading "+20 XP · Lesson complete", an info toast, a warning toast, and a danger toast — each
with a small icon, bold first line, text-secondary second line and a dismiss x.
```

```
A web app screen: global command palette overlay. A centred modal at the top third of the
screen, max-width 640px, bg-raised with a 20px radius, strong border and backdrop blur, over a
dimmed blurred page behind. Inside: a search input row with a magnifier icon and a mono "ESC"
hint chip on the right; then grouped results with mono section labels — "PLANTS" listing three
rows with small thumbnails, common name, italic botanical name and a mono family chip;
"LESSONS" listing two rows with a book icon; "PAGES" listing three plain rows. The first result
is highlighted with accent-tint background and an accent left bar. A footer row in mono shows
navigation hints: "↑↓ navigate · ↵ open · ⌘K toggle".
```

Priority if you're rationing generations: **login → onboarding → lesson reader → flashcards → community feed → identify → admin dashboard.** Those seven give you a complete demo path (sign up, learn, review, participate, AI feature, admin). Everything else is depth for the report.

Total screen count if you generate all of them: 43. That's more than Stitch's free daily credits cover in one day — expect two to three sessions.
