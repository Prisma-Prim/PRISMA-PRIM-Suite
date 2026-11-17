import { useEffect, useId, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import {
  createAuthenticatedApiClient,
  type ApiRequest,
  type ApiResult,
} from '../api/authenticated-api-client';
import { useScopedOperationGroup } from '../api/use-scoped-operation';
import { Select } from '../presentation/Select';
import { connection, job, record, string } from './harness-response';
import { useHarnessCopy } from './harness-copy';

interface Props {
  identity: BrowserIdentity;
  companyId: string;
  projectId: string;
  runId: string;
  scope: string;
  stale: boolean;
  onDenied: (result: ApiResult<unknown>) => void;
  onImported: () => Promise<void>;
}
type Command = { path: string; body: unknown; key: string };
export function DossierHarnessPanel(props: Props) {
  const c = useHarnessCopy(),
    id = useId();
  const base =
    '/projects/' +
    encodeURIComponent(props.projectId) +
    '/dossier-analysis/harness';
  const reads = useScopedOperationGroup(props.scope),
    writes = useScopedOperationGroup(props.scope);
  const [account, setAccount] = useState<ReturnType<typeof connection> | null>(
    null,
  );
  const [current, setCurrent] = useState<ReturnType<typeof job> | null>(null);
  const [reviews, setReviews] = useState<ReturnType<typeof job>[]>([]);
  const [model, setModel] = useState(''),
    [language, setLanguage] = useState('ro');
  const [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [executing, setExecuting] = useState(false);
  const [error, setError] = useState(false),
    [message, setMessage] = useState('');
  const [retry, setRetry] = useState<Command | null>(null);
  const generation = useRef(0),
    active = useRef(false);
  const popup = useRef<{ window: Window; state: string } | null>(null);
  async function request(path: string, init: ApiRequest, group: typeof reads) {
    const op = group.beginLatest();
    if (!op) return undefined;
    try {
      const client = await createAuthenticatedApiClient(props.identity);
      if (op.signal.aborted) return undefined;
      const result = await client.request(path, {
        ...init,
        signal: op.signal,
        cache: 'no-store',
        companyContextId: props.companyId,
      });
      if (op.signal.aborted || !group.isLive()) return undefined;
      if (
        result.status === 'unauthorized' ||
        result.status === 'forbidden' ||
        result.status === 'notFound'
      ) {
        props.onDenied(result);
        return undefined;
      }
      if (result.status !== 'ok') throw new Error('Harness operation failed');
      return result.value;
    } finally {
      op.release();
    }
  }
  function applyParsedJob(parsed: ReturnType<typeof job>) {
    if (parsed.runId !== props.runId) throw new Error('Wrong review');
    setCurrent(parsed);
    setReviews((previous) =>
      [parsed, ...previous.filter((r) => r.id !== parsed.id)].slice(0, 10),
    );
    if (parsed.state !== 'queued') setExecuting(false);
    return parsed;
  }
  const applyJob = (value: unknown) => applyParsedJob(job(value));
  async function load() {
    const epoch = generation.current;
    try {
      const value = await request(base, {}, reads);
      if (value === undefined || epoch !== generation.current) return;
      const parsed = connection(value);
      setAccount(parsed);
      setModel((previous) =>
        parsed.models.some((m) => m.id === previous)
          ? previous
          : (parsed.models[0]?.id ?? ''),
      );
      const value2 = await request(
        base + '/jobs?runId=' + encodeURIComponent(props.runId),
        {},
        reads,
      );
      if (value2 === undefined || epoch !== generation.current) return;
      const list = record(value2);
      if (!Array.isArray(list.items) || list.items.length > 10)
        throw new Error('Invalid reviews');
      const available = list.items.map(job);
      if (available.some((r) => r.runId !== props.runId))
        throw new Error('Wrong review scope');
      setReviews(available);
      const selected =
        available.find((r) => r.id === current?.id) ?? available[0];
      if (selected) applyParsedJob(selected);
      else setCurrent(null);
    } catch {
      if (epoch === generation.current && reads.isLive()) {
        setExecuting(false);
        setError(true);
      }
    }
  }
  async function command(cmd: Command, force = false) {
    if (active.current && !force) return;
    const epoch = ++generation.current;
    active.current = true;
    setBusy(true);
    setError(false);
    setMessage('');
    setRetry(null);
    try {
      const value = await request(
        cmd.path,
        {
          method: 'POST',
          body: JSON.stringify(cmd.body),
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': cmd.key,
          },
        },
        writes,
      );
      if (value === undefined || epoch !== generation.current) return;
      if (cmd.path.endsWith('/connect/complete')) {
        const parsed = connection(value);
        setAccount(parsed);
        setModel(parsed.models[0]?.id ?? '');
      } else if (cmd.path.endsWith('/disconnect')) {
        setAccount({ state: 'disconnected', account: null, models: [] });
        setExecuting(false);
        if (record(value).remoteRevoked !== true) setMessage(c.remoteUnknown);
      } else if (cmd.path.endsWith('/import')) {
        setMessage(c.imported);
        await props.onImported();
      } else {
        const next = applyJob(value);
        if (
          cmd.path === base + '/jobs' ||
          (cmd.path.endsWith('/control') &&
            record(cmd.body).action === 'resume')
        )
          setExecuting(next.state === 'queued');
        if (cmd.path === base + '/jobs') setConsent(false);
      }
    } catch {
      if (epoch === generation.current && writes.isLive()) {
        setError(true);
        setExecuting(false);
        if (
          !cmd.path.endsWith('/advance') &&
          !cmd.path.endsWith('/connect/complete')
        )
          setRetry(cmd);
      }
    } finally {
      if (epoch === generation.current) {
        active.current = false;
        setBusy(false);
      }
    }
  }
  const post = (path: string, body: unknown, force = false) =>
    command({ path, body, key: crypto.randomUUID() }, force);
  async function connect() {
    if (active.current) return;
    const child = window.open(
      '',
      'prisma-chatgpt-' + crypto.randomUUID(),
      'popup,width=560,height=760',
    );
    if (!child) {
      setMessage(c.popup);
      return;
    }
    const epoch = ++generation.current;
    active.current = true;
    setBusy(true);
    setError(false);
    try {
      const value = await request(
        base + '/connect',
        {
          method: 'POST',
          body: '{}',
          headers: { 'Content-Type': 'application/json' },
        },
        writes,
      );
      if (value === undefined || epoch !== generation.current) {
        child.close();
        return;
      }
      const result = record(value),
        url = new URL(string(result.authorizationUrl)),
        state = string(result.state);
      if (
        url.origin !== 'https://auth.openai.com' ||
        url.username ||
        url.password ||
        url.hash ||
        url.searchParams.get('state') !== state
      )
        throw new Error('Invalid sign-in target');
      popup.current?.window.close();
      popup.current = { window: child, state };
      child.location.href = url.href;
    } catch {
      child.close();
      if (epoch === generation.current && writes.isLive()) setError(true);
    } finally {
      if (epoch === generation.current) {
        active.current = false;
        setBusy(false);
      }
    }
  }
  useEffect(() => {
    void load();
    const receive = (event: MessageEvent<unknown>) => {
      const pending = popup.current;
      if (
        !pending ||
        event.origin !== window.location.origin ||
        event.source !== pending.window ||
        !writes.isLive()
      )
        return;
      try {
        const data = record(event.data);
        if (
          data.type !== 'prisma-chatgpt-callback' ||
          data.state !== pending.state
        )
          return;
        popup.current = null;
        if (data.error || typeof data.code !== 'string') {
          setError(true);
          return;
        }
        pending.window.postMessage(
          { type: 'prisma-chatgpt-received', state: pending.state },
          window.location.origin,
        );
        void post(base + '/connect/complete', {
          state: pending.state,
          code: data.code,
        });
      } catch {
        setError(true);
      }
    };
    window.addEventListener('message', receive);
    return () => {
      generation.current++;
      popup.current?.window.close();
      popup.current = null;
      window.removeEventListener('message', receive);
    };
  }, [props.scope]);
  useEffect(() => {
    if (
      !executing ||
      busy ||
      props.stale ||
      current?.stale ||
      current?.state !== 'queued'
    )
      return;
    const timer = setTimeout(
      () =>
        void post(
          base + '/jobs/' + encodeURIComponent(current.id) + '/advance',
          {},
        ),
      250,
    );
    return () => clearTimeout(timer);
  }, [executing, busy, current, props.stale]);
  const control = (action: string) => {
    setExecuting(false);
    if (current)
      void post(
        base + '/jobs/' + encodeURIComponent(current.id) + '/control',
        { action },
        true,
      );
  };
  return (
    <section className="dossier-harness" aria-labelledby={id + '-title'}>
      <h4 id={id + '-title'}>{c.title}</h4>
      {error && <p role="alert">{c.error}</p>}
      {message && <p role="status">{message}</p>}
      {retry && (
        <button disabled={busy} onClick={() => void command(retry)}>
          {c.retry}
        </button>
      )}
      {account?.state === 'configuration_required' ? (
        <p>{c.unavailable}</p>
      ) : (
        <>
          {account?.account && (
            <p>
              {c.account}: {account.account}
            </p>
          )}
          {account?.state === 'disconnected' && (
            <button disabled={busy} onClick={() => void connect()}>
              {c.connect}
            </button>
          )}
          {account?.state === 'connected' && (
            <>
              <button
                onClick={() => {
                  setExecuting(false);
                  void post(base + '/disconnect', {}, true);
                }}
              >
                {c.disconnect}
              </button>
              <a
                href="https://chatgpt.com/settings/usage"
                target="_blank"
                rel="noopener noreferrer"
              >
                {c.usage}
              </a>
              <fieldset disabled={busy || props.stale}>
                <label htmlFor={id + '-model'}>
                  {c.model}
                  <Select
                    id={id + '-model'}
                    value={model}
                    options={account.models.map((m) => ({
                      value: m.id,
                      label: m.label,
                    }))}
                    onValueChange={setModel}
                  />
                </label>
                <label htmlFor={id + '-language'}>
                  {c.language}
                  <Select
                    id={id + '-language'}
                    value={language}
                    options={[
                      { value: 'ro', label: 'Română' },
                      { value: 'ru', label: 'Русский' },
                      { value: 'fr', label: 'Français' },
                      { value: 'en', label: 'English' },
                    ]}
                    onValueChange={setLanguage}
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  {c.disclosure}
                </label>
                <button
                  disabled={!consent || !model}
                  onClick={() =>
                    void post(base + '/jobs', {
                      runId: props.runId,
                      model,
                      language,
                    })
                  }
                >
                  {c.start}
                </button>
              </fieldset>
            </>
          )}
        </>
      )}
      {(props.stale || current?.stale) && <p role="status">{c.stale}</p>}
      {current && (
        <>
          {reviews.length > 1 && (
            <label htmlFor={id + '-review'}>
              {c.reviews}
              <Select
                id={id + '-review'}
                disabled={busy || executing}
                value={current.id}
                options={reviews.map((r, i) => ({
                  value: r.id,
                  label:
                    String(i + 1) +
                    ' · ' +
                    c[r.state] +
                    ' · ' +
                    r.nextBatch +
                    '/' +
                    r.totalBatches,
                }))}
                onValueChange={(value) => {
                  const selected = reviews.find((r) => r.id === value);
                  if (selected) {
                    setExecuting(false);
                    setCurrent(selected);
                  }
                }}
              />
            </label>
          )}
          {current.imported && <p role="status">{c.imported}</p>}
          <p role="status">{c[current.state]}</p>
          <p>
            {c.progress}: {current.nextBatch}/{current.totalBatches} · {c.cache}
            : {current.cacheHits}
          </p>
          <progress
            aria-label={c.progress}
            value={current.nextBatch}
            max={Math.max(1, current.totalBatches)}
          />
          <p>
            {c.coverage}: {current.readableUnits}/{current.totalUnits}
          </p>
          {current.incompleteSources > 0 && <p>{c.partial}</p>}
          <p>{c.background}</p>
          {['queued', 'running'].includes(current.state) && (
            <button onClick={() => control('pause')}>{c.pause}</button>
          )}
          {(![
            'queued',
            'running',
            'pausing',
            'cancelled',
            'completed',
          ].includes(current.state) ||
            (current.state === 'queued' && !executing)) && (
            <button
              disabled={
                busy ||
                current.stale ||
                props.stale ||
                account?.state !== 'connected'
              }
              onClick={() => control('resume')}
            >
              {c.resume}
            </button>
          )}
          {!['completed', 'cancelled'].includes(current.state) && (
            <button onClick={() => control('cancel')}>{c.cancel}</button>
          )}
          <button disabled={busy} onClick={() => void load()}>
            {c.refresh}
          </button>
          {current.state === 'reauth' && (
            <button disabled={busy} onClick={() => void connect()}>
              {c.connect}
            </button>
          )}
          {current.proposals.length ? (
            <>
              <h5>{c.proposals}</h5>
              <ol>
                {current.proposals.map((p, i) => (
                  <li key={i}>
                    <p>{p.value}</p>
                    <p>{p.rationale}</p>
                    {p.citations.map((ref, j) => (
                      <blockquote key={j}>
                        <p>{ref.quote}</p>
                        <cite>{ref.locator}</cite>
                      </blockquote>
                    ))}
                  </li>
                ))}
              </ol>
              {current.state === 'completed' &&
                !current.stale &&
                !current.imported && (
                  <button
                    disabled={busy || props.stale}
                    onClick={() =>
                      void post(
                        base +
                          '/jobs/' +
                          encodeURIComponent(current.id) +
                          '/import',
                        {},
                      )
                    }
                  >
                    {c.import}
                  </button>
                )}
            </>
          ) : (
            current.state === 'completed' && <p>{c.none}</p>
          )}
        </>
      )}
    </section>
  );
}
