# Virtual Herbal Garden - server

Express 4 + Mongoose API. Run through `tsx` so TypeScript sources execute directly (no build step;
`npm run build` is a type check only).

## Running

```bash
npm run dev -w server      # from the repo root, watch mode
npm start -w server        # no watch
npm test -w server         # node:test suites
npm run seed -w server     # seed the database
```

Environment comes from the repo-root `.env` (see `.env.example`); `config/env.ts` validates it with
zod on import and throws at boot if a required key is missing. `MONGO_URI`, `JWT_ACCESS_SECRET` and
`JWT_REFRESH_SECRET` are required. MongoDB is started separately (`npm run db:start` at the root).

## Middleware order (`src/app.ts`)

1. `cors` - credentials enabled, origin pinned to `CLIENT_ORIGIN`
2. `cookieParser` - the refresh token lives in an httpOnly cookie
3. `express.json` / `express.urlencoded` body parsing (`1mb` JSON limit)
4. routers under `/api`
5. `notFoundHandler` - unmatched routes
6. `errorHandler` - terminal, always in last position

## Error envelope

Every failure leaves the API as:

```json
{ "error": { "code": "not_found", "message": "No route for GET /api/x", "details": null } }
```

`details` is omitted unless present. Status codes map to stable codes: 400 `bad_request`,
401 `unauthorized`, 403 `forbidden`, 404 `not_found`, 409 `conflict`, 422 `validation_error`,
429 `rate_limited`, 5xx `internal_error`. Throw `HttpError` (or the `badRequest` / `unauthorized` /
`forbidden` / `notFound` / `conflict` / `unprocessable` helpers from `lib/http.ts`) from services
and routes; the error middleware translates it.

## Validation

All request input is validated with zod through the `validate({ body, query, params })` middleware
(`src/middleware/validate.ts`). It replaces `req.body` / `req.query` / `req.params` with the parsed
result, so controllers read trusted, coerced values. A failure becomes a 422 `validation_error` with
per-field `details`. Routes never read raw input.

## Async handlers

Express 4 does not catch rejected promises, so async handlers are wrapped with `route()` from
`src/lib/asyncRoute.ts`; a rejection is forwarded to `next` and reaches the error middleware. New
code uses `route` (the older `asyncHandler` in `lib/http.ts` is equivalent but typed less precisely).

## Routers

`src/routes/index.ts` owns the aggregate `apiRouter` mounted at `/api`. Phase routers register with
`registerRouter(path, router)` instead of touching `app.ts`; `mountedRouterPaths` records what is
mounted and duplicate registrations are ignored with a warning. Endpoints that are not built yet
should use `notImplemented(feature)` so they return a real `501` rather than a misleading `404`.

## Auth

Access token (short `ACCESS_TTL`) is kept in memory by the client and sent as
`Authorization: Bearer <token>`; the refresh token (`REFRESH_TTL`) lives in an httpOnly cookie.

- `signAccessToken` / `verifyAccessToken` (`src/middleware/auth.ts`) sign and verify HS256 access
  tokens; verification failures surface as `unauthorized('Session expired' | 'Invalid token')`
  without leaking the underlying jwt error.
- `requireAuth` rejects requests without a valid bearer token and sets `req.user = { id, role }`.
- `optionalAuth` populates `req.user` when a valid token is present but never rejects (public reads).
- `requireRole(...roles)` and `requireSelfOrRole(paramName, ...roles)` gate by role or ownership.
- `rateLimit` (`src/middleware/rateLimit.ts`) is an in-memory fixed-window limiter; `authLimiter`
  and `writeLimiter` are the preconfigured instances for auth and write routes. It is per-process.
