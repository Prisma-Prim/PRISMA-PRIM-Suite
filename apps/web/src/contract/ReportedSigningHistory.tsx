import { useInterfaceLocale } from '../localization/interface-locale';
import { useContractRecordedValues } from './contract-recorded-values';
import { useReportedSigningCopy } from './reported-signing.copy';
import type { ReportedSigningView } from './reported-signing-response';

export function ReportedSigningHistory({
  declaration,
  pdfAllowed,
}: {
  declaration: ReportedSigningView;
  pdfAllowed: boolean;
}) {
  const copy = useReportedSigningCopy(),
    { formatDateTime } = useInterfaceLocale(),
    { formatCalendarDate } = useContractRecordedValues();
  const signatory = (
    label: 'provider' | 'client',
    value: ReportedSigningView['providerSignatory'],
  ) => (
    <div>
      <dt>{copy(label)}</dt>
      <dd>
        {value.label} · {copy('declared')}
      </dd>
      <dt>{copy('signedOn')}</dt>
      <dd>
        {value.signedOn === null
          ? copy('unknown')
          : formatCalendarDate(value.signedOn)}
      </dd>
      <dt>{copy('mandate')}</dt>
      <dd>
        {value.mandate.kind === 'UNKNOWN' ? (
          copy('unknown')
        ) : (
          <>
            {copy('declaredMandate')}: {value.mandate.basis}
          </>
        )}
      </dd>
    </div>
  );
  return (
    <section aria-label={copy('recorded')}>
      <h5>{copy('recorded')}</h5>
      <p>{copy('confirmed')}</p>
      <p>{copy('notice')}</p>
      <p>{copy('offerSeparate')}</p>
      <dl>
        {signatory('provider', declaration.providerSignatory)}
        {signatory('client', declaration.clientSignatory)}
        <dt>{copy('concordance')}</dt>
        <dd>{declaration.concordanceBasis}</dd>
        <dt>{copy('acceptance')}</dt>
        <dd>{declaration.acceptanceBasis}</dd>
        <dt>{copy('recorded')}</dt>
        <dd>
          {formatDateTime(declaration.recordedAt)} ·{' '}
          {declaration.actorWorkspaceMembershipId}
        </dd>
      </dl>
      {(!pdfAllowed || declaration.pdf.access === 'denied') && (
        <p>{copy('pdfDenied')}</p>
      )}
    </section>
  );
}
