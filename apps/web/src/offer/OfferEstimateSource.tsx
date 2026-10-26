import { useEffect, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import {
  createAuthenticatedApiClient,
  type ApiResult,
} from '../api/authenticated-api-client';
import {
  parseEstimateVersion,
  profitabilityAuthority,
  profitabilityContextKey,
  type EstimateVersion,
} from '../profitability-estimate/profitability-contract';
import { ProfitabilityVersionDetail } from '../profitability-estimate/ProfitabilityVersionDetail';
import type { InternalOfferPriceSource } from './offer-response';
import { useEstimateOfferCopy } from './offer-estimate.copy';

type Props = {
  actor: ActorContext;
  identity: BrowserIdentity;
  opportunityId: string;
  source: Omit<InternalOfferPriceSource, 'taxTreatment'>;
  reject: (
    result: ApiResult<unknown>,
    signal: AbortSignal,
  ) => Promise<'unauthorized' | 'forbidden' | undefined>;
};
export function OfferEstimateSource(props: Props) {
  const generation = useRef({ identity: props.identity, value: 0 });
  if (generation.current.identity !== props.identity)
    generation.current = {
      identity: props.identity,
      value: generation.current.value + 1,
    };
  if (
    !profitabilityAuthority(props.actor).read ||
    !props.identity.loaded ||
    !props.identity.signedIn ||
    !props.actor.activeCompany
  )
    return null;
  return (
    <SourceOwner
      key={`${profitabilityContextKey(props.actor)}:${props.opportunityId}:${props.source.estimateVersionId}:${generation.current.value}`}
      {...props}
      companyId={props.actor.activeCompany.id}
    />
  );
}
function SourceOwner({
  actor,
  identity,
  opportunityId,
  source,
  reject,
  companyId,
}: Props & { companyId: string }) {
  const copy = useEstimateOfferCopy();
  const [state, setState] = useState<'idle' | 'loading' | 'unavailable'>(
    'idle',
  );
  const [version, setVersion] = useState<EstimateVersion>();
  const active = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => active.current?.abort(), []);
  async function open() {
    active.current?.abort();
    const request = new AbortController();
    active.current = request;
    setVersion(undefined);
    setState('loading');
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (request.signal.aborted) return;
      const result = await api.request<unknown>(
        `/opportunities/${encodeURIComponent(opportunityId)}/profitability-estimates/versions/${encodeURIComponent(source.estimateVersionId)}`,
        { companyContextId: companyId, signal: request.signal },
      );
      if (request.signal.aborted) return;
      const denied = await reject(result, request.signal);
      if (request.signal.aborted) return;
      if (denied || result.status !== 'ok') {
        setState('unavailable');
        return;
      }
      const selected = parseEstimateVersion(result.value, {
        workspaceId: actor.workspaceId,
        companyId,
        opportunityId,
      });
      if (
        selected.id !== source.estimateVersionId ||
        selected.versionNumber !== source.estimateVersionNumber ||
        selected.estimateId !== source.estimateId ||
        selected.decision?.code !== 'APPROVE' ||
        selected.decision.id !== source.approvalDecisionId
      )
        throw new Error('Unavailable exact source.');
      setVersion(selected);
      setState('idle');
    } catch {
      if (!request.signal.aborted) setState('unavailable');
    }
  }
  return (
    <section className="offer-estimate-source">
      <button
        type="button"
        disabled={state === 'loading'}
        onClick={() => void open()}
      >
        {copy('sourceDetails')}
      </button>
      {state === 'loading' && <p role="status">{copy('loading')}</p>}
      {state === 'unavailable' && <p role="alert">{copy('unavailable')}</p>}
      {version && (
        <>
          <button
            type="button"
            onClick={() => {
              active.current?.abort();
              setVersion(undefined);
            }}
          >
            {copy('hideDetails')}
          </button>
          <ProfitabilityVersionDetail
            version={version}
            disabled={false}
            mayCreate={false}
            mayDecide={false}
            onDecide={() => undefined}
            onCorrection={() => undefined}
          />
        </>
      )}
    </section>
  );
}
