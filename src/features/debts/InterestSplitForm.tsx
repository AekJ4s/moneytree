import { useState, type FormEvent } from 'react';
import { ErrorText } from '../../components/Modal';
import { formatMoney, todayIso } from '../../lib/format';
import { errorMessage } from '../../lib/useAsync';
import { addDebtEntry } from './api';
import { monthlyRate, revolvingBalance, splitInterest, type InterestSplitTarget } from './debtMath';
import type { Debt, DebtEntry } from './types';

interface Props {
  /** Open revolving debts of one creditor that share the statement. */
  debts: Debt[];
  entries: DebtEntry[];
  onSaved: () => void;
}

function num(value: string): number {
  return Number(value.replace(/,/g, ''));
}

/** Splits one statement's revolving interest across the portions (mine / Mom's / ...). */
export function InterestSplitForm({ debts, entries, onSaved }: Props) {
  const [total, setTotal] = useState('');
  const [date, setDate] = useState(todayIso());
  const [shares, setShares] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targets: InterestSplitTarget[] = debts.map((d) => {
    const mine = entries.filter((e) => e.debt_id === d.id);
    const lastInterest = mine
      .filter((e) => e.kind === 'interest' && e.entry_date < date)
      .map((e) => e.entry_date)
      .sort()
      .pop();
    return {
      id: d.id,
      balance: revolvingBalance(d, mine.filter((e) => e.entry_date <= date)),
      borrower: d.borrower,
      // Annualised rate whether the debt was entered per year or per month.
      annualPercent: monthlyRate(d.interest_mode, d.interest_rate) * 12 * 100,
      accruesFrom: lastInterest ?? d.start_date,
    };
  });

  function fill(method: 'days' | 'balance') {
    const t = num(total);
    if (!(t > 0)) return setError('ใส่ดอกเบี้ยรวมตามใบแจ้งยอดก่อน');
    setError(null);
    const split = splitInterest(t, targets, method, date);
    setShares(Object.fromEntries(Object.entries(split).map(([id, v]) => [id, v.toFixed(2)])));
  }

  const allocated = debts.reduce((s, d) => s + (num(shares[d.id] ?? '') || 0), 0);
  const diff = Math.round((num(total) - allocated) * 100) / 100;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!(num(total) > 0)) return setError('ใส่ดอกเบี้ยรวมตามใบแจ้งยอด');
    if (Math.abs(diff) > 0.001) return setError(`ยอดที่แบ่งยังไม่เท่ากับดอกเบี้ยรวม (ต่าง ${formatMoney(diff)})`);
    setBusy(true);
    setError(null);
    try {
      for (const d of debts) {
        const amount = num(shares[d.id] ?? '');
        if (amount > 0) {
          await addDebtEntry({
            debtId: d.id,
            kind: 'interest',
            amount,
            date,
            note: 'แบ่งจากดอกเบี้ยใบแจ้งยอด',
            installmentId: null,
            recordExpense: false,
          });
        }
      }
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-sm text-slate-600">ดอกเบี้ยรวมในใบแจ้งยอด</span>
          <input className="input mt-1" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="เช่น 1399.53" autoFocus />
        </label>
        <label className="block">
          <span className="text-sm text-slate-600">วันที่ตัดรอบ (วันที่ของดอกเบี้ย)</span>
          <input className="input mt-1" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary text-xs" onClick={() => fill('days')}>
          แบ่งตามจำนวนวัน (แนะนำ)
        </button>
        <button type="button" className="btn-secondary text-xs" onClick={() => fill('balance')}>
          แบ่งตามสัดส่วนยอด
        </button>
      </div>
      <p className="text-xs text-slate-500">
        ตามจำนวนวัน: ก้อนของคนอื่นคิด ยอด × อัตรา × จำนวนวันที่ใช้ ÷ 365 (นับจากวันเริ่มหรือดอกเบี้ยครั้งก่อน) ส่วนที่เหลือเป็นของคุณ
      </p>

      <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
        {debts.map((d) => {
          const t = targets.find((x) => x.id === d.id)!;
          return (
            <li key={d.id} className="flex items-center gap-2 p-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {d.name} {d.borrower ? `· 👤 ${d.borrower}` : '· ของฉัน'}
                </div>
                <div className="text-xs text-slate-500">
                  ยอด {formatMoney(t.balance)} · ตั้งแต่ {t.accruesFrom}
                </div>
              </div>
              <input
                className="input w-28 text-right"
                inputMode="decimal"
                value={shares[d.id] ?? ''}
                onChange={(e) => setShares((s) => ({ ...s, [d.id]: e.target.value }))}
                aria-label={`ดอกเบี้ยของ ${d.name}`}
              />
            </li>
          );
        })}
      </ul>
      {num(total) > 0 && Math.abs(diff) > 0.001 && (
        <p className="text-xs text-amber-700">ยังเหลือที่ไม่ได้แบ่ง {formatMoney(diff)}</p>
      )}

      <ErrorText>{error}</ErrorText>
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? 'กำลังบันทึก…' : 'บันทึกดอกเบี้ย'}
      </button>
    </form>
  );
}
