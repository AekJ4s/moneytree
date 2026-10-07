import { formatThaiDate } from '../../lib/format';
import { dueDateForStatement, statementDateFor } from './cardCycle';
import type { Creditor } from './types';

/** "💳 KTC → บิลรอบ 21 ต.ค. · จ่าย 20 พ.ย." for an expense charged to a card. */
export function CardBillingHint({ card, date }: { card?: Creditor; date: string }) {
  if (!card) return null;
  const statement = card.statement_day ? statementDateFor(date, card.statement_day) : null;
  const due = statement && card.due_day ? dueDateForStatement(statement, card.due_day) : null;
  const short = (iso: string) => formatThaiDate(iso, { day: 'numeric', month: 'short' });
  return (
    <div className="text-xs text-sky-700">
      💳 {card.name}
      {statement && ` → บิลรอบ ${short(statement)}`}
      {due && ` · จ่าย ${short(due)}`}
    </div>
  );
}
