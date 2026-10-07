import { Suspense, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider';

interface NavItem {
  to: string;
  label: string;
  short: string;
  icon: string;
  /** Shown in the mobile bottom bar; the rest live under "เพิ่มเติม". */
  primary?: boolean;
}

const NAV: NavItem[] = [
  { to: '/', label: 'ภาพรวม', short: 'ภาพรวม', icon: '🌳', primary: true },
  { to: '/slips', label: 'อัปโหลดสลิป', short: 'สลิป', icon: '🧾', primary: true },
  { to: '/daily', label: 'รายวัน', short: 'รายวัน', icon: '📅', primary: true },
  { to: '/assets', label: 'ออม/ลงทุน', short: 'ออม', icon: '🪙', primary: true },
  { to: '/debts', label: 'หนี้สิน', short: 'หนี้', icon: '💳', primary: true },
  { to: '/recurring', label: 'รายการประจำ', short: 'ประจำ', icon: '🔁' },
  { to: '/import', label: 'นำเข้า', short: 'นำเข้า', icon: '📥' },
  { to: '/payees', label: 'ผู้รับ/แมป', short: 'แมป', icon: '🏷️' },
];

function linkClass({ isActive }: { isActive: boolean }) {
  return `whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-medium ${isActive ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-100'}`;
}

export function Layout() {
  const { signOut } = useAuth();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const secondary = NAV.filter((n) => !n.primary);
  const secondaryActive = secondary.some((n) => location.pathname.startsWith(n.to));

  return (
    <div className="min-h-screen pb-20 lg:pb-0">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <span className="text-lg font-semibold whitespace-nowrap text-emerald-700">🌳 MoneyTree</span>
          <nav className="hidden flex-1 gap-0.5 lg:flex">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.to === '/'} className={linkClass}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <button className="btn-secondary ml-auto lg:ml-0" onClick={() => void signOut()}>
            ออกจากระบบ
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-5">
        <Suspense fallback={<div className="p-8 text-center text-slate-400">กำลังโหลด…</div>}>
          <Outlet />
        </Suspense>
      </main>

      {moreOpen && (
        <div className="fixed inset-0 z-20 lg:hidden" onClick={() => setMoreOpen(false)}>
          <div className="absolute right-2 bottom-16 w-48 rounded-xl bg-white p-1 shadow-lg ring-1 ring-slate-200">
            {secondary.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) => `flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-emerald-50 text-emerald-700' : 'text-slate-700'}`}
              >
                <span>{n.icon}</span>
                {n.label}
              </NavLink>
            ))}
          </div>
        </div>
      )}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-slate-200 bg-white lg:hidden">
        {NAV.filter((n) => n.primary).map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === '/'}
            onClick={() => setMoreOpen(false)}
            className={({ isActive }) => `flex flex-col items-center py-2 text-[11px] ${isActive ? 'text-emerald-700' : 'text-slate-500'}`}
          >
            <span className="text-lg leading-none">{n.icon}</span>
            {n.short}
          </NavLink>
        ))}
        <button
          className={`flex flex-col items-center py-2 text-[11px] ${secondaryActive || moreOpen ? 'text-emerald-700' : 'text-slate-500'}`}
          onClick={() => setMoreOpen((o) => !o)}
          aria-expanded={moreOpen}
        >
          <span className="text-lg leading-none">☰</span>
          เพิ่มเติม
        </button>
      </nav>
    </div>
  );
}
