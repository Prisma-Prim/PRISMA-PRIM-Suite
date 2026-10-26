import { SigningPdfDownload } from './SigningPdfDownload';
import type { BrowserIdentity } from '../access-composition';
import { useInterfaceLocale } from '../localization/interface-locale';
import { useContractRecordedValues } from './contract-recorded-values';
import { useReportedSigningCopy } from './reported-signing.copy';
import type { ReportedSigningView } from './reported-signing-response';

export function ReportedSigningHistory({
  declaration,
  identity,
  companyId,
  pdfAllowed,
  pdfAuthorityKey,
  reject,
}: {
  declaration: ReportedSigningView;
  identity: BrowserIdentity;
  companyId: string;
  pdfAllowed: boolean;
  pdfAuthorityKey: string;
  reject: Parameters<typeof SigningPdfDownload>[0]['reject'];
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
      {pdfAllowed && declaration.pdf.access === 'granted' ? (
        <SigningPdfDownload
          key={pdfAuthorityKey}
          identity={identity}
          companyId={companyId}
          pdf={declaration.pdf.reference}
          reject={reject}
        />
      ) : (
        <p>{copy('pdfDenied')}</p>
      )}
    </section>
  );
}
