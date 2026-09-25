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

describe('Client Contact position and decision roles', () => {
  it('trims the position and returns decision roles once in vocabulary order', () => {
    const input = {
      name: ' Ion Demo ',
      position: '  Director general  ',
      decisionRoles: [
        'financial',
        'blocker',
        'final_decision_maker',
        'financial',
        'user',
        'technical',
        'influencer',
      ],
    };

    const expected = [
      {
        name: 'Ion Demo',
        position: 'Director general',
        decisionRoles: [
          'final_decision_maker',
          'influencer',
          'user',
          'financial',
          'technical',
          'blocker',
        ],
      },
    ];
    expect(
      normalizeRegistration({ displayName: 'AGRONOVA', contacts: [input] })
        .contacts,
    ).toEqual(expected);
    expect(normalizeCorrection({ contacts: [input] }).contacts).toEqual(
      expected,
    );
  });

  it('omits a blank position and an empty decision-role list', () => {
    expect(
      normalizeCorrection({
        contacts: [{ name: 'Maria Demo', position: '   ', decisionRoles: [] }],
      }).contacts,
    ).toEqual([{ name: 'Maria Demo' }]);
  });

  it('accepts a position of exactly 500 characters after trimming', () => {
    const position = 'P'.repeat(500);
    expect(
      normalizeCorrection({
        contacts: [{ name: 'Ion Demo', position: ` ${position} ` }],
      }).contacts,
    ).toEqual([{ name: 'Ion Demo', position }]);
  });

  it.each([
    [
      'a position over 500 characters',
      { position: 'P'.repeat(501) },
      'Client contact position is too long.',
    ],
    [
      'a non-text position',
      { position: 42 },
      'Client contact position must be text.',
    ],
    [
      'a null position',
      { position: null },
      'Client contact position must be text.',
    ],
    [
      'a non-list decision-role value',
      { decisionRoles: 'financial' },
      'Client contact decision roles must be a list.',
    ],
    [
      'a null decision-role value',
      { decisionRoles: null },
      'Client contact decision roles must be a list.',
    ],
    [
      'a non-text decision role',
      { decisionRoles: [1] },
      'Unknown Client contact decision role.',
    ],
    [
      'an unknown decision role',
      { decisionRoles: ['financial', 'sponsor'] },
      'Unknown Client contact decision role.',
    ],
    [
      'a decision role in another case',
      { decisionRoles: ['Financial'] },
      'Unknown Client contact decision role.',
    ],
    [
      'another unknown Contact key',
      { preference: 'email' },
      'Unknown Client contact field.',
    ],
  ])('rejects %s', (_name, field, message) => {
    for (const normalize of [
      () =>
        normalizeRegistration({
          displayName: 'AGRONOVA',
          contacts: [{ name: 'Ion Demo', ...field }],
        }),
      () => normalizeCorrection({ contacts: [{ name: 'Ion Demo', ...field }] }),
    ]) {
      expect(normalize).toThrow(message);
    }
  });

  it('keeps rejecting Contacts on the minimal bootstrap registration', () => {
    expect(() =>
      normalizeMinimalRegistration({
        displayName: 'AGRONOVA',
        contacts: [{ name: 'Ion Demo', decisionRoles: ['financial'] }],
      }),
    ).toThrow('Unknown Client field.');
  });

  it('keeps the 50-Contact limit', () => {
    const contact = { name: 'Ion Demo', decisionRoles: ['user'] };
    expect(
      normalizeCorrection({
        contacts: Array.from({ length: 50 }, () => contact),
      }).contacts,
    ).toHaveLength(50);
    expect(() =>
      normalizeCorrection({
        contacts: Array.from({ length: 51 }, () => contact),
      }),
    ).toThrow('Client contacts must be a bounded list.');
  });

  it.each([
    ['a delivered Contact without the new fields', { name: 'Ion Demo' }],
    [
      'a delivered Contact with telephone and email',
      { name: 'Ion Demo', telephone: '+373', email: 'ion@example.test' },
    ],
    [
      'a Contact with canonical position and decision roles',
      {
        name: 'Ion Demo',
        position: 'Director general',
        decisionRoles: ['final_decision_maker', 'financial'],
      },
    ],
  ])('recognizes %s as stored', (_name, contact) => {
    expect(isStoredClientContact(contact)).toBe(true);
  });

  it.each([
    ['a non-object', 'Ion Demo'],
    ['an unnamed Contact', { telephone: '+373' }],
    ['a null telephone', { name: 'A', telephone: null }],
    ['an unknown key', { name: 'A', role: 'private' }],
    ['a non-text position', { name: 'A', position: 42 }],
    ['a blank position', { name: 'A', position: '  ' }],
    ['an untrimmed position', { name: 'A', position: ' Director ' }],
    [
      'a position over 500 characters',
      { name: 'A', position: 'P'.repeat(501) },
    ],
    ['a non-list decision role', { name: 'A', decisionRoles: 'financial' }],
    ['an empty decision-role list', { name: 'A', decisionRoles: [] }],
    ['an unknown decision role', { name: 'A', decisionRoles: ['sponsor'] }],
    [
      'duplicated decision roles',
      { name: 'A', decisionRoles: ['financial', 'financial'] },
    ],
    [
      'decision roles outside vocabulary order',
      { name: 'A', decisionRoles: ['financial', 'final_decision_maker'] },
    ],
  ])('does not recognize %s as stored', (_name, contact) => {
    expect(isStoredClientContact(contact)).toBe(false);
  });
});

describe('Client Contact with every optional field', () => {
  const stored = {
    name: 'Ion Demo',
    telephone: '+373 60 000 372',
    email: 'ion@example.test',
    position: 'Director general',
    decisionRoles: ['final_decision_maker', 'financial'],
    communicationPreferences: 'Romanian;\nemail preferred',
  };

  it('normalizes and recognizes position, decision roles and preferences together', () => {
    const input = {
      name: ' Ion Demo ',
      telephone: '+373 60 000 372',
      email: 'ion@example.test',
      position: ' Director general ',
      decisionRoles: ['financial', 'final_decision_maker'],
      communicationPreferences: ' Romanian;\nemail preferred ',
    };

    expect(registeredContacts([input])).toEqual([stored]);
    expect(normalizeCorrection({ contacts: [input] }).contacts).toEqual([
      stored,
    ]);
    expect(isStoredClientContact(stored)).toBe(true);
  });

  it.each([
    ['untrimmed preferences', { communicationPreferences: ' Email' }],
    ['null preferences', { communicationPreferences: null }],
    ['an untrimmed position', { position: ' Director ' }],
    ['an empty decision-role list', { decisionRoles: [] }],
  ])(
    'does not recognize an otherwise canonical Contact with %s',
    (_name, field) => {
      expect(isStoredClientContact({ ...stored, ...field })).toBe(false);
    },
  );
});

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
