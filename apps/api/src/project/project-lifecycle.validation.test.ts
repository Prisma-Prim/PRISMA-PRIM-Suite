import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  exactCalendarDate,
  lifecycleCommand,
} from './project-lifecycle.validation.js';

const member = '0B6A1F4E-5C3D-4E2F-8A1B-9C8D7E6F5A4B';
const present = {
  approvedOffer: 'present',
  contractOrPrecontract: 'present',
  projectPlan: 'present',
  initialDocuments: 'present',
  deadlines: 'present',
  financialConditions: 'present',
  risks: 'present',
} as const;
const missingOffer = { ...present, approvedOffer: 'missing' } as const;
const exception = {
  reason: '  Work starts on the preliminary agreement.  ',
  completionMembershipId: member,
  completionDueDate: '2026-10-15',
};

describe('Project lifecycle command', () => {
  it('accepts an all-present activation without a start exception', () => {
    expect(
      lifecycleCommand({
        action: 'activate',
        expectedLifecycleRevision: 0,
        declaration: present,
      }),
    ).toEqual({
      action: 'activate',
      expectedLifecycleRevision: 0,
      declaration: present,
      startException: null,
    });
  });

  it('requires and normalizes the start exception when an item is missing', () => {
    expect(
      lifecycleCommand({
        action: 'activate',
        expectedLifecycleRevision: 0,
        declaration: missingOffer,
        startException: exception,
      }),
    ).toEqual({
      action: 'activate',
      expectedLifecycleRevision: 0,
      declaration: missingOffer,
      startException: {
        reason: 'Work starts on the preliminary agreement.',
        completionMembershipId: member.toLowerCase(),
        completionDueDate: '2026-10-15',
      },
    });
  });

  it('accepts a hold with a trimmed reason and a resume', () => {
    expect(
      lifecycleCommand({
        action: 'hold',
        expectedLifecycleRevision: 1,
        reason: ` ${'ș'.repeat(500)} `,
      }),
    ).toEqual({
      action: 'hold',
      expectedLifecycleRevision: 1,
      reason: 'ș'.repeat(500),
    });
    expect(
      lifecycleCommand({ action: 'resume', expectedLifecycleRevision: 2 }),
    ).toEqual({ action: 'resume', expectedLifecycleRevision: 2 });
    expect(
      lifecycleCommand({
        action: 'complete',
        expectedLifecycleRevision: 3,
        note: '  Final report delivered.  ',
      }),
    ).toEqual({
      action: 'complete',
      expectedLifecycleRevision: 3,
      note: 'Final report delivered.',
    });
    expect(
      lifecycleCommand({
        action: 'cancel',
        expectedLifecycleRevision: 3,
        reason: '  Client withdrew the request.  ',
      }),
    ).toEqual({
      action: 'cancel',
      expectedLifecycleRevision: 3,
      reason: 'Client withdrew the request.',
    });
  });

  it.each([
    undefined,
    null,
    [],
    'activate',
    {},
    { action: 'resume' },
    { expectedLifecycleRevision: 0 },
    { action: 'complete', expectedLifecycleRevision: 1 },
    { action: 'complete', expectedLifecycleRevision: 1, note: '   ' },
    { action: 'complete', expectedLifecycleRevision: 1, note: 'x'.repeat(501) },
    { action: 'complete', expectedLifecycleRevision: 1, reason: 'Done' },
    { action: 'cancel', expectedLifecycleRevision: 1 },
    { action: 'cancel', expectedLifecycleRevision: 1, reason: '   ' },
    { action: 'cancel', expectedLifecycleRevision: 1, note: 'Stopped' },
    { action: 'archive', expectedLifecycleRevision: 1 },
    { action: 'resume', expectedLifecycleRevision: -1 },
    { action: 'resume', expectedLifecycleRevision: 1.5 },
    { action: 'resume', expectedLifecycleRevision: '1' },
    { action: 'resume', expectedLifecycleRevision: 2147483648 },
    { action: 'resume', expectedLifecycleRevision: 1, reason: 'Back' },
    { action: 'hold', expectedLifecycleRevision: 1 },
    { action: 'hold', expectedLifecycleRevision: 1, reason: '   ' },
    { action: 'hold', expectedLifecycleRevision: 1, reason: 'x'.repeat(501) },
    { action: 'hold', expectedLifecycleRevision: 1, reason: 7 },
    {
      action: 'hold',
      expectedLifecycleRevision: 1,
      reason: 'Pause',
      note: 'x',
    },
    { action: 'activate', expectedLifecycleRevision: 0 },
    {
      action: 'activate',
      expectedLifecycleRevision: 0,
      declaration: present,
      startException: exception,
    },
    {
      action: 'activate',
      expectedLifecycleRevision: 0,
      declaration: missingOffer,
    },
    {
      action: 'activate',
      expectedLifecycleRevision: 0,
      declaration: { ...present, risks: undefined },
    },
    {
      action: 'activate',
      expectedLifecycleRevision: 0,
      declaration: { ...present, risks: 'not_applicable' },
    },
    {
      action: 'activate',
      expectedLifecycleRevision: 0,
      declaration: { ...present, responsible: 'present' },
    },
    {
      action: 'activate',
      expectedLifecycleRevision: 0,
      declaration: missingOffer,
      startException: { ...exception, completionMembershipId: 'ana' },
    },
    {
      action: 'activate',
      expectedLifecycleRevision: 0,
      declaration: missingOffer,
      startException: { ...exception, completionDueDate: '2026-02-30' },
    },
    {
      action: 'activate',
      expectedLifecycleRevision: 0,
      declaration: missingOffer,
      startException: { ...exception, reason: '' },
    },
    {
      action: 'activate',
      expectedLifecycleRevision: 0,
      declaration: missingOffer,
      startException: { ...exception, displayLabel: 'Ana' },
    },
    {
      action: 'activate',
      expectedLifecycleRevision: 0,
      declaration: missingOffer,
      startException: null,
    },
  ])('rejects a malformed command: %j', (body) => {
    expect(() => lifecycleCommand(body)).toThrow(BadRequestException);
  });
});

describe('Start exception completion date', () => {
  it.each(['0001-01-01', '2024-02-29', '2020-01-31', '9999-12-31'])(
    'accepts the exact date %s, including past dates',
    (value) => {
      expect(exactCalendarDate(value)).toBe(value);
    },
  );

  it.each([
    '0000-12-31',
    '2023-02-29',
    '2026-04-31',
    '2026-13-01',
    '2026-1-01',
    '2026-10-15T00:00:00Z',
    '',
    20261015,
    null,
  ])('rejects %j', (value) => {
    expect(() => exactCalendarDate(value)).toThrow(BadRequestException);
  });
});
