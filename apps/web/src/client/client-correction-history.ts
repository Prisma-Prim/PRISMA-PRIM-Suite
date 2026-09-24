import type { ClientContact } from './ClientContactEditor';

const textFields = [
  'taxId',
  'address',
  'telephone',
  'generalEmail',
  'businessActivity',
] as const;
type TextField = (typeof textFields)[number];
const fieldOrder = ['displayName', ...textFields, 'contacts'] as const;

export type ClientCorrectionChange =
  | { field: 'displayName'; before: string; after: string }
  | { field: TextField; before: string | null; after: string | null }
  | { field: 'contacts'; before: ClientContact[]; after: ClientContact[] };

export interface ClientCorrection {
  id: string;
  occurredAt: string;
  actorDisplayName: string;
  /** Changed fields only, in dossier order. */
  changes: ClientCorrectionChange[];
}

export interface ClientCorrectionHistoryPage {
  corrections: ClientCorrection[];
  nextCursor: string | null;
}

export function readClientCorrectionHistory(
  value: unknown,
): ClientCorrectionHistoryPage {
  const page = object(value);
  return {
    corrections: list(page.corrections).map(correction),
    nextCursor: page.nextCursor === null ? null : text(page.nextCursor),
  };
}

function correction(value: unknown): ClientCorrection {
  const row = object(value);
  const stored = object(row.changes);
  const fields = Object.keys(stored);
  if (
    fields.length === 0 ||
    fields.some((field) => !fieldOrder.some((known) => known === field))
  )
    throw new Error('Invalid Client correction history.');
  return {
    id: text(row.id),
    occurredAt: text(row.occurredAt),
    actorDisplayName: text(object(row.actor).displayName),
    changes: fieldOrder.flatMap((field): ClientCorrectionChange[] => {
      if (!Object.hasOwn(stored, field)) return [];
      const change = object(stored[field]);
      if (field === 'displayName')
        return [
          { field, before: text(change.before), after: text(change.after) },
        ];
      if (field === 'contacts')
        return [
          {
            field,
            before: contacts(change.before),
            after: contacts(change.after),
          },
        ];
      return [
        {
          field,
          before: optionalText(change.before),
          after: optionalText(change.after),
        },
      ];
    }),
  };
}

function contacts(value: unknown): ClientContact[] {
  return list(value).map((entry) => {
    const contact = object(entry);
    return {
      name: text(contact.name),
      ...(contact.telephone === undefined
        ? {}
        : { telephone: text(contact.telephone) }),
      ...(contact.email === undefined ? {} : { email: text(contact.email) }),
    };
  });
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Invalid Client correction history.');
  return Object.fromEntries(Object.entries(value));
}

function list(value: unknown): unknown[] {
  if (!Array.isArray(value))
    throw new Error('Invalid Client correction history.');
  return value;
}

function text(value: unknown): string {
  if (typeof value !== 'string')
    throw new Error('Invalid Client correction history.');
  return value;
}

function optionalText(value: unknown): string | null {
  return value === null ? null : text(value);
}
