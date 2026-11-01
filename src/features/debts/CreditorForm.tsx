import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { ErrorText } from '../../components/Modal';
import { formatMoney, todayIso } from '../../lib/format';
import { errorMessage } from '../../lib/useAsync';
import { useUserId } from '../auth/AuthProvider';
import { CREDITOR_PRESETS, createCreditor, isBundledLogo, updateCreditor, uploadCreditorLogo } from './api';
import { CreditorLogo } from './CreditorLogo';
import { minimumPayment } from './simpleDebt';
import type { Creditor } from './types';

interface Props {
  initial?: Creditor;
  initialLogoUrl?: string | null;
  existingNames: string[];
  onSaved: (creditor?: Creditor) => void;
}

/** Parses an optional money/number field; empty means not set. */
function num(value: string): number | null {
  const n = Number(value.replace(/,/g, ''));
  return value.trim() && Number.isFinite(n) ? n : null;
}

export function CreditorForm({ initial, initialLogoUrl, existingNames, onSaved }: Props) {
  const userId = useUserId();
  const [name, setName] = useState(initial?.name ?? '');
  const [logo, setLogo] = useState<string | null>(initial?.logo ?? null);
  const [file, setFile] = useState<File | null>(null);
  const [creditLimit, setCreditLimit] = useState(initial?.credit_limit != null ? String(initial.credit_limit) : '');
  const [statementDay, setStatementDay] = useState(initial?.statement_day ? String(initial.statement_day) : '');
  const [dueDay, setDueDay] = useState(initial?.due_day ? String(initial.due_day) : '');
  const [balance, setBalance] = useState(initial ? String(initial.balance) : '');
  const [minAmount, setMinAmount] = useState(initial?.min_payment != null ? String(initial.min_payment) : '');
  const [minPercent, setMinPercent] = useState(initial?.min_payment_percent != null ? String(initial.min_payment_percent) : '');
  const [preview, setPreview] = useState<string | null>(initialLogoUrl ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function pickPreset(preset: { name: string; logo: string }) {
    setLogo(preset.logo);
    setFile(null);
    setPreview(preset.logo);
    if (!name.trim()) setName(preset.name);
  }

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) setFile(f);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (existingNames.some((n) => n === trimmed && n !== initial?.name)) {
      setError('มีเจ้าหนี้ชื่อนี้แล้ว');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const owed = num(balance) ?? 0;
      if (owed < 0) throw new Error('หนี้รวมต้องไม่ติดลบ');
      const finalLogo = file ? await uploadCreditorLogo(userId, file) : logo;
      const input = {
        name: trimmed,
        logo: finalLogo,
        balance: owed,
        min_payment: num(minAmount),
        min_payment_percent: num(minPercent),
        // Changing the total means it was just read off the bank app.
        balance_updated_on: !initial || owed !== Number(initial.balance) ? todayIso() : initial.balance_updated_on,
        credit_limit: creditLimit.trim() ? Number(creditLimit.replace(/,/g, '')) : null,
        statement_day: statementDay ? Number(statementDay) : null,
        due_day: dueDay ? Number(dueDay) : null,
      };
      if (initial) {
        await updateCreditor(initial.id, input);
        onSaved();
      } else {
        onSaved(await createCreditor(input));
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const unusedPresets = CREDITOR_PRESETS.filter((p) => !existingNames.includes(p.name) || p.name === initial?.name);

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="flex items-center gap-3">
        <CreditorLogo name={name || '?'} src={preview} size="lg" />
        <div className="flex-1 space-y-2">
          <input className="input" placeholder="ชื่อเจ้าหนี้ เช่น LINE BK" value={name} onChange={(e) => setName(e.target.value)} required />
          <div className="flex gap-2">
            <label className="btn-secondary cursor-pointer py-1 text-xs">
              อัปโหลดโลโก้
              <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={onFile} />
            </label>
            {(logo || file) && (
              <button
                type="button"
                className="btn-danger py-1 text-xs"
                onClick={() => {
                  setLogo(null);
                  setFile(null);
                  setPreview(null);
                }}
              >
                ไม่ใช้โลโก้
              </button>
            )}
          </div>
        </div>
      </div>

      {unusedPresets.length > 0 && (
        <div>
          <div className="mb-1 text-xs text-slate-500">หรือเลือกจากรายการ</div>
          <div className="flex flex-wrap gap-2">
            {unusedPresets.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => pickPreset(p)}
                className={`flex items-center gap-2 rounded-lg px-2 py-1 text-xs ring-1 ${
                  logo === p.logo && !file ? 'bg-emerald-50 ring-emerald-500' : 'ring-slate-200 hover:bg-slate-50'
                }`}
              >
                <CreditorLogo name={p.name} src={p.logo} size="sm" />
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2 rounded-lg bg-rose-50 p-3">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">หนี้รวมตอนนี้ (ตามแอปธนาคาร)</span>
          <input className="input mt-1 text-lg" inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="เช่น 77506.62" />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-xs text-slate-600">ขั้นต่ำต่อเดือน (บาท)</span>
            <input className="input mt-1" inputMode="decimal" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} placeholder="เช่น 3000" />
          </label>
          <label className="block">
            <span className="text-xs text-slate-600">หรือ % ของหนี้รวม</span>
            <input className="input mt-1" inputMode="decimal" value={minPercent} onChange={(e) => setMinPercent(e.target.value)} placeholder="เช่น 8" />
          </label>
        </div>
        <p className="text-xs text-slate-600">
          ขั้นต่ำเดือนนี้ ≈ <b>{formatMoney(minimumPayment({ balance: num(balance) ?? 0, min_payment: num(minAmount), min_payment_percent: num(minPercent) }))}</b>
          {minAmount.trim() && minPercent.trim() && ' (ใช้ยอดบาทเป็นหลัก)'}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <label className="block">
          <span className="text-xs text-slate-600">วงเงินรวม</span>
          <input className="input mt-1" inputMode="decimal" value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} placeholder="เช่น 100000" />
        </label>
        <label className="block">
          <span className="text-xs text-slate-600">วันตัดรอบบัญชี</span>
          <input className="input mt-1" type="number" min={1} max={31} value={statementDay} onChange={(e) => setStatementDay(e.target.value)} placeholder="เช่น 21" />
        </label>
        <label className="block">
          <span className="text-xs text-slate-600">ครบกำหนดทุกวันที่</span>
          <input className="input mt-1" type="number" min={1} max={31} value={dueDay} onChange={(e) => setDueDay(e.target.value)} placeholder="เช่น 20" />
        </label>
      </div>
      <p className="text-xs text-slate-500">
        วงเงินและวันตัดรอบไม่บังคับ — ใส่ไว้เพื่อดูวงเงินคงเหลือ และบอกว่ารายการรูดบัตรไปอยู่บิลรอบไหน
      </p>

      {logo && !file && !isBundledLogo(logo) && !preview && <p className="text-xs text-slate-500">ใช้โลโก้ที่อัปโหลดไว้เดิม</p>}
      <ErrorText>{error}</ErrorText>
      <button className="btn-primary w-full" disabled={busy || !name.trim()}>
        {busy ? 'กำลังบันทึก…' : 'บันทึก'}
      </button>
    </form>
  );
}
