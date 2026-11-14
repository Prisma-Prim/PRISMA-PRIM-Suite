import {
  useCommercialPdfDisplayed,
  type CommercialPdfCallbacks,
} from '../commercial-pdf/CommercialPdfDownload';
import { useEffect, useRef, useState } from 'react';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import { handleAuthenticatedAccessRejection } from '../api/latest-authenticated-request';
import {
  IllustrativeContractPanel,
  type ContractPanelProps,
} from './IllustrativeContractPanel';
import { ModelContractPanel } from './ModelContractPanel';
import {
  readModelContract,
  type ModelContractView,
} from './model-contract-response';
import { useContractCopy } from './contract.copy';
import { grantOf, holds } from '../access/company-grants';
import { holdsContractRead, holdsOfferRead } from './contract-grants';
import './contract.css';

/** A session/scope/captured-authority change retires the whole command owner. */
type PdfContractPanelProps = ContractPanelProps & {
  pdf?: CommercialPdfCallbacks;
};
export function ContractPanel(props: PdfContractPanelProps) {
  const generation = useRef({ identity: props.identity, value: 0 });
  if (generation.current.identity !== props.identity)
    generation.current = {
      identity: props.identity,
      value: generation.current.value + 1,
    };
  const c = props.actor.activeCompany;
  const illustrativeKey = JSON.stringify([
    generation.current.value,
    props.actor.active,
    props.actor.workspaceId,
    props.actor.internalUserId,
    props.actor.workspaceMembershipId,
    props.actor.workspacePermissions.includes('client.manage'),
    c?.id,
    props.currentClientId,
    props.opportunityId,
    props.requestedVersion,
    grantOf(c, 'company_contract_preparer'),
    grantOf(c, 'company_contract_approver'),
    grantOf(c, 'company_contract_early_preparation')?.permissions,
    grantOf(c, 'company_commercial_intake'),
    grantOf(c, 'company_offer_preparer'),
    grantOf(c, 'company_offer_approver'),
    grantOf(c, 'company_director_client_access'),
  ]);
  const key = JSON.stringify([
    generation.current.value,
    props.actor.active,
    props.actor.workspaceId,
    props.actor.internalUserId,
    props.actor.workspaceMembershipId,
    c?.id,
    props.opportunityId,
    props.requestedVersion,
    holdsContractRead(c),
    holds(c, 'company_commercial_intake', 'commercial.opportunity.read'),
    holds(c, 'company_director_client_access', 'client.read') ||
      props.actor.workspacePermissions.includes('client.manage'),
  ]);
  return (
    <ContractJourneyOwner
      key={key}
      {...props}
      illustrativeKey={illustrativeKey}
    />
  );
}
type Route =
  | { kind: 'loading' | 'error' | 'denied' }
  | {
      kind: 'illustrative';
      initialRead: { contract: unknown; offer?: unknown };
    }
  | { kind: 'model'; contract: ModelContractView | null; offer?: unknown };
function ContractJourneyOwner(
  props: PdfContractPanelProps & { illustrativeKey: string },
) {
  const copy = useContractCopy(),
    [route, setRoute] = useState<Route>({ kind: 'loading' }),
    [reload, setReload] = useState(0);
  // The child model reader owns ready selections; this entry reader publishes absence only.
  useCommercialPdfDisplayed(
    route.kind === 'model' ? undefined : null,
    props.pdf?.select,
  );
  const company = props.actor.activeCompany,
    companyId = company?.id;
  const mayRead =
    props.actor.active &&
    holdsContractRead(company) &&
    holds(company, 'company_commercial_intake', 'commercial.opportunity.read');
  const requested = props.requestedVersion;
  const path = `/contracts/opportunities/${encodeURIComponent(props.opportunityId)}${requested && requested.kind !== 'CONTRACT' ? '/agreements/' + encodeURIComponent(requested.contractId) : ''}${requested ? '/versions/' + encodeURIComponent(requested.contractVersionId) : ''}`;
  useEffect(() => {
    if (!companyId || !mayRead) return;
    setRoute({ kind: 'loading' });
    const controller = new AbortController(),
      { signal } = controller;
    void (async () => {
      try {
        const api = await createAuthenticatedApiClient(props.identity);
        if (signal.aborted) return;
        const result = await api.request(path, {
          companyContextId: companyId,
          signal,
        });
        if (signal.aborted) return;
        if (
          await handleAuthenticatedAccessRejection({
            result,
            identity: props.identity,
            companyContextId: companyId,
            onCompanyContextRejected: props.onCompanyContextRejected,
            onActorRevalidated: props.onActorRevalidated ?? ignore,
            onWorkspaceAccessRejected:
              props.onWorkspaceAccessRejected ?? ignore,
            signal,
          })
        ) {
          if (!signal.aborted) setRoute({ kind: 'denied' });
          return;
        }
        if (signal.aborted) return;
        if (result.status !== 'ok') throw new Error('Unavailable Contract');
        const body = record(result.value),
          contract = body.contract;
        if (contract !== null) {
          const mode = record(contract);
          if (mode.origin === 'COMPANY_MODEL_OFFER') {
            const read = readModelContract(contract);
            if (
              read.companyId !== companyId ||
              read.opportunityId !== props.opportunityId ||
              (requested &&
                (read.id !== requested.contractId ||
                  read.version.id !== requested.contractVersionId))
            )
              throw new Error('Mismatched Contract');
            setRoute({ kind: 'model', contract: read });
          } else
            setRoute({
              kind: 'illustrative',
              initialRead: { contract: result.value },
            });
          return;
        }
        if (holdsOfferRead(company) && !requested) {
          const source = await api.request(
            `/offers/opportunities/${encodeURIComponent(props.opportunityId)}`,
            { companyContextId: companyId, signal },
          );
          if (signal.aborted) return;
          if (
            await handleAuthenticatedAccessRejection({
              result: source,
              identity: props.identity,
              companyContextId: companyId,
              onCompanyContextRejected: props.onCompanyContextRejected,
              onActorRevalidated: props.onActorRevalidated ?? ignore,
              onWorkspaceAccessRejected:
                props.onWorkspaceAccessRejected ?? ignore,
              signal,
            })
          ) {
            if (!signal.aborted) setRoute({ kind: 'denied' });
            return;
          }
          if (signal.aborted) return;
          if (source.status !== 'ok') throw new Error('Unavailable source');
          const offer = record(source.value).offer;
          if (
            offer !== null &&
            record(record(offer).version).provenance ===
              'COMPANY_MODEL_ESTIMATE'
          )
            setRoute({ kind: 'model', contract: null, offer: source.value });
          else
            setRoute({
              kind: 'illustrative',
              initialRead: { contract: result.value, offer: source.value },
            });
        } else
          setRoute({
            kind: 'illustrative',
            initialRead: { contract: result.value },
          });
      } catch {
        if (!signal.aborted) setRoute({ kind: 'error' });
      }
    })();
    return () => controller.abort();
  }, [props.identity, props.opportunityId, companyId, mayRead, path, reload]);
  if (!mayRead) return null;
  if (route.kind === 'illustrative')
    return (
      <IllustrativeContractPanel
        key={props.illustrativeKey}
        {...props}
        initialRead={route.initialRead}
      />
    );
  if (route.kind === 'model')
    return (
      <ModelContractPanel
        {...props}
        initialContract={route.contract}
        initialOffer={route.offer}
      />
    );
  return (
    <section className="contract-panel" aria-label={copy('title')}>
      <h4>{copy('title')}</h4>
      <p className="contract-banner">{copy('banner')}</p>
      <p role={route.kind === 'loading' ? 'status' : 'alert'}>
        {copy(
          route.kind === 'loading'
            ? 'loading'
            : route.kind === 'denied'
              ? 'denied'
              : 'error',
        )}
      </p>
      <button
        type="button"
        disabled={route.kind === 'loading'}
        onClick={() => setReload((current) => current + 1)}
      >
        {copy('refresh')}
      </button>
    </section>
  );
}
function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Invalid Contract response.');
  return Object.fromEntries(Object.entries(value));
}
function ignore() {}
