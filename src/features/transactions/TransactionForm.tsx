import { useState, type FormEvent } from 'react';
import { ErrorText } from '../../components/Modal';
import { TypeToggle } from '../../components/TypeToggle';
import { todayIso } from '../../lib/format';
import type { Payee, Transaction, TxnType } from '../../lib/types';
import { errorMessage } from '../../lib/useAsync';
import { ensurePayee } from '../payees/api';
import { createTransaction, updateTransaction } from './api';

interface Props {
  payees: Payee[];
  categories: string[];
  initial?: Transaction;
  defaultDate?: string;
  onSaved: () => void;
}

export function TransactionForm({ payees, categories, initial, defaultDate, onSaved }: Props) {
  const [type, setType] = useState<TxnType>(initial?.type ?? 'expense');
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const [date, setDate] = useState(initial?.txn_date ?? defaultDate ?? todayIso());
  const [time, setTime] = useState(initial?.txn_time?.slice(0, 5) ?? '');
  const [payeeName, setPayeeName] = useState(initial?.payee?.name ?? '');
  const [category, setCategory] = useState(initial?.category ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
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
      const fields = {
        type,
        amount: value,
        txn_date: date,
        txn_time: time || null,
        payee_id: payee?.id ?? null,
        category: category.trim() || null,
        note: note.trim() || null,
      };
      if (initial) await updateTransaction(initial.id, fields);
      else await createTransaction({ ...fields, source: 'manual' });
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
