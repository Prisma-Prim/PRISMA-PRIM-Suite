import { useEffect, useId, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
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
  companyId: string;
  documentId: string;
  versionId: string;
  versionNumber: number;
  content: PdfContent;
  canUpload: boolean;
  workingRevision: number;
  onConfirmed: () => void;
  onReload: () => void;
  onDenied: () => Promise<void>;
  onProtectedWorkChange?: (protectedWork: boolean) => void;
}) {
  const copy = useDocumentPdfCopy();
  const locale = useInterfaceLocale();
  const id = useId();
  const [file, setFile] = useState<File>();
  const [upload, setUpload] = useState<UploadState>({ status: 'idle' });
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
  const mounted = useRef(true);
  const pendingRead = useRef<AbortController | undefined>(undefined);
  const historyRead = useRef<AbortController | undefined>(undefined);
  const path = `/documents/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(versionId)}/content`;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pendingRead.current?.abort();
      historyRead.current?.abort();
    };
  }, []);
  useEffect(() => {
    historyRead.current?.abort();
    setHistory(undefined);
    setHistoryState('idle');
  }, [workingRevision]);

  function clearFile(): void {
    setFile(undefined);
    if (fileInput.current) fileInput.current.value = '';
  }

  async function submit(command: UploadCommand): Promise<void> {
    setUpload({ status: 'pending', command });
    try {
      const api = await createAuthenticatedApiClient(identity);
      // A retired owner must not dispatch a file after asynchronous token lookup.
      // Commands already sent retain their existing durable-receipt policy.
      if (!mounted.current) return;
      const result = await api.request<unknown>(command.path, {
        method: 'POST',
        companyContextId: companyId,
        headers: {
          'content-type': 'application/pdf',
          'idempotency-key': command.key,
        },
        body: command.file,
      });
      if (!mounted.current) return;
      if (result.status === 'unauthorized') {
        await identity.rejectSession();
        return;
      }
      if (result.status === 'forbidden' || result.status === 'notFound') {
        setWithheld(true);
        setHistory(undefined);
        setUpload({ status: 'denied' });
        await onDenied().catch(() => undefined);
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
      if (mounted.current) setUpload({ status: 'uncertain', command });
    }
  }
  function preserve(): void {
    if (
      !file ||
      file.type !== 'application/pdf' ||
      file.size < 1 ||
      file.size > 5242880 ||
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
    });
  }
  async function downloadFile(pdf: PreservedDocumentPdf): Promise<void> {
    pendingRead.current?.abort();
    const controller = new AbortController();
    pendingRead.current = controller;
    setDownload('pending');
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (controller.signal.aborted) return;
      const result = await api.download(
        `${path}/${encodeURIComponent(pdf.representationId)}`,
        { companyContextId: companyId, signal: controller.signal },
      );
      if (!mounted.current || controller.signal.aborted) return;
      if (result.status === 'unauthorized') {
        await identity.rejectSession();
        return;
      }
      if (result.status === 'forbidden' || result.status === 'notFound') {
        setWithheld(true);
        setHistory(undefined);
        setDownload('denied');
        await onDenied().catch(() => undefined);
        return;
      }
      if (
        result.status !== 'ok' ||
        result.value.type !== 'application/pdf' ||
        result.value.size !== pdf.size
      ) {
        setDownload('error');
        return;
      }
      const digest = await crypto.subtle.digest(
        'SHA-256',
        await result.value.arrayBuffer(),
      );
      const sha256 = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join('');
      if (!mounted.current || controller.signal.aborted) return;
      if (sha256 !== pdf.sha256) {
        setDownload('error');
        return;
      }
      const url = URL.createObjectURL(result.value);
      try {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = pdf.fileName;
        anchor.click();
      } finally {
        URL.revokeObjectURL(url);
      }
      setDownload('idle');
    } catch {
      if (mounted.current && !controller.signal.aborted) setDownload('error');
    }
  }
  async function loadHistory(beforeRevision?: number): Promise<void> {
    historyRead.current?.abort();
    const controller = new AbortController();
    historyRead.current = controller;
    setHistoryState('pending');
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (controller.signal.aborted) return;
      const result = await api.request<unknown>(
        `${path}/history${beforeRevision === undefined ? '' : `?beforeRevision=${beforeRevision}`}`,
        { companyContextId: companyId, signal: controller.signal },
      );
      if (!mounted.current || controller.signal.aborted) return;
      if (result.status === 'unauthorized') {
        await identity.rejectSession();
        return;
      }
      if (result.status === 'forbidden' || result.status === 'notFound') {
        setHistory(undefined);
        setHistoryState('idle');
        setWithheld(true);
        setHistory(undefined);
        setDownload('denied');
        await onDenied().catch(() => undefined);
        return;
      }
      if (result.status !== 'ok') {
        setHistoryState('error');
        return;
      }
      const page = readDocumentPdfHistory(result.value);
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
      if (mounted.current && !controller.signal.aborted)
        setHistoryState('error');
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
              setFile(event.currentTarget.files?.[0]);
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
