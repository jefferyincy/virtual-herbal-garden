/**
 * Quiz routes: the family-grouped catalogue, the served quiz, server-side grading and the
 * caller's own attempt history.
 *
 * Declares FULL paths (`/quizzes`, `/quizzes/:id`, ...) because the orchestrator mounts this
 * router at the api root.
 *
 * Grading is entirely server-side. The quiz document is the only source of `answerIndex`; a
 * client's `chosenIndex` is compared against it and never trusted for correctness. The served
 * question shape deliberately omits the answer and its explanation so they cannot be read before
 * a submission.
 */

import { Router, type Request } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { route } from '../lib/asyncRoute.ts';
import { badRequest, notFound, unauthorized } from '../lib/http.ts';
import { paginated, pagination, searchFilter } from '../lib/query.ts';
import { optionalAuth, requireAuth } from '../middleware/auth.ts';
import { validate } from '../middleware/validate.ts';
import { Attempt, Lesson, Progress, QUIZ_DIFFICULTIES, Quiz } from '../models/index.ts';
import { awardBadgesIfEarned, awardXp, QUIZ_PASS_RATIO } from '../services/award.ts';
import type { XpEvent } from '../services/xp.ts';

export const quizzesRouter: Router = Router();

const OBJECT_ID = /^[0-9a-f]{24}$/i;

/** Lessons a learner must complete before an untouched quiz unlocks (the mockup's "PASS 3 LESSONS TO UNLOCK"). */
const UNLOCK_LESSON_TARGET = 3;

/**
 * Client-supplied timing is advisory: the server never observed the clock, so a submitted
 * `secondsTaken` cannot be verified. This grace absorbs the round trip, a paused tab and clock
 * skew before an over-limit attempt is rejected.
 */
const TIMER_GRACE_SEC = 15;

type LeanQuizQuestion = {
  _id: Types.ObjectId;
  stem: string;
  options: string[];
  answerIndex: number;
  explanation?: string | null;
  plantId?: Types.ObjectId | null;
};

type LeanQuiz = {
  _id: Types.ObjectId;
  family: string;
  title: string;
  difficulty: string;
  plantIds?: Types.ObjectId[];
  timeLimitSec?: number | null;
  questions: LeanQuizQuestion[];
  published?: boolean;
};

/** One `$group` row: how well and how often the caller did on a single quiz. */
type AttemptAggRow = { _id: Types.ObjectId; bestRatio: number | null; attempts: number };

function callerOf(req: Request): { id: string; role: string } {
  const user = req.user;
  if (!user) throw unauthorized('Authentication required');
  return user;
}

/** A ratio in `0..1` shown as the whole percent the UI and the badge rules speak in. */
function percentFromRatio(ratio: number): number {
  return Math.round(ratio * 100);
}

/**
 * The learner's completed-lesson count, used by the quiz unlock rule.
 *
 * A lesson is completed through its plant's Progress row (`read: true`), and the seed creates
 * exactly one lesson per plant, so joining those rows back through `Lesson` counts lessons, not
 * plants. `award.ts`'s `buildLearnerStats` derives `lessonsCompleted` by the same join; the two
 * share this one home and must keep agreeing.
 */
export async function completedLessonCount(userId: string): Promise<number> {
  const readRows = await Progress.find({ userId, read: true })
    .select('plantId')
    .lean<Array<{ plantId: Types.ObjectId }>>();
  if (readRows.length === 0) return 0;

  const plantIds = [...new Set(readRows.map((row) => String(row.plantId)))];
  const lessonPlantIds = await Lesson.distinct('plantId', {
    plantId: { $in: plantIds.map((id) => new Types.ObjectId(id)) },
  });
  return lessonPlantIds.length;
}

/** Query params arrive as `''` when a form clears an input; treat that as "not set". */
function optionalEnum<T extends readonly [string, ...string[]]>(values: T) {
  return z.preprocess((value) => (value === '' ? undefined : value), z.enum(values).optional());
}

const listQuerySchema = z.object({
  family: z.string().optional(),
  difficulty: optionalEnum(QUIZ_DIFFICULTIES),
  q: z.string().optional(),
});

/**
 * Best ratio and attempt count per quiz for one caller, in a single aggregation. `$max` over
 * `score/total` gives the best-ever score; `$sum` over the group gives the attempt count, so the
 * list does not issue one query per quiz.
 */
async function attemptSummaryFor(
  userId: string,
  quizIds: Types.ObjectId[],
): Promise<Map<string, { bestRatio: number | null; attempts: number }>> {
  const summary = new Map<string, { bestRatio: number | null; attempts: number }>();
  if (quizIds.length === 0) return summary;

  const rows = await Attempt.aggregate<AttemptAggRow>([
    { $match: { userId: new Types.ObjectId(userId), quizId: { $in: quizIds } } },
    // A quiz with zero questions cannot occur (it would divide by zero); the guard keeps a
    // corrupt document from producing NaN instead of a score.
    {
      $group: {
        _id: '$quizId',
        bestRatio: {
          $max: { $cond: [{ $gt: ['$total', 0] }, { $divide: ['$score', '$total'] }, 0] },
        },
        attempts: { $sum: 1 },
      },
    },
  ]);

  for (const row of rows) {
    summary.set(String(row._id), { bestRatio: row.bestRatio, attempts: row.attempts });
  }
  return summary;
}

quizzesRouter.get(
  '/quizzes',
  optionalAuth,
  validate({ query: listQuerySchema }),
  route(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof listQuerySchema>;
    const callerId = req.user?.id ?? null;

    const filter: Record<string, unknown> = {
      published: true,
      ...searchFilter(query.q, ['title']),
    };
    if (query.family) filter.family = query.family;
    if (query.difficulty) filter.difficulty = query.difficulty;

    const quizzes = await Quiz.find(filter).sort({ family: 1, title: 1 }).lean<LeanQuiz[]>();

    // Authenticated callers get their best score and attempt count; an anonymous caller has
    // nothing to look up and every row reports the neutral defaults.
    const summaries = callerId
      ? await attemptSummaryFor(
          callerId,
          quizzes.map((quiz) => quiz._id),
        )
      : new Map<string, { bestRatio: number | null; attempts: number }>();

    const lessonsCompleted = callerId ? await completedLessonCount(callerId) : 0;

    const groups: Array<{ family: string; quizzes: Array<Record<string, unknown>> }> = [];
    const groupByFamily = new Map<string, Array<Record<string, unknown>>>();

    for (const quiz of quizzes) {
      const summary = summaries.get(String(quiz._id));
      const bestPct = summary?.bestRatio == null ? null : percentFromRatio(summary.bestRatio);
      const passed = summary?.bestRatio != null && summary.bestRatio >= QUIZ_PASS_RATIO;
      const attempts = summary?.attempts ?? 0;

      // Locked until three lessons are done, unless the caller has already tried it: an attempt
      // proves the quiz was reachable, so retries stay open even if the lesson count regresses.
      const locked = lessonsCompleted < UNLOCK_LESSON_TARGET && attempts === 0;

      const row: Record<string, unknown> = {
        _id: quiz._id,
        family: quiz.family,
        title: quiz.title,
        difficulty: quiz.difficulty,
        questionCount: quiz.questions.length,
        timeLimitSec: quiz.timeLimitSec ?? 0,
        plantIds: (quiz.plantIds ?? []).map((id) => String(id)),
        bestPct,
        passed,
        attempts,
        locked,
        unlockProgress: locked
          ? { lessonsNeeded: UNLOCK_LESSON_TARGET, lessonsCompleted }
          : null,
      };

      const bucket = groupByFamily.get(quiz.family);
      if (bucket) {
        bucket.push(row);
      } else {
        groupByFamily.set(quiz.family, [row]);
      }
    }

    for (const [family, familyQuizzes] of groupByFamily) {
      groups.push({ family, quizzes: familyQuizzes });
    }

    res.json({ groups });
  }),
);

quizzesRouter.get(
  '/quizzes/:id',
  optionalAuth,
  route(async (req, res) => {
    const identifier = req.params.id ?? '';
    if (!OBJECT_ID.test(identifier)) throw notFound('Quiz not found');

    const quiz = await Quiz.findOne({ _id: identifier, published: true }).lean<LeanQuiz | null>();
    if (!quiz) throw notFound('Quiz not found');

    let attempts = 0;
    let bestPct: number | null = null;
    if (req.user) {
      const summaries = await attemptSummaryFor(req.user.id, [quiz._id]);
      const summary = summaries.get(String(quiz._id));
      attempts = summary?.attempts ?? 0;
      bestPct = summary?.bestRatio == null ? null : percentFromRatio(summary.bestRatio);
    }

    res.json({
      quiz: {
        _id: quiz._id,
        family: quiz.family,
        title: quiz.title,
        difficulty: quiz.difficulty,
        timeLimitSec: quiz.timeLimitSec ?? 0,
        questionCount: quiz.questions.length,
      },
      // SECURITY: the served questions MUST NOT carry `answerIndex` or `explanation`. This
      // projection is the load-bearing line - if either field is spread in here, the answer key
      // is readable straight from the network response.
      questions: quiz.questions.map((question) => ({
        _id: question._id,
        stem: question.stem,
        options: question.options,
      })),
      attempts,
      bestPct,
    });
  }),
);

const attemptBodySchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().trim().min(1),
        chosenIndex: z.number().int().min(0),
      }),
    )
    .min(1, 'Submit at least one answer'),
  secondsTaken: z.number().min(0),
});

quizzesRouter.post(
  '/quizzes/:id/attempt',
  requireAuth,
  validate({ body: attemptBodySchema }),
  route(async (req, res) => {
    const caller = callerOf(req);
    const identifier = req.params.id ?? '';
    if (!OBJECT_ID.test(identifier)) throw notFound('Quiz not found');

    const quiz = await Quiz.findOne({ _id: identifier, published: true }).lean<LeanQuiz | null>();
    if (!quiz) throw notFound('Quiz not found');

    const { answers, secondsTaken } = req.body as z.infer<typeof attemptBodySchema>;

    if (quiz.questions.length === 0) throw badRequest('This quiz has no questions');

    // The stored question ids are the contract; a submission that does not name exactly them
    // (missing, unknown, or a different count) is rejected before anything is written, so a
    // forged set can never influence the score.
    const storedIds = quiz.questions.map((question) => String(question._id));
    const submittedIds = answers.map((answer) => answer.questionId);
    const storedSet = new Set(storedIds);
    const submittedSet = new Set(submittedIds);
    const unknown = [...new Set(submittedIds.filter((id) => !storedSet.has(id)))];
    const missing = storedIds.filter((id) => !submittedSet.has(id));

    if (answers.length !== storedIds.length || unknown.length > 0 || missing.length > 0) {
      const problems: string[] = [];
      if (missing.length > 0) problems.push(`${missing.length} missing (${missing.join(', ')})`);
      if (unknown.length > 0) problems.push(`${unknown.length} unknown (${unknown.join(', ')})`);
      if (answers.length !== storedIds.length) {
        problems.push(`${answers.length} received, expected ${storedIds.length}`);
      }
      throw badRequest(
        `This attempt does not match the quiz: ${problems.join('; ')}`,
        { missing, unknown, expected: storedIds.length, received: answers.length },
      );
    }

    const limit = quiz.timeLimitSec ?? 0;
    if (limit > 0 && secondsTaken > limit + TIMER_GRACE_SEC) {
      throw badRequest(
        `That attempt took ${Math.round(secondsTaken)}s, over the ${limit}s limit (plus ${TIMER_GRACE_SEC}s grace)`,
      );
    }

    const chosenByQuestionId = new Map(answers.map((answer) => [answer.questionId, answer.chosenIndex]));
    // Every stored question is graded against its own answer key; the client only ever supplies
    // the index it chose, never whether it was right.
    const results = quiz.questions.map((question) => {
      const chosenIndex = chosenByQuestionId.get(String(question._id)) ?? -1;
      return {
        questionId: question._id,
        chosenIndex,
        correct: chosenIndex === question.answerIndex,
        stem: question.stem,
        options: question.options,
        // Only reachable after submission: the result screen shows the key and its explanation.
        answerIndex: question.answerIndex,
        explanation: question.explanation ?? '',
      };
    });

    const score = results.filter((result) => result.correct).length;
    const total = quiz.questions.length;
    const scoreRatio = score / total;
    const passed = scoreRatio >= QUIZ_PASS_RATIO;
    const scorePct = percentFromRatio(scoreRatio);

    // One query for the caller's prior best on this quiz; it decides whether this pass is the
    // first (the first-pass bonus) and how a pass compares to their record.
    const [prior] = await Attempt.aggregate<{ bestRatio: number | null }>([
      { $match: { userId: new Types.ObjectId(caller.id), quizId: quiz._id } },
      { $group: { _id: null, bestRatio: { $max: { $cond: [{ $gt: ['$total', 0] }, { $divide: ['$score', '$total'] }, 0] } } } },
    ]);
    const previousBestPct = prior?.bestRatio == null ? null : percentFromRatio(prior.bestRatio);
    const firstPass = passed && previousBestPct === null;

    const event: XpEvent = {
      kind: 'quiz_attempt',
      quizId: String(quiz._id),
      correctCount: score,
      totalCount: total,
      passed,
      firstPass,
      previousBestPct,
      scorePct,
    };

    const award = await awardXp({ userId: caller.id, event });
    const badgesEarned = await awardBadgesIfEarned({ userId: caller.id, event });

    // A failed attempt is still recorded, with `xpAwarded: 0`, because the history screen and
    // the unlock rule both read attempts regardless of outcome.
    const attempt = await Attempt.create({
      userId: caller.id,
      quizId: quiz._id,
      score,
      total,
      answers: results.map((result) => ({
        questionId: result.questionId,
        chosenIndex: result.chosenIndex,
        correct: result.correct,
      })),
      secondsTaken,
      xpAwarded: award.xpAwarded,
    });

    res.status(201).json({
      attempt: {
        _id: attempt._id,
        quizId: attempt.quizId,
        score: attempt.score,
        total: attempt.total,
        secondsTaken: attempt.secondsTaken,
        xpAwarded: attempt.xpAwarded,
        createdAt: attempt.createdAt,
      },
      // Answers and explanations appear here and ONLY here, after the submission has been
      // graded: the result screen shows them, so this ordering is what makes the serve route's
      // strip meaningful.
      results,
      passed,
      level: award.level,
      levelUp: award.levelUp,
      badgesEarned,
    });
  }),
);

const attemptPageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).optional(),
});

type AttemptRecord = {
  _id: Types.ObjectId;
  score: number;
  total: number;
  secondsTaken?: number | null;
  xpAwarded?: number | null;
  createdAt: Date;
};

quizzesRouter.get(
  '/quizzes/:id/attempts',
  requireAuth,
  validate({ query: attemptPageQuerySchema }),
  route(async (req, res) => {
    const caller = callerOf(req);
    const identifier = req.params.id ?? '';
    if (!OBJECT_ID.test(identifier)) throw notFound('Quiz not found');

    const quiz = await Quiz.findById(identifier)
      .select('_id')
      .lean<{ _id: Types.ObjectId } | null>();
    if (!quiz) throw notFound('Quiz not found');

    const window = pagination(req.query as unknown as z.infer<typeof attemptPageQuerySchema>);

    // The caller's own attempts only, newest first (the index is exactly this key).
    const [attempts, total] = await Promise.all([
      Attempt.find({ userId: caller.id, quizId: quiz._id })
        .sort({ createdAt: -1 })
        .skip(window.skip)
        .limit(window.limit)
        .lean<AttemptRecord[]>(),
      Attempt.countDocuments({ userId: caller.id, quizId: quiz._id }),
    ]);

    const items = attempts.map((attempt) => ({
      _id: attempt._id,
      score: attempt.score,
      total: attempt.total,
      secondsTaken: attempt.secondsTaken ?? 0,
      xpAwarded: attempt.xpAwarded ?? 0,
      createdAt: attempt.createdAt,
    }));

    // Best score across the whole history, not just this page, so the summary is stable while
    // the learner pages through attempts.
    const [best] = await Attempt.aggregate<{ bestRatio: number | null }>([
      { $match: { userId: new Types.ObjectId(caller.id), quizId: quiz._id } },
      { $group: { _id: null, bestRatio: { $max: { $cond: [{ $gt: ['$total', 0] }, { $divide: ['$score', '$total'] }, 0] } } } },
    ]);
    const bestRatio = best?.bestRatio ?? null;

    res.json({
      ...paginated(items, total, window.page, window.pageSize),
      bestPct: bestRatio === null ? null : percentFromRatio(bestRatio),
      // Compared on the ratio, not the rounded percent: 69.5% rounds to 70 and must not pass.
      passed: bestRatio !== null && bestRatio >= QUIZ_PASS_RATIO,
    });
  }),
);
