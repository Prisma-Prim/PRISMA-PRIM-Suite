import type { FormEvent, ReactNode } from 'react';
import {
  useCertificationCopy,
  type CertificationMessageKey,
} from './certification.copy';
import { useAttachmentReference } from './CertificationDocumentViews';
import { blank, invalidField, wrongDate } from './certification-fields';
import {
  FINDING_LIMITS,
  stageClassifications,
  type FindingClassification,
} from './certification-findings';
import {
  evidenceOptions,
  toggleEvidence,
  type ClassificationDraft,
  type FindingCorrectionDraft,
  type FindingDraft,
  type FindingStatementDraft,
  type PlanJudgmentDraft,
  type ResponseDraft,
  type VerificationDraft,
} from './certification-findings-draft';
import {
  classificationLabel,
  planOutcomeLabel,
  verificationMethodLabel,
  verificationOutcomeLabel,
} from './CertificationFindingViews';
import {
  CERTIFICATION_LIMITS,
  type CertificationAttachment,
} from './certification-response';
import type { AuditStage } from './certification-stages';

/** What every Finding form shares: its state, feedback and actions. */
type FindingFormBase<Draft> = {
  idPrefix: string;
  /** The form's accessible name, the same as the button that opened it. */
  title: string;
  draft: Draft;
  disabled: boolean;
  submitting: boolean;
  /** Saving waits for a reload of the outdated Case; the draft stays editable. */
  submitBlocked: boolean;
  feedbackId?: string;
  onChange: (draft: Draft) => void;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
};

type WithRegister = {
  /** The Case's attachments, in attachment order. */
  register: readonly CertificationAttachment[];
};

/**
 * A new Finding of a planned Stage: an explicit classification allowed in
 * that Stage, the clause, process or area and statement, and the exact
 * evidence PDFs of the Case.
 */
export function FindingRecordForm(
  props: FindingFormBase<FindingDraft> & WithRegister & { stage: AuditStage },
) {
  const { draft, onChange } = props;
  return (
    <FindingFormFrame
      {...props}
      help="recordFindingHelp"
      submit="findingSubmit"
    >
      <Choice
        {...props}
        name="classification"
        legend="findingClassification"
        value={draft.classification}
        options={classificationOptions(props.stage)}
        onChoose={(classification) => onChange({ ...draft, classification })}
      />
      <StatementFields {...props} />
    </FindingFormFrame>
  );
}

/** A corrected statement under the same classification, with its reason. */
export function FindingCorrectionForm(
  props: FindingFormBase<FindingCorrectionDraft> & WithRegister,
) {
  return (
    <FindingFormFrame {...props} help="correctionHelp" submit="saveCorrection">
      <StatementFields {...props} />
      <TextArea
        {...props}
        field="reason"
        label="correctionReason"
        limit={CERTIFICATION_LIMITS.reason}
      />
    </FindingFormFrame>
  );
}

/**
 * Another classification for a Finding, by its team leader or by an
 * approver outside the team, with its reason; nothing is preselected.
 */
export function ClassificationForm(
  props: FindingFormBase<ClassificationDraft> & {
    stage: AuditStage;
    by: 'team_leader' | 'approver';
  },
) {
  const { draft, onChange } = props;
  return (
    <FindingFormFrame
      {...props}
      help={
        props.by === 'approver'
          ? 'reclassificationHelp'
          : 'classificationChangeHelp'
      }
      submit="classificationSubmit"
    >
      <Choice
        {...props}
        name="classification"
        legend="classificationNew"
        value={draft.classification}
        options={classificationOptions(props.stage)}
        onChoose={(classification) => onChange({ ...draft, classification })}
      />
      <TextArea
        {...props}
        field="reason"
        label="classificationReason"
        limit={CERTIFICATION_LIMITS.reason}
      />
    </FindingFormFrame>
  );
}

/** The client's correction, cause and corrective action as received. */
export function ResponseForm(
  props: FindingFormBase<ResponseDraft> & WithRegister,
) {
  const { draft, onChange } = props;
  return (
    <FindingFormFrame {...props} help="responseHelp" submit="responseSubmit">
      <TextArea
        {...props}
        field="correction"
        label="responseCorrection"
        limit={FINDING_LIMITS.responseText}
      />
      <TextArea
        {...props}
        field="cause"
        label="responseCause"
        limit={FINDING_LIMITS.responseText}
      />
      <TextArea
        {...props}
        field="correctiveAction"
        label="responseCorrectiveAction"
        limit={FINDING_LIMITS.responseText}
      />
      <DateField {...props} field="receivedOn" label="responseReceivedOn" />
      <DateField
        {...props}
        field="plannedCompletionOn"
        label="responsePlannedCompletionOn"
        optional
      />
      <EvidenceChoice
        {...props}
        chosen={draft.evidenceAttachmentIds}
        onToggle={(evidenceAttachmentIds) =>
          onChange({ ...draft, evidenceAttachmentIds })
        }
      />
    </FindingFormFrame>
  );
}

/** Whether the latest response is adequate, and on what basis. */
export function PlanJudgmentForm(props: FindingFormBase<PlanJudgmentDraft>) {
  const { draft, onChange } = props;
  return (
    <FindingFormFrame {...props} help="judgePlanHelp" submit="judgmentSubmit">
      <Choice
        {...props}
        name="outcome"
        legend="planOutcome"
        value={draft.outcome}
        options={(['adequate', 'inadequate'] as const).map((outcome) => ({
          value: outcome,
          label: planOutcomeLabel(outcome),
        }))}
        onChoose={(outcome) => onChange({ ...draft, outcome })}
      />
      <TextArea
        {...props}
        field="note"
        label="planNote"
        limit={FINDING_LIMITS.note}
      />
    </FindingFormFrame>
  );
}

/** When and how the implementation was verified, and whether it is effective. */
export function VerificationForm(
  props: FindingFormBase<VerificationDraft> & WithRegister,
) {
  const { draft, onChange } = props;
  return (
    <FindingFormFrame {...props} help="verifyHelp" submit="verificationSubmit">
      <DateField {...props} field="verifiedOn" label="verificationVerifiedOn" />
      <Choice
        {...props}
        name="method"
        legend="verificationMethod"
        value={draft.method}
        options={(['document_review', 'on_site'] as const).map((method) => ({
          value: method,
          label: verificationMethodLabel(method),
        }))}
        onChoose={(method) => onChange({ ...draft, method })}
      />
      <Choice
        {...props}
        name="outcome"
        legend="verificationOutcome"
        value={draft.outcome}
        options={(['effective', 'not_effective'] as const).map((outcome) => ({
          value: outcome,
          label: verificationOutcomeLabel(outcome),
        }))}
        onChoose={(outcome) => onChange({ ...draft, outcome })}
      />
      <TextArea
        {...props}
        field="note"
        label="verificationNote"
        limit={FINDING_LIMITS.note}
      />
      <EvidenceChoice
        {...props}
        chosen={draft.evidenceAttachmentIds}
        onToggle={(evidenceAttachmentIds) =>
          onChange({ ...draft, evidenceAttachmentIds })
        }
      />
    </FindingFormFrame>
  );
}

function classificationOptions(
  stage: AuditStage,
): { value: FindingClassification; label: CertificationMessageKey }[] {
  return stageClassifications(stage).map((classification) => ({
    value: classification,
    label: classificationLabel(classification),
  }));
}

/** The clause, process or area, statement and cited evidence of a Finding. */
function StatementFields<Draft extends FindingStatementDraft>(
  props: FindingFormBase<Draft> & WithRegister,
) {
  const { draft, onChange } = props;
  const copy = useCertificationCopy();
  const id = (name: string) => `${props.idPrefix}-${name}`;
  const described = (...ids: string[]) =>
    [...ids, props.feedbackId].filter(Boolean).join(' ') || undefined;
  // Optional on their own: the alert says when a classification needs them.
  const text = (
    field: 'clause' | 'area',
    label: CertificationMessageKey,
    limit: number,
    help?: string,
  ) => (
    <div className="certification-field">
      <label htmlFor={id(field)}>{copy(label)}</label>
      <input
        id={id(field)}
        value={draft[field]}
        maxLength={limit}
        disabled={props.disabled}
        aria-describedby={described(...(help ? [help] : []))}
        onChange={(event) =>
          onChange({ ...draft, [field]: event.target.value })
        }
      />
    </div>
  );
  return (
    <>
      {text(
        'clause',
        'findingClause',
        FINDING_LIMITS.clause,
        id('clause-help'),
      )}
      <small id={id('clause-help')}>{copy('findingClauseHelp')}</small>
      {text('area', 'findingArea', FINDING_LIMITS.area)}
      <TextArea
        {...props}
        field="statement"
        label="findingStatement"
        limit={FINDING_LIMITS.statement}
      />
      <EvidenceChoice
        {...props}
        chosen={draft.evidenceAttachmentIds}
        missing="findingNoEvidenceDocument"
        onToggle={(evidenceAttachmentIds) =>
          onChange({ ...draft, evidenceAttachmentIds })
        }
      />
    </>
  );
}

/**
 * The exact evidence PDFs of the Case: those attached as evidence and those
 * the draft already cites, each a checkbox. Without any, the form says how
 * to attach one when it matters.
 */
function EvidenceChoice<Draft>(
  props: FindingFormBase<Draft> &
    WithRegister & {
      chosen: readonly string[];
      missing?: CertificationMessageKey;
      onToggle: (chosen: string[]) => void;
    },
) {
  const copy = useCertificationCopy();
  const reference = useAttachmentReference();
  const options = evidenceOptions(props.register, props.chosen);
  const helpId = `${props.idPrefix}-evidence-help`;
  if (options.length === 0)
    return props.missing ? (
      <p className="certification-note">{copy(props.missing)}</p>
    ) : null;
  return (
    <fieldset
      aria-describedby={
        [helpId, props.feedbackId].filter(Boolean).join(' ') || undefined
      }
    >
      <legend>{copy('findingEvidence')}</legend>
      <small id={helpId}>{copy('findingEvidenceHelp')}</small>
      {options.map((attachment) => (
        <label key={attachment.id} className="certification-choice">
          <input
            type="checkbox"
            checked={props.chosen.includes(attachment.id)}
            disabled={props.disabled}
            onChange={() =>
              props.onToggle(
                toggleEvidence(props.register, props.chosen, attachment.id),
              )
            }
          />
          {reference(attachment)}
        </label>
      ))}
    </fieldset>
  );
}

/** One explicit choice among labelled options; none is preselected. */
function Choice<Draft, Value extends string>(
  props: FindingFormBase<Draft> & {
    name: string;
    legend: CertificationMessageKey;
    value: Value | null;
    options: readonly { value: Value; label: CertificationMessageKey }[];
    onChoose: (value: Value) => void;
  },
) {
  const copy = useCertificationCopy();
  return (
    <fieldset aria-describedby={props.feedbackId}>
      <legend>{copy(props.legend)}</legend>
      {props.options.map((option) => (
        <label key={option.value} className="certification-choice">
          <input
            type="radio"
            name={`${props.idPrefix}-${props.name}`}
            value={option.value}
            checked={props.value === option.value}
            disabled={props.disabled}
            onChange={() => props.onChoose(option.value)}
          />
          {copy(option.label)}
        </label>
      ))}
    </fieldset>
  );
}

function TextArea<Field extends string, Draft extends Record<Field, string>>(
  props: FindingFormBase<Draft> & {
    field: Field;
    label: CertificationMessageKey;
    limit: number;
  },
) {
  const copy = useCertificationCopy();
  const id = `${props.idPrefix}-${props.field}`;
  return (
    <div className="certification-field">
      <label htmlFor={id}>{copy(props.label)}</label>
      <textarea
        id={id}
        value={props.draft[props.field]}
        maxLength={props.limit}
        disabled={props.disabled}
        required
        aria-invalid={invalidField(
          props.feedbackId,
          blank(props.draft[props.field]),
        )}
        aria-describedby={props.feedbackId}
        onChange={(event) =>
          props.onChange({ ...props.draft, [props.field]: event.target.value })
        }
      />
    </div>
  );
}

function DateField<Field extends string, Draft extends Record<Field, string>>(
  props: FindingFormBase<Draft> & {
    field: Field;
    label: CertificationMessageKey;
    optional?: boolean;
  },
) {
  const copy = useCertificationCopy();
  const id = `${props.idPrefix}-${props.field}`;
  return (
    <div className="certification-field">
      <label htmlFor={id}>{copy(props.label)}</label>
      <input
        id={id}
        type="date"
        value={props.draft[props.field]}
        disabled={props.disabled}
        required={!props.optional}
        aria-invalid={invalidField(
          props.feedbackId,
          wrongDate(props.draft[props.field], { required: !props.optional }),
        )}
        aria-describedby={props.feedbackId}
        onChange={(event) =>
          props.onChange({ ...props.draft, [props.field]: event.target.value })
        }
      />
    </div>
  );
}

/** The form element, its help and its actions. */
function FindingFormFrame<Draft>(
  props: FindingFormBase<Draft> & {
    help: CertificationMessageKey;
    submit: CertificationMessageKey;
    children: ReactNode;
  },
) {
  const copy = useCertificationCopy();
  return (
    <form
      className="certification-form"
      aria-label={props.title}
      noValidate
      onSubmit={props.onSubmit}
    >
      <p>{copy(props.help)}</p>
      {props.children}
      <div className="certification-actions">
        <button
          type="submit"
          className="certification-primary"
          disabled={props.disabled || props.submitBlocked}
        >
          {props.submitting ? copy('saving') : copy(props.submit)}
        </button>
        <button
          type="button"
          disabled={props.submitting}
          onClick={props.onCancel}
        >
          {copy('cancel')}
        </button>
      </div>
    </form>
  );
}
