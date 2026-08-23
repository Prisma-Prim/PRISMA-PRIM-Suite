import { BadRequestException } from '@nestjs/common';
import type {
  ClientContact,
  ClientDossierFieldsInput,
} from './client.types.js';

const MAXIMUM_DISPLAY_NAME_LENGTH = 200;
const MAXIMUM_SHORT_TEXT_LENGTH = 500;
const MAXIMUM_LONG_TEXT_LENGTH = 2_000;
const MAXIMUM_EMAIL_LENGTH = 320;
const MAXIMUM_CONTACTS = 50;

export interface NormalizedDossierFields {
  displayName: string;
  taxId: string | null;
  address: string | null;
  telephone: string | null;
  generalEmail: string | null;
  contacts: ClientContact[];
  businessActivity: string | null;
}

export type CorrectionPatch = Partial<NormalizedDossierFields>;

export function normalizeRegistration(
  input: ClientDossierFieldsInput,
): NormalizedDossierFields {
  assertKnownFields(input, false);
  return {
    displayName: requireDisplayName(input.displayName),
    taxId: optionalText(
      input.taxId,
      'Client tax ID',
      MAXIMUM_SHORT_TEXT_LENGTH,
    ),
    address: optionalText(
      input.address,
      'Client address',
      MAXIMUM_LONG_TEXT_LENGTH,
    ),
    telephone: optionalText(
      input.telephone,
      'Client telephone',
      MAXIMUM_SHORT_TEXT_LENGTH,
    ),
    generalEmail: optionalEmail(input.generalEmail),
    contacts: normalizeContacts(input.contacts ?? []),
    businessActivity: optionalText(
      input.businessActivity,
      'Client business activity',
      MAXIMUM_LONG_TEXT_LENGTH,
    ),
  };
}

export function normalizeCorrection(
  input: ClientDossierFieldsInput,
): CorrectionPatch {
  assertKnownFields(input, true);
  const changes: CorrectionPatch = {};
  if (Object.hasOwn(input, 'displayName')) {
    changes.displayName = requireDisplayName(input.displayName);
  }
  if (Object.hasOwn(input, 'taxId')) {
    changes.taxId = optionalText(
      input.taxId,
      'Client tax ID',
      MAXIMUM_SHORT_TEXT_LENGTH,
    );
  }
  if (Object.hasOwn(input, 'address')) {
    changes.address = optionalText(
      input.address,
      'Client address',
      MAXIMUM_LONG_TEXT_LENGTH,
    );
  }
  if (Object.hasOwn(input, 'telephone')) {
    changes.telephone = optionalText(
      input.telephone,
      'Client telephone',
      MAXIMUM_SHORT_TEXT_LENGTH,
    );
  }
  if (Object.hasOwn(input, 'generalEmail')) {
    changes.generalEmail = optionalEmail(input.generalEmail);
  }
  if (Object.hasOwn(input, 'contacts')) {
    changes.contacts = normalizeContacts(input.contacts);
  }
  if (Object.hasOwn(input, 'businessActivity')) {
    changes.businessActivity = optionalText(
      input.businessActivity,
      'Client business activity',
      MAXIMUM_LONG_TEXT_LENGTH,
    );
  }
  if (Object.keys(changes).length === 0) {
    throw new BadRequestException('At least one Client field is required.');
  }
  return changes;
}

export function requireVersion(value: unknown): number {
  if (!Number.isInteger(value) || typeof value !== 'number' || value < 1) {
    throw new BadRequestException(
      'A positive expected Client version is required.',
    );
  }
  return value;
}

function assertKnownFields(
  input: ClientDossierFieldsInput,
  correction: boolean,
): void {
  const allowed = new Set([
    'displayName',
    'taxId',
    'address',
    'telephone',
    'generalEmail',
    'contacts',
    'businessActivity',
  ]);
  const unknown = Object.keys(input).find((field) => !allowed.has(field));
  if (unknown) {
    throw new BadRequestException(
      `Unknown Client ${correction ? 'correction ' : ''}field.`,
    );
  }
}

function requireDisplayName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException('Client display name is required.');
  }
  const normalized = value.trim();
  if (normalized.length > MAXIMUM_DISPLAY_NAME_LENGTH) {
    throw new BadRequestException('Client display name is too long.');
  }
  return normalized;
}

function optionalText(
  value: unknown,
  label: string,
  maximumLength: number,
): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new BadRequestException(`${label} must be text or null.`);
  }
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > maximumLength) {
    throw new BadRequestException(`${label} is too long.`);
  }
  return normalized;
}

function optionalEmail(value: unknown): string | null {
  const normalized = optionalText(
    value,
    'Client general email',
    MAXIMUM_EMAIL_LENGTH,
  );
  if (normalized !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized)) {
    throw new BadRequestException('Client general email is invalid.');
  }
  return normalized;
}

function normalizeContacts(value: unknown): ClientContact[] {
  if (!Array.isArray(value) || value.length > MAXIMUM_CONTACTS) {
    throw new BadRequestException('Client contacts must be a bounded list.');
  }
  return value.map((contact) => {
    if (!isRecord(contact)) {
      throw new BadRequestException('Each Client contact must be an object.');
    }
    const unknown = Object.keys(contact).find(
      (field) => !['name', 'telephone', 'email'].includes(field),
    );
    if (unknown) {
      throw new BadRequestException('Unknown Client contact field.');
    }
    const name = requireContactName(contact.name);
    const telephone = optionalText(
      contact.telephone,
      'Client contact telephone',
      MAXIMUM_SHORT_TEXT_LENGTH,
    );
    const email = optionalContactEmail(contact.email);
    return {
      name,
      ...(telephone === null ? {} : { telephone }),
      ...(email === null ? {} : { email }),
    };
  });
}

function requireContactName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException('Client contact name is required.');
  }
  const normalized = value.trim();
  if (normalized.length > MAXIMUM_SHORT_TEXT_LENGTH) {
    throw new BadRequestException('Client contact name is too long.');
  }
  return normalized;
}

function optionalContactEmail(value: unknown): string | null {
  const normalized = optionalText(
    value,
    'Client contact email',
    MAXIMUM_EMAIL_LENGTH,
  );
  if (normalized !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized)) {
    throw new BadRequestException('Client contact email is invalid.');
  }
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
