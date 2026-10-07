import { isSavings } from '../../lib/savings';
import type { PaymentMethod, TxnType } from '../../lib/types';

/** The fields of a past transaction that a quick-add button reuses. */
export interface RecentTxn {
  id: string;
  type: TxnType;
  amount: number;
  txn_date: string;
  created_at: string;
  category: string | null;
  note: string | null;
  payee_id: string | null;
  payee: { name: string } | null;
  payment_method: PaymentMethod;
  creditor_id: string | null;
  account: string | null;
  asset_id: string | null;
  income_source_id: string | null;
  source: string;
}

export interface QuickTemplate {
  key: string;
  label: string;
  icon: string;
  type: TxnType;
  /** Amount used last time. */
  amount: number;
  payee_id: string | null;
  payeeName: string | null;
  category: string | null;
  note: string | null;
  payment_method: 'cash' | 'card';
  creditor_id: string | null;
  account: string | null;
  income_source_id: string | null;
  count: number;
}

const CATEGORY_ICONS: [RegExp, string][] = [
  [/อาหาร|ข้าว|food/i, '🍚'],
  [/ชา|กาแฟ|coffee|เครื่องดื่ม/i, '🧋'],
  [/เดินทาง|grab|bolt|taxi|รถ|น้ำมัน/i, '🚕'],
  [/บันเทิง|เกม|game|netflix|youtube|disney/i, '🎮'],
  [/ช็อป|shop/i, '🛍️'],
  [/สุขภาพ|ยา|หมอ/i, '💊'],
  [/น้ำ|ไฟ|เน็ต|โทรศัพท์|ais|true|dtac/i, '💡'],
  [/ai|service|subscription/i, '🤖'],
  [/เงินเดือน|salary/i, '💼'],
];

export function iconFor(text: string | null | undefined, type: TxnType): string {
  if (text) for (const [re, icon] of CATEGORY_ICONS) if (re.test(text)) return icon;
  return type === 'income' ? '⬇️' : '⬆️';
}

/**
 * Frequent everyday entries from history, as one-tap templates. Savings, debt bookings and
 * recurring items are left out (they have their own flows); an entry must have happened at
 * least `minCount` times. Most frequent first, ties broken by recency; amount = most recent.
 */
export function buildQuickTemplates(txns: RecentTxn[], limit = 8, minCount = 2): QuickTemplate[] {
  const groups = new Map<string, { latest: RecentTxn; count: number; lastSeen: string }>();
  for (const t of txns) {
    if (isSavings(t) || t.payment_method === 'debt' || t.source === 'recurring') continue;
    const label = t.payee?.name ?? t.note ?? t.category;
    if (!label) continue;
    const key = [t.type, t.payee_id ?? `n:${(t.payee ? '' : t.note) ?? ''}`, t.category ?? '', t.payment_method, t.creditor_id ?? ''].join('|');
    const order = `${t.txn_date}|${t.created_at}`;
    const g = groups.get(key);
    if (!g) groups.set(key, { latest: t, count: 1, lastSeen: order });
    else {
      g.count += 1;
      if (order > g.lastSeen) {
        g.latest = t;
        g.lastSeen = order;
      }
    }
  }
  return Array.from(groups.entries())
    .filter(([, g]) => g.count >= minCount)
    .sort((a, b) => b[1].count - a[1].count || b[1].lastSeen.localeCompare(a[1].lastSeen))
    .slice(0, limit)
    .map(([key, { latest: t, count }]) => {
      const label = t.payee?.name ?? t.note ?? t.category ?? '';
      return {
        key,
        label,
        icon: iconFor(`${t.category ?? ''} ${label}`, t.type),
        type: t.type,
        amount: Number(t.amount),
        payee_id: t.payee_id,
        payeeName: t.payee?.name ?? null,
        category: t.category,
        note: t.payee ? null : t.note,
        payment_method: t.payment_method === 'card' ? 'card' : 'cash',
        creditor_id: t.payment_method === 'card' ? t.creditor_id : null,
        account: t.payment_method === 'card' ? t.account : null,
        income_source_id: t.type === 'income' ? t.income_source_id : null,
        count,
      };
    });
}

/** The latest past entry for a payee, to autofill amount/category/card when that payee is picked. */
export function lastForPayee(txns: RecentTxn[], payeeName: string): RecentTxn | null {
  const name = payeeName.trim();
  if (!name) return null;
  return (
    txns
      .filter((t) => t.payee?.name === name && !isSavings(t) && t.payment_method !== 'debt')
      .sort((a, b) => `${b.txn_date}|${b.created_at}`.localeCompare(`${a.txn_date}|${a.created_at}`))[0] ?? null
  );
}
