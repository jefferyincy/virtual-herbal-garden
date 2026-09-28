/**
 * Shared enum vocabulary for schemas, route validators and services. Values mirror
 * `client/src/types/api.ts` byte for byte; every tuple is `as const` so the derived
 * unions stay literal instead of collapsing to `string`.
 */

export const PLANT_PARTS = [
  'leaf',
  'root',
  'stem',
  'bark',
  'flower',
  'fruit',
  'seed',
  'rhizome',
  'whole_plant',
  'resin',
  'latex',
] as const;
export type PlantPart = (typeof PLANT_PARTS)[number];

export const PREPARATIONS = [
  'decoction',
  'infusion',
  'powder',
  'paste',
  'oil',
  'juice',
  'fomentation',
  'decoction_oil',
  'fresh',
] as const;
export type Preparation = (typeof PREPARATIONS)[number];

export const MEDICAL_SYSTEMS = ['ayurveda', 'siddha', 'unani', 'western'] as const;
export type MedicalSystem = (typeof MEDICAL_SYSTEMS)[number];

export const TOXICITY_LEVELS = ['none', 'low', 'high'] as const;
export type Toxicity = (typeof TOXICITY_LEVELS)[number];

export const USER_ROLES = ['student', 'expert', 'admin'] as const;
export type Role = (typeof USER_ROLES)[number];

export const EXPERIENCE_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export type Experience = (typeof EXPERIENCE_LEVELS)[number];

export const AILMENT_SYSTEMS = ['digestive', 'respiratory', 'skin', 'nervous', 'immune', 'other'] as const;
export type AilmentSystem = (typeof AILMENT_SYSTEMS)[number];

export const QUIZ_DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type QuizDifficulty = (typeof QUIZ_DIFFICULTIES)[number];

export const POST_TYPES = ['remedy', 'question', 'note'] as const;
export type PostType = (typeof POST_TYPES)[number];

export const POST_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const PLOT_STAGES = ['seedling', 'growing', 'mature', 'flowering'] as const;
export type PlotStage = (typeof PLOT_STAGES)[number];

export const SRS_RATINGS = ['again', 'hard', 'good', 'easy'] as const;
export type SrsRating = (typeof SRS_RATINGS)[number];

export const NOTIFICATION_TYPES = ['badge', 'reply', 'streak', 'moderation', 'system'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Criteria vocabulary the XP/badge service evaluates against a learner's stats. */
export const BADGE_ACTIONS = [
  'read_plant',
  'complete_lesson',
  'complete_quiz',
  'quiz_pass_rate',
  'earn_badge',
  'streak_days',
  'read_plant_family',
  'contribute_post',
  'follow_plant',
] as const;
export type BadgeAction = (typeof BADGE_ACTIONS)[number];
