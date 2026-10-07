import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ErrorText, Modal } from '../../components/Modal';
import { formatMoney, todayIso } from '../../lib/format';
import { errorMessage, useAsync } from '../../lib/useAsync';
import { deleteCreditor, getCreditor, listCreditors, loadDebtData } from './api';
import { CreditorForm } from './CreditorForm';
import { CreditorLogo, useLogoUrls } from './CreditorLogo';
import { DebtCard } from './DebtCard';
import { outstandingByBorrower, summarizeAll } from './debtMath';
import { DebtForm } from './DebtForm';
import { InterestSplitForm } from './InterestSplitForm';
import { KIND_LABEL, type DebtKind } from './types';

const KIND_ORDER: DebtKind[] = ['revolving', 'installment', 'paylater'];

export function CreditorPage() {
  const { creditorId = '' } = useParams();
  const navigate = useNavigate();
  const creditor = useAsync(() => getCreditor(creditorId), [creditorId]);
  const allCreditors = useAsync(listCreditors, []);
  const data = useAsync(() => loadDebtData(creditorId), [creditorId]);
  const logos = useLogoUrls(creditor.data ? [creditor.data] : []);
  const [dialog, setDialog] = useState<'debt' | 'creditor' | 'split' | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const c = creditor.data;
  const debts = data.data?.debts ?? [];
  const open = data.data ? summarizeAll(data.data, todayIso()) : [];
  const outstanding = open.reduce((s, d) => s + d.summary.outstanding, 0);
  const dueThisMonth = open.reduce((s, d) => s + d.summary.dueThisMonth, 0);
  const closedCount = debts.filter((d) => d.closed_on).length;
  const byBorrower = outstandingByBorrower(open);
  const openRevolving = debts.filter((d) => d.kind === 'revolving' && !d.closed_on);
  const knownBorrowers = Array.from(new Set(debts.map((d) => d.borrower).filter((b): b is string => !!b)));

  async function onDelete() {
    if (!c) return;
    if (!confirm(`ลบเจ้าหนี้ "${c.name}" และหนี้ทั้งหมดของเจ้าหนี้นี้?`)) return;
    try {
      await deleteCreditor(c);
      navigate('/debts');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (creditor.error) return <ErrorText>{creditor.error}</ErrorText>;
  if (!c) return <p className="p-8 text-center text-slate-400">กำลังโหลด…</p>;

  return (
    <div className="space-y-4">
      <Link to="/debts" className="text-sm text-emerald-700 hover:underline">
        ← หนี้สินทั้งหมด
      </Link>
      <div className="card flex flex-wrap items-center gap-4">
        <CreditorLogo name={c.name} src={logos[c.id]} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold">{c.name}</h1>
          <p className="text-sm">
            <span className="text-rose-600">คงเหลือ {formatMoney(outstanding)}</span>
            <span className="mx-2 text-slate-300">|</span>
            <span className="text-amber-600">เดือนนี้ {formatMoney(dueThisMonth)}</span>
          </p>
          {byBorrower.others.length > 0 && (
            <p className="text-xs text-slate-500">
              ของฉัน {formatMoney(byBorrower.mine)}
              {byBorrower.others.map((o) => ` · 👤 ${o.name} ${formatMoney(o.amount)}`).join('')}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => setDialog('creditor')}>
            แก้ไข
          </button>
          <button className="btn-danger" onClick={() => void onDelete()}>
            ลบ
          </button>
          <button className="btn-primary" onClick={() => setDialog('debt')}>
            + เพิ่มหนี้
          </button>
        </div>
      </div>
      <ErrorText>{data.error ?? error}</ErrorText>

      {!data.loading && debts.length === 0 && (
        <p className="py-8 text-center text-sm text-slate-400">ยังไม่มีหนี้ของ {c.name} — กด “เพิ่มหนี้”</p>
      )}

      {KIND_ORDER.map((kind) => {
        const list = debts.filter((d) => d.kind === kind && (showClosed || !d.closed_on));
        if (list.length === 0) return null;
        return (
          <section key={kind} className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-600">{KIND_LABEL[kind]}</h2>
              {kind === 'revolving' && openRevolving.length > 1 && (
                <button className="btn-secondary px-2 py-1 text-xs" onClick={() => setDialog('split')}>
                  แบ่งดอกเบี้ยตามใบแจ้งยอด
                </button>
              )}
            </div>
            {list.map((debt) => (
              <DebtCard
                key={debt.id}
                debt={debt}
                installments={data.data!.installments.filter((i) => i.debt_id === debt.id)}
                entries={data.data!.entries.filter((e) => e.debt_id === debt.id)}
                onChanged={data.reload}
              />
            ))}
          </section>
        );
      })}

      {closedCount > 0 && (
        <button className="text-sm text-slate-500 hover:underline" onClick={() => setShowClosed((s) => !s)}>
          {showClosed ? 'ซ่อนหนี้ที่ปิดแล้ว' : `แสดงหนี้ที่ปิดแล้ว (${closedCount})`}
        </button>
      )}

      {dialog === 'debt' && (
        <Modal title={`เพิ่มหนี้ ${c.name}`} onClose={() => setDialog(null)}>
          <DebtForm
            creditorId={c.id}
            hasPayments={false}
            knownBorrowers={knownBorrowers}
            onSaved={() => {
              setDialog(null);
              data.reload();
            }}
          />
        </Modal>
      )}
      {dialog === 'split' && (
        <Modal title="แบ่งดอกเบี้ยเงินหมุน" onClose={() => setDialog(null)}>
          <InterestSplitForm
            debts={openRevolving}
            entries={data.data?.entries ?? []}
            onSaved={() => {
              setDialog(null);
              data.reload();
            }}
          />
        </Modal>
      )}
      {dialog === 'creditor' && (
        <Modal title="แก้ไขเจ้าหนี้" onClose={() => setDialog(null)}>
          <CreditorForm
            initial={c}
            initialLogoUrl={logos[c.id]}
            existingNames={(allCreditors.data ?? []).map((x) => x.name)}
            onSaved={() => {
              setDialog(null);
              creditor.reload();
              allCreditors.reload();
            }}
          />
        </Modal>
      )}
    </div>
  );
}
