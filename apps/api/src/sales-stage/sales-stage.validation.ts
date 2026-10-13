import { BadRequestException } from '@nestjs/common';
import {
  isSalesStageLabel,
  SALES_STAGE_LABEL_MAXIMUM_LENGTH,
} from './sales-stage.definition.js';
import type { CreateSalesStageCommand } from './sales-stage.types.js';

const CREATE_FIELDS = new Set(['expectedRevision', 'label']);
// Configuration revisions are PostgreSQL integers; the maximum stays a valid
// observation even though no operation can follow it.
const MAXIMUM_REVISION = 2_147_483_647;

/**
 * Exactly an observed configuration revision and a label of 1–80 characters
 * with at least one non-whitespace character, kept exactly as submitted.
 */
export function readCreateSalesStageCommand(
  value: unknown,
): CreateSalesStageCommand {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    invalid('stage', 'Enter a valid object.');
  const body = Object.fromEntries(Object.entries(value));
  if (Object.keys(body).some((key) => !CREATE_FIELDS.has(key)))
    invalid('stage', 'Remove unsupported fields.');
  const { expectedRevision, label } = body;
  if (
    typeof expectedRevision !== 'number' ||
    !Number.isInteger(expectedRevision) ||
    expectedRevision < 0 ||
    expectedRevision > MAXIMUM_REVISION
  )
    invalid('expectedRevision', 'Reload the Sales Stages before retrying.');
  if (typeof label !== 'string' || !isSalesStageLabel(label))
    invalid(
      'label',
      `Enter between 1 and ${SALES_STAGE_LABEL_MAXIMUM_LENGTH} characters.`,
    );
  return { expectedRevision, label };
}

function invalid(field: string, message: string): never {
  throw new BadRequestException({ code: 'VALIDATION_ERROR', field, message });
}
