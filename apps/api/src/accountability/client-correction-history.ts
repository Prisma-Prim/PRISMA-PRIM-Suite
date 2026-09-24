import { isStoredClientContact } from '../client/client-dossier-validation.js';
import type { ClientContact } from '../client/client.types.js';
import type { ClientCorrectionFieldChanges } from './accountability.types.js';

/**
 * Stored `client.corrected` metadata is untrusted input. Prove the delivered
 * change shape once and fail closed without echoing any stored value.
 */
export function readClientCorrectionChanges(
  metadata: unknown,
): ClientCorrectionFieldChanges {
  const stored = record(metadata, ['changes']);
  const entries = Object.entries(record(stored.changes));
  if (entries.length === 0) return invalid();
  const changes: ClientCorrectionFieldChanges = {};
  for (const [field, value] of entries) {
    const change = record(value, ['before', 'after']);
    switch (field) {
      case 'displayName':
        changes.displayName = {
          before: text(change.before),
          after: text(change.after),
        };
        break;
      case 'taxId':
      case 'address':
      case 'telephone':
      case 'generalEmail':
      case 'businessActivity':
        changes[field] = {
          before: optionalText(change.before),
          after: optionalText(change.after),
        };
        break;
      case 'contacts':
        changes.contacts = {
          before: contacts(change.before),
          after: contacts(change.after),
        };
        break;
      default:
        return invalid();
    }
  }
  return changes;
}

function record(
  value: unknown,
  exactKeys?: readonly string[],
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return invalid();
  const entries = Object.entries(value);
  if (
    exactKeys &&
    (entries.length !== exactKeys.length ||
      entries.some(([key]) => !exactKeys.includes(key)))
  )
    return invalid();
  return Object.fromEntries(entries);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : invalid();
}

function optionalText(value: unknown): string | null {
  return value === null ? null : text(value);
}

function contacts(value: unknown): ClientContact[] {
  if (!Array.isArray(value)) return invalid();
  const entries: unknown[] = value;
  return entries.map((entry) =>
    isStoredClientContact(entry) ? entry : invalid(),
  );
}

function invalid(): never {
  throw new Error('Invalid stored Client correction history.');
}
