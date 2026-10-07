import { Suspense } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider';

const NAV = [
  { to: '/', label: 'ภาพรวม', short: 'ภาพรวม', icon: '🏠' },
  { to: '/slips', label: 'อัปโหลดสลิป', short: 'สลิป', icon: '🧾' },
  { to: '/daily', label: 'รายวัน', short: 'รายวัน', icon: '📅' },
  { to: '/debts', label: 'หนี้สิน', short: 'หนี้', icon: '💳' },
  { to: '/recurring', label: 'รายการประจำ', short: 'ประจำ', icon: '🔁' },
  { to: '/import', label: 'นำเข้า', short: 'นำเข้า', icon: '📥' },
  { to: '/payees', label: 'ผู้รับ/แมป', short: 'แมป', icon: '🏷️' },
];

function linkClass({ isActive }: { isActive: boolean }) {
  return `whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-100'}`;
}

export function Layout() {
  const { signOut } = useAuth();
  return (
    <div className="min-h-screen pb-20 lg:pb-0">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <span className="text-lg font-semibold whitespace-nowrap text-emerald-700">🌳 MoneyTree</span>
          <nav className="hidden flex-1 gap-1 lg:flex">
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
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-7 border-t border-slate-200 bg-white lg:hidden">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center py-2 text-[11px] ${isActive ? 'text-emerald-700' : 'text-slate-500'}`
            }
          >
            <span className="text-lg leading-none">{n.icon}</span>
            {n.short}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
