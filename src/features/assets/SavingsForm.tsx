import { useState, type FormEvent } from 'react';
import { ErrorText } from '../../components/Modal';
import { todayIso } from '../../lib/format';
import { errorMessage, useAsync } from '../../lib/useAsync';
import { createTransaction } from '../transactions/api';
import { createAsset, listAssets } from './api';
import { AssetIcon, useAssetImages } from './AssetIcon';
import { ASSET_KINDS, ASSET_PRESETS, type Asset } from './types';

/**
 * Moving money into (or back out of) savings/investments. It leaves the account but is not an expense:
 * stored as a "ลงทุน" / "เก็บออม" transaction linked to where the money now is.
 */
export function SavingsForm({ defaultDate, onSaved }: { defaultDate?: string; onSaved: () => void }) {
  const assets = useAsync(listAssets, []);
  const [assetId, setAssetId] = useState('');
  const [direction, setDirection] = useState<'deposit' | 'withdraw'>('deposit');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(defaultDate ?? todayIso());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = assets.data ?? [];
  const images = useAssetImages(list);
  const missingPresets = ASSET_PRESETS.filter((p) => !list.some((a) => a.name === p.name));

  async function addPreset(name: string) {
    const preset = ASSET_PRESETS.find((p) => p.name === name);
    if (!preset) return;
    try {
      const created = await createAsset({ name: preset.name, kind: preset.kind, icon: preset.icon, target_amount: null, note: null });
      assets.reload();
      setAssetId(created.id);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const value = Number(amount.replace(/,/g, ''));
    const asset: Asset | undefined = list.find((a) => a.id === assetId);
    if (!asset) return setError('เลือกที่เก็บเงิน');
    if (!(value > 0)) return setError('จำนวนเงินต้องมากกว่า 0');
    setBusy(true);
    setError(null);
    try {
      await createTransaction({
        type: direction === 'deposit' ? 'expense' : 'income',
        amount: value,
        txn_date: date,
        category: ASSET_KINDS[asset.kind].category,
        note: note.trim() || `${direction === 'deposit' ? 'เก็บเข้า' : 'ถอนจาก'} ${asset.name}`,
        account: asset.name,
        asset_id: asset.id,
        source: 'manual',
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
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 text-sm">
        {(
          [
            ['deposit', '🪙 เก็บ / ลงทุนเพิ่ม'],
            ['withdraw', '↩️ ถอนออกมาใช้'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setDirection(value)}
            className={`rounded-md px-2 py-1 font-medium ${direction === value ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-600'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div>
        <span className="text-sm text-slate-600">{direction === 'deposit' ? 'เก็บไว้ที่' : 'ถอนจาก'}</span>
        <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {list.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setAssetId(a.id)}
              className={`flex items-center gap-2 rounded-lg p-2 text-left text-sm ring-1 ${
                assetId === a.id ? 'bg-amber-50 ring-amber-500' : 'ring-slate-200 hover:bg-slate-50'
              }`}
            >
              <AssetIcon asset={a} images={images} size="sm" />
              <span className="truncate">{a.name}</span>
            </button>
          ))}
        </div>
        {missingPresets.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1 text-xs">
            <span className="text-slate-500">เพิ่มด่วน:</span>
            {missingPresets.map((p) => (
              <button key={p.name} type="button" className="rounded-full bg-slate-100 px-2 py-0.5 hover:bg-amber-100" onClick={() => void addPreset(p.name)}>
                {p.icon} {p.name}
              </button>
            ))}
          </div>
        )}
      </div>

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
      <input className="input" placeholder="หมายเหตุ เช่น ซื้อหุ้น NBIS" value={note} onChange={(e) => setNote(e.target.value)} />
      <p className="text-xs text-slate-500">
        {direction === 'deposit'
          ? 'เงินในบัญชีลดลงและไปอยู่ในที่เก็บนี้ — ไม่นับเป็นรายจ่าย แสดงเป็นสีทองในปฏิทิน'
          : 'เงินกลับเข้าบัญชี — ไม่นับเป็นรายรับ'}
      </p>
      <ErrorText>{error ?? assets.error}</ErrorText>
      <button className="btn-primary w-full bg-amber-500 hover:bg-amber-600" disabled={busy}>
        {busy ? 'กำลังบันทึก…' : 'บันทึก'}
      </button>
    </form>
  );
}
