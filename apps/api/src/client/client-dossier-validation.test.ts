import { describe, expect, it } from 'vitest';
import {
  isStoredClientContact,
  normalizeCorrection,
  normalizeMinimalRegistration,
  normalizeRegistration,
  requireVersion,
} from './client-dossier-validation.js';

/** U+1F600 is one Unicode code point stored as two UTF-16 code units. */
const astral = '\u{1F600}';

function registeredContacts(contacts: unknown) {
  return normalizeRegistration({ displayName: 'Exemplu SRL', contacts })
    .contacts;
}

describe('Client dossier validation', () => {
  it('normalizes a legacy registration to the minimal Client interface', () => {
    expect(
      normalizeMinimalRegistration({ displayName: '  Exemplu Client SRL  ' }),
    ).toEqual({
      displayName: 'Exemplu Client SRL',
      taxId: null,
      address: null,
      telephone: null,
      generalEmail: null,
      contacts: [],
      businessActivity: null,
    });
  });

  it.each([
    { taxId: null },
    { address: '' },
    { telephone: undefined },
    { generalEmail: null },
    { contacts: [] },
    { businessActivity: null },
  ])('rejects enriched fields from a minimal registration: %o', (field) => {
    expect(() =>
      normalizeMinimalRegistration({
        displayName: 'Exemplu Client SRL',
        ...field,
      }),
    ).toThrow('Unknown Client field.');
  });

  it('rejects Contact communication preferences from a minimal registration', () => {
    expect(() =>
      normalizeMinimalRegistration({
        displayName: 'Exemplu Client SRL',
        contacts: [{ name: 'Ion Demo', communicationPreferences: 'Email' }],
      }),
    ).toThrow('Unknown Client field.');
  });

  describe('Contact communication preferences', () => {
    it('keeps trimmed text with its internal spacing and line breaks', () => {
      expect(
        registeredContacts([
          {
            name: 'Ion Demo',
            telephone: '+373 60 000 372',
            communicationPreferences:
              '  Romanian;  email preferred\nweekday mornings\t ',
          },
          { name: 'Ana Demo' },
        ]),
      ).toEqual([
        {
          name: 'Ion Demo',
          telephone: '+373 60 000 372',
          communicationPreferences:
            'Romanian;  email preferred\nweekday mornings',
        },
        { name: 'Ana Demo' },
      ]);
    });

    it('omits blank text so the stored Contact has no preferences key', () => {
      const [contact] = registeredContacts([
        { name: 'Ion Demo', communicationPreferences: ' \n\t ' },
      ]);
      expect(contact).toEqual({ name: 'Ion Demo' });
      expect(Object.hasOwn(contact ?? {}, 'communicationPreferences')).toBe(
        false,
      );
    });

    it.each([
      ['1000 single-unit characters', 'a'.repeat(1_000)],
      ['1000 astral characters', astral.repeat(1_000)],
      [
        '999 characters and one astral character',
        `${'a'.repeat(999)}${astral}`,
      ],
      ['1000 characters inside trimmed spacing', ` ${'a'.repeat(1_000)}\n`],
    ])('accepts %s', (_name, communicationPreferences) => {
      expect(
        registeredContacts([{ name: 'Ion Demo', communicationPreferences }]),
      ).toEqual([
        {
          name: 'Ion Demo',
          communicationPreferences: communicationPreferences.trim(),
        },
      ]);
    });

    it.each([
      ['1001 single-unit characters', 'a'.repeat(1_001)],
      ['1001 astral characters', astral.repeat(1_001)],
      [
        '1000 characters and one astral character',
        `${'a'.repeat(1_000)}${astral}`,
      ],
    ])('rejects %s as too long', (_name, communicationPreferences) => {
      expect(() =>
        registeredContacts([{ name: 'Ion Demo', communicationPreferences }]),
      ).toThrow('Client contact communication preferences are too long.');
    });

    it.each([
      ['null', null],
      ['a number', 42],
      ['a boolean', true],
      ['a list', ['Email']],
      ['an object', { channel: 'Email' }],
    ])('rejects %s as not text', (_name, communicationPreferences) => {
      expect(() =>
        registeredContacts([{ name: 'Ion Demo', communicationPreferences }]),
      ).toThrow('Client contact communication preferences must be text.');
    });

    it('keeps the delivered Contact name, email and unknown-field rules', () => {
      expect(() =>
        registeredContacts([{ name: ' ', communicationPreferences: 'Email' }]),
      ).toThrow('Client contact name is required.');
      expect(() =>
        registeredContacts([
          {
            name: 'Ion Demo',
            email: 'not-an-email',
            communicationPreferences: 'Email',
          },
        ]),
      ).toThrow('Client contact email is invalid.');
      expect(() =>
        registeredContacts([{ name: 'Ion Demo', preferences: 'Email' }]),
      ).toThrow('Unknown Client contact field.');
    });

    it('corrects and explicitly clears preferences through the submitted Contact list', () => {
      expect(
        normalizeCorrection({
          contacts: [
            { name: 'Ion Demo', communicationPreferences: ' Email only ' },
          ],
        }),
      ).toEqual({
        contacts: [
          { name: 'Ion Demo', communicationPreferences: 'Email only' },
        ],
      });
      expect(
        normalizeCorrection({
          contacts: [{ name: 'Ion Demo', communicationPreferences: '' }],
        }),
      ).toEqual({ contacts: [{ name: 'Ion Demo' }] });
    });
  });

  describe('stored Contacts', () => {
    it.each([
      ['a delivered Contact', { name: 'Ion Demo' }],
      [
        'a delivered Contact with every text field',
        { name: ' Ion ', telephone: '', email: 'ion@example.test' },
      ],
      [
        'canonical communication preferences',
        { name: 'Ion Demo', communicationPreferences: 'Email\nmornings' },
      ],
      [
        '1000 astral characters',
        { name: 'Ion Demo', communicationPreferences: astral.repeat(1_000) },
      ],
    ])('accepts %s', (_name, contact) => {
      expect(isStoredClientContact(contact)).toBe(true);
    });

    it.each([
      ['a non-object', 'Ion Demo'],
      ['a missing name', { telephone: '+373 60 000 372' }],
      ['a null telephone', { name: 'Ion Demo', telephone: null }],
      ['an unknown key', { name: 'Ion Demo', preferences: 'Email' }],
      [
        'null preferences',
        { name: 'Ion Demo', communicationPreferences: null },
      ],
      [
        'non-text preferences',
        { name: 'Ion Demo', communicationPreferences: 1 },
      ],
      ['blank preferences', { name: 'Ion Demo', communicationPreferences: '' }],
      [
        'untrimmed preferences',
        { name: 'Ion Demo', communicationPreferences: ' Email' },
      ],
      [
        'over-long preferences',
        { name: 'Ion Demo', communicationPreferences: astral.repeat(1_001) },
      ],
    ])('rejects %s', (_name, contact) => {
      expect(isStoredClientContact(contact)).toBe(false);
    });
  });

  it('accepts every version that can be incremented in PostgreSQL', () => {
    expect(requireVersion(1)).toBe(1);
    expect(requireVersion(2_147_483_646)).toBe(2_147_483_646);
  });

  it.each([0, -1, 1.5, 2_147_483_647, 2_147_483_648, Number.MAX_SAFE_INTEGER])(
    'rejects an expected version outside the persisted integer range: %s',
    (value) => {
      expect(() => requireVersion(value)).toThrow(
        'Expected Client version must be an integer between 1 and 2147483646.',
      );
    },
  );
});
