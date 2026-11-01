import type { ExternalInvoiceRecipient } from './external-invoice-response';
import { useExternalInvoiceCopy } from './external-invoice.copy';

export function ExternalInvoiceParty({
  party,
}: {
  party: ExternalInvoiceRecipient;
}) {
  const copy = useExternalInvoiceCopy();
  return (
    <section className="working-document-party" aria-label={copy.t('party')}>
      <h5>{copy.t('party')}</h5>
      <p>{copy.t(party.kind === 'PRIMARY' ? 'primary' : 'additional')}</p>
      <p className="working-document-literal">{party.legalName}</p>
      <dl>
        <dt>{copy.t('taxId')}</dt>
        <dd className="working-document-literal">
          {party.taxId ?? copy.t('notRecorded')}
        </dd>
        <dt>{copy.t('address')}</dt>
        <dd className="working-document-literal">
          {party.legalAddress ?? copy.t('notRecorded')}
        </dd>
      </dl>
    </section>
  );
}
