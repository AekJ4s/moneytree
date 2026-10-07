import { useMemo, useState, type FormEvent } from 'react';
import { ErrorText } from '../../components/Modal';
import { addDays, formatMoney, formatThaiDate, todayIso } from '../../lib/format';
import { errorMessage } from '../../lib/useAsync';
import { createDebt, replaceSchedule, updateDebt } from './api';
import { amortizedPayment, buildSchedule, monthlyRate } from './debtMath';
import { KIND_LABEL, type Debt, type DebtInput, type DebtKind, type InterestMethod, type InterestMode } from './types';

interface Props {
  creditorId: string;
  initial?: Debt;
  /** Installments already paid; once any are paid the schedule can't be regenerated. */
  hasPayments: boolean;
  /** Borrower names already used, for autocomplete. */
  knownBorrowers?: string[];
  onSaved: () => void;
}

const MODE_OPTIONS: { value: InterestMode; label: string }[] = [
  { value: 'none', label: 'ไม่มีดอกเบี้ย (0%)' },
  { value: 'annual', label: '% ต่อปี (ดอกเบี้ยรวมรายปี)' },
  { value: 'monthly', label: '% ต่อเดือน' },
  { value: 'manual', label: 'กรอกดอกเบี้ยเองแยกแต่ละเดือน' },
];

function num(value: string): number {
  return Number(value.replace(/,/g, ''));
}

export function DebtForm({ creditorId, initial, hasPayments, knownBorrowers = [], onSaved }: Props) {
  const [kind, setKind] = useState<DebtKind>(initial?.kind ?? 'installment');
  const [name, setName] = useState(initial?.name ?? '');
  const [principal, setPrincipal] = useState(initial ? String(initial.principal) : '');
  const [mode, setMode] = useState<InterestMode>(initial?.interest_mode ?? 'none');
  const [rate, setRate] = useState(initial?.interest_rate != null ? String(initial.interest_rate) : '');
  // 'fixed' = bank-style fixed payment per installment (stored as reducing + installment_amount).
  const [calc, setCalc] = useState<InterestMethod | 'fixed'>(
    initial ? (initial.installment_amount ? 'fixed' : initial.interest_method) : 'fixed',
  );
  const [payment, setPayment] = useState(initial?.installment_amount != null ? String(initial.installment_amount) : '');
  const [term, setTerm] = useState(String(initial?.term_months ?? 3));
  const [startDate, setStartDate] = useState(initial?.start_date ?? todayIso());
  const [firstDue, setFirstDue] = useState(initial?.first_due_date ?? addDays(todayIso(), 30));
  const [dueDay, setDueDay] = useState(initial?.due_day ? String(initial.due_day) : '');
  const [creditLimit, setCreditLimit] = useState(initial?.credit_limit != null ? String(initial.credit_limit) : '');
  const [minPercent, setMinPercent] = useState(initial?.min_payment_percent != null ? String(initial.min_payment_percent) : '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [borrower, setBorrower] = useState(initial?.borrower ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scheduled = kind !== 'revolving';
  const scheduleLocked = !!initial && scheduled && hasPayments;
  const usesRate = mode === 'annual' || mode === 'monthly';
  const isFixed = scheduled && mode !== 'none' && calc === 'fixed';
  const method: InterestMethod = calc === 'fixed' ? 'reducing' : calc;
  const suggestedPayment =
    scheduled && num(principal) > 0 && Number(term) >= 1
      ? amortizedPayment(num(principal), Number(term), monthlyRate(mode, usesRate ? num(rate) : null))
      : null;

  const schedule = useMemo(() => {
    const P = num(principal);
    const n = Number(term);
    if (!scheduled || !(P > 0) || !(n >= 1 && n <= 600) || !firstDue) return [];
    return buildSchedule({
      principal: P,
      termMonths: n,
      interestMode: mode,
      interestRate: usesRate ? num(rate) : null,
      interestMethod: method,
      firstDueDate: firstDue,
      fixedPayment: isFixed ? num(payment) : null,
    });
  }, [scheduled, principal, term, firstDue, mode, rate, method, usesRate, isFixed, payment]);

  const totalInterest = schedule.reduce((s, r) => s + r.interest, 0);
  const firstPayment = schedule[0] ? schedule[0].principal + schedule[0].interest : 0;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const P = num(principal);
    if (!name.trim()) return setError('กรุณาใส่ชื่อหนี้');
    if (!(P >= 0) || principal.trim() === '') return setError('กรุณาใส่ยอดเงิน');
    if (scheduled && schedule.length === 0) return setError('กรุณาใส่ยอด จำนวนงวด และวันครบกำหนดงวดแรก');
    if (usesRate && !(num(rate) >= 0 && rate.trim() !== '')) return setError('กรุณาใส่อัตราดอกเบี้ย');
    if (isFixed && !(num(payment) > 0)) return setError('กรุณาใส่ยอดผ่อนต่องวด');

    const input: DebtInput = {
      creditor_id: creditorId,
      name: name.trim(),
      kind,
      principal: P,
      interest_mode: mode,
      interest_rate: usesRate ? num(rate) : null,
      interest_method: method,
      term_months: scheduled ? Number(term) : null,
      start_date: startDate,
      first_due_date: scheduled ? firstDue : null,
      due_day: scheduled ? Number(firstDue.slice(8, 10)) : dueDay ? Number(dueDay) : null,
      credit_limit: !scheduled && creditLimit ? num(creditLimit) : null,
      min_payment_percent: !scheduled && minPercent ? num(minPercent) : null,
      installment_amount: isFixed ? num(payment) : null,
      closed_on: initial?.closed_on ?? null,
      note: note.trim() || null,
      borrower: borrower.trim() || null,
    };

    setBusy(true);
    setError(null);
    try {
      if (!initial) {
        await createDebt(input, schedule);
      } else if (scheduleLocked) {
        // Schedule fields are frozen once payments exist; only descriptive fields change.
        await updateDebt(initial.id, { name: input.name, note: input.note, start_date: input.start_date, borrower: input.borrower });
      } else {
        await updateDebt(initial.id, input);
        await replaceSchedule(initial.id, scheduled ? schedule : []);
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
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1 text-sm">
        {(Object.keys(KIND_LABEL) as DebtKind[]).map((k) => (
          <button
            key={k}
            type="button"
            disabled={!!initial}
            onClick={() => {
              setKind(k);
              if (k === 'revolving' && mode === 'manual') setMode('annual');
            }}
            className={`rounded-md px-2 py-1 font-medium ${kind === k ? 'bg-white shadow-sm' : 'text-slate-600'} disabled:cursor-not-allowed`}
          >
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>

      <label className="block">
        <span className="text-sm text-slate-600">ชื่อหนี้</span>
        <input
          className="input mt-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={kind === 'revolving' ? 'เช่น บัตรหลัก, เงินหมุน' : 'เช่น ผ่อนมือถือ, ซื้อรองเท้า'}
          required
        />
      </label>

      <label className="block">
        <span className="text-sm text-slate-600">ผู้ใช้เงินก้อนนี้</span>
        <input
          className="input mt-1"
          list="borrower-options"
          value={borrower}
          onChange={(e) => setBorrower(e.target.value)}
          placeholder="ตัวฉันเอง (เว้นว่างได้) หรือ เช่น แม่"
        />
        <datalist id="borrower-options">
          {Array.from(new Set(['แม่', ...knownBorrowers])).map((b) => (
            <option key={b} value={b} />
          ))}
        </datalist>
        {borrower.trim() && (
          <span className="mt-1 block text-xs text-slate-500">
            ยอดนี้จะแสดงแยกเป็นของ “{borrower.trim()}” และการชำระจะไม่ถูกนับเป็นรายจ่ายของคุณโดยอัตโนมัติ
          </span>
        )}
      </label>

      {scheduleLocked && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          มีการชำระแล้ว จึงแก้ยอด/งวด/ดอกเบี้ยไม่ได้ — แก้ดอกเบี้ยแต่ละงวดได้ในตารางผ่อน
        </p>
      )}

      <fieldset disabled={scheduleLocked} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-sm text-slate-600">{scheduled ? 'ยอดผ่อน (เงินต้น)' : 'ยอดหนี้คงค้างตอนนี้'}</span>
            <input className="input mt-1" inputMode="decimal" value={principal} onChange={(e) => setPrincipal(e.target.value)} required />
          </label>
          {scheduled ? (
            <label className="block">
              <span className="text-sm text-slate-600">จำนวนงวด (เดือน)</span>
              <input className="input mt-1" type="number" min={1} max={600} value={term} onChange={(e) => setTerm(e.target.value)} required />
            </label>
          ) : (
            <label className="block">
              <span className="text-sm text-slate-600">วงเงิน</span>
              <input className="input mt-1" inputMode="decimal" value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} />
            </label>
          )}
        </div>

        <label className="block">
          <span className="text-sm text-slate-600">ดอกเบี้ย</span>
          <select className="input mt-1" value={mode} onChange={(e) => setMode(e.target.value as InterestMode)}>
            {MODE_OPTIONS.filter((o) => scheduled || o.value !== 'manual').map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {mode === 'manual' && scheduled && (
          <p className="text-xs text-slate-500">ระบบสร้างตารางงวดด้วยดอกเบี้ย 0 ก่อน แล้วกรอกดอกเบี้ยของแต่ละเดือนในตารางผ่อนได้</p>
        )}
        {!scheduled && (
          <p className="text-xs text-slate-500">ดอกเบี้ยจริงแต่ละเดือนบันทึกเป็นรายการ “ดอกเบี้ย” ตามใบแจ้งยอดได้</p>
        )}

        {(usesRate || (scheduled && mode === 'manual')) && (
          <div className="grid grid-cols-2 gap-2">
            {usesRate && (
              <label className="block">
                <span className="text-sm text-slate-600">อัตรา (% ต่อ{mode === 'annual' ? 'ปี' : 'เดือน'})</span>
                <input className="input mt-1" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder={mode === 'annual' ? '16' : '1.25'} />
              </label>
            )}
            {scheduled && (
              <label className="block">
                <span className="text-sm text-slate-600">วิธีคิดดอกเบี้ย</span>
                <select className="input mt-1" value={calc} onChange={(e) => setCalc(e.target.value as InterestMethod | 'fixed')}>
                  <option value="fixed">ยอดผ่อนคงที่ (แบบธนาคาร)</option>
                  <option value="reducing">ลดต้นลดดอก (คำนวณเอง)</option>
                  <option value="flat">คงที่ (Flat rate)</option>
                </select>
              </label>
            )}
          </div>
        )}

        {isFixed && (
          <div className="rounded-lg bg-emerald-50 p-3">
            <label className="block">
              <span className="text-sm text-slate-700">ยอดผ่อนต่องวด (ตามสัญญา/ใบแจ้งยอด)</span>
              <div className="mt-1 flex gap-2">
                <input
                  className="input"
                  inputMode="decimal"
                  value={payment}
                  onChange={(e) => setPayment(e.target.value)}
                  placeholder={suggestedPayment ? suggestedPayment.toFixed(2) : 'เช่น 523.73'}
                />
                {suggestedPayment && (
                  <button type="button" className="btn-secondary shrink-0 text-xs" onClick={() => setPayment(suggestedPayment.toFixed(2))}>
                    ใช้ {formatMoney(suggestedPayment)}
                  </button>
                )}
              </div>
            </label>
            <p className="mt-1 text-xs text-slate-600">
              ทุกเดือนกรอกดอกเบี้ยตามใบแจ้งยอด ระบบจะคิดเงินต้น = ยอดผ่อน − ดอกเบี้ย และปรับยอดคงเหลือของงวดถัดไปให้ตรงกับธนาคาร
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-sm text-slate-600">วันที่เริ่ม</span>
            <input className="input mt-1" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </label>
          {scheduled ? (
            <label className="block">
              <span className="text-sm text-slate-600">ครบกำหนดงวดแรก</span>
              <input className="input mt-1" type="date" value={firstDue} onChange={(e) => setFirstDue(e.target.value)} required />
            </label>
          ) : (
            <label className="block">
              <span className="text-sm text-slate-600">ครบกำหนดชำระทุกวันที่</span>
              <input className="input mt-1" type="number" min={1} max={31} value={dueDay} onChange={(e) => setDueDay(e.target.value)} placeholder="เช่น 20" />
            </label>
          )}
        </div>

        {!scheduled && (
          <label className="block">
            <span className="text-sm text-slate-600">ชำระขั้นต่ำ (% ของยอดคงค้าง)</span>
            <input className="input mt-1" inputMode="decimal" value={minPercent} onChange={(e) => setMinPercent(e.target.value)} placeholder="เช่น 8" />
          </label>
        )}
      </fieldset>

      <label className="block">
        <span className="text-sm text-slate-600">หมายเหตุ</span>
        <input className="input mt-1" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>

      {scheduled && schedule.length > 0 && !scheduleLocked && (
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <div className="flex justify-between">
            <span>งวดละ (งวดแรก)</span>
            <b className="tabular-nums">{formatMoney(firstPayment)}</b>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>ดอกเบี้ยรวม</span>
            <span className="tabular-nums">{formatMoney(totalInterest)}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>ยอดรวมที่ต้องจ่าย</span>
            <span className="tabular-nums">{formatMoney(num(principal) + totalInterest)}</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {schedule.length} งวด · {formatThaiDate(schedule[0].due_date)} – {formatThaiDate(schedule[schedule.length - 1].due_date)}
          </div>
          {initial && <div className="mt-1 text-xs text-amber-700">บันทึกแล้วตารางผ่อนจะถูกสร้างใหม่</div>}
        </div>
      )}

      <ErrorText>{error}</ErrorText>
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? 'กำลังบันทึก…' : 'บันทึก'}
      </button>
    </form>
  );
}
