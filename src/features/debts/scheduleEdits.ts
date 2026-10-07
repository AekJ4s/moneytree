import type { InstallmentPatch } from './api';
import { monthlyRate, rebalanceFixedPayment } from './debtMath';
import type { Debt, DebtInstallment } from './types';

export type InstallmentEdit =
  | { kind: 'interest'; value: number }
  | { kind: 'principal'; value: number }
  /** Drop statement values and go back to the estimate. */
  | { kind: 'reset' };

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Works out which installment rows change when one row is edited.
 * Fixed-payment debts: entering the statement interest sets principal = payment - interest
 * (the last row takes the remaining principal), then every later unconfirmed row is re-estimated.
 * Other debts: only the edited field of that row changes.
 */
export function planInstallmentEdit(
  debt: Debt,
  installments: DebtInstallment[],
  paidIds: Set<string>,
  targetId: string,
  edit: InstallmentEdit,
): { id: string; patch: InstallmentPatch }[] {
  const rows = [...installments].sort((a, b) => a.seq - b.seq);
  const index = rows.findIndex((r) => r.id === targetId);
  if (index < 0) return [];
  const target = rows[index];

  if (!debt.installment_amount) {
    if (edit.kind === 'reset') return [{ id: target.id, patch: { confirmed: false } }];
    return [{ id: target.id, patch: { [edit.kind]: edit.value, confirmed: true } }];
  }

  const payment = Number(debt.installment_amount);
  const remainingBefore = round2(
    rows.slice(0, index).reduce((rem, r) => rem - Number(r.principal), Number(debt.principal)),
  );
  const isLast = index === rows.length - 1;

  const edited = rows.map((r) => ({
    id: r.id,
    principal: Number(r.principal),
    interest: Number(r.interest),
    confirmed: r.confirmed,
    locked: r.confirmed || paidIds.has(r.id),
  }));
  const row = edited[index];
  if (edit.kind === 'interest') {
    row.interest = round2(edit.value);
    row.principal = isLast
      ? Math.max(0, remainingBefore)
      : Math.min(Math.max(0, remainingBefore), Math.max(0, round2(payment - row.interest)));
    row.confirmed = true;
    row.locked = true;
  } else if (edit.kind === 'principal') {
    row.principal = round2(edit.value);
    row.confirmed = true;
    row.locked = true;
  } else {
    row.confirmed = false;
    row.locked = paidIds.has(row.id);
  }

  const rebalanced = rebalanceFixedPayment(edited, Number(debt.principal), payment, monthlyRate(debt.interest_mode, debt.interest_rate));

  const changes: { id: string; patch: InstallmentPatch }[] = [];
  rebalanced.forEach((next, i) => {
    const before = rows[i];
    const patch: InstallmentPatch = {};
    if (round2(next.principal) !== round2(Number(before.principal))) patch.principal = round2(next.principal);
    if (round2(next.interest) !== round2(Number(before.interest))) patch.interest = round2(next.interest);
    if (next.confirmed !== before.confirmed) patch.confirmed = next.confirmed;
    if (Object.keys(patch).length > 0) changes.push({ id: before.id, patch });
  });
  return changes;
}
