/**
 * Admin surface: dashboard metrics, user management, moderation, and the plants/quizzes/badges CMS.
 *
 * Mounted by the orchestrator at `/api/admin`, so every path below is relative to that mount.
 *
 * Data honesty is the theme of this file: the schema has no activity log, no view counter, no post
 * version history and no expert-application flow, so every metric below is either a real count or a
 * documented derivation of rows that do exist. Nothing is a decorative constant.
 */

import { Router, type Request } from 'express';
import { Types, type PipelineStage } from 'mongoose';
import { z } from 'zod';
import { route } from '../lib/asyncRoute.ts';
import { badRequest, conflict, notFound } from '../lib/http.ts';
import { paginated, pagination, searchFilter } from '../lib/query.ts';
import { requireAuth, requireRole } from '../middleware/auth.ts';
import { validate } from '../middleware/validate.ts';
import {
  Attempt,
  Badge,
  BADGE_ACTIONS,
  Comment,
  Lesson,
  Plant,
  Post,
  POST_STATUSES,
  Progress,
  QUIZ_DIFFICULTIES,
  Quiz,
  User,
  USER_ROLES,
} from '../models/index.ts';
import { QUIZ_PASS_RATIO } from '../services/award.ts';
import { BADGE_ICON_NAMES } from './badges.ts';

export const adminRouter: Router = Router();

/**
 * Authorisation, deliberately in one place per surface:
 *  - `postsRouter` allows BOTH `expert` and `admin` to moderate a post (POST /api/posts/:id/moderate),
 *    so the moderation queue and its diff - the read side of the same job - are granted the same pair.
 *  - ieverything else under /api/admin is admin-only; `requireAuth` runs first so an anonymous caller
 *    gets 401 and a signed-in non-admin gets 403 before any handler or validator runs.
 *
 * A caller who reaches the router still hits the read-side gate below on every other route.
 */
adminRouter.use(requireAuth);

/**
 * The moderation read surface is shared with experts (see `postsRouter`), so its paths bypass the
 * admin-only gate and carry their own `requireRole` on the route. Everything else under /api/admin
 * is admin-only by construction, the GETs included.
 */
adminRouter.use((req, res, next) => {
  if (req.path.startsWith('/moderation')) {
    next();
    return;
  }
  requireRole('admin')(req, res, next);
});

/** The pair the post moderation action already accepts: the read side of the same job. */
const MODERATOR_ROLES = ['expert', 'admin'] as const;

const OBJECT_ID = /^[0-9a-f]{24}$/i;
const objectIdString = z.string().trim().regex(OBJECT_ID, 'Expected a 24 character id');
const idParams = z.object({ id: objectIdString });

const MS_PER_DAY = 86_400_000;
/** Matches `$dateToString`'s default UTC format, so JS-built labels and Mongo day keys agree. */
const DAY_KEY_FORMAT = '%Y-%m-%d';
const DAU_SPARKLINE_DAYS = 14;
const ACTIVE_SERIES_DAYS = 30;

/** `?banned=false` arrives as the string "false"; an empty value means "do not filter". */
const booleanFlag = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
);

/** The validated id of a `/:id` route; `validate()` guarantees it exists and is 24-hex. */
function routeParamId(req: Request): string {
  const value = req.params.id;
  if (typeof value !== 'string' || value.length === 0) throw badRequest('Missing id');
  return value;
}

/**
 * The authenticated caller's id. The router-level `requireAuth` has already rejected an anonymous
 * request, so this can only be reached with a `req.user` present.
 */
function callerId(req: Request): string {
  const user = req.user;
  if (!user) throw badRequest('Missing authenticated user');
  return user.id;
}

/* -------------------------------------------------------------------------------------------
 * Activity derivation
 *
 * There is NO activity log in the schema. The newest row a user leaves is the only signal that
 * they were on the site, so "active" is derived from the four collections that timestamp user
 * action. Browsing a page leaves no row at all, which makes every number below a LOWER BOUND; a
 * real deployment needs an activity log to count a user who only reads.
 * ---------------------------------------------------------------------------------------- */

/**
 * The four activity sources with the field that timestamps them, read from the models so the
 * collection names cannot drift from the schemas. The first entry seeds the pipeline; the rest
 * are `$unionWith`-ed into it.
 */
const ACTIVITY_SOURCES = [
  { coll: Progress.collection.name, dateField: 'updatedAt' },
  { coll: Attempt.collection.name, dateField: 'createdAt' },
  { coll: Comment.collection.name, dateField: 'createdAt' },
  { coll: Post.collection.name, dateField: 'createdAt' },
] as const;

type ActivitySource = (typeof ACTIVITY_SOURCES)[number];

/** One source's `$match` + `$project`, normalising its rows to `{ userId }` (plus `day`). */
function sourceStages(
  source: ActivitySource,
  since: Date,
  perDay: boolean,
): PipelineStage.UnionWithPipelineStage[] {
  const match: PipelineStage.UnionWithPipelineStage = {
    $match: { [source.dateField]: { $gte: since } },
  };
  const project: PipelineStage.UnionWithPipelineStage = perDay
    ? {
        $project: {
          _id: 0,
          userId: 1,
          day: { $dateToString: { format: DAY_KEY_FORMAT, date: `$${source.dateField}` } },
        },
      }
    : { $project: { _id: 0, userId: 1 } };
  return [match, project];
}

/**
 * One aggregation over all four sources: `$unionWith` appends the other collections to the rows
 * that matched in `progresses`, then a single `$group` counts DISTINCT users - either in the
 * window (perDay false) or per day (perDay true). The model only supplies the starting collection.
 */
function activityPipeline(since: Date, perDay: boolean): PipelineStage[] {
  const [primary, ...others] = ACTIVITY_SOURCES;
  const pipeline: PipelineStage[] = [
    ...sourceStages(primary, since, perDay),
    ...others.map<PipelineStage>((source) => ({
      $unionWith: { coll: source.coll, pipeline: sourceStages(source, since, perDay) },
    })),
  ];
  if (perDay) {
    pipeline.push(
      { $group: { _id: { userId: '$userId', day: '$day' } } },
      { $group: { _id: '$_id.day', count: { $sum: 1 } } },
    );
  } else {
    pipeline.push({ $group: { _id: '$userId' } }, { $count: 'total' });
  }
  return pipeline;
}

/** DISTINCT users with any recorded activity since `since`. A LOWER BOUND - see the block above. */
async function activeUserCount(since: Date): Promise<number> {
  const rows = await Progress.aggregate<{ total: number }>(activityPipeline(since, false));
  return rows[0]?.total ?? 0;
}

/** DISTINCT users with activity per UTC day, keyed `YYYY-MM-DD`, from the same four sources. */
async function activeUsersPerDay(since: Date): Promise<Map<string, number>> {
  const rows = await Progress.aggregate<{ _id: string | null; count: number }>(
    activityPipeline(since, true),
  );
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (typeof row._id === 'string') counts.set(row._id, row.count);
  }
  return counts;
}

/** The last `days` UTC day labels, oldest first, so a chart reads left to right. */
function dayLabels(days: number, now: Date): string[] {
  const labels: string[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    labels.push(new Date(now.getTime() - offset * MS_PER_DAY).toISOString().slice(0, 10));
  }
  return labels;
}

/* -------------------------------------------------------------------------------------------
 * Line diff
 * ---------------------------------------------------------------------------------------- */

/**
 * Textual `diff` between two multi-line strings over a real longest-common-subsequence table.
 * `removed` indexes lines of `a`, `added` indexes lines of `b`; both are ascending. Used by the
 * moderation diff view, whose "changed lines" are the union of the two.
 */
export function diffLines(a: string, b: string): { added: number[]; removed: number[] } {
  const left = a.split('\n');
  const right = b.split('\n');

  // lengths[i][j] = LCS length of left[i..] and right[j..], filled bottom-right to top-left.
  const lengths: number[][] = [];
  for (let i = 0; i <= left.length; i += 1) {
    lengths.push(new Array<number>(right.length + 1).fill(0));
  }
  for (let i = left.length - 1; i >= 0; i -= 1) {
    const row = lengths[i];
    const below = lengths[i + 1];
    if (!row || !below) continue;
    for (let j = right.length - 1; j >= 0; j -= 1) {
      row[j] =
        left[i] === right[j]
          ? (below[j + 1] ?? 0) + 1
          : Math.max(below[j] ?? 0, row[j + 1] ?? 0);
    }
  }

  const added: number[] = [];
  const removed: number[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      i += 1;
      j += 1;
      continue;
    }
    // Whichever advance keeps the longer common subsequence wins, so the diff stays minimal.
    const skipLeft = lengths[i + 1]?.[j] ?? 0;
    const skipRight = lengths[i]?.[j + 1] ?? 0;
    if (skipLeft >= skipRight) {
      removed.push(i);
      i += 1;
    } else {
      added.push(j);
      j += 1;
    }
  }
  while (i < left.length) {
    removed.push(i);
    i += 1;
  }
  while (j < right.length) {
    added.push(j);
    j += 1;
  }

  return { added, removed };
}

/** Ascending union of added and removed indices - the lines the diff view marks as changed. */
function changedLineIndices(submitted: string, current: string | null): number[] {
  if (current === null) return [];
  const { added, removed } = diffLines(submitted, current);
  return [...new Set([...added, ...removed])].sort((x, y) => x - y);
}

/* -------------------------------------------------------------------------------------------
 * Dashboard metrics
 * ---------------------------------------------------------------------------------------- */

/** Plants a learner finished reading, grouped by plant. */
type ReadCountRow = { _id: Types.ObjectId; views: number };

async function topReadPlants(): Promise<ReadCountRow[]> {
  // `views` is DERIVED from `Progress { read: true }` counts: the schema has no view tracking, so
  // a completed read is the closest real signal. The field is named `views` because that is what
  // the dashboard mockup labels the column.
  return Progress.aggregate<ReadCountRow>([
    { $match: { read: true } },
    { $group: { _id: '$plantId', views: { $sum: 1 } } },
    { $sort: { views: -1, _id: 1 } },
    { $limit: 6 },
  ]);
}

/** One `$in` join for the six names the ranked list renders. */
async function plantNamesById(
  ids: string[],
): Promise<Map<string, { commonName: string; botanicalName: string }>> {
  const names = new Map<string, { commonName: string; botanicalName: string }>();
  if (ids.length === 0) return names;
  const plants = await Plant.find({ _id: { $in: ids } })
    .select('commonName botanicalName')
    .lean<Array<{ _id: Types.ObjectId; commonName: string; botanicalName: string }>>();
  for (const plant of plants) {
    names.set(String(plant._id), {
      commonName: plant.commonName,
      botanicalName: plant.botanicalName,
    });
  }
  return names;
}

type FamilyPassRow = { _id: string; attempted: number; passed: number };

/** Per family, attempts and passes, from ONE `$lookup` join to each attempt's quiz. */
async function familyPassRows(): Promise<FamilyPassRow[]> {
  return Attempt.aggregate<FamilyPassRow>([
    { $match: { total: { $gt: 0 } } },
    {
      $lookup: {
        from: Quiz.collection.name,
        localField: 'quizId',
        foreignField: '_id',
        as: 'quiz',
      },
    },
    // Drops attempts whose quiz was deleted, so a family is never fabricated from a missing quiz.
    { $unwind: '$quiz' },
    {
      $group: {
        _id: '$quiz.family',
        attempted: { $sum: 1 },
        passed: {
          $sum: {
            $cond: [{ $gte: [{ $divide: ['$score', '$total'] }, QUIZ_PASS_RATIO] }, 1, 0],
          },
        },
      },
    },
    { $sort: { attempted: -1, _id: 1 } },
    { $limit: 4 },
  ]);
}

type ModeratedPost = {
  _id: Types.ObjectId;
  title: string;
  status: string;
  updatedAt: Date;
  reviewerId: unknown;
};

/** The last 10 posts a reviewer has touched, newest first, with the reviewer's name. */
async function recentModeratedPosts(): Promise<ModeratedPost[]> {
  return Post.find({ reviewerId: { $ne: null } })
    .sort({ updatedAt: -1 })
    .limit(10)
    .populate({ path: 'reviewerId', select: 'name' })
    .lean<ModeratedPost[]>();
}

function reviewerName(reviewer: unknown): string {
  if (reviewer && typeof reviewer === 'object' && 'name' in reviewer) {
    const name = (reviewer as { name?: unknown }).name;
    if (typeof name === 'string' && name.length > 0) return name;
  }
  return 'Unknown';
}

/** `status` is the queue state; `action` is the moderator verb the activity feed prints. */
function moderationAction(status: string): 'approve' | 'reject' | 'request_changes' {
  if (status === 'approved') return 'approve';
  if (status === 'rejected') return 'reject';
  return 'request_changes';
}

adminRouter.get(
  '/stats',
  route(async (_req, res) => {
    const now = new Date();
    const since24h = new Date(now.getTime() - MS_PER_DAY);
    const since30d = new Date(now.getTime() - 30 * MS_PER_DAY);
    const since60d = new Date(now.getTime() - 60 * MS_PER_DAY);
    const seriesStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) -
        (ACTIVE_SERIES_DAYS - 1) * MS_PER_DAY,
    );

    const [
      totalUsers,
      usersRecent,
      usersPrevious,
      publishedPlants,
      plantDelta,
      pendingModeration,
      dau,
      activityCounts,
      topPlantRows,
      familyRows,
      moderationPosts,
    ] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ createdAt: { $gte: since30d } }),
      User.countDocuments({ createdAt: { $gte: since60d, $lt: since30d } }),
      // "Published" is a non-null `publishedAt`; a draft has the field null.
      Plant.countDocuments({ publishedAt: { $ne: null } }),
      Plant.countDocuments({ createdAt: { $gte: since30d } }),
      Post.countDocuments({ status: 'pending' }),
      activeUserCount(since24h),
      activeUsersPerDay(seriesStart),
      topReadPlants(),
      familyPassRows(),
      recentModeratedPosts(),
    ]);

    // A period-over-period PROXY, not a charted daily delta: this compares the users created in the
    // last 30 days with the 30 days before that. Either window being empty means there is no
    // growth rate to report, so it is honestly 0 rather than a division by zero or an invention.
    const userDeltaPct =
      usersRecent === 0 || usersPrevious === 0
        ? 0
        : Math.round(((usersRecent - usersPrevious) / usersPrevious) * 100);

    const labels = dayLabels(ACTIVE_SERIES_DAYS, now);
    const activeUsers30d = labels.map((label) => activityCounts.get(label) ?? 0);
    const dauSparkline = activeUsers30d.slice(-DAU_SPARKLINE_DAYS);

    const names = await plantNamesById(topPlantRows.map((row) => String(row._id)));
    const topPlants = topPlantRows.map((row) => {
      const plant = names.get(String(row._id));
      return {
        plantId: String(row._id),
        commonName: plant?.commonName ?? 'Unknown plant',
        botanicalName: plant?.botanicalName ?? '',
        views: row.views,
      };
    });

    const quizPassRate = familyRows.map((row) => {
      const attempted = Math.max(row.attempted, 0);
      const passed = Math.min(Math.max(row.passed, 0), attempted);
      const raw = attempted === 0 ? 0 : Math.round((passed / attempted) * 100);
      return { family: row._id, passRate: Math.min(Math.max(raw, 0), 100) };
    });

    const recentModeration = moderationPosts.map((post) => ({
      id: String(post._id),
      title: post.title,
      action: moderationAction(post.status),
      at: post.updatedAt,
      reviewer: reviewerName(post.reviewerId),
    }));

    res.json({
      totalUsers,
      userDeltaPct,
      publishedPlants,
      plantDelta,
      dau,
      dauSparkline,
      pendingModeration,
      activeUsers30d,
      topPlants,
      quizPassRate,
      recentModeration,
    });
  }),
);

/* -------------------------------------------------------------------------------------------
 * Users
 * ---------------------------------------------------------------------------------------- */

type LeanUserRow = {
  _id: Types.ObjectId;
  name: string;
  email: string;
  handle: string;
  role: string;
  xp: number;
  level: number;
  banned?: boolean | null;
  badges?: Array<unknown> | null;
  streak?: { lastActiveAt?: Date | null } | null;
  createdAt: Date;
};

/** The user projection every admin response uses; `passwordHash` is never selected. */
function userRow(user: LeanUserRow) {
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    handle: user.handle,
    role: user.role,
    xp: user.xp,
    level: user.level,
    joinedAt: user.createdAt,
    lastActiveAt: user.streak?.lastActiveAt ?? null,
    banned: user.banned ?? false,
    badgeCount: user.badges?.length ?? 0,
  };
}

const USER_ROW_FIELDS = 'name email handle role xp level banned badges streak.lastActiveAt createdAt';

const usersQuerySchema = z.object({
  q: z.string().optional(),
  role: z.string().optional(),
  banned: booleanFlag,
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).optional(),
});

adminRouter.get(
  '/users',
  validate({ query: usersQuerySchema }),
  route(async (req, res) => {
    // validate() replaced req.query with the parsed object; express still types it as ParsedQs,
    // which is wider than the schema output, so this reads the values the middleware installed.
    const query = req.query as unknown as z.infer<typeof usersQuerySchema>;
    const window = pagination(query);

    const filter: Record<string, unknown> = {
      ...searchFilter(query.q, ['name', 'email', 'handle']),
    };
    if (query.role) filter.role = query.role;
    if (query.banned !== undefined) filter.banned = query.banned;

    const [items, total, totalUsers, activeToday] = await Promise.all([
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip(window.skip)
        .limit(window.limit)
        .select(USER_ROW_FIELDS)
        .lean<LeanUserRow[]>(),
      User.countDocuments(filter),
      User.countDocuments({}),
      // The same 24h DISTINCT-user derivation the dashboard uses; a lower bound, see above.
      activeUserCount(new Date(Date.now() - MS_PER_DAY)),
    ]);

    res.json({
      ...paginated(items.map(userRow), total, window.page, window.pageSize),
      totalUsers,
      activeToday,
      // Honestly 0: the spec has no expert-application flow, so there is no table of applications
      // to count. An invented number would render as a real backlog on the admin screen.
      pendingExpertApplications: 0,
    });
  }),
);

const roleBodySchema = z.object({ role: z.enum(USER_ROLES) });

adminRouter.patch(
  '/users/:id/role',
  validate({ params: idParams, body: roleBodySchema }),
  route(async (req, res) => {
    const { role } = req.body as z.infer<typeof roleBodySchema>;
    const target = await User.findById(routeParamId(req)).lean<LeanUserRow | null>();
    if (!target) throw notFound('User not found');

    // Guard 1: an admin editing their own row is a foot-gun (a mis-click locks them out of the
    // console they are standing in), and the role change is not something they can undo themselves.
    if (String(target._id) === callerId(req)) {
      throw badRequest('You cannot change your own role');
    }

    // Guard 2: never let the change empty the admin set. Counted against the database, not the
    // caller's token claim, so a stale admin token cannot demote the last real admin.
    if (target.role === 'admin' && role !== 'admin') {
      const admins = await User.countDocuments({ role: 'admin' });
      if (admins - 1 < 1) {
        throw badRequest('The last admin cannot be demoted: the system must keep at least one admin');
      }
    }

    const updated = await User.findByIdAndUpdate(
      target._id,
      { $set: { role } },
      { new: true, runValidators: true },
    )
      .select(USER_ROW_FIELDS)
      .lean<LeanUserRow | null>();
    if (!updated) throw notFound('User not found');

    res.json({ user: userRow(updated) });
  }),
);

const banBodySchema = z.object({
  banned: z.boolean(),
  // Accepted for the client contract. `User` has no ban-reason field, so the value is validated
  // and then deliberately not persisted rather than written into an invented field.
  reason: z.string().trim().max(280).optional(),
});

adminRouter.post(
  '/users/:id/ban',
  validate({ params: idParams, body: banBodySchema }),
  route(async (req, res) => {
    const { banned } = req.body as z.infer<typeof banBodySchema>;
    const target = await User.findById(routeParamId(req)).lean<LeanUserRow | null>();
    if (!target) throw notFound('User not found');

    // Banning yourself is refused (the console would be gone on the next request). Lifting your own
    // suspension is allowed: it is a no-op for a caller who is already unbanning themselves.
    if (banned && String(target._id) === callerId(req)) {
      throw badRequest('You cannot ban yourself');
    }

    const updated = await User.findByIdAndUpdate(
      target._id,
      { $set: { banned } },
      { new: true, runValidators: true },
    )
      .select(USER_ROW_FIELDS)
      .lean<LeanUserRow | null>();
    if (!updated) throw notFound('User not found');

    res.json({ user: userRow(updated) });
  }),
);

/* -------------------------------------------------------------------------------------------
 * Moderation
 * ---------------------------------------------------------------------------------------- */

const queueQuerySchema = z.object({
  status: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.enum(POST_STATUSES).default('pending'),
  ),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).optional(),
});

type LeanQueuePost = {
  _id: Types.ObjectId;
  type: string;
  title: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  reviewerNote?: string | null;
  sources?: string[] | null;
  plantIds?: unknown[] | null;
  userId: unknown;
};

function authorOf(author: unknown): { name: string; handle: string } {
  if (author && typeof author === 'object') {
    const record = author as { name?: unknown; handle?: unknown };
    if (typeof record.name === 'string') {
      return {
        name: record.name,
        handle: typeof record.handle === 'string' ? record.handle : '',
      };
    }
  }
  return { name: 'Unknown', handle: '' };
}

adminRouter.get(
  '/moderation/queue',
  requireRole(...MODERATOR_ROLES),
  validate({ query: queueQuerySchema }),
  route(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof queueQuerySchema>;
    const window = pagination(query);
    const filter = { status: query.status };

    const [posts, total, pendingCount] = await Promise.all([
      Post.find(filter)
        .sort({ createdAt: -1 })
        .skip(window.skip)
        .limit(window.limit)
        .populate({ path: 'userId', select: 'name handle' })
        .lean<LeanQueuePost[]>(),
      Post.countDocuments(filter),
      Post.countDocuments({ status: 'pending' }),
    ]);

    const items = posts.map((post) => ({
      _id: post._id,
      type: post.type,
      title: post.title,
      body: post.body,
      author: authorOf(post.userId),
      createdAt: post.createdAt,
      reviewerNote: post.reviewerNote ?? null,
      sources: post.sources ?? [],
      plantIds: (post.plantIds ?? []).map((plantId) => String(plantId)),
    }));

    res.json({
      ...paginated(items, total, window.page, window.pageSize),
      pendingCount,
      // Flagging is not in the spec, so there is no flag document to count. Honest 0 rather than a
      // decorative number that would make the queue look busier than it is.
      flaggedCount: 0,
    });
  }),
);

adminRouter.get(
  '/moderation/:id/diff',
  requireRole(...MODERATOR_ROLES),
  validate({ params: idParams }),
  route(async (req, res) => {
    const post = await Post.findById(routeParamId(req)).lean<LeanQueuePost | null>();
    if (!post) throw notFound('Post not found');

    const sources = post.sources ?? [];
    // There is no version history in the schema: the only copy of a post is the one stored now, so
    // `submitted` is that copy labelled with its submission time. `current` can only exist when the
    // record was edited after submission (`updatedAt` past `createdAt`); with nothing else to
    // compare against it is otherwise null, and the client renders a single pane. When it does
    // exist it holds the same stored text, so `changedLines` is honestly empty until the schema
    // grows a real revision table - the alternative would be a diff against an invented snapshot.
    const submitted = {
      body: post.body,
      title: post.title,
      sources,
      at: post.createdAt,
    };
    const edited = post.updatedAt.getTime() > post.createdAt.getTime();
    const current = edited
      ? { body: post.body, title: post.title, sources, at: post.updatedAt }
      : null;

    res.json({
      submitted,
      current,
      changedLines: changedLineIndices(submitted.body, current?.body ?? null),
    });
  }),
);

adminRouter.delete(
  '/posts/:id',
  validate({ params: idParams }),
  route(async (req, res) => {
    const id = routeParamId(req);
    const post = await Post.findById(id).select('_id').lean<{ _id: Types.ObjectId } | null>();
    if (!post) throw notFound('Post not found');

    // Hard delete of the thread, not just the post: one `deleteMany` takes every comment (replies
    // included, since they are comments on the same post) so no orphan is left pointing at it.
    await Comment.deleteMany({ postId: post._id });
    await Post.deleteOne({ _id: post._id });

    res.status(204).end();
  }),
);

/* -------------------------------------------------------------------------------------------
 * Plants CMS
 * ---------------------------------------------------------------------------------------- */

const cmsPlantsQuerySchema = z.object({
  q: z.string().optional(),
  status: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.enum(['all', 'published', 'draft']).default('all'),
  ),
  family: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).optional(),
});

type CmsPlant = {
  _id: Types.ObjectId;
  slug: string;
  commonName: string;
  botanicalName: string;
  family: string;
  toxicity: string;
  images?: Array<{ url: string; alt: string; credit: string }> | null;
  publishedAt?: Date | null;
  updatedAt: Date;
};

/** Lesson counts for the plants on one page, from ONE aggregation rather than a query per row. */
async function lessonCountsFor(ids: Types.ObjectId[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (ids.length === 0) return counts;
  const rows = await Lesson.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { plantId: { $in: ids } } },
    { $group: { _id: '$plantId', count: { $sum: 1 } } },
  ]);
  for (const row of rows) counts.set(String(row._id), row.count);
  return counts;
}

adminRouter.get(
  '/plants',
  validate({ query: cmsPlantsQuerySchema }),
  route(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof cmsPlantsQuerySchema>;
    const window = pagination(query);

    // The CMS list is the one place drafts are visible, so `status` filters on `publishedAt`.
    const filter: Record<string, unknown> = {
      ...searchFilter(query.q, ['commonName', 'botanicalName']),
    };
    if (query.status === 'published') filter.publishedAt = { $ne: null };
    if (query.status === 'draft') filter.publishedAt = null;
    if (query.family) filter.family = query.family;

    const [plants, total] = await Promise.all([
      Plant.find(filter)
        .sort({ updatedAt: -1 })
        .skip(window.skip)
        .limit(window.limit)
        .select('slug commonName botanicalName family toxicity images publishedAt updatedAt')
        .lean<CmsPlant[]>(),
      Plant.countDocuments(filter),
    ]);

    const lessonCounts = await lessonCountsFor(plants.map((plant) => plant._id));
    const items = plants.map((plant) => ({
      ...plant,
      lessonsCount: lessonCounts.get(String(plant._id)) ?? 0,
      status: plant.publishedAt ? 'published' : 'draft',
    }));

    res.json(paginated(items, total, window.page, window.pageSize));
  }),
);

const bulkPlantBodySchema = z.object({
  ids: z
    .array(objectIdString)
    .min(1, 'Select at least one plant')
    .max(100, 'At most 100 plants per action'),
  action: z.enum(['publish', 'unpublish', 'delete']),
});

adminRouter.post(
  '/plants/bulk',
  validate({ body: bulkPlantBodySchema }),
  route(async (req, res) => {
    const { ids, action } = req.body as z.infer<typeof bulkPlantBodySchema>;
    const objectIds = ids.map((id) => new Types.ObjectId(id));

    if (action === 'delete') {
      // Delete is a cascade, not just a `deleteMany`: other plants must stop pointing at the
      // removed ids (a dangling look-alike renders as a broken row) and their lessons go too.
      await Plant.updateMany(
        { 'lookAlikes.plantId': { $in: objectIds } },
        { $pull: { lookAlikes: { plantId: { $in: objectIds } } } },
      );
      await Lesson.deleteMany({ plantId: { $in: objectIds } });
      const deleted = await Plant.deleteMany({ _id: { $in: objectIds } });
      res.json({ modified: deleted.deletedCount ?? 0 });
      return;
    }

    // `publish` stamps now, `unpublish` clears the field back to the draft state.
    const result = await Plant.updateMany(
      { _id: { $in: objectIds } },
      { $set: { publishedAt: action === 'publish' ? new Date() : null } },
    );
    res.json({ modified: result.modifiedCount });
  }),
);

/* -------------------------------------------------------------------------------------------
 * Quizzes
 *
 * This router is the ONLY place a quiz's `answerIndex`/`explanation` leave the server: the
 * learner-facing router strips them. That is safe precisely because the guard at the top of this
 * file makes every route below admin-only, including the POST/PATCH responses that carry them.
 * ---------------------------------------------------------------------------------------- */

const questionSchema = z
  .object({
    stem: z.string().trim().min(1, 'A question needs a stem'),
    // Mirrors the model validators, so a bad payload is a 422 with field details rather than a
    // mongoose ValidationError surfacing as a 500.
    options: z.array(z.string().trim().min(1)).min(2, 'a quiz question needs at least two options'),
    answerIndex: z.number().int().min(0),
    explanation: z.string().optional(),
    plantId: objectIdString.nullable().optional(),
  })
  .refine((question) => question.answerIndex < question.options.length, {
    message: 'answerIndex must point at one of the question options',
    path: ['answerIndex'],
  });

const quizBodySchema = z.object({
  family: z.string().trim().min(1),
  title: z.string().trim().min(1).max(160),
  difficulty: z.enum(QUIZ_DIFFICULTIES),
  plantIds: z.array(objectIdString).optional(),
  timeLimitSec: z.number().int().min(0).optional(),
  questions: z.array(questionSchema).optional(),
  published: z.boolean().optional(),
});

const quizUpdateSchema = quizBodySchema.partial();

const quizQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).optional(),
});

type QuizListRow = {
  _id: Types.ObjectId;
  family: string;
  title: string;
  difficulty: string;
  published: boolean;
  questionCount: number;
  updatedAt: Date;
};

adminRouter.get(
  '/quizzes',
  validate({ query: quizQuerySchema }),
  route(async (req, res) => {
    const window = pagination(req.query as unknown as z.infer<typeof quizQuerySchema>);

    // The quiz builder edits questions in place, so the list ships them: this is an admin-only
    // endpoint and the builder is its only consumer. `questionCount` is still derived for the
    // list's mono count line.
    const [items, total] = await Promise.all([
      Quiz.aggregate<QuizListRow>([
        { $sort: { updatedAt: -1 } },
        { $skip: window.skip },
        { $limit: window.limit },
        { $addFields: { questionCount: { $size: { $ifNull: ['$questions', []] } } } },
        {
          $project: {
            family: 1,
            title: 1,
            difficulty: 1,
            published: 1,
            questionCount: 1,
            updatedAt: 1,
            timeLimitSec: 1,
            plantIds: 1,
            questions: 1,
          },
        },
      ]),
      Quiz.countDocuments({}),
    ]);

    res.json(paginated(items, total, window.page, window.pageSize));
  }),
);

adminRouter.post(
  '/quizzes',
  validate({ body: quizBodySchema }),
  route(async (req, res) => {
    const body = req.body as z.infer<typeof quizBodySchema>;
    const quiz = await Quiz.create({
      family: body.family,
      title: body.title,
      difficulty: body.difficulty,
      plantIds: body.plantIds ?? [],
      timeLimitSec: body.timeLimitSec ?? 0,
      questions: body.questions ?? [],
      published: body.published ?? false,
    });
    res.status(201).json({ quiz });
  }),
);

adminRouter.patch(
  '/quizzes/:id',
  validate({ params: idParams, body: quizUpdateSchema }),
  route(async (req, res) => {
    const body = req.body as z.infer<typeof quizUpdateSchema>;
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (value !== undefined) patch[key] = value;
    }

    const quiz = await Quiz.findByIdAndUpdate(
      routeParamId(req),
      { $set: patch },
      { new: true, runValidators: true },
    ).lean();
    if (!quiz) throw notFound('Quiz not found');
    res.json({ quiz });
  }),
);

adminRouter.delete(
  '/quizzes/:id',
  validate({ params: idParams }),
  route(async (req, res) => {
    const id = routeParamId(req);
    const quiz = await Quiz.findById(id).select('_id').lean<{ _id: Types.ObjectId } | null>();
    if (!quiz) throw notFound('Quiz not found');

    // The quiz document goes; attempt history stays, because it is the learner's own record of
    // what they answered and deleting it would rewrite their stats retroactively.
    await Quiz.deleteOne({ _id: quiz._id });
    res.status(204).end();
  }),
);

/* -------------------------------------------------------------------------------------------
 * Badges
 * ---------------------------------------------------------------------------------------- */

const badgeCriteriaSchema = z
  .object({
    action: z.enum(BADGE_ACTIONS),
    target: z.number().int().min(1),
    param: z.string().trim().min(1).max(80).nullable().optional(),
  })
  // `earn_badge` can never match in `evaluateBadges` (it needs cross-badge state the stats snapshot
  // does not carry), so a badge built on it would be permanently unreachable. Rejected at the door.
  .refine((criteria) => criteria.action !== 'earn_badge', {
    message: 'Badges cannot be earned from other badges: that rule can never match',
    path: ['action'],
  });

const badgeBodySchema = z.object({
  key: z.string().trim().min(2).max(64),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(400).optional(),
  criteria: badgeCriteriaSchema,
  xpReward: z.number().int().min(0).max(10_000),
  // Validated against the client icon set so the badge tile always has a renderable icon.
  icon: z.enum(BADGE_ICON_NAMES),
  active: z.boolean().optional(),
});

const badgeUpdateSchema = badgeBodySchema.partial();

const badgeQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).optional(),
});

adminRouter.get(
  '/badges',
  validate({ query: badgeQuerySchema }),
  route(async (req, res) => {
    const window = pagination(req.query as unknown as z.infer<typeof badgeQuerySchema>);
    const [items, total] = await Promise.all([
      Badge.find().sort({ name: 1 }).skip(window.skip).limit(window.limit).lean(),
      Badge.countDocuments({}),
    ]);

    res.json(paginated(items, total, window.page, window.pageSize));
  }),
);

adminRouter.post(
  '/badges',
  validate({ body: badgeBodySchema }),
  route(async (req, res) => {
    const body = req.body as z.infer<typeof badgeBodySchema>;

    // `badges.key` is unique; checking here turns a raw duplicate-key write into a clear 409.
    if (await Badge.exists({ key: body.key })) {
      throw conflict(`A badge with the key "${body.key}" already exists`);
    }

    const badge = await Badge.create({
      key: body.key,
      name: body.name,
      description: body.description ?? '',
      criteria: {
        action: body.criteria.action,
        target: body.criteria.target,
        param: body.criteria.param ?? null,
      },
      xpReward: body.xpReward,
      icon: body.icon,
      active: body.active ?? true,
    });
    res.status(201).json({ badge });
  }),
);

adminRouter.patch(
  '/badges/:id',
  validate({ params: idParams, body: badgeUpdateSchema }),
  route(async (req, res) => {
    const body = req.body as z.infer<typeof badgeUpdateSchema>;
    const patch: Record<string, unknown> = {};
    if (body.key !== undefined) patch.key = body.key;
    if (body.name !== undefined) patch.name = body.name;
    if (body.description !== undefined) patch.description = body.description;
    if (body.xpReward !== undefined) patch.xpReward = body.xpReward;
    if (body.icon !== undefined) patch.icon = body.icon;
    if (body.active !== undefined) patch.active = body.active;
    if (body.criteria !== undefined) {
      patch.criteria = {
        action: body.criteria.action,
        target: body.criteria.target,
        param: body.criteria.param ?? null,
      };
    }

    const badge = await Badge.findByIdAndUpdate(
      routeParamId(req),
      { $set: patch },
      { new: true, runValidators: true },
    ).lean();
    if (!badge) throw notFound('Badge not found');
    res.json({ badge });
  }),
);

adminRouter.delete(
  '/badges/:id',
  validate({ params: idParams }),
  route(async (req, res) => {
    const badge = await Badge.findById(routeParamId(req)).lean<{ _id: Types.ObjectId; key: string } | null>();
    if (!badge) throw notFound('Badge not found');

    await Badge.deleteOne({ _id: badge._id });
    // A removed badge must not linger on learner profiles as a dangling key: one updateMany pulls
    // it from every user's `badges` array.
    await User.updateMany({ 'badges.key': badge.key }, { $pull: { badges: { key: badge.key } } });

    res.status(204).end();
  }),
);
