import { useId } from 'react';
import { useContractDecisionCopy } from './contract-decision.copy';
import { useContractQualityCopy } from './contract-quality.copy';
import { useModelContractCopy } from './model-contract.copy';
import type { ModelContractCheckCode } from './model-contract-quality-response';
import type { useModelContractJourney } from './use-model-contract-journey';

export function ModelContractChecks({
  journey,
}: {
  journey: ReturnType<typeof useModelContractJourney>;
}) {
  const copy = useModelContractCopy(),
    qualityCopy = useContractQualityCopy(),
    decisionCopy = useContractDecisionCopy(),
    id = useId();
  const { contract, quality, locked } = journey;
  if (!contract) return null;
  const current = contract.version.supersededByVersionId === null,
    pending = contract.version.decisionState === 'PENDING',
    mayDecide = current && pending && journey.mayApprove;
  function label(code: ModelContractCheckCode) {
    switch (code) {
      case 'ISSUER_MATCHES_SOURCE':
      case 'SERVICE_MATCHES_SOURCE':
      case 'FINANCIALS_MATCH_SOURCE':
      case 'CONDITIONS_MATCH_SOURCE':
      case 'SOURCE_OFFER_READY':
      case 'MODEL_APPROVAL_PRESERVED':
      case 'MODEL_WORDING_REVIEWED':
      case 'ANNEX_SCOPE_REVIEWED':
        return copy(code);
      default:
        return qualityCopy(code);
    }
  }
  return (
    <section aria-label={qualityCopy('title')}>
      <h5>{qualityCopy('title')}</h5>
      {journey.mayCheck && (
        <button
          type="button"
          disabled={locked || !current}
          onClick={() => void journey.check()}
        >
          {qualityCopy('run')}
        </button>
      )}
      {!quality && <p>{qualityCopy('empty')}</p>}
      {quality && (
        <>
          <p>
            {qualityCopy('evaluatedAt')}: {quality.evaluatedAt} ·{' '}
            {quality.actorWorkspaceMembershipId}
          </p>
          <ul>
            {quality.results.map((result) => (
              <li key={result.code}>
                {label(result.code)} — {qualityCopy(result.status)}
                {result.status === 'WARNING' && mayDecide && (
                  <label>
                    <input
                      type="checkbox"
                      disabled={locked}
                      checked={journey.acknowledgements.includes(result.code)}
                      onChange={(e) =>
                        journey.setAcknowledgements((current) =>
                          e.target.checked
                            ? [...current, result.code]
                            : current.filter((code) => code !== result.code),
                        )
                      }
                    />
                    {decisionCopy('acknowledge')}
                  </label>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {mayDecide && (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void journey.approve();
            }}
          >
            <fieldset disabled={locked}>
              <legend>{decisionCopy('approve')}</legend>
              <label htmlFor={id + 'basis'}>{copy('reviewBasis')}</label>
              <textarea
                id={id + 'basis'}
                required
                maxLength={2000}
                rows={3}
                value={journey.reviewBasis}
                onChange={(e) => journey.setReviewBasis(e.target.value)}
              />
              <button
                type="submit"
                disabled={
                  locked ||
                  !quality ||
                  quality.results.some((r) => r.status === 'ERROR') ||
                  !quality.results
                    .filter((r) => r.status === 'WARNING')
                    .every((r) => journey.acknowledgements.includes(r.code))
                }
              >
                {decisionCopy('approve')}
              </button>
            </fieldset>
          </form>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void journey.reject();
            }}
          >
            <fieldset disabled={locked}>
              <legend>{decisionCopy('reject')}</legend>
              <label htmlFor={id + 'reason'}>{copy('rejectReason')}</label>
              <textarea
                id={id + 'reason'}
                required
                maxLength={500}
                rows={2}
                value={journey.reason}
                onChange={(e) => journey.setReason(e.target.value)}
              />
              <button type="submit" disabled={locked}>
                {decisionCopy('reject')}
              </button>
            </fieldset>
          </form>
        </>
      )}
      {contract.version.decision && (
        <>
          <p>
            {decisionCopy(
              contract.version.decision.kind === 'APPROVE'
                ? 'approved'
                : 'rejected',
            )}{' '}
            · {contract.version.decision.actorWorkspaceMembershipId} ·{' '}
            {contract.version.decision.decidedAt}
          </p>
          <p className="contract-model-literal">
            {contract.version.decision.kind === 'APPROVE'
              ? contract.version.decision.reviewBasis
              : contract.version.decision.reason}
          </p>
        </>
      )}
    </section>
  );
}
