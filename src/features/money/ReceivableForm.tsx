import { useState, type FormEvent } from 'react';
import { ErrorText } from '../../components/Modal';
import { formatMoney, todayIso } from '../../lib/format';
import { errorMessage, useAsync } from '../../lib/useAsync';
import { createTransaction } from '../transactions/api';
import { addReceivableEntry, listReceivableEntries, receivableBalances, type ReceivableKind } from './api';

const KINDS: { value: ReceivableKind; label: string; hint: string }[] = [
  { value: 'collect', label: 'รับเงินคืน', hint: 'เงินเข้าบัญชี และยอดรอรับลดลง' },
  { value: 'lend', label: 'ให้ยืม / โอนให้', hint: 'เงินออกจากบัญชี และยอดรอรับเพิ่มขึ้น' },
  { value: 'charge', label: 'เพิ่มยอดที่ต้องคืน', hint: 'ไม่มีเงินเข้าออก เช่น ดอกเบี้ยที่เราจ่ายแทนไปก่อน' },
];

/** Money lent to / collected from people (รอรับ). */
export function ReceivableForm({ onSaved }: { onSaved: () => void }) {
  const entries = useAsync(() => listReceivableEntries(), []);
  const balances = receivableBalances(entries.data ?? []);
  const people = Array.from(new Set(['แม่', ...balances.keys()]));

  const [kind, setKind] = useState<ReceivableKind>('collect');
  const [person, setPerson] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState('');
  const [extraAsIncome, setExtraAsIncome] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const owed = balances.get(person.trim()) ?? 0;
  const value = Number(amount.replace(/,/g, '')) || 0;
  const extra = kind === 'collect' ? Math.round((value - Math.max(0, owed)) * 100) / 100 : 0;
  const splitExtra = extra > 0 && extraAsIncome;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!person.trim()) return setError('ใส่ชื่อคน');
    if (!(value > 0)) return setError('จำนวนเงินต้องมากกว่า 0');
    setBusy(true);
    setError(null);
    try {
      const repay = splitExtra ? value - extra : value;
      if (repay > 0) {
        await addReceivableEntry({ person, kind, amount: Math.round(repay * 100) / 100, date, note: note.trim() || null });
      }
      if (splitExtra) {
        // Anything above what they owe (e.g. pocket money from Mom) is my income.
        await createTransaction({
          type: 'income',
          amount: extra,
          txn_date: date,
          category: 'ค่าขนม',
          note: `จาก ${person.trim()}${note.trim() ? ` · ${note.trim()}` : ''}`,
          source: 'manual',
        });
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
        {KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            onClick={() => setKind(k.value)}
            className={`rounded-md px-2 py-1 font-medium ${kind === k.value ? 'bg-white shadow-sm' : 'text-slate-600'}`}
          >
            {k.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-500">{KINDS.find((k) => k.value === kind)?.hint}</p>

      <label className="block">
        <span className="text-sm text-slate-600">คน</span>
        <input className="input mt-1" list="people-options" value={person} onChange={(e) => setPerson(e.target.value)} placeholder="เช่น แม่" required />
        <datalist id="people-options">
          {people.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        {person.trim() && <span className="mt-1 block text-xs text-slate-500">ค้างรับจาก {person.trim()} ตอนนี้ {formatMoney(owed)}</span>}
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-sm text-slate-600">จำนวนเงิน</span>
          <input className="input mt-1 text-lg" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </label>
        <label className="block">
          <span className="text-sm text-slate-600">วันที่</span>
          <input className="input mt-1" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
      </div>

      {extra > 0 && (
        <label className="flex items-center gap-2 rounded-lg bg-emerald-50 p-2 text-sm">
          <input type="checkbox" checked={extraAsIncome} onChange={(e) => setExtraAsIncome(e.target.checked)} />
          ส่วนที่เกินยอดค้าง {formatMoney(extra)} บันทึกเป็นรายรับ (ค่าขนม)
        </label>
      )}

      <input className="input" placeholder="หมายเหตุ" value={note} onChange={(e) => setNote(e.target.value)} />
      <ErrorText>{error ?? entries.error}</ErrorText>
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? 'กำลังบันทึก…' : 'บันทึก'}
      </button>
    </form>
  );
}
