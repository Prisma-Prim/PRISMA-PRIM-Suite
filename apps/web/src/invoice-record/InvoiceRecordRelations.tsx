import type { ReactNode } from 'react';
import type { ExactSourcePdf } from '../documents/use-verified-pdf-download';
import type { LiveSource, Related } from './invoice-record-contract';
import { useInvoiceRecordCopy } from './invoice-record-copy';
import type {
  ActorRequestProps,
  AccessRecovery,
} from '../api/use-actor-requests';
import { InvoiceRecordDownload } from './InvoiceRecordDownload';
import {
  InvoiceRecordContractLink,
  type InvoiceContractTarget,
} from './InvoiceRecordContractLink';

export type InvoiceRelatedCallbacks = {
  onOpenClient?: (clientId: string) => void;
  onOpenContract?: (input: InvoiceContractTarget) => void;
  /**
   * Shows the exact source PDF beside its facts. Only an interface that lays
   * the source beside the transcription passes it; the read stays native.
   */
  renderSourceView?: (source: ExactSourcePdf) => ReactNode;
};
/** Only a still-current native projection reaches this view; copied facts live outside it. */
export function InvoiceRecordRelations(
  props: ActorRequestProps &
    InvoiceRelatedCallbacks & {
      companyId: string;
      recordId: string;
      downloadAuthority: string | null;
      source: LiveSource | undefined;
      related: Related | undefined;
      editing: boolean;
      onDenied: () => void;
      recoverAccess?: AccessRecovery;
    },
) {
  const copy = useInvoiceRecordCopy();
  const { source, related } = props;
  return (
    <>
      <section className="invoice-record-source" aria-label={copy.source}>
        <h3>{copy.source}</h3>
        {source?.kind === 'AVAILABLE' ? (
          <>
            <p>
              {source.title} · {copy.version} {source.versionNumber} ·{' '}
              {source.versionState === 'official'
                ? copy.official
                : copy.superseded}
            </p>
            {source.content.kind === 'AVAILABLE' && props.downloadAuthority ? (
              <>
                <p>{source.content.fileName}</p>
                <InvoiceRecordDownload
                  key={props.editing ? 'editing' : 'reading'}
                  {...props}
                  authority={props.downloadAuthority}
                  source={source}
                />
                {props.renderSourceView?.({
                  companyId: props.companyId,
                  authority: JSON.stringify([
                    props.downloadAuthority,
                    props.recordId,
                    source.documentId,
                    source.documentVersionId,
                    source.content.representationId,
                  ]),
                  path: `/invoice-records/${encodeURIComponent(props.recordId)}/source`,
                  file: {
                    size: source.content.byteLength,
                    sha256: source.content.sha256,
                    fileName: source.content.fileName,
                  },
                  reading: props.editing ? 'immediate' : 'on-request',
                  onDenied: props.onDenied,
                  recoverAccess: props.recoverAccess,
                })}
              </>
            ) : (
              <p>{copy.sourceUnavailable}</p>
            )}
          </>
        ) : (
          <p>{copy.sourceUnavailable}</p>
        )}
      </section>
      <div className="invoice-record-actions">
        {related?.client.kind === 'AVAILABLE' && props.onOpenClient ? (
          <button
            type="button"
            disabled={props.editing}
            onClick={() => {
              if (related.client.kind === 'AVAILABLE')
                props.onOpenClient?.(related.client.clientId);
            }}
          >
            {copy.openClient}: {related.client.displayName}
          </button>
        ) : (
          <p>{copy.relatedUnavailable}</p>
        )}
        {related?.contract.kind === 'AVAILABLE' && props.onOpenContract && (
          <InvoiceRecordContractLink
            {...props}
            contract={related.contract}
            onOpenContract={props.onOpenContract}
          />
        )}
      </div>
    </>
  );
}
