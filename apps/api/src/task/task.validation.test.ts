import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  createInput,
  editInput,
  readTaskMeaning,
  readTaskView,
} from './task.validation.js';

const actor = {
  internalUserId: '00000000-0000-4000-8000-000000000001',
  workspaceMembershipId: '00000000-0000-4000-8000-000000000002',
  displayName: 'Task Manager',
};
const storedResult = {
  id: '00000000-0000-4000-8000-000000000003',
  companyId: '00000000-0000-4000-8000-000000000004',
  projectId: '00000000-0000-4000-8000-000000000005',
  clientAccountId: '00000000-0000-4000-8000-000000000006',
  title: 'Collect preparation notes',
  description: null,
  assignee: null,
  dueDate: null,
  priority: 'normal',
  status: 'todo',
  completion: null,
  version: 1,
  createdAt: '2026-09-24T08:00:00.000Z',
  updatedAt: '2026-09-24T08:00:00.000Z',
  createdBy: actor,
};
const storedInitial = {
  title: storedResult.title,
  description: null,
  assignee: null,
  dueDate: null,
  priority: 'normal',
};
const invalidPriorities: unknown[] = [
  'Critical',
  'critic',
  'urgent',
  null,
  1,
  '',
];

/** The same stored JSON without the given keys, as an earlier application wrote it. */
function without(value: object, keys: readonly string[]) {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !keys.includes(key)),
  );
}

describe('Task priority command validation', () => {
  it('keeps an omitted priority out of the create and edit fingerprints', () => {
    const create = createInput({ title: '  Preparation notes  ' });
    expect(create).toEqual({
      title: 'Preparation notes',
      assigneeMembershipId: null,
      dueDate: null,
    });
    // The fingerprint is the serialized input: an omitted field adds no key.
    expect(JSON.stringify(create)).toBe(
      '{"title":"Preparation notes","assigneeMembershipId":null,"dueDate":null}',
    );
    expect(JSON.stringify(editInput({ expectedVersion: 2, title: 'x' }))).toBe(
      '{"expectedVersion":2,"title":"x"}',
    );
  });

  it.each(['normal', 'important', 'critical'])(
    'accepts the submitted priority %s on create and edit',
    (priority) => {
      expect(createInput({ title: 'Notes', priority })).toEqual({
        title: 'Notes',
        assigneeMembershipId: null,
        dueDate: null,
        priority,
      });
      expect(editInput({ expectedVersion: 1, priority })).toEqual({
        expectedVersion: 1,
        priority,
      });
    },
  );

  it('distinguishes an explicit normal priority from an omitted one', () => {
    expect(JSON.stringify(createInput({ title: 'Notes' }))).not.toBe(
      JSON.stringify(createInput({ title: 'Notes', priority: 'normal' })),
    );
  });

  it.each(invalidPriorities)('rejects the priority %j', (priority) => {
    expect(() => createInput({ title: 'Notes', priority })).toThrow(
      BadRequestException,
    );
    expect(() => editInput({ expectedVersion: 1, priority })).toThrow(
      BadRequestException,
    );
  });
});

describe('stored Task results and history', () => {
  it('requires the exact current description in stored results and creation history', () => {
    const current = {
      ...storedResult,
      description: 'Ș / Я / 😀\r\n  <b>literal</b>',
    };
    expect(readTaskView(storedResult)).toEqual(storedResult);
    expect(readTaskView(current)).toEqual(current);
    const creation = {
      action: 'task.created',
      metadata: {
        version: 1,
        initial: { ...storedInitial, description: current.description },
      },
    };
    expect(readTaskMeaning(creation)).toEqual(creation);
    const correction = {
      action: 'task.updated',
      metadata: {
        version: 2,
        changes: { description: { before: current.description, after: null } },
      },
    };
    expect(readTaskMeaning(correction)).toEqual(correction);
    for (const description of [
      undefined,
      '',
      ' leading',
      'trailing\n',
      '\0',
      '\ud800',
      '\udfff',
      '😀'.repeat(2001),
      3,
      [],
      {},
    ]) {
      expect(() => readTaskView({ ...current, description })).toThrow();
      expect(() =>
        readTaskMeaning({
          ...creation,
          metadata: {
            version: 1,
            initial: { ...creation.metadata.initial, description },
          },
        }),
      ).toThrow();
    }
    for (const description of [
      { before: null },
      { after: 'x' },
      { before: null, after: null },
      { before: null, after: 'x', unknown: 1 },
      { before: ' unnormalized', after: null },
    ])
      expect(() =>
        readTaskMeaning({
          action: 'task.updated',
          metadata: { version: 2, changes: { description } },
        }),
      ).toThrow();
    expect(() =>
      readTaskMeaning({
        action: 'task.updated',
        metadata: {
          version: 2,
          changes: { narrative: { before: null, after: 'x' } },
        },
      }),
    ).toThrow();
  });

  it.each([
    ['description', ['description']],
    ['priority', ['priority']],
    ['priority and description', ['priority', 'description']],
  ])(
    'refuses a stored result and a creation recorded without %s',
    (_name, keys) => {
      expect(() => readTaskView(without(storedResult, keys))).toThrow();
      expect(() =>
        readTaskMeaning({
          action: 'task.created',
          metadata: { version: 1, initial: without(storedInitial, keys) },
        }),
      ).toThrow();
    },
  );

  it('reads a stored result with its recorded priority', () => {
    expect(readTaskView({ ...storedResult, priority: 'critical' })).toEqual({
      ...storedResult,
      priority: 'critical',
    });
  });

  it('reads stored blocked and cancelled results with their Unicode reasons and refuses them without priority', () => {
    const declaration = {
      reason: 'Attente du questionnaire signé — Clientă 🙂',
      actor,
      occurredAt: '2026-09-24T09:00:00.000Z',
    };
    const blocked = {
      ...storedResult,
      status: 'blocked',
      version: 2,
      blockage: declaration,
    };
    const cancelled = {
      ...storedResult,
      status: 'cancelled',
      version: 2,
      cancellation: declaration,
    };
    expect(readTaskView(blocked)).toEqual(blocked);
    expect(readTaskView(cancelled)).toEqual(cancelled);
    expect(() => readTaskView(without(blocked, ['priority']))).toThrow();
    expect(() => readTaskView(without(cancelled, ['priority']))).toThrow();
  });

  it.each(invalidPriorities)(
    'fails closed for the stored result priority %j',
    (priority) => {
      expect(() => readTaskView({ ...storedResult, priority })).toThrow();
    },
  );

  it('reads a creation with its recorded priority', () => {
    const creation = {
      action: 'task.created',
      metadata: {
        version: 1,
        initial: { ...storedInitial, priority: 'critical' },
      },
    };
    expect(readTaskMeaning(creation)).toEqual(creation);
  });

  it('reads a priority correction with the other corrected fields', () => {
    const changes = {
      title: { before: 'Old notes', after: 'New notes' },
      priority: { before: 'normal', after: 'important' },
    };
    expect(
      readTaskMeaning({
        action: 'task.updated',
        metadata: { version: 2, changes },
      }),
    ).toEqual({ action: 'task.updated', metadata: { version: 2, changes } });
  });

  it.each(invalidPriorities)(
    'rejects the stored history priority %j',
    (priority) => {
      expect(() =>
        readTaskMeaning({
          action: 'task.created',
          metadata: {
            version: 1,
            initial: { ...storedInitial, priority },
          },
        }),
      ).toThrow();
      for (const change of [
        { before: 'normal', after: priority },
        { before: priority, after: 'normal' },
        { after: 'normal' },
      ])
        expect(() =>
          readTaskMeaning({
            action: 'task.updated',
            metadata: { version: 2, changes: { priority: change } },
          }),
        ).toThrow();
    },
  );
});
