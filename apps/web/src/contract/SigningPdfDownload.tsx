import { useLayoutEffect, useRef, useState } from 'react';
import { useRequestLifetime } from '../api/use-actor-requests';
import { useScopedOperationGroup } from '../api/use-scoped-operation';
import type { BrowserIdentity } from '../access-composition';
import {
  createAuthenticatedApiClient,
  type ApiResult,
} from '../api/authenticated-api-client';
import { useVerifiedPdfDownload } from '../documents/use-verified-pdf-download';
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
  const lifetime = useRequestLifetime(
    identity,
    JSON.stringify([
      identity.loaded,
      identity.signedIn,
      companyId,
      pdf.documentId,
      pdf.documentVersionId,
      pdf.representationId,
      pdf.sha256,
      pdf.size,
      pdf.fileName,
    ]),
  );
  const downloads = useScopedOperationGroup(String(lifetime));
  const verifiedDownload = useVerifiedPdfDownload();
  const callbacks = useRef({ reject });
  useLayoutEffect(() => {
    callbacks.current = { reject };
  });
  const [state, setState] = useState<
    'idle' | 'running' | 'unavailable' | 'denied'
  >('idle');
  async function download() {
    const controller = downloads.beginLatest();
    if (!controller) return;
    const rejected = callbacks.current.reject;
    setState('running');
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (controller.signal.aborted) return;
      const result = await verifiedDownload({
        client: api,
        path: `/documents/${encodeURIComponent(pdf.documentId)}/versions/${encodeURIComponent(pdf.documentVersionId)}/content/${encodeURIComponent(pdf.representationId)}`,
        companyId,
        signal: controller.signal,
        isCurrent: () => !controller.signal.aborted,
        file: pdf,
        signature: 'unchecked',
      });
      if (controller.signal.aborted) return;
      if (await rejected(result, controller.signal)) {
        if (!controller.signal.aborted) setState('denied');
        return;
      }
      if (controller.signal.aborted) return;
      if (result.status === 'notFound') {
        setState('denied');
        return;
      }
      if (result.status !== 'ok') throw new Error('Unavailable exact PDF.');
      setState('idle');
    } catch {
      if (!controller.signal.aborted) setState('unavailable');
    } finally {
      controller.release();
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
