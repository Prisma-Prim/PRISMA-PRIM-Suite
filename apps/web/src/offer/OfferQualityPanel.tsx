import { useEffect, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import {
  createAuthenticatedApiClient,
  conflictCode,
  type ApiResult,
} from '../api/authenticated-api-client';
import { formatApplicationDateTime } from '../presentation/date-time';
import {
  readOfferQualityRun,
  offerQualityLabels,
  type OfferQualityRunView,
} from './offer-response';
import { offerQualityCopy as copy } from './offer.copy';

type CommandState =
  | 'idle'
  | 'running'
  | 'uncertain'
  | 'denied'
  | 'unavailable'
  | 'superseded'
  | 'conflict'
  | 'invalid';
export function OfferQualityPanel({
  identity,
  companyId,
  opportunityId,
  offerVersionId,
  initialRun,
  mayRun,
  reject,
  onRun,
}: {
  identity: BrowserIdentity;
  companyId: string;
  opportunityId: string;
  offerVersionId: string;
  initialRun: OfferQualityRunView | null;
  mayRun: boolean;
  onRun?: (run: OfferQualityRunView) => void;
  reject: (
    result: ApiResult<unknown>,
    signal: AbortSignal,
  ) => Promise<'unauthorized' | 'forbidden' | undefined>;
}) {
  const [run, setRun] = useState(initialRun);
  const [state, setState] = useState<CommandState>('idle');
  const pending = useRef<AbortController | undefined>(undefined);
  const attempt = useRef<{ body: string; key: string } | undefined>(undefined);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => setRun(initialRun), [initialRun]);
  async function execute() {
    if (!mayRun || state === 'running') return;
    const command = attempt.current ?? { body: '{}', key: crypto.randomUUID() };
    attempt.current = command;
    pending.current?.abort();
    const request = new AbortController();
    pending.current = request;
    setState('running');
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (request.signal.aborted) return;
      const result = await api.request<unknown>(
        `/offers/opportunities/${encodeURIComponent(opportunityId)}/versions/${encodeURIComponent(offerVersionId)}/quality-checks`,
        {
          method: 'POST',
          companyContextId: companyId,
          headers: {
            'content-type': 'application/json',
            'idempotency-key': command.key,
          },
          body: command.body,
          signal: request.signal,
        },
      );
      if (request.signal.aborted) return;
      const denied = await reject(result, request.signal);
      if (request.signal.aborted) return;
      if (denied) {
        attempt.current = undefined;
        setRun(null);
        setState('denied');
      } else if (result.status === 'ok') {
        const recorded = readOfferQualityRun(result.value, offerVersionId);
        setRun(recorded);
        onRun?.(recorded);
        attempt.current = undefined;
        setState('idle');
      } else if (result.status === 'notFound') {
        attempt.current = undefined;
        setRun(null);
        setState('unavailable');
      } else if (result.status === 'conflict') {
        attempt.current = undefined;
        setState(
          conflictCode(result) === 'OFFER_VERSION_SUPERSEDED'
            ? 'superseded'
            : 'conflict',
        );
      } else if (result.status === 'validation') {
        attempt.current = undefined;
        setState('invalid');
      } else setState('uncertain');
    } catch {
      if (!request.signal.aborted) setState('uncertain');
    }
  }
  const outcome = run?.results.some((result) => result.status === 'ERROR')
    ? 'errors'
    : run?.results.some((result) => result.status === 'WARNING')
      ? 'warnings'
      : 'success';
  return (
    <section className="offer-quality" aria-labelledby="offer-quality-title">
      <h5 id="offer-quality-title">{copy.title}</h5>
      {!run && state === 'idle' && <p>{copy.empty}</p>}
      {state !== 'idle' && (
        <p role={state === 'running' ? 'status' : 'alert'}>{copy[state]}</p>
      )}
      {run && (
        <>
          <p role="status">{copy[outcome]}</p>
          <dl>
            <div>
              <dt>{copy.evaluatedAt}</dt>
              <dd>{formatApplicationDateTime(run.evaluatedAt)}</dd>
            </div>
            <div>
              <dt>{copy.actor}</dt>
              <dd>
                <code>{run.actorWorkspaceMembershipId}</code>
              </dd>
            </div>
            <div>
              <dt>{copy.ruleSet}</dt>
              <dd>
                {run.ruleSet} v{run.ruleSetVersion}
              </dd>
            </div>
          </dl>
          <ul>
            {run.results.map((result) => (
              <li key={result.code}>
                <span>{offerQualityLabels[result.code]}</span>
                <strong>{result.status}</strong>
              </li>
            ))}
          </ul>
        </>
      )}
      {mayRun &&
        state !== 'denied' &&
        state !== 'unavailable' &&
        state !== 'superseded' && (
          <button
            type="button"
            disabled={state === 'running'}
            onClick={() => void execute()}
          >
            {state === 'uncertain'
              ? copy.retry
              : state === 'running'
                ? copy.running
                : copy.run}
          </button>
        )}
    </section>
  );
}
