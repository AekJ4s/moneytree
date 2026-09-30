import { useState } from 'react';
import { ErrorText } from '../../components/Modal';
import type { Payee, PayeeRule, TxnType } from '../../lib/types';
import { errorMessage, useAsync } from '../../lib/useAsync';
import { toKeywordValue } from '../slips/matching';
import { deletePayee, deleteRule, listPayees, listRules, updatePayee, upsertRule } from './api';

/** Lists payees with their slip-mapping rules so wrong mappings can be fixed. */
export function PayeesPage() {
  const data = useAsync(() => Promise.all([listPayees(), listRules()]), []);
  const [payees, rules] = data.data ?? [[], []];
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
      data.reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const filtered = payees.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">ผู้รับ & การแมปสลิป</h1>
        <p className="text-sm text-slate-500">
          ระบบจำว่า QR/ข้อความบนสลิปแบบไหนคือผู้รับรายไหน ถ้าแมปผิดสามารถลบหรือเพิ่มคำค้นได้ที่นี่
        </p>
      </div>
      <input className="input" placeholder="ค้นหาผู้รับ…" value={query} onChange={(e) => setQuery(e.target.value)} />
      <ErrorText>{data.error ?? error}</ErrorText>
      {!data.loading && filtered.length === 0 && (
        <p className="py-6 text-center text-sm text-slate-400">ยังไม่มีผู้รับ — จะถูกสร้างอัตโนมัติเมื่อบันทึกรายการ</p>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {filtered.map((p) => (
          <PayeeCard key={p.id} payee={p} rules={rules.filter((r) => r.payee_id === p.id)} run={run} />
        ))}
      </div>
    </div>
  );
}

interface CardProps {
  payee: Payee;
  rules: PayeeRule[];
  run: (action: () => Promise<void>) => Promise<void>;
}

function PayeeCard({ payee, rules, run }: CardProps) {
  const [name, setName] = useState(payee.name);
  const [category, setCategory] = useState(payee.category ?? '');
  const [keyword, setKeyword] = useState('');
  const dirty = name.trim() !== payee.name || (category.trim() || null) !== payee.category;

  return (
    <div className="card space-y-2">
      <div className="flex gap-2">
        <input className="input font-medium" value={name} onChange={(e) => setName(e.target.value)} aria-label="ชื่อผู้รับ" />
        <select
          className="input w-auto"
          value={payee.default_type}
          onChange={(e) => void run(() => updatePayee(payee.id, { default_type: e.target.value as TxnType }))}
          aria-label="ประเภทเริ่มต้น"
        >
          <option value="expense">รายจ่าย</option>
          <option value="income">รายรับ</option>
        </select>
      </div>
      <div className="flex gap-2">
        <input className="input" placeholder="หมวดหมู่เริ่มต้น" value={category} onChange={(e) => setCategory(e.target.value)} />
        {dirty && (
          <button
            className="btn-primary"
            onClick={() => void run(() => updatePayee(payee.id, { name: name.trim(), category: category.trim() || null }))}
            disabled={!name.trim()}
          >
            บันทึก
          </button>
        )}
      </div>

      <div>
        <div className="mb-1 text-xs font-medium text-slate-500">กฎการแมป</div>
        {rules.length === 0 && <p className="text-xs text-slate-400">ยังไม่มี</p>}
        <div className="flex flex-wrap gap-1">
          {rules.map((r) => (
            <span key={r.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs">
              {r.match_type === 'promptpay' ? '📱 PromptPay' : '🔤'} <span className="max-w-48 truncate">{r.match_type === 'promptpay' ? r.match_value.split(':')[1] : r.match_value}</span>
              <button className="text-slate-400 hover:text-rose-600" onClick={() => void run(() => deleteRule(r.id))} aria-label="ลบกฎ">
                ✕
              </button>
            </span>
          ))}
        </div>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const value = toKeywordValue(keyword);
            if (value.length < 2) return;
            void run(async () => {
              await upsertRule(payee.id, 'keyword', value);
              setKeyword('');
            });
          }}
        >
          <input className="input py-1" placeholder="เพิ่มคำค้นบนสลิป" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
          <button className="btn-secondary py-1" disabled={toKeywordValue(keyword).length < 2}>
            เพิ่ม
          </button>
        </form>
      </div>

      <div className="text-right">
        <button
          className="btn-danger px-2 py-1 text-xs"
          onClick={() => {
            if (confirm(`ลบ "${payee.name}"? รายการเดิมจะยังอยู่แต่ไม่มีชื่อผู้รับ`)) void run(() => deletePayee(payee.id));
          }}
        >
          ลบผู้รับ
        </button>
      </div>
    </div>
  );
}
