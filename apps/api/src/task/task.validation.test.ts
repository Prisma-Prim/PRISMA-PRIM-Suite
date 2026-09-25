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
  assignee: null,
  dueDate: null,
  status: 'todo',
  completion: null,
  version: 1,
  createdAt: '2026-09-24T08:00:00.000Z',
  updatedAt: '2026-09-24T08:00:00.000Z',
  createdBy: actor,
};
const invalidPriorities: unknown[] = [
  'Critical',
  'critic',
  'urgent',
  null,
  1,
  '',
];

describe('Task priority command validation', () => {
  it('keeps an omitted priority out of the create and edit fingerprints', () => {
    const create = createInput({ title: '  Legacy notes  ' });
    expect(create).toEqual({
      title: 'Legacy notes',
      assigneeMembershipId: null,
      dueDate: null,
    });
    // A pre-priority receipt fingerprint is the serialized input; it must stay byte-identical.
    expect(JSON.stringify(create)).toBe(
      '{"title":"Legacy notes","assigneeMembershipId":null,"dueDate":null}',
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
  it('returns a pre-priority receipt result as normal and keeps a recorded priority', () => {
    expect(readTaskView(storedResult)).toEqual({
      ...storedResult,
      priority: 'normal',
    });
    expect(readTaskView({ ...storedResult, priority: 'critical' })).toEqual({
      ...storedResult,
      priority: 'critical',
    });
  });

  it('returns pre-priority blocked and cancelled results as normal with their Unicode reasons', () => {
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
    expect(readTaskView(blocked)).toEqual({ ...blocked, priority: 'normal' });
    expect(readTaskView(cancelled)).toEqual({
      ...cancelled,
      priority: 'normal',
    });
  });

  it.each(invalidPriorities)(
    'fails closed for the stored result priority %j',
    (priority) => {
      expect(() => readTaskView({ ...storedResult, priority })).toThrow();
    },
  );

  it('keeps a historical creation without priority absent instead of normal', () => {
    const initial = {
      title: 'Collect preparation notes',
      assignee: null,
      dueDate: null,
    };
    const meaning = readTaskMeaning({
      action: 'task.created',
      metadata: { version: 1, initial },
    });
    expect(meaning).toEqual({
      action: 'task.created',
      metadata: { version: 1, initial },
    });
    if (meaning.action !== 'task.created')
      throw new Error('Expected a creation.');
    expect(Object.keys(meaning.metadata.initial)).not.toContain('priority');
    expect(
      readTaskMeaning({
        action: 'task.created',
        metadata: { version: 1, initial: { ...initial, priority: 'critical' } },
      }),
    ).toEqual({
      action: 'task.created',
      metadata: { version: 1, initial: { ...initial, priority: 'critical' } },
    });
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
            initial: {
              title: 'Notes',
              assignee: null,
              dueDate: null,
              priority,
            },
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
