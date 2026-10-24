import { useEffect, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import { runLatestAuthenticatedRequest } from '../api/latest-authenticated-request';
import { formatMessage } from '../localization/messages';
import { useInterfaceLocale } from '../localization/interface-locale';
import {
  readExactModelVersion,
  readModelHistory,
  type OfferModel,
  type OfferModelHistory as History,
  type OfferModelVersion,
} from './offer-model-response';
import { OfferModelVersionContent } from './OfferModelVersionContent';
import { useOfferModelCopy } from './offer-model.copy';
import type { ApiResult } from '../api/authenticated-api-client';

type Read<T> =
  | { kind: 'closed' | 'loading' | 'error' | 'unavailable' }
  | { kind: 'ready'; value: T };
export function OfferModelHistory({
  identity,
  model,
  blocked,
  epoch,
  onDenied,
}: {
  identity: BrowserIdentity;
  model: OfferModel;
  blocked: boolean;
  epoch: { current: number };
  onDenied: (result: ApiResult<unknown>) => void;
}) {
  const copy = useOfferModelCopy();
  const { formatNumber } = useInterfaceLocale();
  const [history, setHistory] = useState<Read<History>>({ kind: 'closed' });
  const [exact, setExact] = useState<Read<OfferModelVersion>>({
    kind: 'closed',
  });
  const historyPending = useRef<AbortController | undefined>(undefined);
  const exactPending = useRef<AbortController | undefined>(undefined);
  const denied = useRef(onDenied);
  denied.current = onDenied;
  useEffect(() => {
    if (blocked) {
      historyPending.current?.abort();
      exactPending.current?.abort();
      setHistory({ kind: 'closed' });
      setExact({ kind: 'closed' });
    }
    return () => {
      historyPending.current?.abort();
      exactPending.current?.abort();
    };
  }, [identity, blocked]);
  function load({
    path,
    versionId,
    append,
  }: {
    path: string;
    versionId: string | null;
    append: History | null;
  }) {
    if (blocked) return;
    const captured = epoch.current;
    const pending = versionId ? exactPending : historyPending;
    if (versionId) setExact({ kind: 'loading' });
    else setHistory({ kind: 'loading' });
    void runLatestAuthenticatedRequest({
      pending,
      identity,
      execute: (api, signal) =>
        api.request<unknown>(path, {
          companyContextId: model.companyId,
          signal,
        }),
      onResult: (result) => {
        if (captured !== epoch.current) return;
        if (result.status === 'unauthorized' || result.status === 'forbidden') {
          denied.current(result);
          return;
        }
        try {
          if (result.status !== 'ok') throw new Error('Unavailable history.');
          if (versionId) {
            const value = readExactModelVersion(result.value).version;
            if (value.id !== versionId)
              throw new Error('Unexpected historical version.');
            setExact({ kind: 'ready', value });
          } else {
            const value = readModelHistory(result.value);
            if (
              value.versions.some(
                (row) => row.versionNumber > model.head.versionNumber,
              ) ||
              (append &&
                value.versions.some(
                  (row) =>
                    row.versionNumber >=
                    (append.versions.at(-1)?.versionNumber ?? 0),
                ))
            )
              throw new Error('Unexpected history order.');
            setHistory({
              kind: 'ready',
              value: {
                versions: [...(append?.versions ?? []), ...value.versions],
                nextCursor: value.nextCursor,
              },
            });
          }
        } catch {
          if (versionId)
            setExact({
              kind: result.status === 'notFound' ? 'unavailable' : 'error',
            });
          else setHistory({ kind: 'error' });
        }
      },
      onError: () => {
        if (captured !== epoch.current) return;
        if (versionId) setExact({ kind: 'error' });
        else setHistory({ kind: 'error' });
      },
    });
  }
  return (
    <section className="offer-model-history">
      <button
        type="button"
        disabled={blocked || history.kind === 'loading'}
        onClick={() =>
          load({
            path: '/offer-models/consulting-ro/versions',
            versionId: null,
            append: null,
          })
        }
      >
        {copy('history')}
      </button>
      {history.kind === 'loading' && <p role="status">{copy('loading')}</p>}
      {history.kind === 'error' && <p role="alert">{copy('error')}</p>}
      {history.kind === 'ready' && (
        <>
          <ol>
            {history.value.versions.map((row) => (
              <li className="offer-model-literal" key={row.id}>
                <button
                  type="button"
                  disabled={blocked || exact.kind === 'loading'}
                  onClick={() =>
                    load({
                      path: `/offer-models/consulting-ro/versions/${row.id}`,
                      versionId: row.id,
                      append: null,
                    })
                  }
                >
                  {formatMessage(copy('openVersion'), {
                    number: formatNumber(row.versionNumber),
                  })}
                </button>{' '}
                — {row.serviceTitle} · {copy(row.sourceKind)} ·{' '}
                {row.actor.displayName}
              </li>
            ))}
          </ol>
          {history.value.nextCursor && (
            <button
              type="button"
              disabled={blocked}
              onClick={() => {
                if (history.kind === 'ready' && history.value.nextCursor)
                  load({
                    path: `/offer-models/consulting-ro/versions?cursor=${encodeURIComponent(history.value.nextCursor)}`,
                    versionId: null,
                    append: history.value,
                  });
              }}
            >
              {copy('more')}
            </button>
          )}
        </>
      )}
      {exact.kind === 'loading' && <p role="status">{copy('loading')}</p>}
      {(exact.kind === 'error' || exact.kind === 'unavailable') && (
        <p role="alert">{copy(exact.kind)}</p>
      )}
      {exact.kind === 'ready' && (
        <>
          <p>{copy('historical')}</p>
          <OfferModelVersionContent version={exact.value} />
          <button
            type="button"
            disabled={blocked}
            onClick={() => setExact({ kind: 'closed' })}
          >
            {copy('closeVersion')}
          </button>
        </>
      )}
    </section>
  );
}
