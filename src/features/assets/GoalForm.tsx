import { useState, type FormEvent } from 'react';
import { ErrorText } from '../../components/Modal';
import { formatMoney } from '../../lib/format';
import { errorMessage } from '../../lib/useAsync';
import { assignAssetToGoal, createGoal, deleteGoal, updateGoal } from './api';
import { AssetIcon } from './AssetIcon';
import type { AssetSummary } from './assetMath';
import type { SavingsGoal } from './types';

const ICONS = ['🎯', '🏠', '🚗', '✈️', '💍', '🎓', '🏥', '📱', '🛡️', '🌴'];

interface Props {
  initial?: SavingsGoal;
  existingNames: string[];
  /** Assets currently in this goal (edit only). */
  assets?: AssetSummary[];
  images?: Record<string, string>;
  onSaved: () => void;
}

export function GoalForm({ initial, existingNames, assets = [], images = {}, onSaved }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [target, setTarget] = useState(initial ? String(initial.target_amount) : '');
  const [icon, setIcon] = useState(initial?.icon ?? '🎯');
  const [deadline, setDeadline] = useState(initial?.deadline ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const amount = Number(target.replace(/,/g, ''));
    if (!name.trim()) return setError('ใส่ชื่อเป้าหมาย');
    if (existingNames.some((n) => n === name.trim() && n !== initial?.name)) return setError('มีเป้าหมายชื่อนี้แล้ว');
    if (!(amount > 0)) return setError('เป้าหมายต้องมากกว่า 0');
    const input = { name: name.trim(), target_amount: amount, icon, deadline: deadline || null };
    void run(async () => {
      if (initial) await updateGoal(initial.id, input);
      else await createGoal(input);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {ICONS.map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => setIcon(i)}
            className={`h-9 w-9 rounded-lg text-lg ${icon === i ? 'bg-amber-100 ring-2 ring-amber-500' : 'bg-slate-50'}`}
          >
            {i}
          </button>
        ))}
      </div>
      <label className="block">
        <span className="text-sm text-slate-600">ชื่อเป้าหมาย</span>
        <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น ซื้อบ้าน, ทริปญี่ปุ่น, เงินสำรองฉุกเฉิน" required />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-sm text-slate-600">จำนวนเงินเป้าหมาย</span>
          <input className="input mt-1" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="เช่น 100000" required />
        </label>
        <label className="block">
          <span className="text-sm text-slate-600">ภายในวันที่ (ไม่บังคับ)</span>
          <input className="input mt-1" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </label>
      </div>

      {initial && (
        <div>
          <div className="mb-1 text-sm font-medium">ที่เก็บเงินในเป้าหมายนี้</div>
          {assets.length === 0 && <p className="text-xs text-slate-400">ยังไม่มี ลากการ์ดที่เก็บเงินมาวางบนเป้าหมายนี้</p>}
          <ul className="space-y-1">
            {assets.map((a) => (
              <li key={a.asset.id} className="flex items-center gap-2 text-sm">
                <AssetIcon asset={a.asset} images={images} size="sm" />
                <span className="flex-1 truncate">{a.asset.name}</span>
                <span className="tabular-nums text-amber-600">{formatMoney(a.value)}</span>
                <button
                  type="button"
                  className="text-xs text-slate-400 hover:text-rose-600"
                  disabled={busy}
                  onClick={() => void run(() => assignAssetToGoal(a.asset.id, null))}
                >
                  เอาออก
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ErrorText>{error}</ErrorText>
      <button className="btn-primary w-full bg-amber-500 hover:bg-amber-600" disabled={busy}>
        บันทึก
      </button>
      {initial && (
        <div className="text-right">
          <button
            type="button"
            className="btn-danger px-2 py-1 text-xs"
            onClick={() => {
              if (confirm(`ลบเป้าหมาย "${initial.name}"? ที่เก็บเงินจะยังอยู่ แค่ไม่อยู่ในเป้าหมายนี้`)) void run(() => deleteGoal(initial.id));
            }}
          >
            ลบเป้าหมาย
          </button>
        </div>
      )}
    </form>
  );
}
