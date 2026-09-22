import { BadRequestException } from '@nestjs/common';
import { requireUuid } from '../access/access-command-validation.js';
import type {
  CreateCommercialIntakeCommand,
  UpdateOpportunityNextActionCommand,
} from './commercial-intake.types.js';

const ROOT_FIELDS = new Set([
  'originalText',
  'sourceLabel',
  'reportedReceivedAt',
  'subject',
  'clientAccountId',
  'opportunity',
]);
const OPPORTUNITY_FIELDS = new Set(['title', 'scope', 'nextAction']);
const NEXT_ACTION_UPDATE_FIELDS = new Set(['expectedVersion', 'nextAction']);
// PostgreSQL integer versions may reach 2_147_483_647, but an update must
// leave room for the command to persist the incremented result.
const MAX_INCREMENTABLE_OPPORTUNITY_VERSION = 2_147_483_646;

export function readUpdateOpportunityNextActionCommand(
  value: unknown,
): UpdateOpportunityNextActionCommand {
  const body = record(value, 'update');
  rejectExtraFields(body, NEXT_ACTION_UPDATE_FIELDS, 'update');
  const expectedVersion = body.expectedVersion;
  if (
    typeof expectedVersion !== 'number' ||
    !Number.isInteger(expectedVersion) ||
    expectedVersion < 1 ||
    expectedVersion > MAX_INCREMENTABLE_OPPORTUNITY_VERSION
  )
    invalid('expectedVersion', 'Reload the Request before editing.');
  return {
    expectedVersion,
    // The next action follows the intake rule exactly: no trimming or
    // normalization of the submitted text.
    nextAction: requiredString(body.nextAction, 'nextAction', 500),
  };
}

export function readCreateCommercialIntakeCommand(
  value: unknown,
): CreateCommercialIntakeCommand {
  const body = record(value, 'request');
  rejectExtraFields(body, ROOT_FIELDS, 'request');
  const opportunity = record(body.opportunity, 'opportunity');
  rejectExtraFields(opportunity, OPPORTUNITY_FIELDS, 'opportunity');
  const reportedReceivedAtInput = optionalString(
    body.reportedReceivedAt,
    'reportedReceivedAt',
    Number.POSITIVE_INFINITY,
  );
  if (
    reportedReceivedAtInput &&
    !isValidZonedTimestamp(reportedReceivedAtInput)
  )
    invalid('reportedReceivedAt', 'Enter a valid received time.');
  const reportedReceivedAt = reportedReceivedAtInput
    ? new Date(reportedReceivedAtInput)
    : null;

  return {
    originalText: requiredString(body.originalText, 'originalText', 20_000),
    sourceLabel: optionalString(body.sourceLabel, 'sourceLabel', 120),
    reportedReceivedAt,
    reportedReceivedAtInput,
    subject: optionalString(body.subject, 'subject', 200),
    clientAccountId:
      body.clientAccountId === undefined
        ? null
        : requireUuid(body.clientAccountId),
    opportunity: {
      title: requiredString(opportunity.title, 'opportunity.title', 160),
      scope: optionalString(opportunity.scope, 'opportunity.scope', 2_000),
      nextAction: requiredString(
        opportunity.nextAction,
        'opportunity.nextAction',
        500,
      ),
    },
  };
}

function isValidZonedTimestamp(value: string): boolean {
  const match =
    /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u.exec(
      value,
    );
  const calendarDate = match?.[1];
  if (!calendarDate || calendarDate.startsWith('0000-')) return false;
  const parsedCalendarDate = new Date(`${calendarDate}T00:00:00.000Z`);
  if (
    Number.isNaN(parsedCalendarDate.getTime()) ||
    parsedCalendarDate.toISOString().slice(0, 10) !== calendarDate
  )
    return false;
  return !Number.isNaN(new Date(value).getTime());
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    invalid(field, 'Enter a valid object.');
  return Object.fromEntries(Object.entries(value));
}

function rejectExtraFields(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  field: string,
): void {
  if (Object.keys(value).some((key) => !allowed.has(key)))
    invalid(field, 'Remove unsupported fields.');
}

function requiredString(
  value: unknown,
  field: string,
  maximum: number,
): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.length > maximum
  )
    invalid(field, `Enter between 1 and ${maximum} characters.`);
  return value;
}

function optionalString(
  value: unknown,
  field: string,
  maximum: number,
): string | null {
  if (value === undefined) return null;
  if (typeof value !== 'string' || value.length > maximum)
    invalid(field, `Enter at most ${maximum} characters.`);
  return value;
}

function invalid(field: string, message: string): never {
  throw new BadRequestException({
    code: 'VALIDATION_ERROR',
    field,
    message,
  });
}
