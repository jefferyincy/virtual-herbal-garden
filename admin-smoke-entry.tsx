import { renderToString } from 'react-dom/server';

// Minimal DOM shim: several primitives touch window/document on import or first render.
const g = globalThis as unknown as Record<string, unknown>;
if (typeof g.window === 'undefined') {
  g.window = {
    matchMedia: () => ({ matches: true, addEventListener: () => undefined, removeEventListener: () => undefined }),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  g.document = {
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    body: { style: {} },
    activeElement: null,
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  g.requestAnimationFrame = () => 0;
  g.cancelAnimationFrame = () => undefined;
  g.matchMedia = (g.window as { matchMedia: unknown }).matchMedia;
}
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AnalysisProvider } from '@/components/ui/Toast';
import AdminDashboardPage from '@/pages/admin/AdminDashboardPage';
import AdminPlantsPage from '@/pages/admin/AdminPlantsPage';
import AdminPlantEditPage from '@/pages/admin/AdminPlantEditPage';
import AdminModerationPage from '@/pages/admin/AdminModerationPage';
import AdminUsersPage from '@/pages/admin/AdminUsersPage';
import AdminQuizzesPage from '@/pages/admin/AdminQuizzesPage';
import AdminBadgesPage from '@/pages/admin/AdminBadgesPage';

const stats = {
  totalUsers: 4182, userDeltaPct: 12, publishedPlants: 240, plantDelta: 3, dau: 612,
  dauSparkline: Array.from({ length: 14 }, (_, i) => 400 + i * 7),
  pendingModeration: 14,
  activeUsers30d: Array.from({ length: 30 }, (_, i) => 300 + Math.round(120 * Math.sin(i / 3))),
  topPlants: [
    { plantId: 'p1', commonName: 'Tulsi', botanicalName: 'Ocimum tenuiflorum', views: 980 },
    { plantId: 'p2', commonName: 'Sage', botanicalName: 'Salvia officinalis', views: 720 },
  ],
  quizPassRate: [
    { family: 'Lamiaceae', passRate: 78 },
    { family: 'Apiaceae', passRate: 64 },
    { family: 'Zingiberaceae', passRate: 51 },
    { family: 'Fabaceae', passRate: 88 },
  ],
  recentModeration: [
    { id: 'm1', title: 'Tulsi tea for sore throat', action: 'approved' as const, at: new Date().toISOString(), reviewer: 'A. Rao' },
    { id: 'm2', title: 'Turmeric paste ratio', action: 'rejected' as const, at: new Date().toISOString(), reviewer: 'M. Iyer' },
  ],
};

const userRow = {
  _id: 'u1', name: 'Eleanor Vance', email: 'e@example.com', handle: 'eleanor', role: 'student' as const,
  xp: 1240, level: 4, joinedAt: new Date('2025-01-04').toISOString(),
  lastActiveAt: new Date().toISOString(), banned: false, badgeCount: 3,
};

const plantRow = {
  _id: 'pl1', slug: 'ocimum-tenuiflorum', commonName: 'Tulsi', botanicalName: 'Ocimum tenuiflorum',
  family: 'Lamiaceae', partsUsed: ['leaf'], preparations: ['infusion'], ailments: [], activeCompounds: ['eugenol'],
  description: '', medicinalUses: '', dosage: null, contraindications: null, toxicity: 'none' as const,
  lookAlikes: [], region: ['India'], systemsMentioned: ['ayurveda'], images: [], modelUrl: null, modelScale: 1,
  tags: [], sources: [], verified: false, publishedAt: null,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  lessonsCount: 3, status: 'draft' as const,
};

function seed(client: QueryClient) {
  client.setQueryData(['admin', 'stats'], stats);
  client.setQueryData(['admin', 'users', '', 'all', 'active', 1], {
    items: [userRow], page: 1, pageSize: 20, total: 1, totalPages: 1,
    totalUsers: 4182, activeToday: 612, pendingExpertApplications: 0,
  });
  client.setQueryData(['admin', 'plants', '', 'all', 'all', 1], {
    items: [plantRow], page: 1, pageSize: 20, total: 1, totalPages: 1,
  });
  client.setQueryData(['admin', 'moderation', 'queue', 'pending'], {
    items: [{
      _id: 'po1', type: 'remedy' as const, title: 'Tulsi tea for sore throat',
      body: 'Steep five leaves.\nAdd honey.', author: { name: 'Eleanor', handle: 'eleanor' },
      createdAt: new Date().toISOString(), reviewerNote: null, sources: ['WHO monograph'], plantIds: ['pl1'],
    }],
    total: 1, pendingCount: 14, flaggedCount: 3,
  });
  client.setQueryData(['admin', 'moderation', 'diff', 'po1'], {
    submitted: { body: 'Steep five leaves.\nAdd honey.\nDrink warm.', title: 'Tulsi tea', sources: ['WHO'], at: new Date().toISOString() },
    current: null, changedLines: [1],
  });
  client.setQueryData(['admin', 'quizzes'], {
    items: [{
      _id: 'q1', family: 'Lamiaceae', title: 'Lamiaceae identification', difficulty: 'easy' as const,
      plantIds: ['pl1'], timeLimitSec: 480, published: true,
      questions: [{ _id: 'qq1', stem: 'Which leaf has serrated edges?', options: ['Tulsi', 'Sage', 'Mint', 'Basil'], answerIndex: 1, explanation: 'Sage is serrated.', plantId: null }],
    }],
  });
  client.setQueryData(['admin', 'badges'], {
    items: [{
      _id: 'b1', key: 'ten-plants', name: 'Field researcher', description: 'Read ten plant monographs.',
      criteria: { action: 'read_plant_family', target: 10, param: 'Lamiaceae' }, xpReward: 80, icon: 'compass', earnedBy: 412,
    }],
  });
  client.setQueryData(['admin', 'plant-edit', 'pl1'], plantRow);
  client.setQueryData(['ailments', 'options'], { items: [
    { _id: 'a1', slug: 'sore-throat', name: 'Sore throat', system: 'respiratory', description: '', plantCount: 4 },
  ] });
}

const cases: Array<[string, React.ComponentType, string]> = [
  ['dashboard', AdminDashboardPage, '/admin'],
  ['plants', AdminPlantsPage, '/admin/plants'],
  ['plantEdit', AdminPlantEditPage, '/admin/plants/pl1/edit'],
  ['moderation', AdminModerationPage, '/admin/moderation'],
  ['users', AdminUsersPage, '/admin/users'],
  ['quizzes', AdminQuizzesPage, '/admin/quizzes'],
  ['badges', AdminBadgesPage, '/admin/badges'],
];

function run() {
  let failures = 0;
  for (const [name, Component, path] of cases) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    seed(client);
    try {
      const html = renderToString(
        <QueryClientProvider client={client}>
          <AnalysisProvider>
            <MemoryRouter initialEntries={[path]}>
              <Component />
            </MemoryRouter>
          </AnalysisProvider>
        </QueryClientProvider>,
      );
      const checks: Array<[string, boolean]> = [];
      if (name === 'dashboard') {
        checks.push(['total users 4,182', html.includes('4,182')]);
        checks.push(['aria summary', html.includes('peaking at')]);
        checks.push(['derived from read counts', html.includes('derived from read counts')]);
        checks.push(['range chip', html.includes('Last 30 days')]);
      }
      if (name === 'plants') checks.push(['bulk footer absent until selection', !html.includes('selected</span>')]);
      if (name === 'moderation') {
        checks.push(['no previous version', html.includes('No previously published version')]);
        checks.push(['note required hint', html.includes('required before rejecting')]);
        checks.push(['shortcuts', html.includes('Shortcuts')]);
      }
      if (name === 'users') checks.push(['honest zero', html.includes('0 pending expert applications')]);
      if (name === 'quizzes') checks.push(['generate disabled honest', html.includes('generation happens in the seed script')]);
      if (name === 'badges') checks.push(['earned by real number', html.includes('Earned by 412 users')]);
      if (name === 'plantEdit') checks.push(['no citable source toggle', html.includes('No citable source found')]);
      const bad = checks.filter(([, ok]) => !ok);
      for (const [label] of bad) { failures += 1; console.log(`FAIL ${name}: ${label}`); }
      console.log(`${name}: ${html.length} bytes, ${checks.length - bad.length}/${checks.length} content checks`);
    } catch (error) {
      failures += 1;
      console.log(`THREW ${name}: ${(error as Error).message}`);
    }
  }
  console.log(failures === 0 ? 'ALL OK' : `${failures} failure(s)`);
  if (failures > 0) process.exitCode = 1;
}

run();
