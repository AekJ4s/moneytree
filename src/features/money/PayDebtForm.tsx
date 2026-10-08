import { useMemo, useState, type FormEvent } from 'react';
import { ErrorText } from '../../components/Modal';
import { formatMoney, formatThaiDate, todayIso } from '../../lib/format';
import { errorMessage, useAsync } from '../../lib/useAsync';
import { addDebtEntry, listCreditors, loadDebtData } from '../debts/api';
import { paidInstallmentIds, summarizeAll } from '../debts/debtMath';
import { KIND_LABEL } from '../debts/types';

/**
 * Paying a card bill or a loan from the account. Money leaves the account and the debt goes down;
 * it is not an expense (what was bought was counted when it happened) — except installment interest.
 */
export function PayDebtForm({ onSaved }: { onSaved: () => void }) {
  const creditors = useAsync(listCreditors, []);
  const data = useAsync(() => loadDebtData(), []);
  const today = todayIso();
  const open = useMemo(() => (data.data ? summarizeAll(data.data, today) : []), [data.data, today]);

  const [creditorId, setCreditorId] = useState('');
  const [debtId, setDebtId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [countInterest, setCountInterest] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const withDebt = (creditors.data ?? []).filter((c) => open.some((d) => d.debt.creditor_id === c.id));
  const debts = open.filter((d) => d.debt.creditor_id === creditorId);
  const chosen = debts.find((d) => d.debt.id === debtId);

  // Next unpaid installment for installment / PayLater debts.
  const nextInstallment = useMemo(() => {
    if (!chosen || chosen.debt.kind === 'revolving' || !data.data) return null;
    const entries = data.data.entries.filter((e) => e.debt_id === chosen.debt.id);
    const paid = paidInstallmentIds(entries);
    return (
      data.data.installments
        .filter((i) => i.debt_id === chosen.debt.id && !paid.has(i.id))
        .sort((a, b) => a.seq - b.seq)[0] ?? null
    );
  }, [chosen, data.data]);

  function suggested(d: (typeof open)[number]): number {
    if (d.debt.kind !== 'revolving') return d.summary.nextDue?.amount ?? 0;
    const cycle = d.summary.cycle;
    return cycle ? (cycle.billed > 0 ? cycle.billed : cycle.unbilled) : d.summary.outstanding;
  }

  function pickCreditor(id: string) {
    setCreditorId(id);
    const first = open.find((d) => d.debt.creditor_id === id);
    pickDebt(first?.debt.id ?? '');
  }

  function pickDebt(id: string) {
    setDebtId(id);
    const d = open.find((x) => x.debt.id === id);
    setAmount(d ? suggested(d).toFixed(2) : '');
    setCountInterest(!d?.debt.borrower);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const value = Number(amount.replace(/,/g, ''));
    if (!chosen) return setError('เลือกหนี้ที่จะชำระ');
    if (!(value > 0)) return setError('จำนวนเงินต้องมากกว่า 0');
    setBusy(true);
    setError(null);
    try {
      await addDebtEntry({
        debtId: chosen.debt.id,
        kind: 'payment',
        amount: value,
        date,
        note: note.trim() || null,
        installmentId: nextInstallment?.id ?? null,
        recordExpense: !!nextInstallment && countInterest,
      });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (data.loading || creditors.loading) return <p className="text-sm text-slate-400">กำลังโหลด…</p>;
  if (withDebt.length === 0) return <p className="text-sm text-slate-500">ยังไม่มีหนี้หรือยอดบัตรที่ต้องชำระ</p>;

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="block">
        <span className="text-sm text-slate-600">ชำระให้</span>
        <select className="input mt-1" value={creditorId} onChange={(e) => pickCreditor(e.target.value)} required>
          <option value="">เลือกเจ้าหนี้ / บัตร</option>
          {withDebt.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      {debts.length > 0 && (
        <div className="space-y-1">
          {debts.map((d) => (
            <label
              key={d.debt.id}
              className={`flex cursor-pointer items-center gap-2 rounded-lg p-2 text-sm ring-1 ${debtId === d.debt.id ? 'bg-emerald-50 ring-emerald-500' : 'ring-slate-200'}`}
            >
              <input type="radio" name="debt" checked={debtId === d.debt.id} onChange={() => pickDebt(d.debt.id)} />
              <span className="min-w-0 flex-1">
                <span className="font-medium">{d.debt.name}</span>
                <span className="text-xs text-slate-500">
                  {' '}
                  · {KIND_LABEL[d.debt.kind]}
                  {d.debt.borrower && ` · 👤 ${d.debt.borrower}`}
                </span>
                {d.summary.nextDue && (
                  <span className="block text-xs text-slate-500">
                    ครบกำหนด {formatThaiDate(d.summary.nextDue.date)} · {formatMoney(suggested(d))}
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-sm text-slate-600">จำนวนเงิน</span>
          <input className="input mt-1 text-lg" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </label>
        <label className="block">
          <span className="text-sm text-slate-600">วันที่จ่าย</span>
          <input className="input mt-1" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
      </div>
      {nextInstallment && (
        <>
          <p className="text-xs text-slate-500">
            ชำระงวดที่ {nextInstallment.seq} (เงินต้น {formatMoney(Number(nextInstallment.principal))} + ดอกเบี้ย{' '}
            {formatMoney(Number(nextInstallment.interest))})
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={countInterest} onChange={(e) => setCountInterest(e.target.checked)} />
            นับดอกเบี้ยงวดนี้ {formatMoney(Number(nextInstallment.interest))} เป็นรายจ่าย
          </label>
        </>
      )}
      <input className="input" placeholder="หมายเหตุ" value={note} onChange={(e) => setNote(e.target.value)} />
      <p className="text-xs text-slate-500">เงินในบัญชีและยอดรอจ่ายลดลง โดยไม่นับเป็นรายจ่ายซ้ำ เพราะนับไปแล้วตอนใช้จ่าย</p>
      <ErrorText>{error ?? data.error ?? creditors.error}</ErrorText>
      <button className="btn-primary w-full" disabled={busy || !chosen}>
        {busy ? 'กำลังบันทึก…' : 'บันทึกการชำระ'}
      </button>
    </form>
  );
}
