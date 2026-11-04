import type { LiveSource, Related } from './invoice-record-contract';
import { useInvoiceRecordCopy } from './invoice-record-copy';
import type {
  InvoiceAccessProps,
  InvoiceAccessRecovery,
} from './invoice-record-owner';
import { InvoiceRecordDownload } from './InvoiceRecordDownload';
import {
  InvoiceRecordContractLink,
  type InvoiceContractTarget,
} from './InvoiceRecordContractLink';

export type InvoiceRelatedCallbacks = {
  onOpenClient?: (clientId: string) => void;
  onOpenContract?: (input: InvoiceContractTarget) => void;
};
/** Only a still-current native projection reaches this view; copied facts live outside it. */
export function InvoiceRecordRelations(
  props: InvoiceAccessProps &
    InvoiceRelatedCallbacks & {
      companyId: string;
      recordId: string;
      downloadAuthority: string | null;
      source: LiveSource | undefined;
      related: Related | undefined;
      editing: boolean;
      onDenied: () => void;
      recoverAccess?: InvoiceAccessRecovery;
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
