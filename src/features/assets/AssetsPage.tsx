import { useEffect, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react';
import { ErrorText, Modal } from '../../components/Modal';
import { formatMoney, formatThaiDate, todayIso } from '../../lib/format';
import { errorMessage, useAsync } from '../../lib/useAsync';
import { useOnDataChanged } from '../../lib/events';
import { useUserId } from '../auth/AuthProvider';
import {
  addValuation,
  assignAssetToGoal,
  createAsset,
  deleteAsset,
  deleteValuation,
  listAssets,
  listGoals,
  listSavingsFlows,
  listValuations,
  moveSavings,
  updateAsset,
  uploadAssetImage,
} from './api';
import { AssetIcon, isImageIcon, useAssetImages } from './AssetIcon';
import { savingsTotals, summarizeAsset, summarizeGoals, type AssetSummary } from './assetMath';
import { GoalCard } from './GoalCard';
import { GoalForm } from './GoalForm';
import { SavingsForm } from './SavingsForm';
import { ASSET_KINDS, ASSET_PRESETS, type Asset, type AssetKind, type SavingsGoal } from './types';

/** Drag payload: which place the money is being moved from (null = main wallet). */
const DRAG_TYPE = 'application/x-moneytree-savings';

type Dialog =
  | { type: 'new' }
  | { type: 'save' }
  | { type: 'detail'; id: string }
  | { type: 'move'; fromId: string | null; toId: string | null }
  | { type: 'goal'; goal: SavingsGoal | null };

export function AssetsPage() {
  const data = useAsync(() => Promise.all([listAssets(), listSavingsFlows(), listValuations(), listGoals()]), []);
  useOnDataChanged(data.reload);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const [assets, flows, valuations, goals] = data.data ?? [[], [], [], []];
  const [error, setError] = useState<string | null>(null);
  const images = useAssetImages(assets);
  const summaries = assets.map((a) => summarizeAsset(a, flows, valuations));
  const totals = savingsTotals(summaries, flows);
  const goalSummaries = summarizeGoals(goals, summaries);
  const goalName = new Map(goals.map((g) => [g.id, `${g.icon ?? '🎯'} ${g.name}`]));
  const detail = dialog?.type === 'detail' ? summaries.find((s) => s.asset.id === dialog.id) : undefined;

  function reload() {
    data.reload();
  }

  /** An asset dropped on a goal now counts towards that goal; the main wallet itself cannot be. */
  function dropOnGoal(e: DragEvent, goalId: string) {
    e.preventDefault();
    setDropTarget(null);
    const raw = e.dataTransfer.getData(DRAG_TYPE);
    if (!raw || raw === 'wallet') {
      setError('ย้ายเงินจากกระเป๋าหลักเข้าที่เก็บก่อน แล้วค่อยลากที่เก็บเข้าเป้าหมาย');
      return;
    }
    setError(null);
    assignAssetToGoal(raw, goalId).then(reload, (err: unknown) => setError(errorMessage(err)));
  }

  function startDrag(e: DragEvent, fromId: string | null) {
    e.dataTransfer.setData(DRAG_TYPE, fromId ?? 'wallet');
    e.dataTransfer.effectAllowed = 'move';
  }

  function dropOn(e: DragEvent, toId: string) {
    e.preventDefault();
    setDropTarget(null);
    const raw = e.dataTransfer.getData(DRAG_TYPE);
    if (!raw) return;
    const fromId = raw === 'wallet' ? null : raw;
    if (fromId !== toId) setDialog({ type: 'move', fromId, toId });
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

      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">
            🌳 เป้าหมาย
            <span className="ml-2 text-sm font-normal text-slate-500">
              ออม+ลงทุนรวม <b className="tabular-nums text-amber-600">{formatMoney(totals.value)}</b>
            </span>
          </h2>
          <button className="text-sm text-amber-700 hover:underline" onClick={() => setDialog({ type: 'goal', goal: null })}>
            + เป้าหมาย
          </button>
        </div>
        {goalSummaries.length === 0 ? (
          <p className="rounded-xl bg-amber-50 p-3 text-sm text-slate-600">ยังไม่มีเป้าหมาย — สร้างเป้าหมาย แล้วลากที่เก็บเงินด้านล่างไปวางบนเป้าหมาย</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {goalSummaries.map((g) => (
              <GoalCard
                key={g.goal.id}
                summary={g}
                size="small"
                images={images}
                highlighted={dropTarget === `goal:${g.goal.id}`}
                onClick={() => setDialog({ type: 'goal', goal: g.goal })}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
                  e.preventDefault();
                  setDropTarget(`goal:${g.goal.id}`);
                }}
                onDragLeave={() => setDropTarget((t) => (t === `goal:${g.goal.id}` ? null : t))}
                onDrop={(e) => dropOnGoal(e, g.goal.id)}
              />
            ))}
          </div>
        )}
        {goalSummaries.length > 0 && assets.length > 0 && (
          <p className="text-xs text-slate-400">
            ลากการ์ดที่เก็บเงินด้านล่างขึ้นไปวางบนเป้าหมาย เพื่อนับเข้าเป้าหมายนั้น (มือถือ: แก้ไขที่เก็บ แล้วเลือกเป้าหมาย)
          </p>
        )}
      </section>
      <ErrorText>{data.error ?? error}</ErrorText>

      {/* Main wallet: savings not yet placed anywhere. Drag it onto a place below. */}
      {totals.unassigned > 0 && (
        <div
          draggable
          onDragStart={(e) => startDrag(e, null)}
          className="card flex cursor-grab items-center gap-3 border-2 border-dashed border-amber-300 bg-amber-50/60 active:cursor-grabbing"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-2xl">👛</div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold">กระเป๋าหลัก (ยังไม่ระบุที่เก็บ)</div>
            <div className="text-xs text-slate-500">ลากไปวางบนที่เก็บด้านล่าง หรือกดปุ่ม “ย้ายเข้าที่เก็บ”</div>
          </div>
          <div className="text-right">
            <div className="font-semibold tabular-nums text-amber-600">{formatMoney(totals.unassigned)}</div>
            <button
              className="mt-1 text-xs text-amber-700 hover:underline"
              onClick={() => setDialog({ type: 'move', fromId: null, toId: null })}
              disabled={assets.length === 0}
            >
              ย้ายเข้าที่เก็บ →
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {summaries.map((s) => (
          <button
            key={s.asset.id}
            draggable
            onDragStart={(e) => startDrag(e, s.asset.id)}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
              e.preventDefault();
              setDropTarget(s.asset.id);
            }}
            onDragLeave={() => setDropTarget((t) => (t === s.asset.id ? null : t))}
            onDrop={(e) => dropOn(e, s.asset.id)}
            className={`card text-left transition hover:ring-amber-400 ${dropTarget === s.asset.id ? 'scale-[1.02] bg-amber-50 ring-2 ring-amber-500' : ''}`}
            onClick={() => setDialog({ type: 'detail', id: s.asset.id })}
          >
            <AssetRow summary={s} images={images} />
            {s.asset.goal_id && goalName.get(s.asset.goal_id) && (
              <div className="mt-1 text-xs text-amber-700">อยู่ในเป้าหมาย {goalName.get(s.asset.goal_id)}</div>
            )}
          </button>
        ))}
        {!data.loading && summaries.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-400 sm:col-span-2">ยังไม่มีที่เก็บเงิน — เพิ่ม เช่น Dime, ทองคำ, เงินสด</p>
        )}
      </div>
      {summaries.length > 1 && <p className="text-xs text-slate-400">ลากการ์ดที่เก็บหนึ่งไปวางบนอีกที่ เพื่อย้ายเงินระหว่างกันได้</p>}

      {dialog?.type === 'new' && (
        <Modal title="เพิ่มที่เก็บเงิน" onClose={() => setDialog(null)}>
          <AssetForm existing={assets} goals={goals} images={images} onSaved={() => { setDialog(null); reload(); }} />
        </Modal>
      )}
      {dialog?.type === 'goal' && (
        <Modal title={dialog.goal ? dialog.goal.name : 'เป้าหมายใหม่'} onClose={() => setDialog(null)}>
          <GoalForm
            initial={dialog.goal ?? undefined}
            existingNames={goals.map((g) => g.name)}
            assets={dialog.goal ? summaries.filter((s) => s.asset.goal_id === dialog.goal!.id) : []}
            images={images}
            onSaved={() => { setDialog(null); reload(); }}
          />
        </Modal>
      )}
      {dialog?.type === 'save' && (
        <Modal title="เก็บ / ลงทุน" onClose={() => setDialog(null)}>
          <SavingsForm onSaved={() => { setDialog(null); reload(); }} />
        </Modal>
      )}
      {dialog?.type === 'move' && (
        <Modal title="ย้ายเงินเก็บ" onClose={() => setDialog(null)}>
          <MoveForm
            assets={assets}
            summaries={summaries}
            walletAmount={totals.unassigned}
            initialFrom={dialog.fromId}
            initialTo={dialog.toId}
            onSaved={() => { setDialog(null); reload(); }}
          />
        </Modal>
      )}
      {detail && (
        <Modal title={detail.asset.name} onClose={() => setDialog(null)}>
          <AssetDetail
            summary={detail}
            existing={assets}
            goals={goals}
            images={images}
            flows={flows.filter((f) => f.asset_id === detail.asset.id)}
            valuations={valuations.filter((v) => v.asset_id === detail.asset.id)}
            onMove={() => setDialog({ type: 'move', fromId: detail.asset.id, toId: null })}
            onChanged={reload}
            onDeleted={() => { setDialog(null); reload(); }}
          />
        </Modal>
      )}
    </div>
  );
}

function AssetRow({ summary: s, images }: { summary: AssetSummary; images: Record<string, string> }) {
  return (
    <div className="flex items-start gap-3">
      <AssetIcon asset={s.asset} images={images} />
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

interface MoveFormProps {
  assets: Asset[];
  summaries: AssetSummary[];
  walletAmount: number;
  initialFrom: string | null;
  initialTo: string | null;
  onSaved: () => void;
}

function MoveForm({ assets, summaries, walletAmount, initialFrom, initialTo, onSaved }: MoveFormProps) {
  const [fromId, setFromId] = useState(initialFrom ?? 'wallet');
  const [toId, setToId] = useState(initialTo ?? '');
  const available = fromId === 'wallet' ? walletAmount : (summaries.find((s) => s.asset.id === fromId)?.value ?? 0);
  const [amount, setAmount] = useState(available > 0 ? available.toFixed(2) : '');
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAmount(available > 0 ? available.toFixed(2) : '');
  }, [fromId, available]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const value = Number(amount.replace(/,/g, ''));
    const to = assets.find((a) => a.id === toId);
    const from = fromId === 'wallet' ? null : (assets.find((a) => a.id === fromId) ?? null);
    if (!to) return setError('เลือกที่เก็บปลายทาง');
    if (from?.id === to.id) return setError('ต้นทางและปลายทางต้องต่างกัน');
    if (!(value > 0)) return setError('จำนวนเงินต้องมากกว่า 0');
    setBusy(true);
    setError(null);
    try {
      await moveSavings({ from, to, amount: value, date, note });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
        <label className="block">
          <span className="text-sm text-slate-600">จาก</span>
          <select className="input mt-1" value={fromId} onChange={(e) => setFromId(e.target.value)}>
            <option value="wallet">👛 กระเป๋าหลัก</option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {isImageIcon(a.icon) ? '' : `${a.icon ?? ASSET_KINDS[a.kind].icon} `}
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <span className="pb-2 text-lg">→</span>
        <label className="block">
          <span className="text-sm text-slate-600">ไป</span>
          <select className="input mt-1" value={toId} onChange={(e) => setToId(e.target.value)} required>
            <option value="">เลือกที่เก็บ</option>
            {assets
              .filter((a) => a.id !== fromId)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {isImageIcon(a.icon) ? '' : `${a.icon ?? ASSET_KINDS[a.kind].icon} `}
                  {a.name}
                </option>
              ))}
          </select>
        </label>
      </div>
      <p className="text-xs text-slate-500">มีอยู่ {formatMoney(available)}</p>
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
      <input className="input" placeholder="หมายเหตุ" value={note} onChange={(e) => setNote(e.target.value)} />
      <p className="text-xs text-slate-500">ย้ายเงินระหว่างที่เก็บ — ไม่กระทบเงินในบัญชีและไม่นับเป็นรายรับ/รายจ่าย</p>
      <ErrorText>{error}</ErrorText>
      <button className="btn-primary w-full bg-amber-500 hover:bg-amber-600" disabled={busy}>
        {busy ? 'กำลังย้าย…' : 'ย้ายเงิน'}
      </button>
    </form>
  );
}

function AssetForm({
  initial,
  existing,
  goals,
  images,
  onSaved,
}: {
  initial?: Asset;
  existing: Asset[];
  goals: SavingsGoal[];
  images: Record<string, string>;
  onSaved: () => void;
}) {
  const userId = useUserId();
  const [goalId, setGoalId] = useState(initial?.goal_id ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState<AssetKind>(initial?.kind ?? 'investment');
  const [icon, setIcon] = useState(isImageIcon(initial?.icon) ? '' : (initial?.icon ?? ''));
  const [image, setImage] = useState<string | null>(isImageIcon(initial?.icon) ? initial!.icon : null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [target, setTarget] = useState(initial?.target_amount ? String(initial.target_amount) : '');
  const [opening, setOpening] = useState(initial?.opening_amount ? String(initial.opening_amount) : '');
  const [openingDate, setOpeningDate] = useState(initial?.opening_date ?? todayIso());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) setFile(f);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('ใส่ชื่อ');
    if (existing.some((a) => a.name === name.trim() && a.id !== initial?.id)) return setError('มีชื่อนี้แล้ว');
    const openingAmount = opening.trim() ? Number(opening.replace(/,/g, '')) : 0;
    if (!(openingAmount >= 0)) return setError('ยอดเงินที่มีอยู่ไม่ถูกต้อง');
    setBusy(true);
    try {
      const storedImage = file ? await uploadAssetImage(userId, file) : image;
      const input = {
        name: name.trim(),
        kind,
        icon: storedImage ?? (icon.trim() || ASSET_KINDS[kind].icon),
        target_amount: target.trim() ? Number(target.replace(/,/g, '')) : null,
        opening_amount: openingAmount,
        opening_date: openingAmount > 0 ? openingDate : null,
        goal_id: goalId || null,
        note: null,
      };
      if (initial) await updateAsset(initial.id, input);
      else await createAsset(input);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const shownImage = preview ?? (image ? (image.startsWith('/') ? image : images[image]) : null);

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

      <div className="flex items-start gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-amber-50 text-3xl">
          {shownImage ? <img src={shownImage} alt="" className="h-full w-full object-cover" /> : icon || ASSET_KINDS[kind].icon}
        </div>
        <div className="flex-1 space-y-2">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อ เช่น Dime, ทองคำ" required />
          <div className="flex flex-wrap items-center gap-2">
            <label className="btn-secondary cursor-pointer px-2 py-1 text-xs">
              🖼️ ใช้รูปภาพ
              <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={onFile} />
            </label>
            {(file || image) && (
              <button
                type="button"
                className="btn-danger px-2 py-1 text-xs"
                onClick={() => {
                  setFile(null);
                  setPreview(null);
                  setImage(null);
                }}
              >
                ใช้ไอคอนแทน
              </button>
            )}
            {!file && !image && (
              <input
                className="input w-20 py-1 text-center text-lg"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder={ASSET_KINDS[kind].icon}
                maxLength={4}
                aria-label="ไอคอน (อีโมจิ)"
              />
            )}
          </div>
        </div>
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

      <div className="rounded-lg bg-amber-50 p-3">
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-sm text-slate-700">เงินที่มีอยู่แล้วตอนนี้</span>
            <input className="input mt-1" inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="เช่น 50000" />
          </label>
          <label className="block">
            <span className="text-sm text-slate-700">ณ วันที่</span>
            <input className="input mt-1" type="date" value={openingDate} onChange={(e) => setOpeningDate(e.target.value)} />
          </label>
        </div>
        <p className="mt-1 text-xs text-slate-600">
          เงินที่อยู่ในที่เก็บนี้ก่อนเริ่มบันทึก — นับเป็นเงินต้น ไม่หักจากเงินในบัญชี และไม่นับเป็นกำไร
        </p>
      </div>

      {goals.length > 0 && (
        <label className="block">
          <span className="text-sm text-slate-600">นับเข้าเป้าหมาย</span>
          <select className="input mt-1" value={goalId} onChange={(e) => setGoalId(e.target.value)}>
            <option value="">ไม่อยู่ในเป้าหมาย</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.icon ?? '🎯'} {g.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block">
        <span className="text-sm text-slate-600">ยอดเป้าหมายของที่เก็บนี้เอง (ไม่บังคับ)</span>
        <input className="input mt-1" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="เช่น 100000" />
      </label>
      <ErrorText>{error}</ErrorText>
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? 'กำลังบันทึก…' : 'บันทึก'}
      </button>
    </form>
  );
}

interface DetailProps {
  summary: AssetSummary;
  existing: Asset[];
  goals: SavingsGoal[];
  images: Record<string, string>;
  flows: { id: string; type: 'income' | 'expense'; amount: number; txn_date: string; note: string | null }[];
  valuations: { id: string; value: number; valued_on: string; note: string | null }[];
  onMove: () => void;
  onChanged: () => void;
  onDeleted: () => void;
}

function AssetDetail({ summary: s, existing, goals, images, flows, valuations, onMove, onChanged, onDeleted }: DetailProps) {
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

  if (editing) {
    return <AssetForm initial={s.asset} existing={existing} goals={goals} images={images} onSaved={() => { setEditing(false); onChanged(); }} />;
  }

  return (
    <div className="space-y-4">
      <AssetRow summary={s} images={images} />
      {s.asset.opening_amount > 0 && (
        <p className="text-xs text-slate-500">
          รวมเงินที่มีอยู่ก่อนเริ่มบันทึก {formatMoney(Number(s.asset.opening_amount))}
          {s.asset.opening_date && ` (ณ ${formatThaiDate(s.asset.opening_date)})`}
        </p>
      )}

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
        <div className="text-sm font-medium">อัปเดตมูลค่าตลาดวันนี้</div>
        <p className="text-xs text-slate-500">เช่น มูลค่าพอร์ตใน Dime หรือราคาทองตอนนี้ — ใช้คำนวณกำไร/ขาดทุน</p>
        <div className="mt-2 flex gap-2">
          <input className="input" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder={formatMoney(s.value)} />
          <input className="input w-auto" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <button className="btn-primary shrink-0 bg-amber-500 hover:bg-amber-600">บันทึก</button>
        </div>
      </form>

      <div>
        <h3 className="mb-1 text-sm font-semibold">รายการเก็บ / ถอน / ย้าย</h3>
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
      <div className="flex flex-wrap justify-end gap-2">
        <button className="btn-secondary px-2 py-1 text-xs" onClick={onMove}>
          ↔ ย้ายไปที่อื่น
        </button>
        <button className="btn-secondary px-2 py-1 text-xs" onClick={() => setEditing(true)}>
          แก้ไข / ตั้งยอดที่มีอยู่
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
