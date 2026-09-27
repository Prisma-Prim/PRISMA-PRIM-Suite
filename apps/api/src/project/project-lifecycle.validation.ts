import { BadRequestException } from '@nestjs/common';
import { requireUuid } from '../access/access-command-validation.js';
import {
  COMMANDED_PROJECT_LIFECYCLE_ACTIONS,
  START_DECLARATION_ITEMS,
  type CommandedProjectLifecycleAction,
  type ProjectLifecycleCommand,
  type StartDeclaration,
  type StartDeclarationValue,
  type StartExceptionCommand,
} from './project-lifecycle.types.js';

const MAX_REVISION = 2147483647;

/**
 * The HTTP body is the boundary: exactly one commanded action with its
 * observed lifecycle revision and the fields its transition requires.
 */
export function lifecycleCommand(value: unknown): ProjectLifecycleCommand {
  const body = record(value, 'A Project lifecycle transition is required.');
  const action = commandedAction(body.action);
  const expectedLifecycleRevision = revision(body.expectedLifecycleRevision);
  switch (action) {
    case 'activate': {
      keys(body, ['action', 'expectedLifecycleRevision', 'declaration'], {
        optional: ['startException'],
      });
      const declaration = startDeclaration(body.declaration);
      const anyMissing = START_DECLARATION_ITEMS.some(
        (item) => declaration[item] === 'missing',
      );
      if (anyMissing !== 'startException' in body)
        throw new BadRequestException(
          anyMissing
            ? 'A start exception is required when an item is missing.'
            : 'A start exception is recorded only when an item is missing.',
        );
      return {
        action,
        expectedLifecycleRevision,
        declaration,
        startException: anyMissing ? startException(body.startException) : null,
      };
    }
    case 'hold':
      keys(body, ['action', 'expectedLifecycleRevision', 'reason']);
      return { action, expectedLifecycleRevision, reason: reason(body.reason) };
    case 'resume':
      keys(body, ['action', 'expectedLifecycleRevision']);
      return { action, expectedLifecycleRevision };
    case 'complete':
      keys(body, ['action', 'expectedLifecycleRevision', 'note']);
      return {
        action,
        expectedLifecycleRevision,
        note: lifecycleText(body.note, 'completion note'),
      };
    case 'cancel':
      keys(body, ['action', 'expectedLifecycleRevision', 'reason']);
      return { action, expectedLifecycleRevision, reason: reason(body.reason) };
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

/** Trimmed text of 1–500 Unicode code points, as PostgreSQL length() counts. */
export function lifecycleText(value: unknown, label = 'reason'): string {
  const result = typeof value === 'string' ? value.trim() : '';
  const characters = Array.from(result).length;
  if (characters < 1 || characters > 500)
    throw new BadRequestException(`A ${label} must contain 1–500 characters.`);
  return result;
}

/** An exact YYYY-MM-DD calendar date, years 0001–9999, as Tasks use. */
export function exactCalendarDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value))
    throw invalidDate();
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days =
    month === 2 ? (leap ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31;
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days)
    throw invalidDate();
  return value;
}

function commandedAction(value: unknown): CommandedProjectLifecycleAction {
  const action = COMMANDED_PROJECT_LIFECYCLE_ACTIONS.find(
    (candidate) => candidate === value,
  );
  if (!action)
    throw new BadRequestException(
      'Choose a supported Project lifecycle transition.',
    );
  return action;
}

function revision(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > MAX_REVISION
  )
    throw new BadRequestException(
      'A valid observed lifecycle revision is required.',
    );
  return value;
}

function reason(value: unknown): string {
  return lifecycleText(value);
}

function startDeclaration(value: unknown): StartDeclaration {
  const body = record(value, 'A start declaration is required.');
  keys(body, START_DECLARATION_ITEMS);
  return {
    approvedOffer: declared(body.approvedOffer),
    contractOrPrecontract: declared(body.contractOrPrecontract),
    projectPlan: declared(body.projectPlan),
    initialDocuments: declared(body.initialDocuments),
    deadlines: declared(body.deadlines),
    financialConditions: declared(body.financialConditions),
    risks: declared(body.risks),
  };
}

function declared(value: unknown): StartDeclarationValue {
  if (value !== 'present' && value !== 'missing')
    throw new BadRequestException(
      'Declare each start-dossier item present or missing.',
    );
  return value;
}

function startException(value: unknown): StartExceptionCommand {
  const body = record(value, 'A start exception is required.');
  keys(body, ['reason', 'completionMembershipId', 'completionDueDate']);
  return {
    reason: reason(body.reason),
    completionMembershipId: requireUuid(body.completionMembershipId),
    completionDueDate: exactCalendarDate(body.completionDueDate),
  };
}

function record(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new BadRequestException(message);
  return Object.fromEntries(Object.entries(value));
}

/** Exactly the required keys, plus any listed optional key. */
function keys(
  body: Record<string, unknown>,
  required: readonly string[],
  { optional = [] }: { optional?: readonly string[] } = {},
): void {
  const present = Object.keys(body);
  if (
    required.some((key) => !present.includes(key)) ||
    present.some((key) => !required.includes(key) && !optional.includes(key))
  )
    throw new BadRequestException(
      'The Project lifecycle transition has missing or unsupported fields.',
    );
}

function invalidDate(): BadRequestException {
  return new BadRequestException(
    'Use a valid calendar date in YYYY-MM-DD form.',
  );
}
