/**
 * API contract types. Field names match the Mongo collections and JSON responses byte for byte
 * (build spec section 3-4). Every screen and hook types against this file.
 */

export type Role = 'student' | 'expert' | 'admin';
export type Experience = 'beginner' | 'intermediate' | 'advanced';
export type Toxicity = 'none' | 'low' | 'high';
export type PlantPart =
  | 'leaf'
  | 'root'
  | 'stem'
  | 'bark'
  | 'flower'
  | 'fruit'
  | 'seed'
  | 'rhizome'
  | 'whole_plant'
  | 'resin'
  | 'latex';
export type Preparation =
  | 'decoction'
  | 'infusion'
  | 'powder'
  | 'paste'
  | 'oil'
  | 'juice'
  | 'fomentation'
  | 'decoction_oil'
  | 'fresh';
export type MedicalSystem = 'ayurveda' | 'siddha' | 'unani' | 'western';

export interface SourceRef {
  label: string;
  url: string;
}

export interface PlantImage {
  url: string;
  alt: string;
  credit: string;
}

export interface LookAlike {
  plantId: string;
  note: string;
}

export interface Plant {
  _id: string;
  slug: string;
  commonName: string;
  botanicalName: string;
  family: string;
  partsUsed: PlantPart[];
  preparations: Preparation[];
  ailments: Array<Pick<Ailment, '_id' | 'name' | 'system'>> | string[];
  activeCompounds: string[];
  description: string;
  medicinalUses: string;
  /** null when no citable dosage figure exists. */
  dosage: string | null;
  contraindications: string | null;
  toxicity: Toxicity;
  lookAlikes: LookAlike[];
  region: string[];
  systemsMentioned: MedicalSystem[];
  images: PlantImage[];
  modelUrl: string | null;
  modelScale: number;
  tags: string[];
  sources: SourceRef[];
  verified: boolean;
  /** true when any field above is a placeholder awaiting a citable source. */
  unverified?: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Ailment {
  _id: string;
  slug: string;
  name: string;
  system: 'digestive' | 'respiratory' | 'skin' | 'nervous' | 'immune' | 'other';
  description: string;
}

export interface User {
  _id: string;
  name: string;
  email: string;
  role: Role;
  xp: number;
  level: number;
  streak: { current: number; longest: number; lastActiveAt: string | null };
  badges: Array<{ key: string; earnedAt: string }>;
  followedPlants: string[];
  interests: string[];
  experience: Experience;
  handle: string;
  bio: string;
  banned: boolean;
  createdAt: string;
}

/** Public-facing user shape (no email). */
export type PublicUser = Omit<User, 'email' | 'banned'>;

export interface AuthPayload {
  user: User;
  accessToken: string;
}

export interface Lesson {
  _id: string;
  plantId: string | null;
  slug: string;
  title: string;
  body: string;
  order: number;
  estMinutes: number;
  plant?: Plant;
}

export interface QuizQuestion {
  _id: string;
  stem: string;
  options: string[];
  answerIndex: number;
  explanation: string;
  plantId: string | null;
}

export interface Quiz {
  _id: string;
  family: string;
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  plantIds: string[];
  timeLimitSec: number;
  questions: QuizQuestion[];
  published: boolean;
}

/** Quiz served to a learner: answers and explanations stripped. */
export interface QuizServed extends Omit<Quiz, 'questions'> {
  questions: Array<Omit<QuizQuestion, 'answerIndex' | 'explanation'>>;
  questionCount: number;
}

export interface AttemptAnswer {
  questionId: string;
  chosenIndex: number;
  correct: boolean;
}

export interface Attempt {
  _id: string;
  userId: string;
  quizId: string | Pick<Quiz, '_id' | 'title' | 'family' | 'difficulty'>;
  score: number;
  total: number;
  answers: AttemptAnswer[];
  secondsTaken: number;
  xpAwarded: number;
  createdAt: string;
  /** Present on the result screen. */
  results?: Array<AttemptAnswer & { stem: string; options: string[]; answerIndex: number; explanation: string }>;
}

export interface SrsState {
  ease: number;
  intervalDays: number;
  dueAt: string;
  reps: number;
  lapses: number;
}

export interface Progress {
  _id: string;
  userId: string;
  plantId: string | Plant;
  read: boolean;
  mastery: number;
  srs: SrsState;
  updatedAt: string;
}

export interface DueCard {
  plantId: string;
  plant: Pick<Plant, '_id' | 'slug' | 'commonName' | 'botanicalName' | 'family' | 'partsUsed' | 'images'>;
  srs: SrsState;
  mastery: number;
  question: string;
}

export type SrsRating = 'again' | 'hard' | 'good' | 'easy';

export interface GradeResult {
  srs: SrsState;
  mastery: number;
  intervalLabel: string;
  xpAwarded: number;
}

export interface LeaderboardRow {
  rank: number;
  user: Pick<PublicUser, '_id' | 'name' | 'handle' | 'level' | 'xp'> & { avatarSeed?: string };
  isCurrentUser: boolean;
}

export interface Badge {
  _id: string;
  key: string;
  name: string;
  description: string;
  criteria: { action: string; target: number; param?: string };
  xpReward: number;
  icon: string;
  earnedBy?: number;
}

export interface GardenPlot {
  _id: string;
  x: number;
  z: number;
  plantId: string | Pick<Plant, '_id' | 'slug' | 'commonName' | 'botanicalName'>;
  plantedAt: string;
  stage: 'seedling' | 'growing' | 'mature' | 'flowering';
}

export interface Garden {
  _id: string;
  userId: string | Pick<PublicUser, '_id' | 'name' | 'handle'>;
  name: string;
  slug: string;
  isPublic: boolean;
  plots: GardenPlot[];
  lastVisitedAt: string | null;
  createdAt: string;
}

export interface GardenSettings {
  timeOfDay: number;
  season: 'spring' | 'summer' | 'monsoon' | 'winter';
  weather: 'clear' | 'rain' | 'mist';
  quality: 'low' | 'medium' | 'high';
  shadows: boolean;
  ambientAudio: boolean;
  volume: number;
}

export type PostType = 'remedy' | 'question' | 'note';
export type PostStatus = 'pending' | 'approved' | 'rejected';

export interface Post {
  _id: string;
  userId: Pick<PublicUser, '_id' | 'name' | 'handle' | 'role' | 'level'>;
  type: PostType;
  title: string;
  body: string;
  plantIds: Array<Pick<Plant, '_id' | 'slug' | 'commonName' | 'botanicalName' | 'images'>>;
  sources: string[];
  status: PostStatus;
  reviewerId: string | null;
  reviewerNote: string | null;
  upvotes: string[];
  upvoteCount: number;
  commentCount: number;
  expertApproved: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  _id: string;
  postId: string;
  userId: Pick<PublicUser, '_id' | 'name' | 'handle' | 'role' | 'level'>;
  body: string;
  upvotes: string[];
  upvoteCount: number;
  markedUseful: boolean;
  parentId: string | null;
  createdAt: string;
}

export interface NotificationRow {
  _id: string;
  userId: string;
  type: 'badge' | 'reply' | 'streak' | 'moderation' | 'system';
  title: string;
  body: string;
  read: boolean;
  href: string | null;
  badgeKey: string | null;
  createdAt: string;
}

export interface AdminStats {
  totalUsers: number;
  userDeltaPct: number;
  publishedPlants: number;
  plantDelta: number;
  dau: number;
  dauSparkline: number[];
  pendingModeration: number;
  activeUsers30d: number[];
  topPlants: Array<{ plantId: string; commonName: string; botanicalName: string; views: number }>;
  quizPassRate: Array<{ family: string; passRate: number }>;
  recentModeration: Array<{ id: string; title: string; action: PostStatus; at: string; reviewer: string }>;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PlantFilters {
  q?: string;
  family?: string;
  part?: PlantPart;
  ailment?: string;
  region?: string;
  system?: MedicalSystem;
  toxic?: boolean;
  page?: number;
  sort?: 'name' | 'recent' | 'family';
}

export interface IdentifyMatch {
  plantId: string;
  slug: string;
  commonName: string;
  botanicalName: string;
  confidence: number;
  image?: string;
}

export interface IdentifyResponse {
  matches: IdentifyMatch[];
  warning: string | null;
}

export interface AssistantCitation {
  label: string;
  url: string;
}

export interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
  plants?: Array<Pick<Plant, '_id' | 'slug' | 'commonName' | 'botanicalName' | 'images'>>;
  citations?: AssistantCitation[];
}
