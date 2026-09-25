import { BadRequestException } from '@nestjs/common';
import {
  CLIENT_CONTACT_DECISION_ROLES,
  type ClientContact,
  type ClientContactDecisionRole,
  type ClientDossierFieldsInput,
} from './client.types.js';
import { sameJsonValue } from './json-structural-equality.js';

const MAXIMUM_DISPLAY_NAME_LENGTH = 200;
const MAXIMUM_SHORT_TEXT_LENGTH = 500;
const MAXIMUM_LONG_TEXT_LENGTH = 2_000;
const MAXIMUM_EMAIL_LENGTH = 320;
const MAXIMUM_CONTACTS = 50;
/** Provisional MVP bound, counted in Unicode code points rather than UTF-16 units. */
const MAXIMUM_COMMUNICATION_PREFERENCES_CODE_POINTS = 1_000;
const MAXIMUM_INCREMENTABLE_VERSION = 2_147_483_646;
const CONTACT_FIELDS: ReadonlySet<string> = new Set([
  'name',
  'telephone',
  'email',
  'position',
  'decisionRoles',
  'communicationPreferences',
]);

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

export function normalizeMinimalRegistration(
  input: ClientDossierFieldsInput,
): NormalizedDossierFields {
  const unknown = Object.keys(input).find((field) => field !== 'displayName');
  if (unknown) {
    throw new BadRequestException('Unknown Client field.');
  }
  return {
    displayName: requireDisplayName(input.displayName),
    taxId: null,
    address: null,
    telephone: null,
    generalEmail: null,
    contacts: [],
    businessActivity: null,
  };
}

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

/**
 * Proves a Contact read back from storage or history has the shape this
 * module writes. Delivered text fields stay as stored; the optional position,
 * decision roles and communication preferences must already be canonical and
 * never empty. Readers fail closed when this returns false.
 */
export function isStoredClientContact(value: unknown): value is ClientContact {
  if (
    !isRecord(value) ||
    Object.keys(value).some((field) => !CONTACT_FIELDS.has(field))
  )
    return false;
  const {
    name,
    telephone,
    email,
    position,
    decisionRoles,
    communicationPreferences,
  } = value;
  return (
    typeof name === 'string' &&
    (telephone === undefined || typeof telephone === 'string') &&
    (email === undefined || typeof email === 'string') &&
    (position === undefined ||
      isNormalized(position, optionalContactPosition)) &&
    (decisionRoles === undefined ||
      (Array.isArray(decisionRoles) &&
        decisionRoles.length > 0 &&
        isNormalized(decisionRoles, optionalDecisionRoles))) &&
    (communicationPreferences === undefined ||
      isNormalized(communicationPreferences, optionalCommunicationPreferences))
  );
}

export function requireVersion(value: unknown): number {
  if (
    !Number.isInteger(value) ||
    typeof value !== 'number' ||
    value < 1 ||
    value > MAXIMUM_INCREMENTABLE_VERSION
  ) {
    throw new BadRequestException(
      'Expected Client version must be an integer between 1 and 2147483646.',
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
      (field) => !CONTACT_FIELDS.has(field),
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
    const position = optionalContactPosition(contact.position);
    const decisionRoles = optionalDecisionRoles(contact.decisionRoles);
    const communicationPreferences = optionalCommunicationPreferences(
      contact.communicationPreferences,
    );
    return {
      name,
      ...(telephone === null ? {} : { telephone }),
      ...(email === null ? {} : { email }),
      ...(position === null ? {} : { position }),
      ...(decisionRoles.length === 0 ? {} : { decisionRoles }),
      ...(communicationPreferences === null
        ? {}
        : { communicationPreferences }),
    };
  });
}

function optionalContactPosition(value: unknown): string | null {
  if (value === undefined) return null;
  if (typeof value !== 'string') {
    throw new BadRequestException('Client contact position must be text.');
  }
  return optionalText(
    value,
    'Client contact position',
    MAXIMUM_SHORT_TEXT_LENGTH,
  );
}

/** Collapses duplicates and returns the selection in vocabulary order. */
function optionalDecisionRoles(value: unknown): ClientContactDecisionRole[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new BadRequestException(
      'Client contact decision roles must be a list.',
    );
  }
  const selected: unknown[] = value;
  if (!selected.every(isDecisionRole)) {
    throw new BadRequestException('Unknown Client contact decision role.');
  }
  return CLIENT_CONTACT_DECISION_ROLES.filter((role) =>
    selected.includes(role),
  );
}

function isDecisionRole(value: unknown): value is ClientContactDecisionRole {
  return CLIENT_CONTACT_DECISION_ROLES.some((role) => role === value);
}

/** Absent or blank means none; unlike delivered Contact text, null is rejected. */
function optionalCommunicationPreferences(value: unknown): string | null {
  if (value === undefined) return null;
  if (typeof value !== 'string') {
    throw new BadRequestException(
      'Client contact communication preferences must be text.',
    );
  }
  const normalized = value.trim();
  if (!normalized) return null;
  if ([...normalized].length > MAXIMUM_COMMUNICATION_PREFERENCES_CODE_POINTS) {
    throw new BadRequestException(
      'Client contact communication preferences are too long.',
    );
  }
  return normalized;
}

/** A stored value is canonical when normalizing it again changes nothing. */
function isNormalized(
  value: unknown,
  normalize: (value: unknown) => unknown,
): boolean {
  try {
    return sameJsonValue(normalize(value), value);
  } catch {
    return false;
  }
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
