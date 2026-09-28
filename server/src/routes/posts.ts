/**
 * Community routes: the post feed, a single post with its whole thread, upvotes, moderation and
 * the public learner profile.
 *
 * Mounted at the API root by the orchestrator, so every path here is absolute: `/posts`,
 * `/posts/:id/upvote`, `/comments/:id/upvote`, `/users/:handle/profile`. One router serves all
 * three prefixes because a post, its votes and its profile share one visibility rule.
 *
 * Visibility contract (re-checked by every handler that reads a post):
 *   - an `approved` post is readable by anyone, including anonymous visitors;
 *   - the author may read their own post in any status;
 *   - experts and admins may read every post;
 *   - everyone else is told 404, never 403 - see `loadVisiblePost`.
 *
 * Projection contract: no row ever carries the raw `upvotes` array (only its length), another
 * user's `email`, or a `reviewerId`. Moderation notes are the one field decided per caller.
 */

import { Router, type Request } from 'express';
import { Types, type Model, type UpdateWithAggregationPipeline } from 'mongoose';
import { z } from 'zod';
import { route } from '../lib/asyncRoute.ts';
import { badRequest, notFound, unauthorized } from '../lib/http.ts';
import { paginated, pagination, type PageWindow } from '../lib/query.ts';
import { optionalAuth, requireAuth, requireRole } from '../middleware/auth.ts';
import { writeLimiter } from '../middleware/rateLimit.ts';
import { validate } from '../middleware/validate.ts';
import {
  Badge,
  Comment,
  Garden,
  POST_STATUSES,
  POST_TYPES,
  Plant,
  Post,
  Progress,
  User,
  type PostStatus,
  type PostType,
  type NotificationType,
} from '../models/index.ts';
import { awardBadgesIfEarned, awardXp } from '../services/award.ts';
// `notify` is the inbox's own write path and lives with the inbox route it serves.
import { notify } from './notifications.ts';

export const postsRouter: Router = Router();

const OBJECT_ID = /^[0-9a-f]{24}$/i;

/** How many contributions the profile rail shows before it stops. */
const RECENT_POST_LIMIT = 5;

type Role = 'student' | 'expert' | 'admin';
type Caller = { id: string; role: Role };
type ViewingCaller = Caller | null;

type PostRecord = {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  type: PostType;
  title: string;
  body: string;
  plantIds: Types.ObjectId[];
  sources: string[];
  status: PostStatus;
  // Optional because mongoose types a nullable path as possibly absent on a hydrated document;
  // the documents written by these routes always set it.
  reviewerId?: Types.ObjectId | null;
  reviewerNote?: string | null;
  // Required, unlike the nullable paths above: the schema gives every post a `default: []`, so a
  // stored post always has an array and the count needs no null branch.
  upvotes: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
};

type CommentRecord = {
  _id: Types.ObjectId;
  postId: Types.ObjectId;
  userId: Types.ObjectId;
  body: string;
  upvotes: Types.ObjectId[];
  markedUseful: boolean;
  // Optional for the same reason as `PostRecord.reviewerId`: a hydrated document types a nullable
  // path as possibly absent, while the write path always stores the key.
  parentId?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
};

type UserRecord = {
  _id: Types.ObjectId;
  name: string;
  handle: string;
  bio: string | null;
  level: number;
  xp: number;
  streak?: { current?: number } | null;
  badges?: Array<{ key: string; earnedAt: Date }> | null;
  createdAt: Date;
};

type GardenRecord = {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  isPublic: boolean;
  plots: unknown[];
  lastVisitedAt: Date | null;
  createdAt: Date;
};

type BadgeRecord = {
  _id: Types.ObjectId;
  key: string;
  name: string;
  description: string | null;
  icon: string | null;
  xpReward: number;
};

/** Public identity of an author or reviewer. `email` is deliberately absent. */
type AuthorView = {
  _id: Types.ObjectId;
  name: string;
  handle: string;
  role: Role;
  level: number;
};

/** Plant fields a feed card renders; the detail view adds `toxicity` via `PLANT_TAG_FIELDS`. */
const PLANT_CARD_FIELDS = 'slug commonName botanicalName images';
const PLANT_TAG_FIELDS = `${PLANT_CARD_FIELDS} toxicity`;

type PlantView = {
  _id: Types.ObjectId;
  slug: string;
  commonName: string;
  botanicalName: string;
  images?: Array<{ url?: string; alt?: string; credit?: string }> | null;
  toxicity?: string;
};

type PostRow = {
  _id: Types.ObjectId;
  type: PostType;
  title: string;
  body: string;
  plantIds: PlantView[];
  sources: string[];
  status: PostStatus;
  upvoteCount: number;
  commentCount: number;
  expertApproved: boolean;
  author: AuthorView | null;
  createdAt: Date;
  // The shared client contract (`Post` in client/src/types/api.ts) requires `updatedAt` on every
  // post row, so the feed and detail send it; nothing private rides along with it.
  updatedAt: Date;
};

type CommentRow = {
  _id: Types.ObjectId;
  postId: Types.ObjectId;
  body: string;
  upvoteCount: number;
  markedUseful: boolean;
  parentId: Types.ObjectId | null;
  author: AuthorView | null;
  createdAt: Date;
  updatedAt: Date;
};

type BadgeRow = {
  key: string;
  name: string;
  description: string;
  icon: string;
  xpReward: number;
  earnedAt: Date | null;
};

type PublicGardenRow = {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  plantCount: number;
  lastVisitedAt: Date | null;
  createdAt: Date;
};

type NotifyPayload = {
  type: NotificationType;
  title: string;
  body: string;
  href?: string;
  badgeKey?: string;
};

/** `requireAuth` ran, so this cannot be reachable with an anonymous request. */
function callerOf(req: Request): Caller {
  const user = req.user;
  if (!user) throw unauthorized('Authentication required');
  return user;
}

/** `$or` of [id, slug] so a filter accepts whichever identifier the client holds. */
function plantIdentifierFilter(identifier: string): Record<string, unknown>[] {
  const conditions: Record<string, unknown>[] = [];
  if (OBJECT_ID.test(identifier)) conditions.push({ _id: new Types.ObjectId(identifier) });
  conditions.push({ slug: identifier.toLowerCase() });
  return conditions;
}

/** Query params arrive as `''` when a form clears an input; treat that as "not set". */
function optionalEnum<T extends readonly [string, ...string[]]>(values: T) {
  const schema = z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.enum(values).optional(),
  );
  return schema;
}

/** One-line preview for a notification body: the inbox is not a second copy of the post. */
function excerpt(value: string, max: number): string {
  const flat = value.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 3)}...`;
}

/**
 * Whether this viewer may read this post. Anonymous callers only ever see approved posts.
 */
function canReadPost(post: PostRecord, viewer: ViewingCaller): boolean {
  if (post.status === 'approved') return true;
  if (viewer === null) return false;
  if (String(post.userId) === viewer.id) return true;
  if (viewer.role === 'expert') return true;
  return viewer.role === 'admin';
}

/**
 * Load a post the caller is allowed to read, or 404.
 *
 * A post that exists but is not readable answers 404 and never 403: a 403 would confirm to a
 * stranger that a pending post with this id exists, which is exactly what "pending posts are
 * private" is meant to prevent.
 */
async function loadVisiblePost(identifier: string, viewer: ViewingCaller): Promise<PostRecord> {
  // The route's params schema already rejected anything that is not a 24-character id, so
  // `findById` cannot be handed a value mongoose would fail to cast.
  const post = await Post.findById(identifier).lean<PostRecord | null>();
  if (!post || !canReadPost(post, viewer)) throw notFound('Post not found');
  return post;
}

/**
 * Fan one notification out to its recipients. The actor is skipped everywhere: whoever commented,
 * replied or moderated is not told about their own action. Duplicate recipients are dropped so a
 * reply addressed to both the post's author and the parent's author still writes one row.
 */
async function notifyUsers(
  recipientIds: string[],
  payload: NotifyPayload,
  actorId: string,
): Promise<void> {
  const seen = new Set<string>([actorId]);
  for (const id of recipientIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    await notify(id, payload);
  }
}

/**
 * Turn a page of post documents into the wire shape.
 *
 * Three lookups cover the whole page, never one per row: the tagged plants, the authors and the
 * reviewer roles (ONE query, because a row needs the author's public fields and the reviewer's
 * role for `expertApproved`), and the comment counts (ONE aggregation grouped by postId).
 * `upvotes` is reduced to a count here - the array itself and `reviewerId` never leave the API.
 */
async function buildPostRows(
  posts: PostRecord[],
  plantFields: string = PLANT_CARD_FIELDS,
): Promise<PostRow[]> {
  if (posts.length === 0) return [];

  const postIds: Types.ObjectId[] = [];
  const plantIds = new Set<string>();
  const userIds = new Set<string>();
  for (const post of posts) {
    postIds.push(post._id);
    for (const id of post.plantIds) plantIds.add(String(id));
    userIds.add(String(post.userId));
    if (post.reviewerId) userIds.add(String(post.reviewerId));
  }

  const [plants, users, commentCounts] = await Promise.all([
    Plant.find({ _id: { $in: [...plantIds] } })
      .select(plantFields)
      .lean<PlantView[]>(),
    // Authors and reviewers come from the same projection, so two ids per row still cost one
    // query. `email` is not selected, so it cannot be leaked by a row builder.
    User.find({ _id: { $in: [...userIds] } })
      .select('name handle role level')
      .lean<AuthorView[]>(),
    // commentCount must be a REAL count of the Comment collection. One grouped aggregation over
    // the page's post ids replaces one countDocuments per row (N+1 queries for a 50 row page).
    Comment.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { postId: { $in: postIds } } },
      { $group: { _id: '$postId', count: { $sum: 1 } } },
    ]),
  ]);

  const plantById = new Map(plants.map((plant) => [String(plant._id), plant]));
  const userById = new Map(users.map((user) => [String(user._id), user]));
  const commentsPerPost = new Map(commentCounts.map((row) => [String(row._id), row.count]));

  return posts.map((post) => {
    const tags: PlantView[] = [];
    for (const id of post.plantIds) {
      const plant = plantById.get(String(id));
      // A plant deleted after the post was written is dropped rather than invented.
      if (plant) tags.push(plant);
    }

    const author = userById.get(String(post.userId)) ?? null;
    const reviewer = post.reviewerId ? userById.get(String(post.reviewerId)) : undefined;
    // `expertApproved` = approved by someone whose role is expert or admin. The role is resolved
    // from the reviewer's current account (one lookup shared with the author fields above), since
    // the post only records who reviewed it, not what they were at the time.
    const approvedByExpert = reviewer?.role === 'expert' || reviewer?.role === 'admin';

    return {
      _id: post._id,
      type: post.type,
      title: post.title,
      body: post.body,
      plantIds: tags,
      sources: post.sources,
      status: post.status,
      upvoteCount: post.upvotes.length,
      commentCount: commentsPerPost.get(String(post._id)) ?? 0,
      expertApproved: post.status === 'approved' && approvedByExpert,
      author,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
    };
  });
}

/** Single-document form of `buildPostRows`; used by the handlers that answer with one post. */
async function buildOnePostRow(post: PostRecord, plantFields?: string): Promise<PostRow> {
  const rows = await buildPostRows([post], plantFields);
  const row = rows[0];
  if (!row) throw notFound('Post not found');
  return row;
}

/**
 * Every comment of the given posts, oldest first (newest last, as the thread renders them), with
 * the author attached. One query for the comments plus one for their authors.
 */
async function loadCommentRows(postIds: Types.ObjectId[]): Promise<CommentRow[]> {
  if (postIds.length === 0) return [];

  const comments = await Comment.find({ postId: { $in: postIds } })
    .sort({ createdAt: 1, _id: 1 })
    .lean<CommentRecord[]>();

  return toCommentRows(comments);
}

/**
 * Project comments onto the wire shape with their authors attached in ONE query. Rows are built in
 * input order, so the caller decides the ordering.
 */
async function toCommentRows(comments: CommentRecord[]): Promise<CommentRow[]> {
  if (comments.length === 0) return [];

  const authorIds = [...new Set(comments.map((comment) => String(comment.userId)))];
  const authors = await User.find({ _id: { $in: authorIds } })
    .select('name handle role level')
    .lean<AuthorView[]>();
  const authorById = new Map(authors.map((author) => [String(author._id), author]));

  return comments.map((comment) => ({
    _id: comment._id,
    postId: comment.postId,
    body: comment.body,
    upvoteCount: comment.upvotes.length,
    markedUseful: comment.markedUseful,
    parentId: comment.parentId ?? null,
    author: authorById.get(String(comment.userId)) ?? null,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
  }));
}

/**
 * Single-comment form of `toCommentRows`, for the 201 answer of a new comment: the author is
 * looked up for that one row instead of the whole thread.
 */
async function buildOneCommentRow(comment: CommentRecord): Promise<CommentRow> {
  const rows = await toCommentRows([comment]);
  const row = rows[0];
  if (!row) throw notFound('Comment not found');
  return row;
}

/**
 * `sort=new`: newest first. `_id` is the tiebreak so two posts created in the same millisecond
 * keep a stable order across pages.
 */
async function newestPostPage(
  filter: Record<string, unknown>,
  window: PageWindow,
): Promise<PostRecord[]> {
  return Post.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .skip(window.skip)
    .limit(window.limit)
    .lean<PostRecord[]>();
}

/**
 * `sort=top`: most upvoted first, then newest.
 *
 * `upvotes` is a document array, so `$size` cannot be used in a plain `find` sort - a sort key
 * must be a stored field, and there is no expression phase in `find`. The count is therefore
 * materialised with `$addFields` inside an aggregation and sorted on that.
 */
async function topPostPage(
  filter: Record<string, unknown>,
  window: PageWindow,
): Promise<PostRecord[]> {
  return Post.aggregate<PostRecord>([
    { $match: filter },
    { $addFields: { upvoteCount: { $size: '$upvotes' } } },
    { $sort: { upvoteCount: -1, createdAt: -1, _id: -1 } },
    { $skip: window.skip },
    { $limit: window.limit },
  ]);
}

const objectIdString = z.string().trim().regex(OBJECT_ID, 'Expected a 24 character id');

const listQuerySchema = z.object({
  type: optionalEnum(POST_TYPES),
  status: optionalEnum(POST_STATUSES),
  plantId: z.string().trim().min(1).optional(),
  author: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).optional(),
  sort: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.enum(['new', 'top']).default('new'),
  ),
});

type ListQuery = z.infer<typeof listQuerySchema>;

const postParamsSchema = z.object({ id: objectIdString });
const commentParamsSchema = z.object({ id: objectIdString });
const profileParamsSchema = z.object({ handle: z.string().trim().min(1).max(60) });

postsRouter.get(
  '/posts',
  optionalAuth,
  validate({ query: listQuerySchema }),
  route(async (req, res) => {
    const query = req.query as unknown as ListQuery;
    const window = pagination(query);
    const viewer: ViewingCaller = req.user ?? null;

    const filter: Record<string, unknown> = {};
    if (query.type) filter.type = query.type;

    // --- STATUS VISIBILITY ---------------------------------------------------------------
    // The public feed is `approved` only. Three cases widen that, in this order:
    //   1. `?author=<own handle>`  - the caller's own listing, in any status (their pending and
    //      rejected posts are theirs to see);
    //   2. a moderator (`expert`/`admin`) - sees every status by default (this is the moderation
    //      surface, which is also the only caller that may widen), and may narrow with `?status=`;
    //      this holds with an `?author=` filter too, because the moderation queue filters by
    //      submitter;
    //   3. anything else - forced to `approved`, including an explicit `?status=pending` request
    //      from a plain user, which is clamped rather than rejected so the response cannot be used
    //      to probe which statuses exist.
    const isModerator = viewer !== null && (viewer.role === 'expert' || viewer.role === 'admin');
    let statusFilter: PostStatus | undefined;

    if (query.author) {
      const authorUser = await User.findOne({ handle: query.author.toLowerCase() })
        .select('_id')
        .lean<{ _id: Types.ObjectId } | null>();

      // An unknown handle is an empty page, not a 404: the client links profiles by handle and a
      // deleted account must not turn the feed into an error page.
      if (!authorUser) {
        res.json(paginated<PostRow>([], 0, window.page, window.pageSize));
        return;
      }

      filter.userId = authorUser._id;
      const isOwnListing = viewer !== null && String(authorUser._id) === viewer.id;
      if (isOwnListing || isModerator) statusFilter = query.status;
      else statusFilter = 'approved';
    } else if (isModerator) {
      statusFilter = query.status;
    } else {
      statusFilter = 'approved';
    }
    if (statusFilter !== undefined) filter.status = statusFilter;

    if (query.plantId) {
      const plant = await Plant.findOne({ $or: plantIdentifierFilter(query.plantId) })
        .select('_id')
        .lean<{ _id: Types.ObjectId } | null>();
      if (!plant) {
        res.json(paginated<PostRow>([], 0, window.page, window.pageSize));
        return;
      }
      filter.plantIds = plant._id;
    }

    const [total, posts] = await Promise.all([
      Post.countDocuments(filter),
      query.sort === 'top' ? topPostPage(filter, window) : newestPostPage(filter, window),
    ]);

    const items = await buildPostRows(posts);
    res.json(paginated(items, total, window.page, window.pageSize));
  }),
);

postsRouter.get(
  '/posts/:id',
  optionalAuth,
  validate({ params: postParamsSchema }),
  route(async (req, res) => {
    const { id } = req.params as z.infer<typeof postParamsSchema>;
    const viewer: ViewingCaller = req.user ?? null;
    const post = await loadVisiblePost(id, viewer);

    const isAuthor = viewer !== null && String(post.userId) === viewer.id;
    const canModerate =
      viewer !== null && (viewer.role === 'expert' || viewer.role === 'admin');

    const row = await buildOnePostRow(post, PLANT_TAG_FIELDS);
    const comments = await loadCommentRows([post._id]);

    // The reviewer note is private moderation feedback: it is sent only to the author and to
    // moderators, and is omitted from the payload (not nulled) for everyone else so a client
    // cannot mistake "not allowed" for "no note was left".
    const detail: Record<string, unknown> = { ...row };
    if (isAuthor || canModerate) detail.reviewerNote = post.reviewerNote ?? null;

    // The thread ships with the post so the post view needs exactly one request.
    res.json({ post: detail, comments, canModerate });
  }),
);

/**
 * Resolve every plant tag by ObjectId or slug in ONE query. An unknown tag is a 400 that names it,
 * rather than a silently dropped tag on a saved post.
 */
async function resolvePlantTags(tags: string[]): Promise<Types.ObjectId[]> {
  if (tags.length === 0) return [];

  const ids: Types.ObjectId[] = [];
  const slugs: string[] = [];
  for (const tag of tags) {
    if (OBJECT_ID.test(tag)) ids.push(new Types.ObjectId(tag));
    else slugs.push(tag.toLowerCase());
  }

  const conditions: Record<string, unknown>[] = [];
  if (ids.length > 0) conditions.push({ _id: { $in: ids } });
  if (slugs.length > 0) conditions.push({ slug: { $in: slugs } });

  const plants = await Plant.find({ $or: conditions })
    .select('_id slug')
    .lean<Array<{ _id: Types.ObjectId; slug: string }>>();

  // Two indexes, because a slug has to resolve to the plant's own `_id`: the tag the client sent
  // is not an ObjectId, so the id cannot be rebuilt from it.
  const idByPlantId = new Map(plants.map((plant) => [String(plant._id), plant._id]));
  const idBySlug = new Map(plants.map((plant) => [plant.slug, plant._id]));

  const resolved: Types.ObjectId[] = [];
  const unknown: string[] = [];
  for (const tag of tags) {
    const match = OBJECT_ID.test(tag)
      ? idByPlantId.get(tag.toLowerCase())
      : idBySlug.get(tag.toLowerCase());
    if (match) resolved.push(match);
    else unknown.push(tag);
  }

  if (unknown.length > 0) throw badRequest(`Unknown plant: ${unknown.join(', ')}`);
  // The same plant sent twice (once by slug, once by id) is stored once: the tag list is a set of
  // references, not an ordered list where repetition could mean anything.
  return [...new Map(resolved.map((id) => [String(id), id])).values()];
}

const createPostSchema = z
  .object({
    type: z.enum(POST_TYPES),
    title: z.string().trim().min(4, 'Give the post a title').max(160),
    body: z.string().trim().min(20, 'Write at least 20 characters').max(8000),
    plantIds: z.array(z.string().trim().min(1)).max(5, 'Tag at most 5 plants').optional(),
    // A cap, not a product rule: it keeps one request from storing an unbounded array.
    sources: z.array(z.string().trim().url('Each source must be a URL')).max(20).optional(),
  })
  .refine((value) => value.type !== 'remedy' || (value.sources?.length ?? 0) > 0, {
    // The create-post form marks sources required for a remedy; the server enforces the same rule
    // the Post model does, with the helper text the form shows.
    message: 'Remedies must cite at least one source',
    path: ['sources'],
  });

postsRouter.post(
  '/posts',
  requireAuth,
  writeLimiter,
  validate({ body: createPostSchema }),
  route(async (req, res) => {
    const caller = callerOf(req);
    const { type, title, body, plantIds, sources } = req.body as z.infer<typeof createPostSchema>;

    const resolvedTags = await resolvePlantTags(plantIds ?? []);

    const created = await Post.create({
      userId: caller.id,
      type,
      title,
      body,
      plantIds: resolvedTags,
      sources: sources ?? [],
      // Every post enters the moderation queue; nothing is published on submit.
      status: 'pending',
    });

    // One query for the reviewer ids, then one notification each. The actor is skipped, so an
    // admin who publishes a post is not pinged about their own submission.
    const admins = await User.find({ role: 'admin' })
      .select('_id')
      .lean<Array<{ _id: Types.ObjectId }>>();
    await notifyUsers(
      admins.map((admin) => String(admin._id)),
      {
        type: 'system',
        title: 'A post awaits review',
        body: excerpt(created.title, 140),
        href: '/admin/moderation',
      },
      caller.id,
    );

    const row = await buildOnePostRow(created, PLANT_TAG_FIELDS);
    res.status(201).json({ post: row });
  }),
);

type VotableRecord = { upvotes: Types.ObjectId[] };

/**
 * Add-or-remove one user's vote in a SINGLE atomic write.
 *
 * An update operator list is unconditional, so the branch `$addToSet`/`$pull` need cannot be
 * expressed that way in one round trip; asking the database first and then writing would leave a
 * window where two concurrent votes from the same user both read "not yet voted" and both add,
 * which is the double-vote this endpoint exists to prevent. An update pipeline does the branch
 * server side instead: `$setUnion` is `$addToSet`, `$setDifference` is `$pull`, and the whole
 * read-decide-write happens under one document lock.
 */
async function toggleUpvote<T extends VotableRecord>(
  model: Model<T>,
  documentId: Types.ObjectId,
  voterId: string,
): Promise<{ upvotes: Types.ObjectId[] }> {
  const voter = new Types.ObjectId(voterId);
  const pipeline: UpdateWithAggregationPipeline = [
    {
      $set: {
        upvotes: {
          $cond: [
            { $in: [voter, '$upvotes'] },
            { $setDifference: ['$upvotes', [voter]] },
            { $setUnion: [{ $ifNull: ['$upvotes', []] }, [voter]] },
          ],
        },
      },
    },
  ];

  const updated = await model
    .findOneAndUpdate({ _id: documentId }, pipeline, { new: true })
    .lean<T | null>();
  if (!updated) throw notFound('Post not found');
  return { upvotes: updated.upvotes };
}

/** The toggled state as the client reads it: a count, plus whether THIS caller is now in the list. */
function toUpvoteResult(document: { upvotes: Types.ObjectId[] }, voterId: string) {
  const upvoteCount = document.upvotes.length;
  const upvoted = document.upvotes.some((voter) => String(voter) === voterId);
  return { upvoteCount, upvoted };
}

postsRouter.post(
  '/posts/:id/upvote',
  requireAuth,
  validate({ params: postParamsSchema }),
  route(async (req, res) => {
    const caller = callerOf(req);
    const { id } = req.params as z.infer<typeof postParamsSchema>;
    const post = await loadVisiblePost(id, caller);

    if (String(post.userId) === caller.id) {
      throw badRequest('You cannot upvote your own post');
    }

    const updated = await toggleUpvote<PostRecord>(Post, post._id, caller.id);
    res.json(toUpvoteResult(updated, caller.id));
  }),
);

const createCommentSchema = z.object({
  body: z.string().trim().min(1, 'Write a comment').max(2000),
  // `nullish` rather than `optional`: a form that clears the reply target sends an explicit null,
  // and both spellings mean the same thing (a top-level comment).
  parentId: objectIdString.nullish(),
  // `markedUseful` is absent on purpose and zod strips unknown keys, so a request that tries to
  // send it is ignored: marking a comment useful is an expert/moderator action, not one the author
  // of a comment can grant themselves. Same for `upvotes` on both create routes.
});

postsRouter.post(
  '/posts/:id/comments',
  requireAuth,
  validate({ params: postParamsSchema, body: createCommentSchema }),
  route(async (req, res) => {
    const caller = callerOf(req);
    const { id } = req.params as z.infer<typeof postParamsSchema>;
    const { body, parentId } = req.body as z.infer<typeof createCommentSchema>;

    const post = await loadVisiblePost(id, caller);

    let parent: CommentRecord | null = null;
    if (parentId) {
      parent = await Comment.findById(parentId).lean<CommentRecord | null>();
      // A reply may only hang off a comment of THIS post. A foreign or missing parent is a 400
      // rather than a 404: the caller already proved they can read this post, so saying "that
      // comment is not here" leaks nothing and names the actual problem.
      if (!parent || String(parent.postId) !== String(post._id)) {
        throw badRequest('That comment belongs to a different post');
      }
    }

    const comment = await Comment.create({
      postId: post._id,
      userId: caller.id,
      body,
      parentId: parent?._id ?? null,
    });

    // The post's author hears about the comment and the parent comment's author hears about the
    // reply. The actor is skipped (a commenter is not told about their own comment) and a reply
    // that would notify the same person twice writes one row.
    const recipients = [String(post.userId)];
    if (parent) recipients.push(String(parent.userId));
    await notifyUsers(
      recipients,
      {
        type: 'reply',
        title: parent ? 'New reply to your comment' : 'New comment on your post',
        body: excerpt(comment.body, 140),
        href: `/community/${String(post._id)}`,
      },
      caller.id,
    );

    const row = await buildOneCommentRow(comment);
    res.status(201).json({ comment: row });
  }),
);

postsRouter.post(
  '/comments/:id/upvote',
  requireAuth,
  validate({ params: commentParamsSchema }),
  route(async (req, res) => {
    const caller = callerOf(req);
    const { id } = req.params as z.infer<typeof commentParamsSchema>;

    const comment = await Comment.findById(id).lean<CommentRecord | null>();
    if (!comment) throw notFound('Comment not found');
    // A comment is only as visible as the post under it, so the thread has to be readable too.
    await loadVisiblePost(String(comment.postId), caller);

    // The product rule "a user cannot upvote their own post" is applied to comments as well: a
    // comment is the same kind of contribution and self-voting it is the same self-promotion the
    // post rule forbids. The rest of the endpoint is identical to the post toggle.
    if (String(comment.userId) === caller.id) {
      throw badRequest('You cannot upvote your own comment');
    }

    const updated = await toggleUpvote<CommentRecord>(Comment, comment._id, caller.id);
    res.json(toUpvoteResult(updated, caller.id));
  }),
);

type ModerationAction = 'approve' | 'reject' | 'request_changes';

/**
 * Moderation state machine: `approve` -> approved, `reject` -> rejected, `request_changes` ->
 * pending (back into the queue, carrying the reviewer's note). Every action records both the
 * reviewer and the note.
 */
const NEXT_STATUS: Record<ModerationAction, PostStatus> = {
  approve: 'approved',
  reject: 'rejected',
  request_changes: 'pending',
};

const MODERATION_TITLE: Record<ModerationAction, string> = {
  approve: 'Your post was approved',
  reject: 'Your post was rejected',
  request_changes: 'Changes requested on your post',
};

const moderationSchema = z
  .object({
    action: z.enum(['approve', 'reject', 'request_changes']),
    note: z.string().trim().max(1000).optional(),
  })
  .refine((value) => value.action === 'approve' || (value.note?.length ?? 0) > 0, {
    message: 'A note is required when rejecting or requesting changes',
    path: ['note'],
  });

postsRouter.patch(
  '/posts/:id/moderate',
  requireAuth,
  requireRole('expert', 'admin'),
  validate({ params: postParamsSchema, body: moderationSchema }),
  route(async (req, res) => {
    const caller = callerOf(req);
    const { id } = req.params as z.infer<typeof postParamsSchema>;
    const { action, note } = req.body as z.infer<typeof moderationSchema>;
    const nextStatus = NEXT_STATUS[action];

    // `new: false` deliberately returns the document as it was BEFORE this update, and mongod
    // applies findOneAndUpdate atomically, so `previous.status` is the state this transition is
    // leaving. That makes the transition itself the idempotency guard for the award below.
    const previous = await Post.findOneAndUpdate(
      { _id: id },
      { $set: { status: nextStatus, reviewerId: caller.id, reviewerNote: note ?? null } },
      { new: false, runValidators: true },
    ).lean<PostRecord | null>();
    if (!previous) throw notFound('Post not found');

    // Award the contribution XP exactly once: only the transition INTO `approved` earns it. Of two
    // concurrent approves exactly one observes a non-approved pre-image and awards; a second
    // approve of an already-approved post -- or a re-approve after a request_changes round that
    // never left the approved state -- observes 'approved' and awards nothing. No extra
    // "awarded" flag is needed, which is what keeps the guard race-free.
    if (action === 'approve' && previous.status !== 'approved') {
      const event = { kind: 'contribute_post', postId: String(previous._id) } as const;
      await awardXp({ userId: String(previous.userId), event });
      await awardBadgesIfEarned({ userId: String(previous.userId), event });
    }

    // The author is told the outcome, including the reviewer's note. The note is sent verbatim
    // (already bounded at 1000 characters by the schema): it is the feedback the author has to act
    // on, so truncating it to a preview would be withholding the message. A moderator reviewing
    // their own post is not notified about themselves (notifyUsers skips the actor).
    await notifyUsers(
      [String(previous.userId)],
      {
        type: 'moderation',
        title: MODERATION_TITLE[action],
        body: note ?? `Your post is now ${nextStatus}.`,
        href: `/community/${String(previous._id)}`,
      },
      caller.id,
    );

    const updated = await Post.findById(previous._id).lean<PostRecord | null>();
    if (!updated) throw notFound('Post not found');

    const row = await buildOnePostRow(updated, PLANT_TAG_FIELDS);
    // The caller may moderate, so the note they just wrote is echoed back with the post.
    res.json({ post: { ...row, reviewerNote: updated.reviewerNote ?? null } });
  }),
);

postsRouter.get(
  '/users/:handle/profile',
  optionalAuth,
  validate({ params: profileParamsSchema }),
  route(async (req, res) => {
    const { handle } = req.params as z.infer<typeof profileParamsSchema>;
    const viewer: ViewingCaller = req.user ?? null;

    const user = await User.findOne({ handle: handle.toLowerCase() }).lean<UserRecord | null>();
    if (!user) throw notFound('No such learner');

    const isSelf = viewer !== null && String(user._id) === viewer.id;
    const badgeKeys = (user.badges ?? []).map((badge) => badge.key);

    // A visitor sees the learner's approved contributions only; the learner sees their own queue.
    const recentFilter: Record<string, unknown> = { userId: user._id };
    if (!isSelf) recentFilter.status = 'approved';

    const [plantsRead, approvedPosts, publicGardenDocs, badgeDocs, recentPostDocs] =
      await Promise.all([
        Progress.countDocuments({ userId: user._id, read: true }),
        Post.countDocuments({ userId: user._id, status: 'approved' }),
        Garden.find({ userId: user._id, isPublic: true })
          .sort({ createdAt: -1 })
          .lean<GardenRecord[]>(),
        // ONE query joins the earned keys to the Badge catalogue, so names and icons come from the
        // stored documents instead of a hardcoded table in the route. An empty key list is a `$in`
        // that matches nothing, so the no-badges case needs no special path.
        Badge.find({ key: { $in: badgeKeys } }).lean<BadgeRecord[]>(),
        Post.find(recentFilter)
          .sort({ createdAt: -1, _id: -1 })
          .limit(RECENT_POST_LIMIT)
          .lean<PostRecord[]>(),
      ]);

    const badgeByKey = new Map(badgeDocs.map((badge) => [badge.key, badge]));
    const badges: BadgeRow[] = [];
    for (const earned of user.badges ?? []) {
      const badge = badgeByKey.get(earned.key);
      // A key with no catalogue entry (a badge retired since it was earned) is skipped: inventing
      // a name for it would fabricate data.
      if (!badge) continue;
      badges.push({
        key: badge.key,
        name: badge.name,
        description: badge.description ?? '',
        icon: badge.icon ?? 'award',
        xpReward: badge.xpReward ?? 0,
        earnedAt: earned.earnedAt ?? null,
      });
    }

    const publicGardens: PublicGardenRow[] = publicGardenDocs.map((garden) => ({
      _id: garden._id,
      name: garden.name,
      slug: garden.slug,
      // The real plot count, not a stored counter that could drift.
      plantCount: garden.plots.length,
      lastVisitedAt: garden.lastVisitedAt ?? null,
      createdAt: garden.createdAt,
    }));

    const recentPosts = await buildPostRows(recentPostDocs);

    // Public identity only, and exactly the keys the profile screen declares. `email` is neither
    // selected above nor present in any row builder, so it cannot reach a profile response.
    res.json({
      user: {
        name: user.name,
        handle: user.handle,
        bio: user.bio ?? '',
        level: user.level,
        xp: user.xp,
        createdAt: user.createdAt,
      },
      stats: {
        badges: badgeKeys.length,
        plantsRead,
        streakDays: user.streak?.current ?? 0,
        posts: approvedPosts,
      },
      badges,
      publicGardens,
      recentPosts,
      isSelf,
    });
  }),
);
