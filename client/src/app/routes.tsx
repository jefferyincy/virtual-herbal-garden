import { lazy } from 'react';
import type { ComponentType } from 'react';

/**
 * Route registry. One entry per route in the build spec's route table (docs/build-pack.md section 2.5).
 * Every component is lazy so no screen - and crucially no WebGL scene - is in the initial bundle.
 *
 * `layout`:
 *   'app'    - the standard shell (248px sidebar + 64px top nav + padded content)
 *   'canvas' - the shell without padding, for full-bleed 3D routes
 *   'bare'   - no shell at all (the public shared-garden page carries its own slim banner)
 *
 * `guard`: 'auth' requires a session, 'admin' requires role admin (or expert for moderation routes).
 */
export type AppRoute = {
  path: string;
  Component: ComponentType;
  layout?: 'app' | 'canvas' | 'bare';
  guard?: 'auth' | 'admin' | 'moderator';
};

const HomePage = lazy(() => import('@/pages/HomePage'));
const AboutPage = lazy(() => import('@/pages/AboutPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

const LoginPage = lazy(() => import('@/pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('@/pages/auth/RegisterPage'));
const ResetPage = lazy(() => import('@/pages/auth/ResetPage'));
const OnboardingPage = lazy(() => import('@/pages/auth/OnboardingPage'));

const PlantsPage = lazy(() => import('@/pages/plants/PlantsPage'));
const PlantDetailPage = lazy(() => import('@/pages/plants/PlantDetailPage'));
const ComparePage = lazy(() => import('@/pages/plants/ComparePage'));
const AilmentsPage = lazy(() => import('@/pages/plants/AilmentsPage'));
const MapPage = lazy(() => import('@/pages/plants/MapPage'));

const GardenPage = lazy(() => import('@/pages/garden/GardenPage'));
const PlaceModePage = lazy(() => import('@/pages/garden/PlaceModePage'));
const GardenSettingsPage = lazy(() => import('@/pages/garden/GardenSettingsPage'));
const MyGardensPage = lazy(() => import('@/pages/garden/MyGardensPage'));
const PublicGardenPage = lazy(() => import('@/pages/garden/PublicGardenPage'));

const LearnPage = lazy(() => import('@/pages/learn/LearnPage'));
const LessonPage = lazy(() => import('@/pages/learn/LessonPage'));
const QuizzesPage = lazy(() => import('@/pages/learn/QuizzesPage'));
const QuizRunnerPage = lazy(() => import('@/pages/learn/QuizRunnerPage'));
const QuizResultPage = lazy(() => import('@/pages/learn/QuizResultPage'));
const FlashcardsPage = lazy(() => import('@/pages/learn/FlashcardsPage'));
const ProgressPage = lazy(() => import('@/pages/learn/ProgressPage'));
const CertificatePage = lazy(() => import('@/pages/learn/CertificatePage'));
const LeaderboardPage = lazy(() => import('@/pages/learn/LeaderboardPage'));
const NotificationsPage = lazy(() => import('@/pages/learn/NotificationsPage'));

const CommunityPage = lazy(() => import('@/pages/community/CommunityPage'));
const PostPage = lazy(() => import('@/pages/community/PostPage'));
const NewPostPage = lazy(() => import('@/pages/community/NewPostPage'));
const ProfilePage = lazy(() => import('@/pages/community/ProfilePage'));

const AdminDashboardPage = lazy(() => import('@/pages/admin/AdminDashboardPage'));
const AdminPlantsPage = lazy(() => import('@/pages/admin/AdminPlantsPage'));
const AdminPlantEditPage = lazy(() => import('@/pages/admin/AdminPlantEditPage'));
const AdminModerationPage = lazy(() => import('@/pages/admin/AdminModerationPage'));
const AdminUsersPage = lazy(() => import('@/pages/admin/AdminUsersPage'));
const AdminQuizzesPage = lazy(() => import('@/pages/admin/AdminQuizzesPage'));
const AdminBadgesPage = lazy(() => import('@/pages/admin/AdminBadgesPage'));

const AssistantPage = lazy(() => import('@/pages/tools/AssistantPage'));
const IdentifyPage = lazy(() => import('@/pages/tools/IdentifyPage'));

/** Order matters for React Router: static segments must precede dynamic siblings. */
export const routes: AppRoute[] = [
  { path: '/', Component: HomePage },
  { path: '/about', Component: AboutPage },

  { path: '/login', Component: LoginPage },
  { path: '/register', Component: RegisterPage },
  { path: '/reset', Component: ResetPage },
  { path: '/onboarding', Component: OnboardingPage, guard: 'auth' },

  { path: '/plants/compare', Component: ComparePage },
  { path: '/plants', Component: PlantsPage },
  { path: '/plants/:slug', Component: PlantDetailPage },
  { path: '/ailments', Component: AilmentsPage },
  { path: '/map', Component: MapPage },

  { path: '/garden/place', Component: PlaceModePage, layout: 'canvas', guard: 'auth' },
  { path: '/garden/settings', Component: GardenSettingsPage, layout: 'canvas', guard: 'auth' },
  { path: '/garden', Component: GardenPage, layout: 'canvas', guard: 'auth' },
  { path: '/gardens', Component: MyGardensPage, guard: 'auth' },
  { path: '/g/:slug', Component: PublicGardenPage, layout: 'bare' },

  { path: '/learn/lesson/:slug', Component: LessonPage },
  { path: '/learn', Component: LearnPage },
  { path: '/quizzes/:id/result', Component: QuizResultPage, guard: 'auth' },
  { path: '/quizzes/:id', Component: QuizRunnerPage, guard: 'auth' },
  { path: '/quizzes', Component: QuizzesPage },
  { path: '/flashcards', Component: FlashcardsPage, guard: 'auth' },
  { path: '/progress', Component: ProgressPage, guard: 'auth' },
  { path: '/certificate/:id', Component: CertificatePage, guard: 'auth' },
  { path: '/leaderboard', Component: LeaderboardPage },
  { path: '/notifications', Component: NotificationsPage, guard: 'auth' },

  { path: '/community/new', Component: NewPostPage, guard: 'auth' },
  { path: '/community/:id', Component: PostPage },
  { path: '/community', Component: CommunityPage },
  { path: '/u/:handle', Component: ProfilePage },

  { path: '/identify', Component: IdentifyPage },
  { path: '/assistant', Component: AssistantPage },

  { path: '/admin/plants/new', Component: AdminPlantEditPage, guard: 'admin' },
  { path: '/admin/plants/:id/edit', Component: AdminPlantEditPage, guard: 'admin' },
  { path: '/admin/plants', Component: AdminPlantsPage, guard: 'admin' },
  { path: '/admin/moderation', Component: AdminModerationPage, guard: 'moderator' },
  { path: '/admin/users', Component: AdminUsersPage, guard: 'admin' },
  { path: '/admin/quizzes', Component: AdminQuizzesPage, guard: 'admin' },
  { path: '/admin/badges', Component: AdminBadgesPage, guard: 'admin' },
  { path: '/admin', Component: AdminDashboardPage, guard: 'admin' },

  { path: '*', Component: NotFoundPage },
];

type NavItem = { to: string; label: string; icon: string };
type NavGroup = { label: string | null; items: NavItem[] };

/** Sidebar contents for signed-in users. */
export const navGroups: NavGroup[] = [
  {
    label: 'Explore',
    items: [
      { to: '/garden', label: 'Garden', icon: 'leaf' },
      { to: '/plants', label: 'Plants', icon: 'grid' },
      { to: '/ailments', label: 'Ailments', icon: 'shield' },
      { to: '/map', label: 'Map', icon: 'map' },
    ],
  },
  {
    label: 'Learn',
    items: [
      { to: '/learn', label: 'Lessons', icon: 'book' },
      { to: '/quizzes', label: 'Quizzes', icon: 'check-circle' },
      { to: '/flashcards', label: 'Flashcards', icon: 'layers' },
      { to: '/progress', label: 'Progress', icon: 'chart' },
      { to: '/leaderboard', label: 'Leaderboard', icon: 'trophy' },
    ],
  },
  {
    label: 'Community',
    items: [
      { to: '/community', label: 'Community', icon: 'message' },
      { to: '/notifications', label: 'Notifications', icon: 'bell' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { to: '/assistant', label: 'Assistant', icon: 'sparkles' },
      { to: '/identify', label: 'Identify', icon: 'camera' },
      { to: '/gardens', label: 'My gardens', icon: 'home' },
    ],
  },
];

export const adminNavGroup: NavGroup = {
  label: 'Admin',
  items: [
    { to: '/admin', label: 'Dashboard', icon: 'chart' },
    { to: '/admin/plants', label: 'Plants', icon: 'leaf' },
    { to: '/admin/moderation', label: 'Moderation', icon: 'shield' },
    { to: '/admin/users', label: 'Users', icon: 'users' },
    { to: '/admin/quizzes', label: 'Quizzes', icon: 'check-circle' },
    { to: '/admin/badges', label: 'Badges', icon: 'award' },
  ],
};

/** Paths the shell should render as navigation targets. */
export const mountedPaths: string[] = routes.filter((r) => r.path !== '*').map((r) => r.path);
