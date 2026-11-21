import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { and, count, eq } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import {
  requireIdempotencyKey,
  requireUuid,
} from '../access/access-command-validation.js';
import { CertificationTeamAccessService } from '../access/certification-team-access.service.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { SERVER_CLOCK, type ServerClock } from '../clock/server-clock.js';
import {
  commandFingerprint,
  staleVersionConflict,
} from '../command/idempotent-command.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  certificationFindingRecords,
  certificationFindings,
  certificationCaseDocuments,
} from '../database/schema/certification.js';
import { workspaceMemberships } from '../database/schema/core.js';
import {
  latestBusinessDate,
  sameName,
  type ActAttribution,
} from './certification-attribution.js';
import {
  teamCommand,
  teamDecisionCommand,
  teamMembershipIds,
  teamWithoutConflict,
} from './certification-team.js';
import {
  allowedInStage,
  classification as findingClassificationValue,
  findingCommand,
  findingRule,
  findingStatement,
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
import { inputObject, agreementCommand } from './certification.validation.js';
import { CertificationCaseTransactions } from './certification-case-transactions.js';
import { CertificationCaseReadModel } from './certification-case-read-model.js';
import {
  requireUndecided,
  latest,
  stepConflict,
  teamDecisionVersion,
  teamVersion,
  durationVersion,
  stagePlanVersion,
  sameValue,
  unchangedCorrection,
  approvedTeam,
  stage1Version,
  stage2Version,
  dossierReviewVersion,
} from './certification-case-versions.js';
import type { StepRow } from './certification-case-versions.js';

/** Owns audit team approval, Stage records and Finding commands. */
@Injectable()
export class CertificationAuditService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly teamAccess: CertificationTeamAccessService,
    @Inject(SERVER_CLOCK) private readonly clock: ServerClock,
    private readonly transactions: CertificationCaseTransactions,
    private readonly repository: CertificationCaseReadModel,
  ) {}

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
    return this.transactions.command({
      actor,
      kind: 'agreement',
      key: idempotencyKey,
      fingerprint: commandFingerprint({ caseId, body }),
      execute: async (companyId) => {
        const input = agreementCommand(body);
        const current = await this.repository.lockOpenCase(
          actor,
          companyId,
          targetId,
          input.expectedRevision,
        );
        const steps = await this.repository.steps(actor, companyId, targetId);
        requireUndecided(steps);
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
        if (input.agreement.signedOn > latestBusinessDate(this.clock.now()))
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
        return this.transactions.appendStep({
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
    return this.transactions.command({
      actor,
      kind: 'team',
      key: idempotencyKey,
      fingerprint: commandFingerprint({ caseId, body }),
      execute: async (companyId) => {
        const input = teamCommand(body);
        const current = await this.repository.lockOpenCase(
          actor,
          companyId,
          targetId,
          input.expectedRevision,
        );
        const steps = await this.repository.steps(actor, companyId, targetId);
        requireUndecided(steps);
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
        // Whoever decided on the team, reviewed the dossier or recorded the
        // decision stays outside every later team version.
        const deciders = steps
          .filter((row) =>
            ['team_decision', 'dossier_review', 'decision'].includes(row.step),
          )
          .map((row) => row.actorMembershipId);
        if (
          teamMembershipIds(input.team).some((membershipId) =>
            deciders.includes(membershipId),
          )
        )
          throw stepConflict(
            'CERTIFICATION_INDEPENDENCE',
            'A member who decided on the team, reviewed the dossier or recorded the decision cannot join the audit team.',
          );
        // So does a person who did so, or approved a Stage report, on behalf
        // of the certification body.
        const actedFor = namedActingPersons(steps);
        if (
          input.team.members.some((member) =>
            actedFor.some((name) => sameName(member.name, name)),
          )
        )
          throw stepConflict(
            'CERTIFICATION_INDEPENDENCE',
            'A person who decided on the team, reviewed the dossier or approved a Stage report on behalf of the certification body cannot join the audit team.',
          );
        const facts = this.transactions.acceptedApplication(steps);
        if (facts.consultant.used && input.team.impartialityAnalysis === null)
          throw new BadRequestException({
            code: 'CERTIFICATION_TEAM_ANALYSIS_REQUIRED',
            message:
              'The applicant declared a consultant: document the impartiality analysis of the team.',
          });
        await this.repository.requireAttachments(
          actor,
          companyId,
          targetId,
          input.team.impartialityAnalysis?.evidenceAttachmentIds ?? [],
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
        return this.transactions.appendStep({
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
    return this.transactions.command({
      actor,
      role: 'approver',
      kind: 'team_decision',
      key: idempotencyKey,
      fingerprint: commandFingerprint({ caseId, body }),
      execute: async (companyId) => {
        const input = teamDecisionCommand(body);
        const current = await this.repository.lockOpenCase(
          actor,
          companyId,
          targetId,
          input.expectedRevision,
        );
        const steps = await this.repository.steps(actor, companyId, targetId);
        requireUndecided(steps);
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
        if (this.transactions.onTeam(actor, steps))
          throw stepConflict(
            'CERTIFICATION_INDEPENDENCE',
            'A member of the audit team cannot approve it.',
          );
        this.transactions.requireNotNamedOnTeam(
          steps,
          input.decision.onBehalf?.actedBy,
        );
        await this.transactions.requireAct(
          actor,
          companyId,
          targetId,
          input.decision.onBehalf,
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
        return this.transactions.appendStep({
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
    return this.transactions.command({
      actor,
      kind: 'stage_plan',
      key: idempotencyKey,
      fingerprint: commandFingerprint({ caseId, stage, body }),
      execute: async (companyId) => {
        const input = stageCommand(body, stagePlan);
        const current = await this.repository.lockOpenCase(
          actor,
          companyId,
          targetId,
          input.expectedRevision,
        );
        const steps = await this.repository.steps(actor, companyId, targetId);
        requireUndecided(steps);
        const stage1 = await this.requirePlanReadiness({
          actor,
          companyId,
          caseId: targetId,
          stage,
          steps,
        });
        if (stage1) {
          const value = stage1;
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
        await this.repository.requireAttachment(
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
        return this.transactions.appendStep({
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
    const step = stage === 'stage_1' ? 'stage_1_report' : 'stage_2_report';
    return this.transactions.command({
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
        const current = await this.repository.lockOpenCase(
          actor,
          companyId,
          targetId,
          input.expectedRevision,
        );
        const steps = await this.repository.steps(actor, companyId, targetId);
        requireUndecided(steps);
        const plan = this.requireReportReadiness(actor, steps, stage);
        const planned = stagePlanVersion(plan).value;
        if (input.payload.reportDate < planned.startDate)
          throw stepConflict(
            'CERTIFICATION_STAGE_DATES',
            'A report is dated on or after the Stage start.',
          );
        await this.repository.requireAttachment(
          actor,
          companyId,
          targetId,
          input.payload.reportAttachmentId,
          ['report'],
        );
        if (input.payload.participantListAttachmentId)
          await this.repository.requireAttachment(
            actor,
            companyId,
            targetId,
            input.payload.participantListAttachmentId,
            ['participant_list'],
          );
        // Conservative default until the certification body confirms it: the
        // person approving a report on its behalf is not on the audit team.
        this.transactions.requireNotNamedOnTeam(
          steps,
          input.payload.certificationBodyApproval?.actedBy,
        );
        await this.transactions.requireAct(
          actor,
          companyId,
          targetId,
          input.payload.certificationBodyApproval,
        );
        if (
          'annexAttachmentId' in input.payload &&
          input.payload.annexAttachmentId
        )
          await this.repository.requireAttachment(
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
        return this.transactions.appendStep({
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
    return this.transactions.command({
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
        const current = await this.repository.lockOpenCase(
          actor,
          companyId,
          targetId,
          input.expectedRevision,
        );
        const steps = await this.repository.steps(actor, companyId, targetId);
        requireUndecided(steps);
        this.transactions.requireTeamLeader(actor, steps);
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
        await this.repository.requireAttachments(
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
        return this.transactions.advance({
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
    return this.transactions.command({
      actor,
      role: kind === 'reclassification' ? 'approver' : 'auditor',
      kind: 'finding_record',
      key: idempotencyKey,
      fingerprint: commandFingerprint({ caseId, findingId, kind, body }),
      execute: async (companyId) => {
        const current = await this.repository.lockOpenCase(
          actor,
          companyId,
          targetId,
          findingCommand(body, () => null).expectedRevision,
        );
        const steps = await this.repository.steps(actor, companyId, targetId);
        requireUndecided(steps);
        if (kind === 'reclassification') {
          if (this.transactions.onTeam(actor, steps))
            throw stepConflict(
              'CERTIFICATION_INDEPENDENCE',
              'A member of the audit team cannot reclassify as approver.',
            );
        } else this.transactions.requireTeamLeader(actor, steps);
        const view = await this.repository.finding(
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
            await this.repository.requireAttachments(
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
            await this.repository.requireAttachments(
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
            await this.repository.requireAttachments(
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
        return this.transactions.advance({
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

  /** Read-only native step eligibility; ordinary commands retain all payload validation. */
  async stageDraftContextWithinTransaction(input: {
    actor: ActorContext;
    projectId: string;
    caseId: string;
    expectedRevision: number;
    step: 'stage_1_plan' | 'stage_2_plan' | 'stage_1_report' | 'stage_2_report';
  }) {
    const report =
      input.step === 'stage_1_report' || input.step === 'stage_2_report';
    const stage =
      input.step === 'stage_1_plan' || input.step === 'stage_1_report'
        ? 'stage_1'
        : 'stage_2';
    const companyId = await this.transactions.authorize(
      input.actor,
      report ? 'auditor' : 'programme_manager',
      { lock: false },
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
    if (row.status !== 'open')
      throw stepConflict(
        'CERTIFICATION_CASE_CLOSED',
        'This Certification Case is closed.',
      );
    const steps = await this.repository.steps(input.actor, companyId, row.id);
    requireUndecided(steps);
    if (report) this.requireReportReadiness(input.actor, steps, stage);
    else
      await this.requirePlanReadiness({
        actor: input.actor,
        companyId,
        caseId: row.id,
        stage,
        steps,
      });
    return {
      caseId: row.id,
      projectId: row.projectId,
      revision: row.revision,
      step: input.step,
    };
  }

  private async requirePlanReadiness(input: {
    actor: ActorContext;
    companyId: string;
    caseId: string;
    stage: AuditStage;
    steps: readonly StepRow[];
  }) {
    const { actor, companyId, caseId, stage, steps } = input;
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
      const findings = await this.repository.findings(
        actor,
        companyId,
        caseId,
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
      return value;
    }
    return null;
  }

  private requireReportReadiness(
    actor: ActorContext,
    steps: readonly StepRow[],
    stage: AuditStage,
  ) {
    this.transactions.requireTeamLeader(actor, steps);
    const plan = latest(
      steps,
      stage === 'stage_1' ? 'stage_1_plan' : 'stage_2_plan',
    );
    if (!plan)
      throw stepConflict(
        'CERTIFICATION_STAGE_NOT_PLANNED',
        'Record the Stage plan before its report.',
      );
    return plan;
  }

  /** Only a current programme manager may discover eligible internal auditors. */
  teamCandidates({
    actor,
    caseId,
    query,
  }: {
    actor: ActorContext;
    caseId: string;
    query: unknown;
  }) {
    const targetId = requireUuid(caseId);
    return this.transactions.read(
      actor,
      'programme_manager',
      async (companyId) => {
        await this.repository.visibleCase(actor, companyId, targetId);
        return {
          caseId: targetId,
          ...(await this.teamAccess.candidates({ actor, companyId, query })),
        };
      },
    );
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
}

/**
 * The persons named as acting for the certification body on a team decision,
 * a Stage report approval or a dossier review, in every recorded version.
 */
function namedActingPersons(steps: readonly StepRow[]): string[] {
  return steps
    .flatMap(actsOutsideTheTeam)
    .flatMap((act) => (act ? [act.actedBy] : []));
}

/** The acts on behalf of the certification body that one version records. */
function actsOutsideTheTeam(row: StepRow): (ActAttribution | null)[] {
  switch (row.step) {
    case 'team_decision':
      return [teamDecisionVersion(row).value.onBehalf];
    case 'stage_1_report':
      return [stage1Version(row).value.certificationBodyApproval];
    case 'stage_2_report':
      return [stage2Version(row).value.certificationBodyApproval];
    case 'dossier_review': {
      const { reviewedBy, approvedBy } = dossierReviewVersion(row).value;
      return [reviewedBy, approvedBy];
    }
    default:
      return [];
  }
}
