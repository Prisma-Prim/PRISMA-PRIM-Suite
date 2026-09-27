import { BadRequestException } from '@nestjs/common';
import { optionalText, requireVersion } from './client-dossier-validation.js';
import {
  CLIENT_LEGAL_ENTITY_FIELDS,
  type ClientLegalEntityChanges,
  type ClientLegalEntityMutationResult,
  type ClientLegalEntityValues,
  type ClientLegalEntityView,
} from './client-legal-entity.types.js';

const MAXIMUM_LEGAL_NAME_LENGTH = 200;
const MAXIMUM_TAX_ID_LENGTH = 500;
const MAXIMUM_LEGAL_ADDRESS_LENGTH = 2_000;
const STORED_ENTITY_FIELDS = [
  'id',
  'createdAt',
  ...CLIENT_LEGAL_ENTITY_FIELDS,
] as const;

export function normalizeLegalEntityRegistration(body: unknown): {
  expectedClientVersion: number;
  values: ClientLegalEntityValues;
} {
  const request = requireFields(body, [
    'expectedClientVersion',
    ...CLIENT_LEGAL_ENTITY_FIELDS,
  ]);
  return {
    expectedClientVersion: requireVersion(request.expectedClientVersion),
    values: {
      legalName: requireLegalName(request.legalName),
      taxId: normalizeTaxId(request.taxId),
      legalAddress: normalizeLegalAddress(request.legalAddress),
    },
  };
}

export function normalizeLegalEntityCorrection(body: unknown): {
  expectedClientVersion: number;
  changes: ClientLegalEntityChanges;
} {
  const request = requireFields(body, ['expectedClientVersion', 'changes']);
  const expectedClientVersion = requireVersion(request.expectedClientVersion);
  if (!isRecord(request.changes)) {
    throw new BadRequestException(
      'Client legal entity changes must be an object.',
    );
  }
  const input = requireFields(request.changes, CLIENT_LEGAL_ENTITY_FIELDS);
  const changes: ClientLegalEntityChanges = {};
  if (Object.hasOwn(input, 'legalName')) {
    changes.legalName = requireLegalName(input.legalName);
  }
  if (Object.hasOwn(input, 'taxId')) {
    changes.taxId = normalizeTaxId(input.taxId);
  }
  if (Object.hasOwn(input, 'legalAddress')) {
    changes.legalAddress = normalizeLegalAddress(input.legalAddress);
  }
  if (Object.keys(changes).length === 0) {
    throw new BadRequestException(
      'At least one Client legal entity field is required.',
    );
  }
  return { expectedClientVersion, changes };
}

/**
 * Proves a receipt result read back from storage has exactly the shape this
 * module writes, with canonical values. Replays fail closed otherwise.
 */
export function readStoredLegalEntityResult(
  value: unknown,
): ClientLegalEntityMutationResult {
  if (
    !isRecord(value) ||
    !hasExactFields(value, ['clientVersion', 'legalEntity']) ||
    typeof value.clientVersion !== 'number' ||
    !Number.isSafeInteger(value.clientVersion) ||
    value.clientVersion < 2
  ) {
    throw invalidStoredResult();
  }
  return {
    clientVersion: value.clientVersion,
    legalEntity: readStoredLegalEntity(value.legalEntity),
  };
}

function readStoredLegalEntity(value: unknown): ClientLegalEntityView {
  if (!isRecord(value) || !hasExactFields(value, STORED_ENTITY_FIELDS)) {
    throw invalidStoredResult();
  }
  const { id, createdAt, legalName, taxId, legalAddress } = value;
  if (
    typeof id !== 'string' ||
    !id ||
    typeof createdAt !== 'string' ||
    !Number.isFinite(Date.parse(createdAt)) ||
    typeof legalName !== 'string' ||
    !isCanonical(legalName, requireLegalName) ||
    (taxId !== null &&
      (typeof taxId !== 'string' || !isCanonical(taxId, normalizeTaxId))) ||
    (legalAddress !== null &&
      (typeof legalAddress !== 'string' ||
        !isCanonical(legalAddress, normalizeLegalAddress)))
  ) {
    throw invalidStoredResult();
  }
  return { id, createdAt, legalName, taxId, legalAddress };
}

function requireLegalName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException('Client legal entity name is required.');
  }
  const normalized = value.trim();
  if (normalized.length > MAXIMUM_LEGAL_NAME_LENGTH) {
    throw new BadRequestException('Client legal entity name is too long.');
  }
  return requireNulFree(normalized, 'Client legal entity name');
}

/** The delivered dossier tax-ID normalization: trimmed, empty becomes null. */
function normalizeTaxId(value: unknown): string | null {
  return requireNulFree(
    optionalText(value, 'Client legal entity tax ID', MAXIMUM_TAX_ID_LENGTH),
    'Client legal entity tax ID',
  );
}

function normalizeLegalAddress(value: unknown): string | null {
  return requireNulFree(
    optionalText(
      value,
      'Client legal entity address',
      MAXIMUM_LEGAL_ADDRESS_LENGTH,
    ),
    'Client legal entity address',
  );
}

function requireNulFree<T extends string | null>(value: T, label: string): T {
  if (value?.includes('\0')) {
    throw new BadRequestException(`${label} must not contain NUL characters.`);
  }
  return value;
}

function requireFields(
  value: unknown,
  allowed: readonly string[],
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new BadRequestException(
      'Client legal entity request must be an object.',
    );
  }
  if (Object.keys(value).some((field) => !allowed.includes(field))) {
    throw new BadRequestException('Unknown Client legal entity field.');
  }
  return value;
}

/** A stored value is canonical when normalizing it again changes nothing. */
function isCanonical(
  value: string,
  normalize: (value: unknown) => string | null,
): boolean {
  try {
    return normalize(value) === value;
  } catch {
    return false;
  }
}

function hasExactFields(
  value: Record<string, unknown>,
  fields: readonly string[],
): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === fields.length &&
    keys.every((field) => fields.includes(field))
  );
}

function invalidStoredResult(): Error {
  return new Error('Invalid stored Client legal entity result.');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
