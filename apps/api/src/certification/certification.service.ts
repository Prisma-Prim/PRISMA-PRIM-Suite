import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, count, desc, eq } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import {
  requireIdempotencyKey,
  requireUuid,
} from '../access/access-command-validation.js';
import type { CertificationRole } from '../access/certification-captured-grants.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { SERVER_CLOCK, type ServerClock } from '../clock/server-clock.js';
import {
  commandFingerprint,
  idempotencyConflict,
  runIdempotentCommand,
  staleVersionConflict,
} from '../command/idempotent-command.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  certificationCaseDocuments,
  certificationCases,
  certificationReceipts,
  certificationStepVersions,
  type CERTIFICATION_COMMAND_KINDS,
} from '../database/schema/certification.js';
import { clientLegalEntities } from '../database/schema/client-legal-entity.js';
import { ProjectService } from '../project/project.service.js';
import { DocumentWorkingEvidenceReferenceService } from '../documents/document-working-evidence-reference.service.js';
import {
  proposeDuration,
  roundToHundredths,
  type DurationResult,
} from './certification-duration.js';
import {
  cents,
  durationCommand,
  durationDetermination,
  durationFactorInputs,
} from './certification-duration.validation.js';
import type {
  AgreementVersion,
  CertificationAttachment,
  CertificationDocumentRegister,
  CertificationEligibleDocuments,
  ApplicationFacts,
  ApplicationReviewVersion,
  DurationDetermination,
  DurationFactorInputs,
  DurationVersion,
  ApplicationVersion,
  CertificationCaseDetail,
  CertificationCaseList,
  CertificationCaseSummary,
  CertificationLegalEntityOptions,
  CertificationNextStep,
  CertificationStepVersion,
  CertificationTimeline,
} from './certification.types.js';
import {
  agreement,
  agreementCommand,
  attachCommand,
  applicationCommand,
  applicationFacts,
  applicationReview,
  openCommand,
  reviewCommand,
} from './certification.validation.js';

type CommandKind = (typeof CERTIFICATION_COMMAND_KINDS)[number];
type CaseRow = typeof certificationCases.$inferSelect;
type StepRow = typeof certificationStepVersions.$inferSelect;

const CASE_LIST_LIMIT = 100;
const TIMELINE_LIMIT = 500;

@Injectable()
export class CertificationService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly authorization: CompanyContextAuthorization,
    private readonly accountability: AccountabilityService,
    private readonly projects: ProjectService,
    private readonly sources: DocumentWorkingEvidenceReferenceService,
    @Inject(SERVER_CLOCK) private readonly clock: ServerClock,
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
    return this.command({
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
    return this.command({
      actor,
      kind: 'application',
      key: idempotencyKey,
      fingerprint: commandFingerprint({ caseId, body }),
      execute: async (companyId) => {
        const input = applicationCommand(body);
        const current = await this.lockOpenCase(
          actor,
          companyId,
          targetId,
          input.expectedRevision,
        );
        const steps = await this.steps(actor, companyId, targetId);
        if (latest(steps, 'application_review'))
          throw stepConflict(
            'CERTIFICATION_APPLICATION_REVIEWED',
            'The application can no longer change after its review.',
          );
        const previous = latest(steps, 'application');
        const version = (previous?.version ?? 0) + 1;
        if ((version === 1) !== (input.reason === null))
          throw stepConflict(
            'CERTIFICATION_CORRECTION_REASON',
            'A correction states its reason; a first application has none.',
          );
        return this.appendStep({
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
    return this.command({
      actor,
      kind: 'application_review',
      key: idempotencyKey,
      fingerprint: commandFingerprint({ caseId, body }),
      execute: async (companyId) => {
        const input = reviewCommand(body);
        const current = await this.lockOpenCase(
          actor,
          companyId,
          targetId,
          input.expectedRevision,
        );
        const steps = await this.steps(actor, companyId, targetId);
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
        return this.appendStep({
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
    return this.read(actor, 'programme_manager', async (companyId) => {
      const factors = durationFactorInputs(body);
      await this.visibleCase(actor, companyId, targetId);
      const facts = this.acceptedApplication(
        await this.steps(actor, companyId, targetId),
      );
      return computeDuration(facts, factors);
    });
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
    return this.command({
      actor,
      kind: 'duration',
      key: idempotencyKey,
      fingerprint: commandFingerprint({ caseId, body }),
      execute: async (companyId) => {
        const input = durationCommand(body);
        const current = await this.lockOpenCase(
          actor,
          companyId,
          targetId,
          input.expectedRevision,
        );
        const steps = await this.steps(actor, companyId, targetId);
        const facts = this.acceptedApplication(steps);
        const previous = latest(steps, 'duration');
        const version = (previous?.version ?? 0) + 1;
        if ((version === 1) !== (input.reason === null))
          throw stepConflict(
            'CERTIFICATION_CORRECTION_REASON',
            'A correction states its reason; a first determination has none.',
          );
        const result = computeDuration(facts, input.inputs);
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
        };
        return this.appendStep({
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
    return this.command({
      actor,
      kind: 'document',
      key: idempotencyKey,
      fingerprint: commandFingerprint({ caseId, body }),
      execute: async (companyId) => {
        const input = attachCommand(body);
        const current = await this.lockOpenCase(
          actor,
          companyId,
          targetId,
          input.expectedRevision,
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
        return this.advance({
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
    return this.read(actor, 'reader', async (companyId) => {
      await this.visibleCase(actor, companyId, targetId);
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
    return this.read(actor, 'reader', async (companyId) => {
      const row = await this.visibleCase(actor, companyId, targetId);
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
    return this.read(actor, 'programme_manager', async (companyId) => {
      const row = await this.visibleCase(actor, companyId, targetId);
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
    });
  }

  recordAgreement({
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
    return this.command({
      actor,
      kind: 'agreement',
      key: idempotencyKey,
      fingerprint: commandFingerprint({ caseId, body }),
      execute: async (companyId) => {
        const input = agreementCommand(body);
        const current = await this.lockOpenCase(
          actor,
          companyId,
          targetId,
          input.expectedRevision,
        );
        const steps = await this.steps(actor, companyId, targetId);
        if (!latest(steps, 'duration'))
          throw stepConflict(
            'CERTIFICATION_DURATION_MISSING',
            'Confirm the audit duration before recording the agreement.',
          );
        const version = (latest(steps, 'agreement')?.version ?? 0) + 1;
        if ((version === 1) !== (input.reason === null))
          throw stepConflict(
            'CERTIFICATION_CORRECTION_REASON',
            'A correction states its reason; a first agreement has none.',
          );
        if (
          input.agreement.signedOn > this.clock.now().toISOString().slice(0, 10)
        )
          throw stepConflict(
            'CERTIFICATION_AGREEMENT_IN_FUTURE',
            'The agreement cannot be signed after today.',
          );
        const [attached] = await this.database.connection
          .select({ role: certificationCaseDocuments.role })
          .from(certificationCaseDocuments)
          .where(
            and(
              eq(certificationCaseDocuments.workspaceId, actor.workspaceId),
              eq(certificationCaseDocuments.companyId, companyId),
              eq(certificationCaseDocuments.caseId, targetId),
              eq(certificationCaseDocuments.id, input.agreement.attachmentId),
            ),
          );
        if (attached?.role !== 'agreement')
          throw stepConflict(
            'CERTIFICATION_AGREEMENT_DOCUMENT',
            'Attach the signed agreement with the agreement role first.',
          );
        return this.appendStep({
          actor,
          companyId,
          current,
          step: 'agreement',
          version,
          payload: input.agreement,
          reason: input.reason,
          action: 'certification_case.agreement_recorded',
          metadata: { version },
        });
      },
    });
  }

  list({
    actor,
    projectId,
  }: {
    actor: ActorContext;
    projectId: string;
  }): Promise<CertificationCaseList> {
    const targetProjectId = requireUuid(projectId);
    return this.read(actor, 'reader', async (companyId) => {
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
      for (const row of rows)
        cases.push(
          this.summary(
            row,
            await this.legalName(actor, row),
            await this.steps(actor, companyId, row.id),
          ),
        );
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
    return this.read(actor, 'reader', (companyId) =>
      this.present(actor, companyId, targetId),
    );
  }

  timeline({
    actor,
    caseId,
  }: {
    actor: ActorContext;
    caseId: string;
  }): Promise<CertificationTimeline> {
    const targetId = requireUuid(caseId);
    return this.read(actor, 'reader', async (companyId) => {
      await this.visibleCase(actor, companyId, targetId);
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

  legalEntities({
    actor,
    projectId,
  }: {
    actor: ActorContext;
    projectId: string;
  }): Promise<CertificationLegalEntityOptions> {
    const targetProjectId = requireUuid(projectId);
    return this.read(actor, 'programme_manager', async () => {
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

  /** One keyed mutation: live authority, key lock, replay, then execution. */
  private command({
    actor,
    kind,
    key,
    fingerprint,
    execute,
  }: {
    actor: ActorContext;
    kind: CommandKind;
    key: string;
    fingerprint: string;
    execute: (companyId: string) => Promise<{ caseId: string; at: Date }>;
  }): Promise<unknown> {
    return this.protect(() =>
      runIdempotentCommand(this.database, {
        fingerprint,
        authorize: () => this.authorize(actor, 'programme_manager'),
        lockParts: (companyId) => [
          'certification',
          actor.workspaceId,
          companyId,
          actor.workspaceMembershipId,
          kind,
          key,
        ],
        findReceipt: (companyId) => this.receipt(actor, companyId, kind, key),
        conflict: () => idempotencyConflict(),
        // An exact retry answers the recorded response, never a newer state.
        replay: (_companyId, receipt) => Promise.resolve(receipt.response),
        execute: async (companyId) => {
          const { caseId, at } = await execute(companyId);
          const response = await this.present(actor, companyId, caseId);
          await this.database.connection.insert(certificationReceipts).values({
            workspaceId: actor.workspaceId,
            companyId,
            actorMembershipId: actor.workspaceMembershipId,
            commandKind: kind,
            idempotencyKey: key,
            fingerprint,
            caseId,
            response,
            recordedAt: at,
          });
          return response;
        },
      }),
    );
  }

  private async appendStep(input: {
    actor: ActorContext;
    companyId: string;
    current: CaseRow;
    step: StepRow['step'];
    version: number;
    /** The version this one corrects; an identical value is refused. */
    replaces?: StepRow;
    payload: object;
    reason: string | null;
    action:
      | 'certification_case.application_recorded'
      | 'certification_case.application_reviewed'
      | 'certification_case.duration_confirmed'
      | 'certification_case.agreement_recorded';
    metadata: Record<string, string | number>;
    status?: CaseRow['status'];
  }): Promise<{ caseId: string; at: Date }> {
    const { actor, companyId, current } = input;
    if (input.replaces && sameValue(input.replaces.payload, input.payload))
      throw stepConflict(
        'CERTIFICATION_CORRECTION_UNCHANGED',
        'The correction changes no recorded value.',
      );
    const now = this.clock.now();
    const revision = current.revision + 1;
    await this.database.connection.insert(certificationStepVersions).values({
      workspaceId: actor.workspaceId,
      companyId,
      caseId: current.id,
      step: input.step,
      version: input.version,
      caseRevision: revision,
      payload: input.payload,
      reason: input.reason,
      actorMembershipId: actor.workspaceMembershipId,
      actorInternalUserId: actor.internalUserId,
      actorDisplayName: actor.displayName,
      recordedAt: now,
    });
    return this.advance({
      actor,
      companyId,
      current,
      at: now,
      action: input.action,
      metadata: input.metadata,
      ...(input.status ? { status: input.status } : {}),
    });
  }

  /** Moves the Case head one revision and records its event, in the command's transaction. */
  private async advance(input: {
    actor: ActorContext;
    companyId: string;
    current: CaseRow;
    at: Date;
    action: Parameters<
      AccountabilityService['recordCertificationEvent']
    >[0]['action'];
    metadata: Record<string, string | number>;
    status?: CaseRow['status'];
  }): Promise<{ caseId: string; at: Date }> {
    const { actor, companyId, current, at: now } = input;
    const revision = current.revision + 1;
    const [updated] = await this.database.connection
      .update(certificationCases)
      .set({ revision, status: input.status ?? current.status })
      .where(
        and(
          eq(certificationCases.workspaceId, actor.workspaceId),
          eq(certificationCases.companyId, companyId),
          eq(certificationCases.id, current.id),
          eq(certificationCases.revision, current.revision),
        ),
      )
      .returning({ id: certificationCases.id });
    if (!updated) throw new InternalServerErrorException();
    await this.accountability.recordCertificationEvent({
      actor,
      companyId,
      caseId: current.id,
      revision,
      occurredAt: now,
      action: input.action,
      metadata: { revision, ...input.metadata },
    });
    return { caseId: current.id, at: now };
  }

  private async lockOpenCase(
    actor: ActorContext,
    companyId: string,
    caseId: string,
    expectedRevision: number,
  ): Promise<CaseRow> {
    const [row] = await this.database.connection
      .select()
      .from(certificationCases)
      .where(
        and(
          eq(certificationCases.workspaceId, actor.workspaceId),
          eq(certificationCases.companyId, companyId),
          eq(certificationCases.id, caseId),
        ),
      )
      .for('update');
    if (!row) throw new NotFoundException();
    await this.projects.missionContextWithinTransaction({
      actor,
      projectId: row.projectId,
      lock: true,
    });
    if (row.revision !== expectedRevision)
      throw staleVersionConflict(
        'Reload the Certification Case before recording this step.',
      );
    if (row.status !== 'open')
      throw stepConflict(
        'CERTIFICATION_CASE_CLOSED',
        'This Certification Case is closed.',
      );
    return row;
  }

  /** The Case in the actor's Company whose Project the actor can still read. */
  private async visibleCase(
    actor: ActorContext,
    companyId: string,
    caseId: string,
  ): Promise<CaseRow> {
    const [row] = await this.database.connection
      .select()
      .from(certificationCases)
      .where(
        and(
          eq(certificationCases.workspaceId, actor.workspaceId),
          eq(certificationCases.companyId, companyId),
          eq(certificationCases.id, caseId),
        ),
      );
    if (!row) throw new NotFoundException();
    await this.projects.missionContextWithinTransaction({
      actor,
      projectId: row.projectId,
    });
    return row;
  }

  private async present(
    actor: ActorContext,
    companyId: string,
    caseId: string,
  ): Promise<CertificationCaseDetail> {
    const row = await this.visibleCase(actor, companyId, caseId);
    const steps = await this.steps(actor, companyId, caseId);
    const summary = this.summary(row, await this.legalName(actor, row), steps);
    const application = latest(steps, 'application');
    const review = latest(steps, 'application_review');
    const duration = latest(steps, 'duration');
    const signed = latest(steps, 'agreement');
    return {
      ...summary,
      companyId: row.companyId,
      clientAccountId: row.clientAccountId,
      application: application ? applicationVersion(application) : null,
      applicationReview: review ? reviewVersion(review) : null,
      duration: duration ? durationVersion(duration) : null,
      agreement: signed ? agreementVersion(signed) : null,
    };
  }

  private summary(
    row: CaseRow,
    legalName: string,
    steps: StepRow[],
  ): CertificationCaseSummary {
    return {
      id: row.id,
      projectId: row.projectId,
      orderReference: row.orderReference,
      clientLegalEntity: { id: row.clientLegalEntityId, legalName },
      standard: row.standard,
      auditType: row.auditType,
      status: row.status,
      revision: row.revision,
      nextStep: nextStep(row, steps),
      openedBy: {
        workspaceMembershipId: row.openedByMembershipId,
        displayName: row.openedByDisplayName,
      },
      openedAt: row.openedAt.toISOString(),
    };
  }

  /** The latest application facts once the review accepted them. */
  private acceptedApplication(steps: readonly StepRow[]): ApplicationFacts {
    const review = latest(steps, 'application_review');
    const application = latest(steps, 'application');
    if (
      !review ||
      !application ||
      reviewVersion(review).value.outcome !== 'accepted'
    )
      throw stepConflict(
        'CERTIFICATION_APPLICATION_NOT_ACCEPTED',
        'The duration is determined after the application review accepts it.',
      );
    return applicationVersion(application).value;
  }

  private async legalName(actor: ActorContext, row: CaseRow): Promise<string> {
    const [entity] = await this.database.connection
      .select({ legalName: clientLegalEntities.legalName })
      .from(clientLegalEntities)
      .where(
        and(
          eq(clientLegalEntities.workspaceId, actor.workspaceId),
          eq(clientLegalEntities.clientAccountId, row.clientAccountId),
          eq(clientLegalEntities.id, row.clientLegalEntityId),
        ),
      );
    if (!entity) throw new InternalServerErrorException();
    return entity.legalName;
  }

  private steps(
    actor: ActorContext,
    companyId: string,
    caseId: string,
  ): Promise<StepRow[]> {
    return this.database.connection
      .select()
      .from(certificationStepVersions)
      .where(
        and(
          eq(certificationStepVersions.workspaceId, actor.workspaceId),
          eq(certificationStepVersions.companyId, companyId),
          eq(certificationStepVersions.caseId, caseId),
        ),
      )
      .orderBy(asc(certificationStepVersions.caseRevision));
  }

  private async receipt(
    actor: ActorContext,
    companyId: string,
    kind: CommandKind,
    key: string,
  ) {
    const [receipt] = await this.database.connection
      .select()
      .from(certificationReceipts)
      .where(
        and(
          eq(certificationReceipts.workspaceId, actor.workspaceId),
          eq(certificationReceipts.companyId, companyId),
          eq(
            certificationReceipts.actorMembershipId,
            actor.workspaceMembershipId,
          ),
          eq(certificationReceipts.commandKind, kind),
          eq(certificationReceipts.idempotencyKey, key),
        ),
      );
    return receipt;
  }

  private read<T>(
    actor: ActorContext,
    role: CertificationRole,
    work: (companyId: string) => Promise<T>,
  ): Promise<T> {
    return this.protect(() =>
      this.database.transaction(async () =>
        work(await this.authorize(actor, role)),
      ),
    );
  }

  /**
   * Certification grants, then the Project access every Case lives under,
   * both rechecked inside the transaction. Checking Project access before any
   * Case or receipt lookup keeps hidden and missing Cases indistinguishable
   * and stops a replay once that access is revoked.
   */
  private async authorize(
    actor: ActorContext,
    role: CertificationRole,
  ): Promise<string> {
    const companyId = await this.authorization.requireCertificationAccess(
      actor,
      role,
      true,
    );
    if (
      (await this.authorization.requireProjectAccess(actor, true)) !== companyId
    )
      throw new ForbiddenException();
    return companyId;
  }

  private async protect<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        'Certification operation is unavailable.',
      );
    }
  }
}

function latest(
  steps: readonly StepRow[],
  step: StepRow['step'],
): StepRow | undefined {
  return steps.filter((row) => row.step === step).at(-1);
}

function nextStep(row: CaseRow, steps: StepRow[]): CertificationNextStep {
  if (row.status !== 'open') return null;
  if (!latest(steps, 'application')) return 'application';
  if (!latest(steps, 'application_review')) return 'application_review';
  if (!latest(steps, 'duration')) return 'duration';
  if (!latest(steps, 'agreement')) return 'agreement';
  return 'team';
}

function stepConflict(code: string, message: string): ConflictException {
  return new ConflictException({ code, message });
}

/**
 * Equal stored and validated values, whatever their key order. The validated
 * value takes its stored JSON form first, so absent optional keys compare
 * like the stored payload.
 */
function sameValue(stored: unknown, value: object): boolean {
  const json: unknown = JSON.parse(JSON.stringify(value));
  return (
    commandFingerprint({ value: stored }) ===
    commandFingerprint({ value: json })
  );
}

function base(row: StepRow) {
  return {
    id: row.id,
    version: row.version,
    caseRevision: row.caseRevision,
    reason: row.reason,
    recordedBy: {
      workspaceMembershipId: row.actorMembershipId,
      displayName: row.actorDisplayName,
    },
    recordedAt: row.recordedAt.toISOString(),
  };
}

function applicationVersion(row: StepRow): ApplicationVersion {
  return {
    ...base(row),
    step: 'application',
    value: persisted(() => applicationFacts(row.payload)),
  };
}

function reviewVersion(row: StepRow): ApplicationReviewVersion {
  return {
    ...base(row),
    step: 'application_review',
    value: persisted(() => applicationReview(row.payload)),
  };
}

function agreementVersion(row: StepRow): AgreementVersion {
  return {
    ...base(row),
    step: 'agreement',
    value: persisted(() => agreement(row.payload)),
  };
}

function attachment(
  row: typeof certificationCaseDocuments.$inferSelect,
): CertificationAttachment {
  return {
    id: row.id,
    caseRevision: row.caseRevision,
    role: row.role,
    documentId: row.documentId,
    versionId: row.versionId,
    representationId: row.representationId,
    versionNumber: row.versionNumber,
    sourceTitle: row.sourceTitle,
    fileName: row.fileName,
    sizeBytes: row.sizeBytes,
    sha256: row.sha256,
    note: row.note,
    attachedBy: {
      workspaceMembershipId: row.actorMembershipId,
      displayName: row.actorDisplayName,
    },
    attachedAt: row.attachedAt.toISOString(),
  };
}

function durationVersion(row: StepRow): DurationVersion {
  return {
    ...base(row),
    step: 'duration',
    value: persisted(() => durationDetermination(row.payload)),
  };
}

/** The proposal for the accepted application, or why none exists. */
function computeDuration(
  facts: ApplicationFacts,
  factors: DurationFactorInputs,
): DurationResult {
  const studies = Object.values(factors.haccpStudies).reduce(
    (total, value) => total + value,
    0,
  );
  if (studies !== facts.haccpStudyCount)
    return { kind: 'refused', refusals: ['HACCP_STUDIES_MISMATCH'] };
  return proposeDuration({
    subcategories: facts.foodChainSubcategories,
    primary: factors.primary,
    haccpStudies: factors.haccpStudies,
    effectiveFte: facts.effectiveFte,
    increases: factors.increases,
    reductions: factors.reductions,
  });
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

/** Stored payloads were validated on write; a failure here is corruption. */
function persisted<T>(decode: () => T): T {
  try {
    return decode();
  } catch {
    throw new InternalServerErrorException(
      'A recorded certification step is unreadable.',
    );
  }
}

function stepVersion(row: StepRow): CertificationStepVersion {
  switch (row.step) {
    case 'application':
      return applicationVersion(row);
    case 'application_review':
      return reviewVersion(row);
    case 'duration':
      return durationVersion(row);
    case 'agreement':
      return agreementVersion(row);
  }
  return unexpectedStep(row.step);
}

function unexpectedStep(value: never): never {
  throw new InternalServerErrorException(`Unexpected step ${String(value)}`);
}
