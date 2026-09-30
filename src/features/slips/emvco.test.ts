import { describe, expect, it } from 'vitest';
import { parseQrPayload, parseTlv } from './emvco';

function tlv(tag: string, value: string): string {
  return `${tag}${String(value.length).padStart(2, '0')}${value}`;
}

describe('parseTlv', () => {
  it('parses nested fields', () => {
    expect(parseTlv('0002015802TH')).toEqual([
      { tag: '00', value: '01' },
      { tag: '58', value: 'TH' },
    ]);
  });

  it('rejects truncated data', () => {
    expect(parseTlv('0005abc')).toBeNull();
    expect(parseTlv('https://example.com')).toBeNull();
  });
});

describe('parseQrPayload', () => {
  it('reads bank code and transaction ref from a slip mini-QR', () => {
    const inner = tlv('00', '000001') + tlv('01', '004') + tlv('02', '015274104552BPM06157');
    const payload = tlv('00', inner) + tlv('51', 'TH') + tlv('91', 'A1B2');
    expect(parseQrPayload(payload)).toEqual({ kind: 'slip', bankCode: '004', transRef: '015274104552BPM06157' });
  });

  it('reads a PromptPay mobile recipient as a stable key', () => {
    const payload =
      tlv('00', '01') +
      tlv('01', '11') +
      tlv('29', tlv('00', 'A000000677010111') + tlv('01', '0066812345678')) +
      tlv('58', 'TH') +
      tlv('53', '764') +
      tlv('59', 'KHAO MAN GAI') +
      tlv('63', 'ABCD');
    expect(parseQrPayload(payload)).toEqual({
      kind: 'payment',
      recipientKey: '29:01=0066812345678',
      merchantName: 'KHAO MAN GAI',
      amount: null,
    });
  });

  it('keys bill-payment QRs by biller id + ref1, ignoring the per-transaction ref2', () => {
    const make = (ref2: string) =>
      tlv('00', '01') +
      tlv('01', '12') +
      tlv('30', tlv('00', 'A000000677010112') + tlv('01', '010554000123456') + tlv('02', 'SHOP42') + tlv('03', ref2)) +
      tlv('54', '45.00') +
      tlv('63', 'ABCD');
    const a = parseQrPayload(make('REF-1'));
    const b = parseQrPayload(make('REF-2'));
    expect(a).toMatchObject({ kind: 'payment', recipientKey: '30:01=010554000123456|02=SHOP42', amount: 45 });
    expect(a).toEqual(b);
  });

  it('returns unknown for non-EMV content', () => {
    expect(parseQrPayload('hello world')).toEqual({ kind: 'unknown' });
  });
});
