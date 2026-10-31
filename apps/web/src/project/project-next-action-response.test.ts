import { expect, it } from 'vitest';
import { assertMessageCoverage } from '../localization/messages';
import { projectNextActionMessages } from './project-next-action.copy';
import {
  normalizeNextActionText,
  readNextAction,
  readNextActionReceipt,
} from './project-next-action-response';
import { canCoordinateNextAction } from './ProjectNextAction';
import { completeActor } from '../access/current-actor.test-fixture';

const scope = {
  workspaceId: '10000000-0000-4000-8000-000000000001',
  companyId: '20000000-0000-4000-8000-000000000001',
  projectId: '30000000-0000-4000-8000-000000000001',
  originalClientAccountId: '40000000-0000-4000-8000-000000000001',
};
const attribution = {
  internalUserId: '50000000-0000-4000-8000-000000000001',
  workspaceMembershipId: '60000000-0000-4000-8000-000000000001',
  displayName: 'Literal DEMO Ж',
  occurredAt: '2026-10-30T13:00:00.001Z',
};
const empty = {
  format: 'project-next-action-v1',
  ...scope,
  revision: 0,
  text: null,
  lastChange: null,
};
const current = {
  ...empty,
  revision: 1,
  text: 'Exact first action\r\n🌍',
  lastChange: attribution,
};
const history = {
  entries: [
    {
      revision: 1,
      predecessorRevision: 0,
      before: null,
      after: current.text,
      attribution,
    },
  ],
  hasMore: false,
  nextBeforeRevision: null,
};
it('keeps unrecorded, cleared, historical empty pages and unsupported formats distinct', () => {
  expect(
    readNextAction(
      {
        current: empty,
        history: { entries: [], hasMore: false, nextBeforeRevision: null },
      },
      scope,
    )?.current,
  ).toEqual(empty);
  expect(readNextAction({ current, history }, scope)).toEqual({
    current,
    history,
  });
  expect(
    readNextAction(
      {
        current,
        history: { entries: [], hasMore: false, nextBeforeRevision: null },
      },
      scope,
      1,
    )?.current,
  ).toEqual(current);
  expect(
    readNextAction(
      { current: { ...empty, format: 'future-next-action' }, history },
      scope,
    ),
  ).toBeUndefined();
  const cleared = { ...current, revision: 2, text: null };
  expect(
    readNextAction(
      {
        current: cleared,
        history: {
          ...history,
          entries: [
            {
              revision: 2,
              predecessorRevision: 1,
              before: current.text,
              after: null,
              attribution,
            },
            ...history.entries,
          ],
        },
      },
      scope,
    )?.current,
  ).toEqual(cleared);
});
it.each([
  { current: { ...current, format: undefined }, history },
  {
    current: { ...current, originalClientAccountId: scope.companyId },
    history,
  },
  {
    current: { ...empty, text: 'Invented at revision zero' },
    history: { entries: [], hasMore: false, nextBeforeRevision: null },
  },
  { current: { ...current, text: '  silently trimmed  ' }, history },
  {
    current: {
      ...current,
      lastChange: { ...attribution, occurredAt: '2026-02-31T13:00:00.001Z' },
    },
    history,
  },
  { current, history: { ...history, entries: [] } },
  { current, history: { ...history, hasMore: true, nextBeforeRevision: 1 } },
  {
    current,
    history: {
      ...history,
      entries: [{ ...history.entries[0], predecessorRevision: 1 }],
    },
  },
  {
    current,
    history: {
      ...history,
      entries: [{ ...history.entries[0], after: 'Forged current' }],
    },
  },
])('refuses malformed native facts instead of repairing them', (value) => {
  expect(() => readNextAction(value, scope)).toThrow();
});
it('confirms only the exact intent revision/text and preserves an unsupported receipt as uncertain', () => {
  const intent = {
      expectedRevision: 0,
      expectedLifecycleRevision: 0,
      text: current.text,
    },
    receipt = {
      format: 'project-next-action-command-v1',
      outcome: 'changed',
      record: current,
    };
  expect(readNextActionReceipt(receipt, scope, intent)).toEqual(receipt);
  expect(() =>
    readNextActionReceipt(
      { ...receipt, record: { ...current, text: 'Another intent' } },
      scope,
      intent,
    ),
  ).toThrow();
  expect(() =>
    readNextActionReceipt(
      { ...receipt, record: { ...current, revision: 2 } },
      scope,
      intent,
    ),
  ).toThrow();
  expect(
    readNextActionReceipt(
      { ...receipt, format: 'future-receipt' },
      scope,
      intent,
    ),
  ).toBeUndefined();
});
it('refuses missing selected revisions instead of presenting a gap as an empty or complete older page', () => {
  expect(() =>
    readNextAction(
      {
        current,
        history: { entries: [], hasMore: false, nextBeforeRevision: null },
      },
      scope,
      2,
    ),
  ).toThrow();
  const later = { ...current, revision: 2, text: 'Later action' };
  expect(() => readNextAction({ current: later, history }, scope, 3)).toThrow();
  expect(
    readNextAction(
      {
        current,
        history: { entries: [], hasMore: false, nextBeforeRevision: null },
      },
      scope,
      1,
    )?.current,
  ).toEqual(current);
});
it('normalizes only exterior whitespace and counts Unicode scalars', () => {
  expect(normalizeNextActionText(' \u00a0Ж\r\n e\u0301\r🌍\ufeff ')).toBe(
    'Ж\r\n e\u0301\r🌍',
  );
  expect(normalizeNextActionText('🌍'.repeat(500))).toHaveLength(1000);
  for (const value of ['🌍'.repeat(501), 'bad\0text', 'lone\ud800'])
    expect(() => normalizeNextActionText(value)).toThrow();
});
it.each([
  null,
  'future',
  [],
  ['project.next_action.update', 'future.permission'],
])(
  'fails closed on an unknown write capture while preserving its opaque representation',
  (capture) => {
    expect(
      canCoordinateNextAction({
        ...completeActor,
        activeCompany: {
          ...completeActor.activeCompany,
          projectNextActionPermissions: capture,
        },
      }),
    ).toBe(false);
  },
);
it('covers every owned message in all four interface languages', () => {
  assertMessageCoverage('project-next-action', projectNextActionMessages);
});
