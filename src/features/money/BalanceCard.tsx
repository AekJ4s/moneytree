import { useState, type FormEvent } from 'react';
import { ErrorText, Modal } from '../../components/Modal';
import { formatMoney, formatThaiDate, todayIso } from '../../lib/format';
import { errorMessage, useAsync } from '../../lib/useAsync';
import { listCreditors, loadDebtData } from '../debts/api';
import { summarizeAll } from '../debts/debtMath';
import { getBalanceOverview, saveOpeningBalance } from './api';
import { buildPayables, projectedBalance } from './payables';

/**
 * Real account balance, what others owe me (รอรับ), what I owe (รอจ่าย), and the balance after both.
 * `refreshKey` lets the parent reload it after recording something.
 */
export function BalanceCard({ refreshKey = 0 }: { refreshKey?: number }) {
  const today = todayIso();
  const overview = useAsync(getBalanceOverview, [refreshKey]);
  const debts = useAsync(() => Promise.all([loadDebtData(), listCreditors()]), [refreshKey]);
  const [setup, setSetup] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  const o = overview.data;
  const payables = debts.data ? buildPayables(summarizeAll(debts.data[0], today), debts.data[1]) : { items: [], total: 0 };
  const receivable = (o?.receivables ?? []).reduce((s, r) => s + r.amount, 0);

  if (o && !o.configured) {
    return (
      <section className="card border-l-4 border-emerald-500">
        <h2 className="font-semibold">ตั้งยอดเงินในบัญชี</h2>
        <p className="text-sm text-slate-600">ใส่ยอดเงินรวมทุกบัญชีตอนนี้ครั้งเดียว ระบบจะคำนวณยอดเงินจริงต่อจากนี้ให้</p>
        <button className="btn-primary mt-2" onClick={() => setSetup(true)}>
          ตั้งยอดเงินตั้งต้น
        </button>
        {setup && <OpeningDialog onClose={() => setSetup(false)} onSaved={overview.reload} />}
      </section>
    );
  }

  return (
    <section className="card">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Figure label="ยอดเงินจริง" value={o?.cash_balance} tone="text-slate-800" />
        <Figure label="+ รอรับ" value={receivable} tone="text-emerald-600" />
        <Figure label="− รอจ่าย" value={payables.total} tone="text-rose-600" />
        <Figure
          label="ยอดหลังรวมรอรับ/รอจ่าย"
          value={o ? projectedBalance(o.cash_balance, receivable, payables.total) : undefined}
          tone="font-bold text-emerald-700"
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>
          ยอดตั้งต้น {formatMoney(o?.opening_balance ?? 0)} ณ {o?.opening_date ? formatThaiDate(o.opening_date) : '—'}
          <button className="ml-2 text-emerald-700 hover:underline" onClick={() => setSetup(true)}>
            แก้ไข
          </button>
        </span>
        <button className="text-emerald-700 hover:underline" onClick={() => setShowDetail((s) => !s)}>
          {showDetail ? 'ซ่อนรายละเอียด' : 'ดูรายละเอียดรอรับ / รอจ่าย'}
        </button>
      </div>

      {showDetail && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <h3 className="mb-1 text-sm font-semibold text-emerald-700">รอรับ</h3>
            {(o?.receivables ?? []).length === 0 && <p className="text-xs text-slate-400">ไม่มี</p>}
            <ul className="space-y-1 text-sm">
              {(o?.receivables ?? []).map((r) => (
                <li key={r.person} className="flex justify-between">
                  <span>👤 {r.person}</span>
                  <span className="tabular-nums">{formatMoney(r.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-1 text-sm font-semibold text-rose-600">รอจ่าย</h3>
            {payables.items.length === 0 && <p className="text-xs text-slate-400">ไม่มี</p>}
            <ul className="space-y-1 text-sm">
              {payables.items.map((p) => (
                <li key={p.debtId} className="flex justify-between gap-2">
                  <span className="min-w-0 truncate">
                    {p.label}
                    {p.borrower && ` (👤 ${p.borrower})`}
                    {p.next && (
                      <span className="block text-xs text-slate-500">
                        ถัดไป {formatThaiDate(p.next.date, { day: 'numeric', month: 'short' })} · {formatMoney(p.next.amount)}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 tabular-nums">{formatMoney(p.owed)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <ErrorText>{overview.error ?? debts.error}</ErrorText>
      {setup && <OpeningDialog initial={o ?? undefined} onClose={() => setSetup(false)} onSaved={overview.reload} />}
    </section>
  );
}

function Figure({ label, value, tone }: { label: string; value: number | undefined; tone: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`tabular-nums ${tone}`}>{value === undefined ? '…' : formatMoney(value)}</div>
    </div>
  );
}

function OpeningDialog({
  initial,
  onClose,
  onSaved,
}: {
  initial?: { opening_balance: number; opening_date: string | null };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(initial?.opening_date ? String(initial.opening_balance) : '');
  const [date, setDate] = useState(initial?.opening_date ?? todayIso());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const value = Number(amount.replace(/,/g, ''));
    if (!Number.isFinite(value) || amount.trim() === '') return setError('ใส่ยอดเงิน');
    setBusy(true);
    try {
      await saveOpeningBalance(value, date);
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="ยอดเงินตั้งต้น" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <label className="block">
          <span className="text-sm text-slate-600">ยอดเงินรวมทุกบัญชี (สิ้นวันที่ด้านล่าง)</span>
          <input className="input mt-1 text-lg" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </label>
        <label className="block">
          <span className="text-sm text-slate-600">ณ สิ้นวันที่</span>
          <input className="input mt-1" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <p className="text-xs text-slate-500">
          รายการที่เกิดหลังวันนี้จะปรับยอดเงินจริงให้ รายการก่อนหน้านั้นไม่กระทบยอด (ถือว่ารวมอยู่ในยอดตั้งต้นแล้ว)
        </p>
        <ErrorText>{error}</ErrorText>
        <button className="btn-primary w-full" disabled={busy}>
          บันทึก
        </button>
      </form>
    </Modal>
  );
}
