import { useState, type ReactNode } from 'react';
import { ContractModelBody } from '../contract-model/ContractModelVersionContent';
import { useModelOfferCopy } from '../offer/model-offer.copy';
import { useInterfaceLocale } from '../localization/interface-locale';
import { useContractCopy } from './contract.copy';
import { useContractRecordedValues } from './contract-recorded-values';
import { useModelContractCopy } from './model-contract.copy';
import type { ModelContractView } from './model-contract-response';

export function ModelContractDetails({
  contract,
  locked,
  pdfAction,
}: {
  contract: ModelContractView;
  locked: boolean;
  pdfAction?: ReactNode;
}) {
  const copy = useModelContractCopy(),
    common = useContractCopy(),
    financial = useModelOfferCopy(),
    { formatDecimal, formatCalendarDate } = useContractRecordedValues(),
    { formatDateTime } = useInterfaceLocale();
  const [preview, setPreview] = useState(false);
  const { version } = contract,
    { modelSource, offerSource, caseDetails, financials } =
      version.modelGeneration;
  function download() {
    if (locked) return;
    const url = URL.createObjectURL(
      new Blob([version.representation.html], {
        type: 'text/html;charset=utf-8',
      }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `contract-${contract.illustrativeReference}-v${version.versionNumber}-non-official-ro.html`;
    try {
      anchor.click();
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  return (
    <section aria-label={copy('sourceData')} className="model-contract-details">
      <h5>{copy('sourceData')}</h5>
      <dl>
        <dt>{common('reference')}</dt>
        <dd>
          {contract.illustrativeReference} · {common('sourceVersion')}{' '}
          {version.versionNumber}
        </dd>
        <dt>{common('party')}</dt>
        <dd>
          {version.recipient.legalName}
          <br />
          {version.recipient.taxId ?? common('missing')}
          <br />
          {version.recipient.legalAddress ?? common('missing')}
        </dd>
        <dt>{copy('documentDate')}</dt>
        <dd>{formatCalendarDate(caseDetails.documentDate)}</dd>
        <dt>{copy('clientDetails')}</dt>
        <dd>{caseDetails.clientDetails}</dd>
        <dt>{common('start')}</dt>
        <dd>
          {caseDetails.termStartsOn
            ? formatCalendarDate(caseDetails.termStartsOn)
            : common('missing')}
        </dd>
        <dt>{common('end')}</dt>
        <dd>
          {caseDetails.termEndsOn
            ? formatCalendarDate(caseDetails.termEndsOn)
            : common('missing')}
        </dd>
        <dt>{common('conditions')}</dt>
        <dd>{caseDetails.specialConditions ?? common('missing')}</dd>
        <dt>{copy('scope')}</dt>
        <dd>{version.scopeNote ?? common('missing')}</dd>
        <dt>{copy('commercial')}</dt>
        <dd>{version.commercialConditions ?? common('missing')}</dd>
        <dt>{copy('basis')}</dt>
        <dd>{caseDetails.sourceConcordanceBasis}</dd>
        <dt>{financial('net')}</dt>
        <dd>
          {formatDecimal(financials.netAmount)} {financials.currency}
        </dd>
        <dt>{financials.taxLabel}</dt>
        <dd>
          {formatDecimal(financials.taxAmount)} {financials.currency}
        </dd>
        <dt>{financial('gross')}</dt>
        <dd>
          {formatDecimal(financials.grossAmount)} {financials.currency}
        </dd>
        <dt>{common('source')}</dt>
        <dd>
          {offerSource.illustrativeReference} · {common('sourceVersion')}{' '}
          {offerSource.offerVersionNumber}
          <br />
          {offerSource.offerVersionId}
        </dd>
        <dt>{common('checksum')}</dt>
        <dd>
          <code>{offerSource.representationSha256}</code>
        </dd>
        <dt>{copy('modelSource')}</dt>
        <dd>
          {modelSource.content.title} · {common('sourceVersion')}{' '}
          {modelSource.versionNumber}
          <br />
          {modelSource.versionId}
          <br />
          {modelSource.approvalDecisionId} ·{' '}
          {formatDateTime(modelSource.approvedAt)} ·{' '}
          {modelSource.approvedBy.workspaceMembershipId}
        </dd>
        <dt>{copy('economicSource')}</dt>
        <dd>
          {offerSource.priceSource.approvalDecisionId} ·{' '}
          {formatDateTime(offerSource.priceSource.approvedAt)}
        </dd>
      </dl>
      <ContractModelBody content={modelSource.content} />
      <button
        type="button"
        disabled={locked}
        onClick={() => setPreview((current) => !current)}
      >
        {common('openDocument')}
      </button>
      <button type="button" disabled={locked} onClick={download}>
        {copy('download')}
      </button>
      {pdfAction}
      {preview && (
        <div className="contract-representation">
          <p>
            {common('checksum')}: <code>{version.representation.sha256}</code>
          </p>
          <iframe
            title={copy('title')}
            sandbox=""
            referrerPolicy="no-referrer"
            srcDoc={version.representation.html}
          />
        </div>
      )}
    </section>
  );
}
