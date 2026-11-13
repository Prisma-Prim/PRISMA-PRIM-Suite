import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { Select } from '../presentation/Select';
import { formatMessage } from '../localization/messages';
import { useInterfaceLocale } from '../localization/interface-locale';
import {
  actingFromDraft,
  emptyActingDraft,
  latestBusinessDate,
} from './certification-attribution';
import {
  ActingFieldset,
  ActingRow,
  IndependenceRow,
} from './CertificationAttribution';
import {
  useAttachmentReference,
  type RegisterDownload,
} from './CertificationDocumentViews';
import { CertificateTextsView } from './CertificationDecisionViews';
import { sameCertificateTexts } from './certification-decision';
import {
  isCalendarDate,
  type CaseDetail,
  type DocumentRegister,
} from './certification-response';
import type { ReleaseCommand } from './certification-release';
import type { ExchangeVersion } from './certification-exchanges';
import { useExchangeCopy } from './certification-exchanges.copy';
import { useCertificationCopy } from './certification.copy';
import { useReleaseCopy } from './certification-release.copy';
import { useRevisionCopy } from './certification-revisions.copy';

interface RevisionDraft {
  attachmentId: string;
  revisedOn: string;
  reason: string;
  revisionMarked: boolean | null;
  independenceAttested: boolean;
  onBehalf: ReturnType<typeof emptyActingDraft>;
  context: {
    decisionVersionId: string;
    certificateDataVersionId: string;
    revisionIndex: number;
  } | null;
}
const emptyRevision = (): RevisionDraft => ({
  attachmentId: '',
  revisedOn: '',
  reason: '',
  revisionMarked: null,
  independenceAttested: false,
  onBehalf: emptyActingDraft(),
  context: null,
});
export function useCertificateRevisionForm() {
  const [draft, setDraft] = useState(emptyRevision);
  const [error, setError] = useState<
    'incomplete' | 'markRequired' | 'attestationRequired' | null
  >(null);
  return {
    draft,
    setDraft,
    error,
    setError,
    reset() {
      setDraft(emptyRevision());
      setError(null);
    },
  };
}

export function CertificateRevisions(props: {
  current: CaseDetail;
  register: DocumentRegister;
  approve: boolean;
  manage: boolean;
  disabled: boolean;
  blocked: boolean;
  feedback: ReactNode;
  form: ReturnType<typeof useCertificateRevisionForm>;
  onCommand: (
    command: Extract<ReleaseCommand, { kind: 'certificateRevision' }>,
  ) => void;
  download?: RegisterDownload;
}) {
  const { current, form } = props;
  const t = useRevisionCopy();
  const releaseCopy = useReleaseCopy();
  const copy = useCertificationCopy();
  const ex = useExchangeCopy();
  const { formatDate, formatDateTime } = useInterfaceLocale();
  const reference = useAttachmentReference();
  const prefix = useId();
  const certificate = current.certificate;
  const { draft } = form;
  const changed =
    draft.context !== null &&
    (draft.context.decisionVersionId !== current.decision?.id ||
      draft.context.certificateDataVersionId !== current.certificateData?.id ||
      draft.context.revisionIndex !== current.release.currentRevisionIndex);
  const matches =
    current.decision?.value.decision === 'granted' &&
    current.certificateData !== null &&
    sameCertificateTexts(
      current.decision.value.grantedTexts,
      current.certificateData.value.texts,
    );
  const update = (next: typeof draft) => {
    if (
      !current.decision ||
      !current.certificateData ||
      current.release.currentRevisionIndex === null
    )
      return;
    form.setDraft({
      ...next,
      context: next.context ?? {
        decisionVersionId: current.decision.id,
        certificateDataVersionId: current.certificateData.id,
        revisionIndex: current.release.currentRevisionIndex,
      },
    });
    form.setError(null);
  };
  const id = (name: string) => `${prefix}-${name}`;
  if (!certificate) return null;
  const usedIds = [
    certificate.attachmentId,
    ...current.release.revisions.map((revision) => revision.attachmentId),
  ];
  const usedVersions = new Set(
    props.register.items
      .filter((entry) => usedIds.includes(entry.id))
      .map((entry) => entry.versionId),
  );
  const eligible = props.register.items.filter(
    (entry) =>
      entry.role === 'certificate' && !usedVersions.has(entry.versionId),
  );
  const state = (index: number) =>
    t(
      index === current.release.currentRevisionIndex ? 'current' : 'superseded',
    );
  function exactPdf(attachmentId: string, index: number) {
    const attached = props.register.items.find(
      (entry) => entry.id === attachmentId,
    );
    return attached ? (
      <>
        <p>{reference(attached)}</p>
        {props.download && (
          <button
            type="button"
            disabled={
              props.download.disabled || props.download.pendingId !== undefined
            }
            onClick={() => props.download?.onDownload(attached)}
          >
            {formatMessage(t('open'), { index })}
          </button>
        )}
      </>
    ) : null;
  }
  const date = (value: string) => (
    <time dateTime={value}>{formatDate(value)}</time>
  );
  function sending(exchange: ExchangeVersion | null) {
    if (!exchange) return <p>{t('pending')}</p>;
    const channel =
      exchange.channel === 'email'
        ? 'channelEmail'
        : exchange.channel === 'courier'
          ? 'channelCourier'
          : exchange.channel === 'platform'
            ? 'channelPlatform'
            : exchange.channel === 'hand_delivery'
              ? 'channelHandDelivery'
              : 'channelOther';
    return (
      <p>
        {formatMessage(ex('recordHeading'), {
          sequence: exchange.sequence,
          direction: ex('directionSent'),
          kind: ex('kindCertificate'),
        })}{' '}
        · {date(exchange.businessDate)} · {exchange.recordedBy.displayName} ·{' '}
        {ex(channel)}
        {exchange.reference ? ` · ${exchange.reference}` : ''}
      </p>
    );
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (
      props.disabled ||
      props.blocked ||
      changed ||
      !props.approve ||
      !matches
    )
      return;
    if (draft.revisionMarked === null) return form.setError('markRequired');
    const onBehalf = actingFromDraft(draft.onBehalf, props.register.items);
    if (
      !isCalendarDate(draft.revisedOn) ||
      !draft.reason.trim() ||
      draft.reason.trim().length > 2000 ||
      !eligible.some((entry) => entry.id === draft.attachmentId) ||
      onBehalf === undefined
    )
      return form.setError('incomplete');
    if (!draft.independenceAttested)
      return form.setError('attestationRequired');
    props.onCommand({
      kind: 'certificateRevision',
      path: 'certificate-revisions',
      value: {
        reason: draft.reason.trim(),
        revisedOn: draft.revisedOn,
        attachmentId: draft.attachmentId,
        revisionMarked: draft.revisionMarked,
        independenceAttested: true,
        onBehalf,
      },
    });
  }
  return (
    <section aria-labelledby={id('title')} className="certification-revisions">
      <h6 id={id('title')}>{t('title')}</h6>
      {current.release.revisionRequired && (
        <p role="status" className="certification-blocked">
          {t('required')}
        </p>
      )}
      <p className="certification-note">{t('fixed')}</p>
      <ol aria-label={t('history')} className="certification-release-steps">
        <li>
          <h6>{formatMessage(t('original'), { state: state(0) })}</h6>
          <p>
            {certificate.number} ·{' '}
            {certificate.issuedOn
              ? date(certificate.issuedOn)
              : releaseCopy('legacy')}{' '}
            · {certificate.recordedBy.displayName}
          </p>
          {exactPdf(certificate.attachmentId, 0)}
          {sending(current.release.transmission)}
        </li>
        {current.release.revisions.map((revision) => (
          <li key={revision.id}>
            <h6>
              {formatMessage(t('revision'), {
                index: revision.index,
                state: state(revision.index),
              })}
            </h6>
            <p>
              {date(revision.revisedOn)} · {revision.recordedBy.displayName} ·{' '}
              {formatDateTime(revision.recordedAt)}
            </p>
            <p>{revision.reason}</p>
            <dl className="certification-definitions">
              <ActingRow
                label="revisionOnBehalf"
                act={revision.onBehalf}
                register={props.register}
              />
              <IndependenceRow attested={revision.independenceAttested} />
            </dl>
            {!revision.revisionMarked && (
              <p className="certification-blocked">{t('unmarked')}</p>
            )}
            {exactPdf(revision.attachmentId, revision.index)}
            <CertificateTextsView
              texts={revision.texts}
              label="certificateTexts"
            />
            {sending(revision.transmission)}
            {props.manage && !revision.transmission && <p>{t('sendHint')}</p>}
          </li>
        ))}
      </ol>
      {props.approve && current.status === 'certified' && (
        <form
          className="certification-form"
          aria-label={t('form')}
          onSubmit={submit}
          noValidate
        >
          <h6>{t('form')}</h6>
          {!matches && (
            <p className="certification-blocked">{t('textsDiffer')}</p>
          )}
          {changed && (
            <div role="alert">
              <p>{t('contextChanged')}</p>
              <button
                type="button"
                disabled={props.disabled}
                onClick={() => form.reset()}
              >
                {t('restart')}
              </button>
            </div>
          )}
          <div className="certification-field">
            <label htmlFor={id('pdf')}>{t('pdf')}</label>
            <Select
              id={id('pdf')}
              value={draft.attachmentId}
              placeholder={copy('selectCertificatePdf')}
              disabled={props.disabled}
              options={eligible.map((entry) => ({
                value: entry.id,
                label: reference(entry),
              }))}
              onValueChange={(attachmentId) =>
                update({ ...draft, attachmentId })
              }
            />
          </div>
          <div className="certification-field">
            <label htmlFor={id('date')}>{t('date')}</label>
            <input
              id={id('date')}
              type="date"
              max={latestBusinessDate()}
              value={draft.revisedOn}
              disabled={props.disabled}
              onChange={(event) =>
                update({ ...draft, revisedOn: event.target.value })
              }
            />
          </div>
          <div className="certification-field">
            <label htmlFor={id('reason')}>{t('reason')}</label>
            <textarea
              id={id('reason')}
              value={draft.reason}
              maxLength={2000}
              disabled={props.disabled}
              onChange={(event) =>
                update({ ...draft, reason: event.target.value })
              }
            />
          </div>
          <fieldset>
            <legend>{t('mark')}</legend>
            {[
              { value: true, label: t('yes') },
              { value: false, label: t('no') },
            ].map((option) => (
              <label
                className="certification-choice"
                key={String(option.value)}
              >
                <input
                  type="radio"
                  name={id('mark')}
                  checked={draft.revisionMarked === option.value}
                  disabled={props.disabled}
                  onChange={() =>
                    update({ ...draft, revisionMarked: option.value })
                  }
                />
                {option.label}
              </label>
            ))}
          </fieldset>
          <label className="certification-choice">
            <input
              type="checkbox"
              checked={draft.independenceAttested}
              disabled={props.disabled}
              onChange={(event) =>
                update({ ...draft, independenceAttested: event.target.checked })
              }
            />
            {t('attestation')}
          </label>
          <ActingFieldset
            idPrefix={id('acting')}
            legend="revisionOnBehalf"
            documents={props.register.items}
            draft={draft.onBehalf}
            disabled={props.disabled}
            onChange={(onBehalf) => update({ ...draft, onBehalf })}
          />
          {form.error && <p role="alert">{t(form.error)}</p>}
          {props.feedback}
          <button
            type="submit"
            disabled={props.disabled || props.blocked || changed || !matches}
          >
            {t('submit')}
          </button>
        </form>
      )}
    </section>
  );
}
