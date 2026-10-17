import { requireQuestionnairePdfStructure } from './document-pdf-validation.js';
import { DocumentPdfStorage } from './document-pdf-storage.js';
import { DocumentMalwareScanner } from './document-malware-scanner.js';
import type {
  DocumentPdfContent,
  ValidatedQuestionnairePdf,
} from './document-pdf.types.js';
import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { ActorContext } from '../access/access.types.js';
import {
  requireIdempotencyKey,
  requireUuid,
} from '../access/access-command-validation.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { ClientOperationalReferenceService } from '../client/client-operational-reference.service.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  MAXIMUM_DOCUMENT_VERSIONS,
  documentRepresentations,
  documentVersionCommands,
  documentVersions,
  internalUsers,
  workingDocuments,
  workspaceMemberships,
} from '../database/schema/index.js';
import {
  DocumentReadBoundary,
  canReadReference,
} from './document-read-boundary.js';
import type {
  DocumentVersionReceipt,
  DocumentVersionReference,
  DocumentVersionView,
  DocumentVersionsRead,
} from './document-versions.types.js';

const MAXIMUM_EXPECTED_REVISION = 2147483646;
type RepresentationForm = DocumentVersionReference['form'];
interface RepresentationAddition {
  expectedRevision: number;
  form: RepresentationForm;
  url: string;
}

/** A Document identified inside its Workspace and responsible Company. */
export interface DocumentScope {
  workspaceId: string;
  companyId: string;
  documentId: string;
}

/**
 * The working Version: the draft if one exists, otherwise the current
 * official Version, with its ordered references.
 */
export interface WorkingVersion {
  id: string;
  status: 'draft' | 'official';
  representation: { id: string; url: string };
}

type VersionCommandAction = typeof documentVersionCommands.$inferSelect.action;
type CommandRow = typeof documentVersionCommands.$inferSelect;
type DocumentRow = typeof workingDocuments.$inferSelect;
interface VersionCommandIdentity {
  action: VersionCommandAction;
  documentId: string;
  versionId: string | null;
  expectedRevision: number;
  idempotencyKey: string;
  fingerprintBody?: Readonly<Record<string, unknown>>;
}
interface AppliedCommand {
  versionId: string;
  versionNumber: number;
  relatedVersionNumber: number | null;
  representationId?: string;
  representationForm?: DocumentVersionReference['form'];
  appendedAfterDesignation?: boolean;
}

/**
 * The Document Versions sub-capability: the formal Versions of a working
 * Document, their designation as official and the start of a new draft
 * (Document Registry PRD section 21). It owns the Version rows, each
 * Version's reference copies and the append-only Version command table, which
 * is both the durable receipt and the Activity Log event of each command.
 */
@Injectable()
export class DocumentVersionsService {
  constructor(
    private readonly authorization: CompanyContextAuthorization,
    private readonly database: DatabaseContext,
    private readonly clients: ClientOperationalReferenceService,
    private readonly boundary: DocumentReadBoundary,
    private readonly pdfs: DocumentPdfStorage,
    private readonly scanner: DocumentMalwareScanner,
  ) {}

  /**
   * The one working-Version resolution shared by the Document list, detail,
   * Project lists and working correction. Every Document keeps a draft or an
   * official Version: no Version is ever discarded, and designation always
   * leaves one official Version.
   */
  async workingVersion(scope: DocumentScope): Promise<WorkingVersion> {
    const rows = await this.database.connection
      .select({
        id: documentVersions.id,
        status: documentVersions.status,
        representationId: documentRepresentations.id,
        url: documentRepresentations.url,
      })
      .from(documentVersions)
      .innerJoin(
        documentRepresentations,
        and(
          eq(documentRepresentations.workspaceId, documentVersions.workspaceId),
          eq(documentRepresentations.companyId, documentVersions.companyId),
          eq(documentRepresentations.versionId, documentVersions.id),
        ),
      )
      .where(
        and(
          eq(documentVersions.workspaceId, scope.workspaceId),
          eq(documentVersions.companyId, scope.companyId),
          eq(documentVersions.documentId, scope.documentId),
          inArray(documentVersions.status, ['draft', 'official']),
          isNull(documentRepresentations.removedAt),
        ),
      )
      .orderBy(asc(documentRepresentations.position));
    const working =
      rows.find((row) => row.status === 'draft') ??
      rows.find((row) => row.status === 'official');
    if (
      !working ||
      (working.status !== 'draft' && working.status !== 'official')
    )
      throw new Error('The Document has no working Version.');
    return {
      id: working.id,
      status: working.status,
      representation: { id: working.representationId, url: working.url },
    };
  }

  /**
   * Every Version of a readable Document, highest number first. Refusals are
   * exactly the detail read's. Authority, visibility and the Versions share
   * one read snapshot; nothing is written.
   */
  async list(
    actor: ActorContext,
    documentIdValue: unknown,
  ): Promise<DocumentVersionsRead> {
    return this.database.transaction(
      async () => {
        const visible = await this.boundary.requireVisible(
          actor,
          documentIdValue,
        );
        const creatorMembership = alias(
          workspaceMemberships,
          'version_creator_membership',
        );
        const creator = alias(internalUsers, 'version_creator');
        const designatorMembership = alias(
          workspaceMemberships,
          'version_designator_membership',
        );
        const designator = alias(internalUsers, 'version_designator');
        const adderMembership = alias(
          workspaceMemberships,
          'representation_adder_membership',
        );
        const adder = alias(internalUsers, 'representation_adder');
        const successor = alias(documentVersions, 'version_successor');
        const rows = await this.database.connection
          .select({
            version: documentVersions,
            creatorDisplayName: creator.displayName,
            designatorDisplayName: designator.displayName,
            supersededByVersionNumber: successor.number,
            representationId: documentRepresentations.id,
            representationPosition: documentRepresentations.position,
            representationForm: documentRepresentations.form,
            representationAppendedAfterDesignation:
              documentRepresentations.appendedAfterDesignation,
            representationAddedAt: documentRepresentations.addedAt,
            representationAddedByDisplayName: adder.displayName,
            url: documentRepresentations.url,
          })
          .from(documentVersions)
          .innerJoin(
            documentRepresentations,
            and(
              eq(
                documentRepresentations.workspaceId,
                documentVersions.workspaceId,
              ),
              eq(documentRepresentations.companyId, documentVersions.companyId),
              eq(documentRepresentations.versionId, documentVersions.id),
            ),
          )
          .innerJoin(
            creatorMembership,
            and(
              eq(creatorMembership.workspaceId, documentVersions.workspaceId),
              eq(creatorMembership.id, documentVersions.createdByMembershipId),
            ),
          )
          .innerJoin(creator, eq(creator.id, creatorMembership.internalUserId))
          .innerJoin(
            adderMembership,
            and(
              eq(
                adderMembership.workspaceId,
                documentRepresentations.workspaceId,
              ),
              eq(
                adderMembership.id,
                documentRepresentations.addedByMembershipId,
              ),
            ),
          )
          .innerJoin(adder, eq(adder.id, adderMembership.internalUserId))
          .leftJoin(
            designatorMembership,
            and(
              eq(
                designatorMembership.workspaceId,
                documentVersions.workspaceId,
              ),
              eq(
                designatorMembership.id,
                documentVersions.designatedByMembershipId,
              ),
            ),
          )
          .leftJoin(
            designator,
            eq(designator.id, designatorMembership.internalUserId),
          )
          .leftJoin(
            successor,
            and(
              eq(successor.workspaceId, documentVersions.workspaceId),
              eq(successor.companyId, documentVersions.companyId),
              eq(successor.documentId, documentVersions.documentId),
              eq(successor.id, documentVersions.supersededByVersionId),
            ),
          )
          .where(
            and(
              eq(documentVersions.workspaceId, actor.workspaceId),
              eq(documentVersions.companyId, visible.companyId),
              eq(documentVersions.documentId, visible.document.id),
              isNull(documentRepresentations.removedAt),
            ),
          )
          .orderBy(
            desc(documentVersions.number),
            asc(documentRepresentations.position),
          )
          .limit(MAXIMUM_DOCUMENT_VERSIONS * 10);
        const pdfs = await this.pdfs.metadata(
          {
            workspaceId: actor.workspaceId,
            companyId: visible.companyId,
            documentId: visible.document.id,
          },
          await this.authorization.hasDocumentContentRead(actor),
        );
        const referenceReader = canReadReference(actor);
        const grouped = new Map<string, DocumentVersionView>();
        for (const row of rows) {
          const existing = grouped.get(row.version.id);
          const item = reference(
            {
              id: row.representationId,
              url: row.url,
              position: row.representationPosition,
              form: row.representationForm,
              appendedAfterDesignation:
                row.representationAppendedAfterDesignation,
              addedAt: row.representationAddedAt,
              addedByDisplayName: row.representationAddedByDisplayName,
            },
            referenceReader,
            existing === undefined,
          );
          if (existing) {
            existing.representations.push(item);
            continue;
          }
          grouped.set(
            row.version.id,
            versionView({
              version: row.version,
              creatorDisplayName: row.creatorDisplayName,
              designatorDisplayName: row.designatorDisplayName,
              supersededByVersionNumber: row.supersededByVersionNumber,
              reference: item,
              pdfContent: pdfs.get(row.version.id) ?? { state: 'absent' },
            }),
          );
        }
        return {
          workingRevision: visible.document.workingRevision,
          mutable: visible.client.status === 'active',
          versions: [...grouped.values()],
        };
      },
      { isolationLevel: 'repeatable read' },
    );
  }

  /**
   * Designates the current draft as the official Version. The Document's
   * current title and purpose are frozen onto it with its references, and the
   * previous official Version, if any, becomes superseded.
   */
  async designate(
    actor: ActorContext,
    request: {
      documentId: unknown;
      versionId: unknown;
      body: unknown;
      key: string | undefined;
    },
  ): Promise<DocumentVersionReceipt> {
    const documentId = requireUuid(request.documentId);
    const versionId = requireUuid(request.versionId);
    const expectedRevision = versionCommandBody(request.body);
    const idempotencyKey = requireIdempotencyKey(request.key);
    return this.execute(actor, {
      action: 'designated_official',
      documentId,
      versionId,
      expectedRevision,
      idempotencyKey,
      authorize: () =>
        this.authorization.requireDocumentVersionDesignation(actor),
      apply: (scope, document) =>
        this.applyDesignation(actor, scope, document, versionId),
    });
  }

  /**
   * Starts the next Version as a draft copied from the current official
   * Version's eligible references, when an official Version and no draft exist.
   */
  async startDraft(
    actor: ActorContext,
    request: { documentId: unknown; body: unknown; key: string | undefined },
  ): Promise<DocumentVersionReceipt> {
    const documentId = requireUuid(request.documentId);
    const expectedRevision = versionCommandBody(request.body);
    const idempotencyKey = requireIdempotencyKey(request.key);
    return this.execute(actor, {
      action: 'drafted',
      documentId,
      versionId: null,
      expectedRevision,
      idempotencyKey,
      authorize: () =>
        this.authorization.requireDocumentVersionManagement(actor),
      apply: (scope) => this.applyDraft(actor, scope),
    });
  }

  /** Scan outside a transaction; revalidate the same live authority and draft on commit. */
  async uploadContent(
    actor: ActorContext,
    input: {
      documentId: string;
      versionId: string;
      expectedRevision: number;
      idempotencyKey: string;
      pdf: ValidatedQuestionnairePdf;
    },
  ): Promise<DocumentVersionReceipt> {
    const command: VersionCommandIdentity = {
      action: 'representation_added',
      documentId: input.documentId,
      versionId: input.versionId,
      expectedRevision: input.expectedRevision,
      idempotencyKey: input.idempotencyKey,
      fingerprintBody: {
        form: 'other',
        fileName: input.pdf.fileName,
        size: input.pdf.size,
        sha256: input.pdf.sha256,
      },
    };
    const replay = await this.database.transaction(async () => {
      // Serialize receipt and revision reads with a concurrent commit of this
      // key. This short transaction still ends before external scanning.
      await this.lockCommandKey(actor, command.idempotencyKey);
      const { companyId, recorded } = await this.authorizePdfUpload(
        actor,
        command,
      );
      const visible = await this.boundary.requireVisible(
        actor,
        input.documentId,
      );
      const scope = {
        workspaceId: actor.workspaceId,
        companyId,
        documentId: input.documentId,
      };
      await this.requireVersionOf(scope, input.versionId);
      if (recorded) return recorded;
      await this.clients.lockActiveReferenceClient(
        actor,
        visible.document.clientId,
      );
      if (visible.document.workingRevision !== input.expectedRevision)
        throw documentRevisionConflict();
      await this.requirePdfDraft(scope, input.versionId);
      return null;
    });
    if (replay) return replay;
    const scan = await this.scanner.scan(input.pdf.bytes);
    await requireQuestionnairePdfStructure(input.pdf.bytes);
    return this.execute(actor, {
      ...command,
      authorize: async () =>
        (await this.authorizePdfUpload(actor, command)).companyId,
      apply: async (scope, document) => {
        const draft = await this.requirePdfDraft(scope, input.versionId);
        const representationId = await this.pdfs.insert({
          scope,
          versionId: input.versionId,
          membershipId: actor.workspaceMembershipId,
          uploadRevision: document.workingRevision + 1,
          pdf: input.pdf,
          scan,
        });
        return {
          versionId: draft.id,
          versionNumber: draft.number,
          relatedVersionNumber: null,
          representationId,
          representationForm: 'other',
          appendedAfterDesignation: false,
        };
      },
    });
  }

  /**
   * Live upload authority precedes an actor-key fingerprint check, including
   * Company changes. A matching receipt is released only after visibility is
   * rechecked by the caller. Repeat under execute's key lock after scanning.
   */
  private async authorizePdfUpload(
    actor: ActorContext,
    command: VersionCommandIdentity,
  ): Promise<{
    companyId: string;
    recorded: DocumentVersionReceipt | null;
  }> {
    const companyId =
      await this.authorization.requireDocumentContentUpload(actor);
    const recorded = await this.replayCommand(actor, command, companyId);
    return { companyId, recorded };
  }

  private async requirePdfDraft(scope: DocumentScope, versionId: string) {
    const version = (await this.versionsOf(scope)).find(
      (candidate) => candidate.id === versionId,
    );
    if (version?.status !== 'draft') throw documentVersionStateInvalid();
    return version;
  }

  async addRepresentation(
    actor: ActorContext,
    request: {
      documentId: unknown;
      versionId: unknown;
      body: unknown;
      key: string | undefined;
    },
  ): Promise<DocumentVersionReceipt> {
    const documentId = requireUuid(request.documentId);
    const versionId = requireUuid(request.versionId);
    const body = representationAddition(request.body);
    const idempotencyKey = requireIdempotencyKey(request.key);
    return this.execute(actor, {
      action: 'representation_added',
      documentId,
      versionId,
      expectedRevision: body.expectedRevision,
      idempotencyKey,
      fingerprintBody: { form: body.form, url: body.url },
      authorize: () =>
        this.authorization.requireDocumentVersionManagement(actor),
      apply: (scope) =>
        this.applyRepresentationAddition(actor, scope, versionId, body),
    });
  }

  async removeRepresentation(
    actor: ActorContext,
    request: {
      documentId: unknown;
      versionId: unknown;
      representationId: unknown;
      body: unknown;
      key: string | undefined;
    },
  ): Promise<DocumentVersionReceipt> {
    const documentId = requireUuid(request.documentId);
    const versionId = requireUuid(request.versionId);
    const representationId = requireUuid(request.representationId);
    const expectedRevision = versionCommandBody(request.body);
    const idempotencyKey = requireIdempotencyKey(request.key);
    return this.execute(actor, {
      action: 'representation_removed',
      documentId,
      versionId,
      expectedRevision,
      idempotencyKey,
      fingerprintBody: { representationId },
      authorize: () =>
        this.authorization.requireDocumentVersionManagement(actor),
      apply: (scope) =>
        this.applyRepresentationRemoval(
          actor,
          scope,
          versionId,
          representationId,
        ),
    });
  }

  private async lockCommandKey(
    actor: ActorContext,
    idempotencyKey: string,
  ): Promise<void> {
    const lockKey = JSON.stringify([
      'document.version',
      actor.workspaceId,
      actor.workspaceMembershipId,
      idempotencyKey,
    ]);
    await this.database.connection.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
    );
  }

  /**
   * The common command contract, in the delivered correction's order: the
   * per-actor key lock, live authority, visibility, replay, the original
   * Client lock, the Document row lock, then the revision and state checks.
   * The change, the revision increment, the Client fence advance and the
   * receipt-event commit or roll back together.
   */
  private async execute(
    actor: ActorContext,
    command: {
      action: VersionCommandAction;
      documentId: string;
      versionId: string | null;
      expectedRevision: number;
      idempotencyKey: string;
      fingerprintBody?: Readonly<Record<string, unknown>>;
      authorize: () => Promise<string>;
      apply: (
        scope: DocumentScope,
        document: DocumentRow,
      ) => Promise<AppliedCommand>;
    },
  ): Promise<DocumentVersionReceipt> {
    return this.database.transaction(async () => {
      await this.lockCommandKey(actor, command.idempotencyKey);
      const companyId = await command.authorize();
      const visible = await this.boundary.requireVisible(
        actor,
        command.documentId,
      );
      const scope: DocumentScope = {
        workspaceId: actor.workspaceId,
        companyId: visible.companyId,
        documentId: visible.document.id,
      };
      if (command.versionId !== null)
        await this.requireVersionOf(scope, command.versionId);
      const fingerprint = versionCommandFingerprint(command, companyId);
      const replay = await this.replayCommand(actor, command, companyId);
      if (replay) return replay;
      // Match the Client union/reversal lock order and refuse a superseded
      // original Client, which stays readable but read-only.
      await this.clients.lockActiveReferenceClient(
        actor,
        visible.document.clientId,
      );
      const [document] = await this.database.connection
        .select()
        .from(workingDocuments)
        .where(
          and(
            eq(workingDocuments.workspaceId, scope.workspaceId),
            eq(workingDocuments.companyId, scope.companyId),
            eq(workingDocuments.id, scope.documentId),
          ),
        )
        .for('update');
      if (!document) throw new NotFoundException();
      if (
        document.workingRevision !== command.expectedRevision ||
        document.workingRevision > MAXIMUM_EXPECTED_REVISION
      )
        throw documentRevisionConflict();
      const applied = await command.apply(scope, document);
      const revision = document.workingRevision + 1;
      await this.database.connection
        .update(workingDocuments)
        .set({ workingRevision: revision })
        .where(
          and(
            eq(workingDocuments.workspaceId, scope.workspaceId),
            eq(workingDocuments.companyId, scope.companyId),
            eq(workingDocuments.id, scope.documentId),
          ),
        );
      await this.clients.recordReferenceUse(actor, document.clientId);
      const [recorded] = await this.database.connection
        .insert(documentVersionCommands)
        .values({
          workspaceId: scope.workspaceId,
          companyId: scope.companyId,
          documentId: scope.documentId,
          action: command.action,
          versionId: applied.versionId,
          versionNumber: applied.versionNumber,
          relatedVersionNumber: applied.relatedVersionNumber,
          representationId: applied.representationId,
          representationForm: applied.representationForm,
          appendedAfterDesignation: applied.appendedAfterDesignation,
          actorMembershipId: actor.workspaceMembershipId,
          idempotencyKey: command.idempotencyKey,
          requestFingerprint: fingerprint,
          expectedRevision: command.expectedRevision,
          revision,
        })
        .returning();
      if (!recorded) throw new Error('The Version command was not recorded.');
      return receipt(recorded);
    });
  }

  private async replayCommand(
    actor: ActorContext,
    command: VersionCommandIdentity,
    companyId: string,
  ): Promise<DocumentVersionReceipt | null> {
    const [recorded] = await this.database.connection
      .select()
      .from(documentVersionCommands)
      .where(
        and(
          eq(documentVersionCommands.workspaceId, actor.workspaceId),
          eq(
            documentVersionCommands.actorMembershipId,
            actor.workspaceMembershipId,
          ),
          eq(documentVersionCommands.idempotencyKey, command.idempotencyKey),
        ),
      );
    if (!recorded) return null;
    if (
      recorded.requestFingerprint !==
      versionCommandFingerprint(command, companyId)
    )
      throw new ConflictException(
        'Idempotency-Key was already used for another Version command.',
      );
    return receipt(recorded);
  }

  /** A Version of another Document is the detail read's safe not-found. */
  private async requireVersionOf(
    scope: DocumentScope,
    versionId: string,
  ): Promise<void> {
    const [version] = await this.database.connection
      .select({ id: documentVersions.id })
      .from(documentVersions)
      .where(
        and(
          eq(documentVersions.workspaceId, scope.workspaceId),
          eq(documentVersions.companyId, scope.companyId),
          eq(documentVersions.documentId, scope.documentId),
          eq(documentVersions.id, versionId),
        ),
      );
    if (!version) throw new NotFoundException();
  }

  private async applyDesignation(
    actor: ActorContext,
    scope: DocumentScope,
    document: DocumentRow,
    versionId: string,
  ): Promise<AppliedCommand> {
    const versions = await this.versionsOf(scope);
    const draft = versions.find((version) => version.id === versionId);
    if (draft?.status !== 'draft') throw documentVersionStateInvalid();
    const official = versions.find((version) => version.status === 'official');
    // The previous official Version is superseded first, so at no statement
    // does the Document hold two official Versions.
    if (official)
      await this.database.connection
        .update(documentVersions)
        .set({
          status: 'superseded',
          supersededAt: sql`now()`,
          supersededByVersionId: draft.id,
        })
        .where(eq(documentVersions.id, official.id));
    await this.database.connection
      .update(documentVersions)
      .set({
        status: 'official',
        designatedByMembershipId: actor.workspaceMembershipId,
        designatedAt: sql`now()`,
        frozenTitle: document.title,
        frozenPurpose: document.purpose,
      })
      .where(eq(documentVersions.id, draft.id));
    return {
      versionId: draft.id,
      versionNumber: draft.number,
      relatedVersionNumber: official?.number ?? null,
    };
  }

  private async applyDraft(
    actor: ActorContext,
    scope: DocumentScope,
  ): Promise<AppliedCommand> {
    const versions = await this.versionsOf(scope);
    const official = versions.find((version) => version.status === 'official');
    if (!official || versions.some((version) => version.status === 'draft'))
      throw documentVersionStateInvalid();
    if (versions.length >= MAXIMUM_DOCUMENT_VERSIONS)
      throw new ConflictException({
        code: 'document_version_capacity_exceeded',
        message: 'This Document cannot hold another Version.',
      });
    const officialReferences = await this.database.connection
      .select({
        position: documentRepresentations.position,
        form: documentRepresentations.form,
        url: documentRepresentations.url,
      })
      .from(documentRepresentations)
      .where(
        and(
          eq(documentRepresentations.workspaceId, scope.workspaceId),
          eq(documentRepresentations.companyId, scope.companyId),
          eq(documentRepresentations.versionId, official.id),
          eq(documentRepresentations.appendedAfterDesignation, false),
          isNull(documentRepresentations.removedAt),
        ),
      )
      .orderBy(asc(documentRepresentations.position));
    if (officialReferences.length === 0)
      throw new Error('The official Version has no reference.');
    const number = Math.max(...versions.map((version) => version.number)) + 1;
    const [draft] = await this.database.connection
      .insert(documentVersions)
      .values({
        workspaceId: scope.workspaceId,
        companyId: scope.companyId,
        documentId: scope.documentId,
        number,
        status: 'draft',
        createdByMembershipId: actor.workspaceMembershipId,
      })
      .returning({
        id: documentVersions.id,
        createdAt: documentVersions.createdAt,
      });
    if (!draft) throw new Error('The draft Version was not created.');
    await this.database.connection.insert(documentRepresentations).values(
      officialReferences.map((reference, index) => ({
        workspaceId: scope.workspaceId,
        companyId: scope.companyId,
        versionId: draft.id,
        position: index + 1,
        form: reference.form,
        url: reference.url,
        addedByMembershipId: actor.workspaceMembershipId,
        addedAt: draft.createdAt,
        appendedAfterDesignation: false,
      })),
    );
    return {
      versionId: draft.id,
      versionNumber: number,
      relatedVersionNumber: official.number,
    };
  }

  private async applyRepresentationAddition(
    actor: ActorContext,
    scope: DocumentScope,
    versionId: string,
    addition: RepresentationAddition,
  ): Promise<AppliedCommand> {
    const versions = await this.versionsOf(scope);
    const version = versions.find((candidate) => candidate.id === versionId);
    if (!version || version.status === 'superseded')
      throw documentVersionStateInvalid();
    const references = await this.referencesOf(scope, versionId);
    const maximum = version.status === 'draft' ? 5 : 10;
    if (
      references.filter((reference) => reference.removedAt === null).length >=
      maximum
    )
      throw representationCapacityExceeded();
    const nextPosition =
      references.reduce(
        (maximumPosition, reference) =>
          Math.max(maximumPosition, reference.position),
        0,
      ) + 1;
    const appendedAfterDesignation = version.status === 'official';
    const [created] = await this.database.connection
      .insert(documentRepresentations)
      .values({
        workspaceId: scope.workspaceId,
        companyId: scope.companyId,
        versionId,
        position: nextPosition,
        form: addition.form,
        url: addition.url,
        addedByMembershipId: actor.workspaceMembershipId,
        appendedAfterDesignation,
      })
      .returning({ id: documentRepresentations.id });
    if (!created) throw new Error('The reference was not created.');
    return {
      versionId,
      versionNumber: version.number,
      relatedVersionNumber: null,
      representationId: created.id,
      representationForm: addition.form,
      appendedAfterDesignation,
    };
  }

  private async applyRepresentationRemoval(
    actor: ActorContext,
    scope: DocumentScope,
    versionId: string,
    representationId: string,
  ): Promise<AppliedCommand> {
    const versions = await this.versionsOf(scope);
    const version = versions.find((candidate) => candidate.id === versionId);
    if (!version) throw new NotFoundException();
    if (version.status !== 'draft') throw documentVersionStateInvalid();
    const references = await this.referencesOf(scope, versionId);
    const current = references.filter(
      (reference) => reference.removedAt === null,
    );
    const target = current.find(
      (reference) => reference.id === representationId,
    );
    if (!target) throw new NotFoundException();
    if (current.length === 1) throw documentVersionStateInvalid();
    await this.database.connection
      .update(documentRepresentations)
      .set({
        removedByMembershipId: actor.workspaceMembershipId,
        removedAt: sql`now()`,
      })
      .where(eq(documentRepresentations.id, target.id));
    return {
      versionId,
      versionNumber: version.number,
      relatedVersionNumber: null,
      representationId: target.id,
      representationForm: target.form,
      appendedAfterDesignation: false,
    };
  }

  private referencesOf(scope: DocumentScope, versionId: string) {
    return this.database.connection
      .select({
        id: documentRepresentations.id,
        position: documentRepresentations.position,
        form: documentRepresentations.form,
        removedAt: documentRepresentations.removedAt,
      })
      .from(documentRepresentations)
      .where(
        and(
          eq(documentRepresentations.workspaceId, scope.workspaceId),
          eq(documentRepresentations.companyId, scope.companyId),
          eq(documentRepresentations.versionId, versionId),
        ),
      );
  }

  private versionsOf(scope: DocumentScope) {
    return this.database.connection
      .select({
        id: documentVersions.id,
        number: documentVersions.number,
        status: documentVersions.status,
      })
      .from(documentVersions)
      .where(
        and(
          eq(documentVersions.workspaceId, scope.workspaceId),
          eq(documentVersions.companyId, scope.companyId),
          eq(documentVersions.documentId, scope.documentId),
        ),
      );
  }
}

/** A stale `expectedRevision`: nothing is written. */
export function documentRevisionConflict(): ConflictException {
  return new ConflictException({
    code: 'document_revision_conflict',
    message: 'The Document changed. Reload it before changing its Versions.',
  });
}

/** A state precondition that fails at the observed revision. */
export function documentVersionStateInvalid(): ConflictException {
  return new ConflictException({
    code: 'document_version_state_invalid',
    message:
      'This change is not possible for the Document as it is now. Reload it.',
  });
}

function representationCapacityExceeded(): ConflictException {
  return new ConflictException({
    code: 'document_representation_capacity_exceeded',
    message: 'This Version cannot hold another reference.',
  });
}

function representationAddition(value: unknown): RepresentationAddition {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw invalidVersionCommand();
  const row: Record<string, unknown> = Object.fromEntries(
    Object.entries(value),
  );
  if (
    Object.keys(row).some(
      (key) => !['expectedRevision', 'form', 'url'].includes(key),
    ) ||
    Object.keys(row).length !== 3
  )
    throw invalidVersionCommand();
  const expectedRevision = versionCommandBody({
    expectedRevision: row.expectedRevision,
  });
  if (!isRepresentationForm(row.form)) throw invalidVersionCommand();
  return {
    expectedRevision,
    form: row.form,
    url: representationUrl(row.url),
  };
}

function isRepresentationForm(value: unknown): value is RepresentationForm {
  return (
    value === 'editable' ||
    value === 'rendered' ||
    value === 'signed' ||
    value === 'other'
  );
}

function representationUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw invalidVersionCommand();
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw invalidVersionCommand();
  }
  if (url.protocol !== 'https:' || url.username || url.password)
    throw invalidVersionCommand();
  return url.href;
}

/** The only accepted body is `{ expectedRevision }` in the delivered range. */
function versionCommandBody(value: unknown): number {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw invalidVersionCommand();
  const row: Record<string, unknown> = Object.fromEntries(
    Object.entries(value),
  );
  const expectedRevision = row.expectedRevision;
  if (
    Object.keys(row).some((key) => key !== 'expectedRevision') ||
    typeof expectedRevision !== 'number' ||
    !Number.isInteger(expectedRevision) ||
    expectedRevision < 1 ||
    expectedRevision > MAXIMUM_EXPECTED_REVISION
  )
    throw invalidVersionCommand();
  return expectedRevision;
}

function invalidVersionCommand(): BadRequestException {
  return new BadRequestException('Invalid Document Version command.');
}

function receipt(command: CommandRow): DocumentVersionReceipt {
  switch (command.action) {
    case 'designated_official':
      return {
        documentId: command.documentId,
        workingRevision: command.revision,
        action: 'designated_official',
        versionId: command.versionId,
        versionNumber: command.versionNumber,
        supersededVersionNumber: command.relatedVersionNumber,
      };
    case 'drafted':
      if (command.relatedVersionNumber === null)
        throw new Error('A drafted Version receipt has no source Version.');
      return {
        documentId: command.documentId,
        workingRevision: command.revision,
        action: 'drafted',
        versionId: command.versionId,
        versionNumber: command.versionNumber,
        sourceVersionNumber: command.relatedVersionNumber,
      };
    case 'representation_added':
      if (
        command.representationId === null ||
        command.appendedAfterDesignation === null
      )
        throw new Error('An added-reference receipt is incomplete.');
      return {
        documentId: command.documentId,
        workingRevision: command.revision,
        action: 'representation_added',
        versionId: command.versionId,
        versionNumber: command.versionNumber,
        representationId: command.representationId,
        appendedAfterDesignation: command.appendedAfterDesignation,
      };
    case 'representation_removed':
      if (
        command.representationId === null ||
        command.appendedAfterDesignation !== false
      )
        throw new Error('A removed-reference receipt is incomplete.');
      return {
        documentId: command.documentId,
        workingRevision: command.revision,
        action: 'representation_removed',
        versionId: command.versionId,
        versionNumber: command.versionNumber,
        representationId: command.representationId,
      };
    default:
      return assertNever(command.action);
  }
}

function reference(
  representation: {
    id: string;
    url: string;
    position: number;
    form: RepresentationForm;
    appendedAfterDesignation: boolean;
    addedAt: Date;
    addedByDisplayName: string;
  },
  referenceReader: boolean,
  primary: boolean,
): DocumentVersionReference {
  const base = {
    id: representation.id,
    kind: 'external-reference',
    verification: 'unverified',
    position: representation.position,
    form: representation.form,
    primary,
    appendedAfterDesignation: representation.appendedAfterDesignation,
    addedAt: representation.addedAt.toISOString(),
    addedBy: { displayName: representation.addedByDisplayName },
  } as const;
  return referenceReader
    ? { ...base, access: 'granted', url: representation.url }
    : { ...base, access: 'denied' };
}

/**
 * Stored rows are untrusted: a designated Version without its designation or
 * supersession fails the read instead of rendering a partial record.
 */
function versionView(row: {
  version: typeof documentVersions.$inferSelect;
  creatorDisplayName: string;
  designatorDisplayName: string | null;
  supersededByVersionNumber: number | null;
  reference: DocumentVersionReference;
  pdfContent: DocumentPdfContent;
}): DocumentVersionView {
  const { version } = row;
  const base = {
    id: version.id,
    number: version.number,
    createdAt: version.createdAt.toISOString(),
    createdBy: { displayName: row.creatorDisplayName },
    representations: [row.reference],
    pdfContent: row.pdfContent,
  };
  switch (version.status) {
    case 'draft':
      return { ...base, status: 'draft' };
    case 'official':
      return { ...base, status: 'official', ...designation(row) };
    case 'superseded': {
      if (
        version.supersededAt === null ||
        row.supersededByVersionNumber === null
      )
        throw new Error('A superseded Version has no supersession.');
      return {
        ...base,
        status: 'superseded',
        ...designation(row),
        supersededAt: version.supersededAt.toISOString(),
        supersededByVersionNumber: row.supersededByVersionNumber,
      };
    }
    default:
      return assertNever(version.status);
  }
}

function designation(row: {
  version: typeof documentVersions.$inferSelect;
  designatorDisplayName: string | null;
}) {
  const { designatedAt, frozenTitle, frozenPurpose } = row.version;
  if (
    designatedAt === null ||
    frozenTitle === null ||
    frozenPurpose === null ||
    row.designatorDisplayName === null
  )
    throw new Error('A designated Version has no designation.');
  return {
    designatedAt: designatedAt.toISOString(),
    designatedBy: { displayName: row.designatorDisplayName },
    frozen: { title: frozenTitle, purpose: frozenPurpose },
  };
}

function assertNever(value: never): never {
  throw new Error(`Unexpected Document Version value: ${String(value)}`);
}

function versionCommandFingerprint(
  command: VersionCommandIdentity,
  companyId: string,
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        companyId,
        documentId: command.documentId,
        versionId: command.versionId,
        action: command.action,
        expectedRevision: command.expectedRevision,
        ...command.fingerprintBody,
      }),
    )
    .digest('hex');
}
