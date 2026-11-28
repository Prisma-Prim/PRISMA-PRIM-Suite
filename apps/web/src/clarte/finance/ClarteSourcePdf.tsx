import { FileText } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  accessRejected,
  useActorRequests,
  type ActorRequestProps,
} from '../../api/use-actor-requests';
import {
  readVerifiedPdf,
  type ExactSourcePdf,
} from '../../documents/use-verified-pdf-download';
import { ClarteButton } from '../components/ClarteButton';
import {
  ClarteErrorState,
  ClarteLoadingState,
} from '../components/ClarteState';
import { useClarteFinanceCopy } from './clarte-finance.copy';

type View =
  { status: 'idle' | 'loading' | 'error' } | { status: 'ready'; url: string };

/**
 * The exact source PDF beside a transcription. The PDF is read only when
 * asked, through the module's native read path, and shown only when its
 * type, size, signature and SHA-256 match the declared file.
 */
export function ClarteSourcePdf(
  props: ActorRequestProps & { source: ExactSourcePdf },
) {
  const { source } = props;
  const copy = useClarteFinanceCopy();
  const owner = useActorRequests({
    ...props,
    companyId: source.companyId,
    scope: source.authority,
    recoverThrough: source.recoverAccess,
  });
  const [view, setView] = useState<View>({ status: 'idle' });
  const pending = useRef(false);
  const url = view.status === 'ready' ? view.url : undefined;
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  // While a transcription is made beside it, the exact PDF opens at once.
  useEffect(() => {
    if (source.reading === 'immediate' && view.status === 'idle') void show();
  }, [source.reading]);
  async function show() {
    if (pending.current) return;
    pending.current = true;
    setView({ status: 'loading' });
    const result = await owner.run<Blob>((api, signal, current) =>
      readVerifiedPdf({
        client: api,
        path: source.path,
        companyId: source.companyId,
        signal,
        current,
        file: source.file,
        signature: 'required',
        cache: 'no-store',
      }),
    );
    if (!owner.isLive() || result.status === 'retired') return;
    pending.current = false;
    if (accessRejected(result) || result.status === 'notFound') {
      setView({ status: 'idle' });
      source.onDenied();
      return;
    }
    setView(
      result.status === 'ok'
        ? { status: 'ready', url: URL.createObjectURL(result.value) }
        : { status: 'error' },
    );
  }
  return (
    <section className="clarte-source-pdf" aria-label={copy.text('pdfView')}>
      <div className="clarte-source-pdf-head">
        <FileText aria-hidden="true" />
        <p>
          <strong>{source.file.fileName}</strong>
          <small>
            {copy.text('fingerprint')}{' '}
            <code>{source.file.sha256.slice(0, 16)}…</code>
          </small>
        </p>
        {view.status === 'idle' && (
          <ClarteButton size="small" onClick={() => void show()}>
            {copy.text('showPdf')}
          </ClarteButton>
        )}
      </div>
      {view.status === 'idle' && (
        <p className="clarte-source-pdf-hint">{copy.text('pdfHint')}</p>
      )}
      {view.status === 'loading' && (
        <ClarteLoadingState label={copy.text('pdfLoading')} />
      )}
      {view.status === 'error' && (
        <ClarteErrorState
          title={copy.text('pdfError')}
          action={
            <ClarteButton size="small" onClick={() => void show()}>
              {copy.text('pdfRetry')}
            </ClarteButton>
          }
        />
      )}
      {view.status === 'ready' && (
        <object
          className="clarte-source-pdf-frame"
          type="application/pdf"
          title={copy.pdfFrame(source.file.fileName)}
          data={view.url}
        >
          <p className="clarte-source-pdf-hint">{copy.text('pdfNoViewer')}</p>
        </object>
      )}
    </section>
  );
}

/** A renderer for the modules' optional source slot, keyed by the exact read. */
export function clarteSourcePdfRenderer(props: ActorRequestProps) {
  return function renderSourcePdf(source: ExactSourcePdf) {
    return (
      <ClarteSourcePdf
        key={JSON.stringify([source.authority, source.path])}
        {...props}
        source={source}
      />
    );
  };
}
