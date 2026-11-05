import { describe, expect, it } from 'vitest';
import {
  validOfferMessageBody,
  validOfferMessageRecipient,
  validOfferMessageSubject,
} from './offer-message-grammar';

describe('manual Offer message grammar', () => {
  it('accepts the complete literal ASCII mailbox punctuation without changing case', () => {
    expect(
      validOfferMessageRecipient("A!#$%&'*+-/=?^_`{|}~.Z@Case-1.Example"),
    ).toBe(true);
    expect(
      validOfferMessageRecipient(
        `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(61)}`,
      ),
    ).toBe(true);
    expect(
      validOfferMessageRecipient(
        `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(62)}`,
      ),
    ).toBe(false);
  });
  it.each([
    '',
    ' a@b.co',
    'a@b.co ',
    'a@b.co\n',
    'a@b.co\r\n',
    'a@b.co,b@c.co',
    'a@b.co;b@c.co',
    'Name <a@b.co>',
    '"a"@b.co',
    'a..b@b.co',
    '.a@b.co',
    'a.@b.co',
    'a@localhost',
    'a@-b.co',
    'a@b-.co',
    'a@b..co',
    'é@b.co',
    'a@é.co',
    'a@b_co.co',
    `${'a'.repeat(65)}@b.co`,
    `a@${'b'.repeat(64)}.co`,
  ])('refuses literal recipient %j', (value) => {
    expect(validOfferMessageRecipient(value)).toBe(false);
  });
  it('counts subject UTF-16 units and validates scalar Unicode and controls', () => {
    expect(validOfferMessageSubject(' 🌍 literal ')).toBe(true);
    expect(validOfferMessageSubject('🌍'.repeat(100))).toBe(true);
    expect(validOfferMessageSubject(`${'🌍'.repeat(100)}a`)).toBe(false);
    for (const value of [
      '',
      ' \t',
      'a\n',
      'a\r',
      'a\t',
      'a\0',
      'a\x7F',
      'a\x85',
      'a\u2028',
      'a\u2029',
      'a\uD800',
      'a\uDC00',
    ])
      expect(validOfferMessageSubject(value), JSON.stringify(value)).toBe(
        false,
      );
  });
  it('preserves body whitespace while refusing forbidden controls and unpaired Unicode', () => {
    expect(validOfferMessageBody(' \tLiteral\r\n🌍\n ')).toBe(true);
    expect(validOfferMessageBody('🌍'.repeat(5000))).toBe(true);
    expect(validOfferMessageBody(`${'🌍'.repeat(5000)}a`)).toBe(false);
    for (const value of [
      '',
      ' \t\r\n',
      'a\0',
      'a\x01',
      'a\x0B',
      'a\x0C',
      'a\x1F',
      'a\x7F',
      'a\x85',
      'a\uD800',
      'a\uDC00',
    ])
      expect(validOfferMessageBody(value), JSON.stringify(value)).toBe(false);
  });
});
