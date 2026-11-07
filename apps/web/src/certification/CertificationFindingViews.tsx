import { useInterfaceLocale } from '../localization/interface-locale';
import { formatMessage } from '../localization/messages';
import { VersionAttribution } from './CertificationAttribution';
import {
  useAttachmentReference,
  type RegisterDownload,
} from './CertificationDocumentViews';
import {
  useCertificationCopy,
  type CertificationMessageKey,
} from './certification.copy';
import {
  findingRequirement,
  type ClassifiedBy,
  type Finding,
  type FindingClassification,
  type FindingRecord,
  type FindingStatus,
  type PlanOutcome,
  type VerificationMethod,
  type VerificationOutcome,
} from './certification-findings';
import type { DocumentRegister } from './certification-response';
import type { AuditStage } from './certification-stages';

export function classificationLabel(
  classification: FindingClassification,
): CertificationMessageKey {
  switch (classification) {
    case 'major_nonconformity':
      return 'classificationMajor';
    case 'minor_nonconformity':
      return 'classificationMinor';
    case 'opportunity_for_improvement':
      return 'classificationOpportunity';
    case 'area_of_concern':
      return 'classificationAreaOfConcern';
  }
  return unexpected(classification);
}

export function findingStatusLabel(
  status: FindingStatus,
): CertificationMessageKey {
  switch (status) {
    case 'no_action_required':
      return 'statusNoActionRequired';
    case 'awaiting_response':
      return 'statusAwaitingResponse';
    case 'awaiting_plan_judgment':
      return 'statusAwaitingPlanJudgment';
    case 'plan_inadequate':
      return 'statusPlanInadequate';
    case 'plan_adequate':
      return 'statusPlanAdequate';
    case 'verified_effective':
      return 'statusVerifiedEffective';
    case 'verified_not_effective':
      return 'statusVerifiedNotEffective';
  }
  return unexpected(status);
}

/** The badge tone of a follow-up status: settled, pending or refused. */
function statusTone(status: FindingStatus): 'open' | 'pending' | 'rejected' {
  switch (status) {
    case 'no_action_required':
    case 'plan_adequate':
    case 'verified_effective':
      return 'open';
    case 'awaiting_response':
    case 'awaiting_plan_judgment':
      return 'pending';
    case 'plan_inadequate':
    case 'verified_not_effective':
      return 'rejected';
  }
  return unexpected(status);
}

export function planOutcomeLabel(
  outcome: PlanOutcome,
): CertificationMessageKey {
  return outcome === 'adequate' ? 'planAdequate' : 'planInadequate';
}

export function verificationMethodLabel(
  method: VerificationMethod,
): CertificationMessageKey {
  return method === 'document_review' ? 'methodDocumentReview' : 'methodOnSite';
}

export function verificationOutcomeLabel(
  outcome: VerificationOutcome,
): CertificationMessageKey {
  return outcome === 'effective' ? 'outcomeEffective' : 'outcomeNotEffective';
}

function classifiedByLabel(by: ClassifiedBy): CertificationMessageKey {
  return by === 'team_leader'
    ? 'classifiedByTeamLeader'
    : 'classifiedByApprover';
}

function stageLabel(stage: AuditStage): CertificationMessageKey {
  return stage === 'stage_1' ? 'findingStage1' : 'findingStage2';
}

/** "Finding 2 — Minor nonconformity": the Finding's current heading. */
export function useFindingHeading() {
  const copy = useCertificationCopy();
  return (finding: Finding) =>
    formatMessage(copy('findingHeading'), {
      sequence: finding.sequence,
      classification: copy(classificationLabel(finding.classification)),
    });
}

/**
 * The exact PDFs a record cites, named from the Case's register. The
 * current evidence of a Finding opens through the register's download when
 * the reader holds the Document right to read content.
 */
function EvidenceList({
  ids,
  register,
  download,
}: {
  ids: readonly string[];
  register: DocumentRegister;
  download?: RegisterDownload;
}) {
  const copy = useCertificationCopy();
  const reference = useAttachmentReference();
  if (ids.length === 0) return <>{copy('findingNoEvidence')}</>;
  return (
    <ul className="certification-evidence">
      {ids.map((id) => {
        // The read checks that the register holds every cited attachment.
        const attached = register.items.find((item) => item.id === id);
        return (
          <li key={id}>
            {attached ? reference(attached) : id}
            {attached && download && (
              <>
                {' '}
                <button
                  type="button"
                  disabled={
                    download.disabled || download.pendingId !== undefined
                  }
                  onClick={() => download.onDownload(attached)}
                >
                  {formatMessage(copy('documentDownload'), {
                    title: attached.sourceTitle,
                    version: attached.versionNumber,
                  })}
                </button>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The current content of a Finding and its follow-up: the server's status,
 * response due date and six-month limit shown exactly as the server derives
 * them, the limit flagged when the server states that it has passed.
 */
export function FindingFacts({
  finding,
  register,
  download,
}: {
  finding: Finding;
  register: DocumentRegister;
  download?: RegisterDownload;
}) {
  const copy = useCertificationCopy();
  const { formatDate } = useInterfaceLocale();
  const { statement } = finding;
  return (
    <dl className="certification-facts">
      <div>
        <dt>{copy('findingClassification')}</dt>
        <dd>{copy(classificationLabel(finding.classification))}</dd>
      </div>
      <div>
        <dt>{copy('findingClause')}</dt>
        <dd>{statement.clause ?? copy('findingNotStated')}</dd>
      </div>
      <div>
        <dt>{copy('findingArea')}</dt>
        <dd>{statement.area ?? copy('findingNotStated')}</dd>
      </div>
      <div>
        <dt>{copy('findingStatement')}</dt>
        <dd>{statement.statement}</dd>
      </div>
      <div>
        <dt>{copy('findingEvidence')}</dt>
        <dd>
          <EvidenceList
            ids={statement.evidenceAttachmentIds}
            register={register}
            download={download}
          />
        </dd>
      </div>
      <div>
        <dt>{copy('findingStatus')}</dt>
        <dd>
          <span
            className={`certification-status certification-status-${statusTone(finding.status)}`}
          >
            {copy(findingStatusLabel(finding.status))}
          </span>
        </dd>
      </div>
      {finding.responseDueOn !== null && (
        <div>
          <dt>{copy('findingResponseDueOn')}</dt>
          <dd>
            <time dateTime={finding.responseDueOn}>
              {formatDate(finding.responseDueOn)}
            </time>
          </dd>
        </div>
      )}
      {finding.limitOn !== null && (
        <div>
          <dt>{copy('findingLimitOn')}</dt>
          <dd>
            <time dateTime={finding.limitOn}>
              {formatDate(finding.limitOn)}
            </time>
            {finding.overdue && (
              <>
                {' '}
                <span className="certification-status certification-status-rejected">
                  {copy('findingOverdue')}
                </span>
              </>
            )}
          </dd>
        </div>
      )}
    </dl>
  );
}

/** What a Finding still needs before the next step, in plain language. */
export function FindingHold({ finding }: { finding: Finding }) {
  const copy = useCertificationCopy();
  const requirement = findingRequirement(finding);
  return (
    <>
      {finding.overdue && (
        <p className="certification-blocked">{copy('findingOverdueNote')}</p>
      )}
      {requirement !== null && (
        <p className="certification-note">
          {copy(
            requirement === 'verifiedEffective'
              ? 'findingHoldsVerification'
              : 'findingHoldsPlan',
          )}
        </p>
      )}
    </>
  );
}

/** The title of one Finding record in its history. */
export function useFindingRecordTitle() {
  const copy = useCertificationCopy();
  return (record: FindingRecord): string => {
    const version = record.version;
    switch (record.kind) {
      case 'statement':
        return formatMessage(copy('findingRecordStatement'), { version });
      case 'classification':
        return formatMessage(copy('findingRecordClassification'), {
          classification: copy(
            classificationLabel(record.value.classification),
          ),
          by: copy(classifiedByLabel(record.value.by)),
          version,
        });
      case 'response':
        return formatMessage(copy('findingRecordResponse'), { version });
      case 'plan_judgment':
        return formatMessage(copy('findingRecordPlanJudgment'), {
          outcome: copy(planOutcomeLabel(record.value.outcome)),
          version,
        });
      case 'verification':
        return formatMessage(copy('findingRecordVerification'), {
          outcome: copy(verificationOutcomeLabel(record.value.outcome)),
          version,
        });
    }
    return unexpected(record);
  };
}

/** The exact values one Finding record holds. */
export function FindingRecordValues({
  record,
  register,
}: {
  record: FindingRecord;
  register: DocumentRegister;
}) {
  const copy = useCertificationCopy();
  const { formatDate } = useInterfaceLocale();
  const date = (value: string) => (
    <time dateTime={value}>{formatDate(value)}</time>
  );
  switch (record.kind) {
    case 'statement':
      return (
        <dl className="certification-facts">
          <div>
            <dt>{copy('findingClause')}</dt>
            <dd>{record.value.clause ?? copy('findingNotStated')}</dd>
          </div>
          <div>
            <dt>{copy('findingArea')}</dt>
            <dd>{record.value.area ?? copy('findingNotStated')}</dd>
          </div>
          <div>
            <dt>{copy('findingStatement')}</dt>
            <dd>{record.value.statement}</dd>
          </div>
          <div>
            <dt>{copy('findingEvidence')}</dt>
            <dd>
              <EvidenceList
                ids={record.value.evidenceAttachmentIds}
                register={register}
              />
            </dd>
          </div>
        </dl>
      );
    case 'classification':
      return (
        <dl className="certification-facts">
          <div>
            <dt>{copy('findingClassification')}</dt>
            <dd>{copy(classificationLabel(record.value.classification))}</dd>
          </div>
        </dl>
      );
    case 'response':
      return (
        <dl className="certification-facts">
          <div>
            <dt>{copy('responseCorrection')}</dt>
            <dd>{record.value.correction}</dd>
          </div>
          <div>
            <dt>{copy('responseCause')}</dt>
            <dd>{record.value.cause}</dd>
          </div>
          <div>
            <dt>{copy('responseCorrectiveAction')}</dt>
            <dd>{record.value.correctiveAction}</dd>
          </div>
          <div>
            <dt>{copy('responseReceivedOn')}</dt>
            <dd>{date(record.value.receivedOn)}</dd>
          </div>
          <div>
            <dt>{copy('responsePlannedCompletionOn')}</dt>
            <dd>
              {record.value.plannedCompletionOn === null
                ? copy('responseNoPlannedCompletion')
                : date(record.value.plannedCompletionOn)}
            </dd>
          </div>
          <div>
            <dt>{copy('findingEvidence')}</dt>
            <dd>
              <EvidenceList
                ids={record.value.evidenceAttachmentIds}
                register={register}
              />
            </dd>
          </div>
        </dl>
      );
    case 'plan_judgment':
      return (
        <dl className="certification-facts">
          <div>
            <dt>{copy('planOutcome')}</dt>
            <dd>{copy(planOutcomeLabel(record.value.outcome))}</dd>
          </div>
          <div>
            <dt>{copy('planNote')}</dt>
            <dd>{record.value.note}</dd>
          </div>
        </dl>
      );
    case 'verification':
      return (
        <dl className="certification-facts">
          <div>
            <dt>{copy('verificationVerifiedOn')}</dt>
            <dd>{date(record.value.verifiedOn)}</dd>
          </div>
          <div>
            <dt>{copy('verificationMethod')}</dt>
            <dd>{copy(verificationMethodLabel(record.value.method))}</dd>
          </div>
          <div>
            <dt>{copy('verificationOutcome')}</dt>
            <dd>{copy(verificationOutcomeLabel(record.value.outcome))}</dd>
          </div>
          <div>
            <dt>{copy('verificationNote')}</dt>
            <dd>{record.value.note}</dd>
          </div>
          <div>
            <dt>{copy('findingEvidence')}</dt>
            <dd>
              <EvidenceList
                ids={record.value.evidenceAttachmentIds}
                register={register}
              />
            </dd>
          </div>
        </dl>
      );
  }
  return unexpected(record);
}

/** Every record of a Finding in Case order, none replacing an earlier one. */
export function FindingHistory({
  finding,
  register,
}: {
  finding: Finding;
  register: DocumentRegister;
}) {
  const copy = useCertificationCopy();
  const title = useFindingRecordTitle();
  return (
    <details className="certification-history">
      <summary>
        {formatMessage(copy('findingHistory'), { sequence: finding.sequence })}
      </summary>
      <ol>
        {finding.records.map((record) => (
          <li key={record.id}>
            <strong>{title(record)}</strong>
            <VersionAttribution version={record} />
            <FindingRecordValues record={record} register={register} />
          </li>
        ))}
      </ol>
    </details>
  );
}

/** One command of the Case on a Finding: its records at one revision. */
export type FindingTimelineEntry = {
  key: string;
  caseRevision: number;
  finding: Finding;
  /** A creation holds the first statement and classification; else one record. */
  records: [FindingRecord, ...FindingRecord[]];
};

/** The Finding commands of the Case, one entry per revision. */
export function findingTimelineEntries(
  findings: readonly Finding[],
): FindingTimelineEntry[] {
  return findings.flatMap((finding) => {
    const entries: FindingTimelineEntry[] = [];
    for (const record of finding.records) {
      const last = entries.at(-1);
      if (last?.caseRevision === record.caseRevision) last.records.push(record);
      else
        entries.push({
          key: record.id,
          caseRevision: record.caseRevision,
          finding,
          records: [record],
        });
    }
    return entries;
  });
}

/**
 * The timeline line of one Finding command, named by its Activity event:
 * recorded, corrected, reclassified, response, plan judgment, verification.
 */
export function FindingTimelineItem({
  entry,
  register,
}: {
  entry: FindingTimelineEntry;
  register: DocumentRegister;
}) {
  const copy = useCertificationCopy();
  const [first] = entry.records;
  const sequence = entry.finding.sequence;
  const created = entry.records.find(
    (record) => record.kind === 'classification' && record.version === 1,
  );
  return (
    <>
      <strong>{title()}</strong>
      <VersionAttribution version={first} />
      <details>
        <summary>{copy('showValues')}</summary>
        {entry.records.map((record) => (
          <FindingRecordValues
            key={record.id}
            record={record}
            register={register}
          />
        ))}
      </details>
    </>
  );

  function title(): string {
    if (created?.kind === 'classification')
      return formatMessage(copy('timelineFindingRecorded'), {
        sequence,
        classification: copy(classificationLabel(created.value.classification)),
        stage: copy(stageLabel(entry.finding.stage)),
      });
    const version = first.version;
    switch (first.kind) {
      case 'statement':
        return formatMessage(copy('timelineFindingCorrected'), {
          sequence,
          version,
        });
      case 'classification':
        return formatMessage(copy('timelineFindingReclassified'), {
          sequence,
          classification: copy(classificationLabel(first.value.classification)),
          by: copy(classifiedByLabel(first.value.by)),
          version,
        });
      case 'response':
        return formatMessage(copy('timelineNonconformityResponse'), {
          sequence,
          version,
        });
      case 'plan_judgment':
        return formatMessage(copy('timelineNonconformityPlanJudged'), {
          sequence,
          outcome: copy(planOutcomeLabel(first.value.outcome)),
          version,
        });
      case 'verification':
        return formatMessage(copy('timelineNonconformityVerified'), {
          sequence,
          outcome: copy(verificationOutcomeLabel(first.value.outcome)),
          version,
        });
    }
    return unexpected(first);
  }
}

function unexpected(value: never): never {
  throw new Error(`Unexpected Certification Finding value: ${String(value)}`);
}
