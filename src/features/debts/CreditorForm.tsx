import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { ErrorText } from '../../components/Modal';
import { errorMessage } from '../../lib/useAsync';
import { useUserId } from '../auth/AuthProvider';
import { CREDITOR_PRESETS, createCreditor, isBundledLogo, updateCreditor, uploadCreditorLogo } from './api';
import { CreditorLogo } from './CreditorLogo';
import type { Creditor } from './types';

interface Props {
  initial?: Creditor;
  initialLogoUrl?: string | null;
  existingNames: string[];
  onSaved: (creditor?: Creditor) => void;
}

export function CreditorForm({ initial, initialLogoUrl, existingNames, onSaved }: Props) {
  const userId = useUserId();
  const [name, setName] = useState(initial?.name ?? '');
  const [logo, setLogo] = useState<string | null>(initial?.logo ?? null);
  const [file, setFile] = useState<File | null>(null);
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
      const finalLogo = file ? await uploadCreditorLogo(userId, file) : logo;
      if (initial) {
        await updateCreditor(initial.id, { name: trimmed, logo: finalLogo });
        onSaved();
      } else {
        onSaved(await createCreditor(trimmed, finalLogo));
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

      {logo && !file && !isBundledLogo(logo) && !preview && <p className="text-xs text-slate-500">ใช้โลโก้ที่อัปโหลดไว้เดิม</p>}
      <ErrorText>{error}</ErrorText>
      <button className="btn-primary w-full" disabled={busy || !name.trim()}>
        {busy ? 'กำลังบันทึก…' : 'บันทึก'}
      </button>
    </form>
  );
}
