import {
  isClientContactDecisionRole,
  type ClientContact,
} from './ClientContactEditor';
import { readClientAccountView } from './client-account-response';

/** Current HTTP projection; historical snapshots keep their own readers. */
export function readClientDossier(
  value: unknown,
  expected: { clientAccountId: string },
) {
  const row = record(value);
  const account = readClientAccountView(row);
  if (
    account.id !== expected.clientAccountId ||
    typeof row.version !== 'number' ||
    !Number.isSafeInteger(row.version) ||
    row.version < 1
  )
    throw new Error('Invalid Client dossier identity or version.');
  return {
    ...account,
    taxId: nullableText(row.taxId),
    address: nullableText(row.address),
    telephone: nullableText(row.telephone),
    generalEmail: nullableText(row.generalEmail),
    businessActivity: nullableText(row.businessActivity),
    contacts: list(row.contacts).map(contact),
    version: row.version,
    involvedCompanyDisplayNames: list(row.involvedCompanyDisplayNames).map(
      text,
    ),
  };
}

export type ClientDossierView = ReturnType<typeof readClientDossier>;

function contact(value: unknown): ClientContact {
  const row = record(value);
  return {
    name: text(row.name),
    ...(row.telephone === undefined ? {} : { telephone: text(row.telephone) }),
    ...(row.email === undefined ? {} : { email: text(row.email) }),
    ...(row.position === undefined ? {} : { position: text(row.position) }),
    ...(row.decisionRoles === undefined
      ? {}
      : { decisionRoles: list(row.decisionRoles).map(decisionRole) }),
    ...(row.communicationPreferences === undefined
      ? {}
      : { communicationPreferences: text(row.communicationPreferences) }),
  };
}

function decisionRole(value: unknown) {
  if (!isClientContactDecisionRole(value))
    throw new Error('Invalid Client Contact decision role.');
  return value;
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Invalid Client dossier response.');
  return Object.fromEntries(Object.entries(value));
}

function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Invalid Client dossier list.');
  return value;
}

function text(value: unknown): string {
  if (typeof value !== 'string')
    throw new Error('Invalid Client dossier text.');
  return value;
}

function nullableText(value: unknown): string | null {
  return value === null ? null : text(value);
}
