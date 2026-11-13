import { createHmac } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { describe, expect, it } from 'vitest';
import {
  createWorkingEvidenceContinuationCursor,
  continuationCursorMaximumLength,
} from './continuation-cursor.js';
import {
  BASELINE_BINDING,
  BASELINE_KEY,
} from './continuation-cursor-baseline.test-support.js';

type Position =
  | { kind: 'cases'; offset: number }
  | { kind: 'history'; offset: number }
  | {
      kind: 'sources';
      createdAt: string;
      documentId: string;
      versionNumber: number;
    };
const positions = [
  { kind: 'cases', offset: 2147483647 },
  { kind: 'history', offset: 25 },
  {
    kind: 'sources',
    createdAt: '2026-11-07T12:34:56.789Z',
    documentId: '00000000-0000-4000-8000-000000000013',
    versionNumber: 50,
  },
] satisfies Position[];
const binding = {
  ...BASELINE_BINDING,
  readCapture: 'ab'.repeat(32),
  context: [
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000012',
  ],
};
function encode(position: Position): readonly unknown[] {
  if (position.kind === 'sources')
    return [position.createdAt, position.documentId, position.versionNumber];
  return [position.offset];
}
function cursor() {
  return createWorkingEvidenceContinuationCursor<Position>({
    key: async () => BASELINE_KEY,
    position: {
      encode,
      decode: ({ kind, position }) => {
        const known = positions.find(
          (entry) =>
            entry.kind === kind && isDeepStrictEqual(encode(entry), position),
        );
        if (!known) throw new Error('Unexpected working position.');
        return known;
      },
    },
    invalid: () => new Error('Invalid continuation.'),
    wrongKind: () => new Error('Wrong continuation kind.'),
    unavailable: () => new Error('Continuation unavailable.'),
  });
}
function signed(envelope: unknown): string {
  const payload = Buffer.from(JSON.stringify(envelope)).toString('base64url');
  return (
    payload +
    '.' +
    createHmac('sha256', BASELINE_KEY).update(payload).digest('base64url')
  );
}
function payloadOf(value: string): unknown[] {
  const [payload] = value.split('.');
  if (!payload) throw new Error('Missing payload.');
  const result: unknown = JSON.parse(
    Buffer.from(payload, 'base64url').toString('utf8'),
  );
  if (!Array.isArray(result)) throw new Error('Expected compact envelope.');
  return result;
}

describe('compact Working Evidence continuation profile', () => {
  it.each(positions)(
    'authenticates the captured grant before contextual reading of $kind within256 ASCII characters',
    async (position) => {
      const codec = cursor();
      const value = await codec.issue({ binding, position });
      expect(value.length).toBeLessThanOrEqual(256);
      expect(value).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u);
      const opened = await codec.open({
        value,
        scope: binding,
        kind: position.kind,
      });
      expect(opened.readCapture).toBe(binding.readCapture);
      expect(
        opened.read({ ...binding, readCapture: opened.readCapture }),
      ).toEqual(position);
    },
  );

  it('allows the signed old capture to be reauthorized when a different capture is now preferred', async () => {
    const position = positions[0];
    if (!position) throw new Error('Missing Case position.');
    const codec = cursor();
    const value = await codec.issue({ binding, position });
    const preferred = { ...binding, readCapture: 'cd'.repeat(32) };
    const opened = await codec.open({ value, scope: preferred, kind: 'cases' });
    expect(() => opened.read(preferred)).toThrow('Invalid continuation.');
    // Access owns whether this authenticated old capture is still live.
    expect(
      opened.read({ ...preferred, readCapture: opened.readCapture }),
    ).toEqual(position);
  });

  it('refuses another actor, target or consumed native capture at the final binding comparison', async () => {
    const position = positions[2];
    if (!position) throw new Error('Missing source position.');
    const codec = cursor();
    const value = await codec.issue({ binding, position });
    const opened = await codec.open({ value, scope: binding, kind: 'sources' });
    for (const substituted of [
      { ...binding, actorMembershipId: '00000000-0000-4000-8000-000000000099' },
      { ...binding, companyId: '00000000-0000-4000-8000-000000000098' },
      { ...binding, context: ['another-target', ...binding.context] },
      { ...binding, context: [...binding.context, 'replacement-native-grant'] },
    ])
      expect(() => opened.read(substituted)).toThrow('Invalid continuation.');
  });

  it('keeps Case and history kinds distinct even with the same binding and offset-shaped position', async () => {
    const position = positions[0];
    if (!position) throw new Error('Missing Case position.');
    const codec = cursor();
    const value = await codec.issue({ binding, position });
    await expect(
      codec.open({ value, scope: binding, kind: 'history' }),
    ).rejects.toThrow('Wrong continuation kind.');
  });

  it('rejects an altered signature before exposing the captured grant', async () => {
    const position = positions[0];
    if (!position) throw new Error('Missing Case position.');
    const codec = cursor();
    const original = await codec.issue({ binding, position });
    const [payload, signature] = original.split('.');
    if (!payload || !signature) throw new Error('Missing signature.');
    const value =
      payload +
      '.' +
      (signature.startsWith('A') ? 'B' : 'A') +
      signature.slice(1);
    await expect(
      codec.open({ value, scope: binding, kind: 'cases' }),
    ).rejects.toThrow('Invalid continuation.');
  });

  it('checks compact format and canonical packed capture even with a valid signature', async () => {
    const position = positions[0];
    if (!position) throw new Error('Missing Case position.');
    const codec = cursor();
    const value = await codec.issue({ binding, position });
    const parts = payloadOf(value);
    for (const envelope of [
      ['OTHER/1', ...parts.slice(1)],
      [parts[0], parts[1], 'not-a-capture', ...parts.slice(3)],
    ])
      await expect(
        codec.open({ value: signed(envelope), scope: binding, kind: 'cases' }),
      ).rejects.toThrow('Invalid continuation.');
  });

  it('rejects an overlength compact envelope before exposing its authenticated capture', async () => {
    const position = positions[0];
    if (!position) throw new Error('Missing Case position.');
    const codec = cursor();
    const value = await codec.issue({ binding, position });
    const oversized = signed([...payloadOf(value), 'X'.repeat(200)]);
    expect(continuationCursorMaximumLength('working-evidence')).toBe(256);
    expect(oversized.length).toBeGreaterThan(256);
    await expect(
      codec.open({ value: oversized, scope: binding, kind: 'cases' }),
    ).rejects.toThrow('Invalid continuation.');
  });

  it('refuses issuance with an invalid internal capture or an overlength encoded position', async () => {
    const position = positions[2];
    if (!position) throw new Error('Missing source position.');
    await expect(
      cursor().issue({
        binding: { ...binding, readCapture: 'invalid-capture' },
        position,
      }),
    ).rejects.toThrow('Continuation unavailable.');
    const codec = createWorkingEvidenceContinuationCursor<Position>({
      key: async () => BASELINE_KEY,
      position: { encode: () => ['X'.repeat(200)], decode: () => position },
      invalid: () => new Error('Invalid continuation.'),
      wrongKind: () => new Error('Wrong continuation kind.'),
      unavailable: () => new Error('Continuation unavailable.'),
    });
    await expect(codec.issue({ binding, position })).rejects.toThrow(
      'Continuation unavailable.',
    );
  });
});
