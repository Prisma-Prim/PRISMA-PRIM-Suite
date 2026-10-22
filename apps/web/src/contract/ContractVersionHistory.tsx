import { contractPath } from './contract-response';
import { useEffect, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import {
  createAuthenticatedApiClient,
  type ApiResult,
} from '../api/authenticated-api-client';
import type {
  ContractVersionDifference,
  ContractView,
} from './contract-response';
import { useContractVersionCopy } from './contract-version.copy';
import { useContractRecordedValues } from './contract-recorded-values';
type Item = { id: string; versionNumber: number };
type Page = { items: Item[]; nextCursor: string | null };
type State = { kind: 'ready'; page: Page } | { kind: 'loading' | 'error' };
export function ContractVersionHistory({
  identity,
  companyId,
  opportunityId,
  contract,
  locked,
  reject,
  onOpen,
}: {
  identity: BrowserIdentity;
  companyId: string;
  opportunityId: string;
  contract: ContractView;
  locked: boolean;
  reject: (
    result: ApiResult<unknown>,
    signal: AbortSignal,
  ) => Promise<'unauthorized' | 'forbidden' | undefined>;
  onOpen: (versionId: string) => void;
}) {
  const copy = useContractVersionCopy();
  const { formatNumber, formatDecimal, formatCalendarDate } =
    useContractRecordedValues();
  function displayDifference(
    field: ContractVersionDifference['field'],
    value: string | null,
  ): string {
    if (value === null) return copy('missing');
    return field === 'termStartsOn' || field === 'termEndsOn'
      ? formatCalendarDate(value)
      : value;
  }
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [loading, setLoading] = useState(false);
  const pending = useRef<AbortController | undefined>(undefined);
  async function load(cursor?: string) {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (controller.signal.aborted) return;
      const result = await api.request<unknown>(
        `${contractPath(opportunityId, contract)}/versions${cursor ? '?cursor=' + encodeURIComponent(cursor) : ''}`,
        { companyContextId: companyId, signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      const denied = await reject(result, controller.signal);
      if (controller.signal.aborted) return;
      if (denied || result.status !== 'ok')
        throw new Error('Unavailable versions.');
      const page = readPage(result.value);
      setState((current) => ({
        kind: 'ready',
        page: {
          ...page,
          items:
            cursor && current.kind === 'ready'
              ? [...current.page.items, ...page.items]
              : page.items,
        },
      }));
    } catch {
      if (!controller.signal.aborted) setState({ kind: 'error' });
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    return () => pending.current?.abort();
  }, [identity, companyId, opportunityId, contract.id, contract.revision]);
  return (
    <section aria-label={copy('history')}>
      <h5>{copy('history')}</h5>
      {state.kind === 'loading' && <p role="status">{copy('loading')}</p>}
      {state.kind === 'error' && <p role="alert">{copy('error')}</p>}
      {state.kind === 'ready' && (
        <>
          <ol>
            {state.page.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={
                    locked || loading || item.id === contract.version.id
                  }
                  onClick={() => onOpen(item.id)}
                >
                  {copy('version')} {formatNumber(item.versionNumber)}
                </button>
              </li>
            ))}
          </ol>
          {state.page.nextCursor && (
            <button
              type="button"
              disabled={locked || loading}
              onClick={() => void load(state.page.nextCursor ?? undefined)}
            >
              {copy('more')}
            </button>
          )}
        </>
      )}
      {contract.version.supersededByVersionId && <p>{copy('superseded')}</p>}
      {contract.version.predecessorVersionId && (
        <section aria-label={copy('differences')}>
          <h5>{copy('differences')}</h5>
          {contract.version.differences.length === 0 ? (
            <p>{copy('unchanged')}</p>
          ) : (
            <dl>
              {contract.version.differences.map((difference) => (
                <div key={difference.field}>
                  <dt>{copy(difference.field)}</dt>
                  <dd>
                    {copy('before')}:{' '}
                    {displayDifference(difference.field, difference.before)}
                    {difference.field === 'pricingSnapshotId' &&
                      difference.beforeSnapshot &&
                      ` · ${difference.beforeSnapshot.currency} · ${formatDecimal(difference.beforeSnapshot.total)}`}
                  </dd>
                  <dd>
                    {copy('after')}:{' '}
                    {displayDifference(difference.field, difference.after)}
                    {difference.field === 'pricingSnapshotId' &&
                      difference.afterSnapshot &&
                      ` · ${difference.afterSnapshot.currency} · ${formatDecimal(difference.afterSnapshot.total)}`}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      )}
    </section>
  );
}
function readPage(value: unknown): Page {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('items' in value) ||
    !Array.isArray(value.items) ||
    !('nextCursor' in value) ||
    (value.nextCursor !== null && typeof value.nextCursor !== 'string')
  )
    throw new Error('Invalid Contract Version page.');
  const items = value.items.map((item: unknown) => {
    if (
      typeof item !== 'object' ||
      item === null ||
      !('id' in item) ||
      typeof item.id !== 'string' ||
      !('versionNumber' in item) ||
      typeof item.versionNumber !== 'number' ||
      !Number.isSafeInteger(item.versionNumber) ||
      item.versionNumber < 1
    )
      throw new Error('Invalid Contract Version item.');
    return { id: item.id, versionNumber: item.versionNumber };
  });
  if (
    items.length > 50 ||
    new Set(items.map((item) => item.id)).size !== items.length ||
    items.some(
      (item, index) =>
        index > 0 &&
        (items[index - 1]?.versionNumber ?? 0) <= item.versionNumber,
    )
  )
    throw new Error('Invalid Contract Version ordering.');
  return { items, nextCursor: value.nextCursor };
}
