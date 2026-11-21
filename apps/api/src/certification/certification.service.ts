import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, count, desc, eq, getTableColumns } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import {
  requireIdempotencyKey,
  requireUuid,
} from '../access/access-command-validation.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { SERVER_CLOCK, type ServerClock } from '../clock/server-clock.js';
import { commandFingerprint } from '../command/idempotent-command.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  certificationCaseDocuments,
  certificationCases,
  certificationStepVersions,
} from '../database/schema/certification.js';
import { clientLegalEntities } from '../database/schema/client-legal-entity.js';
import { workingDocuments } from '../database/schema/documents.js';
import { ProjectService } from '../project/project.service.js';
import { DocumentWorkingEvidenceReferenceService } from '../documents/document-working-evidence-reference.service.js';
import {
  proposeForApplication,
  roundToHundredths,
  type DurationResult,
} from './certification-duration.js';
import {
  cents,
  durationCommand,
  durationFactorInputs,
} from './certification-duration.validation.js';
import {
  certificationRegister,
  registerLanguage,
} from './certification-register.js';
import { renderCertificationRegister } from './certification-register-pdf.js';
import type {
  CertificationDocumentRegister,
  CertificationEligibleDocuments,
  DurationDetermination,
  CertificationCaseDetail,
  CertificationCaseList,
  CertificationCaseSummary,
  CertificationLegalEntityOptions,
  CertificationTimeline,
} from './certification.types.js';
import {
  attachCommand,
  applicationCommand,
  openCommand,
  reviewCommand,
} from './certification.validation.js';
import { CertificationCaseTransactions } from './certification-case-transactions.js';
import { CertificationCaseReadModel } from './certification-case-read-model.js';
import {
  requireUndecided,
  latest,
  stepConflict,
  attachment,
  stepVersion,
} from './certification-case-versions.js';

const CASE_LIST_LIMIT = 100;

const TIMELINE_LIMIT = 500;

/** Owns Case intake, document access and public Case reads. */
@Injectable()
export class CertificationService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly accountability: AccountabilityService,
    private readonly projects: ProjectService,
    private readonly sources: DocumentWorkingEvidenceReferenceService,
    @Inject(SERVER_CLOCK) private readonly clock: ServerClock,
    private readonly transactions: CertificationCaseTransactions,
    private readonly repository: CertificationCaseReadModel,
  ) {}

  open({
    actor,
    projectId,
    body,
    key,
  }: {
    actor: ActorContext;
    projectId: string;
    body: unknown;
    key: string | undefined;
  }): Promise<unknown> {
    const idempotencyKey = requireIdempotencyKey(key);
    const targetProjectId = requireUuid(projectId);
    return this.transactions.command({
      actor,
      kind: 'open',
      key: idempotencyKey,
      fingerprint: commandFingerprint({ projectId, body }),
      execute: async (companyId) => {
        const input = openCommand(body);
        const project = await this.projects.missionContextWithinTransaction({
          actor,
          projectId: targetProjectId,
          lock: true,
        });
        const [entity] = await this.database.connection
          .select({ id: clientLegalEntities.id })
          .from(clientLegalEntities)
          .where(
            and(
              eq(clientLegalEntities.workspaceId, actor.workspaceId),
              eq(clientLegalEntities.clientAccountId, project.clientAccountId),
              eq(clientLegalEntities.id, input.clientLegalEntityId),
            ),
          );
        if (!entity) throw new NotFoundException();
        const [taken] = await this.database.connection
          .select({ id: certificationCases.id })
          .from(certificationCases)
          .where(
            and(
              eq(certificationCases.workspaceId, actor.workspaceId),
              eq(certificationCases.companyId, companyId),
              eq(certificationCases.orderReference, input.orderReference),
            ),
          );
        if (taken)
          throw new ConflictException({
            code: 'CERTIFICATION_ORDER_REFERENCE_TAKEN',
            message: 'This order reference is already used in the Company.',
          });
        const now = this.clock.now();
        const [row] = await this.database.connection
          .insert(certificationCases)
          .values({
            workspaceId: actor.workspaceId,
            companyId,
            projectId: targetProjectId,
            clientAccountId: project.clientAccountId,
            clientLegalEntityId: entity.id,
            orderReference: input.orderReference,
            standard: 'iso_22000_2018',
            auditType: 'initial_certification',
            status: 'open',
            revision: 1,
            openedByMembershipId: actor.workspaceMembershipId,
            openedByInternalUserId: actor.internalUserId,
            openedByDisplayName: actor.displayName,
            openedAt: now,
          })
          .returning();
        if (!row) throw new InternalServerErrorException();
        await this.accountability.recordCertificationEvent({
          actor,
          companyId,
          caseId: row.id,
          revision: 1,
          occurredAt: now,
          action: 'certification_case.opened',
          metadata: { revision: 1 },
        });
        return { caseId: row.id, at: now };
      },
    });
  }

  recordApplication({
    actor,
    caseId,
    body,
    key,
  }: {
    actor: ActorContext;
    caseId: string;
    body: unknown;
    key: string | undefined;
  }): Promise<unknown> {
    const idempotencyKey = requireIdempotencyKey(key);
    const targetId = requireUuid(caseId);
    return this.transactions.command({
      actor,
      kind: 'application',
      key: idempotencyKey,
      fingerprint: commandFingerprint({ caseId, body }),
      execute: async (companyId) => {
        const input = applicationCommand(body);
        const current = await this.repository.lockOpenCase(
          actor,
          companyId,
          targetId,
          input.expectedRevision,
        );
        const steps = await this.repository.steps(actor, companyId, targetId);
        // An accepted application stays correctable, with a reason, until the
        // decision: the Dossier Consistency Check compares what changed (R01).
        requireUndecided(steps);
        const previous = latest(steps, 'application');
        const version = (previous?.version ?? 0) + 1;
        if ((version === 1) !== (input.reason === null))
          throw stepConflict(
            'CERTIFICATION_CORRECTION_REASON',
            'A correction states its reason; a first application has none.',
          );
        return this.transactions.appendStep({
          actor,
          companyId,
          current,
          step: 'application',
          version,
          replaces: previous,
          payload: input.facts,
          reason: input.reason,
          action: 'certification_case.application_recorded',
          metadata: { version },
        });
      },
    });
  }

  reviewApplication({
    actor,
    caseId,
    body,
    key,
  }: {
    actor: ActorContext;
    caseId: string;
    body: unknown;
    key: string | undefined;
  }): Promise<unknown> {
    const idempotencyKey = requireIdempotencyKey(key);
    const targetId = requireUuid(caseId);
    return this.transactions.command({
      actor,
      kind: 'application_review',
      key: idempotencyKey,
      fingerprint: commandFingerprint({ caseId, body }),
      execute: async (companyId) => {
        const input = reviewCommand(body);
        const current = await this.repository.lockOpenCase(
          actor,
          companyId,
          targetId,
          input.expectedRevision,
        );
        const steps = await this.repository.steps(actor, companyId, targetId);
        if (!latest(steps, 'application'))
          throw stepConflict(
            'CERTIFICATION_APPLICATION_MISSING',
            'Record the application before reviewing it.',
          );
        if (latest(steps, 'application_review'))
          throw stepConflict(
            'CERTIFICATION_APPLICATION_ALREADY_REVIEWED',
            'The application has already been reviewed.',
          );
        await this.transactions.requireAct(
          actor,
          companyId,
          targetId,
          input.review.onBehalf,
        );
        return this.transactions.appendStep({
          actor,
          companyId,
          current,
          step: 'application_review',
          version: 1,
          payload: input.review,
          reason: null,
          action: 'certification_case.application_reviewed',
          metadata: { outcome: input.review.outcome },
          status: input.review.outcome === 'rejected' ? 'rejected' : 'open',
        });
      },
    });
  }

  /** A read: computes the proposal from the accepted application and the given factors. */
  durationProposal({
    actor,
    caseId,
    body,
  }: {
    actor: ActorContext;
    caseId: string;
    body: unknown;
  }): Promise<DurationResult> {
    const targetId = requireUuid(caseId);
    return this.transactions.read(
      actor,
      'programme_manager',
      async (companyId) => {
        const factors = durationFactorInputs(body);
        await this.repository.visibleCase(actor, companyId, targetId);
        const facts = this.transactions.acceptedApplication(
          await this.repository.steps(actor, companyId, targetId),
        );
        return proposeForApplication(facts, factors);
      },
    );
  }

  confirmDuration({
    actor,
    caseId,
    body,
    key,
  }: {
    actor: ActorContext;
    caseId: string;
    body: unknown;
    key: string | undefined;
  }): Promise<unknown> {
    const idempotencyKey = requireIdempotencyKey(key);
    const targetId = requireUuid(caseId);
    return this.transactions.command({
      actor,
      kind: 'duration',
      key: idempotencyKey,
      fingerprint: commandFingerprint({ caseId, body }),
      execute: async (companyId) => {
        const input = durationCommand(body);
        const current = await this.repository.lockOpenCase(
          actor,
          companyId,
          targetId,
          input.expectedRevision,
        );
        const steps = await this.repository.steps(actor, companyId, targetId);
        requireUndecided(steps);
        const facts = this.transactions.acceptedApplication(steps);
        const previous = latest(steps, 'duration');
        const version = (previous?.version ?? 0) + 1;
        if ((version === 1) !== (input.reason === null))
          throw stepConflict(
            'CERTIFICATION_CORRECTION_REASON',
            'A correction states its reason; a first determination has none.',
          );
        await this.transactions.requireAct(
          actor,
          companyId,
          targetId,
          input.onBehalf,
        );
        const result = proposeForApplication(facts, input.inputs);
        if (result.kind === 'refused')
          throw new BadRequestException({
            code: 'CERTIFICATION_DURATION_REFUSED',
            message: 'The duration inputs are inconsistent.',
            refusals: result.refusals,
          });
        const factorsUsed =
          Object.values(input.inputs.increases).some((value) => value > 0) ||
          Object.values(input.inputs.reductions).some((value) => value > 0);
        const differs =
          result.kind === 'manual' ||
          differsFromProposal(input.confirmed, result.proposal);
        if ((factorsUsed || differs) && input.justification === null)
          throw new BadRequestException({
            code: 'CERTIFICATION_DURATION_JUSTIFICATION_REQUIRED',
            message:
              'Justify adjustment factors and any value other than the proposal.',
          });
        const determination: DurationDetermination = {
          ruleVersion: 'iso22000-basic-2026-11',
          inputs: {
            ...input.inputs,
            subcategories: facts.foodChainSubcategories,
            effectiveFte: facts.effectiveFte,
          },
          computation: result,
          confirmed: input.confirmed,
          justification: input.justification,
          onBehalf: input.onBehalf,
        };
        return this.transactions.appendStep({
          actor,
          companyId,
          current,
          step: 'duration',
          version,
          replaces: previous,
          payload: determination,
          reason: input.reason,
          action: 'certification_case.duration_confirmed',
          metadata: { version },
        });
      },
    });
  }

  /** Attaches one exact frozen received PDF of the Case's Client, with its role. */
  attachDocument({
    actor,
    caseId,
    body,
    key,
  }: {
    actor: ActorContext;
    caseId: string;
    body: unknown;
    key: string | undefined;
  }): Promise<unknown> {
    const idempotencyKey = requireIdempotencyKey(key);
    const targetId = requireUuid(caseId);
    return this.transactions.command({
      actor,
      kind: 'document',
      key: idempotencyKey,
      fingerprint: commandFingerprint({ caseId, body }),
      execute: async (companyId) => {
        const input = attachCommand(body);
        const current = await this.repository.lockOpenCase(
          actor,
          companyId,
          targetId,
          input.expectedRevision,
          ['open', 'certified'],
        );
        if (
          current.status === 'certified' &&
          ![
            'certificate',
            'certificate_data',
            'evidence',
            'other',
            'correspondence',
          ].includes(input.role)
        )
          throw stepConflict(
            'CERTIFICATION_CASE_CLOSED',
            'Only revision and transmission evidence is attached after issuance.',
          );
        const source = await this.sources.qualifyWithinWriteTransaction({
          actor,
          context: { companyId, originalClientId: current.clientAccountId },
          documentId: input.documentId,
          versionId: input.versionId,
          representationId: input.representationId,
        });
        const [duplicate] = await this.database.connection
          .select({ id: certificationCaseDocuments.id })
          .from(certificationCaseDocuments)
          .where(
            and(
              eq(certificationCaseDocuments.workspaceId, actor.workspaceId),
              eq(certificationCaseDocuments.companyId, companyId),
              eq(certificationCaseDocuments.caseId, targetId),
              eq(certificationCaseDocuments.documentId, input.documentId),
              eq(certificationCaseDocuments.versionId, input.versionId),
              eq(
                certificationCaseDocuments.representationId,
                input.representationId,
              ),
            ),
          );
        if (duplicate)
          throw stepConflict(
            'CERTIFICATION_DOCUMENT_ALREADY_ATTACHED',
            'This exact document version is already attached to the Case.',
          );
        const now = this.clock.now();
        const revision = current.revision + 1;
        await this.database.connection
          .insert(certificationCaseDocuments)
          .values({
            workspaceId: actor.workspaceId,
            companyId,
            caseId: targetId,
            caseRevision: revision,
            role: input.role,
            documentId: source.documentId,
            versionId: source.versionId,
            representationId: source.representationId,
            versionNumber: source.versionNumber,
            sourceTitle: source.sourceTitle,
            fileName: source.filename,
            sizeBytes: source.sizeBytes,
            sha256: source.sha256,
            note: input.note,
            actorMembershipId: actor.workspaceMembershipId,
            actorInternalUserId: actor.internalUserId,
            actorDisplayName: actor.displayName,
            attachedAt: now,
          });
        return this.transactions.advance({
          actor,
          companyId,
          current,
          at: now,
          action: 'certification_case.document_attached',
          metadata: { role: input.role },
        });
      },
    });
  }

  documents({
    actor,
    caseId,
  }: {
    actor: ActorContext;
    caseId: string;
  }): Promise<CertificationDocumentRegister> {
    const targetId = requireUuid(caseId);
    return this.transactions.read(actor, 'reader', async (companyId) => {
      await this.repository.visibleCase(actor, companyId, targetId);
      const rows = await this.database.connection
        .select()
        .from(certificationCaseDocuments)
        .where(
          and(
            eq(certificationCaseDocuments.workspaceId, actor.workspaceId),
            eq(certificationCaseDocuments.companyId, companyId),
            eq(certificationCaseDocuments.caseId, targetId),
          ),
        )
        .orderBy(asc(certificationCaseDocuments.caseRevision))
        .limit(TIMELINE_LIMIT);
      return { caseId: targetId, items: rows.map(attachment) };
    });
  }

  /** The exact preserved bytes of one attachment, under current Case and Document authority. */
  documentContent({
    actor,
    caseId,
    attachmentId,
  }: {
    actor: ActorContext;
    caseId: string;
    attachmentId: string;
  }): Promise<{ bytes: Buffer; fileName: string }> {
    const targetId = requireUuid(caseId);
    const targetAttachment = requireUuid(attachmentId);
    return this.transactions.read(actor, 'reader', async (companyId) => {
      const row = await this.repository.visibleCase(actor, companyId, targetId);
      const [attached] = await this.database.connection
        .select()
        .from(certificationCaseDocuments)
        .where(
          and(
            eq(certificationCaseDocuments.workspaceId, actor.workspaceId),
            eq(certificationCaseDocuments.companyId, companyId),
            eq(certificationCaseDocuments.caseId, targetId),
            eq(certificationCaseDocuments.id, targetAttachment),
          ),
        );
      if (!attached) throw new NotFoundException();
      const source = await this.sources.readExactWithinReadTransaction({
        actor,
        context: { companyId, originalClientId: row.clientAccountId },
        documentId: attached.documentId,
        versionId: attached.versionId,
        representationId: attached.representationId,
      });
      if (source.sha256 !== attached.sha256)
        throw new InternalServerErrorException(
          'The attached document no longer matches its recorded digest.',
        );
      return { bytes: source.bytes, fileName: attached.fileName };
    });
  }

  /** Frozen received PDFs of the Case's Client that may be attached. */
  eligibleDocuments({
    actor,
    caseId,
  }: {
    actor: ActorContext;
    caseId: string;
  }): Promise<CertificationEligibleDocuments> {
    const targetId = requireUuid(caseId);
    return this.transactions.read(
      actor,
      'programme_manager',
      async (companyId) => {
        const row = await this.repository.visibleCase(
          actor,
          companyId,
          targetId,
        );
        const rows = await this.sources.eligibleWithinReadTransaction({
          actor,
          context: { companyId, originalClientId: row.clientAccountId },
          after: null,
          limit: 26,
        });
        return {
          caseId: targetId,
          items: rows.slice(0, 25).map((item) => ({
            documentId: item.documentId,
            versionId: item.versionId,
            versionNumber: item.versionNumber,
            representationId: item.representationId,
            sourceTitle: item.sourceTitle,
          })),
          truncated: rows.length > 25,
        };
      },
    );
  }

  list({
    actor,
    projectId,
  }: {
    actor: ActorContext;
    projectId: string;
  }): Promise<CertificationCaseList> {
    const targetProjectId = requireUuid(projectId);
    return this.transactions.read(actor, 'reader', async (companyId) => {
      await this.projects.missionContextWithinTransaction({
        actor,
        projectId: targetProjectId,
      });
      const scope = and(
        eq(certificationCases.workspaceId, actor.workspaceId),
        eq(certificationCases.companyId, companyId),
        eq(certificationCases.projectId, targetProjectId),
      );
      const [total] = await this.database.connection
        .select({ value: count() })
        .from(certificationCases)
        .where(scope);
      const rows = await this.database.connection
        .select()
        .from(certificationCases)
        .where(scope)
        .orderBy(desc(certificationCases.openedAt), desc(certificationCases.id))
        .limit(CASE_LIST_LIMIT);
      const cases: CertificationCaseSummary[] = [];
      for (const row of rows) {
        const steps = await this.repository.steps(actor, companyId, row.id);
        cases.push(
          this.repository.summary(
            row,
            await this.repository.legalName(actor, row),
            steps,
            await this.repository.findings(actor, companyId, row.id, steps),
          ),
        );
      }
      return {
        projectId: targetProjectId,
        cases,
        total: total?.value ?? 0,
      };
    });
  }

  detail({
    actor,
    caseId,
  }: {
    actor: ActorContext;
    caseId: string;
  }): Promise<CertificationCaseDetail> {
    const targetId = requireUuid(caseId);
    return this.transactions.read(actor, 'reader', (companyId) =>
      this.repository.present(actor, companyId, targetId),
    );
  }

  /** Working draft preparation only; the caller owns the read transaction. */
  async applicationDraftContextWithinTransaction(input: {
    actor: ActorContext;
    projectId: string;
    caseId: string;
    expectedRevision: number;
  }) {
    const companyId = await this.transactions.authorize(
      input.actor,
      'programme_manager',
      {
        lock: false,
      },
    );
    const row = await this.repository.visibleCase(
      input.actor,
      companyId,
      requireUuid(input.caseId),
    );
    if (row.projectId !== requireUuid(input.projectId))
      throw new NotFoundException();
    if (row.revision !== input.expectedRevision)
      throw new ConflictException('The Case changed. Reload its draft.');
    requireUndecided(
      await this.repository.steps(input.actor, companyId, row.id),
    );
    return { caseId: row.id, projectId: row.projectId, revision: row.revision };
  }

  /** Exact native evidence relations; the caller owns the transaction. */
  async dossierDocumentsWithinTransaction(
    input: { actor: ActorContext } & (
      | { projectId: string; lock: boolean }
      | {
          /** The same Actor's Project read in the caller's read-only snapshot. */
          snapshotProject: Pick<
            Awaited<ReturnType<ProjectService['read']>>,
            'id' | 'companyId' | 'clientAccountId'
          >;
          lock: false;
        }
    ),
  ) {
    const { actor, lock } = input;
    const companyId = await this.transactions.authorize(actor, 'reader', {
      lock,
    });
    const project =
      'snapshotProject' in input
        ? input.snapshotProject
        : await this.projects.missionContextWithinTransaction({
            actor,
            projectId: requireUuid(input.projectId),
            lock,
          });
    if (project.companyId !== companyId) throw new NotFoundException();
    const projectId = project.id;
    // Case attachments are received audit sources. Establish their native
    // family/content and original-Client visibility before bounded discovery.
    await this.sources.requireCurrentAuthority({
      actor,
      context: { companyId, originalClientId: project.clientAccountId },
      tuples: [],
      lock,
    });
    const query = this.database.connection
      .select({
        id: certificationCases.id,
        revision: certificationCases.revision,
      })
      .from(certificationCases)
      .where(
        and(
          eq(certificationCases.workspaceId, actor.workspaceId),
          eq(certificationCases.companyId, companyId),
          eq(certificationCases.projectId, projectId),
        ),
      )
      .orderBy(asc(certificationCases.id))
      .limit(201);
    const cases = await (lock ? query.for('share') : query);
    if (cases.length > 200)
      throw new BadRequestException(
        'The Project evidence inventory is too large.',
      );
    const result: (typeof certificationCaseDocuments.$inferSelect & {
      currentCaseRevision: number;
    })[] = [];
    for (const current of cases) {
      const attachments = await this.database.connection
        .select(getTableColumns(certificationCaseDocuments))
        .from(certificationCaseDocuments)
        .innerJoin(
          workingDocuments,
          and(
            eq(
              workingDocuments.workspaceId,
              certificationCaseDocuments.workspaceId,
            ),
            eq(
              workingDocuments.companyId,
              certificationCaseDocuments.companyId,
            ),
            eq(workingDocuments.id, certificationCaseDocuments.documentId),
            eq(workingDocuments.clientId, project.clientAccountId),
            eq(workingDocuments.type, 'received-audit-source'),
          ),
        )
        .where(
          and(
            eq(certificationCaseDocuments.workspaceId, actor.workspaceId),
            eq(certificationCaseDocuments.companyId, companyId),
            eq(certificationCaseDocuments.caseId, current.id),
          ),
        )
        .orderBy(asc(certificationCaseDocuments.id))
        .limit(1001);
      if (
        attachments.length > 1000 ||
        result.length + attachments.length > 1000
      )
        throw new BadRequestException(
          'The Project evidence inventory is too large.',
        );
      for (const attachment of attachments)
        result.push({ ...attachment, currentCaseRevision: current.revision });
    }
    return result;
  }

  timeline({
    actor,
    caseId,
  }: {
    actor: ActorContext;
    caseId: string;
  }): Promise<CertificationTimeline> {
    const targetId = requireUuid(caseId);
    return this.transactions.read(actor, 'reader', async (companyId) => {
      await this.repository.visibleCase(actor, companyId, targetId);
      const rows = await this.database.connection
        .select()
        .from(certificationStepVersions)
        .where(
          and(
            eq(certificationStepVersions.workspaceId, actor.workspaceId),
            eq(certificationStepVersions.companyId, companyId),
            eq(certificationStepVersions.caseId, targetId),
          ),
        )
        .orderBy(asc(certificationStepVersions.caseRevision))
        .limit(TIMELINE_LIMIT);
      return { caseId: targetId, entries: rows.map(stepVersion) };
    });
  }

  /**
   * The generated, non-official dossier register of one Case, as a PDF. A
   * read under the Case view's authority, so it records no Activity; the PDF
   * is rendered after the read transaction ends.
   */
  async register({
    actor,
    caseId,
    query,
  }: {
    actor: ActorContext;
    caseId: string;
    query: unknown;
  }): Promise<{ bytes: Uint8Array; fileName: string }> {
    const targetId = requireUuid(caseId);
    const language = registerLanguage(query);
    // One snapshot: a command committing meanwhile cannot mix two revisions.
    // Not read only: the authority recheck locks its grants FOR SHARE.
    const source = await this.transactions.read(
      actor,
      'reader',
      (companyId) => this.repository.registerSource(actor, companyId, targetId),
      { isolationLevel: 'repeatable read' },
    );
    return {
      bytes: await renderCertificationRegister(
        certificationRegister(source, language),
      ),
      fileName: `certification-case-register-${source.caseId.slice(0, 8)}.pdf`,
    };
  }

  legalEntities({
    actor,
    projectId,
  }: {
    actor: ActorContext;
    projectId: string;
  }): Promise<CertificationLegalEntityOptions> {
    const targetProjectId = requireUuid(projectId);
    return this.transactions.read(actor, 'programme_manager', async () => {
      const project = await this.projects.missionContextWithinTransaction({
        actor,
        projectId: targetProjectId,
      });
      const rows = await this.database.connection
        .select({
          id: clientLegalEntities.id,
          legalName: clientLegalEntities.legalName,
          taxId: clientLegalEntities.taxId,
        })
        .from(clientLegalEntities)
        .where(
          and(
            eq(clientLegalEntities.workspaceId, actor.workspaceId),
            eq(clientLegalEntities.clientAccountId, project.clientAccountId),
          ),
        )
        .orderBy(
          asc(clientLegalEntities.legalName),
          asc(clientLegalEntities.id),
        )
        .limit(CASE_LIST_LIMIT);
      return { projectId: targetProjectId, items: rows };
    });
  }
}

function differsFromProposal(
  confirmed: DurationDetermination['confirmed'],
  proposal: Extract<DurationResult, { kind: 'proposal' }>['proposal'],
): boolean {
  const pairs: readonly (readonly [string, string])[] = [
    [confirmed.initialOnSite, proposal.initialOnSite],
    [confirmed.stage1OnSite, proposal.stage1OnSite],
    [confirmed.stage2OnSite, proposal.stage2OnSite],
    [confirmed.surveillanceOnSite, proposal.surveillanceOnSite],
    [confirmed.recertificationOnSite, proposal.recertificationOnSite],
  ];
  return pairs.some(
    ([value, proposed]) => cents(value) !== cents(roundToHundredths(proposed)),
  );
}
