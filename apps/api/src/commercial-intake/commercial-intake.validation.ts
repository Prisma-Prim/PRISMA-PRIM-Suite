import { BadRequestException } from '@nestjs/common';
import { requireUuid } from '../access/access-command-validation.js';
import type { CreateCommercialIntakeCommand } from './commercial-intake.types.js';

const ROOT_FIELDS = new Set([
  'originalText',
  'sourceLabel',
  'reportedReceivedAt',
  'subject',
  'clientAccountId',
  'opportunity',
]);
const OPPORTUNITY_FIELDS = new Set(['title', 'scope', 'nextAction']);

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
  const reportedReceivedAt = reportedReceivedAtInput
    ? new Date(reportedReceivedAtInput)
    : null;
  if (
    reportedReceivedAt &&
    (!/(?:Z|[+-]\d{2}:\d{2})$/u.test(reportedReceivedAtInput ?? '') ||
      Number.isNaN(reportedReceivedAt.getTime()))
  )
    invalid('reportedReceivedAt', 'Enter a valid received time.');

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
