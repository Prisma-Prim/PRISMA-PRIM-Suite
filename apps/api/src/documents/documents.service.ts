import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, lt, sql } from 'drizzle-orm';
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
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ companyId, ...command }))
      .digest('hex');
    return this.database.transaction(async () => {
      await this.authorization.requireDocumentAccess(actor, true);
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
      await this.clients.recordReferenceUse(actor, command.clientId);
      const [document] = await this.database.connection
        .insert(workingDocuments)
        .values({
          workspaceId: actor.workspaceId,
          companyId,
          clientId: command.clientId,
          title: command.title,
          purpose: command.purpose,
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
  async list(actor: ActorContext): Promise<WorkingDocument[]> {
    const companyId = requireDocumentPermission(actor, 'document.read');
    await this.authorization.requireDocumentAccess(actor);
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
  ): Promise<{ document: WorkingDocument; projectId: string | null }> {
    const visible = await this.boundary.requireVisible(actor, idValue);
    const { companyId, document: row, client } = visible;
    const working = await this.versions.workingVersion({
      workspaceId: row.workspaceId,
      companyId,
      documentId: row.id,
    });
    const clientDossierId = (
      resolvedDossierIds ?? (await this.clientDossierIds(actor, [row.clientId]))
    ).get(row.clientId);
    const representation = {
      id: working.representation.id,
      kind: 'external-reference',
      verification: 'unverified',
    } as const;
    const document: WorkingDocument = {
      id: row.id,
      workspaceId: row.workspaceId,
      companyId,
      clientId: row.clientId,
      ...(clientDossierId ? { clientDossierId } : {}),
      clientDisplayName: client.displayName,
      title: row.title,
      purpose: row.purpose,
      type: 'questionnaire',
      confidentiality: 'company-confidential',
      createdAt: row.createdAt.toISOString(),
      createdByMembershipId: row.createdByMembershipId,
      workingRevision: row.workingRevision,
      // Only a draft is corrected, and only while the original Client is active.
      correction:
        client.status === 'active' && working.status === 'draft'
          ? 'allowed'
          : 'read-only',
      version: {
        id: working.id,
        status: working.status,
        representation: canReadReference(actor)
          ? {
              ...representation,
              access: 'granted',
              url: working.representation.url,
            }
          : { ...representation, access: 'denied' },
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
            const url = materialChange(
              correction.beforeUrl,
              correction.afterUrl,
            );
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
      const visible = await this.read(actor, documentId);
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
      const working = await this.versions.workingVersion({
        workspaceId: actor.workspaceId,
        companyId,
        documentId,
      });
      if (working.status !== 'draft') throw documentVersionStateInvalid();
      const after = {
        title: command.title ?? current.title,
        purpose: command.purpose ?? current.purpose,
        url: command.url ?? working.representation.url,
      };
      const changed =
        after.title !== current.title ||
        after.purpose !== current.purpose ||
        after.url !== working.representation.url;
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
        await this.database.connection
          .update(documentRepresentations)
          .set({ url: after.url })
          .where(eq(documentRepresentations.id, working.representation.id));
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
          beforeUrl: working.representation.url,
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
  const clientId = requireUuid(row.clientId);
  const title = requiredText(row.title, 200);
  const purpose = requiredText(row.purpose, 2000);
  if (typeof row.url !== 'string' || !row.url.trim())
    throw new BadRequestException('An HTTPS reference is required.');
  const url = referenceUrl(row.url);
  return { clientId, title, purpose, url };
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
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
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
