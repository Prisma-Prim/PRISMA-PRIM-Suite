import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import {
  createAuthenticatedApiClient,
  type ApiResult,
} from '../api/authenticated-api-client';
import { handleAuthenticatedAccessRejection } from '../api/latest-authenticated-request';
import { useInterfaceLocale } from '../localization/interface-locale';
import { Select } from '../presentation/Select';
import { useOperationalRiskCopy } from './operational-risk.copy';
import {
  readRiskHistory,
  readRiskPage,
  readRiskRecord,
  readRiskResult,
} from './operational-risk.response';
import type {
  OperationalRiskEntry,
  OperationalRiskFacts,
  OperationalRiskPage,
  OperationalRiskRecord,
  OperationalRiskSummary,
} from './operational-risk.types';
import {
  commandFrom,
  draftFacts,
  emptyFacts,
  factFields,
  type Command,
  type Editor,
  type FactsDraft,
} from './operational-risk.editor';
import './operational-risk.css';

type Pending =
  | { kind: 'submitting'; command: Command }
  | { kind: 'uncertain'; command: Command };
type Notice =
  | 'recorded'
  | 'savedRefreshError'
  | 'invalid'
  | 'conflict'
  | 'notFound'
  | undefined;
type ConflictReview =
  { kind: 'record' } | { kind: 'head'; value: OperationalRiskRecord };
type Load<Value> =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; value: Value; more: 'idle' | 'loading' | 'error' };

export function canReadOperationalRisks(actor: ActorContext): boolean {
  const company = actor.activeCompany;
  return Boolean(
    company?.operationalRiskReaderAssignmentId &&
    company.operationalRiskReaderPermissionSetVersion === 'v1' &&
    company.operationalRiskPermissions?.includes('risk.read'),
  );
}

function canRecord(actor: ActorContext): boolean {
  const company = actor.activeCompany;
  return (
    canReadOperationalRisks(actor) &&
    Boolean(
      company?.operationalRiskRecorderAssignmentId &&
      company.operationalRiskRecorderPermissionSetVersion === 'v1' &&
      company.operationalRiskPermissions?.includes('risk.record'),
    )
  );
}

export function OperationalRiskWorkspace({
  actor,
  identity,
  onActorRevalidated,
  onCompanyContextRejected,
  onWorkspaceAccessRejected,
}: {
  actor: ActorContext;
  identity: BrowserIdentity;
  onActorRevalidated: (actor: ActorContext) => Promise<void> | void;
  onCompanyContextRejected: (companyId: string) => void;
  onWorkspaceAccessRejected: () => Promise<void> | void;
}) {
  const copy = useOperationalRiskCopy();
  const { formatDate, formatDateTime } = useInterfaceLocale();
  const id = useId();
  const companyId = actor.activeCompany?.id;
  const [list, setList] = useState<
    Load<OperationalRiskPage<OperationalRiskSummary>>
  >({ kind: 'loading' });
  const [selectedId, setSelectedId] = useState<string>();
  const [detail, setDetail] = useState<Load<OperationalRiskRecord>>({
    kind: 'loading',
  });
  const [history, setHistory] = useState<
    Load<OperationalRiskPage<OperationalRiskEntry>>
  >({ kind: 'loading' });
  const [editor, setEditor] = useState<Editor>();
  const [pending, setPending] = useState<Pending>();
  const [notice, setNotice] = useState<Notice>();
  const [review, setReview] = useState<ConflictReview>();
  const reviewSequence = useRef(0);
  const [denied, setDenied] = useState(false);
  const mounted = useRef(false);
  const selected = useRef<string | undefined>(undefined);
  const activeCommand = useRef<Command | undefined>(undefined);
  const listRequest = useRef<AbortController | undefined>(undefined);
  const detailRequest = useRef<AbortController | undefined>(undefined);
  const commandRequest = useRef<AbortController | undefined>(undefined);
  const rejection = useRef({
    actor,
    identity,
    onActorRevalidated,
    onCompanyContextRejected,
    onWorkspaceAccessRejected,
  });
  rejection.current = {
    actor,
    identity,
    onActorRevalidated,
    onCompanyContextRejected,
    onWorkspaceAccessRejected,
  };

  // App keys this workspace by session, Company and both captured assignments.
  // Locale changes only format labels: no effect retires drafts or commands.
  useEffect(() => {
    mounted.current = true;
    void loadList();
    return () => {
      mounted.current = false;
      listRequest.current?.abort();
      detailRequest.current?.abort();
      commandRequest.current?.abort();
    };
    // The scope is immutable for this keyed component.
  }, []);

  async function reject(
    result: ApiResult<unknown>,
    signal: AbortSignal,
  ): Promise<boolean> {
    // A transport may ignore abort. Old scope replies must never reach the
    // shared identity rejection path and sign out a now-current session.
    if (signal.aborted || !mounted.current) return true;
    if (result.status !== 'unauthorized' && result.status !== 'forbidden')
      return false;
    // Retire Risk content immediately, even if revalidation itself is offline.
    if (!signal.aborted && mounted.current) {
      setDenied(true);
      setEditor(undefined);
      setReview(undefined);
      reviewSequence.current++;
      activeCommand.current = undefined;
      setPending(undefined);
    }
    await handleAuthenticatedAccessRejection({
      result,
      identity: rejection.current.identity,
      companyContextId: companyId,
      signal,
      onCompanyContextRejected: rejection.current.onCompanyContextRejected,
      onActorRevalidated: rejection.current.onActorRevalidated,
      onWorkspaceAccessRejected: rejection.current.onWorkspaceAccessRejected,
    });
    return true;
  }

  async function loadList(cursor?: string): Promise<boolean> {
    if (!companyId) return false;
    listRequest.current?.abort();
    const request = new AbortController();
    listRequest.current = request;
    if (cursor)
      setList((previous) =>
        previous.kind === 'ready' ? { ...previous, more: 'loading' } : previous,
      );
    else setList({ kind: 'loading' });
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (request.signal.aborted || !mounted.current) return false;
      const result = await api.request<unknown>(
        `/operational-risks${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
        { companyContextId: companyId, signal: request.signal },
      );
      if (
        (await reject(result, request.signal)) ||
        request.signal.aborted ||
        !mounted.current
      )
        return false;
      if (result.status !== 'ok') throw new Error('Risk read failed.');
      const page = readRiskPage({ value: result.value, companyId });
      setList((previous) => ({
        kind: 'ready',
        more: 'idle',
        value: {
          ...page,
          items:
            cursor && previous.kind === 'ready'
              ? uniqueSummaries([...previous.value.items, ...page.items])
              : page.items,
        },
      }));
      return true;
    } catch {
      if (!request.signal.aborted && mounted.current)
        setList((previous) =>
          cursor && previous.kind === 'ready'
            ? { ...previous, more: 'error' }
            : { kind: 'error' },
        );
      return false;
    }
  }

  async function loadDetail(
    riskId: string,
  ): Promise<OperationalRiskRecord | undefined> {
    if (!companyId) return undefined;
    detailRequest.current?.abort();
    const request = new AbortController();
    detailRequest.current = request;
    selected.current = riskId;
    setSelectedId(riskId);
    setDetail({ kind: 'loading' });
    setHistory({ kind: 'loading' });
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (request.signal.aborted || !mounted.current) return undefined;
      const result = await api.request<unknown>(
        `/operational-risks/${encodeURIComponent(riskId)}`,
        { companyContextId: companyId, signal: request.signal },
      );
      if (
        (await reject(result, request.signal)) ||
        request.signal.aborted ||
        !mounted.current
      )
        return undefined;
      if (result.status === 'notFound') {
        setNotice((current) => (current === 'conflict' ? current : 'notFound'));
        setDetail({ kind: 'error' });
        return undefined;
      }
      if (result.status !== 'ok') throw new Error('Risk detail failed.');
      const value = readRiskRecord({ value: result.value, companyId, riskId });
      const entries = await api.request<unknown>(
        `/operational-risks/${encodeURIComponent(riskId)}/history`,
        { companyContextId: companyId, signal: request.signal },
      );
      if (
        (await reject(entries, request.signal)) ||
        request.signal.aborted ||
        !mounted.current
      )
        return undefined;
      setDetail({ kind: 'ready', value, more: 'idle' });
      if (entries.status !== 'ok') {
        setHistory({ kind: 'error' });
        return undefined;
      }
      const page = readRiskHistory(entries.value);
      if (page.items.some((entry) => entry.revision > value.revision))
        throw new Error('Risk changed during read.');
      setHistory({ kind: 'ready', value: page, more: 'idle' });
      return value;
    } catch {
      if (!request.signal.aborted && mounted.current) {
        setDetail({ kind: 'error' });
        setHistory({ kind: 'error' });
      }
      return undefined;
    }
  }

  async function loadOlder(): Promise<void> {
    if (
      !companyId ||
      !selectedId ||
      history.kind !== 'ready' ||
      !history.value.next_cursor
    )
      return;
    const riskId = selectedId;
    const cursor = history.value.next_cursor;
    detailRequest.current?.abort();
    const request = new AbortController();
    detailRequest.current = request;
    setHistory((previous) =>
      previous.kind === 'ready' ? { ...previous, more: 'loading' } : previous,
    );
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (request.signal.aborted || !mounted.current) return;
      const result = await api.request<unknown>(
        `/operational-risks/${encodeURIComponent(riskId)}/history?cursor=${encodeURIComponent(cursor)}`,
        { companyContextId: companyId, signal: request.signal },
      );
      if (
        (await reject(result, request.signal)) ||
        request.signal.aborted ||
        !mounted.current ||
        selected.current !== riskId
      )
        return;
      if (result.status !== 'ok') throw new Error('Risk history failed.');
      const page = readRiskHistory(result.value);
      if (page.items.some((entry) => entry.revision >= Number(cursor)))
        throw new Error('Invalid history continuation.');
      setHistory((previous) =>
        previous.kind === 'ready'
          ? {
              kind: 'ready',
              more: 'idle',
              value: {
                ...page,
                items: [...previous.value.items, ...page.items],
              },
            }
          : previous,
      );
    } catch {
      if (!request.signal.aborted && mounted.current)
        setHistory((previous) =>
          previous.kind === 'ready' ? { ...previous, more: 'error' } : previous,
        );
    }
  }

  async function execute(command: Command): Promise<void> {
    if (!companyId || commandRequest.current || denied) return;
    reviewSequence.current++;
    setReview(undefined);
    activeCommand.current = command;
    setPending({ kind: 'submitting', command });
    setNotice(undefined);
    const request = new AbortController();
    commandRequest.current = request;
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (request.signal.aborted || !mounted.current) return;
      const result = await api.request<unknown>(command.path, {
        method: 'POST',
        companyContextId: companyId,
        headers: {
          'content-type': 'application/json',
          'idempotency-key': command.key,
        },
        body: command.body,
        signal: request.signal,
      });
      if (
        (await reject(result, request.signal)) ||
        request.signal.aborted ||
        !mounted.current
      )
        return;
      if (result.status === 'ok') {
        // Malformed success is uncertain, never permission to make another key.
        const saved = readRiskResult({
          value: result.value,
          companyId,
          riskId: command.riskId,
        });
        setEditor(undefined);
        setNotice('recorded');
        const listLoaded = await loadList();
        if (request.signal.aborted || !mounted.current) return;
        const detailLoaded = await loadDetail(saved.risk.id);
        if (!request.signal.aborted && mounted.current) {
          activeCommand.current = undefined;
          setPending(undefined);
          setNotice(
            listLoaded && detailLoaded ? 'recorded' : 'savedRefreshError',
          );
        }
        return;
      }
      if (
        result.status === 'validation' ||
        result.status === 'conflict' ||
        result.status === 'notFound'
      ) {
        activeCommand.current = undefined;
        setPending(undefined);
        setNotice(
          result.status === 'validation'
            ? 'invalid'
            : result.status === 'conflict'
              ? 'conflict'
              : 'notFound',
        );
        return;
      }
      setPending({ kind: 'uncertain', command });
    } catch {
      if (!request.signal.aborted && mounted.current)
        setPending({ kind: 'uncertain', command });
    } finally {
      if (commandRequest.current === request)
        commandRequest.current = undefined;
    }
  }

  function submit(event: FormEvent): void {
    event.preventDefault();
    if (
      !editor ||
      activeCommand.current ||
      !canRecord(actor) ||
      denied ||
      notice === 'conflict'
    )
      return;
    const command = commandFrom(editor);
    if (!command) {
      setNotice('invalid');
      return;
    }
    void execute(command);
  }

  function start(next: Editor): void {
    if (activeCommand.current) return;
    reviewSequence.current++;
    setReview(undefined);
    setNotice(undefined);
    setEditor(next);
  }

  async function reload(): Promise<void> {
    const sequence = ++reviewSequence.current;
    setReview(undefined);
    const listLoaded = await loadList();
    if (!mounted.current || sequence !== reviewSequence.current) return;
    const latest = selectedId ? await loadDetail(selectedId) : undefined;
    if (
      !mounted.current ||
      sequence !== reviewSequence.current ||
      !listLoaded ||
      notice !== 'conflict' ||
      !editor
    )
      return;
    if (editor.kind === 'record') setReview({ kind: 'record' });
    else if (latest?.id === editor.riskId)
      setReview({ kind: 'head', value: latest });
  }

  function continueReviewed(): void {
    if (
      !editor ||
      notice !== 'conflict' ||
      !review ||
      activeCommand.current ||
      denied
    )
      return;
    if (editor.kind === 'record') {
      if (review.kind !== 'record') return;
    } else {
      if (review.kind !== 'head' || review.value.id !== editor.riskId) return;
      const latest = review.value;
      setEditor(
        editor.kind === 'journal'
          ? { ...editor, expectedRevision: latest.revision }
          : {
              ...editor,
              expectedRevision: latest.revision,
              predecessorId: latest.currentIntake.id,
            },
      );
    }
    reviewSequence.current++;
    setReview(undefined);
    setNotice(undefined);
  }

  if (!companyId || !canReadOperationalRisks(actor)) return null;
  const busy = pending !== undefined;
  const risk = detail.kind === 'ready' ? detail.value : undefined;
  const formatInstant = formatDateTime;
  const field = (name: keyof FactsDraft, maximum: number, required: boolean) =>
    editor && editor.kind !== 'journal' ? (
      <label key={name} htmlFor={`${id}-${name}`}>
        {copy(name)}
        {required && (
          <span className="risk-required"> · {copy('required')}</span>
        )}
        {name === 'plannedDate' ? (
          <input
            id={`${id}-${name}`}
            type="date"
            required={required}
            maxLength={maximum}
            value={editor.facts[name]}
            disabled={busy}
            onChange={(event) => {
              const value = event.target.value;
              setEditor((current) =>
                current && current.kind !== 'journal'
                  ? { ...current, facts: { ...current.facts, [name]: value } }
                  : current,
              );
            }}
          />
        ) : (
          <textarea
            id={`${id}-${name}`}
            required={required}
            maxLength={maximum}
            value={editor.facts[name]}
            disabled={busy}
            onChange={(event) => {
              const value = event.target.value;
              setEditor((current) =>
                current && current.kind !== 'journal'
                  ? { ...current, facts: { ...current.facts, [name]: value } }
                  : current,
              );
            }}
          />
        )}
      </label>
    ) : null;
  function factsView(facts: OperationalRiskFacts) {
    return (
      <dl className="risk-facts">
        {factFields.map((name) => (
          <div key={name}>
            <dt>{copy(name)}</dt>
            <dd>
              {facts[name] === null
                ? copy('unknown')
                : name === 'plannedDate'
                  ? formatDate(`${facts[name]}T00:00:00.000Z`)
                  : facts[name]}
            </dd>
          </div>
        ))}
      </dl>
    );
  }

  return (
    <section className="risk-workspace" aria-labelledby={`${id}-heading`}>
      <header className="risk-heading">
        <div>
          <p className="risk-eyebrow">{actor.activeCompany?.displayName}</p>
          <h2 id="operational-risks" tabIndex={-1}>
            <span id={`${id}-heading`}>{copy('title')}</span>
          </h2>
          <p>{copy('description')}</p>
        </div>
        {canRecord(actor) && !denied && (
          <button
            className="risk-primary"
            type="button"
            disabled={busy}
            onClick={() => start({ kind: 'record', facts: emptyFacts() })}
          >
            {copy('newIntake')}
          </button>
        )}
      </header>
      <p className="risk-scope-note">{copy('limits')}</p>
      {denied ? (
        <p role="alert">{copy('denied')}</p>
      ) : (
        <>
          {!canRecord(actor) && (
            <p className="risk-read-only">{copy('readOnly')}</p>
          )}
          {notice && (
            <p role={notice === 'recorded' ? 'status' : 'alert'}>
              {copy(notice)}
            </p>
          )}
          {pending && (
            <div className="risk-command-state" role="status">
              <p>
                {pending.kind === 'submitting'
                  ? copy('loading')
                  : copy('uncertain')}
              </p>
              {pending.kind === 'uncertain' && (
                <button
                  className="risk-primary"
                  type="button"
                  onClick={() => {
                    void execute(pending.command);
                  }}
                >
                  {copy('retryExact')}
                </button>
              )}
            </div>
          )}
          <div className="risk-columns">
            <section aria-label={copy('list')} className="risk-panel">
              <h3>{copy('list')}</h3>
              {list.kind === 'loading' ? (
                <p role="status">{copy('loading')}</p>
              ) : list.kind === 'error' ? (
                <p role="alert">{copy('loadError')}</p>
              ) : (
                <>
                  <ul className="risk-list">
                    {list.value.items.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          aria-pressed={selectedId === item.id}
                          disabled={busy || editor !== undefined}
                          onClick={() => {
                            setNotice(undefined);
                            void loadDetail(item.id);
                          }}
                        >
                          <strong>{item.process}</strong>
                          <span>{formatInstant(item.createdAt)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {list.value.items.length === 0 && <p>{copy('empty')}</p>}
                  {list.more === 'error' && (
                    <p role="alert">{copy('loadError')}</p>
                  )}
                  {list.value.next_cursor && (
                    <button
                      type="button"
                      disabled={busy || list.more === 'loading'}
                      onClick={() => {
                        void loadList(list.value.next_cursor ?? undefined);
                      }}
                    >
                      {list.more === 'loading' ? copy('loading') : copy('more')}
                    </button>
                  )}
                </>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void reload();
                }}
              >
                {copy('retryRead')}
              </button>
            </section>
            <div className="risk-main">
              {editor && (
                <form className="risk-panel risk-editor" onSubmit={submit}>
                  <h3>
                    {editor.kind === 'record'
                      ? copy('newIntake')
                      : editor.kind === 'correct'
                        ? copy('correct')
                        : copy('history')}
                  </h3>
                  {editor.kind === 'journal' ? (
                    <>
                      <label htmlFor={`${id}-kind`}>
                        {copy('kind')}
                        <Select
                          id={`${id}-kind`}
                          value={editor.entryKind}
                          options={[
                            {
                              value: 'observation',
                              label: copy('observation'),
                            },
                            {
                              value: 'reassessment',
                              label: copy('reassessment'),
                            },
                          ]}
                          disabled={busy}
                          onValueChange={(value) => {
                            if (
                              value === 'observation' ||
                              value === 'reassessment'
                            )
                              setEditor((current) =>
                                current?.kind === 'journal'
                                  ? { ...current, entryKind: value }
                                  : current,
                              );
                          }}
                        />
                      </label>
                      <label htmlFor={`${id}-narrative`}>
                        {copy('narrative')}
                        <textarea
                          id={`${id}-narrative`}
                          required
                          maxLength={5000}
                          disabled={busy}
                          value={editor.narrative}
                          onChange={(event) => {
                            const narrative = event.target.value;
                            setEditor((current) =>
                              current?.kind === 'journal'
                                ? { ...current, narrative }
                                : current,
                            );
                          }}
                        />
                      </label>
                      <label htmlFor={`${id}-occurredOn`}>
                        {copy('occurredOn')}
                        <input
                          type="date"
                          id={`${id}-occurredOn`}
                          disabled={busy}
                          value={editor.occurredOn}
                          onChange={(event) => {
                            const occurredOn = event.target.value;
                            setEditor((current) =>
                              current?.kind === 'journal'
                                ? { ...current, occurredOn }
                                : current,
                            );
                          }}
                        />
                      </label>
                    </>
                  ) : (
                    <>
                      {field('process', 300, true)}
                      {field('cause', 2000, true)}
                      {field('effect', 2000, true)}
                      {field('plannedMeasure', 2000, true)}
                      {field('existingMeasures', 2000, false)}
                      {field('sourceDescription', 300, false)}
                      {field('plannedDate', 10, false)}
                      {editor.kind === 'correct' && (
                        <label htmlFor={`${id}-reason`}>
                          {copy('reason')}
                          <textarea
                            id={`${id}-reason`}
                            required
                            maxLength={2000}
                            disabled={busy}
                            value={editor.reason}
                            onChange={(event) => {
                              const reason = event.target.value;
                              setEditor((current) =>
                                current?.kind === 'correct'
                                  ? { ...current, reason }
                                  : current,
                              );
                            }}
                          />
                        </label>
                      )}
                    </>
                  )}
                  {notice === 'conflict' && review && (
                    <div className="risk-command-state" role="status">
                      <p>{copy('reviewDraft')}</p>
                      <button
                        className="risk-primary"
                        type="button"
                        onClick={continueReviewed}
                      >
                        {copy('continueReviewed')}
                      </button>
                    </div>
                  )}
                  <div className="risk-actions">
                    <button
                      className="risk-primary"
                      type="submit"
                      disabled={busy || notice === 'conflict'}
                    >
                      {copy('save')}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        reviewSequence.current++;
                        setReview(undefined);
                        setEditor(undefined);
                        setNotice(undefined);
                      }}
                    >
                      {copy('cancel')}
                    </button>
                  </div>
                </form>
              )}
              {selectedId && (
                <section className="risk-panel" aria-label={copy('current')}>
                  {detail.kind === 'loading' ? (
                    <p role="status">{copy('loading')}</p>
                  ) : !risk ? (
                    <p role="alert">{copy('loadError')}</p>
                  ) : (
                    <>
                      <div className="risk-detail-heading">
                        <h3>{risk.currentIntake.facts.process}</h3>
                        <span className="risk-revision">
                          {copy('revision')} {risk.revision}
                        </span>
                      </div>
                      <p className="risk-truth">{copy('notAssessed')}</p>
                      <p>{copy('notResponsible')}</p>
                      <h4>{copy('current')}</h4>
                      {factsView(risk.currentIntake.facts)}
                      {risk.currentIntake.kind === 'intake-corrected' && (
                        <p className="risk-literal">
                          <strong>{copy('reason')}: </strong>
                          {risk.currentIntake.reason}
                        </p>
                      )}
                      {canRecord(actor) && !editor && (
                        <div className="risk-actions">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              start({
                                kind: 'correct',
                                riskId: risk.id,
                                expectedRevision: risk.revision,
                                predecessorId: risk.currentIntake.id,
                                facts: draftFacts(risk.currentIntake.facts),
                                reason: '',
                              })
                            }
                          >
                            {copy('correct')}
                          </button>
                          <button
                            className="risk-primary"
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              start({
                                kind: 'journal',
                                riskId: risk.id,
                                expectedRevision: risk.revision,
                                entryKind: 'observation',
                                narrative: '',
                                occurredOn: '',
                              })
                            }
                          >
                            {copy('observation')} / {copy('reassessment')}
                          </button>
                        </div>
                      )}
                      <details>
                        <summary>{copy('original')}</summary>
                        {factsView(risk.originalIntake.facts)}
                      </details>
                      <h4>{copy('history')}</h4>
                      {history.kind === 'loading' ? (
                        <p role="status">{copy('loading')}</p>
                      ) : history.kind === 'error' ? (
                        <p role="alert">{copy('loadError')}</p>
                      ) : (
                        <>
                          <ol className="risk-history">
                            {history.value.items.map((entry) => (
                              <li key={entry.id}>
                                <div className="risk-detail-heading">
                                  <strong>{copy(entry.kind)}</strong>
                                  <span>
                                    {copy('revision')} {entry.revision}
                                  </span>
                                </div>
                                <p>
                                  {copy('author')}:{' '}
                                  <strong>{entry.actor.displayName}</strong> ·{' '}
                                  {formatInstant(entry.recordedAt)}
                                </p>
                                {entry.kind === 'observation' ||
                                entry.kind === 'reassessment' ? (
                                  <>
                                    <p className="risk-literal">
                                      {entry.narrative}
                                    </p>
                                    <p>
                                      {copy('occurredOn')}:{' '}
                                      {entry.occurredOn === null
                                        ? copy('unknown')
                                        : formatDate(
                                            `${entry.occurredOn}T00:00:00.000Z`,
                                          )}
                                    </p>
                                  </>
                                ) : (
                                  <>
                                    {factsView(entry.facts)}
                                    {entry.kind === 'intake-corrected' && (
                                      <>
                                        <p className="risk-literal">
                                          {copy('reason')}: {entry.reason}
                                        </p>
                                        <p>
                                          {copy('predecessor')}:{' '}
                                          <code>{entry.predecessorId}</code>
                                        </p>
                                      </>
                                    )}
                                  </>
                                )}
                              </li>
                            ))}
                          </ol>
                          {history.more === 'error' && (
                            <p role="alert">{copy('loadError')}</p>
                          )}
                          {history.value.next_cursor && (
                            <button
                              type="button"
                              disabled={busy || history.more === 'loading'}
                              onClick={() => {
                                void loadOlder();
                              }}
                            >
                              {history.more === 'loading'
                                ? copy('loading')
                                : copy('more')}
                            </button>
                          )}
                        </>
                      )}
                    </>
                  )}
                </section>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function uniqueSummaries(
  items: OperationalRiskSummary[],
): OperationalRiskSummary[] {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}
