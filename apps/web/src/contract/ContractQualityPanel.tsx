import { useEffect, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import {
  createAuthenticatedApiClient,
  conflictCode,
  type ApiResult,
} from '../api/authenticated-api-client';
import {
  contractQualityCopy as copy,
  contractQualityLabels,
} from './contract.copy';
import {
  readContractQualityRun,
  readContractQualityHistory,
  type ContractQualityRunView,
} from './contract-quality-response';
type State =
  | 'idle'
  | 'running'
  | 'uncertain'
  | 'denied'
  | 'unavailable'
  | 'superseded'
  | 'conflict'
  | 'invalid'
  | 'error'
  | 'loading';
export function ContractQualityPanel({
  identity,
  companyId,
  opportunityId,
  versionId,
  termEndsOn,
  initialRun,
  mayRun,
  reject,
  onProtectionChange,
}: {
  identity: BrowserIdentity;
  companyId: string;
  opportunityId: string;
  versionId: string;
  termEndsOn: string | null;
  initialRun: ContractQualityRunView | null;
  mayRun: boolean;
  onProtectionChange: (protectedCommand: boolean) => void;
  reject: (
    result: ApiResult<unknown>,
    signal: AbortSignal,
  ) => Promise<'unauthorized' | 'forbidden' | undefined>;
}) {
  const [run, setRun] = useState(initialRun);
  const [history, setHistory] = useState<{
    items: ContractQualityRunView[];
    nextCursor: string | null;
  } | null>(null);
  const [state, setState] = useState<State>('idle');
  const pending = useRef<AbortController | undefined>(undefined);
  const attempt = useRef<{ body: string; key: string } | undefined>(undefined);
  useEffect(() => {
    onProtectionChange(state === 'running' || state === 'uncertain');
  }, [state, onProtectionChange]);
  useEffect(
    () => () => {
      pending.current?.abort();
      onProtectionChange(false);
    },
    [onProtectionChange],
  );
  const base = `/contracts/opportunities/${encodeURIComponent(opportunityId)}/versions/${encodeURIComponent(versionId)}/quality-checks`;
  async function execute(
    action:
      | { kind: 'run' }
      | { kind: 'history'; cursor: string | null }
      | { kind: 'reopen'; id: string },
  ) {
    if (
      state === 'running' ||
      state === 'loading' ||
      (state === 'uncertain' && action.kind !== 'run')
    )
      return;
    if (action.kind === 'run' && !mayRun) return;
    const command =
      action.kind === 'run'
        ? (attempt.current ?? { body: '{}', key: crypto.randomUUID() })
        : null;
    if (command) attempt.current = command;
    pending.current?.abort();
    const request = new AbortController();
    pending.current = request;
    setState(action.kind === 'run' ? 'running' : 'loading');
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (request.signal.aborted) return;
      const path =
        action.kind === 'history' && action.cursor
          ? base + '?cursor=' + encodeURIComponent(action.cursor)
          : action.kind === 'reopen'
            ? base + '/' + encodeURIComponent(action.id)
            : base;
      const result = await api.request<unknown>(path, {
        companyContextId: companyId,
        signal: request.signal,
        ...(command
          ? {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                'idempotency-key': command.key,
              },
              body: command.body,
            }
          : {}),
      });
      if (request.signal.aborted) return;
      const denied = await reject(result, request.signal);
      if (request.signal.aborted) return;
      if (denied) {
        attempt.current = undefined;
        setRun(null);
        setHistory(null);
        setState('denied');
      } else if (result.status === 'ok') {
        if (action.kind === 'history')
          setHistory(
            readContractQualityHistory(result.value, versionId, termEndsOn),
          );
        else {
          const recorded = readContractQualityRun(
            result.value,
            versionId,
            termEndsOn,
          );
          if (action.kind === 'reopen' && recorded.id !== action.id)
            throw new Error('Mismatched Contract run.');
          setRun(recorded);
        }
        attempt.current = undefined;
        setState('idle');
      } else if (result.status === 'notFound') {
        attempt.current = undefined;
        setRun(null);
        setHistory(null);
        setState('unavailable');
      } else if (result.status === 'conflict') {
        attempt.current = undefined;
        setRun(null);
        setHistory(null);
        setState(
          conflictCode(result) === 'CONTRACT_VERSION_SUPERSEDED'
            ? 'superseded'
            : 'conflict',
        );
      } else if (result.status === 'validation') {
        attempt.current = undefined;
        setState('invalid');
      } else setState(command ? 'uncertain' : 'error');
    } catch {
      if (!request.signal.aborted) {
        setRun(null);
        setHistory(null);
        setState(command ? 'uncertain' : 'error');
      }
    }
  }
  const busy =
    state === 'running' || state === 'loading' || state === 'uncertain';
  const denied =
    state === 'denied' || state === 'unavailable' || state === 'superseded';
  const outcome = run?.results.some((item) => item.status === 'ERROR')
    ? 'errors'
    : run?.results.some((item) => item.status === 'WARNING')
      ? 'warnings'
      : 'success';
  return (
    <section className="contract-quality" aria-label={copy.title}>
      <h5>{copy.title}</h5>
      {!run && state === 'idle' && <p>{copy.empty}</p>}
      {state !== 'idle' && (
        <p
          role={state === 'running' || state === 'loading' ? 'status' : 'alert'}
        >
          {copy[state]}
        </p>
      )}
      {run && (
        <>
          <p role="status">{copy[outcome]}</p>
          <dl>
            <dt>{copy.version}</dt>
            <dd>
              <code>{run.contractVersionId}</code>
            </dd>
            <dt>{copy.ruleSet}</dt>
            <dd>
              {run.ruleSet} v{run.ruleSetVersion}
            </dd>
            <dt>{copy.evaluatedAt}</dt>
            <dd>
              <time dateTime={run.evaluatedAt}>{run.evaluatedAt}</time>
            </dd>
            <dt>{copy.actor}</dt>
            <dd>
              <code>{run.actorWorkspaceMembershipId}</code>
            </dd>
          </dl>
          <ul>
            {run.results.map((item) => (
              <li key={item.code}>
                <span>{contractQualityLabels[item.code]}</span>{' '}
                <strong>{item.status}</strong>
              </li>
            ))}
          </ul>
        </>
      )}
      {mayRun && !denied && (
        <button
          type="button"
          disabled={state === 'running' || state === 'loading'}
          onClick={() => void execute({ kind: 'run' })}
        >
          {state === 'uncertain'
            ? copy.retry
            : state === 'running'
              ? copy.running
              : copy.run}
        </button>
      )}
      {!denied && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void execute({ kind: 'history', cursor: null })}
        >
          {copy.history}
        </button>
      )}
      {history && (
        <>
          <ul>
            {history.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void execute({ kind: 'reopen', id: item.id })}
                >
                  {copy.reopen} · {item.evaluatedAt}
                </button>
              </li>
            ))}
          </ul>
          {history.nextCursor && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void execute({ kind: 'history', cursor: history.nextCursor })
              }
            >
              {copy.next}
            </button>
          )}
        </>
      )}
    </section>
  );
}
