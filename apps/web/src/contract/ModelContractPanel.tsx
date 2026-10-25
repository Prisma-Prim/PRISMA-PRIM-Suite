import { ContractModelBody } from '../contract-model/ContractModelVersionContent';
import { useContractCopy } from './contract.copy';
import { useContractDecisionCopy } from './contract-decision.copy';
import { useContractVersionCopy } from './contract-version.copy';
import { useModelOfferCopy } from '../offer/model-offer.copy';
import { useModelContractCopy } from './model-contract.copy';
import { ModelContractForm } from './ModelContractForm';
import { ModelContractDetails } from './ModelContractDetails';
import { ModelContractChecks } from './ModelContractChecks';
import {
  useModelContractJourney,
  type ModelContractJourneyProps,
} from './use-model-contract-journey';

export function ModelContractPanel(props: ModelContractJourneyProps) {
  const journey = useModelContractJourney(props),
    copy = useModelContractCopy(),
    common = useContractCopy(),
    decision = useContractDecisionCopy(),
    versions = useContractVersionCopy(),
    financial = useModelOfferCopy();
  const { contract, locked } = journey;
  const differenceLabel = (field: string) => {
    switch (field) {
      case 'documentDate':
      case 'clientDetails':
        return copy(field);
      case 'sourceConcordanceBasis':
        return copy('basis');
      case 'sourceOfferVersionId':
        return copy('chooseOffer');
      case 'modelVersionId':
      case 'modelApprovalDecisionId':
        return copy('chooseModel');
      case 'netAmount':
        return financial('net');
      case 'taxAmount':
        return financial('tax');
      case 'grossAmount':
        return financial('gross');
      case 'taxLabel':
        return financial('taxLabel');
      case 'currency':
        return copy('currency');
      case 'recipientLegalName':
      case 'recipientTaxId':
      case 'recipientLegalAddress':
      case 'termStartsOn':
      case 'termEndsOn':
      case 'specialConditions':
      case 'scopeNote':
      case 'commercialConditions':
        return versions(field);
      default:
        throw new Error('Unrecognized Contract difference');
    }
  };
  return (
    <section
      className="contract-panel model-contract-panel"
      aria-label={copy('title')}
    >
      <h4>{copy('title')}</h4>
      <p className="contract-banner">{copy('notice')}</p>
      <p>{copy('pendingAcceptance')}</p>
      {journey.confirmed && <p role="status">{copy(journey.confirmed)}</p>}
      {journey.running && <p role="status">{common('running')}</p>}
      {journey.readState === 'loading' && (
        <p role="status">{common('loading')}</p>
      )}
      {journey.readState === 'error' && (
        <p role="alert">{copy('refreshFailed')}</p>
      )}
      {journey.feedback && <p role="alert">{common(journey.feedback)}</p>}
      {journey.feedback === 'uncertain' && (
        <button
          type="button"
          disabled={journey.running}
          onClick={journey.retry}
        >
          {common('retry')}
        </button>
      )}
      {contract && (
        <>
          <p>
            {decision(
              contract.version.decisionState === 'APPROVED'
                ? 'approved'
                : contract.version.decisionState === 'REJECTED'
                  ? 'rejected'
                  : 'pending',
            )}{' '}
            · {common('execution')}
          </p>
          <ModelContractDetails
            key={contract.version.id}
            contract={contract}
            locked={locked}
          />
          <ModelContractChecks journey={journey} />
          {journey.mayPrepare && (
            <button
              type="button"
              disabled={locked}
              onClick={() => void journey.startSuccessor()}
            >
              {copy('copy')}
            </button>
          )}
          <section aria-label={versions('history')}>
            <h5>{versions('history')}</h5>
            <button
              type="button"
              disabled={locked || journey.readState === 'loading'}
              onClick={() => void journey.loadHistory()}
            >
              {versions('history')}
            </button>
            {journey.history && (
              <>
                <ol>
                  {journey.history.items.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        disabled={
                          locked ||
                          journey.readState === 'loading' ||
                          item.id === contract.version.id
                        }
                        onClick={() => void journey.openVersion(item.id)}
                      >
                        {versions('version')} {item.versionNumber}
                      </button>
                    </li>
                  ))}
                </ol>
                {journey.history.nextCursor && (
                  <button
                    type="button"
                    disabled={locked || journey.readState === 'loading'}
                    onClick={() =>
                      void journey.loadHistory(
                        journey.history?.nextCursor ?? undefined,
                      )
                    }
                  >
                    {versions('more')}
                  </button>
                )}
              </>
            )}
          </section>
          <h5>{versions('differences')}</h5>
          {contract.version.differences.length ? (
            <dl>
              {contract.version.differences.map((d) => (
                <div key={d.field}>
                  <dt>{differenceLabel(d.field)}</dt>
                  <dd>
                    {versions('before')}: {d.before ?? common('missing')}
                    <br />
                    {versions('after')}: {d.after ?? common('missing')}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p>{versions('unchanged')}</p>
          )}
          <button
            type="button"
            disabled={locked}
            onClick={() => void journey.reload()}
          >
            {common('refresh')}
          </button>
        </>
      )}
      {journey.mode !== 'view' &&
        (journey.mayPrepare ? (
          <>
            <ModelContractForm journey={journey} />
            {journey.sources.model &&
              journey.draft.modelVersionId ===
                journey.sources.model.versionId && (
                <ContractModelBody content={journey.sources.model.content} />
              )}
          </>
        ) : (
          <p>{copy('newPermissions')}</p>
        ))}
    </section>
  );
}
