import type { BadRequestException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import type { workingDocuments } from '../database/schema/index.js';
import type { OfferRecipientCopy } from '../offer/offer.types.js';

type WorkingDocumentRow = typeof workingDocuments.$inferSelect;

/** The closed metadata every preserved received source registers. */
export interface ReceivedSourceMetadata {
  title: string;
  purpose: string;
  sourceDescription: string;
  receivedOn: string | null;
}

/**
 * What one family adds to the shared registration body: its type, its
 * selection fields and parser, its refusal, and how its PRD treats an
 * omitted received date.
 */
export interface ReceivedSourceRegistrationShape<
  Type extends string,
  Selection extends object,
> {
  type: Type;
  selectionFields: readonly string[];
  /**
   * `optional`: the field may be omitted and becomes null (received Contract
   * and received Addendum PRDs). `required-nullable`: the field must be
   * present and may be null (external invoice and payment evidence PRDs).
   */
  receivedOn: 'optional' | 'required-nullable';
  invalid(): BadRequestException;
  /** Parses the selection fields, refusing with the family's own error. */
  readSelection(value: Record<string, unknown>): Selection;
}

/**
 * Reads a closed registration body: the family's selection, then trimmed
 * title, purpose and source description, then the received date. Field
 * order is part of the idempotency fingerprint and must not change.
 */
export function readReceivedSourceRegistration<
  Type extends string,
  Selection extends object,
>(
  value: Record<string, unknown>,
  shape: ReceivedSourceRegistrationShape<Type, Selection>,
): { type: Type } & Selection & ReceivedSourceMetadata {
  const fields = [
    'type',
    ...shape.selectionFields,
    'title',
    'purpose',
    'sourceDescription',
    'receivedOn',
  ];
  const keys = Object.keys(value);
  if (
    value.type !== shape.type ||
    keys.some((key) => !fields.includes(key)) ||
    (shape.receivedOn === 'required-nullable' && keys.length !== fields.length)
  )
    throw shape.invalid();
  const receivedOnUnknown =
    shape.receivedOn === 'optional'
      ? value.receivedOn == null
      : value.receivedOn === null;
  return {
    type: shape.type,
    ...shape.readSelection(value),
    title: metadata(value.title, 200, shape),
    purpose: metadata(value.purpose, 2000, shape),
    sourceDescription: metadata(value.sourceDescription, 2000, shape),
    receivedOn: receivedOnUnknown
      ? null
      : calendarDate(value.receivedOn, shape),
  };
}

function metadata(
  value: unknown,
  maximum: number,
  shape: { invalid(): BadRequestException },
): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.trim().length > maximum ||
    /[\0\uD800-\uDFFF]/u.test(value)
  )
    throw shape.invalid();
  return value.trim();
}

function calendarDate(
  value: unknown,
  shape: { invalid(): BadRequestException },
): string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(value) ||
    value.startsWith('0000') ||
    !Number.isFinite(Date.parse(value + 'T00:00:00.000Z')) ||
    new Date(value + 'T00:00:00.000Z').toISOString().slice(0, 10) !== value
  )
    throw shape.invalid();
  return value;
}

/** The registration columns every family's relation row stores. */
export function receivedSourceAttribution(
  actor: ActorContext,
  document: WorkingDocumentRow,
  command: Pick<ReceivedSourceMetadata, 'sourceDescription' | 'receivedOn'>,
) {
  return {
    sourceDescription: command.sourceDescription,
    receivedOn: command.receivedOn,
    registeredByMembershipId: actor.workspaceMembershipId,
    registeredByInternalUserId: actor.internalUserId,
    // Registration time is the Document's own creation time.
    registeredAt: sql<Date>`(SELECT created_at FROM working_documents WHERE id=${document.id} AND workspace_id=${document.workspaceId} AND company_id=${document.companyId})`,
  };
}

/** The registration facts every family's relation view shows. */
export function receivedSourceAttributionView(row: {
  sourceDescription: string;
  receivedOn: string | null;
  registeredAt: Date;
  registeredByMembershipId: string;
  registeredByInternalUserId: string;
}) {
  return {
    sourceDescription: row.sourceDescription,
    receivedOn: row.receivedOn,
    registeredAt: row.registeredAt.toISOString(),
    registeredBy: {
      workspaceMembershipId: row.registeredByMembershipId,
      internalUserId: row.registeredByInternalUserId,
    },
  };
}

interface RecordedRecipientColumns {
  recipientKind: 'PRIMARY' | 'ADDITIONAL';
  recipientAdditionalLegalEntityId: string | null;
  recipientLegalName: string;
  recipientTaxId: string | null;
  recipientLegalAddress: string | null;
}

/** The Contract Version's recorded party, conserved on the relation row. */
export function recordedRecipientColumns(
  party: OfferRecipientCopy,
): RecordedRecipientColumns {
  return {
    recipientKind: party.kind,
    recipientAdditionalLegalEntityId:
      party.kind === 'ADDITIONAL' ? party.additionalLegalEntityId : null,
    recipientLegalName: party.legalName,
    recipientTaxId: party.taxId,
    recipientLegalAddress: party.legalAddress,
  };
}

/** The conserved recorded party; an inconsistent row fails closed. */
export function readRecordedRecipient(
  row: RecordedRecipientColumns,
  inconsistent: string,
): OfferRecipientCopy {
  if (row.recipientKind === 'PRIMARY')
    return {
      kind: 'PRIMARY',
      legalName: row.recipientLegalName,
      taxId: row.recipientTaxId,
      legalAddress: row.recipientLegalAddress,
    };
  if (!row.recipientAdditionalLegalEntityId) throw new Error(inconsistent);
  return {
    kind: 'ADDITIONAL',
    additionalLegalEntityId: row.recipientAdditionalLegalEntityId,
    legalName: row.recipientLegalName,
    taxId: row.recipientTaxId,
    legalAddress: row.recipientLegalAddress,
  };
}

/**
 * One family's registration steps inside the Document registration
 * transaction: its authority, its qualifier from the owning module, and its
 * relation row.
 */
export interface ReceivedSourceAdapter<
  Command,
  Reference extends { originalClientAccountId: string },
> {
  requireRegistrationAuthority(actor: ActorContext): Promise<void>;
  qualify(actor: ActorContext, command: Command): Promise<Reference>;
  attach(input: {
    actor: ActorContext;
    document: WorkingDocumentRow;
    command: Command;
    reference: Reference;
  }): Promise<void>;
}

/** A qualified registration: its original Client, then its relation row. */
export interface QualifiedReceivedSource {
  originalClientAccountId: string;
  attach(document: WorkingDocumentRow): Promise<void>;
}

/**
 * Dispatches registration to the family adapter. `Commands` and `References`
 * map each family type to its parsed command and qualified reference.
 */
export class ReceivedSourceRegistration<
  Commands extends object,
  References extends {
    [Type in keyof Commands]: { originalClientAccountId: string };
  },
> {
  constructor(
    private readonly adapters: {
      [Type in keyof Commands]: ReceivedSourceAdapter<
        Commands[Type],
        References[Type]
      >;
    },
  ) {}

  requireRegistrationAuthority(
    actor: ActorContext,
    type: keyof Commands,
  ): Promise<void> {
    return this.adapters[type].requireRegistrationAuthority(actor);
  }

  async qualify<Type extends keyof Commands>(
    actor: ActorContext,
    type: Type,
    command: Commands[Type],
  ): Promise<QualifiedReceivedSource> {
    const adapter = this.adapters[type];
    const reference = await adapter.qualify(actor, command);
    return {
      originalClientAccountId: reference.originalClientAccountId,
      attach: (document) =>
        adapter.attach({ actor, document, command, reference }),
    };
  }
}
