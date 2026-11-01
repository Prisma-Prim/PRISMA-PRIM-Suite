import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import {
  requireIdempotencyKey,
  requireUuid,
} from '../access/access-command-validation.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { ClientOperationalReferenceService } from '../client/client-operational-reference.service.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  clientAccounts,
  clientCompanyRelationships,
  documentRepresentations,
  documentCorrectionCommands,
  documentVersions,
  internalUsers,
  workingDocuments,
  workspaceMemberships,
} from '../database/schema/index.js';
import { ProjectService } from '../project/project.service.js';
import {
  DocumentReadBoundary,
  canReadReference,
  requireDocumentPermission,
} from './document-read-boundary.js';
import {
  DocumentVersionsService,
  documentVersionStateInvalid,
} from './document-versions.service.js';
import type {
  DocumentCorrectionHistoryEntry,
  DocumentCorrectionHistoryPage,
  DocumentProjectAssociation,
  WorkingDocument,
  WorkingDocumentDetail,
} from './documents.types.js';
import { readExternalInvoiceRegistration } from './external-invoice.js';
import { ExternalInvoiceRelationsService } from './external-invoice-relations.service.js';
import { readReceivedContractRegistration } from './received-contract.js';
import { ReceivedContractRelationsService } from './received-contract-relations.service.js';

const CORRECTION_HISTORY_PAGE_SIZE = 20;
const MAXIMUM_REVISION = 2147483647;

@Injectable()
export class DocumentsService {
  constructor(
    private readonly authorization: CompanyContextAuthorization,
    private readonly database: DatabaseContext,
    private readonly clients: ClientOperationalReferenceService,
    private readonly accountability: AccountabilityService,
    private readonly projects: ProjectService,
    private readonly boundary: DocumentReadBoundary,
    private readonly versions: DocumentVersionsService,
    private readonly receivedContracts: ReceivedContractRelationsService,
    private readonly externalInvoices: ExternalInvoiceRelationsService,
  ) {}
  async register(
    actor: ActorContext,
    value: unknown,
    key: string | undefined,
  ): Promise<WorkingDocumentDetail> {
    const companyId = requireDocumentPermission(actor, 'document.register');
    requireDocumentPermission(actor, 'document.read');
    const command = registration(value);
    const idempotencyKey = requireIdempotencyKey(key);
    const payload =
      command.type === 'questionnaire'
        ? {
            clientId: command.clientId,
            title: command.title,
            purpose: command.purpose,
            url: command.url,
          }
        : command;
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ companyId, ...payload }))
      .digest('hex');
    return this.database.transaction(async () => {
      await this.authorization.requireDocumentAccess(actor, true);
      if (
        command.type === 'mission-deliverable' &&
        !(await this.authorization.hasMissionDeliverableAccess(actor, {
          lockAssignment: true,
        }))
      )
        throw new ForbiddenException();
      if (command.type === 'external-invoice')
        await this.externalInvoices.requireRegistrationAuthority(actor);
      if (command.type === 'received-contract') {
        if (
          !(await this.authorization.hasReceivedContractAccess(actor, {
            lockAssignment: true,
          }))
        )
          throw new ForbiddenException();
        await this.receivedContracts.requireReadAuthority(actor);
      }
      // Serialize retries before looking up the actor-owned command. A failed
      // mutation rolls back the identity, content, Client fence and history.
      await this.database.connection.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${actor.workspaceId}:${actor.workspaceMembershipId}:${idempotencyKey}`}, 0))`,
      );
      const [existing] = await this.database.connection
        .select()
        .from(workingDocuments)
        .where(
          and(
            eq(workingDocuments.workspaceId, actor.workspaceId),
            eq(
              workingDocuments.createdByMembershipId,
              actor.workspaceMembershipId,
            ),
            eq(workingDocuments.idempotencyKey, idempotencyKey),
          ),
        );
      if (existing) {
        if (existing.requestFingerprint !== fingerprint)
          throw new ConflictException(
            'Idempotency-Key was already used for another registration.',
          );
        return this.readDetail(actor, existing.id);
      }
      const binding =
        command.type === 'external-invoice'
          ? {
              kind: 'external-invoice' as const,
              command,
              reference: await this.externalInvoices.qualify(actor, command),
            }
          : command.type === 'received-contract'
            ? {
                kind: 'contract-version' as const,
                command,
                reference: await this.receivedContracts.qualify(actor, command),
              }
            : { kind: 'client' as const, clientId: command.clientId };
      const clientId =
        binding.kind !== 'client'
          ? binding.reference.originalClientAccountId
          : binding.clientId;
      if (command.type === 'mission-deliverable')
        await this.clients.lockActiveReferenceClient(actor, clientId);
      await this.clients.recordReferenceUse(actor, clientId);
      const [document] = await this.database.connection
        .insert(workingDocuments)
        .values({
          workspaceId: actor.workspaceId,
          companyId,
          clientId,
          title: command.title,
          purpose: command.purpose,
          type: command.type,
          createdByMembershipId: actor.workspaceMembershipId,
          idempotencyKey,
          requestFingerprint: fingerprint,
        })
        .returning();
      if (!document) throw new Error('Document was not created.');
      // Registration creates Version 1 as a draft, attributed to the
      // registrar at the Document's creation time.
      const [version] = await this.database.connection
        .insert(documentVersions)
        .values({
          workspaceId: actor.workspaceId,
          companyId,
          documentId: document.id,
          number: 1,
          status: 'draft',
          createdByMembershipId: actor.workspaceMembershipId,
          createdAt: document.createdAt,
        })
        .returning();
      if (!version) throw new Error('Version was not created.');
      if (binding.kind === 'external-invoice')
        await this.externalInvoices.attach({
          actor,
          document,
          command: binding.command,
          reference: binding.reference,
        });
      if (binding.kind === 'contract-version')
        await this.receivedContracts.attach({
          actor,
          document,
          command: binding.command,
          reference: binding.reference,
        });
      if (command.type === 'questionnaire')
        await this.database.connection.insert(documentRepresentations).values({
          workspaceId: actor.workspaceId,
          companyId,
          versionId: version.id,
          url: command.url,
          addedByMembershipId: actor.workspaceMembershipId,
          addedAt: version.createdAt,
        });
      await this.accountability.recordDocumentRegistered({
        actor,
        companyId,
        documentId: document.id,
      });
      return this.readDetail(actor, document.id);
    });
  }
  async receivedContractSources(actor: ActorContext, query: unknown) {
    requireDocumentPermission(actor, 'document.register');
    requireDocumentPermission(actor, 'document.read');
    return this.database.transaction(
      async () => {
        await this.authorization.requireDocumentAccess(actor);
        if (!(await this.authorization.hasReceivedContractAccess(actor)))
          throw new ForbiddenException();
        return this.receivedContracts.selectableVersions(actor, query);
      },
      { isolationLevel: 'repeatable read' },
    );
  }

  async externalInvoiceSources(actor: ActorContext, query: unknown) {
    requireDocumentPermission(actor, 'document.register');
    requireDocumentPermission(actor, 'document.read');
    return this.database.transaction(
      async () => {
        if (
          !(await this.authorization.hasExternalInvoiceAccess(actor, {
            manage: true,
            lockAssignment: false,
          }))
        )
          throw new ForbiddenException();
        await this.authorization.requireExternalInvoiceNativeAccess(actor, {
          action: 'register',
          lockAssignment: false,
        });
        return this.externalInvoices.selectableVersions(actor, query);
      },
      { isolationLevel: 'repeatable read' },
    );
  }
  async list(actor: ActorContext): Promise<WorkingDocument[]> {
    const companyId = requireDocumentPermission(actor, 'document.read');
    await this.authorization.requireDocumentAccess(actor);
    const familyAllowed =
      await this.authorization.hasMissionDeliverableAccess(actor);
    const externalAllowed = await this.authorization.hasExternalInvoiceAccess(
      actor,
      { manage: false, lockAssignment: false },
    );
    const receivedAllowed =
      await this.authorization.hasReceivedContractAccess(actor);
    const rows = await this.database.connection
      .select({
        id: workingDocuments.id,
        clientId: workingDocuments.clientId,
      })
      .from(workingDocuments)
      .innerJoin(
        clientCompanyRelationships,
        and(
          eq(
            clientCompanyRelationships.workspaceId,
            workingDocuments.workspaceId,
          ),
          eq(clientCompanyRelationships.companyId, workingDocuments.companyId),
          eq(
            clientCompanyRelationships.clientAccountId,
            workingDocuments.clientId,
          ),
          eq(clientCompanyRelationships.status, 'active'),
        ),
      )
      .innerJoin(
        clientAccounts,
        and(
          eq(clientAccounts.workspaceId, workingDocuments.workspaceId),
          eq(clientAccounts.id, workingDocuments.clientId),
          sql`${clientAccounts.status} IN ('active','superseded')`,
        ),
      )
      .where(
        and(
          eq(workingDocuments.workspaceId, actor.workspaceId),
          eq(workingDocuments.companyId, companyId),
          inArray(workingDocuments.type, [
            'questionnaire',
            ...(externalAllowed ? ['external-invoice' as const] : []),
            ...(familyAllowed ? ['mission-deliverable' as const] : []),
            ...(receivedAllowed ? ['received-contract' as const] : []),
          ]),
        ),
      )
      .orderBy(desc(workingDocuments.createdAt), desc(workingDocuments.id));
    const dossierIds = await this.clientDossierIds(
      actor,
      rows.map((row) => row.clientId),
    );
    return Promise.all(
      rows.map(
        async (row) =>
          (await this.readReference(actor, row.id, dossierIds)).document,
      ),
    );
  }
  async read(actor: ActorContext, idValue: unknown): Promise<WorkingDocument> {
    return (await this.readReference(actor, idValue, undefined)).document;
  }
  /** Association and Project title come from the Document's read snapshot. */
  async detail(
    actor: ActorContext,
    idValue: unknown,
  ): Promise<WorkingDocumentDetail> {
    return this.database.transaction(() => this.readDetail(actor, idValue), {
      isolationLevel: 'repeatable read',
    });
  }
  /**
   * Runs inside the caller's transaction: `detail` opens a read snapshot, and
   * registration answers from the transaction that created or replays the
   * Document. A Project title never changes after creation.
   */
  private async readDetail(
    actor: ActorContext,
    idValue: unknown,
  ): Promise<WorkingDocumentDetail> {
    const { document, projectId } = await this.readReference(
      actor,
      idValue,
      undefined,
    );
    if (document.type === 'external-invoice') return document;
    const projectAssociation = await this.projectAssociation(actor, projectId);
    return projectAssociation ? { ...document, projectAssociation } : document;
  }
  /**
   * Project owns its read authority, including the Client-read prerequisite.
   * Without it the association is absent, never `unlinked`, and it never hides
   * the readable Document, like the optional dossier target.
   */
  private async projectAssociation(
    actor: ActorContext,
    projectId: string | null,
  ): Promise<DocumentProjectAssociation | undefined> {
    if (!actor.activeCompany?.projectPermissions?.includes('project.read'))
      return undefined;
    try {
      if (projectId === null) {
        await this.authorization.requireProjectAccess(actor);
        return { state: 'unlinked' };
      }
      const project = await this.projects.read(actor, projectId);
      return {
        state: 'linked',
        project: { id: project.id, title: project.title },
      };
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        error instanceof NotFoundException
      )
        return undefined;
      throw error;
    }
  }
  /**
   * Client owns the union, permission and identity resolution behind the
   * optional dossier target. A missing target never hides a readable Document.
   */
  private async clientDossierIds(
    actor: ActorContext,
    clientIds: readonly string[],
  ): Promise<ReadonlyMap<string, string>> {
    const references = await this.clients.readProjectReferences(
      actor,
      clientIds,
    );
    return new Map(
      [...references].flatMap(([clientId, reference]) =>
        reference.clientDossierId
          ? [[clientId, reference.clientDossierId] as const]
          : [],
      ),
    );
  }
  /**
   * One readable Document with its working Version: the draft if one exists,
   * otherwise the current official Version. The list, the detail and the
   * Project lists share this projection.
   */
  private async readReference(
    actor: ActorContext,
    idValue: unknown,
    resolvedDossierIds: ReadonlyMap<string, string> | undefined,
    options: { lockFamily: boolean } = { lockFamily: false },
  ): Promise<{ document: WorkingDocument; projectId: string | null }> {
    const visible = await this.boundary.requireVisible(actor, idValue, options);
    const { companyId, document: row, client } = visible;
    const working = await this.versions.workingVersion(
      {
        workspaceId: row.workspaceId,
        companyId,
        documentId: row.id,
      },
      row.type,
    );
    const clientDossierId = (
      resolvedDossierIds ?? (await this.clientDossierIds(actor, [row.clientId]))
    ).get(row.clientId);
    const base = {
      id: row.id,
      workspaceId: row.workspaceId,
      companyId,
      clientId: row.clientId,
      ...(clientDossierId ? { clientDossierId } : {}),
      clientDisplayName: client.displayName,
      title: row.title,
      purpose: row.purpose,
      confidentiality: 'company-confidential' as const,
      createdAt: row.createdAt.toISOString(),
      workingRevision: row.workingRevision,
      // Only a draft is corrected, and only while the original Client is active.
      correction:
        client.status === 'active' && working.status === 'draft'
          ? ('allowed' as const)
          : ('read-only' as const),
    };
    const identity = { id: working.id, status: working.status };
    const document: WorkingDocument =
      working.documentType === 'external-invoice'
        ? {
            ...base,
            type: 'external-invoice',
            version: { ...identity, representation: null },
            externalInvoiceRelation: await this.externalInvoices.read(
              actor,
              row,
            ),
          }
        : working.documentType === 'received-contract'
          ? {
              ...base,
              type: 'received-contract',
              createdByMembershipId: row.createdByMembershipId,
              version: { ...identity, representation: null },
              receivedContractRelation: await this.receivedContracts.read(
                actor,
                row,
              ),
            }
          : working.documentType === 'mission-deliverable'
            ? {
                ...base,
                type: 'mission-deliverable',
                createdByMembershipId: row.createdByMembershipId,
                version: { ...identity, representation: null },
              }
            : {
                ...base,
                type: 'questionnaire',
                createdByMembershipId: row.createdByMembershipId,
                version: {
                  ...identity,
                  representation: canReadReference(actor)
                    ? {
                        id: working.representation.id,
                        kind: 'external-reference',
                        verification: 'unverified',
                        access: 'granted',
                        url: working.representation.url,
                      }
                    : {
                        id: working.representation.id,
                        kind: 'external-reference',
                        verification: 'unverified',
                        access: 'denied',
                      },
                },
              };
    return { document, projectId: row.projectId };
  }
  /**
   * A readable working Document's material correction ledger, newest revision
   * first. Refusals are exactly the detail read's, and they precede query
   * validation. Authority, visibility and the page share one read snapshot;
   * nothing is written. Revisions consumed by Version commands leave gaps
   * that the strict `beforeRevision` continuation skips.
   */
  async correctionHistory(
    actor: ActorContext,
    request: { documentId: unknown; query: unknown },
  ): Promise<DocumentCorrectionHistoryPage> {
    return this.database.transaction(
      async () => {
        const { companyId, document } = await this.boundary.requireVisible(
          actor,
          request.documentId,
        );
        const beforeRevision = correctionHistoryQuery(request.query);
        const rows = await this.database.connection
          .select({
            revision: documentCorrectionCommands.revision,
            occurredAt: documentCorrectionCommands.occurredAt,
            actorDisplayName: internalUsers.displayName,
            beforeTitle: documentCorrectionCommands.beforeTitle,
            afterTitle: documentCorrectionCommands.afterTitle,
            beforePurpose: documentCorrectionCommands.beforePurpose,
            afterPurpose: documentCorrectionCommands.afterPurpose,
            beforeUrl: documentCorrectionCommands.beforeUrl,
            afterUrl: documentCorrectionCommands.afterUrl,
          })
          .from(documentCorrectionCommands)
          .innerJoin(
            workspaceMemberships,
            and(
              eq(
                workspaceMemberships.workspaceId,
                documentCorrectionCommands.workspaceId,
              ),
              eq(
                workspaceMemberships.id,
                documentCorrectionCommands.actorMembershipId,
              ),
            ),
          )
          .innerJoin(
            internalUsers,
            eq(internalUsers.id, workspaceMemberships.internalUserId),
          )
          .where(
            and(
              eq(documentCorrectionCommands.workspaceId, actor.workspaceId),
              eq(documentCorrectionCommands.companyId, companyId),
              eq(documentCorrectionCommands.documentId, document.id),
              // Unchanged receipts are retry evidence, not corrections.
              eq(documentCorrectionCommands.outcome, 'corrected'),
              beforeRevision === undefined
                ? undefined
                : lt(documentCorrectionCommands.revision, beforeRevision),
            ),
          )
          // A material revision is unique per Document, so the order is total.
          .orderBy(desc(documentCorrectionCommands.revision))
          .limit(CORRECTION_HISTORY_PAGE_SIZE + 1);
        const referenceReader = canReadReference(actor);
        const corrections = rows
          .slice(0, CORRECTION_HISTORY_PAGE_SIZE)
          .map((correction): DocumentCorrectionHistoryEntry => {
            const title = materialChange(
              correction.beforeTitle,
              correction.afterTitle,
            );
            const purpose = materialChange(
              correction.beforePurpose,
              correction.afterPurpose,
            );
            if (
              (correction.beforeUrl === null) !==
              (correction.afterUrl === null)
            )
              throw new Error(
                'A Document correction reference pair is incomplete.',
              );
            const url =
              correction.beforeUrl !== null && correction.afterUrl !== null
                ? materialChange(correction.beforeUrl, correction.afterUrl)
                : undefined;
            return {
              revision: correction.revision,
              occurredAt: correction.occurredAt.toISOString(),
              actor: { displayName: correction.actorDisplayName },
              changes: {
                ...(title ? { title } : {}),
                ...(purpose ? { purpose } : {}),
                ...(referenceReader && url ? { url } : {}),
              },
            };
          });
        return {
          corrections,
          nextBeforeRevision:
            rows.length > CORRECTION_HISTORY_PAGE_SIZE
              ? (corrections.at(-1)?.revision ?? null)
              : null,
        };
      },
      { isolationLevel: 'repeatable read' },
    );
  }

  /**
   * Corrects the current draft Version only: title and purpose on the
   * Document and the URL of the draft's reference. With no draft, the
   * Document is correction read-only after the delivered stale check.
   */
  async correct(
    actor: ActorContext,
    documentIdValue: unknown,
    value: unknown,
    key: string | undefined,
  ) {
    const documentId = requireUuid(documentIdValue);
    const command = correction(value);
    const idempotencyKey = requireIdempotencyKey(key);
    return this.database.transaction(async () => {
      const companyId =
        await this.authorization.requireDocumentCorrection(actor);
      const lockKey = JSON.stringify([
        'document.correction',
        actor.workspaceId,
        actor.workspaceMembershipId,
        idempotencyKey,
      ]);
      await this.database.connection.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
      );
      // Visibility is rechecked after any competing retry finishes.
      const visible = (
        await this.readReference(actor, documentId, undefined, {
          lockFamily: true,
        })
      ).document;
      if (visible.type === 'external-invoice')
        await this.authorization.requireExternalInvoiceNativeAccess(actor, {
          action: 'correct',
          lockAssignment: true,
        });
      if (visible.type !== 'questionnaire' && command.url !== undefined)
        throw new BadRequestException(
          'This Document family does not accept external references.',
        );
      const fingerprint = createHash('sha256')
        .update(JSON.stringify({ companyId, documentId, ...command }))
        .digest('hex');
      const [replay] = await this.database.connection
        .select()
        .from(documentCorrectionCommands)
        .where(
          and(
            eq(documentCorrectionCommands.workspaceId, actor.workspaceId),
            eq(
              documentCorrectionCommands.actorMembershipId,
              actor.workspaceMembershipId,
            ),
            eq(documentCorrectionCommands.idempotencyKey, idempotencyKey),
          ),
        );
      if (replay) {
        if (replay.requestFingerprint !== fingerprint)
          throw new ConflictException(
            'Idempotency-Key was already used for another correction.',
          );
        return correctionReceipt(replay);
      }

      // Match Client union/reversal lock order and reject a superseded original.
      await this.clients.lockActiveReferenceClient(actor, visible.clientId);
      // The Document row lock serializes this correction with every Version
      // command through the one working revision.
      const [current] = await this.database.connection
        .select()
        .from(workingDocuments)
        .where(
          and(
            eq(workingDocuments.workspaceId, actor.workspaceId),
            eq(workingDocuments.companyId, companyId),
            eq(workingDocuments.id, documentId),
          ),
        )
        .for('update');
      if (!current) throw new NotFoundException();
      if (
        current.workingRevision !== command.expectedRevision ||
        current.workingRevision >= MAXIMUM_REVISION
      )
        throw new ConflictException(
          'The working Document changed. Reload before correcting it.',
        );
      const working = await this.versions.workingVersion(
        {
          workspaceId: actor.workspaceId,
          companyId,
          documentId,
        },
        current.type,
      );
      if (working.status !== 'draft') throw documentVersionStateInvalid();
      const reference =
        working.documentType === 'questionnaire'
          ? {
              id: working.representation.id,
              before: working.representation.url,
              after: command.url ?? working.representation.url,
            }
          : null;
      const after = {
        title: command.title ?? current.title,
        purpose: command.purpose ?? current.purpose,
        url: reference?.after ?? null,
      };
      const changed =
        after.title !== current.title ||
        after.purpose !== current.purpose ||
        (reference !== null && reference.after !== reference.before);
      const revision = changed
        ? current.workingRevision + 1
        : current.workingRevision;
      if (changed) {
        await this.clients.recordReferenceUse(actor, current.clientId);
        await this.database.connection
          .update(workingDocuments)
          .set({
            title: after.title,
            purpose: after.purpose,
            workingRevision: revision,
          })
          .where(eq(workingDocuments.id, documentId));
        if (reference)
          await this.database.connection
            .update(documentRepresentations)
            .set({ url: reference.after })
            .where(eq(documentRepresentations.id, reference.id));
      }
      const [recorded] = await this.database.connection
        .insert(documentCorrectionCommands)
        .values({
          workspaceId: actor.workspaceId,
          companyId,
          documentId,
          actorMembershipId: actor.workspaceMembershipId,
          idempotencyKey,
          requestFingerprint: fingerprint,
          expectedRevision: command.expectedRevision,
          revision,
          outcome: changed ? 'corrected' : 'unchanged',
          beforeTitle: current.title,
          beforePurpose: current.purpose,
          beforeUrl: reference?.before ?? null,
          afterTitle: after.title,
          afterPurpose: after.purpose,
          afterUrl: after.url,
        })
        .returning();
      if (!recorded) throw new Error('Document correction was not recorded.');
      return correctionReceipt(recorded);
    });
  }
}
function materialChange(before: string, after: string) {
  return before === after ? undefined : { before, after };
}
/**
 * The only accepted query is an optional `beforeRevision`, the canonical
 * decimal form of a positive working revision.
 */
function correctionHistoryQuery(value: unknown): number | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw invalidCorrectionHistoryQuery();
  const query: Record<string, unknown> = Object.fromEntries(
    Object.entries(value),
  );
  const keys = Object.keys(query);
  if (keys.length === 0) return undefined;
  const beforeRevision = query.beforeRevision;
  if (
    keys.length !== 1 ||
    typeof beforeRevision !== 'string' ||
    !/^[1-9][0-9]{0,9}$/u.test(beforeRevision) ||
    Number(beforeRevision) > MAXIMUM_REVISION
  )
    throw invalidCorrectionHistoryQuery();
  return Number(beforeRevision);
}
function invalidCorrectionHistoryQuery(): BadRequestException {
  return new BadRequestException('Invalid correction history query.');
}
function registration(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('Document registration is required.');
  const row: Record<string, unknown> = Object.fromEntries(
    Object.entries(value),
  );
  if (row.type === 'external-invoice')
    return readExternalInvoiceRegistration(row);
  if (row.type === 'received-contract')
    return readReceivedContractRegistration(row);
  const clientId = requireUuid(row.clientId);
  const title = requiredText(row.title, 200);
  const purpose = requiredText(row.purpose, 2000);
  if (row.type === 'mission-deliverable') {
    if (
      Object.keys(row).some(
        (key) => !['type', 'clientId', 'title', 'purpose'].includes(key),
      )
    )
      throw new BadRequestException(
        'Mission deliverables do not accept external references.',
      );
    return { type: 'mission-deliverable' as const, clientId, title, purpose };
  }
  if (row.type !== undefined && row.type !== 'questionnaire')
    throw new BadRequestException('Unsupported Document family.');
  if (typeof row.url !== 'string' || !row.url.trim())
    throw new BadRequestException('An HTTPS reference is required.');
  const url = referenceUrl(row.url);
  return { type: 'questionnaire' as const, clientId, title, purpose, url };
}
function correction(value: unknown): {
  expectedRevision: number;
  title?: string;
  purpose?: string;
  url?: string;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('Document correction is required.');
  const row: Record<string, unknown> = Object.fromEntries(
    Object.entries(value),
  );
  if (
    Object.keys(row).some(
      (key) => !['expectedRevision', 'title', 'purpose', 'url'].includes(key),
    ) ||
    typeof row.expectedRevision !== 'number' ||
    !Number.isInteger(row.expectedRevision) ||
    row.expectedRevision < 1 ||
    row.expectedRevision > 2147483646 ||
    !['title', 'purpose', 'url'].some((key) => key in row)
  )
    throw new BadRequestException('Invalid Document correction.');
  return {
    expectedRevision: row.expectedRevision,
    ...('title' in row ? { title: requiredText(row.title, 200) } : {}),
    ...('purpose' in row ? { purpose: requiredText(row.purpose, 2000) } : {}),
    ...('url' in row ? { url: referenceUrl(row.url) } : {}),
  };
}
function referenceUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim())
    throw new BadRequestException('An HTTPS reference is required.');
  const urlText = value.trim();
  let url: URL;
  try {
    url = new URL(urlText);
  } catch {
    throw new BadRequestException('An HTTPS reference is required.');
  }
  if (url.protocol !== 'https:' || url.username || url.password)
    throw new BadRequestException(
      'An HTTPS reference without credentials is required.',
    );
  return url.href;
}
function requiredText(value: unknown, max: number): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.trim().length > max ||
    /[\0\uD800-\uDFFF]/u.test(value)
  )
    throw new BadRequestException('Document fields are missing or too long.');
  return value.trim();
}
function correctionReceipt(
  command: typeof documentCorrectionCommands.$inferSelect,
) {
  return {
    documentId: command.documentId,
    revision: command.revision,
    outcome: command.outcome,
  };
}
