import type { PayeeRule } from '../../lib/types';
import { normalizeForMatch } from './slipText';

export interface MatchInput {
  /** Recipient key from a PromptPay / Thai QR payment code, if the image had one. */
  recipientKey: string | null;
  /** Raw OCR text of the slip. */
  ocrText: string;
}

export interface RuleMatch {
  rule: PayeeRule;
  via: 'promptpay' | 'keyword';
}

/**
 * Finds the payee rule matching a slip. A PromptPay recipient key is an exact identifier
 * and wins; otherwise the longest keyword found in the OCR text wins (most specific).
 */
export function findRuleMatch(rules: PayeeRule[], input: MatchInput): RuleMatch | null {
  if (input.recipientKey) {
    const exact = rules.find((r) => r.match_type === 'promptpay' && r.match_value === input.recipientKey);
    if (exact) return { rule: exact, via: 'promptpay' };
  }

  const haystack = normalizeForMatch(input.ocrText);
  if (!haystack) return null;
  let best: PayeeRule | null = null;
  for (const rule of rules) {
    if (rule.match_type !== 'keyword') continue;
    if (!haystack.includes(rule.match_value)) continue;
    if (!best || rule.match_value.length > best.match_value.length) best = rule;
  }
  return best ? { rule: best, via: 'keyword' } : null;
}

/** Keyword values are stored normalized so matching is insensitive to OCR spacing. */
export function toKeywordValue(text: string): string {
  return normalizeForMatch(text);
}
