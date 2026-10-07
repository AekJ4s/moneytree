import { useState } from 'react';
import { errorMessage } from '../../lib/useAsync';
import { createIncomeSource } from './api';
import { INCOME_KINDS, sourceIcon, type IncomeSource, type IncomeSourceKind } from './types';

interface Props {
  sources: IncomeSource[];
  value: string;
  onChange: (id: string) => void;
  /** Called after a new source is created inline so the parent can reload its list. */
  onCreated: (source: IncomeSource) => void;
  required?: boolean;
}

/** "มาจาก" picker for income, with inline creation of a new job / source. */
export function IncomeSourceSelect({ sources, value, onChange, onCreated, required }: Props) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<IncomeSourceKind>('job');
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (!name.trim()) return;
    try {
      const created = await createIncomeSource({ name, kind, icon: null, note: null });
      onCreated(created);
      onChange(created.id);
      setAdding(false);
      setName('');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="block">
      <span className="text-sm text-slate-600">
        มาจาก (แหล่งรายได้){required && <span className="text-rose-600"> *</span>}
      </span>
      {adding ? (
        <div className="mt-1 space-y-2 rounded-lg bg-emerald-50 p-2">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น บริษัท A, โปรเจคส่วนตัว, เงินจากแม่" autoFocus />
          <div className="flex flex-wrap gap-1">
            {(Object.keys(INCOME_KINDS) as IncomeSourceKind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`rounded-full px-2 py-0.5 text-xs ${kind === k ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}
              >
                {INCOME_KINDS[k].icon} {INCOME_KINDS[k].label}
              </button>
            ))}
          </div>
          {error && <p className="text-xs text-rose-600">{error}</p>}
          <div className="flex gap-2">
            <button type="button" className="btn-primary px-2 py-1 text-xs" onClick={() => void add()} disabled={!name.trim()}>
              เพิ่ม
            </button>
            <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={() => setAdding(false)}>
              ยกเลิก
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-1 flex gap-2">
          <select className="input" value={value} onChange={(e) => onChange(e.target.value)} required={required}>
            <option value="">{required ? 'เลือกแหล่งรายได้' : 'ไม่ระบุ'}</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {sourceIcon(s)} {s.name}
              </option>
            ))}
          </select>
          <button type="button" className="btn-secondary shrink-0 px-2 text-xs" onClick={() => setAdding(true)}>
            + ใหม่
          </button>
        </div>
      )}
    </div>
  );
}
