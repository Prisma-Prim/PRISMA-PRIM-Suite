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
  certificationCertificates,
  certificationFindingRecords,
  certificationFindings,
  certificationCaseDocuments,
  certificationCases,
  certificationReceipts,
  certificationStepVersions,
  type CERTIFICATION_COMMAND_KINDS,
} from '../database/schema/certification.js';
import { clientLegalEntities } from '../database/schema/client-legal-entity.js';
import { workspaceMemberships } from '../database/schema/core.js';
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
import {
  auditTeam,
  teamCommand,
  teamDecision,
  teamDecisionCommand,
  teamMembershipIds,
  teamWithoutConflict,
} from './certification-team.js';
import {
  certificateCommand,
  certificateData,
  certificateTexts,
  sameCertificateTexts,
  certificateValidity,
  certificationDecision,
  dossierComplete,
  dossierReview,
  recommendation,
} from './certification-decision.js';
import {
  allowedInStage,
  classification as findingClassificationValue,
  findingBlocks,
  findingCommand,
  findingRecordView,
  findingRule,
  findingStatement,
  findingView,
  isNonconformity,
  nonconformityResponse,
  nonconformityVerification,
  planJudgment,
  type FindingRecordKind,
  type FindingView,
} from './certification-findings.js';
import {
  dayCents,
  stage1Report,
  stage2Report,
  stageCommand,
  stagePlan,
  type AuditStage,
} from './certification-stages.js';
import type {
  CertificateRecord,
  StageStepVersion,
  TeamDecisionVersion,
  TeamVersion,
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
  DOCUMENT_ROLES,
  inputObject,
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
const STAGE_STEPS: readonly StepRow['step'][] = [
  'stage_1_plan',
  'stage_1_report',
  'stage_2_plan',
  'stage_2_report',
];
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
        const previous = latest(steps, 'agreement');
        const version = (previous?.version ?? 0) + 1;
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
          replaces: previous,
          payload: input.agreement,
          reason: input.reason,
          action: 'certification_case.agreement_recorded',
          metadata: { version },
        });
      },
    });
  }

  proposeTeam({
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
      kind: 'team',
      key: idempotencyKey,
      fingerprint: commandFingerprint({ caseId, body }),
      execute: async (companyId) => {
        const input = teamCommand(body);
        const current = await this.lockOpenCase(
          actor,
          companyId,
          targetId,
          input.expectedRevision,
        );
        const steps = await this.steps(actor, companyId, targetId);
        if (!latest(steps, 'agreement'))
          throw stepConflict(
            'CERTIFICATION_AGREEMENT_MISSING',
            'Record the certification agreement before proposing the team.',
          );
        const previous = latest(steps, 'team');
        const version = (previous?.version ?? 0) + 1;
        if ((version === 1) !== (input.reason === null))
          throw stepConflict(
            'CERTIFICATION_CORRECTION_REASON',
            'A new team version states its reason; a first proposal has none.',
          );
        // An unchanged team may be resubmitted after a return, for a new
        // decision; any other unchanged version would change nothing.
        const decided = latest(steps, 'team_decision');
        const decision = decided ? teamDecisionVersion(decided).value : null;
        const resubmitted =
          decision?.decision === 'returned' &&
          decision.teamVersion === previous?.version;
        // Whoever decided on any team version stays outside every later one.
        const deciders = steps
          .filter((row) => row.step === 'team_decision')
          .map((row) => row.actorMembershipId);
        if (
          teamMembershipIds(input.team).some((membershipId) =>
            deciders.includes(membershipId),
          )
        )
          throw stepConflict(
            'CERTIFICATION_INDEPENDENCE',
            'A member who decided on a team version cannot join the audit team.',
          );
        for (const membershipId of teamMembershipIds(input.team)) {
          const [member] = await this.database.connection
            .select({ id: workspaceMemberships.id })
            .from(workspaceMemberships)
            .where(
              and(
                eq(workspaceMemberships.workspaceId, actor.workspaceId),
                eq(workspaceMemberships.id, membershipId),
                eq(workspaceMemberships.status, 'active'),
              ),
            );
          if (!member)
            throw new BadRequestException({
              code: 'CERTIFICATION_TEAM_MEMBER_UNKNOWN',
              message: 'A linked team member is not an active member.',
            });
        }
        return this.appendStep({
          actor,
          companyId,
          current,
          step: 'team',
          version,
          replaces: resubmitted ? undefined : previous,
          payload: input.team,
          reason: input.reason,
          action: 'certification_case.team_proposed',
          metadata: { version, members: input.team.members.length },
        });
      },
    });
  }

  decideTeam({
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
      role: 'approver',
      kind: 'team_decision',
      key: idempotencyKey,
      fingerprint: commandFingerprint({ caseId, body }),
      execute: async (companyId) => {
        const input = teamDecisionCommand(body);
        const current = await this.lockOpenCase(
          actor,
          companyId,
          targetId,
          input.expectedRevision,
        );
        const steps = await this.steps(actor, companyId, targetId);
        const proposed = latest(steps, 'team');
        const decided = latest(steps, 'team_decision');
        if (
          !proposed ||
          (decided &&
            teamDecisionVersion(decided).value.teamVersion === proposed.version)
        )
          throw stepConflict(
            'CERTIFICATION_TEAM_NOT_PENDING',
            'No proposed team awaits a decision.',
          );
        if (input.decision.teamVersion !== proposed.version)
          throw staleVersionConflict(
            'Reload the Certification Case: the team proposal changed.',
          );
        const team = teamVersion(proposed).value;
        if (this.onTeam(actor, steps))
          throw stepConflict(
            'CERTIFICATION_INDEPENDENCE',
            'A member of the audit team cannot approve it.',
          );
        if (
          input.decision.decision === 'approved' &&
          !teamWithoutConflict(team)
        )
          throw stepConflict(
            'CERTIFICATION_TEAM_CONFLICT_DECLARED',
            'A team with a declared conflict cannot be approved.',
          );
        const version = (decided?.version ?? 0) + 1;
        return this.appendStep({
          actor,
          companyId,
          current,
          step: 'team_decision',
          version,
          payload: input.decision,
          // A decision is not a correction: its own reason lives in the payload.
          reason: null,
          action: 'certification_case.team_decided',
          metadata: {
            teamVersion: proposed.version,
            decision: input.decision.decision,
          },
        });
      },
    });
  }

  /** The programme manager plans one Stage against the confirmed duration. */
  planStage({
    actor,
    caseId,
    stage,
    body,
    key,
  }: {
    actor: ActorContext;
    caseId: string;
    stage: AuditStage;
    body: unknown;
    key: string | undefined;
  }): Promise<unknown> {
    const idempotencyKey = requireIdempotencyKey(key);
    const targetId = requireUuid(caseId);
    const step = stage === 'stage_1' ? 'stage_1_plan' : 'stage_2_plan';
    return this.command({
      actor,
      kind: 'stage_plan',
      key: idempotencyKey,
      fingerprint: commandFingerprint({ caseId, stage, body }),
      execute: async (companyId) => {
        const input = stageCommand(body, stagePlan);
        const current = await this.lockOpenCase(
          actor,
          companyId,
          targetId,
          input.expectedRevision,
        );
        const steps = await this.steps(actor, companyId, targetId);
        if (!approvedTeam(steps))
          throw stepConflict(
            'CERTIFICATION_TEAM_NOT_APPROVED',
            'Plan the Audit once the audit team is approved.',
          );
        if (stage === 'stage_2') {
          const report = latest(steps, 'stage_1_report');
          const value = report ? stage1Version(report).value : undefined;
          if (value?.conclusion !== 'ready')
            throw stepConflict(
              'CERTIFICATION_STAGE_1_NOT_READY',
              'Stage 2 is planned after a Stage 1 report concluding the client is ready.',
            );
          const findings = await this.findings(
            actor,
            companyId,
            targetId,
            steps,
          );
          if (
            findings.some(
              (finding) =>
                finding.stage === 'stage_1' &&
                isNonconformity(finding.classification) &&
                finding.status !== 'verified_effective',
            )
          )
            throw stepConflict(
              'CERTIFICATION_STAGE_1_NONCONFORMITY_OPEN',
              'Stage 2 starts once every Stage 1 nonconformity is verified as eliminated.',
            );
          if (input.payload.startDate <= value.reportDate)
            throw stepConflict(
              'CERTIFICATION_STAGE_DATES',
              'Stage 2 starts after the Stage 1 report date.',
            );
        }
        const duration = latest(steps, 'duration');
        if (!duration) throw new InternalServerErrorException();
        const confirmed = durationVersion(duration).value.confirmed;
        const expected =
          stage === 'stage_1' ? confirmed.stage1OnSite : confirmed.stage2OnSite;
        if (
          (dayCents(input.payload.onSiteDays) !== dayCents(expected)) !==
          (input.payload.deviationNote !== null)
        )
          throw new BadRequestException({
            code: 'CERTIFICATION_STAGE_DEVIATION_NOTE',
            message:
              'Explain on-site days that differ from the confirmed duration, and only then.',
          });
        await this.requireAttachment(
          actor,
          companyId,
          targetId,
          input.payload.planAttachmentId,
          ['plan'],
        );
        const previous = latest(steps, step);
        const version = (previous?.version ?? 0) + 1;
        if ((version === 1) !== (input.reason === null))
          throw stepConflict(
            'CERTIFICATION_CORRECTION_REASON',
            'A new plan version states its reason; a first plan has none.',
          );
        return this.appendStep({
          actor,
          companyId,
          current,
          step,
          version,
          replaces: previous,
          payload: input.payload,
          reason: input.reason,
          action: 'certification_case.stage_planned',
          metadata: { stage, version },
        });
      },
    });
  }

  /** The team leader of the approved team records one Stage report. */
  reportStage({
    actor,
    caseId,
    stage,
    body,
    key,
  }: {
    actor: ActorContext;
    caseId: string;
    stage: AuditStage;
    body: unknown;
    key: string | undefined;
  }): Promise<unknown> {
    const idempotencyKey = requireIdempotencyKey(key);
    const targetId = requireUuid(caseId);
    const planStep = stage === 'stage_1' ? 'stage_1_plan' : 'stage_2_plan';
    const step = stage === 'stage_1' ? 'stage_1_report' : 'stage_2_report';
    return this.command({
      actor,
      role: 'auditor',
      kind: 'stage_report',
      key: idempotencyKey,
      fingerprint: commandFingerprint({ caseId, stage, body }),
      execute: async (companyId) => {
        const input =
          stage === 'stage_1'
            ? stageCommand(body, stage1Report)
            : stageCommand(body, stage2Report);
        const current = await this.lockOpenCase(
          actor,
          companyId,
          targetId,
          input.expectedRevision,
        );
        const steps = await this.steps(actor, companyId, targetId);
        this.requireTeamLeader(actor, steps);
        const plan = latest(steps, planStep);
        if (!plan)
          throw stepConflict(
            'CERTIFICATION_STAGE_NOT_PLANNED',
            'Record the Stage plan before its report.',
          );
        const planned = stagePlanVersion(plan).value;
        if (input.payload.reportDate < planned.startDate)
          throw stepConflict(
            'CERTIFICATION_STAGE_DATES',
            'A report is dated on or after the Stage start.',
          );
        await this.requireAttachment(
          actor,
          companyId,
          targetId,
          input.payload.reportAttachmentId,
          ['report'],
        );
        if (input.payload.participantListAttachmentId)
          await this.requireAttachment(
            actor,
            companyId,
            targetId,
            input.payload.participantListAttachmentId,
            ['participant_list'],
          );
        if (
          'annexAttachmentId' in input.payload &&
          input.payload.annexAttachmentId
        )
          await this.requireAttachment(
            actor,
            companyId,
            targetId,
            input.payload.annexAttachmentId,
            ['report', 'evidence', 'iso22000_annex'],
          );
        const previous = latest(steps, step);
        const version = (previous?.version ?? 0) + 1;
        if ((version === 1) !== (input.reason === null))
          throw stepConflict(
            'CERTIFICATION_CORRECTION_REASON',
            'A new report version states its reason; a first report has none.',
          );
        return this.appendStep({
          actor,
          companyId,
          current,
          step,
          version,
          replaces: previous,
          payload: input.payload,
          reason: input.reason,
          action: 'certification_case.stage_reported',
          metadata: { stage, version },
        });
      },
    });
  }

  /** The team leader records a classified Finding of a planned Stage. */
  recordFinding({
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
      role: 'auditor',
      kind: 'finding',
      key: idempotencyKey,
      fingerprint: commandFingerprint({ caseId, body }),
      execute: async (companyId) => {
        const input = findingCommand(body, (payload) => {
          const fields = inputObject(payload, [
            'stage',
            'classification',
            'clause',
            'area',
            'statement',
            'evidenceAttachmentIds',
          ]);
          const { stage, classification, ...statement } = fields;
          let findingStage: AuditStage;
          if (stage === 'stage_1') findingStage = 'stage_1';
          else if (stage === 'stage_2') findingStage = 'stage_2';
          else
            throw findingRule(
              'INVALID_CERTIFICATION_INPUT',
              'Invalid certification input.',
            );
          return {
            stage: findingStage,
            classification: findingClassificationValue(classification),
            statement: findingStatement(statement),
          };
        });
        if (input.reason !== null)
          throw stepConflict(
            'CERTIFICATION_CORRECTION_REASON',
            'A new Finding has no correction reason.',
          );
        const current = await this.lockOpenCase(
          actor,
          companyId,
          targetId,
          input.expectedRevision,
        );
        const steps = await this.steps(actor, companyId, targetId);
        this.requireTeamLeader(actor, steps);
        const { stage, classification, statement } = input.payload;
        if (
          !latest(steps, stage === 'stage_1' ? 'stage_1_plan' : 'stage_2_plan')
        )
          throw stepConflict(
            'CERTIFICATION_STAGE_NOT_PLANNED',
            'Record Findings of a planned Stage.',
          );
        if (stage === 'stage_1' && latest(steps, 'stage_2_plan'))
          throw stepConflict(
            'CERTIFICATION_STAGE_CLOSED',
            'Stage 1 Findings are recorded before Stage 2 is planned.',
          );
        this.requireClassification(classification, stage, statement);
        await this.requireAttachments(
          actor,
          companyId,
          targetId,
          statement.evidenceAttachmentIds,
        );
        const [existing] = await this.database.connection
          .select({ value: count() })
          .from(certificationFindings)
          .where(
            and(
              eq(certificationFindings.workspaceId, actor.workspaceId),
              eq(certificationFindings.companyId, companyId),
              eq(certificationFindings.caseId, targetId),
            ),
          );
        const now = this.clock.now();
        const revision = current.revision + 1;
        const [finding] = await this.database.connection
          .insert(certificationFindings)
          .values({
            workspaceId: actor.workspaceId,
            companyId,
            caseId: targetId,
            stage,
            sequence: (existing?.value ?? 0) + 1,
            caseRevision: revision,
            createdAt: now,
          })
          .returning({ id: certificationFindings.id });
        if (!finding) throw new InternalServerErrorException();
        await this.insertFindingRecord(actor, companyId, targetId, {
          findingId: finding.id,
          kind: 'statement',
          version: 1,
          caseRevision: revision,
          payload: statement,
          reason: null,
          at: now,
        });
        await this.insertFindingRecord(actor, companyId, targetId, {
          findingId: finding.id,
          kind: 'classification',
          version: 1,
          caseRevision: revision,
          payload: { classification, by: 'team_leader' },
          reason: null,
          at: now,
        });
        return this.advance({
          actor,
          companyId,
          current,
          at: now,
          action: 'certification_case.finding_recorded',
          metadata: { stage, classification },
        });
      },
    });
  }

  /** One later version of a Finding: correction, classification or follow-up. */
  recordFindingUpdate({
    actor,
    caseId,
    findingId,
    kind,
    body,
    key,
  }: {
    actor: ActorContext;
    caseId: string;
    findingId: string;
    kind:
      | 'correction'
      | 'classification'
      | 'reclassification'
      | 'response'
      | 'plan_judgment'
      | 'verification';
    body: unknown;
    key: string | undefined;
  }): Promise<unknown> {
    const idempotencyKey = requireIdempotencyKey(key);
    const targetId = requireUuid(caseId);
    const targetFinding = requireUuid(findingId);
    return this.command({
      actor,
      role: kind === 'reclassification' ? 'approver' : 'auditor',
      kind: 'finding_record',
      key: idempotencyKey,
      fingerprint: commandFingerprint({ caseId, findingId, kind, body }),
      execute: async (companyId) => {
        const current = await this.lockOpenCase(
          actor,
          companyId,
          targetId,
          findingCommand(body, () => null).expectedRevision,
        );
        const steps = await this.steps(actor, companyId, targetId);
        if (kind === 'reclassification') {
          if (this.onTeam(actor, steps))
            throw stepConflict(
              'CERTIFICATION_INDEPENDENCE',
              'A member of the audit team cannot reclassify as approver.',
            );
        } else this.requireTeamLeader(actor, steps);
        const view = await this.finding(
          actor,
          companyId,
          targetId,
          targetFinding,
          steps,
        );
        const recordKind: FindingRecordKind =
          kind === 'correction'
            ? 'statement'
            : kind === 'reclassification'
              ? 'classification'
              : kind;
        let payload: object;
        let reason: string | null = null;
        let action: Parameters<
          AccountabilityService['recordCertificationEvent']
        >[0]['action'];
        let metadata: Record<string, string | number>;
        switch (kind) {
          case 'correction': {
            const input = findingCommand(body, findingStatement);
            if (input.reason === null)
              throw stepConflict(
                'CERTIFICATION_CORRECTION_REASON',
                'A correction states its reason.',
              );
            if (sameValue(view.statement, input.payload))
              throw unchangedCorrection();
            this.requireClassification(
              view.classification,
              view.stage,
              input.payload,
            );
            await this.requireAttachments(
              actor,
              companyId,
              targetId,
              input.payload.evidenceAttachmentIds,
            );
            payload = input.payload;
            reason = input.reason;
            action = 'certification_case.finding_corrected';
            metadata = { sequence: view.sequence };
            break;
          }
          case 'classification':
          case 'reclassification': {
            const input = findingCommand(body, (value) =>
              findingClassificationValue(
                inputObject(value, ['classification']).classification,
              ),
            );
            if (input.reason === null)
              throw stepConflict(
                'CERTIFICATION_CORRECTION_REASON',
                'A classification change states its reason.',
              );
            if (input.payload === view.classification)
              throw unchangedCorrection();
            this.requireClassification(
              input.payload,
              view.stage,
              view.statement,
            );
            payload = {
              classification: input.payload,
              by: kind === 'reclassification' ? 'approver' : 'team_leader',
            };
            reason = input.reason;
            action = 'certification_case.finding_reclassified';
            metadata = {
              sequence: view.sequence,
              classification: input.payload,
            };
            break;
          }
          case 'response': {
            const input = findingCommand(body, nonconformityResponse);
            if (
              !isNonconformity(view.classification) ||
              view.status === 'verified_effective'
            )
              throw stepConflict(
                'CERTIFICATION_FINDING_NOT_OPEN',
                'Only an open nonconformity receives a response.',
              );
            // A response that awaits its judgment is only replaced by a
            // different one; the same response again changes nothing.
            const pending = view.records
              .filter((record) => record.kind === 'response')
              .at(-1);
            if (
              view.status === 'awaiting_plan_judgment' &&
              pending &&
              sameValue(pending.value, input.payload)
            )
              throw unchangedCorrection();
            await this.requireAttachments(
              actor,
              companyId,
              targetId,
              input.payload.evidenceAttachmentIds,
            );
            payload = input.payload;
            action = 'certification_case.nonconformity_response_recorded';
            metadata = { sequence: view.sequence };
            break;
          }
          case 'plan_judgment': {
            const input = findingCommand(body, planJudgment);
            if (view.status !== 'awaiting_plan_judgment')
              throw stepConflict(
                'CERTIFICATION_FINDING_NO_RESPONSE',
                'Judge the plan of a nonconformity after its response.',
              );
            payload = input.payload;
            action = 'certification_case.nonconformity_plan_judged';
            metadata = {
              sequence: view.sequence,
              outcome: input.payload.outcome,
            };
            break;
          }
          case 'verification': {
            const input = findingCommand(body, nonconformityVerification);
            if (view.status !== 'plan_adequate')
              throw stepConflict(
                'CERTIFICATION_FINDING_PLAN_NOT_ADEQUATE',
                'Verify a nonconformity once its plan is adequate.',
              );
            // Past its six-month limit the journey stops (PRD sections 9-10).
            if (view.overdue)
              throw stepConflict(
                'CERTIFICATION_FINDING_LIMIT_PASSED',
                'The six-month limit of this nonconformity has passed; this journey cannot continue.',
              );
            await this.requireAttachments(
              actor,
              companyId,
              targetId,
              input.payload.evidenceAttachmentIds,
            );
            payload = input.payload;
            action = 'certification_case.nonconformity_verified';
            metadata = {
              sequence: view.sequence,
              outcome: input.payload.outcome,
            };
            break;
          }
        }
        const version =
          view.records.filter((record) => record.kind === recordKind).length +
          1;
        const now = this.clock.now();
        await this.insertFindingRecord(actor, companyId, targetId, {
          findingId: targetFinding,
          kind: recordKind,
          version,
          caseRevision: current.revision + 1,
          payload,
          reason,
          at: now,
        });
        return this.advance({
          actor,
          companyId,
          current,
          at: now,
          action,
          metadata,
        });
      },
    });
  }

  /** The team leader recommends once no Finding blocks. */
  recordRecommendation(input: CaseCommandInput): Promise<unknown> {
    return this.versionedStep({
      ...input,
      role: 'auditor',
      kind: 'recommendation',
      step: 'recommendation',
      parse: recommendation,
      action: 'certification_case.recommendation_recorded',
      check: async ({ steps, companyId, payload }) => {
        this.requireTeamLeader(input.actor, steps);
        if (!latest(steps, 'stage_2_report'))
          throw stepConflict(
            'CERTIFICATION_STAGE_2_NOT_REPORTED',
            'Recommend after the Stage 2 report.',
          );
        const findings = await this.findings(
          input.actor,
          companyId,
          requireUuid(input.caseId),
          steps,
        );
        if (findings.some(findingBlocks))
          throw stepConflict(
            'CERTIFICATION_FINDINGS_OPEN',
            'Every nonconformity must be followed up before the recommendation.',
          );
        if (latest(steps, 'decision'))
          throw stepConflict(
            'CERTIFICATION_DECIDED',
            'The Case is already decided.',
          );
        return { recommendation: payload.recommendation };
      },
    });
  }

  /** An approver outside the team reviews the dossier item by item. */
  reviewDossier(input: CaseCommandInput): Promise<unknown> {
    return this.versionedStep({
      ...input,
      role: 'approver',
      kind: 'dossier_review',
      step: 'dossier_review',
      parse: dossierReview,
      action: 'certification_case.dossier_reviewed',
      check: ({ steps, payload }) => {
        this.requireIndependent(input.actor, steps);
        if (!latest(steps, 'recommendation'))
          throw stepConflict(
            'CERTIFICATION_RECOMMENDATION_MISSING',
            'Review the dossier after the team recommendation.',
          );
        if (latest(steps, 'decision'))
          throw stepConflict(
            'CERTIFICATION_DECIDED',
            'The Case is already decided.',
          );
        return Promise.resolve({ complete: dossierComplete(payload) ? 1 : 0 });
      },
    });
  }

  /** The immutable Certification Decision, by an approver outside the team. */
  decide(input: CaseCommandInput): Promise<unknown> {
    return this.versionedStep({
      ...input,
      role: 'approver',
      kind: 'decision',
      step: 'decision',
      parse: certificationDecision,
      action: 'certification_case.decision_recorded',
      check: async ({ steps, companyId, payload }) => {
        this.requireIndependent(input.actor, steps);
        if (latest(steps, 'decision'))
          throw stepConflict(
            'CERTIFICATION_DECIDED',
            'The Certification Decision is recorded once.',
          );
        if (
          approvedTeam(steps)?.members.some((member) =>
            sameName(member.name, payload.decidedBy),
          )
        )
          throw stepConflict(
            'CERTIFICATION_INDEPENDENCE',
            'The decision maker cannot be a member of the audit team.',
          );
        if (payload.decisionFormAttachmentId)
          await this.requireAttachment(
            input.actor,
            companyId,
            requireUuid(input.caseId),
            payload.decisionFormAttachmentId,
            ['decision_form'],
          );
        const failures = await this.decisionFailures(
          input.actor,
          companyId,
          requireUuid(input.caseId),
          steps,
          payload,
        );
        if (failures.length)
          throw new ConflictException({
            code: 'CERTIFICATION_DECISION_PRECONDITIONS',
            message: 'The Certification Decision preconditions do not hold.',
            failures,
          });
        return { decision: payload.decision };
      },
      status: (payload) =>
        payload.decision === 'refused' ? 'refused' : undefined,
    });
  }

  /** The Certificate data agreed with the client, after the Stage 2 report. */
  recordCertificateData(input: CaseCommandInput): Promise<unknown> {
    return this.versionedStep({
      ...input,
      role: 'programme_manager',
      kind: 'certificate_data',
      step: 'certificate_data',
      parse: certificateData,
      action: 'certification_case.certificate_data_agreed',
      check: async ({ steps, companyId, payload }) => {
        if (!latest(steps, 'stage_2_report'))
          throw stepConflict(
            'CERTIFICATION_STAGE_2_NOT_REPORTED',
            'Agree the Certificate data after the Stage 2 report.',
          );
        await this.requireAttachment(
          input.actor,
          companyId,
          requireUuid(input.caseId),
          payload.agreementAttachmentId,
          ['certificate_data'],
        );
        return { languages: payload.texts.length };
      },
    });
  }

  /** The approver records the Certificate after a granting decision. */
  recordCertificate({
    actor,
    caseId,
    body,
    key,
  }: CaseCommandInput): Promise<unknown> {
    const idempotencyKey = requireIdempotencyKey(key);
    const targetId = requireUuid(caseId);
    return this.command({
      actor,
      role: 'approver',
      kind: 'certificate',
      key: idempotencyKey,
      fingerprint: commandFingerprint({ caseId, body }),
      execute: async (companyId) => {
        const input = certificateCommand(body);
        const current = await this.lockOpenCase(
          actor,
          companyId,
          targetId,
          input.expectedRevision,
        );
        const steps = await this.steps(actor, companyId, targetId);
        this.requireIndependent(actor, steps);
        const decided = latest(steps, 'decision');
        const decision = decided ? decisionVersion(decided).value : undefined;
        if (decision?.decision !== 'granted')
          throw stepConflict(
            'CERTIFICATION_NOT_GRANTED',
            'A Certificate follows a granting Certification Decision.',
          );
        const agreed = latest(steps, 'certificate_data');
        if (!agreed)
          throw stepConflict(
            'CERTIFICATION_CERTIFICATE_DATA_MISSING',
            'Agree the Certificate data with the client first.',
          );
        const data = certificateDataVersion(agreed).value;
        if (!sameCertificateTexts(data.texts, decision.grantedTexts))
          throw stepConflict(
            'CERTIFICATION_CERTIFICATE_DATA_DIFFERS',
            'The agreed Certificate data must state exactly what the decision grants.',
          );
        const signatory = input.signedBy;
        if (
          signatory !== null &&
          approvedTeam(steps)?.members.some((member) =>
            sameName(member.name, signatory),
          )
        )
          throw stepConflict(
            'CERTIFICATION_INDEPENDENCE',
            'A member of the audit team cannot sign the Certificate.',
          );
        await this.requireAttachment(
          actor,
          companyId,
          targetId,
          input.attachmentId,
          ['certificate'],
        );
        const [taken] = await this.database.connection
          .select({ id: certificationCertificates.id })
          .from(certificationCertificates)
          .where(
            and(
              eq(certificationCertificates.workspaceId, actor.workspaceId),
              eq(certificationCertificates.companyId, companyId),
              eq(certificationCertificates.number, input.number),
            ),
          );
        if (taken)
          throw stepConflict(
            'CERTIFICATION_CERTIFICATE_NUMBER_TAKEN',
            'This Certificate number is already used in the Company.',
          );
        const now = this.clock.now();
        const validity = certificateValidity(decision.decidedOn);
        await this.database.connection
          .insert(certificationCertificates)
          .values({
            workspaceId: actor.workspaceId,
            companyId,
            caseId: targetId,
            caseRevision: current.revision + 1,
            number: input.number,
            ...validity,
            texts: data.texts,
            signedBy: input.signedBy,
            signedByFunction: input.signedByFunction,
            attachmentId: input.attachmentId,
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
          action: 'certification_case.certificate_recorded',
          metadata: { validUntil: validity.validUntil },
          status: 'certified',
        });
      },
    });
  }

  /** Shared shape of a versioned step command: parse, check, append. */
  private versionedStep<T extends object>(
    input: CaseCommandInput & {
      role: Exclude<CertificationRole, 'reader'>;
      kind: CommandKind;
      step: StepRow['step'];
      parse: (value: unknown) => T;
      action: Parameters<
        AccountabilityService['recordCertificationEvent']
      >[0]['action'];
      check: (context: {
        steps: StepRow[];
        companyId: string;
        payload: T;
      }) => Promise<Record<string, string | number>>;
      status?: (payload: T) => CaseRow['status'] | undefined;
    },
  ): Promise<unknown> {
    const idempotencyKey = requireIdempotencyKey(input.key);
    const targetId = requireUuid(input.caseId);
    return this.command({
      actor: input.actor,
      role: input.role,
      kind: input.kind,
      key: idempotencyKey,
      fingerprint: commandFingerprint({
        caseId: input.caseId,
        body: input.body,
      }),
      execute: async (companyId) => {
        const command = findingCommand(input.body, input.parse);
        const current = await this.lockOpenCase(
          input.actor,
          companyId,
          targetId,
          command.expectedRevision,
        );
        const steps = await this.steps(input.actor, companyId, targetId);
        const metadata = await input.check({
          steps,
          companyId,
          payload: command.payload,
        });
        const previous = latest(steps, input.step);
        const version = (previous?.version ?? 0) + 1;
        if ((version === 1) !== (command.reason === null))
          throw stepConflict(
            'CERTIFICATION_CORRECTION_REASON',
            'A new version states its reason; a first record has none.',
          );
        const status = input.status?.(command.payload);
        return this.appendStep({
          actor: input.actor,
          companyId,
          current,
          step: input.step,
          version,
          replaces: previous,
          payload: command.payload,
          reason: command.reason,
          action: input.action,
          metadata: { version, ...metadata },
          ...(status ? { status } : {}),
        });
      },
    });
  }

  /** Every unmet precondition of a Certification Decision, as codes. */
  private async decisionFailures(
    actor: ActorContext,
    companyId: string,
    caseId: string,
    steps: readonly StepRow[],
    decision: ReturnType<typeof certificationDecision>,
  ): Promise<string[]> {
    const failures: string[] = [];
    const review = latest(steps, 'application_review');
    if (!review || reviewVersion(review).value.outcome !== 'accepted')
      failures.push('APPLICATION_NOT_ACCEPTED');
    if (!latest(steps, 'duration')) failures.push('DURATION_MISSING');
    if (!latest(steps, 'agreement')) failures.push('AGREEMENT_MISSING');
    if (!approvedTeam(steps)) failures.push('TEAM_NOT_APPROVED');
    const stage1 = latest(steps, 'stage_1_report');
    if (!stage1 || stage1Version(stage1).value.conclusion !== 'ready')
      failures.push('STAGE_1_NOT_READY');
    if (!latest(steps, 'stage_2_report')) failures.push('STAGE_2_NOT_REPORTED');
    const findings = await this.findings(actor, companyId, caseId, steps);
    if (findings.some(findingBlocks)) failures.push('FINDINGS_OPEN');
    if (findings.some((finding) => finding.overdue))
      failures.push('FINDINGS_OVERDUE');
    const recommended = latest(steps, 'recommendation');
    if (!recommended) failures.push('RECOMMENDATION_MISSING');
    else if (
      decision.decision === 'granted' &&
      recommendationVersion(recommended).value.recommendation !== 'grant'
    )
      failures.push('GRANT_AGAINST_RECOMMENDATION');
    const reviewed = latest(steps, 'dossier_review');
    if (!reviewed || !dossierComplete(dossierReviewVersion(reviewed).value))
      failures.push('DOSSIER_REVIEW_INCOMPLETE');
    if (decision.decidedOn > this.clock.now().toISOString().slice(0, 10))
      failures.push('DECISION_IN_FUTURE');
    return failures;
  }

  /** Refuses an actor linked to any member of any team version. */
  private requireIndependent(actor: ActorContext, steps: readonly StepRow[]) {
    if (this.onTeam(actor, steps))
      throw stepConflict(
        'CERTIFICATION_INDEPENDENCE',
        'A member of the audit team cannot review, decide or issue.',
      );
  }

  private async certificate(
    actor: ActorContext,
    companyId: string,
    caseId: string,
  ): Promise<CertificateRecord | null> {
    const [row] = await this.database.connection
      .select()
      .from(certificationCertificates)
      .where(
        and(
          eq(certificationCertificates.workspaceId, actor.workspaceId),
          eq(certificationCertificates.companyId, companyId),
          eq(certificationCertificates.caseId, caseId),
        ),
      );
    if (!row) return null;
    const texts = persisted(() => certificateTexts(row.texts));
    return {
      id: row.id,
      number: row.number,
      validFrom: row.validFrom,
      validUntil: row.validUntil,
      firstSurveillanceBy: row.firstSurveillanceBy,
      texts,
      signedBy: row.signedBy,
      signedByFunction: row.signedByFunction,
      attachmentId: row.attachmentId,
      recordedBy: {
        workspaceMembershipId: row.actorMembershipId,
        displayName: row.actorDisplayName,
      },
      recordedAt: row.recordedAt.toISOString(),
    };
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
      for (const row of rows) {
        const steps = await this.steps(actor, companyId, row.id);
        cases.push(
          this.summary(
            row,
            await this.legalName(actor, row),
            steps,
            await this.findings(actor, companyId, row.id, steps),
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
    role = 'programme_manager',
  }: {
    actor: ActorContext;
    role?: Exclude<CertificationRole, 'reader'>;
    kind: CommandKind;
    key: string;
    fingerprint: string;
    execute: (companyId: string) => Promise<{ caseId: string; at: Date }>;
  }): Promise<unknown> {
    return this.protect(() =>
      runIdempotentCommand(this.database, {
        fingerprint,
        authorize: () => this.authorize(actor, role),
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
    action: Parameters<
      AccountabilityService['recordCertificationEvent']
    >[0]['action'];
    metadata: Record<string, string | number>;
    status?: CaseRow['status'];
  }): Promise<{ caseId: string; at: Date }> {
    const { actor, companyId, current } = input;
    if (input.replaces && sameValue(input.replaces.payload, input.payload))
      throw unchangedCorrection();
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
    const findings = await this.findings(actor, companyId, caseId, steps);
    const summary = this.summary(
      row,
      await this.legalName(actor, row),
      steps,
      findings,
    );
    const application = latest(steps, 'application');
    const review = latest(steps, 'application_review');
    const duration = latest(steps, 'duration');
    const signed = latest(steps, 'agreement');
    const team = latest(steps, 'team');
    const decided = latest(steps, 'team_decision');
    return {
      ...summary,
      companyId: row.companyId,
      clientAccountId: row.clientAccountId,
      application: application ? applicationVersion(application) : null,
      applicationReview: review ? reviewVersion(review) : null,
      duration: duration ? durationVersion(duration) : null,
      agreement: signed ? agreementVersion(signed) : null,
      team: team ? teamVersion(team) : null,
      teamDecision: decided ? teamDecisionVersion(decided) : null,
      findings,
      recommendation: optionalVersion(
        steps,
        'recommendation',
        recommendationVersion,
      ),
      dossierReview: optionalVersion(
        steps,
        'dossier_review',
        dossierReviewVersion,
      ),
      decision: optionalVersion(steps, 'decision', decisionVersion),
      certificateData: optionalVersion(
        steps,
        'certificate_data',
        certificateDataVersion,
      ),
      certificate: await this.certificate(actor, companyId, caseId),
      stages: STAGE_STEPS.flatMap((step) => {
        const row = latest(steps, step);
        return row ? [stageStepVersion(row)] : [];
      }),
    };
  }

  private summary(
    row: CaseRow,
    legalName: string,
    steps: StepRow[],
    findings: readonly FindingView[],
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
      nextStep: nextStep(row, steps, findings),
      openedBy: {
        workspaceMembershipId: row.openedByMembershipId,
        displayName: row.openedByDisplayName,
      },
      openedAt: row.openedAt.toISOString(),
    };
  }

  private requireClassification(
    classification: FindingView['classification'],
    stage: FindingView['stage'],
    statement: FindingView['statement'],
  ): void {
    if (
      classification !== 'opportunity_for_improvement' &&
      (statement.clause === null || statement.area === null)
    )
      throw findingRule(
        'CERTIFICATION_FINDING_CLAUSE_REQUIRED',
        'State the requirement clause and the process or area.',
      );
    if (!allowedInStage(classification, stage))
      throw findingRule(
        'CERTIFICATION_FINDING_CLASSIFICATION_STAGE',
        'An area of concern belongs to Stage 1 only.',
      );
    if (
      isNonconformity(classification) &&
      !statement.evidenceAttachmentIds.length
    )
      throw findingRule(
        'CERTIFICATION_FINDING_EVIDENCE_REQUIRED',
        'A nonconformity cites at least one exact evidence document.',
      );
  }

  /** Every attachment must belong to this Case. */
  private async requireAttachments(
    actor: ActorContext,
    companyId: string,
    caseId: string,
    attachmentIds: readonly string[],
  ): Promise<void> {
    for (const attachmentId of attachmentIds)
      await this.requireAttachment(
        actor,
        companyId,
        caseId,
        attachmentId,
        DOCUMENT_ROLES,
      );
  }

  private async insertFindingRecord(
    actor: ActorContext,
    companyId: string,
    caseId: string,
    input: {
      findingId: string;
      kind: FindingRecordKind;
      version: number;
      caseRevision: number;
      payload: object;
      reason: string | null;
      at: Date;
    },
  ): Promise<void> {
    await this.database.connection.insert(certificationFindingRecords).values({
      workspaceId: actor.workspaceId,
      companyId,
      caseId,
      findingId: input.findingId,
      kind: input.kind,
      version: input.version,
      caseRevision: input.caseRevision,
      payload: input.payload,
      reason: input.reason,
      actorMembershipId: actor.workspaceMembershipId,
      actorInternalUserId: actor.internalUserId,
      actorDisplayName: actor.displayName,
      recordedAt: input.at,
    });
  }

  /** Every Finding of the Case with its derived status, in sequence order. */
  private async findings(
    actor: ActorContext,
    companyId: string,
    caseId: string,
    steps: readonly StepRow[],
  ): Promise<FindingView[]> {
    const rows = await this.database.connection
      .select()
      .from(certificationFindings)
      .where(
        and(
          eq(certificationFindings.workspaceId, actor.workspaceId),
          eq(certificationFindings.companyId, companyId),
          eq(certificationFindings.caseId, caseId),
        ),
      )
      .orderBy(asc(certificationFindings.sequence));
    if (!rows.length) return [];
    const records = await this.database.connection
      .select()
      .from(certificationFindingRecords)
      .where(
        and(
          eq(certificationFindingRecords.workspaceId, actor.workspaceId),
          eq(certificationFindingRecords.companyId, companyId),
          eq(certificationFindingRecords.caseId, caseId),
        ),
      )
      .orderBy(
        asc(certificationFindingRecords.caseRevision),
        asc(certificationFindingRecords.kind),
        asc(certificationFindingRecords.version),
      );
    const today = this.clock.now().toISOString().slice(0, 10);
    return rows.map((row) => {
      const plan = latest(
        steps,
        row.stage === 'stage_1' ? 'stage_1_plan' : 'stage_2_plan',
      );
      if (!plan) throw new InternalServerErrorException();
      return persisted(() =>
        findingView({
          id: row.id,
          stage: row.stage,
          sequence: row.sequence,
          stageEnd: stagePlanVersion(plan).value.endDate,
          today,
          records: records
            .filter((record) => record.findingId === row.id)
            .map(findingRecordView),
        }),
      );
    });
  }

  private async finding(
    actor: ActorContext,
    companyId: string,
    caseId: string,
    findingId: string,
    steps: readonly StepRow[],
  ): Promise<FindingView> {
    const view = (await this.findings(actor, companyId, caseId, steps)).find(
      (entry) => entry.id === findingId,
    );
    if (!view) throw new NotFoundException();
    return view;
  }

  /** Refuses unless the actor is linked to the leader of the approved team. */
  private requireTeamLeader(actor: ActorContext, steps: readonly StepRow[]) {
    const team = approvedTeam(steps);
    if (
      !team?.members.some(
        (member) =>
          member.role === 'team_leader' &&
          member.workspaceMembershipId === actor.workspaceMembershipId,
      )
    )
      throw stepConflict(
        'CERTIFICATION_NOT_TEAM_LEADER',
        'Only the leader of the approved audit team records this.',
      );
  }

  /** Refuses an attachment of this Case unless it has one of the expected roles. */
  private async requireAttachment(
    actor: ActorContext,
    companyId: string,
    caseId: string,
    attachmentId: string,
    roles: readonly (typeof certificationCaseDocuments.$inferSelect)['role'][],
  ): Promise<void> {
    const [attached] = await this.database.connection
      .select({ role: certificationCaseDocuments.role })
      .from(certificationCaseDocuments)
      .where(
        and(
          eq(certificationCaseDocuments.workspaceId, actor.workspaceId),
          eq(certificationCaseDocuments.companyId, companyId),
          eq(certificationCaseDocuments.caseId, caseId),
          eq(certificationCaseDocuments.id, attachmentId),
        ),
      );
    if (!attached || !roles.includes(attached.role))
      throw stepConflict(
        'CERTIFICATION_ATTACHMENT_ROLE',
        `Attach the document with one of these roles first: ${roles.join(', ')}.`,
      );
  }

  /** Whether the actor is linked to a member of any proposed team version. */
  private onTeam(actor: ActorContext, steps: readonly StepRow[]): boolean {
    return steps
      .filter((row) => row.step === 'team')
      .some((row) =>
        teamMembershipIds(teamVersion(row).value).includes(
          actor.workspaceMembershipId,
        ),
      );
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

function nextStep(
  row: CaseRow,
  steps: StepRow[],
  findings: readonly FindingView[],
): CertificationNextStep {
  if (row.status !== 'open') return null;
  if (!latest(steps, 'application')) return 'application';
  if (!latest(steps, 'application_review')) return 'application_review';
  if (!latest(steps, 'duration')) return 'duration';
  if (!latest(steps, 'agreement')) return 'agreement';
  const team = latest(steps, 'team');
  if (!team) return 'team';
  const decided = latest(steps, 'team_decision');
  if (!decided) return 'team_decision';
  const decision = teamDecisionVersion(decided).value;
  if (decision.teamVersion !== team.version) return 'team_decision';
  if (decision.decision === 'returned') return 'team';
  if (!latest(steps, 'stage_1_plan')) return 'stage_1_plan';
  const stage1 = latest(steps, 'stage_1_report');
  if (!stage1 || stage1Version(stage1).value.conclusion !== 'ready')
    return 'stage_1_report';
  if (!latest(steps, 'stage_2_plan')) return 'stage_2_plan';
  if (!latest(steps, 'stage_2_report')) return 'stage_2_report';
  if (findings.some(findingBlocks)) return 'findings_follow_up';
  if (!latest(steps, 'recommendation')) return 'recommendation';
  if (!latest(steps, 'dossier_review')) return 'dossier_review';
  if (!latest(steps, 'decision')) return 'decision';
  if (!latest(steps, 'certificate_data')) return 'certificate_data';
  return 'certificate';
}

function stepConflict(code: string, message: string): ConflictException {
  return new ConflictException({ code, message });
}

/** A correction that changes nothing would only add false history. */
function unchangedCorrection(): ConflictException {
  return stepConflict(
    'CERTIFICATION_CORRECTION_UNCHANGED',
    'The correction changes no recorded value.',
  );
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

/** Names compared without case, accents or repeated spaces. */
function sameName(left: string, right: string): boolean {
  const normal = (value: string) =>
    value
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .replace(/\s+/gu, ' ')
      .trim()
      .toLocaleLowerCase('en');
  return normal(left) === normal(right);
}

type CaseCommandInput = {
  actor: ActorContext;
  caseId: string;
  body: unknown;
  key: string | undefined;
};

function recommendationVersion(
  row: StepRow,
): Extract<CertificationStepVersion, { step: 'recommendation' }> {
  return {
    ...base(row),
    step: 'recommendation',
    value: persisted(() => recommendation(row.payload)),
  };
}

function dossierReviewVersion(
  row: StepRow,
): Extract<CertificationStepVersion, { step: 'dossier_review' }> {
  return {
    ...base(row),
    step: 'dossier_review',
    value: persisted(() => dossierReview(row.payload)),
  };
}

function decisionVersion(
  row: StepRow,
): Extract<CertificationStepVersion, { step: 'decision' }> {
  return {
    ...base(row),
    step: 'decision',
    value: persisted(() => certificationDecision(row.payload)),
  };
}

function certificateDataVersion(
  row: StepRow,
): Extract<CertificationStepVersion, { step: 'certificate_data' }> {
  return {
    ...base(row),
    step: 'certificate_data',
    value: persisted(() => certificateData(row.payload)),
  };
}

function optionalVersion<T>(
  steps: readonly StepRow[],
  step: StepRow['step'],
  present: (row: StepRow) => T,
): T | null {
  const row = latest(steps, step);
  return row ? present(row) : null;
}

/** The latest team version when its latest decision approves it. */
function approvedTeam(steps: readonly StepRow[]) {
  const team = latest(steps, 'team');
  const decided = latest(steps, 'team_decision');
  if (!team || !decided) return undefined;
  const decision = teamDecisionVersion(decided).value;
  return decision.decision === 'approved' &&
    decision.teamVersion === team.version
    ? teamVersion(team).value
    : undefined;
}

function stage1Version(
  row: StepRow,
): Extract<StageStepVersion, { step: 'stage_1_report' }> {
  return {
    ...base(row),
    step: 'stage_1_report',
    value: persisted(() => stage1Report(row.payload)),
  };
}

function stagePlanVersion(row: StepRow) {
  return { ...base(row), value: persisted(() => stagePlan(row.payload)) };
}

function stageStepVersion(row: StepRow): StageStepVersion {
  switch (row.step) {
    case 'stage_1_plan':
      return { ...stagePlanVersion(row), step: 'stage_1_plan' };
    case 'stage_2_plan':
      return { ...stagePlanVersion(row), step: 'stage_2_plan' };
    case 'stage_1_report':
      return stage1Version(row);
    case 'stage_2_report':
      return {
        ...base(row),
        step: 'stage_2_report',
        value: persisted(() => stage2Report(row.payload)),
      };
    default:
      throw new InternalServerErrorException('Not a Stage step.');
  }
}

function teamVersion(row: StepRow): TeamVersion {
  return {
    ...base(row),
    step: 'team',
    value: persisted(() => auditTeam(row.payload)),
  };
}

function teamDecisionVersion(row: StepRow): TeamDecisionVersion {
  return {
    ...base(row),
    step: 'team_decision',
    value: persisted(() => teamDecision(row.payload)),
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
    case 'team':
      return teamVersion(row);
    case 'team_decision':
      return teamDecisionVersion(row);
    case 'stage_1_plan':
    case 'stage_1_report':
    case 'stage_2_plan':
    case 'stage_2_report':
      return stageStepVersion(row);
    case 'recommendation':
      return recommendationVersion(row);
    case 'dossier_review':
      return dossierReviewVersion(row);
    case 'decision':
      return decisionVersion(row);
    case 'certificate_data':
      return certificateDataVersion(row);
  }
  return unexpectedStep(row.step);
}

function unexpectedStep(value: never): never {
  throw new InternalServerErrorException(`Unexpected step ${String(value)}`);
}
