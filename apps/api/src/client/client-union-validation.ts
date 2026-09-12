import { BadRequestException } from '@nestjs/common';
import {
  CLIENT_UNION_SELECTABLE_FIELDS,
  type ClientUnionContactConsolidation,
  type ClientUnionContactSource,
  type ClientUnionSelectableField,
} from './client-union.types.js';

const MAXIMUM_REASON_LENGTH = 2_000;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface NormalizedUnionCommand {
  comparisonReference: string;
  canonicalClientAccountId: string;
  fieldSelections: ReadonlyMap<ClientUnionSelectableField, string>;
  contactConsolidations: readonly ClientUnionContactConsolidation[];
  reason: string;
  confirmedCompanyIds: readonly string[];
  idempotencyKey: string;
}

export function normalizeUnionCommand(input: {
  comparisonReference: unknown;
  canonicalClientAccountId: unknown;
  fieldSelections: unknown;
  contactConsolidations: unknown;
  reason: unknown;
  confirmedCompanyIds: unknown;
  idempotencyKey: string | undefined;
}): NormalizedUnionCommand {
  return {
    comparisonReference: requireUuid(
      input.comparisonReference,
      'comparison reference',
    ),
    canonicalClientAccountId: requireUuid(
      input.canonicalClientAccountId,
      'canonical Client Account identifier',
    ),
    fieldSelections: requireFieldSelections(input.fieldSelections),
    contactConsolidations: requireContactConsolidations(
      input.contactConsolidations,
    ),
    reason: requireReason(input.reason),
    confirmedCompanyIds: requireDistinctUuids(
      input.confirmedCompanyIds,
      'confirmed Company identifiers',
    ),
    idempotencyKey: requireIdempotencyKey(input.idempotencyKey),
  };
}

export function requireReason(value: unknown): string {
  if (typeof value !== 'string') {
    throw new BadRequestException('A written reason is required.');
  }
  const reason = value.trim();
  if (reason.length === 0 || reason.length > MAXIMUM_REASON_LENGTH) {
    throw new BadRequestException('A written reason is required.');
  }
  return reason;
}

export function requireIdempotencyKey(value: string | undefined): string {
  if (typeof value !== 'string') {
    throw new BadRequestException('An Idempotency-Key header is required.');
  }
  const key = value.trim();
  if (key.length === 0 || key.length > 200) {
    throw new BadRequestException('An Idempotency-Key header is required.');
  }
  return key;
}

export function requireComparedClientAccountIds(
  value: unknown,
): [string, string] {
  const ids = requireDistinctUuids(
    value,
    'compared Client Account identifiers',
  );
  const [first, second] = ids;
  if (ids.length !== 2 || !first || !second) {
    throw new BadRequestException(
      'Exactly two distinct Client Accounts are required.',
    );
  }
  return [first, second];
}

function requireDistinctUuids(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new BadRequestException(`Invalid ${field}.`);
  }
  const ids = value.map((item) => requireUuid(item, field));
  if (new Set(ids).size !== ids.length) {
    throw new BadRequestException(`Invalid ${field}.`);
  }
  return ids;
}

function requireUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new BadRequestException(`Invalid ${field}.`);
  }
  return value.toLowerCase();
}

function requireFieldSelections(
  value: unknown,
): ReadonlyMap<ClientUnionSelectableField, string> {
  if (value === undefined) return new Map();
  if (!isRecord(value)) {
    throw new BadRequestException('Invalid Client field selections.');
  }
  const selections = new Map<ClientUnionSelectableField, string>();
  for (const [field, selected] of Object.entries(value)) {
    const selectableField = asSelectableField(field);
    if (!selectableField) {
      throw new BadRequestException('Invalid Client field selections.');
    }
    selections.set(
      selectableField,
      requireUuid(selected, 'Client field selections'),
    );
  }
  return selections;
}

function requireContactConsolidations(
  value: unknown,
): ClientUnionContactConsolidation[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new BadRequestException('Invalid Contact consolidations.');
  }
  return value.map((entry) => {
    if (!isRecord(entry) || !Array.isArray(entry.absorb)) {
      throw new BadRequestException('Invalid Contact consolidations.');
    }
    const consolidation: ClientUnionContactConsolidation = {
      retain: requireContactSource(entry.retain),
      absorb: entry.absorb.map((absorbed) => requireContactSource(absorbed)),
    };
    if (consolidation.absorb.length === 0) {
      throw new BadRequestException('Invalid Contact consolidations.');
    }
    return consolidation;
  });
}

function requireContactSource(value: unknown): ClientUnionContactSource {
  if (
    !isRecord(value) ||
    !Number.isInteger(value.index) ||
    typeof value.index !== 'number' ||
    value.index < 0
  ) {
    throw new BadRequestException('Invalid Contact consolidations.');
  }
  return {
    clientAccountId: requireUuid(
      value.clientAccountId,
      'Contact consolidations',
    ),
    index: value.index,
  };
}

function asSelectableField(
  field: string,
): ClientUnionSelectableField | undefined {
  return CLIENT_UNION_SELECTABLE_FIELDS.find(
    (selectable) => selectable === field,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
