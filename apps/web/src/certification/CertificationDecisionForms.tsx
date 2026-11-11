import type { FormEvent, ReactNode } from 'react';
import { formatMessage } from '../localization/messages';
import { Select } from '../presentation/Select';
import {
  useCertificationCopy,
  type CertificationMessageKey,
} from './certification.copy';
import { useAttachmentReference } from './CertificationDocumentViews';
import { ActingFieldset } from './CertificationAttribution';
import { latestBusinessDate } from './certification-attribution';
import { blank, invalidField, wrongDate } from './certification-fields';
import {
  DECISION_LIMITS,
  DOSSIER_ANSWERS,
  DOSSIER_ITEMS,
  RECOMMENDATIONS,
  type CertificationOutcome,
} from './certification-decision';
import {
  emptyCertificateText,
  type CertificateDataDraft,
  type CertificateDraft,
  type CertificateTextDraft,
  type CertificationDecisionDraft,
  type DossierReviewDraft,
  type RecommendationDraft,
} from './certification-decision-draft';
import {
  dossierAnswerLabel,
  dossierItemLabel,
  outcomeLabel,
  recommendationLabel,
} from './CertificationDecisionViews';
import {
  CERTIFICATION_LIMITS,
  type CertificationAttachment,
} from './certification-response';

/** What every closing-step form shares: its state, feedback and actions. */
type FormBase<Draft> = {
  idPrefix: string;
  draft: Draft;
  disabled: boolean;
  submitting: boolean;
  /** Saving waits for a reload of the outdated Case; the draft stays editable. */
  submitBlocked: boolean;
  feedbackId?: string;
  onChange: (draft: Draft) => void;
  onSubmit: (event: FormEvent) => void;
  /** Offered when the form corrects a recorded version. */
  onCancel?: () => void;
};

type Correcting = { correcting: boolean };

/** The team leader's explicit recommendation and its basis. */
export function RecommendationForm(
  props: FormBase<RecommendationDraft> & Correcting,
) {
  const { draft, onChange } = props;
  return (
    <FormFrame
      {...props}
      title={
        props.correcting ? 'correctRecommendation' : 'recordRecommendation'
      }
      help="recommendationHelp"
      submit="recommendationSubmit"
    >
      <Choice
        {...props}
        name="recommendation"
        legend="recommendationOutcome"
        value={draft.recommendation}
        options={RECOMMENDATIONS.map((recommendation) => ({
          value: recommendation,
          label: recommendationLabel(recommendation),
        }))}
        onChoose={(recommendation) => onChange({ ...draft, recommendation })}
      />
      <TextArea
        {...props}
        field="basis"
        label="recommendationBasis"
        limit={DECISION_LIMITS.basis}
      />
      <DateField
        {...props}
        field="recommendedOn"
        label="recommendedOn"
        max={latestBusinessDate()}
        optional
      />
      {props.correcting && (
        <TextArea
          {...props}
          field="reason"
          label="correctionReason"
          limit={CERTIFICATION_LIMITS.reason}
        />
      )}
    </FormFrame>
  );
}

/**
 * One explicit answer per dossier item, each with its note, then the
 * conclusion, the dossier reviewer and approver acting on behalf of the
 * certification body, each optional, and the explicit attestation of
 * independence; nothing is preselected.
 */
export function DossierReviewForm(
  props: FormBase<DossierReviewDraft> &
    Correcting & {
      /** The Case's attachments a signed form may be chosen from. */
      documents: readonly CertificationAttachment[];
    },
) {
  const { draft, onChange } = props;
  const copy = useCertificationCopy();
  return (
    <FormFrame
      {...props}
      title={props.correcting ? 'correctDossierReview' : 'recordDossierReview'}
      help="dossierReviewHelp"
      submit="dossierReviewSubmit"
    >
      {DOSSIER_ITEMS.map((item) => {
        const entry = draft.items[item];
        const noteId = `${props.idPrefix}-${item}-note`;
        const edit = (next: Partial<typeof entry>) =>
          onChange({
            ...draft,
            items: { ...draft.items, [item]: { ...entry, ...next } },
          });
        return (
          <fieldset key={item} aria-describedby={props.feedbackId}>
            <legend>{copy(dossierItemLabel(item))}</legend>
            {DOSSIER_ANSWERS.map((answer) => (
              <label key={answer} className="certification-choice">
                <input
                  type="radio"
                  name={`${props.idPrefix}-${item}`}
                  value={answer}
                  checked={entry.answer === answer}
                  disabled={props.disabled}
                  onChange={() => edit({ answer })}
                />
                {copy(dossierAnswerLabel(answer))}
              </label>
            ))}
            <div className="certification-field">
              <label htmlFor={noteId}>{copy('dossierItemNote')}</label>
              <textarea
                id={noteId}
                value={entry.note}
                maxLength={DECISION_LIMITS.note}
                disabled={props.disabled}
                aria-invalid={invalidField(
                  props.feedbackId,
                  entry.answer === 'missing' && blank(entry.note),
                )}
                aria-describedby={props.feedbackId}
                onChange={(event) => edit({ note: event.target.value })}
              />
            </div>
          </fieldset>
        );
      })}
      <TextArea
        {...props}
        field="conclusion"
        label="dossierConclusion"
        limit={DECISION_LIMITS.conclusion}
      />
      <ActingFieldset
        idPrefix={`${props.idPrefix}-reviewer`}
        legend="dossierReviewerLegend"
        draft={draft.reviewedBy}
        documents={props.documents}
        disabled={props.disabled}
        feedbackId={props.feedbackId}
        onChange={(reviewedBy) => onChange({ ...draft, reviewedBy })}
      />
      <ActingFieldset
        idPrefix={`${props.idPrefix}-approver`}
        legend="dossierApproverLegend"
        draft={draft.approvedBy}
        documents={props.documents}
        disabled={props.disabled}
        feedbackId={props.feedbackId}
        onChange={(approvedBy) => onChange({ ...draft, approvedBy })}
      />
      <Attestation
        {...props}
        label="dossierAttestation"
        checked={draft.independenceAttested}
        onAttest={(independenceAttested) =>
          onChange({ ...draft, independenceAttested })
        }
      />
      {props.correcting && (
        <TextArea
          {...props}
          field="reason"
          label="correctionReason"
          limit={CERTIFICATION_LIMITS.reason}
        />
      )}
    </FormFrame>
  );
}

/**
 * The decision: an explicit outcome, the texts a grant fixes, the decision
 * maker, date and optional signed form, the rationale and the explicit
 * attestation that the decision maker is not on the audit team. A
 * correction starts from the latest values, shows the recorded outcome
 * without changing it and states its reason.
 */
export function CertificationDecisionForm(
  props: FormBase<CertificationDecisionDraft> & {
    /** The register's attachments with the decision-form role. */
    forms: readonly CertificationAttachment[];
    today: string;
    /** The recorded outcome when this form corrects the decision. */
    correcting: CertificationOutcome | null;
  },
) {
  const { draft, onChange, correcting } = props;
  const copy = useCertificationCopy();
  const reference = useAttachmentReference();
  const formId = `${props.idPrefix}-form`;
  const outcome = correcting ?? draft.decision;
  return (
    <FormFrame
      {...props}
      title={
        correcting === null
          ? 'recordCertificationDecision'
          : 'correctDecisionTexts'
      }
      help={
        correcting === null
          ? 'certificationDecisionHelp'
          : 'decisionCorrectionHelp'
      }
      submit={
        correcting === null ? 'certificationDecisionSubmit' : 'saveCorrection'
      }
    >
      {correcting === null ? (
        <Choice
          {...props}
          name="decision"
          legend="decisionOutcome"
          value={draft.decision}
          options={(['granted', 'refused'] as const).map((choice) => ({
            value: choice,
            label: outcomeLabel(choice),
          }))}
          onChoose={(decision) => onChange({ ...draft, decision })}
        />
      ) : (
        <p className="certification-note">
          {formatMessage(copy('decisionOutcomeFixed'), {
            outcome: copy(outcomeLabel(correcting)),
          })}
        </p>
      )}
      {outcome === 'granted' && (
        <TextsFields
          {...props}
          legend="grantedTexts"
          texts={draft.grantedTexts}
          onTexts={(grantedTexts) => onChange({ ...draft, grantedTexts })}
        />
      )}
      <DateField
        {...props}
        field="decidedOn"
        label="decidedOn"
        max={props.today}
      />
      <TextInput
        {...props}
        field="decidedBy"
        label="decidedBy"
        limit={DECISION_LIMITS.person}
        required
      />
      <TextInput
        {...props}
        field="decidedByFunction"
        label="decidedByFunction"
        limit={DECISION_LIMITS.person}
      />
      {props.forms.length > 0 && (
        <>
          <label htmlFor={formId}>{copy('decisionForm')}</label>
          <Select
            id={formId}
            value={draft.decisionFormAttachmentId}
            placeholder={copy('decisionFormNone')}
            disabled={props.disabled}
            describedBy={props.feedbackId}
            options={props.forms.map((attachment) => ({
              value: attachment.id,
              label: reference(attachment),
            }))}
            onValueChange={(decisionFormAttachmentId) =>
              onChange({ ...draft, decisionFormAttachmentId })
            }
          />
        </>
      )}
      <TextArea
        {...props}
        field="rationale"
        label="decisionRationale"
        limit={DECISION_LIMITS.rationale}
      />
      <TextArea
        {...props}
        field="additionalInformation"
        label="decisionAdditionalInformation"
        limit={DECISION_LIMITS.additionalInformation}
        optional
      />
      <Attestation
        {...props}
        label="decisionIndependenceAttestation"
        checked={draft.independenceAttested}
        onAttest={(independenceAttested) =>
          onChange({ ...draft, independenceAttested })
        }
      />
      {correcting !== null && (
        <TextArea
          {...props}
          field="reason"
          label="correctionReason"
          limit={CERTIFICATION_LIMITS.reason}
        />
      )}
    </FormFrame>
  );
}

/** The texts agreed with the client per language, the date and signed form. */
export function CertificateDataForm(
  props: FormBase<CertificateDataDraft> &
    Correcting & {
      /** The register's attachments with the Certificate-data role. */
      forms: readonly CertificationAttachment[];
    },
) {
  const { draft, onChange } = props;
  const copy = useCertificationCopy();
  const reference = useAttachmentReference();
  const formId = `${props.idPrefix}-form`;
  return (
    <FormFrame
      {...props}
      title={
        props.correcting ? 'correctCertificateData' : 'recordCertificateData'
      }
      help="certificateDataHelp"
      submit="certificateDataSubmit"
    >
      <TextsFields
        {...props}
        legend="certificateTextsAgreed"
        texts={draft.texts}
        onTexts={(texts) => onChange({ ...draft, texts })}
      />
      <DateField {...props} field="agreedOn" label="certificateDataAgreedOn" />
      <label htmlFor={formId}>{copy('certificateDataDocument')}</label>
      <Select
        id={formId}
        value={draft.agreementAttachmentId}
        placeholder={copy('selectCertificateDataDocument')}
        disabled={props.disabled}
        required
        invalid={invalidField(
          props.feedbackId,
          draft.agreementAttachmentId === '',
        )}
        describedBy={props.feedbackId}
        options={props.forms.map((attachment) => ({
          value: attachment.id,
          label: reference(attachment),
        }))}
        onValueChange={(agreementAttachmentId) =>
          onChange({ ...draft, agreementAttachmentId })
        }
      />
      {props.correcting && (
        <TextArea
          {...props}
          field="reason"
          label="correctionReason"
          limit={CERTIFICATION_LIMITS.reason}
        />
      )}
    </FormFrame>
  );
}

/**
 * The issued Certificate recorded once: its number, exact PDF, optional
 * signatory and the explicit attestation that the signatory is not on the
 * audit team. The server computes its validity.
 */
export function CertificateForm(
  props: FormBase<CertificateDraft> & {
    /** The register's attachments with the Certificate role. */
    pdfs: readonly CertificationAttachment[];
  },
) {
  const { draft, onChange } = props;
  const copy = useCertificationCopy();
  const reference = useAttachmentReference();
  const pdfId = `${props.idPrefix}-pdf`;
  return (
    <FormFrame
      {...props}
      title="recordCertificate"
      help="certificateHelp"
      submit="certificateSubmit"
    >
      <TextInput
        {...props}
        field="number"
        label="certificateNumber"
        limit={DECISION_LIMITS.number}
        required
      />
      <label htmlFor={pdfId}>{copy('certificatePdf')}</label>
      <Select
        id={pdfId}
        value={draft.attachmentId}
        placeholder={copy('selectCertificatePdf')}
        disabled={props.disabled}
        required
        invalid={invalidField(props.feedbackId, draft.attachmentId === '')}
        describedBy={props.feedbackId}
        options={props.pdfs.map((attachment) => ({
          value: attachment.id,
          label: reference(attachment),
        }))}
        onValueChange={(attachmentId) => onChange({ ...draft, attachmentId })}
      />
      <TextInput
        {...props}
        field="signedBy"
        label="certificateSignedBy"
        limit={DECISION_LIMITS.person}
      />
      <TextInput
        {...props}
        field="signedByFunction"
        label="certificateSignedByFunction"
        limit={DECISION_LIMITS.person}
      />
      <Attestation
        {...props}
        label="certificateIndependenceAttestation"
        checked={draft.independenceAttested}
        onAttest={(independenceAttested) =>
          onChange({ ...draft, independenceAttested })
        }
      />
    </FormFrame>
  );
}

/**
 * One to four Certificate texts, each a group with its language, holder,
 * address and scope; a language can be added up to four and removed down
 * to one.
 */
function TextsFields<Draft>(
  props: FormBase<Draft> & {
    legend: CertificationMessageKey;
    texts: readonly CertificateTextDraft[];
    onTexts: (texts: CertificateTextDraft[]) => void;
  },
) {
  const copy = useCertificationCopy();
  const { texts, onTexts } = props;
  const edit = (
    index: number,
    name: keyof CertificateTextDraft,
    value: string,
  ) =>
    onTexts(
      texts.map((text, position) =>
        position === index ? { ...text, [name]: value } : text,
      ),
    );
  return (
    <fieldset aria-describedby={props.feedbackId}>
      <legend>{copy(props.legend)}</legend>
      {texts.map((text, index) => {
        const position = index + 1;
        const id = (name: string) =>
          `${props.idPrefix}-text-${String(position)}-${name}`;
        // One text per language: a repeated language is the wrong one.
        const repeated = texts
          .slice(0, index)
          .some((other) => other.language.trim() === text.language.trim());
        const field = (
          name: 'language' | 'holderName' | 'address',
          label: CertificationMessageKey,
          limit: number,
          help?: string,
        ) => (
          <div className="certification-field">
            <label htmlFor={id(name)}>{copy(label)}</label>
            <input
              id={id(name)}
              value={text[name]}
              maxLength={limit}
              disabled={props.disabled}
              required
              aria-invalid={invalidField(
                props.feedbackId,
                blank(text[name]) || (name === 'language' && repeated),
              )}
              aria-describedby={
                [help, props.feedbackId].filter(Boolean).join(' ') || undefined
              }
              onChange={(event) => edit(index, name, event.target.value)}
            />
          </div>
        );
        return (
          <fieldset key={index}>
            <legend>
              {formatMessage(copy('certificateTextHeading'), { position })}
            </legend>
            {field(
              'language',
              'certificateLanguage',
              DECISION_LIMITS.language,
              id('language-help'),
            )}
            <small id={id('language-help')}>
              {copy('certificateLanguageHelp')}
            </small>
            {field(
              'holderName',
              'certificateHolderName',
              DECISION_LIMITS.holderName,
            )}
            {field('address', 'certificateAddress', DECISION_LIMITS.address)}
            <div className="certification-field">
              <label htmlFor={id('scope')}>{copy('certificateScope')}</label>
              <textarea
                id={id('scope')}
                value={text.scope}
                maxLength={DECISION_LIMITS.scope}
                disabled={props.disabled}
                required
                aria-invalid={invalidField(props.feedbackId, blank(text.scope))}
                aria-describedby={props.feedbackId}
                onChange={(event) => edit(index, 'scope', event.target.value)}
              />
            </div>
            {texts.length > 1 && (
              <button
                type="button"
                disabled={props.disabled}
                onClick={() =>
                  onTexts(texts.filter((_, other) => other !== index))
                }
              >
                {formatMessage(copy('removeCertificateText'), { position })}
              </button>
            )}
          </fieldset>
        );
      })}
      {texts.length < DECISION_LIMITS.texts && (
        <button
          type="button"
          disabled={props.disabled}
          onClick={() => onTexts([...texts, emptyCertificateText()])}
        >
          {copy('addCertificateLanguage')}
        </button>
      )}
    </fieldset>
  );
}

/** One explicit choice among labelled options; none is preselected. */
function Choice<Draft, Value extends string>(
  props: FormBase<Draft> & {
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

/** An explicit attestation, unchecked until the user checks it. */
function Attestation<Draft>(
  props: FormBase<Draft> & {
    label: CertificationMessageKey;
    checked: boolean;
    onAttest: (checked: boolean) => void;
  },
) {
  const copy = useCertificationCopy();
  return (
    <label className="certification-choice">
      <input
        type="checkbox"
        checked={props.checked}
        disabled={props.disabled}
        aria-invalid={invalidField(props.feedbackId, !props.checked)}
        aria-describedby={props.feedbackId}
        onChange={(event) => props.onAttest(event.target.checked)}
      />
      {copy(props.label)}
    </label>
  );
}

function TextArea<Field extends string, Draft extends Record<Field, string>>(
  props: FormBase<Draft> & {
    field: Field;
    label: CertificationMessageKey;
    limit: number;
    optional?: boolean;
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
        required={!props.optional}
        aria-invalid={invalidField(
          props.feedbackId,
          !props.optional && blank(props.draft[props.field]),
        )}
        aria-describedby={props.feedbackId}
        onChange={(event) =>
          props.onChange({ ...props.draft, [props.field]: event.target.value })
        }
      />
    </div>
  );
}

function TextInput<Field extends string, Draft extends Record<Field, string>>(
  props: FormBase<Draft> & {
    field: Field;
    label: CertificationMessageKey;
    limit: number;
    required?: boolean;
  },
) {
  const copy = useCertificationCopy();
  const id = `${props.idPrefix}-${props.field}`;
  return (
    <div className="certification-field">
      <label htmlFor={id}>{copy(props.label)}</label>
      <input
        id={id}
        value={props.draft[props.field]}
        maxLength={props.limit}
        disabled={props.disabled}
        required={props.required ?? false}
        aria-invalid={invalidField(
          props.feedbackId,
          (props.required ?? false) && blank(props.draft[props.field]),
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
  props: FormBase<Draft> & {
    field: Field;
    label: CertificationMessageKey;
    max?: string;
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
        max={props.max}
        disabled={props.disabled}
        required={!props.optional}
        aria-invalid={invalidField(
          props.feedbackId,
          wrongDate(props.draft[props.field], {
            required: !props.optional,
            max: props.max,
          }),
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
function FormFrame<Draft>(
  props: FormBase<Draft> & {
    title: CertificationMessageKey;
    help: CertificationMessageKey;
    submit: CertificationMessageKey;
    children: ReactNode;
  },
) {
  const copy = useCertificationCopy();
  return (
    <form
      className="certification-form"
      aria-label={copy(props.title)}
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
