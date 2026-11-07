import { useInterfaceLocale } from '../localization/interface-locale';
import { formatMessage } from '../localization/messages';
import {
  useAttachmentReference,
  type RegisterDownload,
} from './CertificationDocumentViews';
import { ActingRow, IndependenceRow } from './CertificationAttribution';
import {
  useCertificationCopy,
  type CertificationMessageKey,
} from './certification.copy';
import {
  DOSSIER_ITEMS,
  dossierComplete,
  missingItems,
  type Certificate,
  type CertificateData,
  type CertificateText,
  type CertificateTextDifference,
  type CertificateTextField,
  type CertificationDecision,
  type CertificationOutcome,
  type DecisionPrecondition,
  type DossierAnswerValue,
  type DossierItem,
  type DossierReview,
  type Recommendation,
  type RecommendationOutcome,
} from './certification-decision';
import type { DocumentRegister } from './certification-response';

export function recommendationLabel(
  outcome: RecommendationOutcome,
): CertificationMessageKey {
  switch (outcome) {
    case 'grant':
      return 'recommendationGrant';
    case 'do_not_grant':
      return 'recommendationDoNotGrant';
    case 'additional_audit':
      return 'recommendationAdditionalAudit';
  }
  return unexpected(outcome);
}

export function outcomeLabel(
  outcome: CertificationOutcome,
): CertificationMessageKey {
  return outcome === 'granted' ? 'decisionGranted' : 'decisionRefused';
}

export function dossierItemLabel(item: DossierItem): CertificationMessageKey {
  switch (item) {
    case 'application':
      return 'dossierItemApplication';
    case 'application_review':
      return 'dossierItemApplicationReview';
    case 'duration':
      return 'dossierItemDuration';
    case 'agreement':
      return 'dossierItemAgreement';
    case 'team_approval':
      return 'dossierItemTeamApproval';
    case 'stage_1_plan':
      return 'dossierItemStage1Plan';
    case 'stage_1_report':
      return 'dossierItemStage1Report';
    case 'stage_2_plan':
      return 'dossierItemStage2Plan';
    case 'stage_2_report':
      return 'dossierItemStage2Report';
    case 'participant_lists':
      return 'dossierItemParticipantLists';
    case 'findings_follow_up':
      return 'dossierItemFindingsFollowUp';
    case 'recommendation':
      return 'dossierItemRecommendation';
    case 'certificate_data':
      return 'dossierItemCertificateData';
  }
  return unexpected(item);
}

export function dossierAnswerLabel(
  answer: DossierAnswerValue,
): CertificationMessageKey {
  switch (answer) {
    case 'present':
      return 'dossierAnswerPresent';
    case 'missing':
      return 'dossierAnswerMissing';
    case 'not_applicable':
      return 'dossierAnswerNotApplicable';
  }
  return unexpected(answer);
}

export function preconditionLabel(
  code: DecisionPrecondition,
): CertificationMessageKey {
  switch (code) {
    case 'APPLICATION_NOT_ACCEPTED':
      return 'preconditionApplicationNotAccepted';
    case 'DURATION_MISSING':
      return 'preconditionDurationMissing';
    case 'AGREEMENT_MISSING':
      return 'preconditionAgreementMissing';
    case 'TEAM_NOT_APPROVED':
      return 'preconditionTeamNotApproved';
    case 'STAGE_1_NOT_READY':
      return 'preconditionStage1NotReady';
    case 'STAGE_2_NOT_REPORTED':
      return 'preconditionStage2NotReported';
    case 'FINDINGS_OPEN':
      return 'preconditionFindingsOpen';
    case 'FINDINGS_OVERDUE':
      return 'preconditionFindingsOverdue';
    case 'RECOMMENDATION_MISSING':
      return 'preconditionRecommendationMissing';
    case 'GRANT_AGAINST_RECOMMENDATION':
      return 'preconditionGrantAgainstRecommendation';
    case 'DOSSIER_REVIEW_INCOMPLETE':
      return 'preconditionDossierReviewIncomplete';
    case 'DECISION_IN_FUTURE':
      return 'preconditionDecisionInFuture';
  }
  return unexpected(code);
}

function textFieldLabel(field: CertificateTextField): CertificationMessageKey {
  switch (field) {
    case 'holderName':
      return 'certificateHolderName';
    case 'address':
      return 'certificateAddress';
    case 'scope':
      return 'certificateScope';
  }
  return unexpected(field);
}

/** The team leader's recommendation, its basis and its business date. */
export function RecommendationView({
  recommendation,
}: {
  recommendation: Recommendation;
}) {
  const copy = useCertificationCopy();
  const { formatDate } = useInterfaceLocale();
  return (
    <dl className="certification-facts">
      <div>
        <dt>{copy('recommendationOutcome')}</dt>
        <dd>{copy(recommendationLabel(recommendation.recommendation))}</dd>
      </div>
      <div>
        <dt>{copy('recommendationBasis')}</dt>
        <dd>{recommendation.basis}</dd>
      </div>
      <div>
        <dt>{copy('recommendedOn')}</dt>
        <dd>
          {recommendation.recommendedOn === null ? (
            copy('notProvided')
          ) : (
            <time dateTime={recommendation.recommendedOn}>
              {formatDate(recommendation.recommendedOn)}
            </time>
          )}
        </dd>
      </div>
    </dl>
  );
}

/**
 * Whether an item is missing, then every explicit answer with its note, the
 * conclusion, who reviewed and approved on behalf of the certification body
 * and the attestation of independence.
 */
export function DossierReviewView({
  review,
  register,
}: {
  review: DossierReview;
  register: DocumentRegister;
}) {
  const copy = useCertificationCopy();
  return (
    <dl className="certification-facts">
      <div>
        <dt>{copy('dossierReviewResult')}</dt>
        <dd>
          <span
            className={`certification-status certification-status-${dossierComplete(review) ? 'open' : 'rejected'}`}
          >
            {dossierComplete(review)
              ? copy('dossierComplete')
              : formatMessage(copy('dossierIncomplete'), {
                  count: missingItems(review),
                })}
          </span>
        </dd>
      </div>
      {DOSSIER_ITEMS.map((item) => {
        const answer = review.items[item];
        return (
          <div key={item}>
            <dt>{copy(dossierItemLabel(item))}</dt>
            <dd>
              {copy(dossierAnswerLabel(answer.answer))}
              {answer.note !== null && ` — ${answer.note}`}
            </dd>
          </div>
        );
      })}
      <div>
        <dt>{copy('dossierConclusion')}</dt>
        <dd>{review.conclusion}</dd>
      </div>
      <ActingRow
        label="dossierReviewerView"
        act={review.reviewedBy}
        register={register}
      />
      <ActingRow
        label="dossierApproverView"
        act={review.approvedBy}
        register={register}
      />
      <IndependenceRow attested={review.independenceAttested} />
    </dl>
  );
}

/** Each Certificate language with its holder, address and scope. */
export function CertificateTextsView({
  texts,
  label,
}: {
  texts: readonly CertificateText[];
  label: CertificationMessageKey;
}) {
  const copy = useCertificationCopy();
  return (
    <ul className="certification-texts" aria-label={copy(label)}>
      {texts.map((text) => (
        <li key={text.language}>
          <dl className="certification-facts">
            <div>
              <dt>{copy('certificateLanguage')}</dt>
              <dd>{text.language}</dd>
            </div>
            <div>
              <dt>{copy('certificateHolderName')}</dt>
              <dd>{text.holderName}</dd>
            </div>
            <div>
              <dt>{copy('certificateAddress')}</dt>
              <dd>{text.address}</dd>
            </div>
            <div>
              <dt>{copy('certificateScope')}</dt>
              <dd>{text.scope}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );
}

/** The exact attachment a record cites, named from the register. */
function useAttachmentName(register: DocumentRegister) {
  const reference = useAttachmentReference();
  return (attachmentId: string) => {
    // The read checks that the register holds every cited attachment.
    const attached = register.items.find((item) => item.id === attachmentId);
    return attached ? reference(attached) : attachmentId;
  };
}

/** The immutable decision, its maker and form, and the texts it grants. */
export function CertificationDecisionView({
  decision,
  register,
}: {
  decision: CertificationDecision;
  register: DocumentRegister;
}) {
  const copy = useCertificationCopy();
  const { formatDate } = useInterfaceLocale();
  const attachmentName = useAttachmentName(register);
  const optional = (value: string | null) => value ?? copy('notProvided');
  return (
    <>
      <dl className="certification-facts">
        <div>
          <dt>{copy('decisionOutcome')}</dt>
          <dd>
            <span
              className={`certification-status certification-status-${decision.decision === 'granted' ? 'open' : 'rejected'}`}
            >
              {copy(outcomeLabel(decision.decision))}
            </span>
          </dd>
        </div>
        <div>
          <dt>{copy('decidedOn')}</dt>
          <dd>
            <time dateTime={decision.decidedOn}>
              {formatDate(decision.decidedOn)}
            </time>
          </dd>
        </div>
        <div>
          <dt>{copy('decidedBy')}</dt>
          <dd>{decision.decidedBy}</dd>
        </div>
        <div>
          <dt>{copy('decidedByFunction')}</dt>
          <dd>{optional(decision.decidedByFunction)}</dd>
        </div>
        <div>
          <dt>{copy('decisionForm')}</dt>
          <dd>
            {decision.decisionFormAttachmentId === null
              ? copy('stageNoAttachment')
              : attachmentName(decision.decisionFormAttachmentId)}
          </dd>
        </div>
        <div>
          <dt>{copy('decisionRationale')}</dt>
          <dd>{decision.rationale}</dd>
        </div>
        <div>
          <dt>{copy('decisionAdditionalInformation')}</dt>
          <dd>{optional(decision.additionalInformation)}</dd>
        </div>
        <div>
          <dt>{copy('decisionIndependenceLabel')}</dt>
          <dd>{copy('decisionIndependenceAttested')}</dd>
        </div>
      </dl>
      {decision.decision === 'granted' && (
        <CertificateTextsView
          texts={decision.grantedTexts}
          label="grantedTexts"
        />
      )}
    </>
  );
}

/** The agreed texts, the date agreed and the signed form. */
export function CertificateDataView({
  data,
  register,
}: {
  data: CertificateData;
  register: DocumentRegister;
}) {
  const copy = useCertificationCopy();
  const { formatDate } = useInterfaceLocale();
  const attachmentName = useAttachmentName(register);
  return (
    <>
      <dl className="certification-facts">
        <div>
          <dt>{copy('certificateDataAgreedOn')}</dt>
          <dd>
            <time dateTime={data.agreedOn}>{formatDate(data.agreedOn)}</time>
          </dd>
        </div>
        <div>
          <dt>{copy('certificateDataDocument')}</dt>
          <dd>{attachmentName(data.agreementAttachmentId)}</dd>
        </div>
      </dl>
      <CertificateTextsView texts={data.texts} label="certificateTextsAgreed" />
    </>
  );
}

/**
 * The recorded Certificate: its number, exact PDF, signatory and texts,
 * and the validity dates exactly as the server computed them.
 */
export function CertificateView({
  certificate,
  register,
  download,
}: {
  certificate: Certificate;
  register: DocumentRegister;
  download?: RegisterDownload;
}) {
  const copy = useCertificationCopy();
  const { formatDate, formatDateTime } = useInterfaceLocale();
  const attachmentName = useAttachmentName(register);
  const optional = (value: string | null) => value ?? copy('notProvided');
  const date = (value: string) => (
    <time dateTime={value}>{formatDate(value)}</time>
  );
  const pdf = register.items.find(
    (item) => item.id === certificate.attachmentId,
  );
  return (
    <>
      <p className="certification-attribution">
        {copy('recordedBy')}: {certificate.recordedBy.displayName} ·{' '}
        {copy('recordedAt')}:{' '}
        <time dateTime={certificate.recordedAt}>
          {formatDateTime(certificate.recordedAt)}
        </time>
      </p>
      <dl className="certification-facts">
        <div>
          <dt>{copy('certificateNumber')}</dt>
          <dd>{certificate.number}</dd>
        </div>
        <div>
          <dt>{copy('certificatePdf')}</dt>
          <dd>{attachmentName(certificate.attachmentId)}</dd>
        </div>
        <div>
          <dt>{copy('certificateSignedBy')}</dt>
          <dd>{optional(certificate.signedBy)}</dd>
        </div>
        <div>
          <dt>{copy('certificateSignedByFunction')}</dt>
          <dd>{optional(certificate.signedByFunction)}</dd>
        </div>
        <div>
          <dt>{copy('certificateValidFrom')}</dt>
          <dd>{date(certificate.validFrom)}</dd>
        </div>
        <div>
          <dt>{copy('certificateValidUntil')}</dt>
          <dd>{date(certificate.validUntil)}</dd>
        </div>
        <div>
          <dt>{copy('certificateFirstSurveillanceBy')}</dt>
          <dd>{date(certificate.firstSurveillanceBy)}</dd>
        </div>
      </dl>
      <p className="certification-note">{copy('certificateValidityNote')}</p>
      {pdf && download && (
        <div className="certification-actions">
          <button
            type="button"
            disabled={download.disabled || download.pendingId !== undefined}
            onClick={() => download.onDownload(pdf)}
          >
            {formatMessage(copy('documentDownload'), {
              title: pdf.sourceTitle,
              version: pdf.versionNumber,
            })}
          </button>
        </div>
      )}
      <CertificateTextsView
        texts={certificate.texts}
        label="certificateTexts"
      />
    </>
  );
}

/** The unmet preconditions of a decision, each in plain language. */
export function PreconditionList({
  failures,
}: {
  failures: readonly DecisionPrecondition[];
}) {
  const copy = useCertificationCopy();
  return (
    <ul aria-label={copy('decisionPreconditionsList')}>
      {failures.map((code) => (
        <li key={code}>{copy(preconditionLabel(code))}</li>
      ))}
    </ul>
  );
}

/** How the agreed data differ from the granted texts, one line each. */
export function CertificateTextDifferences({
  differences,
}: {
  differences: readonly CertificateTextDifference[];
}) {
  const copy = useCertificationCopy();
  const line = (difference: CertificateTextDifference) => {
    switch (difference.kind) {
      case 'notAgreed':
        return formatMessage(copy('differenceNotAgreed'), {
          language: difference.language,
        });
      case 'notGranted':
        return formatMessage(copy('differenceNotGranted'), {
          language: difference.language,
        });
      case 'field':
        return formatMessage(copy('differenceField'), {
          language: difference.language,
          field: copy(textFieldLabel(difference.field)),
          granted: difference.granted,
          agreed: difference.agreed,
        });
    }
    return unexpected(difference);
  };
  return (
    <div className="certification-blocked">
      <p>{copy('certificateTextsDiffer')}</p>
      <ul aria-label={copy('certificateDifferencesList')}>
        {differences.map((difference) => (
          <li
            key={`${difference.kind}-${difference.language}-${difference.kind === 'field' ? difference.field : ''}`}
          >
            {line(difference)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function unexpected(value: never): never {
  throw new Error(`Unexpected Certification decision value: ${String(value)}`);
}
