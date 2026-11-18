import { useRef, useState } from 'react';
import { useVerifiedPdfDownload } from '../documents/use-verified-pdf-download';
import type { PaymentLiveSource } from './payment.types';
import { useInterfaceLocale } from '../localization/interface-locale';
import { paymentCopy } from './ui';
import {
  accessRejected,
  useActorRequests,
  type ActorRequestProps,
  type AccessRecovery,
} from '../api/use-actor-requests';

export function PaymentDownload(
  props: ActorRequestProps & {
    companyId: string;
    recordId: string;
    authority: string;
    source: Extract<PaymentLiveSource, { kind: 'AVAILABLE' }>;
    onDenied: () => void;
    recoverAccess?: AccessRecovery;
  },
) {
  const { locale } = useInterfaceLocale();
  const copy = paymentCopy[locale];
  const content = props.source.content;
  const scope = JSON.stringify([
    props.authority,
    props.recordId,
    props.source.documentId,
    props.source.documentVersionId,
    content.kind === 'AVAILABLE' ? content.representationId : null,
  ]);
  const owner = useActorRequests({
    ...props,
    companyId: props.companyId,
    scope: scope,
    recoverThrough: props.recoverAccess,
  });
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const pending = useRef(false);
  const verifiedDownload = useVerifiedPdfDownload();
  async function download() {
    if (pending.current || content.kind !== 'AVAILABLE') return;
    pending.current = true;
    setState('loading');
    const result = await owner.run<boolean>((api, signal, current) =>
      verifiedDownload({
        client: api,
        path: `/payments/${encodeURIComponent(props.recordId)}/source`,
        companyId: props.companyId,
        signal,
        isCurrent: current,
        file: {
          size: content.byteLength,
          sha256: content.sha256,
          fileName: content.fileName,
        },
        signature: 'required',
        cache: 'no-store',
      }),
    );
    if (!owner.isLive() || result.status === 'retired') return;
    pending.current = false;
    if (accessRejected(result) || result.status === 'notFound') {
      props.onDenied();
      return;
    }
    setState(result.status === 'ok' ? 'idle' : 'error');
  }
  if (content.kind !== 'AVAILABLE') return <p>{copy.unavailable}</p>;
  return (
    <div>
      <button
        type="button"
        disabled={state === 'loading'}
        onClick={() => void download()}
      >
        {state === 'loading' ? copy.loading : copy.download}
      </button>
      {state === 'error' && <p role="alert">{copy.error}</p>}
    </div>
  );
}
