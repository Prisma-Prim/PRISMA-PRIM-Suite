import { formatMessage } from '../localization/messages';
import { useInterfaceLocale } from '../localization/interface-locale';
import { sectionKeys, signatureLabels } from './ContractModelForm';
import type { ContractModelVersion } from './contract-model-response';
import { useContractModelCopy } from './contract-model.copy';

export function ContractModelVersionContent({
  version,
}: {
  version: ContractModelVersion;
}) {
  const copy = useContractModelCopy();
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
    <article className="contract-model-version">
      <h3 className="contract-model-literal">
        {formatMessage(copy('version'), {
          number: formatNumber(version.versionNumber),
        })}
        : {content.serviceTitle}
      </h3>
      <p>{copy('fixedKind')}</p>
      <p className="contract-model-provenance">{copy(content.sourceKind)}</p>
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
          <p className="contract-model-literal">{version.decision.basis}</p>
        </div>
      )}
      {version.withdrawal && (
        <div>
          <p>{copy('withdrawn')}</p>
          <p>{attribution('withdrawnBy', version.withdrawal)}</p>
          <h4>{copy('withdrawReason')}</h4>
          <p className="contract-model-literal">{version.withdrawal.reason}</p>
        </div>
      )}
      <ContractModelBody content={content} />
    </article>
  );
}

/** Shared literal approved-model body without configuration decisions or notes. */
function ContractModelBody({
  content,
}: {
  content: ContractModelVersion['content'];
}) {
  const copy = useContractModelCopy();
  return (
    <>
      {' '}
      <dl>
        {(
          [
            ['title', 'contractTitle'],
            ['serviceTitle', 'serviceTitle'],
            ['place', 'place'],
            ['providerDetails', 'providerDetails'],
            ['clientDetailsIntroduction', 'clientDetailsIntroduction'],
          ] as const
        ).map(([key, label]) => (
          <div key={key}>
            <dt>{copy(label)}</dt>
            <dd>{content[key]}</dd>
          </div>
        ))}
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
          <li className="contract-model-literal" key={index}>
            {entry.name} — {entry.edition}
          </li>
        ))}
      </ol>
      {sectionKeys.map((key) => (
        <div key={key}>
          <h4>{copy(key)}</h4>
          <p className="contract-model-literal">{content.sections[key]}</p>
        </div>
      ))}
      <dl>
        {(['provider', 'client', 'annexProvider', 'annexClient'] as const).map(
          (key) => (
            <div key={key}>
              <dt>{copy(signatureLabels[key])}</dt>
              <dd>{content.signatureAreas[key]}</dd>
            </div>
          ),
        )}
        <dt>{copy('annexTitle')}</dt>
        <dd>{content.annex.title}</dd>
        <dt>{copy('annexReference')}</dt>
        <dd>{content.annex.referenceWording}</dd>
      </dl>
      <h4>{copy('plannedStages')}</h4>
      <ol>
        {content.annex.activities.map((stage, index) => (
          <li className="contract-model-literal" key={index}>
            <h5 className="contract-model-literal">{stage.title}</h5>
            <p className="contract-model-literal">{stage.plannedActivity}</p>
            <p className="contract-model-literal">{stage.intendedResult}</p>
          </li>
        ))}
      </ol>
    </>
  );
}
