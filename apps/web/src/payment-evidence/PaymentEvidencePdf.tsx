import { useEffect, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import { useAuthorityLifetime } from '../access/use-authority-lifetime';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import {
  readDocumentVersions,
  type DocumentVersionReceipt,
} from '../documents/document-response';
import {
  readDocumentPdfHistory,
  type DocumentPdfContent,
  type DocumentPdfHistory,
  type PreservedDocumentPdf,
} from '../documents/document-pdf-response';
import { useDocumentPdfCopy } from '../documents/document-pdf.copy';
import { useInterfaceLocale } from '../localization/interface-locale';
import type { PaymentEvidenceRejection } from './payment-evidence-types';
import { PaymentEvidencePdfUpload } from './PaymentEvidencePdfUpload';
import { usePaymentEvidenceCopy } from './payment-evidence.copy';
interface Props {
  identity: BrowserIdentity;
  companyId: string;
  documentId: string;
  versionId: string;
  versionNumber: number;
  workingRevision: number;
  contentState: 'absent' | 'stored';
  contentReadKey: string | null;
  readable?: boolean;
  uploadKey: string | null;
  recoveryGeneration?: number;
  canUpload: boolean;
  uploadDisabled: boolean;
  onConfirmed: (receipt: DocumentVersionReceipt) => Promise<void> | void;
  onProtectedWorkChange: (protectedWork: boolean) => void;
  onRejected: PaymentEvidenceRejection;
}
/** Protected metadata/read and Recorder upload are siblings, never one combined owner. */
export function PaymentEvidencePdf(props: Props) {
  const copy = useDocumentPdfCopy();
  return (
    <section className="working-document-pdf" aria-label={copy.t('title')}>
      <h6>{copy.t('title')}</h6>
      {props.readable !== false && props.contentReadKey ? (
        <PaymentEvidencePdfRead
          key={props.contentReadKey}
          {...props}
          contentReadKey={props.contentReadKey}
        />
      ) : props.readable !== false ? (
        <p>
          {copy.t(
            props.contentState === 'absent' ? 'absent' : 'downloadDenied',
          )}
        </p>
      ) : null}
      <fieldset disabled={props.uploadDisabled}>
        {props.uploadKey && (
          <PaymentEvidencePdfUpload
            key={props.uploadKey}
            {...props}
            uploadKey={props.uploadKey}
          />
        )}
      </fieldset>
    </section>
  );
}
type Metadata =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'denied' }
  | { status: 'ready'; content: DocumentPdfContent };
function PaymentEvidencePdfRead({
  identity,
  companyId,
  documentId,
  versionId,
  versionNumber,
  workingRevision,
  contentReadKey,
  onRejected,
}: Props & { contentReadKey: string }) {
  const copy = useDocumentPdfCopy(),
    sourceCopy = usePaymentEvidenceCopy(),
    locale = useInterfaceLocale();
  const [metadata, setMetadata] = useState<Metadata>({ status: 'loading' }),
    [history, setHistory] = useState<DocumentPdfHistory>(),
    [historyStatus, setHistoryStatus] = useState<'idle' | 'pending' | 'error'>(
      'idle',
    ),
    [download, setDownload] = useState<'idle' | 'pending' | 'error' | 'denied'>(
      'idle',
    ),
    [retry, setRetry] = useState(0);
  const life = useAuthorityLifetime(
      JSON.stringify([contentReadKey, documentId, versionId]),
      identity,
    ),
    downloadRequest = useRef<AbortController | undefined>(undefined),
    historyRequest = useRef<AbortController | undefined>(undefined),
    retired = useRef(false);
  const rejected = useRef(onRejected);
  rejected.current = onRejected;
  const path =
    '/documents/' +
    encodeURIComponent(documentId) +
    '/versions/' +
    encodeURIComponent(versionId) +
    '/content';
  useEffect(
    () => () => {
      downloadRequest.current?.abort();
      historyRequest.current?.abort();
    },
    [],
  );
  useEffect(() => {
    const request = new AbortController(),
      live = life(),
      current = () => !request.signal.aborted && live() && !retired.current;
    historyRequest.current?.abort();
    setHistory(undefined);
    setHistoryStatus('idle');
    setMetadata({ status: 'loading' });
    void (async () => {
      try {
        const api = await createAuthenticatedApiClient(identity);
        if (!current()) return;
        const result = await api.request(
          '/documents/' + encodeURIComponent(documentId) + '/versions',
          {
            companyContextId: companyId,
            signal: request.signal,
            cache: 'no-store',
          },
        );
        if (!current()) return;
        if (result.status !== 'ok') {
          if (
            result.status === 'unauthorized' ||
            result.status === 'forbidden' ||
            result.status === 'notFound'
          ) {
            setMetadata({ status: 'denied' });
            retired.current = true;
            downloadRequest.current?.abort();
            historyRequest.current?.abort();
            await rejected.current(
              result,
              request.signal,
              () => !request.signal.aborted && live(),
            );
            return;
          }
          throw new Error('Protected PDF metadata unavailable');
        }
        const versions = readDocumentVersions(result.value, 'payment-evidence');
        if (!current()) return;
        const selected = versions.versions.find(
          (version) =>
            version.id === versionId && version.number === versionNumber,
        );
        if (!selected || versions.workingRevision < workingRevision)
          throw new Error('Wrong PDF Version metadata');
        if (
          selected.pdfContent.state === 'stored' &&
          selected.pdfContent.access === 'denied'
        ) {
          setMetadata({ status: 'denied' });
          downloadRequest.current?.abort();
          historyRequest.current?.abort();
          retired.current = true;
          return;
        }
        if (
          selected.pdfContent.state === 'stored' &&
          selected.pdfContent.access === 'granted' &&
          !uuid(selected.pdfContent.representationId)
        )
          throw new Error('Invalid PDF identity');
        setMetadata({ status: 'ready', content: selected.pdfContent });
      } catch {
        if (current()) setMetadata({ status: 'error' });
      }
    })();
    return () => request.abort();
  }, [
    companyId,
    contentReadKey,
    documentId,
    identity,
    life,
    retry,
    versionId,
    versionNumber,
    workingRevision,
  ]);
  async function loadHistory(beforeRevision?: number) {
    historyRequest.current?.abort();
    const request = new AbortController(),
      live = life(),
      current = () => !request.signal.aborted && live() && !retired.current;
    historyRequest.current = request;
    setHistoryStatus('pending');
    const previous = history;
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (!current()) return;
      const result = await api.request(
        path +
          '/history' +
          (beforeRevision === undefined
            ? ''
            : '?beforeRevision=' + beforeRevision),
        {
          companyContextId: companyId,
          signal: request.signal,
          cache: 'no-store',
        },
      );
      if (!current()) return;
      if (result.status !== 'ok') {
        if (
          result.status === 'unauthorized' ||
          result.status === 'forbidden' ||
          result.status === 'notFound'
        ) {
          setMetadata({ status: 'denied' });
          retired.current = true;
          setHistory(undefined);
          downloadRequest.current?.abort();
          await rejected.current(
            result,
            request.signal,
            () => !request.signal.aborted && live(),
          );
          return;
        }
        throw new Error('PDF history unavailable');
      }
      const page = readDocumentPdfHistory(result.value);
      if (page.uploads.some((upload) => !uuid(upload.representationId)))
        throw new Error('Invalid upload identity');
      if (!current()) return;
      if (
        beforeRevision === undefined &&
        page.uploads.length &&
        !page.uploads[0]?.current
      )
        throw new Error('Missing current upload');
      if (
        beforeRevision !== undefined &&
        (!previous ||
          previous.nextBeforeRevision !== beforeRevision ||
          page.uploads.some(
            (upload) =>
              upload.revision >= beforeRevision ||
              upload.current ||
              previous.uploads.some(
                (old) => old.representationId === upload.representationId,
              ),
          ))
      )
        throw new Error('Invalid upload continuation');
      setHistory({
        ...page,
        uploads:
          beforeRevision === undefined
            ? page.uploads
            : [...(previous?.uploads ?? []), ...page.uploads],
      });
      setHistoryStatus('idle');
    } catch {
      if (current()) setHistoryStatus('error');
    }
  }
  async function downloadFile(pdf: PreservedDocumentPdf) {
    downloadRequest.current?.abort();
    const request = new AbortController(),
      live = life(),
      current = () => !request.signal.aborted && live() && !retired.current;
    downloadRequest.current = request;
    setDownload('pending');
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (!current()) return;
      const result = await api.download(
        path + '/' + encodeURIComponent(pdf.representationId),
        {
          companyContextId: companyId,
          signal: request.signal,
          cache: 'no-store',
          maximumBytes: 5242880,
        },
      );
      if (!current()) return;
      if (result.status !== 'ok') {
        if (
          result.status === 'unauthorized' ||
          result.status === 'forbidden' ||
          result.status === 'notFound'
        ) {
          setDownload('denied');
          setMetadata({ status: 'denied' });
          retired.current = true;
          setHistory(undefined);
          historyRequest.current?.abort();
          await rejected.current(
            result,
            request.signal,
            () => !request.signal.aborted && live(),
          );
          return;
        }
        throw new Error('PDF download unavailable');
      }
      if (
        result.value.type !== 'application/pdf' ||
        result.value.size !== pdf.size
      )
        throw new Error('Invalid PDF bytes');
      const bytes = await result.value.arrayBuffer();
      if (!current()) return;
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      if (!current()) return;
      const hash = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join('');
      if (hash !== pdf.sha256) throw new Error('PDF integrity mismatch');
      const url = URL.createObjectURL(result.value);
      try {
        if (!current()) return;
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = pdf.fileName;
        if (!current()) return;
        anchor.click();
      } finally {
        URL.revokeObjectURL(url);
      }
      if (current()) setDownload('idle');
    } catch {
      if (current()) setDownload('error');
    }
  }
  if (metadata.status === 'denied') return <p>{copy.t('downloadDenied')}</p>;
  if (metadata.status === 'loading')
    return <p role="status">{sourceCopy('loading')}</p>;
  if (metadata.status === 'error')
    return (
      <div role="alert">
        <p>{copy.t('downloadFailed')}</p>
        <button type="button" onClick={() => setRetry((value) => value + 1)}>
          {copy.t('reload')}
        </button>
      </div>
    );
  const content = metadata.content;
  return (
    <div className="payment-evidence-pdf-read">
      {content.state === 'absent' && <p>{copy.t('absent')}</p>}
      {content.state === 'stored' && content.access === 'granted' && (
        <>
          <p>{content.fileName}</p>
          <p>
            {copy.storedBy(content.storedBy.displayName)} ·{' '}
            <time dateTime={content.storedAt}>
              {locale.formatDateTime(content.storedAt)}
            </time>
          </p>
          <button
            type="button"
            disabled={download === 'pending'}
            onClick={() => void downloadFile(content)}
          >
            {copy.download(versionNumber)}
          </button>
          <button
            type="button"
            disabled={historyStatus === 'pending'}
            onClick={() => void loadHistory()}
          >
            {copy.t('history')}
          </button>
        </>
      )}
      {history && (
        <ol aria-label={copy.t('history')}>
          {history.uploads.map((pdf) => (
            <li key={pdf.representationId}>
              <span>{pdf.fileName}</span> ·{' '}
              <time dateTime={pdf.storedAt}>
                {locale.formatDateTime(pdf.storedAt)}
              </time>{' '}
              · {copy.storedBy(pdf.storedBy.displayName)}
              {pdf.current ? ' · ' + copy.t('current') : ''}
              <button
                type="button"
                disabled={download === 'pending'}
                onClick={() => void downloadFile(pdf)}
              >
                {copy.download(versionNumber)}
              </button>
            </li>
          ))}
        </ol>
      )}
      {history?.nextBeforeRevision !== null &&
        history?.nextBeforeRevision !== undefined && (
          <button
            type="button"
            disabled={historyStatus === 'pending'}
            onClick={() =>
              void loadHistory(history.nextBeforeRevision ?? undefined)
            }
          >
            {copy.t('older')}
          </button>
        )}
      {historyStatus === 'error' && (
        <div role="alert">
          <p>{copy.t('historyFailed')}</p>
          <button
            type="button"
            onClick={() =>
              void loadHistory(history?.nextBeforeRevision ?? undefined)
            }
          >
            {copy.t('history')}
          </button>
        </div>
      )}
      {download === 'pending' && <p role="status">{copy.t('downloading')}</p>}
      {download === 'error' && <p role="alert">{copy.t('downloadFailed')}</p>}
    </div>
  );
}

function uuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
    value,
  );
}
