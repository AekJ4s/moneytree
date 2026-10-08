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
  const payables = debts.data
    ? buildPayables(summarizeAll(debts.data[0], today), debts.data[1])
    : { items: [], thisMonth: 0, nextMonth: 0, totalOwed: 0 };
  const dueItems = payables.items.filter((p) => p.dueThisMonth > 0);
  const receivable = (o?.receivables ?? []).reduce((s, r) => s + r.amount, 0);

  if (o && !o.configured) {
    return (
      <section className="card border-l-4 border-l-emerald-700">
        <h2 className="font-semibold">ตั้งยอดเงินในบัญชี</h2>
        <p className="text-sm text-slate-600">ใส่ยอดเงินรวมทุกบัญชีตอนนี้ครั้งเดียว ระบบจะคำนวณยอดเงินจริงต่อจากนี้ให้</p>
        <button className="btn-primary mt-2" onClick={() => setSetup(true)}>
          ตั้งยอดเงินตั้งต้น
        </button>
        {setup && <OpeningDialog onClose={() => setSetup(false)} onSaved={overview.reload} />}
      </section>
    );
  }

  const projected = o ? projectedBalance(o.cash_balance, receivable, payables.thisMonth) : undefined;

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-page">
      <div className="flex items-baseline justify-between gap-2 border-b border-slate-200 bg-emerald-50/70 px-4 py-2 text-xs text-slate-500">
        <span>ยอดเงิน ณ {formatThaiDate(today, { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        <button className="text-emerald-700 hover:underline" onClick={() => setShowDetail((s) => !s)} aria-expanded={showDetail}>
          {showDetail ? 'ซ่อนรายละเอียด' : 'ดูรายละเอียดรอรับ/รอจ่าย'}
        </button>
      </div>

      <dl className="px-4 text-sm">
        <LedgerRow label="ยอดเงินจริงในบัญชี" value={o?.cash_balance} />
        <LedgerRow label="รอรับ" sign="+" value={receivable} tone="text-emerald-700" />
        <LedgerRow label="รอจ่ายเดือนนี้" sign="−" value={payables.thisMonth} tone="text-rose-600" />
        <div className="flex flex-wrap items-end justify-between gap-x-3 -mt-px border-t-[3px] border-double border-slate-400 pt-3 pb-4">
          <dt className="pb-1 text-slate-600">ยอดหลังรวมรอรับ/รอจ่าย</dt>
          <dd className={`figure ml-auto text-3xl font-semibold sm:text-4xl ${projected !== undefined && projected < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
            {projected === undefined ? '…' : formatMoney(projected)}
          </dd>
        </div>
      </dl>

      {showDetail && (
        <div className="grid gap-4 border-t border-slate-200 px-4 py-3 sm:grid-cols-2">
          <div>
            <h3 className="mb-1 text-sm font-semibold text-emerald-700">รอรับ</h3>
            {(o?.receivables ?? []).length === 0 && <p className="text-xs text-slate-400">ไม่มี</p>}
            <ul className="space-y-1 text-sm">
              {(o?.receivables ?? []).map((r) => (
                <li key={r.person} className="flex justify-between">
                  <span>👤 {r.person}</span>
                  <span className="figure">{formatMoney(r.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-1 text-sm font-semibold text-rose-600">รอจ่ายเดือนนี้</h3>
            {dueItems.length === 0 && <p className="text-xs text-slate-400">ไม่มี จ่ายครบแล้ว</p>}
            <ul className="space-y-1 text-sm">
              {dueItems.map((p) => (
                <li key={p.debtId} className="flex justify-between gap-2">
                  <span className="min-w-0 truncate">
                    {p.label}
                    {p.borrower && ` (👤 ${p.borrower})`}
                    {p.next && (
                      <span className={`block text-xs ${p.overdue ? 'text-rose-600' : 'text-slate-500'}`}>
                        {p.overdue ? 'เลยกำหนด ' : 'ครบกำหนด '}
                        {formatThaiDate(p.next.date, { day: 'numeric', month: 'short' })}
                      </span>
                    )}
                  </span>
                  <span className="figure shrink-0">{formatMoney(p.dueThisMonth)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-slate-500">
              เดือนหน้า {formatMoney(payables.nextMonth)} · หนี้คงเหลือทั้งหมด {formatMoney(payables.totalOwed)} (ไม่นำมาหัก)
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-2 border-t border-slate-200 px-4 py-2 text-xs text-slate-500">
        <span>
          ยอดตั้งต้น {formatMoney(o?.opening_balance ?? 0)} ณ {o?.opening_date ? formatThaiDate(o.opening_date) : '—'}
        </span>
        <button className="text-emerald-700 hover:underline" onClick={() => setSetup(true)}>
          แก้ไข
        </button>
      </div>
      <ErrorText>{overview.error ?? debts.error}</ErrorText>
      {setup && <OpeningDialog initial={o ?? undefined} onClose={() => setSetup(false)} onSaved={overview.reload} />}
    </section>
  );
}

/** One printed line of the balance sum: label on the left, signed figure on the right. */
function LedgerRow({ label, value, sign, tone = 'text-slate-800' }: { label: string; value: number | undefined; sign?: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-200 py-2.5">
      <dt className="text-slate-600">{label}</dt>
      <dd className={`figure text-base ${tone}`}>
        {sign && <span className="mr-1">{sign}</span>}
        {value === undefined ? '…' : formatMoney(value)}
      </dd>
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
