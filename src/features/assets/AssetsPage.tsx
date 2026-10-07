import { useState, type FormEvent } from 'react';
import { ErrorText, Modal } from '../../components/Modal';
import { formatMoney, formatThaiDate, todayIso } from '../../lib/format';
import { errorMessage, useAsync } from '../../lib/useAsync';
import { addValuation, createAsset, deleteAsset, deleteValuation, listAssets, listSavingsFlows, listValuations, updateAsset } from './api';
import { savingsTotals, summarizeAsset, type AssetSummary } from './assetMath';
import { SavingsForm } from './SavingsForm';
import { TreeCard } from './TreeCard';
import { ASSET_KINDS, ASSET_PRESETS, type Asset, type AssetKind } from './types';

export function AssetsPage() {
  const data = useAsync(() => Promise.all([listAssets(), listSavingsFlows(), listValuations()]), []);
  const [dialog, setDialog] = useState<{ type: 'new' } | { type: 'save' } | { type: 'detail'; id: string } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [assets, flows, valuations] = data.data ?? [[], [], []];
  const summaries = assets.map((a) => summarizeAsset(a, flows, valuations));
  const totals = savingsTotals(summaries, flows);
  const detail = dialog?.type === 'detail' ? summaries.find((s) => s.asset.id === dialog.id) : undefined;

  function reload() {
    data.reload();
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">ออม / ลงทุน</h1>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => setDialog({ type: 'new' })}>
            + ที่เก็บเงิน
          </button>
          <button className="btn-primary bg-amber-500 hover:bg-amber-600" onClick={() => setDialog({ type: 'save' })}>
            🪙 เก็บ / ลงทุน
          </button>
        </div>
      </div>

      <TreeCard refreshKey={refreshKey} />
      <ErrorText>{data.error}</ErrorText>

      <div className="grid gap-3 sm:grid-cols-2">
        {summaries.map((s) => (
          <button key={s.asset.id} className="card text-left transition hover:ring-amber-400" onClick={() => setDialog({ type: 'detail', id: s.asset.id })}>
            <AssetRow summary={s} />
          </button>
        ))}
        {totals.unassigned !== 0 && (
          <div className="card text-sm text-slate-600">
            🪙 ออม/ลงทุนที่ยังไม่ระบุที่เก็บ <b className="tabular-nums text-amber-600">{formatMoney(totals.unassigned)}</b>
            <p className="text-xs text-slate-400">แก้รายการในหน้ารายวันแล้วเลือก “เก็บไว้ที่” เพื่อย้ายเข้าที่เก็บ</p>
          </div>
        )}
        {!data.loading && summaries.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-400 sm:col-span-2">ยังไม่มีที่เก็บเงิน — เพิ่ม เช่น Dime, ทองคำ, เงินสด</p>
        )}
      </div>

      {dialog?.type === 'new' && (
        <Modal title="เพิ่มที่เก็บเงิน" onClose={() => setDialog(null)}>
          <AssetForm existing={assets} onSaved={() => { setDialog(null); reload(); }} />
        </Modal>
      )}
      {dialog?.type === 'save' && (
        <Modal title="เก็บ / ลงทุน" onClose={() => setDialog(null)}>
          <SavingsForm onSaved={() => { setDialog(null); reload(); }} />
        </Modal>
      )}
      {detail && (
        <Modal title={detail.asset.name} onClose={() => setDialog(null)}>
          <AssetDetail
            summary={detail}
            existing={assets}
            flows={flows.filter((f) => f.asset_id === detail.asset.id)}
            valuations={valuations.filter((v) => v.asset_id === detail.asset.id)}
            onChanged={reload}
            onDeleted={() => { setDialog(null); reload(); }}
          />
        </Modal>
      )}
    </div>
  );
}

function AssetRow({ summary: s }: { summary: AssetSummary }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-2xl">{s.asset.icon ?? ASSET_KINDS[s.asset.kind].icon}</div>
      <div className="min-w-0 flex-1">
        <div className="flex justify-between gap-2">
          <span className="truncate font-semibold">{s.asset.name}</span>
          <span className="font-semibold tabular-nums text-amber-600">{formatMoney(s.value)}</span>
        </div>
        <div className="flex justify-between gap-2 text-xs text-slate-500">
          <span>{ASSET_KINDS[s.asset.kind].label}</span>
          <span>
            เงินต้น {formatMoney(s.invested)}
            {s.gain !== 0 && <span className={s.gain > 0 ? 'text-emerald-600' : 'text-rose-600'}> ({s.gain > 0 ? '+' : ''}{formatMoney(s.gain)})</span>}
          </span>
        </div>
        {s.targetProgress != null && (
          <div className="mt-1.5 h-1.5 rounded-full bg-amber-100">
            <div className="h-1.5 rounded-full bg-amber-500" style={{ width: `${Math.min(100, s.targetProgress * 100)}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}

function AssetForm({ initial, existing, onSaved }: { initial?: Asset; existing: Asset[]; onSaved: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState<AssetKind>(initial?.kind ?? 'investment');
  const [icon, setIcon] = useState(initial?.icon ?? '');
  const [target, setTarget] = useState(initial?.target_amount ? String(initial.target_amount) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('ใส่ชื่อ');
    if (existing.some((a) => a.name === name.trim() && a.id !== initial?.id)) return setError('มีชื่อนี้แล้ว');
    const input = {
      name: name.trim(),
      kind,
      icon: icon.trim() || ASSET_KINDS[kind].icon,
      target_amount: target.trim() ? Number(target.replace(/,/g, '')) : null,
      note: null,
    };
    setBusy(true);
    try {
      if (initial) await updateAsset(initial.id, input);
      else await createAsset(input);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {!initial && (
        <div className="flex flex-wrap gap-1 text-xs">
          {ASSET_PRESETS.filter((p) => !existing.some((a) => a.name === p.name)).map((p) => (
            <button
              key={p.name}
              type="button"
              className="rounded-full bg-slate-100 px-2 py-1 hover:bg-amber-100"
              onClick={() => {
                setName(p.name);
                setKind(p.kind);
                setIcon(p.icon);
              }}
            >
              {p.icon} {p.name}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-[4rem_1fr] gap-2">
        <label className="block">
          <span className="text-sm text-slate-600">ไอคอน</span>
          <input className="input mt-1 text-center text-xl" value={icon} onChange={(e) => setIcon(e.target.value)} placeholder={ASSET_KINDS[kind].icon} maxLength={4} />
        </label>
        <label className="block">
          <span className="text-sm text-slate-600">ชื่อ</span>
          <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น Dime, ทองคำ" required />
        </label>
      </div>
      <label className="block">
        <span className="text-sm text-slate-600">ประเภท</span>
        <select className="input mt-1" value={kind} onChange={(e) => setKind(e.target.value as AssetKind)}>
          {(Object.keys(ASSET_KINDS) as AssetKind[]).map((k) => (
            <option key={k} value={k}>
              {ASSET_KINDS[k].icon} {ASSET_KINDS[k].label}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-sm text-slate-600">เป้าหมายของที่เก็บนี้ (ไม่บังคับ)</span>
        <input className="input mt-1" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="เช่น 50000" />
      </label>
      <ErrorText>{error}</ErrorText>
      <button className="btn-primary w-full" disabled={busy}>
        บันทึก
      </button>
    </form>
  );
}

interface DetailProps {
  summary: AssetSummary;
  existing: Asset[];
  flows: { id: string; type: 'income' | 'expense'; amount: number; txn_date: string; note: string | null }[];
  valuations: { id: string; value: number; valued_on: string; note: string | null }[];
  onChanged: () => void;
  onDeleted: () => void;
}

function AssetDetail({ summary: s, existing, flows, valuations, onChanged, onDeleted }: DetailProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [date, setDate] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (editing) return <AssetForm initial={s.asset} existing={existing} onSaved={() => { setEditing(false); onChanged(); }} />;

  return (
    <div className="space-y-4">
      <AssetRow summary={s} />

      <form
        className="rounded-lg bg-amber-50 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          const n = Number(value.replace(/,/g, ''));
          if (!(n >= 0) || !value.trim()) return setError('ใส่มูลค่า');
          void run(async () => {
            await addValuation(s.asset.id, n, date, null);
            setValue('');
          });
        }}
      >
        <div className="text-sm font-medium">อัปเดตมูลค่าปัจจุบัน</div>
        <p className="text-xs text-slate-500">เช่น มูลค่าพอร์ตใน Dime วันนี้ หรือราคาทองตอนนี้ — ใช้คำนวณกำไร/ขาดทุน</p>
        <div className="mt-2 flex gap-2">
          <input className="input" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder={formatMoney(s.value)} />
          <input className="input w-auto" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <button className="btn-primary shrink-0 bg-amber-500 hover:bg-amber-600">บันทึก</button>
        </div>
      </form>

      <div>
        <h3 className="mb-1 text-sm font-semibold">รายการเก็บ / ถอน</h3>
        {flows.length === 0 && <p className="text-xs text-slate-400">ยังไม่มี</p>}
        <ul className="divide-y divide-slate-100 text-sm">
          {flows.map((f) => (
            <li key={f.id} className="flex justify-between gap-2 py-1.5">
              <span className="truncate">
                <span className="text-xs text-slate-500">{formatThaiDate(f.txn_date, { day: 'numeric', month: 'short', year: '2-digit' })}</span> {f.note ?? ''}
              </span>
              <span className={`tabular-nums ${f.type === 'expense' ? 'text-amber-600' : 'text-slate-600'}`}>
                {f.type === 'expense' ? '+' : '−'}
                {formatMoney(f.amount)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {valuations.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-semibold">ประวัติมูลค่า</h3>
          <ul className="divide-y divide-slate-100 text-sm">
            {valuations.map((v) => (
              <li key={v.id} className="flex justify-between gap-2 py-1.5">
                <span className="text-xs text-slate-500">{formatThaiDate(v.valued_on)}</span>
                <span className="flex items-center gap-2 tabular-nums">
                  {formatMoney(Number(v.value))}
                  <button className="text-xs text-slate-400 hover:text-rose-600" onClick={() => void run(() => deleteValuation(v.id))} aria-label="ลบ">
                    ✕
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ErrorText>{error}</ErrorText>
      <div className="flex justify-end gap-2">
        <button className="btn-secondary px-2 py-1 text-xs" onClick={() => setEditing(true)}>
          แก้ไข
        </button>
        <button
          className="btn-danger px-2 py-1 text-xs"
          onClick={() => {
            if (!confirm(`ลบ "${s.asset.name}"? รายการเก็บ/ถอนจะยังอยู่ แต่ไม่ผูกกับที่เก็บนี้`)) return;
            void deleteAsset(s.asset.id).then(onDeleted, (err: unknown) => setError(errorMessage(err)));
          }}
        >
          ลบ
        </button>
      </div>
    </div>
  );
}
