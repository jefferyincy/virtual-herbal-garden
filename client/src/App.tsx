import { Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AnalysisProvider } from '@/components/ui/Toast';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AppShell } from '@/components/layout/AppShell';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { routes, type AppRoute } from '@/app/routes';
import { useSession } from '@/stores/session';

/**
 * Router root. Every screen is lazy, so the initial bundle holds the shell plus the landing and
 * 404 pages only - phase 3's WebGL scene therefore cannot enter the initial bundle by construction.
 *
 * Guards live here and nowhere else: screens never re-check auth, they assume the guard held.
 */
export default function App() {
  const hydrateMe = useSession((s) => s.hydrateMe);

  useEffect(() => {
    void hydrateMe();
  }, [hydrateMe]);

  return (
    <AnalysisProvider>
      <ScrollToTop />
      <ErrorBoundary>
        <Routes>
          {routes.map((route) => (
            <Route key={route.path} path={route.path} element={<GuardedRoute route={route} />} />
          ))}
        </Routes>
      </ErrorBoundary>
    </AnalysisProvider>
  );
}

function GuardedRoute({ route }: { route: AppRoute }) {
  const { Component, guard, layout = 'app' } = route;

  const page = (
    <Suspense fallback={<LoadingScreen />}>
      <Component />
    </Suspense>
  );

  const guarded = guard ? <RequireAccess level={guard}>{page}</RequireAccess> : page;

  if (layout === 'bare') return guarded;
  return <AppShell variant={layout === 'canvas' ? 'canvas' : 'app'}>{guarded}</AppShell>;
}

function RequireAccess({
  level,
  children,
}: {
  level: NonNullable<AppRoute['guard']>;
  children: React.ReactNode;
}) {
  const status = useSession((s) => s.status);
  const role = useSession((s) => s.user?.role ?? null);
  const location = useLocation();

  if (status === 'loading') return <LoadingScreen />;
  if (status !== 'authenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  // Moderation routes are open to experts as well as admins because the server grants both the
  // expert and admin roles the moderation endpoint.
  if (level === 'admin' && role !== 'admin') return <Navigate to="/" replace />;
  if (level === 'moderator' && role !== 'admin' && role !== 'expert') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [pathname]);
  return null;
}
