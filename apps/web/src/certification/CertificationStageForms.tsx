import type { FormEvent, ReactNode } from 'react';
import { formatMessage } from '../localization/messages';
import { Select } from '../presentation/Select';
import {
  useCertificationCopy,
  type CertificationMessageKey,
} from './certification.copy';
import {
  CERTIFICATION_LIMITS,
  type CertificationAttachment,
} from './certification-response';
import { blank, invalidField, wrongDate } from './certification-fields';
import {
  STAGE_LIMITS,
  stageDayCents,
  type AuditStage,
} from './certification-stages';
import {
  draftDeviates,
  type Stage1ReportDraft,
  type Stage2ReportDraft,
  type StagePlanDraft,
} from './certification-stages-draft';
import { ActingFieldset } from './CertificationAttribution';
import { useAttachmentReference } from './CertificationDocumentViews';
import { useDurationFormat } from './CertificationDurationViews';
import { conclusionLabel } from './CertificationStageViews';

/** What every Stage form shares: its state, feedback and actions. */
type StageFormBase<Draft> = {
  idPrefix: string;
  stage: AuditStage;
  draft: Draft;
  /** A version is recorded: saving records a new version with its reason. */
  correcting: boolean;
  disabled: boolean;
  submitting: boolean;
  /** Saving waits for a reload of the outdated Case; the draft stays editable. */
  submitBlocked: boolean;
  feedbackId?: string;
  onChange: (draft: Draft) => void;
  onSubmit: (event: FormEvent) => void;
  onCancel?: () => void;
};

export function stageFormTitle({
  stage,
  record,
  correcting,
}: {
  stage: AuditStage;
  record: 'plan' | 'report';
  correcting: boolean;
}): CertificationMessageKey {
  if (stage === 'stage_1') {
    if (record === 'plan')
      return correcting ? 'correctStage1Plan' : 'recordStage1Plan';
    return correcting ? 'correctStage1Report' : 'recordStage1Report';
  }
  if (record === 'plan')
    return correcting ? 'correctStage2Plan' : 'recordStage2Plan';
  return correcting ? 'correctStage2Report' : 'recordStage2Report';
}

export type StagePlanFormProps = StageFormBase<StagePlanDraft> & {
  /** The confirmed on-site auditor-days of this Stage. */
  confirmedOnSite: string;
  /** The register's attachments with the plan role. */
  attachments: readonly CertificationAttachment[];
};

/**
 * The dates, on-site and remote auditor-days, objectives, scope, attached
 * plan and the date it was sent; on-site days other than the confirmed
 * duration ask for the deviation. A new version also states its reason.
 */
export function StagePlanForm(props: StagePlanFormProps) {
  const { draft, onChange, confirmedOnSite, attachments } = props;
  const copy = useCertificationCopy();
  const format = useDurationFormat();
  const reference = useAttachmentReference();
  const id = (name: string) => `${props.idPrefix}-${name}`;
  const described = (...ids: string[]) =>
    [...ids, props.feedbackId].filter(Boolean).join(' ') || undefined;
  const text = (
    field: keyof StagePlanDraft,
    label: CertificationMessageKey,
    options: {
      type?: 'date';
      inputMode?: 'decimal';
      help?: string[];
      required?: boolean;
      /** The field's own value is wrong. */
      wrong: boolean;
    },
  ) => (
    <div className="certification-field">
      <label htmlFor={id(field)}>{copy(label)}</label>
      <input
        id={id(field)}
        type={options.type ?? 'text'}
        inputMode={options.inputMode}
        value={draft[field]}
        disabled={props.disabled}
        required={options.required ?? true}
        aria-invalid={invalidField(props.feedbackId, options.wrong)}
        aria-describedby={described(...(options.help ?? []))}
        onChange={(event) =>
          onChange({ ...draft, [field]: event.target.value })
        }
      />
    </div>
  );
  const area = (
    field: 'objectives' | 'scope',
    label: CertificationMessageKey,
  ) => (
    <>
      <label htmlFor={id(field)}>{copy(label)}</label>
      <textarea
        id={id(field)}
        value={draft[field]}
        maxLength={STAGE_LIMITS[field]}
        disabled={props.disabled}
        required
        aria-invalid={invalidField(props.feedbackId, blank(draft[field]))}
        aria-describedby={described()}
        onChange={(event) =>
          onChange({ ...draft, [field]: event.target.value })
        }
      />
    </>
  );
  return (
    <StageFormFrame
      {...props}
      record="plan"
      help={<p>{copy('stagePlanHelp')}</p>}
    >
      {text('startDate', 'stageStartDate', {
        type: 'date',
        wrong: wrongDate(draft.startDate, { required: true }),
      })}
      {text('endDate', 'stageEndDate', {
        type: 'date',
        wrong: wrongDate(draft.endDate, { required: true }),
      })}
      {text('onSiteDays', 'stageOnSiteDays', {
        inputMode: 'decimal',
        help: [id('on-site-help'), id('days-help')],
        wrong:
          stageDayCents(draft.onSiteDays.trim(), { zeroAllowed: false }) ===
          undefined,
      })}
      <small id={id('on-site-help')}>
        {formatMessage(copy('stageOnSiteDaysHelp'), {
          days: format.days(confirmedOnSite),
        })}
      </small>
      {text('remoteDays', 'stageRemoteDays', {
        inputMode: 'decimal',
        help: [id('days-help')],
        wrong:
          stageDayCents(draft.remoteDays.trim(), { zeroAllowed: true }) ===
          undefined,
      })}
      <small id={id('days-help')}>{copy('stageDaysFormatHelp')}</small>
      {area('objectives', 'stageObjectives')}
      {area('scope', 'stageScope')}
      <label htmlFor={id('plan-document')}>{copy('stagePlanDocument')}</label>
      <Select
        id={id('plan-document')}
        value={draft.planAttachmentId}
        placeholder={copy('selectStagePlanDocument')}
        disabled={props.disabled}
        required
        invalid={invalidField(props.feedbackId, draft.planAttachmentId === '')}
        describedBy={described()}
        options={attachments.map((attachment) => ({
          value: attachment.id,
          label: reference(attachment),
        }))}
        onValueChange={(planAttachmentId) =>
          onChange({ ...draft, planAttachmentId })
        }
      />
      {text('sentToClientOn', 'stageSentToClientOn', {
        type: 'date',
        required: false,
        help: [id('sent-help')],
        wrong: wrongDate(draft.sentToClientOn, { required: false }),
      })}
      <small id={id('sent-help')}>{copy('stageSentToClientOnHelp')}</small>
      {draftDeviates(draft.onSiteDays, confirmedOnSite) && (
        <div className="certification-field">
          <label htmlFor={id('deviation')}>{copy('stageDeviationNote')}</label>
          <textarea
            id={id('deviation')}
            value={draft.deviationNote}
            maxLength={STAGE_LIMITS.deviationNote}
            disabled={props.disabled}
            required
            aria-invalid={invalidField(
              props.feedbackId,
              blank(draft.deviationNote),
            )}
            aria-describedby={described(id('deviation-help'))}
            onChange={(event) =>
              onChange({ ...draft, deviationNote: event.target.value })
            }
          />
          <small id={id('deviation-help')}>
            {copy('stageDeviationNoteHelp')}
          </small>
        </div>
      )}
    </StageFormFrame>
  );
}

export type Stage1ReportFormProps = StageFormBase<Stage1ReportDraft> & {
  /** The register's attachments with the report role. */
  reports: readonly CertificationAttachment[];
  /** The register's attachments with the participant-list role. */
  participantLists: readonly CertificationAttachment[];
  /** The Case's attachments a signed approval form may be chosen from. */
  documents: readonly CertificationAttachment[];
};

/**
 * The report date, the explicit confirmation of the document review, the
 * readiness conclusion with its basis, the attached report and optionally
 * the participant list. Nothing is preselected.
 */
export function Stage1ReportForm(props: Stage1ReportFormProps) {
  const { draft, onChange } = props;
  const copy = useCertificationCopy();
  const id = (name: string) => `${props.idPrefix}-${name}`;
  return (
    <StageFormFrame
      {...props}
      record="report"
      help={<p>{copy('stage1ReportHelp')}</p>}
    >
      <ReportDate {...props} />
      <label className="certification-choice">
        <input
          type="checkbox"
          checked={draft.documentReviewCompleted}
          disabled={props.disabled}
          onChange={(event) =>
            onChange({
              ...draft,
              documentReviewCompleted: event.target.checked,
            })
          }
        />
        {copy('stageDocumentReviewConfirm')}
      </label>
      <fieldset>
        <legend>{copy('stageConclusion')}</legend>
        {(['ready', 'not_ready'] as const).map((conclusion) => (
          <label key={conclusion} className="certification-choice">
            <input
              type="radio"
              name={id('conclusion')}
              value={conclusion}
              checked={draft.conclusion === conclusion}
              disabled={props.disabled}
              onChange={() => onChange({ ...draft, conclusion })}
            />
            {copy(conclusionLabel(conclusion))}
          </label>
        ))}
      </fieldset>
      <label htmlFor={id('conclusion-note')}>
        {copy('stageConclusionNote')}
      </label>
      <textarea
        id={id('conclusion-note')}
        value={draft.conclusionNote}
        maxLength={STAGE_LIMITS.conclusionNote}
        disabled={props.disabled}
        required
        aria-invalid={invalidField(
          props.feedbackId,
          blank(draft.conclusionNote),
        )}
        aria-describedby={props.feedbackId}
        onChange={(event) =>
          onChange({ ...draft, conclusionNote: event.target.value })
        }
      />
      <AttachmentChoice
        {...props}
        field="reportAttachmentId"
        label="stageReportDocument"
        placeholder="selectStageReportDocument"
        attachments={props.reports}
        required
      />
      <AttachmentChoice
        {...props}
        field="participantListAttachmentId"
        label="stageParticipantList"
        placeholder="stageNoParticipantList"
        attachments={props.participantLists}
      />
      <ActingFieldset
        idPrefix={id('approval')}
        legend="actingReportApprovalLegend"
        draft={draft.certificationBodyApproval}
        documents={props.documents}
        disabled={props.disabled}
        feedbackId={props.feedbackId}
        onChange={(certificationBodyApproval) =>
          onChange({ ...draft, certificationBodyApproval })
        }
      />
    </StageFormFrame>
  );
}

export type Stage2ReportFormProps = StageFormBase<Stage2ReportDraft> & {
  reports: readonly CertificationAttachment[];
  participantLists: readonly CertificationAttachment[];
  /** The register's attachments an annex may be: report, evidence, ISO annex. */
  annexes: readonly CertificationAttachment[];
  documents: readonly CertificationAttachment[];
};

/** The report date, the summary, the attached report and optional attachments. */
export function Stage2ReportForm(props: Stage2ReportFormProps) {
  const { draft, onChange } = props;
  const copy = useCertificationCopy();
  const id = (name: string) => `${props.idPrefix}-${name}`;
  return (
    <StageFormFrame
      {...props}
      record="report"
      help={<p>{copy('stage2ReportHelp')}</p>}
    >
      <ReportDate {...props} />
      <label htmlFor={id('summary')}>{copy('stageSummary')}</label>
      <textarea
        id={id('summary')}
        value={draft.summary}
        maxLength={STAGE_LIMITS.summary}
        disabled={props.disabled}
        required
        aria-invalid={invalidField(props.feedbackId, blank(draft.summary))}
        aria-describedby={props.feedbackId}
        onChange={(event) =>
          onChange({ ...draft, summary: event.target.value })
        }
      />
      <AttachmentChoice
        {...props}
        field="reportAttachmentId"
        label="stageReportDocument"
        placeholder="selectStageReportDocument"
        attachments={props.reports}
        required
      />
      <AttachmentChoice
        {...props}
        field="participantListAttachmentId"
        label="stageParticipantList"
        placeholder="stageNoParticipantList"
        attachments={props.participantLists}
      />
      <AttachmentChoice
        {...props}
        field="annexAttachmentId"
        label="stageAnnex"
        placeholder="stageNoAnnex"
        attachments={props.annexes}
      />
      <ActingFieldset
        idPrefix={id('approval')}
        legend="actingReportApprovalLegend"
        draft={draft.certificationBodyApproval}
        documents={props.documents}
        disabled={props.disabled}
        feedbackId={props.feedbackId}
        onChange={(certificationBodyApproval) =>
          onChange({ ...draft, certificationBodyApproval })
        }
      />
    </StageFormFrame>
  );
}

/** The report date of either Stage report. */
function ReportDate<Draft extends { reportDate: string }>(
  props: StageFormBase<Draft>,
) {
  const copy = useCertificationCopy();
  const id = `${props.idPrefix}-report-date`;
  return (
    <div className="certification-field">
      <label htmlFor={id}>{copy('stageReportDate')}</label>
      <input
        id={id}
        type="date"
        value={props.draft.reportDate}
        disabled={props.disabled}
        required
        aria-invalid={invalidField(
          props.feedbackId,
          wrongDate(props.draft.reportDate, { required: true }),
        )}
        aria-describedby={props.feedbackId}
        onChange={(event) =>
          props.onChange({ ...props.draft, reportDate: event.target.value })
        }
      />
    </div>
  );
}

/** One attachment of the register for a report slot, optional or required. */
function AttachmentChoice<
  Field extends string,
  Draft extends Record<Field, string>,
>(
  props: StageFormBase<Draft> & {
    field: Field;
    label: CertificationMessageKey;
    placeholder: CertificationMessageKey;
    attachments: readonly CertificationAttachment[];
    required?: boolean;
  },
) {
  const copy = useCertificationCopy();
  const reference = useAttachmentReference();
  const id = `${props.idPrefix}-${props.field}`;
  return (
    <>
      <label htmlFor={id}>{copy(props.label)}</label>
      <Select
        id={id}
        value={props.draft[props.field]}
        placeholder={copy(props.placeholder)}
        disabled={props.disabled}
        required={props.required ?? false}
        invalid={invalidField(
          props.feedbackId,
          (props.required ?? false) && props.draft[props.field] === '',
        )}
        describedBy={props.feedbackId}
        options={props.attachments.map((attachment) => ({
          value: attachment.id,
          label: reference(attachment),
        }))}
        onValueChange={(value) =>
          props.onChange({ ...props.draft, [props.field]: value })
        }
      />
    </>
  );
}

/** The form element, its correction reason and its actions. */
function StageFormFrame<Draft extends { reason: string }>(
  props: StageFormBase<Draft> & {
    record: 'plan' | 'report';
    help: ReactNode;
    children: ReactNode;
  },
) {
  const copy = useCertificationCopy();
  const { correcting, draft } = props;
  const title = stageFormTitle({
    stage: props.stage,
    record: props.record,
    correcting,
  });
  const reasonId = `${props.idPrefix}-reason`;
  return (
    <form
      className="certification-form"
      aria-label={copy(title)}
      noValidate
      onSubmit={props.onSubmit}
    >
      {correcting && <p>{copy('correctionHelp')}</p>}
      {props.help}
      {props.children}
      {correcting && (
        <>
          <label htmlFor={reasonId}>{copy('correctionReason')}</label>
          <textarea
            id={reasonId}
            value={draft.reason}
            maxLength={CERTIFICATION_LIMITS.reason}
            disabled={props.disabled}
            required
            aria-invalid={invalidField(props.feedbackId, blank(draft.reason))}
            aria-describedby={props.feedbackId}
            onChange={(event) =>
              props.onChange({ ...draft, reason: event.target.value })
            }
          />
        </>
      )}
      <div className="certification-actions">
        <button
          type="submit"
          className="certification-primary"
          disabled={props.disabled || props.submitBlocked}
        >
          {props.submitting
            ? copy('saving')
            : copy(
                correcting
                  ? 'saveCorrection'
                  : stageFormTitle({
                      stage: props.stage,
                      record: props.record,
                      correcting: false,
                    }),
              )}
        </button>
        {props.onCancel && (
          <button
            type="button"
            disabled={props.submitting}
            onClick={props.onCancel}
          >
            {copy('cancel')}
          </button>
        )}
      </div>
    </form>
  );
}
