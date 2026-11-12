import type { FormEvent } from 'react';
import { formatMessage } from '../localization/messages';
import { Select } from '../presentation/Select';
import { invalidField, wrongDate, wrongText } from './certification-fields';
import { useCertificationCopy } from './certification.copy';
import {
  alreadyAttached,
  type AgreementDraft,
  type AttachDraft,
} from './certification-documents-draft';
import {
  CERTIFICATION_DOCUMENT_ROLES,
  CERTIFICATION_LIMITS,
  sourceKey,
  type CertificationAttachment,
  type EligibleDocuments,
} from './certification-response';
import {
  documentRoleLabel,
  useAttachmentReference,
} from './CertificationDocumentViews';

/** The eligible-PDF read behind the attach form. */
export type EligibleView =
  | { status: 'loading' }
  | { status: 'ready'; value: EligibleDocuments }
  | { status: 'error' | 'denied' | 'unavailable' };

export type AttachFormProps = {
  idPrefix: string;
  eligible: EligibleView;
  register: readonly CertificationAttachment[];
  draft: AttachDraft;
  disabled: boolean;
  submitting: boolean;
  /** Saving waits for a reload of the outdated Case; the draft stays editable. */
  submitBlocked: boolean;
  feedbackId?: string;
  onChange: (draft: AttachDraft) => void;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
  onReloadEligible: () => void;
};

/**
 * One frozen received PDF of the Case's Client with its role and an optional
 * note. PDFs already in the register stay listed but cannot be chosen.
 */
export function AttachForm({
  idPrefix,
  eligible,
  register,
  draft,
  disabled,
  submitting,
  submitBlocked,
  feedbackId,
  onChange,
  onSubmit,
  onCancel,
  onReloadEligible,
}: AttachFormProps) {
  const copy = useCertificationCopy();
  const id = (name: string) => `${idPrefix}-${name}`;
  const invalid = (wrong: boolean) => invalidField(feedbackId, wrong);
  const items = eligible.status === 'ready' ? eligible.value.items : [];
  return (
    <form
      className="certification-form"
      aria-labelledby={id('title')}
      noValidate
      onSubmit={onSubmit}
    >
      <h6 id={id('title')}>{copy('attachTitle')}</h6>
      <p>{copy('attachHelp')}</p>
      {eligible.status === 'loading' && (
        <p role="status">{copy('eligibleLoading')}</p>
      )}
      {(eligible.status === 'error' || eligible.status === 'unavailable') && (
        <div role="alert">
          <p>{copy('eligibleUnavailable')}</p>
          <button type="button" disabled={disabled} onClick={onReloadEligible}>
            {copy('retry')}
          </button>
        </div>
      )}
      {eligible.status === 'denied' && (
        <p role="alert">{copy('documentsDenied')}</p>
      )}
      {eligible.status === 'ready' && items.length === 0 && (
        <p className="certification-note">{copy('eligibleEmpty')}</p>
      )}
      {eligible.status === 'ready' && eligible.value.truncated && (
        <p className="certification-note">{copy('eligibleTruncated')}</p>
      )}
      <label htmlFor={id('source')}>{copy('eligibleDocument')}</label>
      <Select
        id={id('source')}
        value={draft.source}
        placeholder={copy('selectEligibleDocument')}
        disabled={disabled || items.length === 0}
        required
        invalid={invalid(
          !items.some(
            (item) =>
              sourceKey(item) === draft.source &&
              !alreadyAttached(item, register),
          ),
        )}
        describedBy={feedbackId}
        options={items.map((item) => {
          const attached = alreadyAttached(item, register);
          return {
            value: sourceKey(item),
            label: formatMessage(
              copy(attached ? 'eligibleAttached' : 'documentVersionOf'),
              { title: item.sourceTitle, version: item.versionNumber },
            ),
            disabled: attached,
          };
        })}
        onValueChange={(source) => onChange({ ...draft, source })}
      />
      <label htmlFor={id('role')}>{copy('documentRole')}</label>
      <Select
        id={id('role')}
        value={draft.role ?? ''}
        placeholder={copy('selectDocumentRole')}
        disabled={disabled}
        required
        invalid={invalid(draft.role === null)}
        describedBy={feedbackId}
        options={CERTIFICATION_DOCUMENT_ROLES.map((role) => ({
          value: role,
          label: copy(documentRoleLabel(role)),
        }))}
        onValueChange={(value) =>
          onChange({
            ...draft,
            role:
              CERTIFICATION_DOCUMENT_ROLES.find((role) => role === value) ??
              null,
          })
        }
      />
      <div className="certification-field">
        <label htmlFor={id('note')}>{copy('note')}</label>
        <textarea
          id={id('note')}
          value={draft.note}
          maxLength={CERTIFICATION_LIMITS.attachmentNote}
          disabled={disabled}
          aria-invalid={invalid(
            wrongText(draft.note, CERTIFICATION_LIMITS.attachmentNote, false),
          )}
          aria-describedby={[id('note-hint'), feedbackId]
            .filter(Boolean)
            .join(' ')}
          onChange={(event) => onChange({ ...draft, note: event.target.value })}
        />
        <small id={id('note-hint')}>{copy('optional')}</small>
      </div>
      <div className="certification-actions">
        <button
          type="submit"
          className="certification-primary"
          disabled={disabled || submitBlocked || items.length === 0}
        >
          {submitting ? copy('saving') : copy('attachSubmit')}
        </button>
        <button type="button" disabled={submitting} onClick={onCancel}>
          {copy('cancel')}
        </button>
      </div>
    </form>
  );
}

export type AgreementFormProps = {
  idPrefix: string;
  draft: AgreementDraft;
  /** The register's attachments with the agreement role. */
  attachments: readonly CertificationAttachment[];
  /** An agreement is recorded: saving records a corrected version. */
  correcting: boolean;
  /** The latest signature date the server accepts, `YYYY-MM-DD`. */
  today: string;
  disabled: boolean;
  submitting: boolean;
  submitBlocked: boolean;
  feedbackId?: string;
  onChange: (draft: AgreementDraft) => void;
  onSubmit: (event: FormEvent) => void;
  onCancel?: () => void;
};

/** The signature date and the attached signed original, with a reason to correct. */
export function AgreementForm({
  idPrefix,
  draft,
  attachments,
  correcting,
  today,
  disabled,
  submitting,
  submitBlocked,
  feedbackId,
  onChange,
  onSubmit,
  onCancel,
}: AgreementFormProps) {
  const copy = useCertificationCopy();
  const reference = useAttachmentReference();
  const id = (name: string) => `${idPrefix}-${name}`;
  const invalid = (wrong: boolean) => invalidField(feedbackId, wrong);
  const describedBy = [id('help'), feedbackId].filter(Boolean).join(' ');
  return (
    <form
      className="certification-form"
      aria-label={copy(correcting ? 'correctAgreement' : 'recordAgreement')}
      noValidate
      onSubmit={onSubmit}
    >
      {correcting && <p>{copy('correctionHelp')}</p>}
      <p id={id('help')}>{copy('agreementHelp')}</p>
      <div className="certification-field">
        <label htmlFor={id('signed-on')}>{copy('agreementSignedOn')}</label>
        <input
          id={id('signed-on')}
          type="date"
          value={draft.signedOn}
          max={today}
          disabled={disabled}
          required
          aria-invalid={invalid(
            wrongDate(draft.signedOn, { required: true, max: today }),
          )}
          aria-describedby={describedBy}
          onChange={(event) =>
            onChange({ ...draft, signedOn: event.target.value })
          }
        />
      </div>
      <label htmlFor={id('document')}>{copy('agreementDocument')}</label>
      <Select
        id={id('document')}
        value={draft.attachmentId}
        placeholder={copy('selectAgreementDocument')}
        disabled={disabled}
        required
        invalid={invalid(
          !attachments.some(
            (attachment) => attachment.id === draft.attachmentId,
          ),
        )}
        describedBy={describedBy}
        options={attachments.map((attachment) => ({
          value: attachment.id,
          label: reference(attachment),
        }))}
        onValueChange={(attachmentId) => onChange({ ...draft, attachmentId })}
      />
      {correcting && (
        <>
          <label htmlFor={id('reason')}>{copy('correctionReason')}</label>
          <textarea
            id={id('reason')}
            value={draft.reason}
            maxLength={CERTIFICATION_LIMITS.reason}
            disabled={disabled}
            required
            aria-invalid={invalid(
              wrongText(draft.reason, CERTIFICATION_LIMITS.reason),
            )}
            aria-describedby={feedbackId}
            onChange={(event) =>
              onChange({ ...draft, reason: event.target.value })
            }
          />
        </>
      )}
      <div className="certification-actions">
        <button
          type="submit"
          className="certification-primary"
          disabled={disabled || submitBlocked}
        >
          {submitting
            ? copy('saving')
            : copy(correcting ? 'saveCorrection' : 'recordAgreement')}
        </button>
        {onCancel && (
          <button type="button" disabled={submitting} onClick={onCancel}>
            {copy('cancel')}
          </button>
        )}
      </div>
    </form>
  );
}
