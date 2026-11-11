import { useInterfaceLocale } from '../localization/interface-locale';
import { formatMessage } from '../localization/messages';
import { Select } from '../presentation/Select';
import {
  useCertificationCopy,
  type CertificationMessageKey,
} from './certification.copy';
import {
  ATTRIBUTION_LIMITS,
  latestBusinessDate,
  type ActAttribution,
  type ActingDraft,
} from './certification-attribution';
import { blank, invalidField, wrongDate } from './certification-fields';
import { useAttachmentReference } from './CertificationDocumentViews';
import type {
  CertificationActorReference,
  CertificationAttachment,
  DocumentRegister,
} from './certification-response';

/** A recorded version of a step or of a Finding, as attributed by the server. */
export type AttributedVersion = {
  version: number;
  reason: string | null;
  recordedBy: CertificationActorReference;
  recordedAt: string;
};

/** Who recorded a version, when, and why when it corrects an earlier one. */
export function VersionAttribution({
  version,
}: {
  version: AttributedVersion;
}) {
  const copy = useCertificationCopy();
  const { formatDateTime } = useInterfaceLocale();
  return (
    <p className="certification-attribution">
      {formatMessage(copy('version'), { version: version.version })} ·{' '}
      {copy('recordedBy')}: {version.recordedBy.displayName} ·{' '}
      {copy('recordedAt')}:{' '}
      <time dateTime={version.recordedAt}>
        {formatDateTime(version.recordedAt)}
      </time>
      {version.reason !== null && (
        <>
          <br />
          {copy('correctionReason')}: {version.reason}
        </>
      )}
    </p>
  );
}

/**
 * An act of the certification body recorded on its behalf: unchecked, the
 * member records the act as their own; checked, the person who acted, their
 * function, the date of the act and, optionally, the signed form chosen
 * from the Case's documents. The member stays attributed on the version.
 */
export function ActingFieldset({
  idPrefix,
  legend,
  draft,
  documents,
  disabled,
  feedbackId,
  onChange,
}: {
  idPrefix: string;
  legend: CertificationMessageKey;
  draft: ActingDraft;
  /** The Case's attachments the signed form may be chosen from. */
  documents: readonly CertificationAttachment[];
  disabled: boolean;
  feedbackId?: string;
  onChange: (draft: ActingDraft) => void;
}) {
  const copy = useCertificationCopy();
  const reference = useAttachmentReference();
  const id = (name: string) => `${idPrefix}-${name}`;
  const latest = latestBusinessDate();
  const text = (
    field: 'actedBy' | 'actedByFunction',
    label: CertificationMessageKey,
  ) => (
    <div className="certification-field">
      <label htmlFor={id(field)}>{copy(label)}</label>
      <input
        id={id(field)}
        value={draft[field]}
        maxLength={ATTRIBUTION_LIMITS.person}
        disabled={disabled}
        required
        aria-invalid={invalidField(feedbackId, blank(draft[field]))}
        aria-describedby={feedbackId}
        onChange={(event) =>
          onChange({ ...draft, [field]: event.target.value })
        }
      />
    </div>
  );
  return (
    <fieldset
      className="certification-acting"
      aria-describedby={
        [id('help'), feedbackId].filter(Boolean).join(' ') || undefined
      }
    >
      <legend>{copy(legend)}</legend>
      <label className="certification-choice">
        <input
          type="checkbox"
          checked={draft.onBehalf}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...draft, onBehalf: event.target.checked })
          }
        />
        {copy('actingOnBehalf')}
      </label>
      <small id={id('help')}>{copy('actingHelp')}</small>
      {draft.onBehalf && (
        <>
          {text('actedBy', 'actingName')}
          {text('actedByFunction', 'actingFunction')}
          <div className="certification-field">
            <label htmlFor={id('actedOn')}>{copy('actingDate')}</label>
            <input
              id={id('actedOn')}
              type="date"
              value={draft.actedOn}
              max={latest}
              disabled={disabled}
              required
              aria-invalid={invalidField(
                feedbackId,
                wrongDate(draft.actedOn, { required: true, max: latest }),
              )}
              aria-describedby={feedbackId}
              onChange={(event) =>
                onChange({ ...draft, actedOn: event.target.value })
              }
            />
          </div>
          {documents.length > 0 && (
            <>
              <label htmlFor={id('form')}>{copy('actingForm')}</label>
              <Select
                id={id('form')}
                value={draft.formAttachmentId}
                placeholder={copy('actingFormNone')}
                disabled={disabled}
                describedBy={feedbackId}
                options={documents.map((attachment) => ({
                  value: attachment.id,
                  label: reference(attachment),
                }))}
                onValueChange={(formAttachmentId) =>
                  onChange({ ...draft, formAttachmentId })
                }
              />
            </>
          )}
        </>
      )}
    </fieldset>
  );
}

/**
 * One definition row naming who acted on behalf of the certification body,
 * their function, the date of the act and the signed form; nothing when the
 * recording member acted in their own name.
 */
export function ActingRow({
  label,
  act,
  register,
}: {
  label: CertificationMessageKey;
  act: ActAttribution | null;
  register: DocumentRegister;
}) {
  const copy = useCertificationCopy();
  const { formatDate } = useInterfaceLocale();
  const reference = useAttachmentReference();
  if (act === null) return null;
  const form =
    act.formAttachmentId === null
      ? undefined
      : register.items.find((item) => item.id === act.formAttachmentId);
  return (
    <div>
      <dt>{copy(label)}</dt>
      <dd>
        {act.actedBy} — {act.actedByFunction} ·{' '}
        <time dateTime={act.actedOn}>{formatDate(act.actedOn)}</time>
        {act.formAttachmentId !== null && (
          <>
            {' '}
            · {copy('actingForm')}:{' '}
            {form ? reference(form) : act.formAttachmentId}
          </>
        )}
      </dd>
    </div>
  );
}

/** Whether the recording member attested independence from the audit team. */
export function IndependenceRow({ attested }: { attested: boolean }) {
  const copy = useCertificationCopy();
  return (
    <div>
      <dt>{copy('independenceLabel')}</dt>
      <dd>
        {copy(attested ? 'independenceAttested' : 'independenceUnattested')}
      </dd>
    </div>
  );
}
