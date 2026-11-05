import { useEffect, useId, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import { useAuthorityLifetime } from '../access/use-authority-lifetime';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import {
  readDocumentVersionReceipt,
  type DocumentVersionReceipt,
} from '../documents/document-response';
import { useDocumentPdfCopy } from '../documents/document-pdf.copy';
import { useDocumentNavigationProtection } from '../documents/document-navigation-protection';
import type { PaymentEvidenceRejection } from './payment-evidence-types';
type Command = {
  file: File;
  key: string;
  path: string;
  expectedRevision: number;
};
type Upload =
  | {
      status:
        'idle' | 'invalid' | 'unsafe' | 'unavailable' | 'denied' | 'confirmed';
    }
  | { status: 'pending' | 'uncertain'; command: Command }
  | { status: 'conflict'; recoveryGeneration: number };
/** A sealed immutable File and native command key belong only to upload authority. */
export function PaymentEvidencePdfUpload({
  identity,
  companyId,
  documentId,
  versionId,
  versionNumber,
  workingRevision,
  uploadKey,
  canUpload,
  recoveryGeneration = 0,
  onConfirmed,
  onProtectedWorkChange,
  onRejected,
}: {
  identity: BrowserIdentity;
  companyId: string;
  documentId: string;
  versionId: string;
  versionNumber: number;
  workingRevision: number;
  uploadKey: string;
  canUpload: boolean;
  recoveryGeneration?: number;
  onConfirmed: (receipt: DocumentVersionReceipt) => Promise<void> | void;
  onProtectedWorkChange: (protectedWork: boolean) => void;
  onRejected: PaymentEvidenceRejection;
}) {
  const copy = useDocumentPdfCopy(),
    id = useId(),
    [file, setFile] = useState<File>(),
    [upload, setUpload] = useState<Upload>({ status: 'idle' });
  const life = useAuthorityLifetime(
      JSON.stringify([uploadKey, documentId, versionId]),
      identity,
    ),
    pending = useRef<AbortController | undefined>(undefined),
    input = useRef<HTMLInputElement>(null);
  const callbacks = useRef({ onConfirmed, onRejected, recoveryGeneration });
  callbacks.current = { onConfirmed, onRejected, recoveryGeneration };
  const [confirmedRevision, setConfirmedRevision] = useState(0);
  const canStart = canUpload && workingRevision >= confirmedRevision;
  const busy = upload.status === 'pending' || upload.status === 'uncertain';
  useDocumentNavigationProtection(busy, onProtectedWorkChange);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    if (
      upload.status === 'conflict' &&
      recoveryGeneration > upload.recoveryGeneration
    ) {
      setUpload({ status: 'idle' });
      setFile(undefined);
      if (input.current) input.current.value = '';
    }
  }, [recoveryGeneration, upload]);
  async function submit(command: Command) {
    const request = new AbortController(),
      live = life(),
      current = () => !request.signal.aborted && live();
    pending.current = request;
    setUpload({ status: 'pending', command });
    let settled = false;
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (!current()) return;
      const result = await api.request<unknown>(command.path, {
        method: 'POST',
        companyContextId: companyId,
        signal: request.signal,
        headers: {
          'content-type': 'application/pdf',
          'idempotency-key': command.key,
        },
        body: command.file,
      });
      if (!current()) return;
      if (
        result.status === 'unauthorized' ||
        result.status === 'forbidden' ||
        result.status === 'notFound'
      ) {
        settled = true;
        setUpload({ status: 'denied' });
        setFile(undefined);
        if (input.current) input.current.value = '';
        await callbacks.current.onRejected(result, request.signal, current);
        return;
      }
      if (result.status === 'conflict') {
        settled = true;
        setUpload({
          status: 'conflict',
          recoveryGeneration: callbacks.current.recoveryGeneration,
        });
        return;
      }
      if (result.status === 'validation') {
        settled = true;
        setUpload({
          status: result.code === 'document_pdf_unsafe' ? 'unsafe' : 'invalid',
        });
        return;
      }
      if (
        result.status === 'error' &&
        result.code === 'document_pdf_scanner_unavailable'
      ) {
        settled = true;
        setUpload({ status: 'unavailable' });
        return;
      }
      if (result.status !== 'ok')
        throw new Error('Uncertain native PDF upload');
      const receipt = readDocumentVersionReceipt(result.value);
      if (!current()) return;
      if (
        receipt.action !== 'representation_added' ||
        receipt.documentId !== documentId ||
        receipt.versionId !== versionId ||
        receipt.versionNumber !== versionNumber ||
        receipt.workingRevision !== command.expectedRevision + 1 ||
        receipt.appendedAfterDesignation ||
        !uuid(receipt.representationId)
      )
        throw new Error('Unexpected PDF receipt');
      settled = true;
      setConfirmedRevision(receipt.workingRevision);
      setUpload({ status: 'confirmed' });
      setFile(undefined);
      if (input.current) input.current.value = '';
      await Promise.resolve(callbacks.current.onConfirmed(receipt)).catch(
        () => undefined,
      );
    } catch {
      if (!settled && current()) setUpload({ status: 'uncertain', command });
    }
  }
  function preserve() {
    if (!canStart || !file || workingRevision >= 2147483647) return;
    if (!validFile(file)) {
      setUpload({ status: 'invalid' });
      return;
    }
    void submit({
      file,
      key: crypto.randomUUID(),
      expectedRevision: workingRevision,
      path:
        '/documents/' +
        encodeURIComponent(documentId) +
        '/versions/' +
        encodeURIComponent(versionId) +
        '/content?expectedRevision=' +
        workingRevision +
        '&fileName=' +
        encodeURIComponent(file.name),
    });
  }
  if (
    !canUpload &&
    upload.status !== 'pending' &&
    upload.status !== 'uncertain'
  ) {
    if (upload.status === 'idle') return null;
    if (upload.status === 'confirmed')
      return <p role="status">{copy.t('saved')}</p>;
    return <p role="alert">{copy.t(upload.status)}</p>;
  }
  const blocked =
    busy || upload.status === 'denied' || upload.status === 'conflict';
  return (
    <div className="payment-evidence-pdf-upload">
      <label htmlFor={id + '-file'}>{copy.t('fileLabel')}</label>
      <input
        id={id + '-file'}
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        disabled={blocked || !canStart}
        aria-describedby={id + '-help'}
        onChange={(event) => {
          if (blocked || !canStart) return;
          setFile(event.currentTarget.files?.[0]);
          setUpload({ status: 'idle' });
        }}
      />
      <p id={id + '-help'}>{copy.t('fileHelp')}</p>
      <button
        type="button"
        disabled={blocked || !canStart || !file}
        onClick={preserve}
      >
        {copy.t('save')}
      </button>
      {upload.status === 'pending' && <p role="status">{copy.t('saving')}</p>}
      {upload.status === 'confirmed' && <p role="status">{copy.t('saved')}</p>}
      {upload.status === 'uncertain' && (
        <div role="alert">
          <p>{copy.t('uncertain')}</p>
          <button
            type="button"
            onClick={() => {
              if (upload.status === 'uncertain') void submit(upload.command);
            }}
          >
            {copy.t('retry')}
          </button>
        </div>
      )}
      {(upload.status === 'invalid' ||
        upload.status === 'unsafe' ||
        upload.status === 'unavailable' ||
        upload.status === 'denied' ||
        upload.status === 'conflict') && (
        <p role="alert">{copy.t(upload.status)}</p>
      )}
      <p>{copy.t('preserved')}</p>
    </div>
  );
}
function validFile(file: File) {
  return (
    file.type === 'application/pdf' &&
    file.size > 0 &&
    file.size <= 5242880 &&
    file.name.length >= 5 &&
    file.name.length <= 120 &&
    file.name === file.name.trim() &&
    /\.pdf$/iu.test(file.name) &&
    !/[\p{Cc}\p{Cf}/\\]/u.test(file.name)
  );
}
function uuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
    value,
  );
}
