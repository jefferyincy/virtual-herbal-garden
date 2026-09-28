import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Icon, type IconName } from '@/components/icons';
import { adminNavGroup, mountedPaths, navGroups } from '@/app/routes';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/query';
import { useSession } from '@/stores/session';

/**
 * Application shell: 248px sidebar, 64px top nav, 1200px content column (DESIGN.md layout).
 * `variant="canvas"` drops the sidebar and the padding for the 3D garden routes so the WebGL
 * surface is full-bleed.
 */
export function AppShell({ children, variant = 'app' }: { children: React.ReactNode; variant?: 'app' | 'canvas' }) {
  const user = useSession((s) => s.user);
  const status = useSession((s) => s.status);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const mounted = (path: string) => mountedPaths.includes(path);
  const groups = user?.role === 'admin' ? [...navGroups, adminNavGroup] : navGroups;

  return (
    <div className="grain relative flex min-h-screen bg-bg-base">
      {variant === 'app' && (
        <Sidebar
          groups={groups}
          mounted={mounted}
          open={mobileNavOpen}
          onClose={() => setMobileNavOpen(false)}
          authed={status === 'authenticated'}
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopNav
          onOpenNav={variant === 'app' ? () => setMobileNavOpen(true) : undefined}
          showMenuButton={variant === 'app'}
        />
        <main
          className={cn(
            'min-w-0 flex-1',
            variant === 'app' ? 'mx-auto w-full max-w-content px-4 py-8 sm:px-8' : 'p-0',
          )}
        >
          {children}
        </main>
        {variant === 'app' && (
          <footer className="border-t border-line-subtle px-8 py-6">
            <p className="text-small text-fg-muted">
              Educational reference only. Not medical advice - verify every plant with a qualified
              practitioner and a cited source before use.
            </p>
          </footer>
        )}
      </div>
    </div>
  );
}

function Sidebar({
  groups,
  mounted,
  open,
  onClose,
  authed,
}: {
  groups: Array<{ label: string | null; items: Array<{ to: string; label: string; icon: string }> }>;
  mounted: (path: string) => boolean;
  open: boolean;
  onClose: () => void;
  authed: boolean;
}) {
  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-[rgba(5,8,6,0.72)] lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-sidebar shrink-0 flex-col border-r border-line-subtle bg-bg-sunken transition-transform duration-200 ease-base lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-topnav items-center gap-2 px-5">
          <Icon name="leaf" className="text-accent-500" />
          <span className="font-serif text-h3 italic text-fg">Herbal Garden</span>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-6" aria-label="Primary">
          {groups.map((group, index) => (
            <div key={group.label ?? index} className="mb-4">
              {group.label && (
                <p className="px-3 pb-2 pt-3 font-mono text-micro uppercase text-fg-disabled">
                  {group.label}
                </p>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const enabled = mounted(item.to);
                  return (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        onClick={onClose}
                        aria-disabled={!enabled}
                        className={({ isActive }) =>
                          cn(
                            'group flex h-10 items-center gap-3 rounded-btn px-3 text-body transition-colors duration-100 ease-base',
                            isActive
                              ? 'bg-accent-tint text-accent-400'
                              : 'text-fg-secondary hover:bg-bg-hover hover:text-fg',
                            !enabled && 'text-fg-disabled hover:bg-transparent hover:text-fg-disabled',
                          )
                        }
                      >
                        <Icon name={item.icon as IconName} size={20} />
                        <span>{item.label}</span>
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {!authed && (
            <div className="px-3 pt-2">
              <NavLink
                to="/login"
                className="flex h-10 items-center gap-3 rounded-btn px-3 text-body text-fg-secondary hover:bg-bg-hover hover:text-fg"
              >
                <Icon name="user" size={20} />
                <span>Sign in</span>
              </NavLink>
            </div>
          )}
        </nav>
      </aside>
    </>
  );
}

function TopNav({ onOpenNav, showMenuButton }: { onOpenNav?: () => void; showMenuButton: boolean }) {
  const user = useSession((s) => s.user);
  const status = useSession((s) => s.status);
  const logout = useSession((s) => s.logout);
  const [paletteHint, setPaletteHint] = useState<string | null>(null);
  const health = useQuery({
    queryKey: queryKeys.health,
    queryFn: () => api.get<{ ok: boolean; db: string }>('/health'),
    refetchInterval: 60_000,
  });

  useEffect(() => {
    setPaletteHint(navigator.platform.toLowerCase().includes('mac') ? 'CMD K' : 'CTRL K');
  }, []);

  return (
    <header className="sticky top-0 z-20 flex h-topnav items-center gap-3 border-b border-line-subtle bg-bg-base/80 px-4 backdrop-blur-[12px] sm:px-8">
      {showMenuButton && (
        <button
          type="button"
          onClick={onOpenNav}
          aria-label="Open navigation"
          className="grid h-11 w-11 place-items-center rounded-btn text-fg-secondary hover:bg-bg-hover hover:text-fg lg:hidden"
        >
          <Icon name="menu" />
        </button>
      )}
      <NavLink to="/" className="flex items-center gap-2 lg:hidden">
        <Icon name="leaf" size={18} className="text-accent-500" />
        <span className="font-serif italic">Herbal Garden</span>
      </NavLink>

      <div className="ml-auto flex items-center gap-2">
        <span
          className="hidden items-center gap-2 rounded-full border border-line-subtle px-3 py-1.5 font-mono text-micro uppercase text-fg-muted sm:flex"
          title={health.data ? `API ${health.data.db}` : 'API status unknown'}
        >
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              health.isError ? 'bg-warning' : 'animate-grow-pulse bg-accent-500',
            )}
          />
          {health.isError ? 'Offline' : 'Live'}
        </span>
        {paletteHint && (
          <span className="hidden rounded-full border border-line-subtle px-3 py-1.5 font-mono text-micro uppercase text-fg-muted md:inline">
            {paletteHint}
          </span>
        )}
        {status === 'authenticated' && user ? (
          <div className="flex items-center gap-2">
            <NavLink
              to={`/u/${user.handle}`}
              className="flex h-11 items-center gap-2 rounded-btn px-2 hover:bg-bg-hover"
            >
              <AvatarBadge name={user.name} level={user.level} />
              <span className="hidden text-small text-fg-secondary sm:inline">{user.name}</span>
            </NavLink>
            <button
              type="button"
              onClick={() => void logout()}
              className="grid h-11 w-11 place-items-center rounded-btn text-fg-muted hover:bg-bg-hover hover:text-fg"
              aria-label="Sign out"
            >
              <Icon name="logout" />
            </button>
          </div>
        ) : status === 'loading' ? (
          <span className="h-8 w-8 animate-shimmer rounded-full bg-white/[0.06]" />
        ) : (
          <NavLink
            to="/login"
            className="flex h-9 items-center rounded-btn bg-accent-500 px-4 text-small font-semibold text-fg-onAccent transition-colors duration-100 ease-base hover:bg-accent-400"
          >
            Sign in
          </NavLink>
        )}
      </div>
    </header>
  );
}

function AvatarBadge({ name, level }: { name: string; level: number }) {
  return (
    <span className="relative grid h-8 w-8 place-items-center rounded-full border border-line-strong bg-bg-raised text-small font-medium text-fg">
      {name.charAt(0).toUpperCase()}
      <span className="absolute -bottom-0.5 -right-0.5 rounded-full border border-line-strong bg-bg-base px-1 font-mono text-[9px] leading-4 text-accent-400">
        {level}
      </span>
    </span>
  );
}
