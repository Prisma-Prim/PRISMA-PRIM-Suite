import { expect, test } from 'vitest';
import { findConfidentialCommercialValues } from '../../e2e/commercial-journey-confidentiality';

test('accepts the captured other-Company Project timestamp without leaking a tax amount', () => {
  expect(
    findConfidentialCommercialValues({
      body: '{"projects":[{"createdAt":"2026-10-19T01:58:54.507Z"}]}',
      forbidden: ['4.50'],
    }),
  ).toEqual([]);
});

const snapshotAmounts = [
  '300.0000',
  '15.00',
  '600.00',
  '90.00',
  '30.00',
  '4.50',
  '570.00',
  '85.50',
  '655.50',
];

test('accepts incidental decimal substrings in larger numbers and timestamps', () => {
  expect(
    findConfidentialCommercialValues({
      body: JSON.stringify({
        createdAt: '2026-10-19T01:58:54.507Z',
        updatedAt: '2026-10-19T01:58:04.500Z',
        values: [
          1300.00001, 115.001, 1600.001, 190.001, 130.001, 14.507, 1570.001,
          185.501, 1655.501,
        ],
        labels: ['14.50', '4.507', '1300.0000'],
        enabled: true,
        missing: null,
      }),
      forbidden: snapshotAmounts,
    }),
  ).toEqual([]);
});

test.each(snapshotAmounts)(
  'rejects Snapshot amount %s as text, JSON number and nested content',
  (amount) => {
    for (const leaked of [
      amount,
      Number(amount),
      { snapshot: [{ amount }] },
      `Amount ${amount} EUR`,
      `Amount${amount}EUR`,
      { [amount]: 'unexpected key' },
    ]) {
      expect(
        findConfidentialCommercialValues({
          body: JSON.stringify({
            createdAt: '2026-10-19T01:58:54.507Z',
            leaked,
          }),
          forbidden: [amount],
        }),
      ).toEqual([amount]);
    }
  },
);

test.each([
  '00000000-0000-4000-8000-000000000281',
  'Exact synthetic source of the Desktop commercial journey.',
  'Journey audit request Desktop',
  'Certify the Desktop journey site',
  'Calificare Desktop',
  'Contractare Desktop',
  'Synthetic loyalty reduction',
  'illustrative-unit',
  'Illustrative tax',
  'Synthetic journey rule',
])(
  'rejects forbidden identifier or source %s in values and unexpected keys',
  (value) => {
    for (const leaked of [
      { nested: [`prefix ${value} suffix`] },
      { [`prefix ${value} suffix`]: null },
    ]) {
      expect(
        findConfidentialCommercialValues({
          body: JSON.stringify({
            createdAt: '2026-10-19T01:58:54.507Z',
            leaked,
          }),
          forbidden: [value, '4.50'],
        }),
      ).toEqual([value]);
    }
  },
);

test('rejects a confidential amount alongside a forbidden UUID and source', () => {
  expect(
    findConfidentialCommercialValues({
      body: '{"createdAt":"2026-10-19T01:58:54.507Z","hidden":{"id":"00000000-0000-4000-8000-000000000281","source":"Exact synthetic source","amount":4.50}}',
      forbidden: [
        '4.50',
        '00000000-0000-4000-8000-000000000281',
        'Exact synthetic source',
      ],
    }),
  ).toEqual([
    '4.50',
    '00000000-0000-4000-8000-000000000281',
    'Exact synthetic source',
  ]);
});

test('does not interpret UUID digits as decimal amounts', () => {
  expect(
    findConfidentialCommercialValues({
      body: '{"id":"30000000-0015-4600-8090-003004505708"}',
      forbidden: snapshotAmounts,
    }),
  ).toEqual([]);
});

test('does not turn malformed JSON into a successful confidentiality check', () => {
  expect(() =>
    findConfidentialCommercialValues({ body: '{', forbidden: ['4.50'] }),
  ).toThrow(SyntaxError);
});

test('preserves literal identifier detection even in overwritten JSON fields', () => {
  expect(
    findConfidentialCommercialValues({
      body: '{"source":"Exact synthetic source","source":null}',
      forbidden: ['Exact synthetic source'],
    }),
  ).toEqual(['Exact synthetic source']);
});

test.each([
  { forbidden: '4.50', representation: '4.500' },
  { forbidden: '4.50', representation: '4.5' },
  { forbidden: '4.50', representation: '004.500' },
  { forbidden: '300.0000', representation: '300' },
  { forbidden: '30.00', representation: '030.00' },
])(
  'rejects complete numeric string and key $representation as $forbidden',
  ({ forbidden, representation }) => {
    for (const leaked of [representation, { [representation]: null }]) {
      expect(
        findConfidentialCommercialValues({
          body: JSON.stringify({
            createdAt: '2026-10-19T01:58:04.500Z',
            leaked,
          }),
          forbidden: [forbidden],
        }),
      ).toEqual([forbidden]);
    }
  },
);

test.each(['Amount 4.500 EUR', 'Amount4.500EUR', 'Amount 4.5 EUR'])(
  'rejects the equivalent confidential amount in %s',
  (text) => {
    expect(
      findConfidentialCommercialValues({
        body: JSON.stringify({ createdAt: '2026-10-19T01:58:54.507Z', text }),
        forbidden: ['4.50'],
      }),
    ).toEqual(['4.50']);
  },
);

test('does not mistake implicit array indices for leaked JSON keys', () => {
  expect(
    findConfidentialCommercialValues({
      body: JSON.stringify(Array.from({ length: 601 }, () => null)),
      forbidden: snapshotAmounts,
    }),
  ).toEqual([]);
});

test.each([
  { instant: '2026-10-19T01:58:15.000Z', amount: '15.00', price: '15.000' },
  { instant: '2026-10-19T01:58:30.000Z', amount: '30.00', price: '30.000' },
  { instant: '2026-10-19T01:58:04.500Z', amount: '4.50', price: '4.500' },
])(
  'distinguishes clock token $instant from amount $amount in the same field',
  ({ instant, amount, price }) => {
    expect(
      findConfidentialCommercialValues({
        body: JSON.stringify({
          createdAt: instant,
          note: `Saved at ${instant}`,
        }),
        forbidden: snapshotAmounts,
      }),
    ).toEqual([]);
    expect(
      findConfidentialCommercialValues({
        body: JSON.stringify({
          note: `Saved at ${instant}; Amount${price}EUR; Exact synthetic source; 00000000-0000-4000-8000-000000000281`,
        }),
        forbidden: [
          amount,
          'Exact synthetic source',
          '00000000-0000-4000-8000-000000000281',
        ],
      }),
    ).toEqual([
      amount,
      'Exact synthetic source',
      '00000000-0000-4000-8000-000000000281',
    ]);
  },
);
