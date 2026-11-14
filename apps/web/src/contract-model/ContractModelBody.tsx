import type { ContractModelContent } from './contract-model-content';
import { useContractModelCopy } from './contract-model.copy';

export const sectionKeys = [
  'subject',
  'executionTerm',
  'rightsAndObligations',
  'confidentiality',
  'priceAndPayment',
  'liability',
  'termination',
  'finalProvisions',
  'partiesAndSignatures',
] as const;
export const signatureLabels = {
  provider: 'signatureProvider',
  client: 'signatureClient',
  annexProvider: 'signatureAnnexProvider',
  annexClient: 'signatureAnnexClient',
} as const;

/** Shared literal approved-model body without configuration decisions or notes. */
export function ContractModelBody({
  content,
}: {
  content: ContractModelContent;
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
          <li className="company-model-literal" key={index}>
            {entry.name} — {entry.edition}
          </li>
        ))}
      </ol>
      {sectionKeys.map((key) => (
        <div key={key}>
          <h4>{copy(key)}</h4>
          <p className="company-model-literal">{content.sections[key]}</p>
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
          <li className="company-model-literal" key={index}>
            <h5 className="company-model-literal">{stage.title}</h5>
            <p className="company-model-literal">{stage.plannedActivity}</p>
            <p className="company-model-literal">{stage.intendedResult}</p>
          </li>
        ))}
      </ol>
    </>
  );
}
