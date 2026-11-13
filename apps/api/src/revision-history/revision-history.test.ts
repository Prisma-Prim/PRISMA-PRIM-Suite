import { describe, expect, it } from 'vitest';
import {
  REVISION_PAGE_SIZE,
  RevisionHistoryIntegrityError,
  verifyCommittedRevision,
  verifyRevisionPage,
  type StoredRevision,
} from './revision-history.js';

interface TestFact {
  readonly targetId: string;
  readonly revision: number;
  readonly commandId: string;
  readonly action: string;
  readonly actor: {
    readonly membershipId: string;
    readonly displayName: string;
  };
  readonly recordedAt: string;
  readonly before: { readonly value: number } | null;
  readonly after: { readonly value: number };
}

const TARGET = 'target-1';

function fact(revision: number, changes: Partial<TestFact> = {}): TestFact {
  return {
    targetId: TARGET,
    revision,
    commandId: `command-${revision}`,
    action: revision === 1 ? 'CREATE' : 'CORRECT',
    actor: { membershipId: 'member-1', displayName: 'Fictional Member' },
    recordedAt: '2026-01-15T10:00:00.000Z',
    before: revision === 1 ? null : { value: revision - 1 },
    after: { value: revision },
    ...changes,
  };
}

/** Rows newest first, each row coupled to its fact unless overridden. */
function rows(
  facts: readonly TestFact[],
  row: (fact: TestFact) => Partial<StoredRevision> = () => ({}),
): StoredRevision[] {
  return facts.map((value) => ({
    revision: value.revision,
    commandId: value.commandId,
    fact: value,
    ...row(value),
  }));
}

function verify(
  stored: readonly StoredRevision[],
  before: number | undefined = undefined,
) {
  return verifyRevisionPage({
    subject: 'Test',
    targetId: TARGET,
    rows: stored,
    before,
    // The rows carry the fixture facts themselves: decoding finds that exact fact.
    decode: (value) => {
      const decoded = stored
        .map((row) => row.fact)
        .filter((candidate): candidate is TestFact => candidate === value)[0];
      if (!decoded) throw new Error('Unknown test fact.');
      return decoded;
    },
    targetOf: (value) => value.targetId,
  });
}

function descending(from: number, to: number) {
  const facts: TestFact[] = [];
  for (let revision = from; revision >= to; revision--)
    facts.push(fact(revision));
  return facts;
}

describe('verifyRevisionPage', () => {
  it('returns a complete first page that reaches revision 1', () => {
    const facts = descending(3, 1);
    expect(verify(rows(facts))).toEqual({ items: facts, hasMore: false });
  });

  it('returns a full page and announces the look-ahead row as more', () => {
    const facts = descending(30, 30 - REVISION_PAGE_SIZE);
    expect(verify(rows(facts))).toEqual({
      items: facts.slice(0, REVISION_PAGE_SIZE),
      hasMore: true,
    });
  });

  it('returns a final continuation that starts right below its cursor', () => {
    const facts = descending(4, 1);
    expect(verify(rows(facts), 5)).toEqual({ items: facts, hasMore: false });
  });

  it('returns an empty page for a target without stored revisions', () => {
    expect(verify([])).toEqual({ items: [], hasMore: false });
  });

  it.each([
    ['another target', rows([fact(1, { targetId: 'target-2' })])],
    ['another row revision', rows([fact(1)], () => ({ revision: 2 }))],
    ['another row command', rows([fact(1)], () => ({ commandId: 'other' }))],
  ])('refuses a fact coupled to %s', (_case, stored) => {
    expect(() => verify(stored)).toThrow(RevisionHistoryIntegrityError);
  });

  it('refuses a revision gap inside the page', () => {
    expect(() => verify(rows([fact(3), fact(1)]))).toThrow(
      /adjacent revisions do not chain/u,
    );
  });

  it('refuses a revision whose before state is not its predecessor after state', () => {
    expect(() =>
      verify(rows([fact(2, { before: { value: 9 } }), fact(1)])),
    ).toThrow(/adjacent revisions do not chain/u);
  });

  it('refuses a final page that stops above revision 1', () => {
    expect(() => verify(rows(descending(3, 2)))).toThrow(
      /does not reach revision 1/u,
    );
  });

  it('refuses a revision 1 that claims a before state', () => {
    expect(() => verify(rows([fact(1, { before: { value: 0 } })]))).toThrow(
      /does not reach revision 1/u,
    );
  });

  it('refuses a continuation that skips revisions below its cursor', () => {
    expect(() => verify(rows(descending(3, 1)), 5)).toThrow(
      /continuation does not start below its cursor/u,
    );
  });

  it('refuses an empty continuation', () => {
    expect(() => verify([], 5)).toThrow(
      /continuation does not start below its cursor/u,
    );
  });

  it('refuses more rows than one page and its look-ahead', () => {
    expect(() =>
      verify(rows(descending(40, 40 - REVISION_PAGE_SIZE - 1))),
    ).toThrow(/exceeds its look-ahead bound/u);
  });
});

describe('verifyCommittedRevision', () => {
  const command = {
    id: 'command-2',
    targetId: TARGET,
    revision: 2,
    actorMembershipId: 'member-1',
    actorDisplayName: 'Fictional Member',
    createdAt: new Date('2026-01-15T10:00:00.000Z'),
  };
  const receipt = {
    commandId: 'command-2',
    targetId: TARGET,
    revision: 2,
    action: 'CORRECT',
    recordedAt: '2026-01-15T10:00:00.000Z',
  };

  it('accepts a receipt and fact coupled to their command', () => {
    expect(() =>
      verifyCommittedRevision({
        subject: 'Test',
        command,
        receipt,
        fact: fact(2),
      }),
    ).not.toThrow();
  });

  it.each([
    ['another actor membership', { actorMembershipId: 'member-2' }, {}, {}],
    ['another actor label', { actorDisplayName: 'Forged label' }, {}, {}],
    ['another command time', { createdAt: new Date(0) }, {}, {}],
    ['another receipt target', {}, { targetId: 'target-2' }, {}],
    ['another receipt action', {}, { action: 'CREATE' }, {}],
    ['another fact target', {}, {}, { targetId: 'target-2' }],
    ['another fact revision', {}, {}, { revision: 3 }],
    ['another fact command', {}, {}, { commandId: 'command-9' }],
    ['another fact time', {}, {}, { recordedAt: '2026-01-15T10:00:01.000Z' }],
  ])(
    'refuses %s',
    (_case, commandChanges, receiptChanges, factChanges: Partial<TestFact>) => {
      expect(() =>
        verifyCommittedRevision({
          subject: 'Test',
          command: { ...command, ...commandChanges },
          receipt: { ...receipt, ...receiptChanges },
          fact: fact(2, factChanges),
        }),
      ).toThrow(RevisionHistoryIntegrityError);
    },
  );
});
