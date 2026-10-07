import { useState } from 'react';
import { ErrorText, Modal } from '../../components/Modal';
import { formatMoney, formatThaiDate, todayIso } from '../../lib/format';
import { errorMessage } from '../../lib/useAsync';
import { deleteDebt, deleteDebtEntry, updateDebt, updateInstallment } from './api';
import { monthlyRate, paidInstallmentIds, summarizeDebt } from './debtMath';
import { DebtForm } from './DebtForm';
import { EntryForm } from './EntryForm';
import { ENTRY_LABEL, KIND_LABEL, type Debt, type DebtEntry, type DebtInstallment } from './types';

interface Props {
  debt: Debt;
  installments: DebtInstallment[];
  entries: DebtEntry[];
  onChanged: () => void;
}

type Dialog =
  | { type: 'edit' }
  | { type: 'pay'; installment: DebtInstallment }
  | { type: 'entry' };

function describeInterest(debt: Debt): string {
  if (debt.interest_mode === 'none') return 'ไม่มีดอกเบี้ย';
  if (debt.interest_mode === 'manual') return 'ดอกเบี้ยกรอกรายเดือน';
  const unit = debt.interest_mode === 'annual' ? 'ต่อปี' : 'ต่อเดือน';
  const method = debt.kind === 'revolving' ? '' : debt.interest_method === 'flat' ? ' · Flat rate' : ' · ลดต้นลดดอก';
  const annual = monthlyRate(debt.interest_mode, debt.interest_rate) * 12 * 100;
  const hint = debt.interest_mode === 'monthly' ? ` (≈ ${annual.toFixed(2)}% ต่อปี)` : '';
  return `${Number(debt.interest_rate ?? 0)}% ${unit}${hint}${method}`;
}

export function DebtCard({ debt, installments, entries, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = todayIso();
  const s = summarizeDebt(debt, installments, entries, today);
  const paid = paidInstallmentIds(entries);
  const closed = !!debt.closed_on;

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const progress =
    debt.kind === 'revolving'
      ? s.utilization
      : s.totalCount > 0
        ? s.paidCount / s.totalCount
        : null;

  return (
    <div className={`rounded-xl ring-1 ring-slate-200 ${closed ? 'bg-slate-50 opacity-70' : 'bg-white'}`}>
      <button className="w-full p-3 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{debt.name}</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{KIND_LABEL[debt.kind]}</span>
              {closed && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">ปิดแล้ว</span>}
              {s.overdueCount > 0 && !closed && (
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-700">เลยกำหนด {s.overdueCount} งวด</span>
              )}
            </div>
            <div className="mt-0.5 text-xs text-slate-500">
              {debt.kind === 'revolving'
                ? [debt.credit_limit != null && `วงเงิน ${formatMoney(Number(debt.credit_limit))}`, describeInterest(debt)].filter(Boolean).join(' · ')
                : `ผ่อน ${s.paidCount}/${s.totalCount} งวด · ${describeInterest(debt)}`}
            </div>
          </div>
          <div className="text-right">
            <div className="font-semibold tabular-nums text-rose-600">{formatMoney(s.outstanding)}</div>
            {s.nextDue && !closed && (
              <div className="text-xs text-slate-500">
                {debt.kind === 'revolving' && s.minimumPayment != null ? 'ขั้นต่ำ ' : 'งวดถัดไป '}
                {formatMoney(s.nextDue.amount)} · {formatThaiDate(s.nextDue.date, { day: 'numeric', month: 'short' })}
              </div>
            )}
          </div>
        </div>
        {progress != null && (
          <div className="mt-2 h-1.5 rounded-full bg-slate-100">
            <div
              className={`h-1.5 rounded-full ${debt.kind === 'revolving' ? (progress > 0.8 ? 'bg-rose-500' : 'bg-amber-400') : 'bg-emerald-500'}`}
              style={{ width: `${Math.min(100, progress * 100)}%` }}
            />
          </div>
        )}
      </button>

      {open && (
        <div className="space-y-3 border-t border-slate-100 p-3">
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <Fact label="เงินต้นคงเหลือ" value={formatMoney(s.remainingPrincipal)} />
            {debt.kind === 'revolving' ? (
              <>
                <Fact label="ดอกเบี้ยประมาณ/เดือน" value={s.estimatedMonthlyInterest != null ? formatMoney(s.estimatedMonthlyInterest) : '—'} />
                <Fact label="ขั้นต่ำ" value={s.minimumPayment != null ? formatMoney(s.minimumPayment) : '—'} />
                <Fact label="ดอกเบี้ยที่จ่ายไปแล้ว" value={formatMoney(s.totalInterest)} />
              </>
            ) : (
              <>
                <Fact label="ดอกเบี้ยคงเหลือ" value={formatMoney(s.remainingInterest)} />
                <Fact label="ดอกเบี้ยทั้งสัญญา" value={formatMoney(s.totalInterest)} />
                <Fact label="ต้องจ่ายเดือนนี้" value={formatMoney(s.dueThisMonth)} />
              </>
            )}
          </div>
          {debt.note && <p className="text-xs text-slate-500">📝 {debt.note}</p>}

          {debt.kind !== 'revolving' && (
            <div className="-mx-3 overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-1">งวด</th>
                    <th className="py-1">ครบกำหนด</th>
                    <th className="py-1 text-right">เงินต้น</th>
                    <th className="py-1 text-right">ดอกเบี้ย</th>
                    <th className="py-1 text-right">รวม</th>
                    <th className="px-3 py-1 text-right" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {installments.map((i) => {
                    const isPaid = paid.has(i.id);
                    const payment = entries.find((e) => e.kind === 'payment' && e.installment_id === i.id);
                    const overdue = !isPaid && i.due_date < today;
                    return (
                      <tr key={i.id} className={isPaid ? 'text-slate-400' : ''}>
                        <td className="px-3 py-1.5 tabular-nums">{i.seq}</td>
                        <td className={`py-1.5 whitespace-nowrap ${overdue ? 'text-rose-600' : ''}`}>{formatThaiDate(i.due_date)}</td>
                        <td className="py-1.5 text-right tabular-nums">{formatMoney(Number(i.principal))}</td>
                        <td className="py-1.5 text-right">
                          <InterestCell installment={i} disabled={isPaid} onSave={(v) => run(() => updateInstallment(i.id, { interest: v }))} />
                        </td>
                        <td className="py-1.5 text-right font-medium tabular-nums">
                          {formatMoney(Number(i.principal) + Number(i.interest))}
                        </td>
                        <td className="px-3 py-1.5 text-right whitespace-nowrap">
                          {isPaid ? (
                            <button
                              className="text-xs text-emerald-600 hover:text-rose-600"
                              title="ยกเลิกการชำระ"
                              onClick={() => {
                                if (payment && confirm(`ยกเลิกการชำระงวด ${i.seq}? (รายจ่ายที่บันทึกไว้จะถูกลบด้วย)`))
                                  void run(() => deleteDebtEntry(payment.id));
                              }}
                            >
                              ✓ จ่ายแล้ว {payment && formatThaiDate(payment.entry_date, { day: 'numeric', month: 'short' })}
                            </button>
                          ) : (
                            <button className="btn-primary px-2 py-0.5 text-xs" disabled={closed} onClick={() => setDialog({ type: 'pay', installment: i })}>
                              ชำระ
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="px-3 pt-1 text-xs text-slate-400">แตะช่องดอกเบี้ยเพื่อแก้ดอกเบี้ยของเดือนนั้น</p>
            </div>
          )}

          {(debt.kind === 'revolving' || entries.some((e) => !e.installment_id)) && (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <h4 className="text-sm font-medium">รายการเคลื่อนไหว</h4>
                {!closed && debt.kind === 'revolving' && (
                  <button className="btn-secondary px-2 py-1 text-xs" onClick={() => setDialog({ type: 'entry' })}>
                    + บันทึก
                  </button>
                )}
              </div>
              {entries.filter((e) => !e.installment_id).length === 0 ? (
                <p className="py-2 text-center text-xs text-slate-400">ยังไม่มีรายการ</p>
              ) : (
                <ul className="divide-y divide-slate-100 text-sm">
                  {entries
                    .filter((e) => !e.installment_id)
                    .map((e) => (
                      <li key={e.id} className="flex items-center gap-2 py-1.5">
                        <span className="w-20 shrink-0 text-xs text-slate-500">{formatThaiDate(e.entry_date, { day: 'numeric', month: 'short', year: '2-digit' })}</span>
                        <span className="flex-1 truncate">
                          {ENTRY_LABEL[e.kind]}
                          {e.note && <span className="text-slate-400"> · {e.note}</span>}
                        </span>
                        <span className={`tabular-nums ${e.kind === 'payment' ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {e.kind === 'payment' ? '−' : '+'}
                          {formatMoney(Number(e.amount))}
                        </span>
                        <button
                          className="text-xs text-slate-400 hover:text-rose-600"
                          onClick={() => confirm('ลบรายการนี้?') && void run(() => deleteDebtEntry(e.id))}
                          aria-label="ลบรายการ"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          )}

          <ErrorText>{error}</ErrorText>
          <div className="flex flex-wrap justify-end gap-2">
            {debt.kind !== 'revolving' && !closed && (
              <button className="btn-secondary px-2 py-1 text-xs" onClick={() => setDialog({ type: 'entry' })}>
                + ค่าธรรมเนียม/ดอกเบี้ย/ชำระเพิ่ม
              </button>
            )}
            <button className="btn-secondary px-2 py-1 text-xs" onClick={() => setDialog({ type: 'edit' })}>
              แก้ไข
            </button>
            <button
              className="btn-secondary px-2 py-1 text-xs"
              onClick={() => void run(() => updateDebt(debt.id, { closed_on: closed ? null : today }))}
            >
              {closed ? 'เปิดหนี้อีกครั้ง' : 'ปิดหนี้'}
            </button>
            <button
              className="btn-danger px-2 py-1 text-xs"
              onClick={() => {
                if (confirm(`ลบ "${debt.name}" และตารางผ่อนทั้งหมด? (รายจ่ายที่บันทึกไว้แล้วจะยังอยู่)`)) void run(() => deleteDebt(debt.id));
              }}
            >
              ลบ
            </button>
          </div>
        </div>
      )}

      {dialog?.type === 'edit' && (
        <Modal title="แก้ไขหนี้" onClose={() => setDialog(null)}>
          <DebtForm
            creditorId={debt.creditor_id}
            initial={debt}
            hasPayments={entries.some((e) => e.kind === 'payment')}
            onSaved={() => {
              setDialog(null);
              onChanged();
            }}
          />
        </Modal>
      )}
      {dialog?.type === 'pay' && (
        <Modal title={`ชำระ ${debt.name}`} onClose={() => setDialog(null)}>
          <EntryForm
            debtId={debt.id}
            installment={{
              id: dialog.installment.id,
              seq: dialog.installment.seq,
              amount: Number(dialog.installment.principal) + Number(dialog.installment.interest),
            }}
            allowedKinds={['payment']}
            onSaved={() => {
              setDialog(null);
              onChanged();
            }}
          />
        </Modal>
      )}
      {dialog?.type === 'entry' && (
        <Modal title={`บันทึกรายการ ${debt.name}`} onClose={() => setDialog(null)}>
          <EntryForm
            debtId={debt.id}
            allowedKinds={debt.kind === 'revolving' ? ['payment', 'charge', 'interest', 'fee'] : ['fee', 'interest', 'payment']}
            defaultAmount={debt.kind === 'revolving' ? (s.minimumPayment ?? undefined) : undefined}
            onSaved={() => {
              setDialog(null);
              onChanged();
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-medium tabular-nums">{value}</div>
    </div>
  );
}

/** Inline-editable monthly interest ("ดอกเบี้ยแยกรายเดือน"); saves on blur/Enter. */
function InterestCell({
  installment,
  disabled,
  onSave,
}: {
  installment: DebtInstallment;
  disabled: boolean;
  onSave: (value: number) => Promise<void>;
}) {
  const [value, setValue] = useState(Number(installment.interest).toFixed(2));
  const [saving, setSaving] = useState(false);

  async function commit() {
    const n = Number(value.replace(/,/g, ''));
    if (!(n >= 0) || n === Number(installment.interest)) {
      setValue(Number(installment.interest).toFixed(2));
      return;
    }
    setSaving(true);
    await onSave(Math.round(n * 100) / 100);
    setSaving(false);
  }

  if (disabled) return <span className="tabular-nums">{formatMoney(Number(installment.interest))}</span>;
  return (
    <input
      className={`w-24 rounded border border-transparent px-1 py-0.5 text-right tabular-nums hover:border-slate-300 focus:border-emerald-500 focus:outline-none ${saving ? 'opacity-50' : ''}`}
      inputMode="decimal"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      aria-label={`ดอกเบี้ยงวด ${installment.seq}`}
    />
  );
}
