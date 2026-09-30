import { describe, expect, it } from 'vitest';
import { extractAmount, extractDate, extractTime, guessRecipient, normalizeForMatch } from './slipText';

const KBANK_LIKE = `โอนเงินสำเร็จ
1 ต.ค. 69 12:34 น.
นาย จัสดากร ข.
ธ.กสิกรไทย
xxx-x-x1234-x
ร้านข้าวมันไก่ป้าแดง
พร้อมเพย์
xxx-xxx-5678
เลขที่รายการ:
015274104552BPM06157
จำนวน:
1,250.00 บาท
ค่าธรรมเนียม:
0.00 บาท`;

describe('extractDate', () => {
  it('parses Thai abbreviated month with 2-digit Buddhist year', () => {
    expect(extractDate(KBANK_LIKE)).toBe('2026-10-01');
  });
  it('parses full Thai month with 4-digit Buddhist year', () => {
    expect(extractDate('วันที่ 15 มกราคม 2569')).toBe('2026-01-15');
  });
  it('parses English month names', () => {
    expect(extractDate('05 Mar 2026 - 09:10')).toBe('2026-03-05');
  });
  it('parses numeric dates', () => {
    expect(extractDate('31/12/2568')).toBe('2025-12-31');
  });
  it('returns null when absent', () => {
    expect(extractDate('no date here')).toBeNull();
  });
});

describe('extractTime', () => {
  it('reads HH:MM', () => {
    expect(extractTime(KBANK_LIKE)).toBe('12:34');
  });
  it('accepts a dot separator only with the Thai suffix', () => {
    expect(extractTime('เวลา 08.05 น.')).toBe('08:05');
    expect(extractTime('1,250.00')).toBeNull();
  });
});

describe('extractAmount', () => {
  it('prefers the labelled amount and skips the fee', () => {
    expect(extractAmount(KBANK_LIKE)).toBe(1250);
  });
  it('falls back to the first non-zero amount', () => {
    expect(extractAmount('something\n45.50\n0.00')).toBe(45.5);
  });
  it('returns null without amounts', () => {
    expect(extractAmount('ไม่มีตัวเลข')).toBeNull();
  });
});

describe('guessRecipient', () => {
  it('suggests the second name-like line (sender comes first), skipping bank names and masked accounts', () => {
    const guess = guessRecipient(KBANK_LIKE);
    expect(guess.candidates).toEqual(['นาย จัสดากร ข.', 'ร้านข้าวมันไก่ป้าแดง']);
    expect(guess.suggested).toBe('ร้านข้าวมันไก่ป้าแดง');
  });
  it('uses the line after a "ไปยัง" label when present', () => {
    const guess = guessRecipient('จาก\nนาย ก\nไปยัง\nร้านกาแฟดี\n100.00 บาท');
    expect(guess.suggested).toBe('ร้านกาแฟดี');
  });
  it('reads a recipient on the same line as the label', () => {
    expect(guessRecipient('ไปยัง ร้านกาแฟดี').suggested).toBe('ร้านกาแฟดี');
  });
});

describe('normalizeForMatch', () => {
  it('drops spacing and punctuation', () => {
    expect(normalizeForMatch('ร้าน ข้าว.มัน-ไก่')).toBe('ร้านข้าวมันไก่');
  });
});
