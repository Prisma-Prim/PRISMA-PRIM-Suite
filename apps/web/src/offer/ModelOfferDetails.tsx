import type { ReactNode } from 'react';
import { OfferModelBody } from '../offer-model/OfferModelVersionContent';
import type {
  ModelOfferView,
  SelectedOfferModel,
} from './model-offer-response';
import { useModelOfferCopy } from './model-offer.copy';
import { useOfferPresentation } from './offer-presentation';

export function SelectedOfferModelContent({
  model,
}: {
  model: SelectedOfferModel;
}) {
  const copy = useModelOfferCopy();
  const { formatDateTime } = useOfferPresentation();
  return (
    <section className="offer-model-version">
      <h5>{copy('model')}</h5>
      <p className="offer-model-literal">{model.content.serviceTitle}</p>
      <p>
        {model.versionNumber} · {model.versionId}
      </p>
      <p>
        {model.approvalDecisionId} · {formatDateTime(model.approvedAt)} ·{' '}
        {model.approvedBy.workspaceMembershipId}
      </p>
      <OfferModelBody content={model.content} />
    </section>
  );
}

export function ModelOfferDetails({
  version,
  illustrativeReference,
  pdfAction,
}: {
  version: ModelOfferView['version'];
  illustrativeReference: number;
  pdfAction?: ReactNode;
}) {
  const copy = useModelOfferCopy();
  const { formatDateTime, formatDecimal } = useOfferPresentation();
  const { financialDeclaration: facts } = version;
  return (
    <section className="model-offer-details">
      <p>{copy('notice')}</p>
      <SelectedOfferModelContent model={version.modelSource} />
      <dl>
        <dt>{copy('net')}</dt>
        <dd>
          {formatDecimal(facts.netAmount)} {facts.currency}
        </dd>
        <dt>{facts.taxLabel}</dt>
        <dd>
          {formatDecimal(facts.taxAmount)} {facts.currency}
        </dd>
        <dt>{copy('gross')}</dt>
        <dd>
          {formatDecimal(facts.grossAmount)} {facts.currency}
        </dd>
        <dt>{copy('basis')}</dt>
        <dd className="offer-model-literal">{facts.basis}</dd>
        <dt>{copy('declaredBy')}</dt>
        <dd>
          {facts.declaredBy.workspaceMembershipId} ·{' '}
          {formatDateTime(facts.declaredAt)}
        </dd>
      </dl>
      <button
        type="button"
        onClick={() => {
          const url = URL.createObjectURL(
            new Blob([version.representation.html], {
              type: 'text/html;charset=utf-8',
            }),
          );
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = `offer-${illustrativeReference}-v${version.versionNumber}-non-official-ro.html`;
          try {
            anchor.click();
          } finally {
            URL.revokeObjectURL(url);
          }
        }}
      >
        {copy('download')}
      </button>
      {pdfAction}
    </section>
  );
}
