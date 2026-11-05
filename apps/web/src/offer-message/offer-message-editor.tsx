import { useId, useRef } from 'react';
import type {
  OfferMessageObservation,
  OfferMessageTarget,
} from './offer-message-contract';
import {
  validOfferMessageBody,
  validOfferMessageFields,
  validOfferMessageRecipient,
  validOfferMessageSubject,
  type OfferMessageField,
  type OfferMessageFields,
} from './offer-message-grammar';
import { useOfferMessageCopy } from './offer-message.copy';

export type SourceObservation =
  | { kind: 'loading' | 'failed' }
  | { kind: 'ready'; value: OfferMessageObservation };
export type CopyStatus =
  | { kind: 'idle' }
  | {
      kind: 'pending' | 'accepted' | 'failed' | 'unconfirmed';
      field: OfferMessageField;
    };
export type PdfStatus = 'idle' | 'pending' | 'offered' | 'failed';

type Props = {
  fields: OfferMessageFields;
  source: SourceObservation;
  target: OfferMessageTarget;
  actorDisplayName: string;
  reviewed: boolean;
  copyStatus: CopyStatus;
  pdfStatus: PdfStatus;
  isCurrent: () => boolean;
  onClose: () => void;
  onEdit: (field: OfferMessageField, value: string) => void;
  onReview: () => void;
  onCopy: (field: OfferMessageField) => void;
  onDownloadPdf: () => void;
  onStopWaiting: () => void;
  onRetrySource: () => void;
};

export function OfferMessageEditor({
  fields,
  source,
  target,
  actorDisplayName,
  reviewed,
  copyStatus,
  pdfStatus,
  isCurrent,
  onClose,
  onEdit,
  onReview,
  onCopy,
  onDownloadPdf,
  onStopWaiting,
  onRetrySource,
}: Props) {
  const copy = useOfferMessageCopy();
  const id = useId();
  const nodes = useRef<Partial<Record<OfferMessageField, HTMLTextAreaElement>>>(
    {},
  );
  const valid = validOfferMessageFields(fields);
  const verified = source.kind === 'ready';
  const busyCopy = copyStatus.kind === 'pending';
  const fieldRows = [
    {
      field: 'recipient',
      label: 'recipient',
      help: 'recipientHelp',
      select: 'selectRecipient',
      valid: validOfferMessageRecipient(fields.recipient),
      rows: 1,
    },
    {
      field: 'subject',
      label: 'subject',
      help: 'subjectHelp',
      select: 'selectSubject',
      valid: validOfferMessageSubject(fields.subject),
      rows: 1,
    },
    {
      field: 'body',
      label: 'body',
      help: 'bodyHelp',
      select: 'selectBody',
      valid: validOfferMessageBody(fields.body),
      rows: 8,
    },
  ] satisfies {
    field: OfferMessageField;
    label: 'recipient' | 'subject' | 'body';
    help: 'recipientHelp' | 'subjectHelp' | 'bodyHelp';
    select: 'selectRecipient' | 'selectSubject' | 'selectBody';
    valid: boolean;
    rows: number;
  }[];
  return (
    <section
      className="offer-message-preparation"
      aria-labelledby={`${id}-title`}
    >
      <div className="offer-message-heading">
        <h4 id={`${id}-title`}>{copy('title')}</h4>
        <button type="button" onClick={onClose}>
          {copy('close')}
        </button>
      </div>
      <p>{copy('notice')}</p>
      <div className="offer-message-source" aria-label={copy('source')}>
        <strong>
          {copy('source')}: {target.reference} · v{target.versionNumber}
        </strong>
        <span>
          {copy(
            target.provenance === 'COMPANY_MODEL_ESTIMATE'
              ? 'model'
              : 'illustrative',
          )}
        </span>
        <code>
          {target.rootId} / {target.versionId}
        </code>
        <code>SHA-256: {target.sourceHtmlSha256}</code>
        {source.kind === 'ready' && (
          <>
            <span>
              {copy('party')}: {source.value.party.legalName}
            </span>
            {source.value.party.taxId !== null && (
              <span>{source.value.party.taxId}</span>
            )}
            {source.value.party.legalAddress !== null && (
              <span>{source.value.party.legalAddress}</span>
            )}
            <span>
              {copy('actor')}: {actorDisplayName}
            </span>
          </>
        )}
      </div>
      {source.kind === 'loading' && <p role="status">{copy('loading')}</p>}
      {source.kind === 'failed' && (
        <div role="alert">
          <p>{copy('sourceError')}</p>
          <button type="button" onClick={onRetrySource}>
            {copy('retrySource')}
          </button>
        </div>
      )}
      {fieldRows.map((row) => (
        <div className="offer-message-field" key={row.field}>
          <label htmlFor={`${id}-${row.field}`}>{copy(row.label)}</label>
          <textarea
            id={`${id}-${row.field}`}
            ref={(node) => {
              if (node) nodes.current[row.field] = node;
              else delete nodes.current[row.field];
            }}
            rows={row.rows}
            value={fields[row.field]}
            onChange={(event) => onEdit(row.field, event.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            aria-describedby={`${id}-${row.field}-help`}
            aria-invalid={fields[row.field].length > 0 && !row.valid}
          />
          <small id={`${id}-${row.field}-help`}>{copy(row.help)}</small>
          <button
            type="button"
            onClick={() => {
              if (!isCurrent()) return;
              const node = nodes.current[row.field];
              node?.focus();
              if (isCurrent()) node?.select();
            }}
          >
            {copy(row.select)}
          </button>
        </div>
      ))}
      {!valid && <p>{copy('invalid')}</p>}
      <div className="offer-message-actions">
        <button
          type="button"
          disabled={!valid || !verified || busyCopy}
          onClick={onReview}
        >
          {copy('review')}
        </button>
        <button
          type="button"
          disabled={!reviewed || !verified || busyCopy}
          onClick={() => onCopy('recipient')}
        >
          {copy('copyRecipient')}
        </button>
        <button
          type="button"
          disabled={!reviewed || !verified || busyCopy}
          onClick={() => onCopy('subject')}
        >
          {copy('copySubject')}
        </button>
        <button
          type="button"
          disabled={!reviewed || !verified || busyCopy}
          onClick={() => onCopy('body')}
        >
          {copy('copyBody')}
        </button>
        <button
          type="button"
          disabled={!verified || pdfStatus === 'pending'}
          onClick={onDownloadPdf}
        >
          {copy('pdf')}
        </button>
      </div>
      {reviewed && <p>{copy('reviewed')}</p>}
      <div role="status" aria-live="polite">
        {copyStatus.kind === 'pending' && (
          <>
            <p>{copy('copyPending')}</p>
            <button type="button" onClick={onStopWaiting}>
              {copy('stopWaiting')}
            </button>
          </>
        )}
        {copyStatus.kind === 'accepted' && <p>{copy('copied')}</p>}
        {copyStatus.kind === 'failed' && <p>{copy('copyFailed')}</p>}
        {copyStatus.kind === 'unconfirmed' && <p>{copy('copyUnconfirmed')}</p>}
        {pdfStatus === 'pending' && <p>{copy('pdfPending')}</p>}
        {pdfStatus === 'offered' && <p>{copy('pdfReady')}</p>}
        {pdfStatus === 'failed' && <p>{copy('pdfError')}</p>}
      </div>
    </section>
  );
}
