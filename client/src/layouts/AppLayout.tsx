import { Bell, BookOpen, MessageCircle, Search, Settings, Shield, LogOut } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider';
import { Brand } from '../shared/Brand';

const links = [
  { to: '/app/chats', label: 'Chats', icon: MessageCircle },
  { to: '/app/people', label: 'People', icon: Search },
  { to: '/app/stories', label: 'Stories', icon: BookOpen },
  { to: '/app/notifications', label: 'Updates', icon: Bell },
];

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const signOut = () => {
    void logout().then(() => navigate('/login'));
  };
  return (
    <div className="flex h-dvh min-h-0 flex-col bg-paper text-ink md:grid md:grid-cols-[84px_minmax(0,1fr)]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-ink focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>
      <aside className="hidden flex-col items-center bg-ink px-2 py-6 text-white md:flex">
        <div className="mb-12">
          <Brand compact inverse />
        </div>
        <nav aria-label="Main" className="grid w-full gap-2">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `relative flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-medium transition ${isActive ? 'bg-white/12 text-white before:absolute before:-left-2 before:h-7 before:w-1 before:rounded-r-full before:bg-coral' : 'text-white/55 hover:bg-white/8 hover:text-white'}`
              }
            >
              <Icon size={21} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto grid w-full gap-2">
          {user?.role === 'ADMIN' && <RailLink to="/app/admin" label="Admin" icon={Shield} />}
          <RailLink to="/app/profile" label="Profile" icon={Settings} />
          <button
            onClick={signOut}
            className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] text-white/55 transition hover:bg-white/8 hover:text-white"
          >
            <LogOut size={21} />
            Log out
          </button>
        </div>
      </aside>
      <main id="main-content" className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <Outlet />
      </main>
      <nav
        aria-label="Mobile navigation"
        className="flex shrink-0 justify-around border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_#192e3708] backdrop-blur-xl md:hidden"
      >
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex min-h-16 min-w-16 flex-col items-center justify-center gap-1 text-[11px] transition ${isActive ? 'font-bold text-sea' : 'text-muted hover:text-ink'}`
            }
          >
            <Icon size={20} />
            {label}
          </NavLink>
        ))}
        <NavLink
          to="/app/profile"
          aria-label="Profile"
          className="flex min-h-16 min-w-16 items-center justify-center text-muted"
        >
          <Settings size={20} />
        </NavLink>
      </nav>
    </div>
  );
}

function RailLink({ to, label, icon: Icon }: { to: string; label: string; icon: typeof Settings }) {
  return (
    <NavLink
      to={to}
      className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] text-white/55 transition hover:bg-white/8 hover:text-white"
    >
      <Icon size={21} />
      {label}
    </NavLink>
  );
}
