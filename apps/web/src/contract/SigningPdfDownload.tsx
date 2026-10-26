import { useEffect, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import {
  createAuthenticatedApiClient,
  type ApiResult,
} from '../api/authenticated-api-client';
import { useReportedSigningCopy } from './reported-signing.copy';
import type { SigningPdfReference } from './reported-signing-response';

/** Independently owned download survives declaration and Project grant changes. */
export function SigningPdfDownload({
  identity,
  companyId,
  pdf,
  reject,
}: {
  identity: BrowserIdentity;
  companyId: string;
  pdf: SigningPdfReference;
  reject: (
    result: ApiResult<unknown>,
    signal: AbortSignal,
  ) => Promise<'unauthorized' | 'forbidden' | undefined>;
}) {
  const copy = useReportedSigningCopy();
  const request = useRef<AbortController | undefined>(undefined);
  const [state, setState] = useState<
    'idle' | 'running' | 'unavailable' | 'denied'
  >('idle');
  useEffect(() => () => request.current?.abort(), []);
  async function download() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setState('running');
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (controller.signal.aborted) return;
      const result = await api.download(
        `/documents/${encodeURIComponent(pdf.documentId)}/versions/${encodeURIComponent(pdf.documentVersionId)}/content/${encodeURIComponent(pdf.representationId)}`,
        { companyContextId: companyId, signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      if (await reject(result, controller.signal)) {
        if (!controller.signal.aborted) setState('denied');
        return;
      }
      if (controller.signal.aborted) return;
      if (result.status === 'notFound') {
        setState('denied');
        return;
      }
      if (
        result.status !== 'ok' ||
        result.value.type !== 'application/pdf' ||
        result.value.size !== pdf.size
      )
        throw new Error('Unavailable exact PDF.');
      const digest = await crypto.subtle.digest(
        'SHA-256',
        await result.value.arrayBuffer(),
      );
      if (controller.signal.aborted) return;
      if (
        Array.from(new Uint8Array(digest), (byte) =>
          byte.toString(16).padStart(2, '0'),
        ).join('') !== pdf.sha256
      )
        throw new Error('PDF digest mismatch.');
      const url = URL.createObjectURL(result.value);
      try {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = pdf.fileName;
        anchor.click();
      } finally {
        URL.revokeObjectURL(url);
      }
      setState('idle');
    } catch {
      if (!controller.signal.aborted) setState('unavailable');
    }
  }
  if (state === 'denied') return <p>{copy('pdfDenied')}</p>;
  return (
    <div>
      <p>
        {pdf.title} · {pdf.documentVersionNumber} · {pdf.fileName}
      </p>
      {state === 'unavailable' && <p role="alert">{copy('unavailable')}</p>}
      <button
        type="button"
        disabled={state === 'running'}
        onClick={() => void download()}
      >
        {copy('download')}
      </button>
    </div>
  );
}
