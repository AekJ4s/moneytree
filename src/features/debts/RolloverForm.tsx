import { useState, type FormEvent } from 'react';
import { ErrorText } from '../../components/Modal';
import { formatMoney, todayIso } from '../../lib/format';
import { firstDueOnOrAfter } from '../../lib/recurrence';
import { errorMessage } from '../../lib/useAsync';
import { rolloverRevolving } from './api';
import { revolvingBalance, unpaidInterest } from './debtMath';
import type { Debt, DebtEntry } from './types';

interface Props {
  debt: Debt;
  entries: DebtEntry[];
  onSaved: () => void;
}

function num(value: string): number {
  return Number(value.replace(/,/g, '')) || 0;
}

/**
 * Monthly cycle for a re-lent revolving balance: post the statement interest, pay the whole
 * balance, then draw the same principal again. Only the interest is my real cost.
 */
export function RolloverForm({ debt, entries, onSaved }: Props) {
  const lastRedraw = [...entries]
    .filter((e) => e.kind === 'charge')
    .sort((a, b) => `${b.entry_date}${b.created_at}`.localeCompare(`${a.entry_date}${a.created_at}`))[0];
  const defaultDate = debt.due_day
    ? firstDueOnOrAfter(todayIso(), { interval_unit: 'month', interval_count: 1, due_day: debt.due_day, due_last_day: false })
    : todayIso();

  const [date, setDate] = useState(defaultDate);
  const [interest, setInterest] = useState('');
  const [redraw, setRedraw] = useState(
    String(lastRedraw ? Number(lastRedraw.amount) : debt.borrower ? Number(debt.principal) : 0),
  );
  const [countInterest, setCountInterest] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const balance = revolvingBalance(debt, entries);
  const postedInterest = unpaidInterest(entries);
  const payNow = Math.round((balance + num(interest)) * 100) / 100;
  const interestCost = Math.round((postedInterest + num(interest)) * 100) / 100;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!(payNow > 0)) return setError('ไม่มียอดที่ต้องจ่าย');
    setBusy(true);
    setError(null);
    try {
      await rolloverRevolving({
        debtId: debt.id,
        date,
        interest: num(interest),
        redraw: num(redraw),
        // Someone else's interest is already in รอรับ (posted with the interest); only mine is booked here.
        bookInterest: !debt.borrower && countInterest ? interestCost : 0,
      });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <p className="text-sm text-slate-600">จ่ายเต็มยอดตามใบแจ้งหนี้ แล้วเบิกเงินก้อนเดิมกลับมาใหม่ในวันเดียวกัน</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-sm text-slate-600">วันที่ชำระ / เบิกใหม่</span>
          <input className="input mt-1" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label className="block">
          <span className="text-sm text-slate-600">ดอกเบี้ยที่ยังไม่ได้บันทึก</span>
          <input className="input mt-1" inputMode="decimal" value={interest} onChange={(e) => setInterest(e.target.value)} placeholder="0.00" />
        </label>
      </div>
      {postedInterest > 0 && (
        <p className="text-xs text-slate-500">บันทึกดอกเบี้ยรอบนี้ไว้แล้ว {formatMoney(postedInterest)} (รวมในยอดที่ต้องจ่ายแล้ว)</p>
      )}
      <label className="block">
        <span className="text-sm text-slate-600">เบิกใหม่</span>
        <input className="input mt-1" inputMode="decimal" value={redraw} onChange={(e) => setRedraw(e.target.value)} />
      </label>
      {debt.borrower ? (
        <p className="rounded-lg bg-violet-50 p-2 text-xs text-violet-800">
          ดอกเบี้ยของก้อนนี้เป็นของ {debt.borrower} — ดอกเบี้ยที่บันทึกไว้แล้วอยู่ในรอรับแล้ว
          {num(interest) > 0 && ` และดอกเบี้ยที่กรอกเพิ่ม ${formatMoney(num(interest))} จะเพิ่มในรอรับ`} · เงินที่เบิกใหม่จะนับว่าโอนให้{' '}
          {debt.borrower} (รอรับเพิ่ม)
        </p>
      ) : (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={countInterest} onChange={(e) => setCountInterest(e.target.checked)} />
          นับดอกเบี้ย {formatMoney(interestCost)} เป็นรายจ่ายของฉัน (หมวด หนี้/ผ่อน)
        </label>
      )}

      <div className="space-y-1 rounded-lg bg-slate-50 p-3 text-sm">
        <Row label="จ่ายเต็มยอด" value={`−${formatMoney(payNow)}`} />
        <Row label="เบิกใหม่" value={`+${formatMoney(num(redraw))}`} />
        <Row label="ยอดคงเหลือหลังหมุน" value={formatMoney(num(redraw))} bold />
        <Row label="รายจ่ายจริงของคุณ" value={formatMoney(countInterest && !debt.borrower ? interestCost : 0)} />
        {debt.borrower && num(redraw) > 0 && <Row label={`โอนให้ ${debt.borrower} (รอรับ)`} value={`−${formatMoney(num(redraw))}`} />}
      </div>

      <ErrorText>{error}</ErrorText>
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? 'กำลังบันทึก…' : 'บันทึกการหมุนรอบ'}
      </button>
    </form>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'font-semibold' : 'text-slate-600'}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
