import { useState, type FormEvent } from 'react';
import { ErrorText } from '../../components/Modal';
import { formatMoney, todayIso } from '../../lib/format';
import { errorMessage, useAsync } from '../../lib/useAsync';
import { listCreditors, listDebtPayments, payDebt } from '../debts/api';
import { creditorStatus } from '../debts/simpleDebt';

/**
 * Paying a creditor: money leaves the account and the total owed goes down.
 * It is not an expense — what the debt paid for was counted when it was spent.
 */
export function PayDebtForm({ initialCreditorId, onSaved }: { initialCreditorId?: string; onSaved: () => void }) {
  const today = todayIso();
  const data = useAsync(() => Promise.all([listCreditors(), listDebtPayments(`${today.slice(0, 7)}-01`)]), []);
  const [creditors, payments] = data.data ?? [[], []];
  const owing = creditors.filter((c) => Number(c.balance) > 0);

  const [creditorId, setCreditorId] = useState(initialCreditorId ?? '');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = creditors.find((c) => c.id === creditorId);
  const status = selected ? creditorStatus(selected, payments, today) : null;
  // Suggest what is still due this month once the data has loaded.
  const suggested = status ? (status.remaining > 0 ? status.remaining : status.minimum) : 0;
  const shownAmount = amount || (suggested > 0 ? suggested.toFixed(2) : '');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const value = Number(shownAmount.replace(/,/g, ''));
    if (!selected) return setError('เลือกเจ้าหนี้');
    if (!(value > 0)) return setError('จำนวนเงินต้องมากกว่า 0');
    setBusy(true);
    setError(null);
    try {
      await payDebt(selected.id, value, date, note.trim() || null);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (data.loading) return <p className="text-sm text-slate-400">กำลังโหลด…</p>;
  if (owing.length === 0 && !selected) return <p className="text-sm text-slate-500">ไม่มีหนี้ค้าง — เพิ่มเจ้าหนี้ได้ที่หน้าหนี้สิน</p>;

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="block">
        <span className="text-sm text-slate-600">จ่ายให้</span>
        <select
          className="input mt-1"
          value={creditorId}
          onChange={(e) => {
            setCreditorId(e.target.value);
            setAmount('');
          }}
          required
        >
          <option value="">เลือกเจ้าหนี้</option>
          {(selected && !owing.includes(selected) ? [selected, ...owing] : owing).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · หนี้ {formatMoney(Number(c.balance))}
            </option>
          ))}
        </select>
      </label>
      {status && (
        <p className="text-xs text-slate-500">
          ขั้นต่ำเดือนนี้ {formatMoney(status.minimum)} · จ่ายแล้ว {formatMoney(status.paid)}
          {status.remaining > 0 && <b className="text-amber-700"> · เหลือ {formatMoney(status.remaining)}</b>}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-sm text-slate-600">จำนวนเงิน</span>
          <input className="input mt-1 text-lg" inputMode="decimal" value={shownAmount} onChange={(e) => setAmount(e.target.value)} required />
        </label>
        <label className="block">
          <span className="text-sm text-slate-600">วันที่จ่าย</span>
          <input className="input mt-1" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
      </div>
      {selected && status && status.minimum > 0 && Number(selected.balance) > status.minimum && (
        <button type="button" className="text-xs text-emerald-700 hover:underline" onClick={() => setAmount(String(selected.balance))}>
          จ่ายปิดทั้งหมด {formatMoney(Number(selected.balance))}
        </button>
      )}
      <input className="input" placeholder="หมายเหตุ" value={note} onChange={(e) => setNote(e.target.value)} />
      <p className="text-xs text-slate-500">เงินในบัญชีลดลงและหนี้รวมลดลง — ไม่นับเป็นรายจ่ายซ้ำ</p>
      <ErrorText>{error ?? data.error}</ErrorText>
      <button className="btn-primary w-full" disabled={busy || !selected}>
        {busy ? 'กำลังบันทึก…' : 'บันทึกการจ่าย'}
      </button>
    </form>
  );
}
