import { createHmac } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { describe, expect, it } from 'vitest';
import {
  createContinuationCursor,
  continuationCursorMaximumLength,
  type ContinuationCursorBinding,
  type ContinuationCursorKey,
} from './continuation-cursor.js';
import {
  BASELINE_BINDING,
  BASELINE_KEY,
  BASELINE_PAYMENT_CURSORS,
  BASELINE_INVOICE_CURSORS,
  BASELINE_FOLLOW_UP_CURSORS,
} from './continuation-cursor-baseline.test-support.js';

const baselines = [
  ...BASELINE_PAYMENT_CURSORS,
  ...BASELINE_INVOICE_CURSORS,
  ...BASELINE_FOLLOW_UP_CURSORS,
];
type Position = (typeof baselines)[number]['position'];
type Protocol = Parameters<typeof createContinuationCursor>[0]['protocol'];

// A position decoder is a feature adapter. These tests accept the finite
// known-good corpus; the feature compatibility suite exercises real decoders.
function baselinePosition(value: unknown): Position {
  const known = baselines.find((entry) =>
    isDeepStrictEqual(entry.position, value),
  );
  if (!known) throw new Error('Unknown baseline position.');
  return known.position;
}
function cursorFor(
  protocol: Protocol = 'payment',
  key: ContinuationCursorKey<Position['kind']> = async () => BASELINE_KEY,
) {
  return createContinuationCursor({
    protocol,
    key,
    position: { encode: (value: Position) => value, decode: baselinePosition },
    invalid: () => new Error('Invalid continuation.'),
    wrongKind: () => new Error('Wrong continuation kind.'),
  });
}
const paymentInventory = BASELINE_PAYMENT_CURSORS.find(
  (entry) => entry.position.kind === 'inventory',
);
if (!paymentInventory) throw new Error('Missing baseline inventory cursor.');
const inventory = paymentInventory;

function signed(envelope: unknown): string {
  const payload = Buffer.from(JSON.stringify(envelope)).toString('base64url');
  return (
    payload +
    '.' +
    createHmac('sha256', BASELINE_KEY).update(payload).digest('base64url')
  );
}
function envelopeFor(
  protocol: Protocol,
  position: Position,
  binding: ContinuationCursorBinding = BASELINE_BINDING,
) {
  switch (protocol) {
    case 'payment':
      return { format: 'PAYMENT_CURSOR/1', binding, position };
    case 'invoice-record':
      return { format: 'EXTERNAL_INVOICE_CURSOR/1', binding, position };
    case 'opportunity-follow-up':
      return {
        format: 'opportunity-follow-up-cursor.v1',
        ...binding,
        ...position,
      };
  }
}
const protocols = [
  { protocol: 'payment', position: inventory.position, maximum: 2048 },
  { protocol: 'invoice-record', position: inventory.position, maximum: 4096 },
  {
    protocol: 'opportunity-follow-up',
    position: BASELINE_FOLLOW_UP_CURSORS[1]?.position,
    maximum: 2048,
  },
] satisfies {
  protocol: Protocol;
  position: Position | undefined;
  maximum: number;
}[];

describe('signed continuation cursor module', () => {
  it('reads an already issued position through its scoped key adapter', async () => {
    const cursor = cursorFor('payment', async ({ scope }) => {
      if (
        scope.workspaceId !== BASELINE_BINDING.workspaceId ||
        scope.companyId !== BASELINE_BINDING.companyId
      )
        throw new Error('No Company key.');
      return BASELINE_KEY;
    });
    await expect(
      cursor.read({
        value: inventory.token,
        binding: BASELINE_BINDING,
        kind: 'inventory',
      }),
    ).resolves.toEqual(inventory.position);
    await expect(
      cursor.issue({ binding: BASELINE_BINDING, position: inventory.position }),
    ).resolves.toBe(inventory.token);
  });

  it('rejects an altered signature', async () => {
    const [payload, signature] = inventory.token.split('.');
    if (!payload || !signature) throw new Error('Missing signature.');
    const value =
      payload +
      '.' +
      (signature.startsWith('A') ? 'B' : 'A') +
      signature.slice(1);
    await expect(
      cursorFor().read({ value, binding: BASELINE_BINDING, kind: 'inventory' }),
    ).rejects.toThrow('Invalid continuation.');
  });

  it('rejects an altered payload even when it still has the envelope syntax', async () => {
    const value =
      (inventory.token.startsWith('A') ? 'B' : 'A') + inventory.token.slice(1);
    await expect(
      cursorFor().read({ value, binding: BASELINE_BINDING, kind: 'inventory' }),
    ).rejects.toThrow('Invalid continuation.');
  });

  it('rejects a correctly signed cursor from another format', async () => {
    const value = signed({
      format: 'OTHER_CURSOR/1',
      binding: BASELINE_BINDING,
      position: inventory.position,
    });
    await expect(
      cursorFor().read({ value, binding: BASELINE_BINDING, kind: 'inventory' }),
    ).rejects.toThrow('Invalid continuation.');
  });

  it('rejects a valid position of another paging kind through the shared seam', async () => {
    await expect(
      cursorFor().read({
        value: inventory.token,
        binding: BASELINE_BINDING,
        kind: 'history',
      }),
    ).rejects.toThrow('Wrong continuation kind.');
  });

  it.each([
    { field: 'workspaceId', value: '00000000-0000-4000-8000-000000000091' },
    { field: 'companyId', value: '00000000-0000-4000-8000-000000000092' },
    {
      field: 'actorMembershipId',
      value: '00000000-0000-4000-8000-000000000093',
    },
    { field: 'readCapture', value: 'replaced-read-capture.synthetic.v1' },
  ])(
    'rejects a changed $field binding even when the signing key is the same',
    async ({ field, value }) => {
      await expect(
        cursorFor().read({
          value: inventory.token,
          binding: { ...BASELINE_BINDING, [field]: value },
          kind: 'inventory',
        }),
      ).rejects.toThrow('Invalid continuation.');
    },
  );

  it('rejects additional envelope and binding fields in a correctly signed token', async () => {
    for (const envelope of [
      {
        format: 'PAYMENT_CURSOR/1',
        binding: BASELINE_BINDING,
        position: inventory.position,
        extra: true,
      },
      {
        format: 'PAYMENT_CURSOR/1',
        binding: { ...BASELINE_BINDING, extra: true },
        position: inventory.position,
      },
    ])
      await expect(
        cursorFor().read({
          value: signed(envelope),
          binding: BASELINE_BINDING,
          kind: 'inventory',
        }),
      ).rejects.toThrow('Invalid continuation.');
  });

  it('rejects a noncanonical signature alias with the same decoded bytes', async () => {
    const [payload, signature] = inventory.token.split('.');
    if (!payload || !signature) throw new Error('Missing signature.');
    const alphabet =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const last = signature.at(-1);
    if (!last) throw new Error('Missing final signature character.');
    const replacement = alphabet[alphabet.indexOf(last) + 1];
    if (!replacement) throw new Error('Missing noncanonical signature alias.');
    const alias = signature.slice(0, -1) + replacement;
    expect(Buffer.from(alias, 'base64url')).toEqual(
      Buffer.from(signature, 'base64url'),
    );
    await expect(
      cursorFor().read({
        value: payload + '.' + alias,
        binding: BASELINE_BINDING,
        kind: 'inventory',
      }),
    ).rejects.toThrow('Invalid continuation.');
  });

  it.each(protocols)(
    'keeps the $protocol maximum of $maximum characters for both reading and issuance',
    async ({ protocol, position, maximum }) => {
      if (!position) throw new Error('Missing protocol position.');
      const binding = { ...BASELINE_BINDING, readCapture: 'X'.repeat(maximum) };
      const value = signed(envelopeFor(protocol, position, binding));
      expect(continuationCursorMaximumLength(protocol)).toBe(maximum);
      expect(value.length).toBeGreaterThan(maximum);
      const cursor = cursorFor(protocol);
      await expect(
        cursor.read({ value, binding, kind: position.kind }),
      ).rejects.toThrow('Invalid continuation.');
      await expect(cursor.issue({ binding, position })).rejects.toThrow(
        'Invalid continuation.',
      );
    },
  );

  it('keeps Invoice Record continuations between 2048 and 4096 characters readable', async () => {
    const binding = { ...BASELINE_BINDING, readCapture: 'X'.repeat(1800) };
    const value = signed(
      envelopeFor('invoice-record', inventory.position, binding),
    );
    expect(value.length).toBeGreaterThan(2048);
    expect(value.length).toBeLessThanOrEqual(4096);
    await expect(
      cursorFor('invoice-record').read({ value, binding, kind: 'inventory' }),
    ).resolves.toEqual(inventory.position);
  });

  it('propagates a persisted-key adapter failure without presenting it as malformed client input', async () => {
    const unavailable = new Error('Company continuation key unavailable.');
    const cursor = cursorFor('payment', async () => {
      throw unavailable;
    });
    await expect(
      cursor.read({
        value: inventory.token,
        binding: BASELINE_BINDING,
        kind: 'inventory',
      }),
    ).rejects.toBe(unavailable);
  });
});
