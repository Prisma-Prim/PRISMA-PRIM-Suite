import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import {
  createAuthenticatedApiClient,
  conflictCode,
  type ApiResult,
} from '../api/authenticated-api-client';
import { handleAuthenticatedAccessRejection } from '../api/latest-authenticated-request';
import { useInterfaceLocale } from '../localization/interface-locale';
import { useOperationalRiskCopy } from './operational-risk.copy';
import {
  readRiskHistory,
  readRiskPage,
  readRiskRecord,
  readRiskResult,
} from './operational-risk.response';
import type {
  OperationalRiskEntry,
  OperationalRiskPage,
  OperationalRiskRecord,
  OperationalRiskSummary,
} from './operational-risk.types';
import {
  commandFrom,
  draftFacts,
  emptyFacts,
  type Command,
  type Editor,
} from './operational-risk.editor';
import { useRiskJournalStatement } from './use-risk-journal-statement';
import { OperationalRiskJournalStatement } from './OperationalRiskJournalStatement';
import type {
  OperationalRiskJournalStatement as JournalStatement,
  OperationalRiskJournalCorrection,
} from './operational-risk.types';
import { OperationalRiskEditor } from './OperationalRiskEditor';
import { OperationalRiskFactsView } from './OperationalRiskFactsView';
import { OperationalRiskHistory } from './OperationalRiskHistory';
import './operational-risk.css';

type Pending =
  | { kind: 'submitting'; command: Command }
  | { kind: 'uncertain'; command: Command };
type Notice =
  | 'recorded'
  | 'savedRefreshError'
  | 'invalid'
  | 'conflict'
  | 'idempotencyConflict'
  | 'notFound'
  | undefined;
type ConflictReview =
  | { kind: 'record' }
  | { kind: 'head'; value: OperationalRiskRecord }
  | { kind: 'journal'; value: JournalStatement };
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
  const { formatDateTime } = useInterfaceLocale();
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
  const [confirmedJournal, setConfirmedJournal] =
    useState<OperationalRiskJournalCorrection>();
  const [denied, setDenied] = useState(false);
  const mounted = useRef(false);
  const retired = useRef(false);
  const selected = useRef<string | undefined>(undefined);
  const knownRevision = useRef(0);
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

  const journal = useRiskJournalStatement({
    identity,
    companyId,
    riskId: selectedId,
    reject,
    onUnavailable(root) {
      setEditor((current) =>
        current?.kind === 'journal-correct' && current.originalEntry.id === root
          ? undefined
          : current,
      );
      setNotice((current) =>
        current === 'savedRefreshError' ? current : 'notFound',
      );
    },
    onRead(value) {
      observeRevision(value.riskId, value.revision);
    },
  });

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
    if (signal.aborted || !mounted.current || retired.current) return true;
    if (result.status !== 'unauthorized' && result.status !== 'forbidden')
      return false;
    // Retire Risk content immediately, even if revalidation itself is offline.
    if (!signal.aborted && mounted.current) {
      retired.current = true;
      setDenied(true);
      for (const request of [
        listRequest.current,
        detailRequest.current,
        commandRequest.current,
      ])
        if (request?.signal !== signal) request?.abort();
      setList({ kind: 'loading' });
      setDetail({ kind: 'loading' });
      setHistory({ kind: 'loading' });
      selected.current = undefined;
      knownRevision.current = 0;
      setSelectedId(undefined);
      setEditor(undefined);
      journal.clear(signal);
      setConfirmedJournal(undefined);
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

  function observeRevision(riskId: string, revision: number): void {
    if (selected.current === riskId)
      knownRevision.current = Math.max(knownRevision.current, revision);
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
      for (const item of page.items) observeRevision(item.id, item.revision);
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
    if (selected.current !== riskId) {
      knownRevision.current =
        list.kind === 'ready'
          ? (list.value.items.find((item) => item.id === riskId)?.revision ?? 0)
          : 0;
      journal.clear();
      setConfirmedJournal(undefined);
    }
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
        setNotice((current) =>
          isConflictNotice(current) ? current : 'notFound',
        );
        setDetail({ kind: 'error' });
        return undefined;
      }
      if (result.status !== 'ok') throw new Error('Risk detail failed.');
      const value = readRiskRecord({ value: result.value, companyId, riskId });
      observeRevision(riskId, value.revision);
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
      if (page.items[0]) observeRevision(riskId, page.items[0].revision);
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
          riskId: command.kind === 'record' ? undefined : command.riskId,
          correction:
            command.kind === 'journal-correct'
              ? {
                  entryId: command.journalEntryId,
                  journalKind: command.journalKind,
                  body: command.body,
                }
              : undefined,
        });
        observeRevision(saved.risk.id, saved.risk.revision);
        if (command.kind === 'journal-correct') {
          if (saved.entry.kind !== 'journal-corrected')
            throw new Error('Unexpected Risk correction result.');
          setConfirmedJournal(saved.entry);
        }
        setEditor(undefined);
        setNotice('recorded');
        const listLoaded = await loadList();
        if (request.signal.aborted || !mounted.current) return;
        const detailLoaded = await loadDetail(saved.risk.id);
        if (request.signal.aborted || !mounted.current) return;
        const statementLoaded =
          command.kind === 'journal-correct'
            ? await journal.load(command.journalEntryId)
            : true;
        if (!request.signal.aborted && mounted.current) {
          activeCommand.current = undefined;
          setPending(undefined);
          setNotice(
            listLoaded &&
              detailLoaded &&
              detailLoaded.revision >= knownRevision.current &&
              statementLoaded &&
              (statementLoaded === true ||
                statementLoaded.revision >= knownRevision.current)
              ? 'recorded'
              : 'savedRefreshError',
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
              ? conflictCode(result) === 'IDEMPOTENCY_CONFLICT'
                ? 'idempotencyConflict'
                : 'conflict'
              : 'notFound',
        );
        if (
          result.status === 'notFound' &&
          command.kind === 'journal-correct'
        ) {
          setEditor(undefined);
          journal.clear();
        }
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
      isConflictNotice(notice)
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
    setConfirmedJournal(undefined);
    if (next.kind !== 'journal-correct') journal.clear();
    reviewSequence.current++;
    setReview(undefined);
    setNotice(undefined);
    setEditor(next);
  }

  async function reload(): Promise<void> {
    const sequence = ++reviewSequence.current;
    setReview(undefined);
    const root =
      editor?.kind === 'journal-correct'
        ? editor.originalEntry.id
        : journal.state.kind === 'ready'
          ? journal.state.value.originalEntry.id
          : journal.state.kind === 'none'
            ? confirmedJournal?.originalEntryId
            : journal.state.root;
    const riskId = selected.current;
    const sameJournalRead = journal.checkpoint();
    const live = () =>
      mounted.current &&
      !retired.current &&
      sequence === reviewSequence.current &&
      selected.current === riskId;
    const listLoaded = await loadList();
    if (!live() || !sameJournalRead()) return;
    const latest = riskId ? await loadDetail(riskId) : undefined;
    if (!live() || !sameJournalRead()) return;
    const statementRead = root ? journal.load(root) : undefined;
    const sameRefreshedRead = journal.checkpoint();
    const statement = await statementRead;
    if (!live() || !sameRefreshedRead() || !listLoaded) return;
    const current = latest && latest.revision >= knownRevision.current;
    if (
      notice === 'savedRefreshError' &&
      current &&
      (!root || (statement && statement.revision >= knownRevision.current))
    )
      setNotice(undefined);
    if (!isConflictNotice(notice) || !editor) return;
    if (editor.kind === 'record') setReview({ kind: 'record' });
    else if (current && latest.id === editor.riskId) {
      if (editor.kind === 'journal-correct') {
        if (
          statement &&
          statement.originalEntry.id === editor.originalEntry.id &&
          statement.revision >= knownRevision.current
        )
          setReview({ kind: 'journal', value: statement });
      } else setReview({ kind: 'head', value: latest });
    }
  }

  function continueReviewed(): void {
    if (
      !editor ||
      !isConflictNotice(notice) ||
      !review ||
      activeCommand.current ||
      denied
    )
      return;
    if (editor.kind === 'record') {
      if (review.kind !== 'record') return;
    } else if (editor.kind === 'journal-correct') {
      if (
        review.kind !== 'journal' ||
        review.value.riskId !== editor.riskId ||
        review.value.originalEntry.id !== editor.originalEntry.id ||
        review.value.revision < knownRevision.current
      )
        return;
      const latest = review.value;
      setEditor({
        ...editor,
        expectedRevision: latest.revision,
        predecessorId: latest.currentEntry.id,
        baseline: {
          narrative: latest.currentEntry.narrative,
          occurredOn: latest.currentEntry.occurredOn,
        },
      });
    } else {
      if (
        review.kind !== 'head' ||
        review.value.id !== editor.riskId ||
        review.value.revision < knownRevision.current
      )
        return;
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

  async function startJournalCorrection(): Promise<void> {
    if (
      activeCommand.current ||
      editor ||
      denied ||
      !canRecord(actor) ||
      journal.state.kind !== 'ready'
    )
      return;
    const root = journal.state.value.originalEntry.id;
    const riskId = selectedId;
    const sequence = ++reviewSequence.current;
    const latest = await journal.load(root);
    if (
      !latest ||
      !mounted.current ||
      sequence !== reviewSequence.current ||
      selected.current !== riskId ||
      latest.riskId !== riskId ||
      latest.revision < knownRevision.current
    )
      return;
    start({
      kind: 'journal-correct',
      riskId: latest.riskId,
      originalEntry: latest.originalEntry,
      expectedRevision: latest.revision,
      predecessorId: latest.currentEntry.id,
      narrative: latest.currentEntry.narrative,
      occurredOn: latest.currentEntry.occurredOn ?? '',
      reason: '',
      baseline: {
        narrative: latest.currentEntry.narrative,
        occurredOn: latest.currentEntry.occurredOn,
      },
    });
  }

  if (!companyId || !canReadOperationalRisks(actor)) return null;
  const busy = pending !== undefined;
  const risk = detail.kind === 'ready' ? detail.value : undefined;
  const formatInstant = formatDateTime;

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
                  {copy(
                    pending.command.kind === 'journal-correct'
                      ? 'retryCorrection'
                      : 'retryExact',
                  )}
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
                            journal.clear();
                            setConfirmedJournal(undefined);
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
                <OperationalRiskEditor
                  editor={editor}
                  companyName={actor.activeCompany?.displayName ?? ''}
                  busy={busy}
                  status={
                    notice === 'invalid'
                      ? 'invalid'
                      : isConflictNotice(notice)
                        ? review
                          ? 'reviewed'
                          : 'conflict'
                        : 'editable'
                  }
                  onChange={setEditor}
                  onSubmit={submit}
                  onContinue={continueReviewed}
                  onCancel={() => {
                    reviewSequence.current++;
                    setReview(undefined);
                    setEditor(undefined);
                    setNotice(undefined);
                  }}
                />
              )}
              {journal.state.kind === 'ready' && (
                <OperationalRiskJournalStatement
                  value={journal.state.value}
                  revision={Math.max(
                    knownRevision.current,
                    risk?.revision ?? 0,
                  )}
                  canCorrect={
                    canRecord(actor) &&
                    !editor &&
                    notice !== 'savedRefreshError'
                  }
                  disabled={busy}
                  editing={editor !== undefined}
                  onCorrect={() => {
                    void startJournalCorrection();
                  }}
                />
              )}
              {(journal.state.kind === 'loading' ||
                journal.state.kind === 'error' ||
                journal.state.kind === 'unavailable') && (
                <section
                  className="risk-panel"
                  aria-label={copy('currentStatement')}
                >
                  <p
                    role={journal.state.kind === 'loading' ? 'status' : 'alert'}
                  >
                    {copy(
                      journal.state.kind === 'loading'
                        ? 'loading'
                        : journal.state.kind === 'unavailable'
                          ? 'journalUnavailable'
                          : 'loadError',
                    )}
                  </p>
                  {journal.state.kind !== 'loading' && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (
                          journal.state.kind === 'error' ||
                          journal.state.kind === 'unavailable'
                        )
                          void journal.load(journal.state.root);
                      }}
                    >
                      {copy('retryRead')}
                    </button>
                  )}
                </section>
              )}
              {confirmedJournal && notice === 'savedRefreshError' && (
                <section
                  className="risk-panel"
                  aria-label={copy('savedCorrection')}
                >
                  <h3>{copy('savedCorrection')}</h3>
                  <p className="risk-literal">{confirmedJournal.narrative}</p>
                  <p className="risk-literal">
                    {copy('reason')}: {confirmedJournal.reason}
                  </p>
                </section>
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
                      {risk.revision < knownRevision.current && (
                        <p role="status">{copy('historicalStatement')}</p>
                      )}
                      <p className="risk-truth">{copy('notAssessed')}</p>
                      <p>{copy('notResponsible')}</p>
                      <h4>{copy('current')}</h4>
                      <OperationalRiskFactsView
                        facts={risk.currentIntake.facts}
                      />
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
                            disabled={
                              busy || risk.revision < knownRevision.current
                            }
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
                            disabled={
                              busy || risk.revision < knownRevision.current
                            }
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
                        <OperationalRiskFactsView
                          facts={risk.originalIntake.facts}
                        />
                      </details>
                      <OperationalRiskHistory
                        history={history}
                        busy={busy}
                        canSelect={!editor}
                        currentEntryId={
                          journal.state.kind === 'ready'
                            ? journal.state.value.currentEntry.id
                            : undefined
                        }
                        onView={(root) => {
                          void journal.load(root);
                        }}
                        onOlder={() => {
                          void loadOlder();
                        }}
                      />
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

function isConflictNotice(notice: Notice): boolean {
  return notice === 'conflict' || notice === 'idempotencyConflict';
}
