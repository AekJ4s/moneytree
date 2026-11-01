import { useState } from 'react';
import { ErrorText, Modal } from '../../components/Modal';
import { useOnDataChanged } from '../../lib/events';
import { formatMoney, formatThaiDate, todayIso } from '../../lib/format';
import { errorMessage, useAsync } from '../../lib/useAsync';
import { PayDebtForm } from '../money/PayDebtForm';
import { deleteCreditor, deleteDebtPayment, listCreditors, listDebtPayments } from './api';
import { CreditBar } from './CreditBar';
import { CreditorForm } from './CreditorForm';
import { CreditorLogo, useLogoUrls } from './CreditorLogo';
import { creditorStatus, debtTotals, type CreditorStatus } from './simpleDebt';
import type { Creditor } from './types';

type Dialog = { type: 'add' } | { type: 'edit'; creditor: Creditor } | { type: 'pay'; creditorId: string };

/** Rough debts: total owed per creditor, the minimum due this month, and payments. */
export function DebtsPage() {
  const today = todayIso();
  // Payments from last month onwards are enough for "this month" and a short history.
  const since = `${new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1)).toISOString().slice(0, 10)}`;
  const data = useAsync(() => Promise.all([listCreditors(), listDebtPayments(since)]), [since]);
  useOnDataChanged(data.reload);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [creditors, payments] = data.data ?? [[], []];
  const logos = useLogoUrls(creditors);
  const statuses = creditors.map((c) => creditorStatus(c, payments, today));
  const totals = debtTotals(statuses);

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
      data.reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">หนี้สิน</h1>
        <button className="btn-primary" onClick={() => setDialog({ type: 'add' })}>
          + เพิ่มเจ้าหนี้
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Figure label="หนี้รวม" value={totals.owed} tone="text-rose-600" />
        <Figure label="ขั้นต่ำเดือนนี้" value={totals.minimum} tone="text-slate-800" />
        <Figure label="ยังต้องจ่ายเดือนนี้" value={totals.remaining} tone={totals.remaining > 0 ? 'text-amber-600' : 'text-emerald-700'} />
      </div>
      <ErrorText>{data.error ?? error}</ErrorText>

      <div className="grid gap-3 sm:grid-cols-2">
        {statuses.map((s) => (
          <CreditorCard
            key={s.creditor.id}
            status={s}
            logo={logos[s.creditor.id]}
            payments={payments.filter((p) => p.creditor_id === s.creditor.id).slice(0, 4)}
            onPay={() => setDialog({ type: 'pay', creditorId: s.creditor.id })}
            onEdit={() => setDialog({ type: 'edit', creditor: s.creditor })}
            onUndoPayment={(id) => {
              if (confirm('ยกเลิกการจ่ายนี้? ยอดหนี้จะกลับมาเท่าเดิม')) void run(() => deleteDebtPayment(id));
            }}
          />
        ))}
        {!data.loading && creditors.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-400 sm:col-span-2">ยังไม่มีเจ้าหนี้ — กด “เพิ่มเจ้าหนี้” แล้วใส่หนี้รวมกับขั้นต่ำ</p>
        )}
      </div>

      {dialog?.type === 'add' && (
        <Modal title="เพิ่มเจ้าหนี้" onClose={() => setDialog(null)}>
          <CreditorForm existingNames={creditors.map((c) => c.name)} onSaved={() => { setDialog(null); data.reload(); }} />
        </Modal>
      )}
      {dialog?.type === 'edit' && (
        <Modal title={`อัปเดต ${dialog.creditor.name}`} onClose={() => setDialog(null)}>
          <CreditorForm
            initial={dialog.creditor}
            initialLogoUrl={logos[dialog.creditor.id]}
            existingNames={creditors.map((c) => c.name)}
            onSaved={() => { setDialog(null); data.reload(); }}
          />
          <div className="mt-3 text-right">
            <button
              className="btn-danger px-2 py-1 text-xs"
              onClick={() => {
                if (!confirm(`ลบ "${dialog.creditor.name}" และประวัติการจ่ายทั้งหมด?`)) return;
                const creditor = dialog.creditor;
                setDialog(null);
                void run(() => deleteCreditor(creditor));
              }}
            >
              ลบเจ้าหนี้
            </button>
          </div>
        </Modal>
      )}
      {dialog?.type === 'pay' && (
        <Modal title="บันทึกการจ่ายหนี้" onClose={() => setDialog(null)}>
          <PayDebtForm initialCreditorId={dialog.creditorId} onSaved={() => { setDialog(null); data.reload(); }} />
        </Modal>
      )}
    </div>
  );
}

interface CardProps {
  status: CreditorStatus;
  logo: string | null | undefined;
  payments: { id: string; amount: number; paid_on: string; note: string | null }[];
  onPay: () => void;
  onEdit: () => void;
  onUndoPayment: (id: string) => void;
}

function CreditorCard({ status: s, logo, payments, onPay, onEdit, onUndoPayment }: CardProps) {
  const c = s.creditor;
  const settled = Number(c.balance) <= 0;
  return (
    <div className="card space-y-3">
      <div className="flex items-start gap-3">
        <CreditorLogo name={c.name} src={logo ?? null} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{c.name}</div>
          <div className="figure text-2xl text-rose-600">{formatMoney(Number(c.balance))}</div>
          <div className="text-xs text-slate-500">
            หนี้รวม{c.balance_updated_on && ` · อัปเดต ${formatThaiDate(c.balance_updated_on, { day: 'numeric', month: 'short' })}`}
          </div>
        </div>
      </div>

      {!settled && (
        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
          <div>
            <div>
              ขั้นต่ำ <b className="figure">{formatMoney(s.minimum)}</b>
              {c.min_payment == null && c.min_payment_percent != null && <span className="text-xs text-slate-500"> ({Number(c.min_payment_percent)}%)</span>}
            </div>
            <div className={`text-xs ${s.overdue ? 'font-semibold text-rose-600' : s.remaining === 0 ? 'text-emerald-700' : 'text-slate-500'}`}>
              {s.remaining === 0
                ? s.minimum > 0
                  ? '✓ จ่ายขั้นต่ำเดือนนี้แล้ว'
                  : 'ยังไม่ได้ตั้งขั้นต่ำ'
                : `${s.overdue ? 'เลยกำหนด' : 'ครบกำหนด'}${s.dueDate ? ` ${formatThaiDate(s.dueDate, { day: 'numeric', month: 'short' })}` : ''} · เหลือ ${formatMoney(s.remaining)}`}
            </div>
          </div>
          <button className="btn-primary px-3 py-1.5" onClick={onPay}>
            จ่าย
          </button>
        </div>
      )}
      {settled && <p className="text-sm text-emerald-700">✓ ปลอดหนี้แล้ว</p>}

      {s.available != null && c.credit_limit != null && <CreditBar limit={Number(c.credit_limit)} available={s.available} />}

      {payments.length > 0 && (
        <ul className="space-y-1 border-t border-slate-100 pt-2 text-xs">
          {payments.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 text-slate-600">
              <span>
                จ่าย {formatThaiDate(p.paid_on, { day: 'numeric', month: 'short' })}
                {p.note && <span className="text-slate-400"> · {p.note}</span>}
              </span>
              <span className="flex items-center gap-2">
                <span className="figure">{formatMoney(p.amount)}</span>
                <button className="text-slate-400 hover:text-rose-600" onClick={() => onUndoPayment(p.id)} aria-label="ยกเลิกการจ่าย">
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex justify-end">
        <button className="btn-secondary px-2 py-1 text-xs" onClick={onEdit}>
          อัปเดตยอด / แก้ไข
        </button>
      </div>
    </div>
  );
}

function Figure({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="card p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`figure ${tone}`}>{formatMoney(value)}</div>
    </div>
  );
}
