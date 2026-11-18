import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useAuthorityLifetime } from '../access/use-authority-lifetime';
import type { BrowserIdentity } from '../access-composition';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import {
  MAXIMUM_DOCUMENT_PDF_BYTES,
  useVerifiedPdfDownload,
} from './use-verified-pdf-download';
import { useRequestLifetime } from '../api/use-actor-requests';
import {
  useScopedOperation,
  useScopedOperationGroup,
} from '../api/use-scoped-operation';
import { useInterfaceLocale } from '../localization/interface-locale';
import { readDocumentVersionReceipt } from './document-response';
import {
  readDocumentPdfHistory,
  type DocumentPdfContent as PdfContent,
  type DocumentPdfHistory,
  type PreservedDocumentPdf,
} from './document-pdf-response';
import { useDocumentPdfCopy } from './document-pdf.copy';
import { useDocumentNavigationProtection } from './document-navigation-protection';

interface UploadCommand {
  file: File;
  key: string;
  path: string;
  current: () => boolean;
}
type UploadState =
  | {
      status:
        | 'idle'
        | 'invalid'
        | 'unsafe'
        | 'unavailable'
        | 'confirmed'
        | 'denied'
        | 'conflict';
    }
  | { status: 'pending' | 'uncertain'; command: UploadCommand };
/** Only content rights expose file metadata or authenticated immutable downloads. */
export function DocumentPdfContent({
  identity,
  ownership,
  companyId,
  documentId,
  versionId,
  versionNumber,
  content,
  canUpload,
  workingRevision,
  onConfirmed,
  onReload,
  onDenied,
  onProtectedWorkChange,
}: {
  identity: BrowserIdentity;
  ownership: {
    readKey: string | null;
    uploadKey: string | null;
    captureRecovery: ReturnType<typeof useAuthorityLifetime>;
  };
  companyId: string;
  documentId: string;
  versionId: string;
  versionNumber: number;
  content: PdfContent;
  canUpload: boolean;
  workingRevision: number;
  onConfirmed: () => void;
  onReload: () => void;
  onDenied: (isCurrent: () => boolean) => Promise<void>;
  onProtectedWorkChange?: (protectedWork: boolean) => void;
}) {
  const copy = useDocumentPdfCopy();
  const locale = useInterfaceLocale();
  const id = useId();
  const [heldFile, setFile] = useState<{
    file: File;
    current: () => boolean;
  }>();
  const [uploadState, setUpload] = useState<UploadState>({ status: 'idle' });
  const upload =
    (uploadState.status === 'pending' || uploadState.status === 'uncertain') &&
    !uploadState.command.current()
      ? { status: 'idle' as const }
      : uploadState;
  const file = heldFile?.current() ? heldFile.file : undefined;
  useDocumentNavigationProtection(
    upload.status === 'pending' || upload.status === 'uncertain',
    onProtectedWorkChange,
  );
  const [download, setDownload] = useState<
    'idle' | 'pending' | 'error' | 'denied'
  >('idle');
  const [withheld, setWithheld] = useState(false);
  const [history, setHistory] = useState<DocumentPdfHistory>();
  const [historyState, setHistoryState] = useState<
    'idle' | 'pending' | 'error'
  >('idle');
  const fileInput = useRef<HTMLInputElement>(null);
  const path = `/documents/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(versionId)}/content`;
  const readSignature = JSON.stringify([path, ownership.readKey]);
  const uploadSignature = JSON.stringify([path, ownership.uploadKey]);
  const readLifetime = useRequestLifetime(
    identity,
    JSON.stringify([
      companyId,
      readSignature,
      identity.loaded,
      identity.signedIn,
    ]),
  );
  const uploadLifetime = useRequestLifetime(
    identity,
    JSON.stringify([
      companyId,
      uploadSignature,
      identity.loaded,
      identity.signedIn,
    ]),
  );
  const uploadRequests = useScopedOperationGroup(String(uploadLifetime));
  const downloads = useScopedOperation(String(readLifetime));
  const verifiedDownload = useVerifiedPdfDownload();
  const historyReads = useScopedOperation(
    JSON.stringify([readLifetime, workingRevision]),
  );
  useLayoutEffect(() => {
    setFile(undefined);
    setUpload({ status: 'idle' });
    if (fileInput.current) fileInput.current.value = '';
  }, [uploadLifetime]);
  useLayoutEffect(() => {
    setWithheld(false);
    setDownload('idle');
  }, [readLifetime]);
  useLayoutEffect(() => {
    setWithheld(false);
  }, [content]);
  useEffect(() => {
    setHistory(undefined);
    setHistoryState('idle');
  }, [workingRevision, readLifetime]);

  function clearFile(): void {
    setFile(undefined);
    if (fileInput.current) fileInput.current.value = '';
  }

  async function submit(command: UploadCommand): Promise<void> {
    if (!command.current() || uploadRequests.isPending()) return;
    const request = uploadRequests.begin();
    if (!request) return;
    const current = () => command.current() && !request.signal.aborted;
    const actorCurrent = ownership.captureRecovery();
    const currentRecovery = () => current() && actorCurrent();
    setUpload({ status: 'pending', command });
    try {
      const api = await createAuthenticatedApiClient(identity);
      // A retired owner must not dispatch a file after asynchronous token lookup.
      // Commands already sent retain their existing durable-receipt policy.
      if (!current()) return;
      const result = await api.request(command.path, {
        method: 'POST',
        signal: request.signal,
        companyContextId: companyId,
        headers: {
          'content-type': 'application/pdf',
          'idempotency-key': command.key,
        },
        body: command.file,
      });
      if (!current()) return;
      if (result.status === 'unauthorized') {
        setUpload({ status: 'denied' });
        if (currentRecovery()) await identity.rejectSession();
        return;
      }
      if (result.status === 'forbidden' || result.status === 'notFound') {
        setWithheld(true);
        setHistory(undefined);
        setUpload({ status: 'denied' });
        await onDenied(currentRecovery).catch(() => undefined);
        return;
      }
      if (result.status === 'conflict') {
        setUpload({ status: 'conflict' });
        return;
      }
      if (result.status === 'validation') {
        setUpload({
          status: result.code === 'document_pdf_unsafe' ? 'unsafe' : 'invalid',
        });
        return;
      }
      if (
        result.status === 'error' &&
        result.code === 'document_pdf_scanner_unavailable'
      ) {
        setUpload({ status: 'unavailable' });
        return;
      }
      if (result.status !== 'ok') {
        setUpload({ status: 'uncertain', command });
        return;
      }
      const receipt = readDocumentVersionReceipt(result.value);
      if (!current()) return;
      if (
        receipt.action !== 'representation_added' ||
        receipt.documentId !== documentId ||
        receipt.versionId !== versionId ||
        receipt.versionNumber !== versionNumber ||
        receipt.appendedAfterDesignation
      )
        throw new Error('Invalid PDF upload receipt');
      setUpload({ status: 'confirmed' });
      clearFile();
      // The successful durable receipt stays confirmed even when refreshing fails.
      onConfirmed();
    } catch {
      if (current()) setUpload({ status: 'uncertain', command });
    } finally {
      request.release();
    }
  }
  function preserve(): void {
    if (
      !identity.loaded ||
      !identity.signedIn ||
      !canUpload ||
      !heldFile?.current() ||
      !ownership.uploadKey
    )
      return;
    if (
      !file ||
      file.type !== 'application/pdf' ||
      file.size < 1 ||
      file.size > MAXIMUM_DOCUMENT_PDF_BYTES ||
      file.name.length < 5 ||
      file.name.length > 120 ||
      file.name !== file.name.trim() ||
      !/\.pdf$/iu.test(file.name) ||
      /[\p{Cc}\p{Cf}/\\]/u.test(file.name)
    ) {
      setUpload({ status: 'invalid' });
      return;
    }
    void submit({
      file,
      key: crypto.randomUUID(),
      path: `${path}?expectedRevision=${workingRevision}&fileName=${encodeURIComponent(file.name)}`,
      current: uploadRequests.capture(),
    });
  }
  async function downloadFile(pdf: PreservedDocumentPdf): Promise<void> {
    if (!identity.loaded || !identity.signedIn || ownership.readKey === null)
      return;
    const signal = downloads.begin();
    if (!signal) return;
    const actorCurrent = ownership.captureRecovery();
    const allowed = () => !signal.aborted;
    const currentRecovery = () => allowed() && actorCurrent();
    setDownload('pending');
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (!allowed()) return;
      const result = await verifiedDownload({
        client: api,
        path: `${path}/${encodeURIComponent(pdf.representationId)}`,
        companyId,
        signal,
        isCurrent: allowed,
        file: pdf,
        signature: 'unchecked',
      });
      if (!allowed()) return;
      if (result.status === 'unauthorized') {
        setDownload('error');
        if (currentRecovery()) await identity.rejectSession();
        return;
      }
      if (result.status === 'forbidden' || result.status === 'notFound') {
        setWithheld(true);
        setHistory(undefined);
        setDownload('denied');
        await onDenied(currentRecovery).catch(() => undefined);
        return;
      }
      if (result.status !== 'ok') {
        setDownload('error');
        return;
      }
      setDownload('idle');
    } catch {
      if (allowed()) setDownload('error');
    }
  }
  async function loadHistory(beforeRevision?: number): Promise<void> {
    if (!identity.loaded || !identity.signedIn || ownership.readKey === null)
      return;
    const signal = historyReads.begin();
    if (!signal) return;
    const actorCurrent = ownership.captureRecovery();
    const allowed = () => !signal.aborted;
    const currentRecovery = () => allowed() && actorCurrent();
    setHistoryState('pending');
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (!allowed()) return;
      const result = await api.request(
        `${path}/history${beforeRevision === undefined ? '' : `?beforeRevision=${beforeRevision}`}`,
        { companyContextId: companyId, signal },
      );
      if (!allowed()) return;
      if (result.status === 'unauthorized') {
        setHistoryState('error');
        if (currentRecovery()) await identity.rejectSession();
        return;
      }
      if (result.status === 'forbidden' || result.status === 'notFound') {
        setHistory(undefined);
        setHistoryState('idle');
        setWithheld(true);
        setHistory(undefined);
        setDownload('denied');
        await onDenied(currentRecovery).catch(() => undefined);
        return;
      }
      if (result.status !== 'ok') {
        setHistoryState('error');
        return;
      }
      const page = readDocumentPdfHistory(result.value);
      if (!allowed()) return;
      if (
        beforeRevision === undefined &&
        page.uploads.length > 0 &&
        !page.uploads[0]?.current
      )
        throw new Error('Missing current PDF history entry');
      if (
        beforeRevision !== undefined &&
        page.uploads.some(
          (entry) => entry.revision >= beforeRevision || entry.current,
        )
      )
        throw new Error('Invalid PDF continuation');
      setHistory((previous) => ({
        ...page,
        uploads:
          beforeRevision === undefined
            ? page.uploads
            : [...(previous?.uploads ?? []), ...page.uploads],
      }));
      setHistoryState('idle');
    } catch {
      if (allowed()) setHistoryState('error');
    }
  }
  const blocked =
    upload.status === 'pending' ||
    upload.status === 'uncertain' ||
    upload.status === 'conflict' ||
    upload.status === 'denied';
  return (
    <section aria-labelledby={id} className="working-document-pdf">
      <h6 id={id}>{copy.t('title')}</h6>
      {content.state === 'absent' && <p>{copy.t('absent')}</p>}
      {content.state === 'stored' && content.access === 'denied' && (
        <p>{copy.t('downloadDenied')}</p>
      )}
      {!withheld &&
        content.state === 'stored' &&
        content.access === 'granted' && (
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
            {!history && (
              <button
                type="button"
                disabled={historyState === 'pending'}
                onClick={() => void loadHistory()}
              >
                {copy.t('history')}
              </button>
            )}
          </>
        )}
      {!withheld && history && (
        <ol aria-label={copy.t('history')}>
          {history.uploads.map((pdf) => (
            <li key={pdf.representationId}>
              <span>{pdf.fileName}</span> ·{' '}
              <time dateTime={pdf.storedAt}>
                {locale.formatDateTime(pdf.storedAt)}
              </time>{' '}
              · {copy.storedBy(pdf.storedBy.displayName)}
              {pdf.current && <span> · {copy.t('current')}</span>}
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
      {!withheld && history?.nextBeforeRevision != null && (
        <button
          type="button"
          disabled={historyState === 'pending'}
          onClick={() =>
            void loadHistory(history.nextBeforeRevision ?? undefined)
          }
        >
          {copy.t('older')}
        </button>
      )}
      {historyState === 'error' && (
        <>
          <p role="alert">{copy.t('historyFailed')}</p>
          <button
            type="button"
            onClick={() =>
              void loadHistory(history?.nextBeforeRevision ?? undefined)
            }
          >
            {copy.t('history')}
          </button>
        </>
      )}
      {download === 'pending' && <p role="status">{copy.t('downloading')}</p>}
      {(download === 'error' || download === 'denied') && (
        <p role="alert">
          {copy.t(download === 'denied' ? 'downloadDenied' : 'downloadFailed')}
        </p>
      )}
      {canUpload && !withheld && (
        <>
          <label htmlFor={`${id}-file`}>{copy.t('fileLabel')}</label>
          <input
            id={`${id}-file`}
            ref={fileInput}
            type="file"
            accept="application/pdf,.pdf"
            disabled={blocked}
            onChange={(event) => {
              const selected = event.currentTarget.files?.[0];
              setFile(
                selected
                  ? {
                      file: selected,
                      current: uploadRequests.capture(),
                    }
                  : undefined,
              );
              setUpload({ status: 'idle' });
            }}
          />
          <p>{copy.t('fileHelp')}</p>
          <button type="button" disabled={blocked || !file} onClick={preserve}>
            {copy.t('save')}
          </button>
          <p>{copy.t('preserved')}</p>
        </>
      )}
      {upload.status === 'pending' && <p role="status">{copy.t('saving')}</p>}
      {upload.status === 'confirmed' && <p role="status">{copy.t('saved')}</p>}
      {(upload.status === 'invalid' ||
        upload.status === 'unsafe' ||
        upload.status === 'unavailable' ||
        upload.status === 'denied' ||
        upload.status === 'conflict') && (
        <p role="alert">{copy.t(upload.status)}</p>
      )}
      {upload.status === 'uncertain' && (
        <>
          <p role="alert">{copy.t('uncertain')}</p>
          <button type="button" onClick={() => void submit(upload.command)}>
            {copy.t('retry')}
          </button>
        </>
      )}
      {upload.status === 'conflict' && (
        <button
          type="button"
          onClick={() => {
            setUpload({ status: 'idle' });
            clearFile();
            onReload();
          }}
        >
          {copy.t('reload')}
        </button>
      )}
    </section>
  );
}
