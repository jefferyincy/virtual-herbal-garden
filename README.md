# Virtual Herbal Garden

A dark-mode botanical study application: walk a 3D herb garden, read cited plant monographs,
quiz yourself, review with spaced repetition, share remedies, and administer the content.

Stack is fixed by the build spec (`docs/build-pack.md` section 1-2). Nothing outside it is added
without asking.

| Layer | Choice |
|---|---|
| Client | Vite, React 18, TypeScript, React Router v6, TailwindCSS, TanStack Query, Zustand, react-hook-form + zod, framer-motion, `@react-three/fiber` + `@react-three/drei` (garden routes only, lazy) |
| Server | Node, Express, Mongoose, JWT (access + refresh), bcrypt, zod, multer |
| Database | MongoDB |

## Layout

```
client/                  Vite React app
  public/reference/      Stitch mockup exports - visual reference only, never copied into the app
  src/app/routes.tsx     the route registry: every route in the spec table, tagged by phase
  src/components/ui/     design-system primitives
  src/lib/api.ts         the one network entry point (access token in memory, refresh in cookie)
  src/types/api.ts       the API contract types shared by every screen
server/
  src/config/env.ts      zod-validated environment
  src/middleware/        auth, zod validation, rate limiting, error envelope
  src/services/          srs.js (SM-2), xp.js (levels + badge triggers)
docs/                    the build pack, DESIGN.md, and the Stitch token export
reference/               the unmodified Stitch export (HTML + PNG), reference only
scripts/db.sh            start/stop the project-local MongoDB
```

## Getting started

```bash
npm install
cp .env.example .env          # fill in the two JWT secrets

# MongoDB: this machine has no system mongod and no passwordless sudo, so the project runs a
# portable server from .mongo/ on 127.0.0.1:27017.
npm run db:start

npm run seed                  # 20 cited plant monographs + lessons, quizzes, badges
npm run dev:client            # http://localhost:5173
npm run dev:server            # http://localhost:4000
```

`npm run db:status` reports state, `npm run db:stop` shuts it down. The client proxies `/api` to
port 4000 in development, so the httpOnly refresh cookie is same-origin.

## Checks

```bash
npm run typecheck    # tsc --noEmit for server and client
npm run build        # server typecheck + client production build
npm test             # server test suites (SRS scheduler, XP rules, auth refresh flow)
```

## Conventions

- **No `fetch` outside `client/src/lib/api.ts`.** Screens use TanStack Query hooks built on it.
- **Server validates every request body with zod** through `validate()`; client input is never
  trusted. Errors always leave the API as `{ error: { code, message, details? } }`.
- **Auth**: access token in memory, refresh token in an httpOnly cookie. A 401 triggers exactly
  one refresh retry, then logout. Role gates are enforced on both sides.
- **3D routes are lazy-loaded** behind Suspense; device pixel ratio is capped at 1.5; models load
  on demand.
- **Every plant view carries the non-dismissible safety banner.**
- **No emoji in the UI**, no pure black or white, one accent colour per screen.

## Data honesty

Seed monographs use real species with real sources listed per record. Fields without a citable
source are `null` rather than guessed, and such records are flagged `unverified: true`. Toxicity
is always marked, and look-alike notes exist because misidentification is the main real-world
hazard. The application is a study aid, not medical advice.
