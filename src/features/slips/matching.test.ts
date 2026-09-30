import { describe, expect, it } from 'vitest';
import type { PayeeRule } from '../../lib/types';
import { findRuleMatch, toKeywordValue } from './matching';

function rule(id: string, match_type: PayeeRule['match_type'], value: string): PayeeRule {
  return { id, payee_id: `payee-${id}`, match_type, match_value: value, created_at: '' };
}

const rules = [
  rule('rice', 'keyword', toKeywordValue('ร้านข้าว')),
  rule('rice-deluxe', 'keyword', toKeywordValue('ร้านข้าวมันไก่ป้าแดง')),
  rule('pp', 'promptpay', '29:01=0066812345678'),
];

describe('findRuleMatch', () => {
  it('prefers an exact PromptPay match', () => {
    const m = findRuleMatch(rules, { recipientKey: '29:01=0066812345678', ocrText: 'ร้านข้าว' });
    expect(m?.rule.id).toBe('pp');
    expect(m?.via).toBe('promptpay');
  });

  it('matches keywords regardless of OCR spacing, longest wins', () => {
    const m = findRuleMatch(rules, { recipientKey: null, ocrText: 'โอนให้\nร้าน ข้าวมันไก่ ป้าแดง\n50.00' });
    expect(m?.rule.id).toBe('rice-deluxe');
    expect(m?.via).toBe('keyword');
  });

  it('returns null when nothing matches', () => {
    expect(findRuleMatch(rules, { recipientKey: '29:01=000', ocrText: 'ร้านกาแฟ' })).toBeNull();
  });
});
