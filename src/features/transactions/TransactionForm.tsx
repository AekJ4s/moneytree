import { useState, type FormEvent } from 'react';
import { ErrorText } from '../../components/Modal';
import { TypeToggle } from '../../components/TypeToggle';
import { todayIso } from '../../lib/format';
import { nextDueDate } from '../../lib/recurrence';
import type { Payee, Transaction, TxnType } from '../../lib/types';
import { errorMessage } from '../../lib/useAsync';
import { CardBillingHint } from '../debts/CardBillingHint';
import type { Creditor } from '../debts/types';
import type { Asset } from '../assets/types';
import { isSavingsCategory } from '../../lib/savings';
import { ensurePayee } from '../payees/api';
import { createRecurring } from '../recurring/api';
import { createTransaction, updateTransaction } from './api';

interface Props {
  payees: Payee[];
  categories: string[];
  /** Cards / credit lines an expense can be charged to. */
  creditors?: Creditor[];
  /** Where savings/investment money can be kept. */
  assets?: Asset[];
  initial?: Transaction;
  defaultDate?: string;
  onSaved: () => void;
}

export function TransactionForm({ payees, categories, creditors = [], assets = [], initial, defaultDate, onSaved }: Props) {
  const [type, setType] = useState<TxnType>(initial?.type ?? 'expense');
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const [date, setDate] = useState(initial?.txn_date ?? defaultDate ?? todayIso());
  const [time, setTime] = useState(initial?.txn_time?.slice(0, 5) ?? '');
  const [payeeName, setPayeeName] = useState(initial?.payee?.name ?? '');
  const [category, setCategory] = useState(initial?.category ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  // '' = paid from the account; otherwise the creditor (card) it was charged to.
  const [cardId, setCardId] = useState(initial?.payment_method === 'card' ? (initial.creditor_id ?? '') : '');
  const [makeRecurring, setMakeRecurring] = useState(false);
  const [assetId, setAssetId] = useState(initial?.asset_id ?? '');
  const savings = isSavingsCategory(category) || !!assetId;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onPayeeChange(name: string) {
    setPayeeName(name);
    const known = payees.find((p) => p.name === name);
    if (known) {
      setType(known.default_type);
      if (!category && known.category) setCategory(known.category);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    if (!(value > 0)) {
      setError('จำนวนเงินต้องมากกว่า 0');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payee = payeeName.trim() ? await ensurePayee(payeeName, type, category.trim() || null) : null;
      // Interest booked by a debt payment keeps its method; otherwise expenses are cash or card.
      const keepDebt = initial?.payment_method === 'debt';
      // Savings move money out of the account, so they are never charged to a card.
      const card = type === 'expense' && !keepDebt && !savings && cardId ? creditors.find((c) => c.id === cardId) : undefined;
      const fields = {
        type,
        amount: value,
        txn_date: date,
        txn_time: time || null,
        payee_id: payee?.id ?? null,
        category: category.trim() || null,
        note: note.trim() || null,
        payment_method: keepDebt ? ('debt' as const) : card ? ('card' as const) : ('cash' as const),
        creditor_id: keepDebt ? (initial?.creditor_id ?? null) : (card?.id ?? null),
        account: keepDebt ? (initial?.account ?? null) : (card?.name ?? assets.find((a) => a.id === assetId)?.name ?? null),
        asset_id: savings && assetId ? assetId : null,
      };
      // Optionally turn this entry (new or already saved) into a monthly recurring item.
      let recurringId: string | null = initial?.recurring_id ?? null;
      if (makeRecurring && !recurringId) {
        const day = Number(date.slice(8, 10));
        const rule = { interval_unit: 'month' as const, interval_count: 1, due_day: day, due_last_day: false };
        // Next occurrence after this one, skipping months that are already in the past.
        let next = nextDueDate(date, rule);
        while (next < todayIso()) next = nextDueDate(next, rule);
        recurringId = await createRecurring({
          name: payee?.name ?? (note.trim() || category.trim() || (type === 'income' ? 'รายรับประจำ' : 'รายจ่ายประจำ')),
          type,
          amount: value,
          category: fields.category,
          payee_id: fields.payee_id,
          interval_unit: 'month',
          interval_count: 1,
          due_day: day,
          due_last_day: false,
          next_due_date: next,
          pay_creditor_id: card?.id ?? null,
          note: null,
          active: true,
        });
      }
      if (initial) await updateTransaction(initial.id, { ...fields, recurring_id: recurringId });
      else await createTransaction({ ...fields, source: 'manual', recurring_id: recurringId });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <TypeToggle value={type} onChange={setType} />
      <label className="block">
        <span className="text-sm text-slate-600">จำนวนเงิน (บาท)</span>
        <input
          className="input mt-1 text-lg"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
          autoFocus
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm text-slate-600">วันที่</span>
          <input className="input mt-1" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label className="block">
          <span className="text-sm text-slate-600">เวลา</span>
          <input className="input mt-1" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
      </div>
      <label className="block">
        <span className="text-sm text-slate-600">ผู้รับ / ที่มา</span>
        <input
          className="input mt-1"
          list="payee-options"
          value={payeeName}
          onChange={(e) => onPayeeChange(e.target.value)}
          placeholder="เช่น ร้านข้าว, บริษัท"
        />
      </label>
      <label className="block">
        <span className="text-sm text-slate-600">หมวดหมู่</span>
        <input
          className="input mt-1"
          list="category-options"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="เช่น อาหาร, เงินเดือน"
        />
      </label>
      <label className="block">
        <span className="text-sm text-slate-600">หมายเหตุ</span>
        <input className="input mt-1" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {savings && (
        <label className="block">
          <span className="text-sm text-slate-600">{type === 'expense' ? 'เก็บไว้ที่' : 'ถอนจาก'}</span>
          <select className="input mt-1" value={assetId} onChange={(e) => setAssetId(e.target.value)}>
            <option value="">ไม่ระบุ</option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.icon} {a.name}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-amber-700">🪙 ออม/ลงทุน ไม่นับเป็นรายรับ-รายจ่าย</span>
        </label>
      )}
      {type === 'expense' && !savings && initial?.payment_method !== 'debt' && (
        <label className="block">
          <span className="text-sm text-slate-600">จ่ายผ่าน</span>
          <select className="input mt-1" value={cardId} onChange={(e) => setCardId(e.target.value)}>
            <option value="">บัญชี / เงินสด (เงินออกทันที)</option>
            {creditors.map((c) => (
              <option key={c.id} value={c.id}>
                💳 {c.name}
              </option>
            ))}
          </select>
          {cardId && (
            <span className="mt-1 block text-xs text-slate-500">
              นับเป็นรายจ่ายวันนี้ แต่เงินในบัญชียังไม่ลด — ยอดนี้ไปอยู่ใน “รอจ่าย” ของบัตรจนกว่าจะจ่ายบิล
            </span>
          )}
          <CardBillingHint card={creditors.find((c) => c.id === cardId)} date={date} />
        </label>
      )}
      {initial?.recurring_id ? (
        <p className="text-xs text-slate-500">🔁 รายการนี้เป็นรายการประจำแล้ว — แก้รอบ/ยอดได้ที่หน้ารายการประจำ</p>
      ) : (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={makeRecurring} onChange={(e) => setMakeRecurring(e.target.checked)} />
          ทำเป็น{type === 'income' ? 'รายรับ' : 'รายจ่าย'}ประจำทุกเดือน (วันที่ {Number(date.slice(8, 10)) || '–'})
        </label>
      )}
      <PayeeCategoryOptions payees={payees} categories={categories} />
      <ErrorText>{error}</ErrorText>
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? 'กำลังบันทึก…' : 'บันทึก'}
      </button>
    </form>
  );
}

/** Shared <datalist>s so payee/category inputs autocomplete from existing values. */
export function PayeeCategoryOptions({ payees, categories }: { payees: Payee[]; categories: string[] }) {
  const allCategories = Array.from(
    new Set([...categories, ...payees.map((p) => p.category).filter((c): c is string => !!c)]),
  );
  return (
    <>
      <datalist id="payee-options">
        {payees.map((p) => (
          <option key={p.id} value={p.name} />
        ))}
      </datalist>
      <datalist id="category-options">
        {allCategories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </>
  );
}
