import { describe, expect, it } from 'vitest';
import { buildQuickTemplates, lastForPayee, type RecentTxn } from './quickTemplates';

let seq = 0;
function txn(p: Partial<RecentTxn>): RecentTxn {
  seq += 1;
  return {
    id: `t${seq}`,
    type: 'expense',
    amount: 60,
    txn_date: '2026-10-01',
    created_at: `2026-10-01T00:00:${String(seq).padStart(2, '0')}`,
    category: 'อาหาร',
    note: null,
    payee_id: null,
    payee: null,
    payment_method: 'cash',
    creditor_id: null,
    account: null,
    asset_id: null,
    income_source_id: null,
    source: 'manual',
    ...p,
  };
}

const grab = { payee_id: 'grab', payee: { name: 'GRAB' }, category: 'เดินทาง', payment_method: 'card' as const, creditor_id: 'ktc', account: 'KTC' };

describe('buildQuickTemplates', () => {
  const history = [
    txn({ note: 'ข้าว', amount: 50, txn_date: '2026-10-01' }),
    txn({ note: 'ข้าว', amount: 60, txn_date: '2026-10-03' }),
    txn({ note: 'ข้าว', amount: 55, txn_date: '2026-10-02' }),
    txn({ ...grab, amount: 45, txn_date: '2026-10-02' }),
    txn({ ...grab, amount: 124, txn_date: '2026-10-05' }),
    txn({ note: 'ครั้งเดียว', amount: 999 }),
    txn({ category: 'ลงทุน', note: 'Dime', amount: 1000 }),
    txn({ category: 'ลงทุน', note: 'Dime', amount: 1000 }),
    txn({ note: 'Claude', source: 'recurring' }),
    txn({ note: 'Claude', source: 'recurring' }),
  ];
  const templates = buildQuickTemplates(history);

  it('keeps frequent everyday entries, most frequent first, with the latest amount', () => {
    expect(templates.map((t) => [t.label, t.amount, t.count])).toEqual([
      ['ข้าว', 60, 3],
      ['GRAB', 124, 2],
    ]);
  });

  it('remembers the card and picks an icon', () => {
    expect(templates[1]).toMatchObject({ payment_method: 'card', creditor_id: 'ktc', icon: '🚕', payeeName: 'GRAB' });
    expect(templates[0].icon).toBe('🍚');
  });

  it('skips savings, recurring entries and one-offs', () => {
    expect(templates.some((t) => ['Dime', 'Claude', 'ครั้งเดียว'].includes(t.label))).toBe(false);
  });
});

describe('lastForPayee', () => {
  it('returns the most recent entry for that payee', () => {
    const a = txn({ ...grab, amount: 45, txn_date: '2026-10-02' });
    const b = txn({ ...grab, amount: 124, txn_date: '2026-10-05' });
    expect(lastForPayee([a, b], 'GRAB')?.amount).toBe(124);
    expect(lastForPayee([a, b], 'ร้านอื่น')).toBeNull();
  });
});
