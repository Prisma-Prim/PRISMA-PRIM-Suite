import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import { useAuthorityLifetime } from '../access/use-authority-lifetime';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import { useVerifiedPdfDownload } from '../documents/use-verified-pdf-download';
import { useRequestLifetime } from '../api/use-actor-requests';
import { useScopedOperationGroup } from '../api/use-scoped-operation';
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
  const scope = JSON.stringify([
    companyId,
    contentReadKey,
    documentId,
    versionId,
    identity.loaded,
    identity.signedIn,
  ]);
  const life = useAuthorityLifetime(scope, identity);
  const generation = useRequestLifetime(identity, scope);
  const metadataReads = useScopedOperationGroup(String(generation));
  const historyReads = useScopedOperationGroup(String(generation));
  const downloads = useScopedOperationGroup(String(generation));
  const verifiedDownload = useVerifiedPdfDownload();
  const retired = useRef(false);
  const rejected = useRef(onRejected);
  useLayoutEffect(() => {
    rejected.current = onRejected;
  });
  const path =
    '/documents/' +
    encodeURIComponent(documentId) +
    '/versions/' +
    encodeURIComponent(versionId) +
    '/content';
  useEffect(() => {
    const request = metadataReads.beginLatest();
    if (!request) return;
    const live = life(),
      current = () => !request.signal.aborted && live() && !retired.current;
    const reject = rejected.current;
    historyReads.retire();
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
            downloads.retire();
            historyReads.retire();
            await reject(
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
          downloads.retire();
          historyReads.retire();
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
      } finally {
        request.release();
      }
    })();
    return request.retire;
  }, [
    companyId,
    contentReadKey,
    documentId,
    identity,
    life,
    metadataReads,
    historyReads,
    downloads,
    retry,
    versionId,
    versionNumber,
    workingRevision,
  ]);
  async function loadHistory(beforeRevision?: number) {
    const request = historyReads.beginLatest();
    if (!request) return;
    const live = life(),
      current = () => !request.signal.aborted && live() && !retired.current;
    const reject = rejected.current;
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
          downloads.retire();
          await reject(
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
    } finally {
      request.release();
    }
  }
  async function downloadFile(pdf: PreservedDocumentPdf) {
    const request = downloads.beginLatest();
    if (!request) return;
    const live = life(),
      current = () => !request.signal.aborted && live() && !retired.current;
    const reject = rejected.current;
    setDownload('pending');
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (!current()) return;
      const result = await verifiedDownload({
        client: api,
        path: path + '/' + encodeURIComponent(pdf.representationId),
        companyId,
        signal: request.signal,
        isCurrent: current,
        file: pdf,
        signature: 'unchecked',
        cache: 'no-store',
      });
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
          historyReads.retire();
          await reject(
            result,
            request.signal,
            () => !request.signal.aborted && live(),
          );
          return;
        }
        throw new Error('PDF download unavailable');
      }
      if (current()) setDownload('idle');
    } catch {
      if (current()) setDownload('error');
    } finally {
      request.release();
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
