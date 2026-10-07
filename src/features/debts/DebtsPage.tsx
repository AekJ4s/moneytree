import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ErrorText, Modal } from '../../components/Modal';
import { formatMoney, formatThaiDate, todayIso } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { listCreditors, loadDebtData } from './api';
import { CreditorForm } from './CreditorForm';
import { CreditorLogo, useLogoUrls } from './CreditorLogo';
import { summarizeAll } from './debtMath';
import type { Creditor } from './types';

export function DebtsPage() {
  const navigate = useNavigate();
  const creditors = useAsync(listCreditors, []);
  const data = useAsync(() => loadDebtData(), []);
  const logos = useLogoUrls(creditors.data ?? []);
  const [adding, setAdding] = useState(false);
  const today = todayIso();

  const open = data.data ? summarizeAll(data.data, today) : [];
  const total = open.reduce((s, d) => s + d.summary.outstanding, 0);
  const dueThisMonth = open.reduce((s, d) => s + d.summary.dueThisMonth, 0);
  const remainingInterest = open.reduce((s, d) => s + d.summary.remainingInterest, 0);
  const upcoming = open
    .filter((d) => d.summary.nextDue)
    .sort((a, b) => a.summary.nextDue!.date.localeCompare(b.summary.nextDue!.date))
    .slice(0, 6);
  const creditorById = new Map((creditors.data ?? []).map((c) => [c.id, c]));

  function creditorStats(c: Creditor) {
    const mine = open.filter((d) => d.debt.creditor_id === c.id);
    return {
      count: mine.length,
      outstanding: mine.reduce((s, d) => s + d.summary.outstanding, 0),
      dueThisMonth: mine.reduce((s, d) => s + d.summary.dueThisMonth, 0),
      overdue: mine.reduce((s, d) => s + d.summary.overdueCount, 0),
    };
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">หนี้สิน</h1>
        <button className="btn-primary" onClick={() => setAdding(true)}>
          + เพิ่มเจ้าหนี้
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="ยอดหนี้คงเหลือ" value={total} tone="text-rose-600" />
        <Stat label="ต้องจ่ายเดือนนี้" value={dueThisMonth} tone="text-amber-600" />
        <Stat label="ดอกเบี้ยที่เหลือ (ผ่อน)" value={remainingInterest} tone="text-slate-700" />
      </div>
      <ErrorText>{creditors.error ?? data.error}</ErrorText>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(creditors.data ?? []).map((c) => {
          const st = creditorStats(c);
          return (
            <Link key={c.id} to={`/debts/${c.id}`} className="card flex items-center gap-3 transition hover:ring-emerald-400">
              <CreditorLogo name={c.name} src={logos[c.id]} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{c.name}</div>
                <div className="text-xs text-slate-500">{st.count > 0 ? `${st.count} รายการ` : 'ไม่มีหนี้ค้าง'}</div>
                {st.dueThisMonth > 0 && <div className="text-xs text-amber-600">เดือนนี้ {formatMoney(st.dueThisMonth)}</div>}
                {st.overdue > 0 && <div className="text-xs text-rose-600">เลยกำหนด {st.overdue} งวด</div>}
              </div>
              <div className="text-right font-semibold tabular-nums text-rose-600">{formatMoney(st.outstanding)}</div>
            </Link>
          );
        })}
      </div>

      {upcoming.length > 0 && (
        <section className="card">
          <h2 className="mb-2 font-semibold">กำหนดชำระถัดไป</h2>
          <ul className="divide-y divide-slate-100">
            {upcoming.map(({ debt, summary }) => {
              const c = creditorById.get(debt.creditor_id);
              const overdue = summary.nextDue!.date < today;
              return (
                <li key={debt.id}>
                  <button className="flex w-full items-center gap-3 py-2 text-left" onClick={() => navigate(`/debts/${debt.creditor_id}`)}>
                    <CreditorLogo name={c?.name ?? '?'} src={c ? logos[c.id] : null} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {c?.name} · {debt.name}
                      </div>
                      <div className={`text-xs ${overdue ? 'text-rose-600' : 'text-slate-500'}`}>
                        {overdue ? 'เลยกำหนด ' : ''}
                        {formatThaiDate(summary.nextDue!.date)}
                      </div>
                    </div>
                    <span className="font-semibold tabular-nums">{formatMoney(summary.nextDue!.amount)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {adding && (
        <Modal title="เพิ่มเจ้าหนี้" onClose={() => setAdding(false)}>
          <CreditorForm
            existingNames={(creditors.data ?? []).map((c) => c.name)}
            onSaved={(c) => {
              setAdding(false);
              if (c) navigate(`/debts/${c.id}`);
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`font-semibold tabular-nums ${tone}`}>{formatMoney(value)}</div>
    </div>
  );
}
