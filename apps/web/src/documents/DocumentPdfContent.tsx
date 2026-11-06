import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useAuthorityLifetime } from '../access/use-authority-lifetime';
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
  receivedAddendumOwnership,
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
  receivedAddendumOwnership?: {
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
  onDenied: (isCurrent?: () => boolean) => Promise<void>;
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
    receivedAddendumOwnership &&
    (uploadState.status === 'pending' || uploadState.status === 'uncertain') &&
    !uploadState.command.current()
      ? { status: 'idle' as const }
      : uploadState;
  const file =
    heldFile && (!receivedAddendumOwnership || heldFile.current())
      ? heldFile.file
      : undefined;
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
  const readSignature = JSON.stringify([
    path,
    receivedAddendumOwnership?.readKey,
  ]);
  const uploadSignature = JSON.stringify([
    path,
    receivedAddendumOwnership?.uploadKey,
  ]);
  const captureRead = useAuthorityLifetime(readSignature, identity);
  const captureUpload = useAuthorityLifetime(uploadSignature, identity);
  const uploadRequest = useRef<AbortController | undefined>(undefined);
  useLayoutEffect(() => {
    if (!receivedAddendumOwnership) return;
    uploadRequest.current?.abort();
    setFile(undefined);
    setUpload({ status: 'idle' });
    if (fileInput.current) fileInput.current.value = '';
  }, [uploadSignature, identity]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pendingRead.current?.abort();
      historyRead.current?.abort();
      uploadRequest.current?.abort();
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
    const current = () =>
      mounted.current && (!receivedAddendumOwnership || command.current());
    if (!current()) return;
    const actorCurrent =
      receivedAddendumOwnership?.captureRecovery() ?? (() => true);
    const currentRecovery = () => current() && actorCurrent();
    const request = receivedAddendumOwnership
      ? new AbortController()
      : undefined;
    if (request) uploadRequest.current = request;
    setUpload({ status: 'pending', command });
    try {
      const api = await createAuthenticatedApiClient(identity);
      // A retired owner must not dispatch a file after asynchronous token lookup.
      // Commands already sent retain their existing durable-receipt policy.
      if (!current()) return;
      const result = await api.request<unknown>(command.path, {
        method: 'POST',
        ...(request ? { signal: request.signal } : {}),
        companyContextId: companyId,
        headers: {
          'content-type': 'application/pdf',
          'idempotency-key': command.key,
        },
        body: command.file,
      });
      if (!current()) return;
      if (result.status === 'unauthorized') {
        if (receivedAddendumOwnership) setUpload({ status: 'denied' });
        if (!receivedAddendumOwnership || currentRecovery())
          await identity.rejectSession();
        return;
      }
      if (result.status === 'forbidden' || result.status === 'notFound') {
        setWithheld(true);
        setHistory(undefined);
        setUpload({ status: 'denied' });
        await (
          receivedAddendumOwnership ? onDenied(currentRecovery) : onDenied()
        ).catch(() => undefined);
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
    }
  }
  function preserve(): void {
    if (
      receivedAddendumOwnership &&
      (!heldFile?.current() || !receivedAddendumOwnership.uploadKey)
    )
      return;
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
      current: receivedAddendumOwnership
        ? captureUpload()
        : () => mounted.current,
    });
  }
  async function downloadFile(pdf: PreservedDocumentPdf): Promise<void> {
    const readOwner = receivedAddendumOwnership
      ? captureRead()
      : () => mounted.current;
    const actorCurrent =
      receivedAddendumOwnership?.captureRecovery() ?? (() => true);
    const allowed = () =>
      mounted.current &&
      readOwner() &&
      (!receivedAddendumOwnership ||
        receivedAddendumOwnership.readKey !== null);
    if (!allowed()) return;
    const currentRecovery = () => allowed() && actorCurrent();
    pendingRead.current?.abort();
    const controller = new AbortController();
    pendingRead.current = controller;
    setDownload('pending');
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (!allowed() || controller.signal.aborted) return;
      const result = await api.download(
        `${path}/${encodeURIComponent(pdf.representationId)}`,
        {
          companyContextId: companyId,
          signal: controller.signal,
          maximumBytes: 5242880,
        },
      );
      if (!allowed() || controller.signal.aborted) return;
      if (result.status === 'unauthorized') {
        if (receivedAddendumOwnership) setDownload('error');
        if (!receivedAddendumOwnership || currentRecovery())
          await identity.rejectSession();
        return;
      }
      if (result.status === 'forbidden' || result.status === 'notFound') {
        setWithheld(true);
        setHistory(undefined);
        setDownload('denied');
        await (
          receivedAddendumOwnership ? onDenied(currentRecovery) : onDenied()
        ).catch(() => undefined);
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
      const bytes = await result.value.arrayBuffer();
      if (!allowed() || controller.signal.aborted) return;
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const sha256 = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join('');
      if (!allowed() || controller.signal.aborted) return;
      if (sha256 !== pdf.sha256) {
        setDownload('error');
        return;
      }
      const url = URL.createObjectURL(result.value);
      try {
        if (!allowed() || controller.signal.aborted) return;
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = pdf.fileName;
        anchor.click();
      } finally {
        URL.revokeObjectURL(url);
      }
      setDownload('idle');
    } catch {
      if (allowed() && !controller.signal.aborted) setDownload('error');
    }
  }
  async function loadHistory(beforeRevision?: number): Promise<void> {
    const readOwner = receivedAddendumOwnership
      ? captureRead()
      : () => mounted.current;
    const actorCurrent =
      receivedAddendumOwnership?.captureRecovery() ?? (() => true);
    const allowed = () =>
      mounted.current &&
      readOwner() &&
      (!receivedAddendumOwnership ||
        receivedAddendumOwnership.readKey !== null);
    if (!allowed()) return;
    const currentRecovery = () => allowed() && actorCurrent();
    historyRead.current?.abort();
    const controller = new AbortController();
    historyRead.current = controller;
    setHistoryState('pending');
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (!allowed() || controller.signal.aborted) return;
      const result = await api.request<unknown>(
        `${path}/history${beforeRevision === undefined ? '' : `?beforeRevision=${beforeRevision}`}`,
        { companyContextId: companyId, signal: controller.signal },
      );
      if (!allowed() || controller.signal.aborted) return;
      if (result.status === 'unauthorized') {
        if (receivedAddendumOwnership) setHistoryState('error');
        if (!receivedAddendumOwnership || currentRecovery())
          await identity.rejectSession();
        return;
      }
      if (result.status === 'forbidden' || result.status === 'notFound') {
        setHistory(undefined);
        setHistoryState('idle');
        setWithheld(true);
        setHistory(undefined);
        setDownload('denied');
        await (
          receivedAddendumOwnership ? onDenied(currentRecovery) : onDenied()
        ).catch(() => undefined);
        return;
      }
      if (result.status !== 'ok') {
        setHistoryState('error');
        return;
      }
      const page = readDocumentPdfHistory(result.value);
      if (!allowed() || controller.signal.aborted) return;
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
      if (allowed() && !controller.signal.aborted) setHistoryState('error');
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
                      current: receivedAddendumOwnership
                        ? captureUpload()
                        : () => mounted.current,
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
