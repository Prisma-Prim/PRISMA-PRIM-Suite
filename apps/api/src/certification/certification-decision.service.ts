import { certificateRevisionCommand } from './certification-revisions.js';
import {
  certificateDraft,
  clientOpinion,
  certificateDraftApproval,
} from './certification-release.validation.js';
import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import {
  requireIdempotencyKey,
  requireUuid,
} from '../access/access-command-validation.js';
import { SERVER_CLOCK, type ServerClock } from '../clock/server-clock.js';
import { commandFingerprint } from '../command/idempotent-command.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  certificationCertificates,
  certificationCertificateRevisions,
  certificationCaseDocuments,
} from '../database/schema/certification.js';
import { currentExchanges } from './certification-exchanges.js';
import { latestBusinessDate } from './certification-attribution.js';
import {
  certificateCommand,
  certificateData,
  sameCertificateTexts,
  certificateValidity,
  certificationDecision,
  dossierComplete,
  dossierReview,
  recommendation,
} from './certification-decision.js';
import { findingBlocks } from './certification-findings.js';
import { CertificationCaseTransactions } from './certification-case-transactions.js';
import { CertificationCaseReadModel } from './certification-case-read-model.js';
import {
  latest,
  stepConflict,
  decisionVersion,
  certificateDataVersion,
  certificateDraftVersion,
  clientOpinionVersion,
  reviewVersion,
  approvedTeam,
  stage1Version,
  recommendationVersion,
  dossierReviewVersion,
} from './certification-case-versions.js';
import type {
  CaseCommandInput,
  StepRow,
} from './certification-case-versions.js';

/** Owns recommendation, independent decision and issued Certificate commands. */
@Injectable()
export class CertificationDecisionService {
  constructor(
    private readonly database: DatabaseContext,
    @Inject(SERVER_CLOCK) private readonly clock: ServerClock,
    private readonly transactions: CertificationCaseTransactions,
    private readonly repository: CertificationCaseReadModel,
  ) {}

  /** The team leader recommends once no Finding blocks. */
  recordRecommendation(input: CaseCommandInput): Promise<unknown> {
    return this.transactions.versionedStep({
      ...input,
      role: 'auditor',
      kind: 'recommendation',
      step: 'recommendation',
      parse: recommendation,
      action: 'certification_case.recommendation_recorded',
      check: async ({ steps, companyId, payload }) => {
        this.transactions.requireTeamLeader(input.actor, steps);
        if (!latest(steps, 'stage_2_report'))
          throw stepConflict(
            'CERTIFICATION_STAGE_2_NOT_REPORTED',
            'Recommend after the Stage 2 report.',
          );
        const findings = await this.repository.findings(
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
    return this.transactions.versionedStep({
      ...input,
      role: 'approver',
      kind: 'dossier_review',
      step: 'dossier_review',
      parse: dossierReview,
      action: 'certification_case.dossier_reviewed',
      check: async ({ steps, companyId, payload }) => {
        this.transactions.requireIndependent(input.actor, steps);
        for (const act of [payload.reviewedBy, payload.approvedBy]) {
          this.transactions.requireNotNamedOnTeam(steps, act?.actedBy);
          await this.transactions.requireAct(
            input.actor,
            companyId,
            requireUuid(input.caseId),
            act,
          );
        }
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
        return { complete: dossierComplete(payload) ? 1 : 0 };
      },
    });
  }

  /** The immutable Certification Decision, by an approver outside the team. */
  decide(input: CaseCommandInput): Promise<unknown> {
    return this.transactions.versionedStep({
      ...input,
      role: 'approver',
      kind: 'decision',
      statuses: ['open', 'refused', 'certified'],
      step: 'decision',
      parse: certificationDecision,
      action: 'certification_case.decision_recorded',
      check: async ({ steps, companyId, payload, current }) => {
        this.transactions.requireIndependent(input.actor, steps);
        // A later version corrects the texts or references of the same
        // outcome, with its reason, until the Certificate is recorded.
        const previous = latest(steps, 'decision');
        if (
          previous &&
          decisionVersion(previous).value.decision !== payload.decision
        )
          throw stepConflict(
            'CERTIFICATION_DECISION_OUTCOME_FIXED',
            'A correction keeps the decided outcome; only its texts and references change.',
          );
        if (current.status === 'certified') {
          const original = previous
            ? decisionVersion(previous).value
            : undefined;
          const fixed = [
            'decision',
            'decidedOn',
            'decidedBy',
            'decidedByFunction',
            'decisionFormAttachmentId',
            'independenceAttested',
            'rationale',
            'additionalInformation',
          ] as const;
          if (
            !original ||
            original.decision !== 'granted' ||
            fixed.some((key) => original[key] !== payload[key])
          )
            throw stepConflict(
              'CERTIFICATION_ISSUED_DECISION_FIXED',
              'After issuance only the granted texts may change.',
            );
          const agreed = latest(steps, 'certificate_data');
          if (
            payload.decision !== 'granted' ||
            !agreed ||
            !sameCertificateTexts(
              payload.grantedTexts,
              certificateDataVersion(agreed).value.texts,
            )
          )
            throw stepConflict(
              'CERTIFICATION_CERTIFICATE_DATA_DIFFERS',
              'The corrected decision must state exactly the latest agreed Certificate data.',
            );
        }
        this.transactions.requireNotNamedOnTeam(steps, payload.decidedBy);
        if (payload.decisionFormAttachmentId)
          await this.repository.requireAttachment(
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
        // The check runs again here, on the Case as this decision would leave
        // it: its dates and granted texts are compared too (R05, R11).
        const discrepancies =
          current.status === 'certified'
            ? []
            : await this.repository.blocking(
                input.actor,
                companyId,
                current,
                steps,
                (snapshot) => ({
                  ...snapshot,
                  steps: [
                    ...snapshot.steps,
                    {
                      id: 'candidate-decision',
                      version: (previous?.version ?? 0) + 1,
                      caseRevision: current.revision + 1,
                      reason: null,
                      recordedBy: {
                        workspaceMembershipId:
                          input.actor.workspaceMembershipId,
                        displayName: input.actor.displayName,
                      },
                      recordedAt: this.clock.now().toISOString(),
                      step: 'decision',
                      value: payload,
                    },
                  ],
                }),
              );
        if (discrepancies.length) failures.push('DISCREPANCIES_OPEN');
        if (failures.length)
          throw new ConflictException({
            code: 'CERTIFICATION_DECISION_PRECONDITIONS',
            message: 'The Certification Decision preconditions do not hold.',
            failures,
            discrepancies,
          });
        return { decision: payload.decision };
      },
      status: (payload) =>
        payload.decision === 'refused' ? 'refused' : undefined,
    });
  }

  /** The Certificate data agreed with the client, after the Stage 2 report. */
  recordCertificateData(input: CaseCommandInput): Promise<unknown> {
    return this.transactions.versionedStep({
      ...input,
      role: 'programme_manager',
      kind: 'certificate_data',
      statuses: ['open', 'certified'],
      step: 'certificate_data',
      parse: certificateData,
      action: 'certification_case.certificate_data_agreed',
      check: async ({ steps, companyId, payload }) => {
        if (!latest(steps, 'stage_2_report'))
          throw stepConflict(
            'CERTIFICATION_STAGE_2_NOT_REPORTED',
            'Agree the Certificate data after the Stage 2 report.',
          );
        await this.repository.requireAttachment(
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

  recordCertificateDraft(input: CaseCommandInput): Promise<unknown> {
    return this.transactions.versionedStep({
      ...input,
      role: 'programme_manager',
      kind: 'certificate_draft',
      step: 'certificate_draft',
      parse: certificateDraft,
      action: 'certification_case.certificate_draft_recorded',
      check: async ({ steps, companyId, payload }) => {
        const decision = latest(steps, 'decision');
        const data = latest(steps, 'certificate_data');
        if (!decision || decisionVersion(decision).value.decision !== 'granted')
          throw stepConflict(
            'CERTIFICATION_NOT_GRANTED',
            'A Certificate draft follows a granting decision.',
          );
        if (
          decision.id !== payload.decisionVersionId ||
          data?.id !== payload.certificateDataVersionId
        )
          throw stepConflict(
            'CERTIFICATION_DRAFT_OUTDATED',
            'The draft must state the latest decision and Certificate data versions.',
          );
        this.requireReleaseDate(payload.draftedOn);
        if (payload.draftedOn < decisionVersion(decision).value.decidedOn)
          throw stepConflict(
            'CERTIFICATION_RELEASE_DATE',
            'The draft follows the decision date.',
          );
        await this.repository.requireAttachment(
          input.actor,
          companyId,
          requireUuid(input.caseId),
          payload.attachmentId,
          ['certificate_draft'],
        );
        return {};
      },
    });
  }

  recordClientOpinion(input: CaseCommandInput): Promise<unknown> {
    return this.transactions.versionedStep({
      ...input,
      role: 'programme_manager',
      kind: 'client_opinion',
      step: 'client_opinion',
      parse: clientOpinion,
      action: 'certification_case.client_opinion_recorded',
      check: async ({ steps, companyId, payload }) => {
        const draft = latest(steps, 'certificate_draft');
        if (!draft || draft.id !== payload.draftVersionId)
          throw stepConflict(
            'CERTIFICATION_DRAFT_OUTDATED',
            'Record the opinion against the current draft.',
          );
        this.requireReleaseDate(payload.businessDate);
        if (
          payload.businessDate < certificateDraftVersion(draft).value.draftedOn
        )
          throw stepConflict(
            'CERTIFICATION_RELEASE_DATE',
            'The opinion follows the draft date.',
          );
        const previous = steps
          .filter((step) => step.step === 'client_opinion')
          .map(clientOpinionVersion)
          .filter((step) => step.value.draftVersionId === draft.id);
        if (previous.some((step) => step.value.outcome === 'changes_requested'))
          throw stepConflict(
            'CERTIFICATION_NEW_DRAFT_REQUIRED',
            'Record a new draft after changes are requested.',
          );
        if (payload.outcome !== 'skipped') {
          const exchanges = await this.repository.exchangeVersions(
            input.actor,
            companyId,
            requireUuid(input.caseId),
          );
          const received = exchanges.find(
            (exchange) => exchange.id === payload.exchangeRecordId,
          );
          const sent = currentExchanges(exchanges).find(
            (exchange) =>
              exchange.direction === 'sent' &&
              exchange.itemKind === 'certificate_draft' &&
              exchange.counterpart.kind === 'client' &&
              exchange.attachmentIds.includes(
                certificateDraftVersion(draft).value.attachmentId,
              ),
          );
          if (
            !received ||
            received.direction !== 'received' ||
            received.itemKind !== 'client_opinion' ||
            received.counterpart.kind !== 'client' ||
            !sent ||
            received.businessDate !== payload.businessDate
          )
            throw stepConflict(
              'CERTIFICATION_OPINION_EXCHANGE',
              'Record the draft sending and exact received client opinion first.',
            );
          for (const id of received.attachmentIds)
            await this.repository.requireAttachment(
              input.actor,
              companyId,
              requireUuid(input.caseId),
              id,
              ['client_opinion'],
            );
        }
        return { outcome: payload.outcome };
      },
    });
  }

  approveCertificateDraft(input: CaseCommandInput): Promise<unknown> {
    return this.transactions.versionedStep({
      ...input,
      role: 'approver',
      kind: 'certificate_draft_approval',
      step: 'certificate_draft_approval',
      parse: certificateDraftApproval,
      action: 'certification_case.certificate_draft_approved',
      check: async ({ steps, companyId, payload, current }) => {
        this.transactions.requireIndependent(input.actor, steps);
        this.transactions.requireNotNamedOnTeam(
          steps,
          payload.onBehalf?.actedBy,
        );
        await this.transactions.requireAct(
          input.actor,
          companyId,
          requireUuid(input.caseId),
          payload.onBehalf,
        );
        this.requireReleaseDate(payload.approvedOn);
        if (payload.onBehalf && payload.onBehalf.actedOn !== payload.approvedOn)
          throw stepConflict(
            'CERTIFICATION_RELEASE_DATE',
            'The approval date must match the recorded act.',
          );
        const release = await this.repository.release(
          input.actor,
          companyId,
          current,
          steps,
        );
        if (
          release.currentDraftId !== payload.draftVersionId ||
          release.approvalBlockers.length
        )
          throw new ConflictException({
            code: 'CERTIFICATION_DRAFT_APPROVAL_PRECONDITIONS',
            message: 'Resolve the draft approval preconditions.',
            failures:
              release.currentDraftId !== payload.draftVersionId
                ? ['draft_outdated']
                : release.approvalBlockers,
          });
        const opinion = release.opinions
          .filter(
            (entry) => entry.value.draftVersionId === payload.draftVersionId,
          )
          .at(-1);
        if (opinion && payload.approvedOn < opinion.value.businessDate)
          throw stepConflict(
            'CERTIFICATION_RELEASE_DATE',
            'Approval follows the client opinion.',
          );
        return {};
      },
    });
  }

  private requireReleaseDate(date: string): void {
    if (date > latestBusinessDate(this.clock.now()))
      throw stepConflict(
        'CERTIFICATION_RELEASE_DATE',
        'A release act cannot be dated after today.',
      );
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
    return this.transactions.command({
      actor,
      role: 'approver',
      kind: 'certificate',
      key: idempotencyKey,
      fingerprint: commandFingerprint({ caseId, body }),
      execute: async (companyId) => {
        const input = certificateCommand(body);
        const current = await this.repository.lockOpenCase(
          actor,
          companyId,
          targetId,
          input.expectedRevision,
        );
        const steps = await this.repository.steps(actor, companyId, targetId);
        this.transactions.requireIndependent(actor, steps);
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
        const release = await this.repository.release(
          actor,
          companyId,
          current,
          steps,
        );
        const approvedDraft = release.drafts.find(
          (draft) => draft.id === release.currentDraftId,
        );
        if (release.issuanceBlockers.length || !approvedDraft)
          throw new ConflictException({
            code: 'CERTIFICATION_CERTIFICATE_APPROVAL_REQUIRED',
            message: 'Approve the current draft before issuance.',
            failures: release.issuanceBlockers,
          });
        if (input.number !== approvedDraft.value.number)
          throw stepConflict(
            'CERTIFICATION_CERTIFICATE_NUMBER_DIFFERS',
            'Issue the approved draft number.',
          );
        if (
          input.issuedOn < decision.decidedOn ||
          input.issuedOn > latestBusinessDate(this.clock.now())
        )
          throw stepConflict(
            'CERTIFICATION_CERTIFICATE_ISSUE_DATE',
            'The issue date must be between the decision date and today.',
          );
        const signatory = input.signedBy;
        this.transactions.requireNotNamedOnTeam(steps, signatory ?? undefined);
        await this.repository.requireAttachment(
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
            issuedOn: input.issuedOn,
            approvedDraftVersionId: approvedDraft.id,
            ...validity,
            texts: data.texts,
            signedBy: input.signedBy,
            signedByFunction: input.signedByFunction,
            independenceAttested: input.independenceAttested,
            attachmentId: input.attachmentId,
            actorMembershipId: actor.workspaceMembershipId,
            actorInternalUserId: actor.internalUserId,
            actorDisplayName: actor.displayName,
            recordedAt: now,
          });
        return this.transactions.advance({
          actor,
          companyId,
          current,
          at: now,
          action: 'certification_case.certificate_recorded',
          metadata: {},
          status: 'certified',
        });
      },
    });
  }

  /** An independent correction appends a new PDF, never changes issuance0. */
  recordCertificateRevision({
    actor,
    caseId,
    body,
    key,
  }: CaseCommandInput): Promise<unknown> {
    const idempotencyKey = requireIdempotencyKey(key);
    const targetId = requireUuid(caseId);
    return this.transactions.command({
      actor,
      role: 'approver',
      kind: 'certificate_revision',
      key: idempotencyKey,
      fingerprint: commandFingerprint({ caseId, body }),
      execute: async (companyId) => {
        const command = certificateRevisionCommand(body);
        const input = command.value;
        const current = await this.repository.lockOpenCase(
          actor,
          companyId,
          targetId,
          command.expectedRevision,
          ['certified'],
        );
        const certificate = await this.repository.certificate(
          actor,
          companyId,
          targetId,
        );
        const steps = await this.repository.steps(actor, companyId, targetId);
        this.transactions.requireIndependent(actor, steps);
        this.transactions.requireNotNamedOnTeam(steps, input.onBehalf?.actedBy);
        await this.transactions.requireAct(
          actor,
          companyId,
          targetId,
          input.onBehalf,
        );
        this.requireReleaseDate(input.revisedOn);
        const decided = latest(steps, 'decision');
        const agreed = latest(steps, 'certificate_data');
        const decision = decided ? decisionVersion(decided).value : undefined;
        if (
          !certificate ||
          !decided ||
          !agreed ||
          decision?.decision !== 'granted'
        )
          throw stepConflict(
            'CERTIFICATION_NOT_GRANTED',
            'A revision follows an issued Certificate.',
          );
        const data = certificateDataVersion(agreed).value;
        if (!sameCertificateTexts(decision.grantedTexts, data.texts))
          throw stepConflict(
            'CERTIFICATION_CERTIFICATE_DATA_DIFFERS',
            'The latest decision and Certificate data must agree before a revision.',
          );
        await this.repository.requireAttachment(
          actor,
          companyId,
          targetId,
          input.attachmentId,
          ['certificate'],
        );
        const attachments = await this.database.connection
          .select({
            id: certificationCaseDocuments.id,
            versionId: certificationCaseDocuments.versionId,
          })
          .from(certificationCaseDocuments)
          .where(
            and(
              eq(certificationCaseDocuments.workspaceId, actor.workspaceId),
              eq(certificationCaseDocuments.companyId, companyId),
              eq(certificationCaseDocuments.caseId, targetId),
            ),
          );
        const attached = attachments.find(
          (item) => item.id === input.attachmentId,
        );
        if (!attached) throw new InternalServerErrorException();
        const revisions = await this.repository.certificateRevisions(
          actor,
          companyId,
          targetId,
        );
        const priorAttachments = new Set([
          certificate.attachmentId,
          ...revisions.map((item) => item.attachmentId),
        ]);
        if (
          attachments.some(
            (item) =>
              priorAttachments.has(item.id) &&
              item.versionId === attached.versionId,
          )
        )
          throw stepConflict(
            'CERTIFICATION_CERTIFICATE_PDF_REUSED',
            'A revision needs a different exact Document Version from every earlier Certificate.',
          );
        const index = (revisions.at(-1)?.index ?? 0) + 1;
        const now = this.clock.now();
        await this.database.connection
          .insert(certificationCertificateRevisions)
          .values({
            workspaceId: actor.workspaceId,
            companyId,
            caseId: targetId,
            index,
            caseRevision: current.revision + 1,
            ...input,
            texts: data.texts,
            documentVersionId: attached.versionId,
            decisionVersionId: decided.id,
            certificateDataVersionId: agreed.id,
            actorMembershipId: actor.workspaceMembershipId,
            actorInternalUserId: actor.internalUserId,
            actorDisplayName: actor.displayName,
            recordedAt: now,
          });
        return this.transactions.advance({
          actor,
          companyId,
          current,
          at: now,
          action: 'certification_case.certificate_revised',
          metadata: { index },
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
    const findings = await this.repository.findings(
      actor,
      companyId,
      caseId,
      steps,
    );
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
    if (decision.decision === 'granted' && !latest(steps, 'certificate_data'))
      failures.push('CERTIFICATE_DATA_MISSING');
    if (decision.decidedOn > latestBusinessDate(this.clock.now()))
      failures.push('DECISION_IN_FUTURE');
    return failures;
  }
}
