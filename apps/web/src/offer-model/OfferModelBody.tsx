import type { OfferModelContent } from './offer-model-content';
import { useOfferModelCopy } from './offer-model.copy';

export const sectionKeys = [
  'introduction',
  'providerProfile',
  'scope',
  'objectives',
  'assessmentGuidance',
  'methodology',
  'deliverables',
  'realizationConditions',
  'paymentConditions',
  'closingRationale',
] as const;

/** Shared literal approved-model body without configuration decisions or notes. */
export function OfferModelBody({ content }: { content: OfferModelContent }) {
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
      <h4>{copy('plannedStages')}</h4>
      <ol>
        {content.stages.map((stage, index) => (
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
