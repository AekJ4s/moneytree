import { lazy, Suspense, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider';
import { OWNER_USERNAME } from '../lib/env';
import { Modal } from './Modal';
import { Toaster } from './Toaster';

const EntryHub = lazy(() => import('../features/money/EntryHub').then((m) => ({ default: m.EntryHub })));

interface NavItem {
  to: string;
  label: string;
  short: string;
  icon: IconName;
  /** Shown in the mobile bottom bar; the rest live under "เพิ่มเติม". */
  primary?: boolean;
}

const NAV: NavItem[] = [
  { to: '/', label: 'ภาพรวม', short: 'ภาพรวม', icon: 'book', primary: true },
  { to: '/slips', label: 'อัปโหลดสลิป', short: 'สลิป', icon: 'receipt', primary: true },
  { to: '/daily', label: 'รายวัน', short: 'รายวัน', icon: 'calendar', primary: true },
  { to: '/assets', label: 'ออม/ลงทุน', short: 'ออม', icon: 'sprout', primary: true },
  { to: '/debts', label: 'หนี้สิน', short: 'หนี้', icon: 'card', primary: true },
  { to: '/recurring', label: 'รายการประจำ', short: 'ประจำ', icon: 'repeat' },
  { to: '/income', label: 'แหล่งรายได้', short: 'รายได้', icon: 'briefcase' },
  { to: '/import', label: 'นำเข้า/ส่งออก', short: 'นำเข้า/ส่งออก', icon: 'import' },
  { to: '/payees', label: 'ผู้รับ/แมป', short: 'แมป', icon: 'tag' },
];

function linkClass({ isActive }: { isActive: boolean }) {
  return `whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm ${isActive ? 'bg-white/15 font-medium text-white' : 'text-emerald-100 hover:bg-white/10 hover:text-white'}`;
}

export function Layout() {
  const { signOut } = useAuth();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const [entryOpen, setEntryOpen] = useState(false);
  const secondary = NAV.filter((n) => !n.primary);
  const secondaryActive = secondary.some((n) => location.pathname.startsWith(n.to));

  return (
    <div className="min-h-screen pb-20 lg:pb-0">
      <header className="sticky top-0 z-20 bg-emerald-700 text-white">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-2.5">
          <div className="leading-tight whitespace-nowrap">
            <div className="text-lg font-semibold">MoneyTree</div>
            <div className="text-xs text-emerald-200">สมุดบัญชีของ {OWNER_USERNAME}</div>
          </div>
          <nav className="hidden flex-1 gap-0.5 lg:flex">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.to === '/'} className={linkClass}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <button
            className="ml-auto rounded-md px-3 py-1.5 text-sm text-emerald-100 ring-1 ring-white/30 hover:bg-white/10 hover:text-white lg:ml-0"
            onClick={() => void signOut()}
          >
            ออกจากระบบ
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-5">
        <Suspense fallback={<div className="p-8 text-center text-slate-400">กำลังโหลด…</div>}>
          <Outlet />
        </Suspense>
      </main>

      {/* Record from any page; the page underneath refreshes itself via emitDataChanged. */}
      <button
        className="fixed right-4 bottom-20 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-700 text-white shadow-lg ring-4 ring-paper transition hover:bg-emerald-800 lg:bottom-6"
        onClick={() => setEntryOpen(true)}
        aria-label="บันทึกรายการ"
        title="บันทึกรายการ"
      >
        <Icon name="plus" className="h-7 w-7" />
      </button>
      {entryOpen && (
        <Modal title="บันทึกรายการ" onClose={() => setEntryOpen(false)}>
          <Suspense fallback={<p className="text-sm text-slate-400">กำลังโหลด…</p>}>
            <EntryHub onSaved={() => setEntryOpen(false)} />
          </Suspense>
        </Modal>
      )}
      <Toaster />

      {moreOpen && (
        <div className="fixed inset-0 z-20 lg:hidden" onClick={() => setMoreOpen(false)}>
          <div className="absolute right-2 bottom-16 w-48 rounded-lg border border-slate-200 bg-page p-1 shadow-lg">
            {secondary.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) => `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm ${isActive ? 'bg-emerald-50 text-emerald-700' : 'text-slate-700'}`}
              >
                <Icon name={n.icon} className="h-4 w-4" />
                {n.label}
              </NavLink>
            ))}
          </div>
        </div>
      )}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-slate-200 bg-page lg:hidden">
        {NAV.filter((n) => n.primary).map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === '/'}
            onClick={() => setMoreOpen(false)}
            className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[11px] ${isActive ? 'font-medium text-emerald-700' : 'text-slate-500'}`}
          >
            <Icon name={n.icon} className="h-5 w-5" />
            {n.short}
          </NavLink>
        ))}
        <button
          className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${secondaryActive || moreOpen ? 'font-medium text-emerald-700' : 'text-slate-500'}`}
          onClick={() => setMoreOpen((o) => !o)}
          aria-expanded={moreOpen}
        >
          <Icon name="more" className="h-5 w-5" />
          เพิ่มเติม
        </button>
      </nav>
    </div>
  );
}

type IconName = 'book' | 'receipt' | 'calendar' | 'sprout' | 'card' | 'repeat' | 'briefcase' | 'import' | 'tag' | 'more' | 'plus';

const ICON_PATHS: Record<IconName, string> = {
  book: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Zm0 13a3 3 0 0 1 3-3h11M9 8h6',
  receipt: 'M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21V3Zm3 5h6m-6 4h6m-6 4h3',
  calendar: 'M4 6h16v14H4V6Zm0 4h16M8 3v4m8-4v4',
  sprout: 'M12 21v-9m0 0C12 8 9 5 5 5c0 4 3 7 7 7Zm0 0c0-3 2-6 6-6 0 3-2 6-6 6Z',
  card: 'M3 6h18v12H3V6Zm0 4h18M7 15h4',
  repeat: 'M4 12a6 6 0 0 1 6-6h8m0 0-3-3m3 3-3 3m5 3a6 6 0 0 1-6 6H6m0 0 3 3m-3-3 3-3',
  briefcase: 'M4 8h16v11H4V8Zm5 0V5h6v3m-11 5h16',
  import: 'M12 4v11m0 0-4-4m4 4 4-4M5 19h14',
  tag: 'M3 12V4h8l9 9-8 8-9-9Zm5-4.5h.01',
  more: 'M4 7h16M4 12h16M4 17h16',
  plus: 'M12 5v14M5 12h14',
};

function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}
