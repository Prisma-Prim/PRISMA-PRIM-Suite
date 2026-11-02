import { useEffect, useRef, useState } from 'react';
import type { LiveSource } from './invoice-record-contract';
import { useInvoiceRecordCopy } from './invoice-record-copy';
import {
  accessRejected,
  useInvoiceOwner,
  type InvoiceAccessProps,
  type InvoiceAccessRecovery,
} from './invoice-record-owner';

export function InvoiceRecordDownload(
  props: InvoiceAccessProps & {
    companyId: string;
    recordId: string;
    authority: string;
    source: Extract<LiveSource, { kind: 'AVAILABLE' }>;
    onDenied: () => void;
    recoverAccess?: InvoiceAccessRecovery;
  },
) {
  const copy = useInvoiceRecordCopy();
  const content = props.source.content;
  const scope = JSON.stringify([
    props.authority,
    props.recordId,
    props.source.documentId,
    props.source.documentVersionId,
    content.kind === 'AVAILABLE' ? content.representationId : null,
  ]);
  const owner = useInvoiceOwner(
    props,
    props.companyId,
    scope,
    props.recoverAccess,
  );
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const pending = useRef(false);
  const urls = useRef(new Set<string>());
  useEffect(() => {
    const owned = urls.current;
    return () => {
      for (const url of owned) URL.revokeObjectURL(url);
      owned.clear();
    };
  }, []);
  async function download() {
    if (pending.current || content.kind !== 'AVAILABLE') return;
    pending.current = true;
    setState('loading');
    const result = await owner.run<boolean>(async (api, signal, current) => {
      const downloaded = await api.download(
        `/invoice-records/${encodeURIComponent(props.recordId)}/source`,
        {
          signal,
          companyContextId: props.companyId,
          cache: 'no-store',
          maximumBytes: 5 * 1024 * 1024,
        },
      );
      if (!current()) return { status: 'error' };
      if (downloaded.status !== 'ok') return downloaded;
      const blob = downloaded.value;
      if (
        blob.type !== 'application/pdf' ||
        blob.size !== content.byteLength ||
        blob.size < 5 ||
        blob.size > 5 * 1024 * 1024
      )
        return { status: 'error' };
      const bytes = await blob.arrayBuffer();
      if (!current()) return { status: 'error' };
      const signature = new Uint8Array(bytes, 0, 5);
      if (
        signature[0] !== 37 ||
        signature[1] !== 80 ||
        signature[2] !== 68 ||
        signature[3] !== 70 ||
        signature[4] !== 45
      )
        return { status: 'error' };
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      if (!current()) return { status: 'error' };
      const hash = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join('');
      if (hash !== content.sha256 || !current()) return { status: 'error' };
      const url = URL.createObjectURL(blob);
      urls.current.add(url);
      const link = document.createElement('a');
      try {
        if (!current()) return { status: 'error' };
        link.href = url;
        link.download = content.fileName;
        link.rel = 'noopener';
        link.hidden = true;
        document.body.append(link);
        if (!current()) return { status: 'error' };
        link.click();
        return { status: 'ok', value: true };
      } finally {
        link.remove();
        URL.revokeObjectURL(url);
        urls.current.delete(url);
      }
    });
    if (!owner.isLive() || result.status === 'retired') return;
    pending.current = false;
    if (accessRejected(result) || result.status === 'notFound') {
      props.onDenied();
      return;
    }
    setState(result.status === 'ok' ? 'idle' : 'error');
  }
  if (content.kind !== 'AVAILABLE') return <p>{copy.sourceUnavailable}</p>;
  return (
    <div>
      <button
        type="button"
        disabled={state === 'loading'}
        onClick={() => void download()}
      >
        {state === 'loading' ? copy.downloading : copy.download}
      </button>
      {state === 'error' && <p role="alert">{copy.downloadError}</p>}
    </div>
  );
}
