import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { ErrorText, ImageViewer } from '../../components/Modal';
import { TypeToggle } from '../../components/TypeToggle';
import { formatMoney, formatThaiDate, todayIso } from '../../lib/format';
import type { Payee, PayeeRule } from '../../lib/types';
import { errorMessage, useAsync } from '../../lib/useAsync';
import { useUserId } from '../auth/AuthProvider';
import { ensurePayee, listPayees, listRules, upsertRule } from '../payees/api';
import { createTransaction, findExistingSlipRefs, listCategories } from '../transactions/api';
import { PayeeCategoryOptions } from '../transactions/TransactionForm';
import { BANK_NAMES } from './emvco';
import { decodeQrCodes, recognizeText } from './imageScan';
import { toKeywordValue } from './matching';
import { applyRules, applyScan, newDraft, slipRef, type SlipDraft } from './slipProcessing';
import { removeSlipImage, uploadSlipImage } from './storage';

export function SlipUploadPage() {
  const userId = useUserId();
  const lookups = useAsync(() => Promise.all([listPayees(), listRules(), listCategories()]), []);
  const [payees, rules, categories] = lookups.data ?? [[], [], []];

  const [drafts, setDrafts] = useState<SlipDraft[]>([]);
  const [defaultDate, setDefaultDate] = useState(todayIso());
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scanning = useRef(false);

  // Keep the latest lookups reachable from the async scan loop.
  const lookupsRef = useRef({ payees, rules });
  lookupsRef.current = { payees, rules };

  // The ref is the source of truth so the async scan/save loops always see the latest drafts.
  const draftsRef = useRef<SlipDraft[]>([]);
  const commit = useCallback((next: SlipDraft[]) => {
    draftsRef.current = next;
    setDrafts(next);
  }, []);
  const update = useCallback(
    (key: string, patch: Partial<SlipDraft>) => {
      commit(draftsRef.current.map((d) => (d.key === key ? { ...d, ...patch } : d)));
    },
    [commit],
  );

  // Release object URLs when the page unmounts.
  useEffect(() => () => draftsRef.current.forEach((d) => URL.revokeObjectURL(d.previewUrl)), []);

  const runScanQueue = useCallback(async () => {
    if (scanning.current) return;
    scanning.current = true;
    try {
      for (;;) {
        const next = draftsRef.current.find((d) => d.status === 'queued');
        if (!next) break;
        update(next.key, { status: 'scanning' });
        try {
          const [qrCodes, ocrText] = await Promise.all([decodeQrCodes(next.file), recognizeText(next.file)]);
          const { payees: p, rules: r } = lookupsRef.current;
          const scanned = applyScan(draftsRef.current.find((d) => d.key === next.key) ?? next, { qrCodes, ocrText }, r, p);
          const ref = slipRef(scanned);
          const dupInBatch = ref && draftsRef.current.some((d) => d.key !== next.key && slipRef(d) === ref);
          const dupSaved = ref ? (await findExistingSlipRefs([ref])).has(ref) : false;
          update(next.key, {
            ...scanned,
            status: dupInBatch || dupSaved ? 'duplicate' : 'ready',
            include: !(dupInBatch || dupSaved),
          });
        } catch (err) {
          console.error(err);
          update(next.key, { status: 'ready', error: `อ่านรูปไม่สำเร็จ: ${errorMessage(err)} (กรอกข้อมูลเองได้)` });
        }
      }
    } finally {
      scanning.current = false;
    }
  }, [update]);

  function addFiles(files: FileList | File[]) {
    const images = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (images.length === 0) return;
    commit([...draftsRef.current, ...images.map((f) => newDraft(f, defaultDate))]);
    void runScanQueue();
  }

  // Allow pasting screenshots straight into the page.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length) addFiles(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  function onInput(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = '';
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }

  function removeDraft(key: string) {
    const d = draftsRef.current.find((x) => x.key === key);
    if (d) URL.revokeObjectURL(d.previewUrl);
    commit(draftsRef.current.filter((x) => x.key !== key));
  }

  function clearDone() {
    const done = (d: SlipDraft) => d.status === 'saved' || d.status === 'duplicate';
    draftsRef.current.filter(done).forEach((d) => URL.revokeObjectURL(d.previewUrl));
    commit(draftsRef.current.filter((d) => !done(d)));
  }

  async function saveAll() {
    setSaving(true);
    setSaveError(null);
    const localPayees: Payee[] = [...payees];
    const localRules: PayeeRule[] = [...rules];
    let failures = 0;

    for (const original of draftsRef.current) {
      if (original.status !== 'ready' || !original.include) continue;
      // Rules saved earlier in this batch may now match slips the user left blank.
      const draft = applyRules(draftsRef.current.find((d) => d.key === original.key) ?? original, localRules, localPayees);
      const amount = Number(draft.amount);
      if (!(amount > 0)) {
        update(draft.key, { error: 'กรุณากรอกจำนวนเงิน' });
        failures += 1;
        continue;
      }
      update(draft.key, { ...draft, status: 'saving', error: null });
      let uploadedPath: string | null = null;
      try {
        const payee = draft.payeeName.trim()
          ? await ensurePayee(draft.payeeName, draft.type, draft.category.trim() || null)
          : null;
        if (payee && !localPayees.some((p) => p.id === payee.id)) localPayees.push(payee);

        if (payee && draft.remember) {
          const rule = mappingRuleFor(draft);
          if (rule) {
            await upsertRule(payee.id, rule.matchType, rule.value);
            localRules.push({
              id: crypto.randomUUID(),
              payee_id: payee.id,
              match_type: rule.matchType,
              match_value: rule.value,
              created_at: new Date().toISOString(),
            });
          }
        }

        uploadedPath = await uploadSlipImage(userId, draft.date, draft.file);
        await createTransaction({
          type: draft.type,
          amount,
          txn_date: draft.date,
          txn_time: draft.time || null,
          payee_id: payee?.id ?? null,
          category: draft.category.trim() || null,
          note: draft.note.trim() || null,
          source: 'slip',
          slip_ref: slipRef(draft),
          slip_bank: draft.slipQr?.bankCode ?? null,
          slip_image_path: uploadedPath,
          qr_payload: draft.qrPayload,
        });
        update(draft.key, { status: 'saved' });
      } catch (err) {
        failures += 1;
        if (uploadedPath) await removeSlipImage(uploadedPath).catch(() => undefined);
        const message = errorMessage(err);
        const duplicate = /duplicate key|unique/i.test(message);
        update(draft.key, {
          status: duplicate ? 'duplicate' : 'ready',
          error: duplicate ? null : message,
        });
      }
    }

    setSaving(false);
    if (failures > 0) setSaveError(`บันทึกไม่สำเร็จ ${failures} รายการ ตรวจสอบรายการที่มีข้อความสีแดง`);
    lookups.reload();
  }

  const readyCount = drafts.filter((d) => d.status === 'ready' && d.include).length;
  const scanningCount = drafts.filter((d) => d.status === 'queued' || d.status === 'scanning').length;
  const savedDrafts = drafts.filter((d) => d.status === 'saved');
  const readyTotal = drafts
    .filter((d) => d.status === 'ready' && d.include)
    .reduce((sum, d) => sum + (Number(d.amount) || 0) * (d.type === 'income' ? 1 : -1), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">อัปโหลดสลิป</h1>
          <p className="text-sm text-slate-500">เลือกได้หลายรูปพร้อมกัน ระบบจะอ่าน QR และข้อความบนสลิป แล้วแมปผู้รับที่เคยบันทึกไว้ให้อัตโนมัติ</p>
        </div>
        <label className="text-sm">
          <span className="mr-2 text-slate-500">วันที่เริ่มต้น (ถ้าอ่านจากสลิปไม่ได้)</span>
          <input type="date" className="input w-auto py-1" value={defaultDate} onChange={(e) => setDefaultDate(e.target.value)} />
        </label>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition ${
          dragging ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 bg-white hover:border-emerald-400'
        }`}
      >
        <div className="text-4xl">🧾</div>
        <p className="mt-2 font-medium">แตะเพื่อเลือกรูปสลิป / ลากไฟล์มาวาง / วาง (Ctrl+V)</p>
        <p className="text-xs text-slate-500">รองรับ JPG, PNG, WebP · เลือกหลายรูปได้</p>
        <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={onInput} />
      </div>

      {lookups.error && <ErrorText>{lookups.error}</ErrorText>}

      {drafts.length > 0 && (
        <div className="sticky top-14 z-10 flex flex-wrap items-center gap-3 rounded-xl bg-white/95 p-3 shadow-sm ring-1 ring-slate-200 backdrop-blur">
          <span className="text-sm text-slate-600">
            ทั้งหมด {drafts.length} รูป
            {scanningCount > 0 && ` · กำลังอ่าน ${scanningCount}`}
            {savedDrafts.length > 0 && ` · บันทึกแล้ว ${savedDrafts.length}`}
            {readyCount > 0 && ` · สุทธิ ${formatMoney(readyTotal)}`}
          </span>
          <div className="ml-auto flex gap-2">
            {savedDrafts.length > 0 && (
              <Link className="btn-secondary" to={`/daily?date=${savedDrafts[savedDrafts.length - 1].date}`}>
                ดูรายวัน
              </Link>
            )}
            <button className="btn-secondary" onClick={clearDone} disabled={saving}>
              ล้างที่เสร็จแล้ว
            </button>
            <button className="btn-primary" onClick={() => void saveAll()} disabled={saving || readyCount === 0 || scanningCount > 0}>
              {saving ? 'กำลังบันทึก…' : `บันทึก ${readyCount} รายการ`}
            </button>
          </div>
        </div>
      )}
      <ErrorText>{saveError}</ErrorText>

      <PayeeCategoryOptions payees={payees} categories={categories} />
      <div className="space-y-3">
        {drafts.map((d) => (
          <SlipCard key={d.key} draft={d} payees={payees} onChange={(patch) => update(d.key, patch)} onRemove={() => removeDraft(d.key)} onView={() => setViewing(d.previewUrl)} />
        ))}
      </div>
      {viewing && <ImageViewer src={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

/** Which rule to store for a slip: an exact PromptPay recipient if available, else a text keyword. */
function mappingRuleFor(draft: SlipDraft): { matchType: 'promptpay' | 'keyword'; value: string } | null {
  if (draft.paymentQr) return { matchType: 'promptpay', value: draft.paymentQr.recipientKey };
  const value = toKeywordValue(draft.keyword);
  return value.length >= 2 ? { matchType: 'keyword', value } : null;
}

interface CardProps {
  draft: SlipDraft;
  payees: Payee[];
  onChange: (patch: Partial<SlipDraft>) => void;
  onRemove: () => void;
  onView: () => void;
}

function SlipCard({ draft: d, payees, onChange, onRemove, onView }: CardProps) {
  const busy = d.status === 'queued' || d.status === 'scanning';
  const locked = busy || d.status === 'saving' || d.status === 'saved' || d.status === 'duplicate';
  const isKnownPayee = payees.some((p) => p.name === d.payeeName.trim());

  function onPayeeChange(name: string) {
    const known = payees.find((p) => p.name === name);
    onChange({
      payeeName: name,
      matchedVia: null,
      remember: true,
      ...(known ? { type: known.default_type, category: d.category || known.category || '' } : {}),
    });
  }

  return (
    <div className={`card flex gap-4 ${d.status === 'saved' ? 'opacity-60' : ''} ${!d.include ? 'opacity-50' : ''}`}>
      <button onClick={onView} className="shrink-0 self-start" aria-label="ดูรูปเต็ม">
        <img src={d.previewUrl} alt="สลิป" className="h-40 w-24 rounded-lg object-cover ring-1 ring-slate-200 sm:h-48 sm:w-32" />
      </button>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge draft={d} />
          {d.slipQr && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              {BANK_NAMES[d.slipQr.bankCode] ?? `ธนาคาร ${d.slipQr.bankCode}`} · {d.slipQr.transRef}
            </span>
          )}
          {!locked && (
            <label className="ml-auto flex items-center gap-1 text-xs text-slate-500">
              <input type="checkbox" checked={d.include} onChange={(e) => onChange({ include: e.target.checked })} />
              บันทึกรายการนี้
            </label>
          )}
          {d.status !== 'saving' && d.status !== 'saved' && (
            <button className={`text-xs text-slate-400 hover:text-rose-600 ${locked ? 'ml-auto' : ''}`} onClick={onRemove}>
              นำออก
            </button>
          )}
        </div>

        {busy ? (
          <p className="animate-pulse text-sm text-slate-500">กำลังอ่าน QR และข้อความบนสลิป…</p>
        ) : (
          <fieldset disabled={locked} className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <TypeToggle value={d.type} onChange={(type) => onChange({ type })} />
              <input
                className="input w-36 text-right font-semibold"
                type="number"
                inputMode="decimal"
                step="0.01"
                placeholder="จำนวนเงิน"
                value={d.amount}
                onChange={(e) => onChange({ amount: e.target.value })}
              />
              <input className="input w-auto" type="date" value={d.date} onChange={(e) => onChange({ date: e.target.value })} />
              <input className="input w-28" type="time" value={d.time} onChange={(e) => onChange({ time: e.target.value })} />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                className={`input ${d.matchedVia ? 'border-emerald-400 bg-emerald-50' : !d.payeeName ? 'border-amber-400' : ''}`}
                list="payee-options"
                placeholder="ผู้รับ เช่น ร้านข้าว"
                value={d.payeeName}
                onChange={(e) => onPayeeChange(e.target.value)}
              />
              <input className="input" list="category-options" placeholder="หมวดหมู่" value={d.category} onChange={(e) => onChange({ category: e.target.value })} />
            </div>
            <input className="input" placeholder="หมายเหตุ" value={d.note} onChange={(e) => onChange({ note: e.target.value })} />

            {!d.matchedVia && d.payeeName.trim() && (
              <div className="rounded-lg bg-amber-50 p-2 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={d.remember} onChange={(e) => onChange({ remember: e.target.checked })} />
                  <span>
                    จำไว้: ครั้งหน้าสลิปที่ตรงกันจะแมปเข้า <b>{d.payeeName}</b>
                    {!isKnownPayee && ' (ผู้รับใหม่)'}
                  </span>
                </label>
                {d.remember &&
                  (d.paymentQr ? (
                    <p className="mt-1 text-xs text-slate-600">จับคู่จาก PromptPay/QR ของผู้รับ (แม่นยำ)</p>
                  ) : (
                    <div className="mt-2 space-y-1">
                      <span className="text-xs text-slate-600">ข้อความบนสลิปที่ใช้จับคู่ (เลือกบรรทัดชื่อผู้รับ หรือพิมพ์เอง)</span>
                      <input className="input" list={`kw-${d.key}`} value={d.keyword} onChange={(e) => onChange({ keyword: e.target.value })} placeholder="เช่น ชื่อร้าน/ชื่อบัญชีผู้รับ" />
                      <datalist id={`kw-${d.key}`}>
                        {d.keywordCandidates.map((c) => (
                          <option key={c} value={c} />
                        ))}
                      </datalist>
                      {d.keywordCandidates.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {d.keywordCandidates.slice(0, 8).map((c) => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => onChange({ keyword: c })}
                              className={`rounded-full px-2 py-0.5 text-xs ${d.keyword === c ? 'bg-amber-500 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}
                            >
                              {c}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </fieldset>
        )}

        {d.error && <p className="text-sm text-rose-600">{d.error}</p>}
        {d.ocrText && (
          <details className="text-xs text-slate-500">
            <summary className="cursor-pointer">ข้อความที่อ่านได้จากสลิป</summary>
            <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 font-sans">{d.ocrText}</pre>
          </details>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ draft: d }: { draft: SlipDraft }) {
  const base = 'rounded-full px-2 py-0.5 text-xs font-medium';
  switch (d.status) {
    case 'queued':
    case 'scanning':
      return <span className={`${base} bg-slate-100 text-slate-600`}>กำลังอ่าน…</span>;
    case 'saving':
      return <span className={`${base} bg-sky-100 text-sky-700`}>กำลังบันทึก…</span>;
    case 'saved':
      return <span className={`${base} bg-emerald-100 text-emerald-700`}>✓ บันทึกแล้ว · {formatThaiDate(d.date)}</span>;
    case 'duplicate':
      return <span className={`${base} bg-slate-200 text-slate-700`}>สลิปนี้เคยบันทึกแล้ว</span>;
    default:
      if (d.matchedVia)
        return (
          <span className={`${base} bg-emerald-100 text-emerald-700`}>
            ✓ แมปอัตโนมัติ → {d.payeeName} ({d.matchedVia === 'promptpay' ? 'PromptPay' : 'ข้อความบนสลิป'})
          </span>
        );
      return <span className={`${base} bg-amber-100 text-amber-800`}>รายการใหม่ · กรอกผู้รับเอง</span>;
  }
}
