import { useState, type FormEvent } from 'react';
import { ErrorText } from '../../components/Modal';
import { todayIso } from '../../lib/format';
import { errorMessage } from '../../lib/useAsync';
import { addDebtEntry } from './api';
import { ENTRY_LABEL, type DebtEntryKind } from './types';

// Payments and credit draws move money in/out of the account; they are never expenses themselves.
// What can be an expense: interest, fees, and the interest part of an installment being paid.
const EXPENSE_LABEL: Partial<Record<DebtEntryKind, string>> = {
  interest: 'นับดอกเบี้ยเป็นรายจ่าย',
  fee: 'นับค่าธรรมเนียมเป็นรายจ่าย',
};

const KIND_HINT: Record<DebtEntryKind, string> = {
  payment: 'เงินออกจากบัญชี ยอดหนี้ลดลง (ไม่นับเป็นรายจ่ายซ้ำ)',
  charge: 'เบิกเงินจากวงเงิน: เงินเข้าบัญชี ยอดหนี้เพิ่มขึ้น — ถ้ารูดซื้อของ ให้บันทึกเป็นรายจ่ายแบบ “จ่ายผ่านบัตร” แทน',
  interest: 'ยอดหนี้เพิ่มขึ้น ไม่มีเงินออกจากบัญชีตอนนี้',
  fee: 'ยอดหนี้เพิ่มขึ้น ไม่มีเงินออกจากบัญชีตอนนี้',
};

interface Props {
  debtId: string;
  /** Paying a specific installment fixes the kind to "payment". */
  installment?: { id: string; seq: number; amount: number };
  allowedKinds: DebtEntryKind[];
  defaultAmount?: number;
  /** Someone else using this money: their interest/fees go to รอรับ instead of my expenses. */
  borrower?: string | null;
  /** Whether each entry kind is booked as my expense by default (missing kinds: off). */
  expenseDefaults?: Partial<Record<DebtEntryKind, boolean>>;
  onSaved: () => void;
}

export function EntryForm({ debtId, installment, allowedKinds, defaultAmount, borrower, expenseDefaults = {}, onSaved }: Props) {
  const [kind, setKind] = useState<DebtEntryKind>(allowedKinds[0]);
  const [amount, setAmount] = useState(
    installment ? installment.amount.toFixed(2) : defaultAmount ? defaultAmount.toFixed(2) : '',
  );
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState('');
  const [recordExpense, setRecordExpense] = useState(expenseDefaults[allowedKinds[0]] ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const value = Number(amount.replace(/,/g, ''));
    if (!(value > 0)) return setError('จำนวนเงินต้องมากกว่า 0');
    setBusy(true);
    setError(null);
    try {
      await addDebtEntry({
        debtId,
        kind,
        amount: value,
        date,
        note: note.trim() || null,
        installmentId: installment?.id ?? null,
        recordExpense,
      });
      onSaved();
    } catch (err) {
      const message = errorMessage(err);
      setError(/duplicate|unique/i.test(message) ? 'งวดนี้ชำระไปแล้ว' : message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {installment ? (
        <p className="text-sm text-slate-600">ชำระงวดที่ {installment.seq}</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {allowedKinds.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setKind(k);
                setRecordExpense(expenseDefaults[k] ?? false);
              }}
              className={`rounded-full px-3 py-1 text-sm ${kind === k ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}
            >
              {ENTRY_LABEL[k]}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-sm text-slate-600">จำนวนเงิน</span>
          <input className="input mt-1 text-lg" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus />
        </label>
        <label className="block">
          <span className="text-sm text-slate-600">วันที่</span>
          <input className="input mt-1" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
      </div>
      <input className="input" placeholder="หมายเหตุ" value={note} onChange={(e) => setNote(e.target.value)} />
      <p className="text-xs text-slate-500">{KIND_HINT[kind]}</p>
      {(EXPENSE_LABEL[kind] || (kind === 'payment' && installment)) && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={recordExpense} onChange={(e) => setRecordExpense(e.target.checked)} />
          {borrower
            ? `เพิ่มใน “รอรับจาก ${borrower}”`
            : kind === 'payment'
              ? 'นับดอกเบี้ยของงวดนี้เป็นรายจ่าย'
              : EXPENSE_LABEL[kind]}
        </label>
      )}
      <ErrorText>{error}</ErrorText>
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? 'กำลังบันทึก…' : 'บันทึก'}
      </button>
    </form>
  );
}
