import { useEstimateOfferCopy } from './offer-estimate.copy';
import { useEffect, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import type { handleAuthenticatedAccessRejection } from '../api/latest-authenticated-request';
import { useOfferVersionCopy } from './offer-preparation.copy';
import { useOfferPresentation } from './offer-presentation';
import {
  readOfferDetail,
  readOfferVersionPage,
  type OfferReadView,
  type OfferVersionPage,
  type OfferDifferenceView,
} from './offer-response';

export function OfferVersionHistory({
  identity,
  companyId,
  opportunityId,
  offer,
  reject,
  onSelect,
}: {
  identity: BrowserIdentity;
  companyId: string;
  opportunityId: string;
  offer: OfferReadView;
  reject: (
    result: Parameters<typeof handleAuthenticatedAccessRejection>[0]['result'],
    signal: AbortSignal,
  ) => ReturnType<typeof handleAuthenticatedAccessRejection>;
  onSelect: (offer: OfferReadView) => void;
}) {
  const copy = useOfferVersionCopy();
  const estimate = useEstimateOfferCopy();
  const { formatDateTime, formatDecimal } = useOfferPresentation();
  const [page, setPage] = useState<OfferVersionPage>({
    versions: [],
    nextCursor: null,
  });
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const active = useRef<AbortController | undefined>(undefined);
  const base = `/offers/opportunities/${encodeURIComponent(opportunityId)}`;
  async function load(cursor?: string) {
    active.current?.abort();
    const request = new AbortController();
    active.current = request;
    setState('loading');
    try {
      const api = await createAuthenticatedApiClient(identity);
      const result = await api.request<unknown>(
        `${base}/versions${cursor ? '?cursor=' + encodeURIComponent(cursor) : ''}`,
        { companyContextId: companyId, signal: request.signal },
      );
      if (request.signal.aborted) return;
      if ((await reject(result, request.signal)) || result.status !== 'ok') {
        setState('error');
        return;
      }
      const next = readOfferVersionPage(result.value);
      setPage((previous) => ({
        versions: cursor
          ? [...previous.versions, ...next.versions]
          : next.versions,
        nextCursor: next.nextCursor,
      }));
      setState('ready');
    } catch {
      if (!request.signal.aborted) setState('error');
    }
  }
  useEffect(() => {
    void load();
    return () => active.current?.abort();
  }, [identity, companyId, opportunityId, offer.id, offer.version.id, reject]);
  async function open(id: string) {
    active.current?.abort();
    const request = new AbortController();
    active.current = request;
    setState('loading');
    try {
      const api = await createAuthenticatedApiClient(identity);
      const result = await api.request<unknown>(
        `${base}/versions/${encodeURIComponent(id)}`,
        { companyContextId: companyId, signal: request.signal },
      );
      if (request.signal.aborted) return;
      if ((await reject(result, request.signal)) || result.status !== 'ok') {
        setState('error');
        return;
      }
      const selected = readOfferDetail(result.value);
      if (!selected || selected.id !== offer.id || selected.version.id !== id)
        throw new Error('Invalid selected Offer Version.');
      onSelect(selected);
    } catch {
      if (!request.signal.aborted) setState('error');
    }
  }
  function differenceValue(
    field: OfferDifferenceView['field'],
    value: string | number | null,
  ): string {
    if (value === null) return copy.absent;
    if (value === '') return copy.emptyText;
    switch (field) {
      case 'amount':
      case 'estimateVersionNumber':
      case 'total':
      case 'validityDays':
        return formatDecimal(String(value));
      case 'validUntil':
        return typeof value === 'string' && Number.isFinite(Date.parse(value))
          ? formatDateTime(value)
          : String(value);
      case 'priceSourceKind':
        return value === 'DIRECTOR_APPROVED_ESTIMATE'
          ? estimate('sourceType')
          : value === 'ILLUSTRATIVE_SNAPSHOT'
            ? copy.fields.pricingSnapshotId
            : copy.absent;
      case 'estimateVersionId':
      case 'approvalDecisionId':
      case 'recipientKind':
      case 'recipientAdditionalLegalEntityId':
      case 'recipientLegalName':
      case 'recipientTaxId':
      case 'recipientLegalAddress':
      case 'pricingSnapshotId':
      case 'currency':
      case 'scopeNote':
      case 'commercialConditions':
        return String(value);
      default: {
        const exhaustive: never = field;
        return exhaustive;
      }
    }
  }
  return (
    <div className="offer-version-history">
      <h5>{copy.title}</h5>
      <p>
        {offer.version.supersededByVersionId
          ? copy.historical
          : copy.currentHead}
      </p>
      {state === 'loading' && <p role="status">{copy.loading}</p>}
      {state === 'error' && (
        <>
          <p role="alert">{copy.unavailable}</p>
          <button type="button" onClick={() => void load()}>
            {copy.title}
          </button>
        </>
      )}
      {state === 'ready' && page.versions.length === 0 && <p>{copy.empty}</p>}
      <ul>
        {page.versions.map((version) => (
          <li key={version.id}>
            <button
              type="button"
              disabled={state === 'loading' || version.id === offer.version.id}
              onClick={() => void open(version.id)}
            >
              {copy.open(version.versionNumber)}
            </button>{' '}
            <span>{formatDateTime(version.createdAt)}</span>
          </li>
        ))}
      </ul>
      {page.nextCursor && (
        <button
          type="button"
          disabled={state === 'loading'}
          onClick={() => void load(page.nextCursor ?? undefined)}
        >
          {copy.more}
        </button>
      )}
      <h5>{copy.differences}</h5>
      {offer.version.predecessorVersionId === null ? (
        <p>{copy.noPredecessor}</p>
      ) : (
        <>
          {offer.version.differences.every((field) => !field.changed) && (
            <p>{copy.noDifferences}</p>
          )}
          <dl>
            {offer.version.differences.map((field) => (
              <div key={field.field}>
                <dt>
                  {copy.fields[field.field]} ·{' '}
                  {field.changed ? copy.changed : copy.unchanged}
                </dt>
                <dd>
                  {copy.previous}:{' '}
                  {differenceValue(field.field, field.previous)}
                </dd>
                <dd>
                  {copy.current}: {differenceValue(field.field, field.current)}
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </div>
  );
}
