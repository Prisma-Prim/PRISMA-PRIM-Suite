import {
  certificateRevisionValue,
  type CertificateRevision,
} from './certification-revisions.js';
import { observedNumbers } from './certification-number-observations.js';
import { certificateRelease } from './certification-release.js';
import { exchangePage } from './certification-exchange-page.js';
import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, inArray, lte, ne } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { requireUuid } from '../access/access-command-validation.js';
import { SERVER_CLOCK, type ServerClock } from '../clock/server-clock.js';
import { staleVersionConflict } from '../command/idempotent-command.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  CERTIFICATION_STEPS,
  certificationCertificates,
  certificationCertificateRevisions,
  certificationNumberObservations,
  certificationDeadlineSets,
  certificationDiscrepancyResolutions,
  certificationEvents,
  certificationExchangeRecords,
  certificationReverificationItems,
  certificationReverificationWithdrawals,
  certificationFindingRecords,
  certificationFindings,
  certificationCaseDocuments,
  certificationCases,
  certificationManualDiscrepancies,
  certificationStepVersions,
} from '../database/schema/certification.js';
import {
  blockingDiscrepancies,
  consistencySection,
  type BlockingDiscrepancy,
  type ConsistencyCertificate,
  type ConsistencyInput,
  type ConsistencySnapshot,
  type ManualDiscrepancyRecord,
  type ResolutionRecord,
} from './certification-consistency.js';
import {
  exchangeRegister,
  type DeadlineSetVersion,
  type ExchangeRecordVersion,
} from './certification-exchanges.js';
import { deadlineSetVersion } from './certification-procedure.service.js';
import {
  reverificationSection,
  type ReverificationWithdrawal,
  type StoredReverificationItem,
} from './certification-reverification.js';
import { pdfRefusal } from '../commercial-pdf/commercial-pdf-source.js';
import { clientLegalEntities } from '../database/schema/client-legal-entity.js';
import { ProjectService } from '../project/project.service.js';
import { requireIndependenceAttestation } from './certification-attribution.js';
import { certificateTexts } from './certification-decision.js';
import {
  FINDING_RECORD_KINDS,
  findingBlocks,
  findingRecordView,
  findingView,
  type FindingView,
} from './certification-findings.js';
import {
  type CertificationRegisterEntry,
  type CertificationRegisterSource,
} from './certification-register.js';
import type {
  CertificateRecord,
  CertificationCaseDetail,
  CertificationCaseSummary,
  CertificationNextStep,
} from './certification.types.js';
import { DOCUMENT_ROLES } from './certification.validation.js';
import {
  stepVersion,
  persisted,
  stepConflict,
  latest,
  applicationVersion,
  reviewVersion,
  durationVersion,
  agreementVersion,
  teamVersion,
  teamDecisionVersion,
  recommendationVersion,
  dossierReviewVersion,
  decisionVersion,
  certificateDataVersion,
  stageStepVersion,
  attachment,
  stagePlanVersion,
  stage1Version,
} from './certification-case-versions.js';
import type { CaseRow, StepRow } from './certification-case-versions.js';

const STAGE_STEPS: readonly StepRow['step'][] = [
  'stage_1_plan',
  'stage_1_report',
  'stage_2_plan',
  'stage_2_report',
];

const REGISTER_DOCUMENT_LIMIT = 1000;
type CertificateRow = typeof certificationCertificates.$inferSelect;
type CaseDocumentRow = typeof certificationCaseDocuments.$inferSelect;
type ConsistencyObservations = {
  certificate: CertificateRow | null;
  deadlines: DeadlineSetVersion | null;
  documents?: readonly CaseDocumentRow[];
};

/** Reads the stored Case facts and builds current projections inside the caller’s transaction. */
@Injectable()
export class CertificationCaseReadModel {
  constructor(
    private readonly database: DatabaseContext,
    private readonly projects: ProjectService,
    @Inject(SERVER_CLOCK) private readonly clock: ServerClock,
  ) {}

  async release(
    actor: ActorContext,
    companyId: string,
    row: CaseRow,
    steps: readonly StepRow[],
  ) {
    const issued = await this.issuedCertificate({
      actor,
      companyId,
      caseId: row.id,
    });
    const certificate = certificateRecord(issued);
    const input = await this.consistencyInput(
      actor,
      companyId,
      row,
      steps,
      await this.findings(actor, companyId, row.id, steps),
      {
        certificate: issued,
        deadlines: await this.deadlineSet(actor, companyId),
      },
    );
    return this.releaseFromFacts({
      actor,
      companyId,
      caseId: row.id,
      certificate,
      input,
      today: this.clock.now().toISOString().slice(0, 10),
    });
  }

  private async releaseFromFacts({
    actor,
    companyId,
    caseId,
    certificate,
    input,
    today,
  }: {
    actor: ActorContext;
    companyId: string;
    caseId: string;
    certificate: CertificateRecord | null;
    input: ConsistencyInput;
    today: string;
  }) {
    return certificateRelease({
      steps: input.steps,
      certificate,
      revisions: await this.certificateRevisions(actor, companyId, caseId),
      exchanges: input.exchanges,
      discrepanciesOpen:
        blockingDiscrepancies(input, input.manual, input.resolutions).length >
        0,
      today,
    });
  }

  async certificateRevisions(
    actor: ActorContext,
    companyId: string,
    caseId: string,
  ): Promise<CertificateRevision[]> {
    const rows = await this.database.connection
      .select()
      .from(certificationCertificateRevisions)
      .where(
        and(
          eq(certificationCertificateRevisions.workspaceId, actor.workspaceId),
          eq(certificationCertificateRevisions.companyId, companyId),
          eq(certificationCertificateRevisions.caseId, caseId),
        ),
      )
      .orderBy(asc(certificationCertificateRevisions.index));
    return rows.map((row) => ({
      ...persisted(() =>
        certificateRevisionValue({
          reason: row.reason,
          revisedOn: row.revisedOn,
          attachmentId: row.attachmentId,
          revisionMarked: row.revisionMarked,
          independenceAttested: row.independenceAttested,
          onBehalf: row.onBehalf,
        }),
      ),
      id: row.id,
      index: row.index,
      caseRevision: row.caseRevision,
      texts: persisted(() => certificateTexts(row.texts)),
      decisionVersionId: row.decisionVersionId,
      certificateDataVersionId: row.certificateDataVersionId,
      recordedBy: {
        workspaceMembershipId: row.actorMembershipId,
        displayName: row.actorDisplayName,
      },
      recordedAt: row.recordedAt.toISOString(),
      transmission: null,
    }));
  }

  async certificate(
    actor: ActorContext,
    companyId: string,
    caseId: string,
  ): Promise<CertificateRecord | null> {
    return certificateRecord(
      await this.issuedCertificate({ actor, companyId, caseId }),
    );
  }

  private async issuedCertificate({
    actor,
    companyId,
    caseId,
  }: {
    actor: ActorContext;
    companyId: string;
    caseId: string;
  }): Promise<CertificateRow | null> {
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
    return row ?? null;
  }

  async issuedCompanyNumbers(
    actor: ActorContext,
    companyId: string,
    caseId: string,
  ) {
    const rows = await this.database.connection
      .select({
        number: certificationCertificates.number,
        recordedAt: certificationCertificates.recordedAt,
      })
      .from(certificationCertificates)
      .where(
        and(
          eq(certificationCertificates.workspaceId, actor.workspaceId),
          eq(certificationCertificates.companyId, companyId),
          ne(certificationCertificates.caseId, caseId),
        ),
      );
    return rows.map((issued) => ({
      number: issued.number,
      recordedAt: issued.recordedAt.toISOString(),
    }));
  }

  async lockOpenCase(
    actor: ActorContext,
    companyId: string,
    caseId: string,
    expectedRevision: number,
    statuses: readonly CaseRow['status'][] = ['open'],
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
    if (!statuses.includes(row.status))
      throw stepConflict(
        'CERTIFICATION_CASE_CLOSED',
        'This Certification Case is closed.',
      );
    return row;
  }

  /** The Case in the actor's Company whose Project the actor can still read. */
  async visibleCase(
    actor: ActorContext,
    companyId: string,
    caseId: string,
    options: { lock?: 'share' } = {},
  ): Promise<CaseRow> {
    const query = this.database.connection
      .select()
      .from(certificationCases)
      .where(
        and(
          eq(certificationCases.workspaceId, actor.workspaceId),
          eq(certificationCases.companyId, companyId),
          eq(certificationCases.id, caseId),
        ),
      );
    const [row] = await (options.lock ? query.for(options.lock) : query);
    if (!row) throw new NotFoundException();
    await this.projects.missionContextWithinTransaction({
      actor,
      projectId: row.projectId,
    });
    return row;
  }

  async present(
    actor: ActorContext,
    companyId: string,
    caseId: string,
  ): Promise<CertificationCaseDetail> {
    // Case commands take this same row FOR UPDATE. Holding a shared lock
    // keeps its revision and all exchange histories together, while Access
    // retains its ordinary read-committed permission rechecks.
    const row = await this.visibleCase(actor, companyId, caseId, {
      lock: 'share',
    });
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
    const { certificate, release, ...sections } = await this.caseSections({
      actor,
      companyId,
      row,
      steps,
      findings,
      issued: await this.issuedCertificate({ actor, companyId, caseId }),
      paged: true,
    });
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
      certificate,
      release,
      stages: STAGE_STEPS.flatMap((step) => {
        const row = latest(steps, step);
        return row ? [stageStepVersion(row)] : [];
      }),
      ...sections,
    };
  }

  /** One projection uses one captured procedure and the same Case facts in every section. */
  private async caseSections({
    actor,
    companyId,
    row,
    steps,
    findings,
    issued,
    documents,
    paged = false,
  }: {
    actor: ActorContext;
    companyId: string;
    row: CaseRow;
    steps: readonly StepRow[];
    findings: readonly FindingView[];
    issued: CertificateRow | null;
    documents?: readonly CaseDocumentRow[];
    paged?: boolean;
  }): Promise<
    Pick<
      CertificationCaseDetail,
      'certificate' | 'release' | 'consistency' | 'exchanges'
    >
  > {
    // The Case lock cannot freeze an administrator's independent Company procedure update.
    const deadlines = await this.deadlineSet(actor, companyId);
    const input = await this.consistencyInput(
      actor,
      companyId,
      row,
      steps,
      findings,
      {
        certificate: issued,
        deadlines,
        ...(documents ? { documents } : {}),
      },
    );
    const certificate = certificateRecord(issued);
    const today = this.clock.now().toISOString().slice(0, 10);
    const release = await this.releaseFromFacts({
      actor,
      companyId,
      caseId: row.id,
      certificate,
      input,
      today,
    });
    const exchanges = await this.exchangeSection(actor, {
      companyId,
      caseId: row.id,
      input,
      findings,
      firstSurveillanceBy: certificate?.firstSurveillanceBy ?? null,
      deadlines,
      today,
    });
    return {
      certificate,
      release,
      consistency: consistencySection(input),
      exchanges: paged
        ? {
            ...exchanges,
            ...exchangePage({
              caseId: row.id,
              revision: row.revision,
              versions: input.exchanges,
              position: null,
            }),
          }
        : exchanges,
    };
  }

  /** Every record the Dossier Consistency Check reads, at the Case's revision. */
  async consistencyInput(
    actor: ActorContext,
    companyId: string,
    row: CaseRow,
    steps: readonly StepRow[],
    findings: readonly FindingView[],
    captured?: ConsistencyObservations,
  ): Promise<ConsistencyInput> {
    const scope = <
      T extends
        | typeof certificationCaseDocuments
        | typeof certificationManualDiscrepancies
        | typeof certificationDiscrepancyResolutions,
    >(
      table: T,
    ) =>
      and(
        eq(table.workspaceId, actor.workspaceId),
        eq(table.companyId, companyId),
        eq(table.caseId, row.id),
      );
    const documents =
      captured?.documents ??
      (await this.database.connection
        .select()
        .from(certificationCaseDocuments)
        .where(scope(certificationCaseDocuments))
        .orderBy(asc(certificationCaseDocuments.caseRevision)));
    const issued = captured
      ? captured.certificate
      : await this.issuedCertificate({ actor, companyId, caseId: row.id });
    const certificate: ConsistencyCertificate | null = issued
      ? {
          number: issued.number,
          attachmentId: issued.attachmentId,
          caseRevision: issued.caseRevision,
          recordedBy: {
            workspaceMembershipId: issued.actorMembershipId,
            displayName: issued.actorDisplayName,
          },
          recordedAt: issued.recordedAt.toISOString(),
        }
      : null;
    const manual = await this.database.connection
      .select()
      .from(certificationManualDiscrepancies)
      .where(scope(certificationManualDiscrepancies))
      .orderBy(asc(certificationManualDiscrepancies.sequence));
    const resolutions = await this.database.connection
      .select()
      .from(certificationDiscrepancyResolutions)
      .where(scope(certificationDiscrepancyResolutions))
      .orderBy(asc(certificationDiscrepancyResolutions.caseRevision));
    return {
      steps: steps.map(stepVersion),
      attachments: documents.map(attachment),
      findings: findings.map((finding) => ({
        id: finding.id,
        sequence: finding.sequence,
        records: finding.records,
      })),
      certificate,
      issuedNumbers: await this.issuedCompanyNumbers(actor, companyId, row.id),
      numberObservations: await this.database.connection
        .select()
        .from(certificationNumberObservations)
        .where(
          and(
            eq(certificationNumberObservations.workspaceId, actor.workspaceId),
            eq(certificationNumberObservations.companyId, companyId),
            eq(certificationNumberObservations.caseId, row.id),
          ),
        )
        .orderBy(asc(certificationNumberObservations.caseRevision))
        .then((rows) =>
          rows.map((observation) => ({
            caseRevision: observation.caseRevision,
            numbers: persisted(() => observedNumbers(observation.numbers)),
          })),
        ),
      revision: row.revision,
      status: row.status,
      manual: manual.map(manualDiscrepancyRecord),
      resolutions: resolutions.map(resolutionRecord),
      exchanges: await this.exchangeVersions(actor, companyId, row.id),
      deadlineDays:
        (captured
          ? captured.deadlines
          : await this.deadlineSet(actor, companyId)
        )?.days ?? null,
    };
  }

  /** Every version of the Case's Exchange Records, in recording order. */
  async exchangeVersions(
    actor: ActorContext,
    companyId: string,
    caseId: string,
  ): Promise<ExchangeRecordVersion[]> {
    const rows = await this.database.connection
      .select()
      .from(certificationExchangeRecords)
      .where(
        and(
          eq(certificationExchangeRecords.workspaceId, actor.workspaceId),
          eq(certificationExchangeRecords.companyId, companyId),
          eq(certificationExchangeRecords.caseId, caseId),
        ),
      )
      .orderBy(asc(certificationExchangeRecords.caseRevision));
    return rows.map((row) => persisted(() => exchangeVersion(row)));
  }

  /** The Company's current procedure deadline set, if one was configured. */
  private async deadlineSet(
    actor: ActorContext,
    companyId: string,
  ): Promise<DeadlineSetVersion | null> {
    const [row] = await this.database.connection
      .select()
      .from(certificationDeadlineSets)
      .where(
        and(
          eq(certificationDeadlineSets.workspaceId, actor.workspaceId),
          eq(certificationDeadlineSets.companyId, companyId),
        ),
      )
      .orderBy(desc(certificationDeadlineSets.version))
      .limit(1);
    return row ? deadlineSetVersion(row) : null;
  }

  /** The exchange register, deadlines and Re-verification Items of a Case. */
  private async exchangeSection(
    actor: ActorContext,
    {
      companyId,
      caseId,
      input,
      findings,
      firstSurveillanceBy,
      deadlines,
      today,
    }: {
      companyId: string;
      caseId: string;
      /** The records the consistency check read at the same revision. */
      input: ConsistencyInput;
      findings: readonly FindingView[];
      firstSurveillanceBy: string | null;
      deadlines: DeadlineSetVersion | null;
      today: string;
    },
  ): Promise<CertificationCaseDetail['exchanges']> {
    const scope = <
      T extends
        | typeof certificationReverificationItems
        | typeof certificationReverificationWithdrawals,
    >(
      table: T,
    ) =>
      and(
        eq(table.workspaceId, actor.workspaceId),
        eq(table.companyId, companyId),
        eq(table.caseId, caseId),
      );
    const stored = await this.database.connection
      .select()
      .from(certificationReverificationItems)
      .where(scope(certificationReverificationItems))
      .orderBy(asc(certificationReverificationItems.sequence));
    const withdrawals = await this.database.connection
      .select()
      .from(certificationReverificationWithdrawals)
      .where(scope(certificationReverificationWithdrawals));
    return {
      ...exchangeRegister({
        steps: input.steps,
        attachments: input.attachments,
        versions: input.exchanges,
        set: deadlines,
        today,
      }),
      reverification: reverificationSection({
        findings,
        stored: stored.map(storedReverificationItem),
        withdrawals: withdrawals.map(reverificationWithdrawal),
        attachments: input.attachments,
        firstSurveillanceBy,
      }),
    };
  }

  /** The open critical and unaccepted error Discrepancies a gate refuses for. */
  async blocking(
    actor: ActorContext,
    companyId: string,
    row: CaseRow,
    steps: readonly StepRow[],
    candidate?: (snapshot: ConsistencySnapshot) => ConsistencySnapshot,
  ): Promise<BlockingDiscrepancy[]> {
    const input = await this.consistencyInput(
      actor,
      companyId,
      row,
      steps,
      await this.findings(actor, companyId, row.id, steps),
    );
    return blockingDiscrepancies(
      candidate ? candidate(input) : input,
      input.manual,
      input.resolutions,
    );
  }

  /** Every recorded version and referenced Document Version of a visible Case. */
  async registerSource(
    actor: ActorContext,
    companyId: string,
    caseId: string,
  ): Promise<CertificationRegisterSource> {
    const row = await this.visibleCase(actor, companyId, caseId);
    const steps = await this.steps(actor, companyId, caseId);
    const findings = await this.database.connection
      .select({
        id: certificationFindings.id,
        stage: certificationFindings.stage,
        sequence: certificationFindings.sequence,
      })
      .from(certificationFindings)
      .where(
        and(
          eq(certificationFindings.workspaceId, actor.workspaceId),
          eq(certificationFindings.companyId, companyId),
          eq(certificationFindings.caseId, caseId),
        ),
      );
    const records = findings.length
      ? await this.database.connection
          .select()
          .from(certificationFindingRecords)
          .where(
            and(
              eq(certificationFindingRecords.workspaceId, actor.workspaceId),
              eq(certificationFindingRecords.companyId, companyId),
              eq(certificationFindingRecords.caseId, caseId),
            ),
          )
      : [];
    const documents = await this.database.connection
      .select()
      .from(certificationCaseDocuments)
      .where(
        and(
          eq(certificationCaseDocuments.workspaceId, actor.workspaceId),
          eq(certificationCaseDocuments.companyId, companyId),
          eq(certificationCaseDocuments.caseId, caseId),
        ),
      )
      .orderBy(asc(certificationCaseDocuments.caseRevision))
      .limit(REGISTER_DOCUMENT_LIMIT + 1);
    if (documents.length > REGISTER_DOCUMENT_LIMIT)
      pdfRefusal('PDF_CONTENT_LIMIT');
    const [revised] = await this.database.connection
      .select({ occurredAt: certificationEvents.occurredAt })
      .from(certificationEvents)
      .where(
        and(
          eq(certificationEvents.workspaceId, actor.workspaceId),
          eq(certificationEvents.companyId, companyId),
          eq(certificationEvents.caseId, caseId),
        ),
      )
      .orderBy(desc(certificationEvents.revision))
      .limit(1);
    const ordered: { order: number[]; entry: CertificationRegisterEntry }[] = [
      ...steps.map((step) => ({
        order: [step.caseRevision, 0, 0, step.version],
        entry: registerStep(step),
      })),
      ...records.map((record) => {
        const finding = findings.find((entry) => entry.id === record.findingId);
        if (!finding) throw new InternalServerErrorException();
        return {
          order: [
            record.caseRevision,
            finding.sequence,
            FINDING_RECORD_KINDS.indexOf(record.kind),
            record.version,
          ],
          entry: {
            kind: 'finding_record' as const,
            stage: finding.stage,
            sequence: finding.sequence,
            record: persisted(() => findingRecordView(record)),
          },
        };
      }),
    ];
    const issued = await this.issuedCertificate({ actor, companyId, caseId });
    const { certificate, ...sections } = await this.caseSections({
      actor,
      companyId,
      row,
      steps,
      issued,
      documents,
      findings: await this.findings(actor, companyId, caseId, steps),
    });
    if (issued && certificate)
      ordered.push({
        order: [issued.caseRevision, 0, 0, 0],
        entry: { kind: 'certificate', certificate },
      });
    ordered.sort((left, right) => {
      for (const [index, value] of left.order.entries()) {
        const difference = value - (right.order[index] ?? 0);
        if (difference !== 0) return difference;
      }
      return 0;
    });
    return {
      caseId: row.id,
      orderReference: row.orderReference,
      status: row.status,
      standard: row.standard,
      auditType: row.auditType,
      clientLegalName: await this.legalName(actor, row),
      revision: row.revision,
      openedAt: row.openedAt.toISOString(),
      revisedAt: (revised?.occurredAt ?? row.openedAt).toISOString(),
      entries: ordered.map((item) => item.entry),
      documents: documents.map(attachment),
      ...sections,
    };
  }

  summary(
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

  /** Every attachment must belong to this Case. */
  async requireAttachments(
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

  /** Every Finding of the Case with its derived status, in sequence order. */
  async findings(
    actor: ActorContext,
    companyId: string,
    caseId: string,
    steps: readonly StepRow[],
    selection?: { findingIds: string[]; atRevision: number },
  ): Promise<FindingView[]> {
    const rows = await this.database.connection
      .select()
      .from(certificationFindings)
      .where(
        and(
          eq(certificationFindings.workspaceId, actor.workspaceId),
          eq(certificationFindings.companyId, companyId),
          eq(certificationFindings.caseId, caseId),
          selection && inArray(certificationFindings.id, selection.findingIds),
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
          selection &&
            inArray(
              certificationFindingRecords.findingId,
              selection.findingIds,
            ),
          selection &&
            lte(certificationFindingRecords.caseRevision, selection.atRevision),
        ),
      )
      .orderBy(
        asc(certificationFindingRecords.caseRevision),
        asc(certificationFindingRecords.kind),
        asc(certificationFindingRecords.version),
      );
    const byFinding = new Map<string, typeof records>();
    for (const record of records) {
      const group = byFinding.get(record.findingId);
      if (group) group.push(record);
      else byFinding.set(record.findingId, [record]);
    }
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
          records: (byFinding.get(row.id) ?? []).map(findingRecordView),
        }),
      );
    });
  }

  async finding(
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

  /** Refuses an attachment of this Case unless it has one of the expected roles. */
  async requireAttachment(
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

  async legalName(actor: ActorContext, row: CaseRow): Promise<string> {
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

  steps(
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
}

function certificateRecord(
  row: CertificateRow | null,
): CertificateRecord | null {
  if (!row) return null;
  const texts = persisted(() => certificateTexts(row.texts));
  return {
    id: row.id,
    number: row.number,
    issuedOn: row.issuedOn,
    approvedDraftVersionId: row.approvedDraftVersionId,
    validFrom: row.validFrom,
    validUntil: row.validUntil,
    firstSurveillanceBy: row.firstSurveillanceBy,
    texts,
    signedBy: row.signedBy,
    signedByFunction: row.signedByFunction,
    independenceAttested: persisted(() =>
      requireIndependenceAttestation(row.independenceAttested),
    ),
    attachmentId: row.attachmentId,
    recordedBy: {
      workspaceMembershipId: row.actorMembershipId,
      displayName: row.actorDisplayName,
    },
    recordedAt: row.recordedAt.toISOString(),
  };
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
  if (!latest(steps, 'certificate_data')) return 'certificate_data';
  if (!latest(steps, 'dossier_review')) return 'dossier_review';
  if (!latest(steps, 'decision')) return 'decision';
  return 'certificate';
}

function optionalVersion<T>(
  steps: readonly StepRow[],
  step: StepRow['step'],
  present: (row: StepRow) => T,
): T | null {
  const row = latest(steps, step);
  return row ? present(row) : null;
}

function exchangeVersion(
  row: typeof certificationExchangeRecords.$inferSelect,
): ExchangeRecordVersion {
  const ids: unknown = row.attachmentIds;
  if (!Array.isArray(ids))
    throw new Error('Stored attachments are not a list.');
  const values: unknown[] = ids;
  return {
    id: row.id,
    sequence: row.sequence,
    version: row.version,
    caseRevision: row.caseRevision,
    direction: row.direction,
    itemKind: row.itemKind,
    counterpart: { kind: row.counterpartKind, name: row.counterpartName },
    businessDate: row.businessDate,
    channel: row.channel,
    reference: row.reference,
    note: row.note,
    attachmentIds: values.map((id) => requireUuid(id)),
    reason: row.reason,
    recordedBy: {
      workspaceMembershipId: row.actorMembershipId,
      displayName: row.actorDisplayName,
    },
    recordedAt: row.recordedAt.toISOString(),
  };
}

function storedReverificationItem(
  row: typeof certificationReverificationItems.$inferSelect,
): StoredReverificationItem {
  let source: StoredReverificationItem['source'] = null;
  if (row.sourceFindingId !== null)
    source = { kind: 'finding', findingId: row.sourceFindingId };
  else if (row.sourceDiscrepancyId !== null)
    source = { kind: 'discrepancy', discrepancyId: row.sourceDiscrepancyId };
  else if (row.sourceExchangeSequence !== null)
    source = { kind: 'exchange', sequence: row.sourceExchangeSequence };
  else if (row.sourceAttachmentId !== null)
    source = { kind: 'attachment', attachmentId: row.sourceAttachmentId };
  return {
    id: row.id,
    sequence: row.sequence,
    caseRevision: row.caseRevision,
    origin: row.origin,
    text: row.text,
    source,
    addedBy: {
      workspaceMembershipId: row.actorMembershipId,
      displayName: row.actorDisplayName,
    },
    addedAt: row.recordedAt.toISOString(),
  };
}

function reverificationWithdrawal(
  row: typeof certificationReverificationWithdrawals.$inferSelect,
): ReverificationWithdrawal {
  return {
    itemId: row.itemId,
    caseRevision: row.caseRevision,
    reason: row.reason,
    by: {
      workspaceMembershipId: row.actorMembershipId,
      displayName: row.actorDisplayName,
    },
    at: row.recordedAt.toISOString(),
  };
}

function manualDiscrepancyRecord(
  row: typeof certificationManualDiscrepancies.$inferSelect,
): ManualDiscrepancyRecord {
  return {
    id: row.id,
    sequence: row.sequence,
    caseRevision: row.caseRevision,
    verdict: row.verdict,
    subject: row.subject,
    left: {
      value: row.leftValue,
      attachmentId: row.leftAttachmentId,
      location: row.leftLocation,
    },
    right: {
      value: row.rightValue,
      attachmentId: row.rightAttachmentId,
      location: row.rightLocation,
    },
    note: row.note,
    recordedBy: {
      workspaceMembershipId: row.actorMembershipId,
      displayName: row.actorDisplayName,
    },
    recordedAt: row.recordedAt.toISOString(),
  };
}

function resolutionRecord(
  row: typeof certificationDiscrepancyResolutions.$inferSelect,
): ResolutionRecord {
  return {
    id: row.id,
    discrepancyId: row.discrepancyId,
    manualDiscrepancyId: row.manualDiscrepancyId,
    kind: row.kind,
    verdict: row.verdict,
    reason: row.reason,
    correctedBy:
      row.correctedByAttachmentId !== null
        ? { kind: 'attachment', attachmentId: row.correctedByAttachmentId }
        : row.correctedByStepVersionId !== null
          ? { kind: 'step', versionId: row.correctedByStepVersionId }
          : null,
    ruleSetVersion: row.ruleSetVersion,
    caseRevision: row.caseRevision,
    recordedBy: {
      workspaceMembershipId: row.actorMembershipId,
      displayName: row.actorDisplayName,
    },
    recordedAt: row.recordedAt.toISOString(),
  };
}

/** A stored step version for the register; a step this release does not know is shown, not interpreted. */
function registerStep(row: StepRow): CertificationRegisterEntry {
  const known = CERTIFICATION_STEPS.find((step) => step === row.step);
  if (known === undefined)
    return {
      kind: 'unrecognized_step',
      code: row.step,
      version: row.version,
      reason: row.reason,
      recordedBy: { displayName: row.actorDisplayName },
      recordedAt: row.recordedAt.toISOString(),
    };
  return { kind: 'step', version: stepVersion(row) };
}
