import { formatMessage } from '../localization/messages';
import { useInterfaceLocale } from '../localization/interface-locale';
import { sectionKeys } from './OfferModelForm';
import type { OfferModelVersion } from './offer-model-response';
import { useOfferModelCopy } from './offer-model.copy';

export function OfferModelVersionContent({
  version,
}: {
  version: OfferModelVersion;
}) {
  const copy = useOfferModelCopy();
  const { formatNumber, formatDateTime } = useInterfaceLocale();
  const { content } = version;
  const attribution = (
    key: 'createdBy' | 'decidedBy' | 'withdrawnBy',
    value: { actor: { displayName: string }; recordedAt: string },
  ) =>
    formatMessage(copy(key), {
      name: value.actor.displayName,
      date: formatDateTime(value.recordedAt),
    });
  return (
    <article className="offer-model-version">
      <h3 className="offer-model-literal">
        {formatMessage(copy('version'), {
          number: formatNumber(version.versionNumber),
        })}
        : {content.serviceTitle}
      </h3>
      <p>{copy('language')}</p>
      <p className="offer-model-provenance">{copy(content.sourceKind)}</p>
      <p>{attribution('createdBy', version)}</p>
      <p>
        {copy(
          !version.decision
            ? 'pending'
            : version.decision.outcome === 'APPROVE'
              ? 'approved'
              : 'rejected',
        )}
      </p>
      {version.decision && (
        <div>
          <p>{attribution('decidedBy', version.decision)}</p>
          <h4>{copy('basis')}</h4>
          <p className="offer-model-literal">{version.decision.basis}</p>
        </div>
      )}
      {version.withdrawal && (
        <div>
          <p>{copy('withdrawn')}</p>
          <p>{attribution('withdrawnBy', version.withdrawal)}</p>
          <h4>{copy('withdrawReason')}</h4>
          <p className="offer-model-literal">{version.withdrawal.reason}</p>
        </div>
      )}
      <OfferModelBody content={content} />
    </article>
  );
}

/** Shared literal approved-model body without configuration decisions or notes. */
export function OfferModelBody({
  content,
}: {
  content: OfferModelVersion['content'];
}) {
  const copy = useOfferModelCopy();
  return (
    <>
      {' '}
      <dl>
        <dt>{copy('sourceDescription')}</dt>
        <dd>{content.sourceDescription}</dd>
        {(
          ['legalName', 'taxId', 'legalAddress', 'contactDetails'] as const
        ).map(
          (key) =>
            content.issuer[key] && (
              <div key={key}>
                <dt>{copy(key)}</dt>
                <dd>{content.issuer[key]}</dd>
              </div>
            ),
        )}
      </dl>
      <h4>{copy('frameworks')}</h4>
      <ol>
        {content.frameworks.map((entry, index) => (
          <li className="offer-model-literal" key={index}>
            {entry.name} — {entry.edition}
          </li>
        ))}
      </ol>
      {sectionKeys.map((key) => (
        <div key={key}>
          <h4>{copy(key)}</h4>
          <p className="offer-model-literal">{content.sections[key]}</p>
        </div>
      ))}
      <h4>{copy('plannedStages')}</h4>
      <ol>
        {content.stages.map((stage, index) => (
          <li className="offer-model-literal" key={index}>
            <h5 className="offer-model-literal">{stage.title}</h5>
            <p className="offer-model-literal">{stage.plannedActivity}</p>
            <p className="offer-model-literal">{stage.intendedResult}</p>
          </li>
        ))}
      </ol>
    </>
  );
}
