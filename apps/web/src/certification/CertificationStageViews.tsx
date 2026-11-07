import { useInterfaceLocale } from '../localization/interface-locale';
import {
  useCertificationCopy,
  type CertificationMessageKey,
} from './certification.copy';
import type { DocumentRegister } from './certification-response';
import type {
  Stage1Conclusion,
  Stage1Report,
  Stage2Report,
  StagePlan,
} from './certification-stages';
import { ActingRow } from './CertificationAttribution';
import { useAttachmentReference } from './CertificationDocumentViews';
import { useDurationFormat } from './CertificationDurationViews';

export function conclusionLabel(
  conclusion: Stage1Conclusion,
): CertificationMessageKey {
  return conclusion === 'ready'
    ? 'stageConclusionReady'
    : 'stageConclusionNotReady';
}

/** The attachment a Stage record names, from the Case's register. */
function useStageAttachment(register: DocumentRegister) {
  const copy = useCertificationCopy();
  const reference = useAttachmentReference();
  return (attachmentId: string | null) => {
    if (attachmentId === null) return copy('stageNoAttachment');
    // The read checks that the register holds every Stage attachment.
    const attached = register.items.find((item) => item.id === attachmentId);
    return attached ? reference(attached) : attachmentId;
  };
}

/** A recorded Stage plan with its exact dates, days, texts and attachment. */
export function StagePlanView({
  plan,
  register,
}: {
  plan: StagePlan;
  register: DocumentRegister;
}) {
  const copy = useCertificationCopy();
  const { formatDate } = useInterfaceLocale();
  const format = useDurationFormat();
  const attachment = useStageAttachment(register);
  return (
    <dl className="certification-facts">
      <div>
        <dt>{copy('stageStartDate')}</dt>
        <dd>
          <time dateTime={plan.startDate}>{formatDate(plan.startDate)}</time>
        </dd>
      </div>
      <div>
        <dt>{copy('stageEndDate')}</dt>
        <dd>
          <time dateTime={plan.endDate}>{formatDate(plan.endDate)}</time>
        </dd>
      </div>
      <div>
        <dt>{copy('stageOnSiteDays')}</dt>
        <dd>{format.days(plan.onSiteDays)}</dd>
      </div>
      <div>
        <dt>{copy('stageRemoteDays')}</dt>
        <dd>{format.days(plan.remoteDays)}</dd>
      </div>
      <div>
        <dt>{copy('stageObjectives')}</dt>
        <dd>{plan.objectives}</dd>
      </div>
      <div>
        <dt>{copy('stageScope')}</dt>
        <dd>{plan.scope}</dd>
      </div>
      <div>
        <dt>{copy('stagePlanDocument')}</dt>
        <dd>{attachment(plan.planAttachmentId)}</dd>
      </div>
      <div>
        <dt>{copy('stageSentToClientOn')}</dt>
        <dd>
          {plan.sentToClientOn === null ? (
            copy('stageNotSent')
          ) : (
            <time dateTime={plan.sentToClientOn}>
              {formatDate(plan.sentToClientOn)}
            </time>
          )}
        </dd>
      </div>
      <div>
        <dt>{copy('stageDeviationNote')}</dt>
        <dd>{plan.deviationNote ?? copy('stageNoDeviation')}</dd>
      </div>
    </dl>
  );
}

/** The Stage 1 report: review, readiness conclusion, basis and attachments. */
export function Stage1ReportView({
  report,
  register,
}: {
  report: Stage1Report;
  register: DocumentRegister;
}) {
  const copy = useCertificationCopy();
  const { formatDate } = useInterfaceLocale();
  const attachment = useStageAttachment(register);
  return (
    <dl className="certification-facts">
      <div>
        <dt>{copy('stageReportDate')}</dt>
        <dd>
          <time dateTime={report.reportDate}>
            {formatDate(report.reportDate)}
          </time>
        </dd>
      </div>
      <div>
        <dt>{copy('stageDocumentReview')}</dt>
        <dd>{copy('stageDocumentReviewCompleted')}</dd>
      </div>
      <div>
        <dt>{copy('stageConclusion')}</dt>
        <dd>
          <span
            className={`certification-status certification-status-${report.conclusion === 'ready' ? 'open' : 'rejected'}`}
          >
            {copy(conclusionLabel(report.conclusion))}
          </span>
        </dd>
      </div>
      <div>
        <dt>{copy('stageConclusionNote')}</dt>
        <dd>{report.conclusionNote}</dd>
      </div>
      <div>
        <dt>{copy('stageReportDocument')}</dt>
        <dd>{attachment(report.reportAttachmentId)}</dd>
      </div>
      <div>
        <dt>{copy('stageParticipantList')}</dt>
        <dd>{attachment(report.participantListAttachmentId)}</dd>
      </div>
      <ActingRow
        label="actingReportApprovalView"
        act={report.certificationBodyApproval}
        register={register}
      />
    </dl>
  );
}

/** The Stage 2 report: its completion, summary and attachments. */
export function Stage2ReportView({
  report,
  register,
}: {
  report: Stage2Report;
  register: DocumentRegister;
}) {
  const copy = useCertificationCopy();
  const { formatDate } = useInterfaceLocale();
  const attachment = useStageAttachment(register);
  return (
    <dl className="certification-facts">
      <div>
        <dt>{copy('stageReportDate')}</dt>
        <dd>
          <time dateTime={report.reportDate}>
            {formatDate(report.reportDate)}
          </time>
        </dd>
      </div>
      <div>
        <dt>{copy('stageSummary')}</dt>
        <dd>{report.summary}</dd>
      </div>
      <div>
        <dt>{copy('stageReportDocument')}</dt>
        <dd>{attachment(report.reportAttachmentId)}</dd>
      </div>
      <div>
        <dt>{copy('stageParticipantList')}</dt>
        <dd>{attachment(report.participantListAttachmentId)}</dd>
      </div>
      <div>
        <dt>{copy('stageAnnex')}</dt>
        <dd>{attachment(report.annexAttachmentId)}</dd>
      </div>
      <ActingRow
        label="actingReportApprovalView"
        act={report.certificationBodyApproval}
        register={register}
      />
    </dl>
  );
}
