import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  literal,
  readInventory,
  readPassage,
  readSearch,
} from './knowledge-response';
import { literalText, passage, source } from './knowledge.test-fixture';
import { assertMessageCoverage } from '../localization/messages';
import { knowledgeMessages } from './knowledge.copy';
beforeEach(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => vi.unstubAllGlobals());
it('preserves exact literal Unicode and whitespace, and validates fresh historical observations against immutable identity', async () => {
  const known = await readPassage(passage(), 'current');
  expect(known.text).toBe(literalText);
  const historical = {
    ...passage(),
    source: { ...source, versionStatus: 'superseded' },
    retrievedAt: '2026-11-02T12:00:00.000Z',
  };
  expect(await readPassage(historical, 'historical', known)).toMatchObject({
    source: { versionStatus: 'superseded' },
    retrievedAt: '2026-11-02T12:00:00.000Z',
  });
  await expect(readPassage(historical, 'current', known)).rejects.toThrow();
  await expect(
    readPassage(
      {
        ...historical,
        source: {
          ...historical.source,
          representationId: '40000000-0000-4000-8000-000000001016',
        },
      },
      'historical',
      known,
    ),
  ).rejects.toThrow();
});
it('rejects malformed, duplicate, oversized, wrong-bound and hash-incompatible replies', async () => {
  expect(() =>
    readInventory({ items: [source, source], nextCursor: null }),
  ).toThrow();
  expect(() =>
    readInventory({ items: [source], nextCursor: 'x'.repeat(2049) }),
  ).toThrow();
  expect(() =>
    readInventory({
      items: Array.from({ length: 21 }, () => source),
      nextCursor: null,
    }),
  ).toThrow();
  await expect(
    readPassage({ ...passage(), text: literalText + '!' }, 'current'),
  ).rejects.toThrow();
  await expect(
    readPassage(
      { ...passage(), retrievedAt: '2026-02-30T12:00:00.000Z' },
      'current',
    ),
  ).rejects.toThrow();
  await expect(
    readSearch({ items: [passage(), passage()], nextCursor: null }, 'Four'),
  ).rejects.toThrow();
  await expect(
    readSearch({ items: [passage()], nextCursor: null }, 'four'),
  ).rejects.toThrow();
  expect(await readSearch({ items: [], nextCursor: null }, 'Four')).toEqual({
    items: [],
    nextCursor: null,
  });
});
it('accepts the exact 1–200 UTF-16 grammar without normalizing', () => {
  for (const query of [
    '',
    '  ',
    '\0',
    '\ud800',
    'a'.repeat(201),
    '🌍'.repeat(101),
  ])
    expect(literal(query, 200)).toBe(false);
  for (const query of [' Four ', 'e\u0301', '🌍'.repeat(100), '\tЖ\n'])
    expect(literal(query, 200)).toBe(true);
});
it('provides every feature message in all four interface locales', () => {
  assertMessageCoverage('knowledge-evidence', knowledgeMessages);
  expect(() =>
    readInventory({ items: [{ ...source, language: 'fr' }], nextCursor: null }),
  ).toThrow();
});
it.each(['sourceId', 'documentId', 'documentVersionId', 'representationId'])(
  'rejects a fresh passage bound to a different %s',
  async (field) => {
    const known = await readPassage(passage(), 'current');
    await expect(
      readPassage(
        {
          ...passage(),
          source: {
            ...source,
            [field]: '90000000-0000-4000-8000-000000001099',
          },
        },
        'current',
        known,
      ),
    ).rejects.toThrow();
  },
);
