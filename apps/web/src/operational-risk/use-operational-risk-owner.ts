import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { holds } from '../access/company-grants';
import {
  createAuthenticatedApiClient,
  conflictCode,
  type ApiResult,
} from '../api/authenticated-api-client';
import { handleAuthenticatedAccessRejection } from '../api/latest-authenticated-request';
import { useActorObservation } from '../api/use-actor-requests';
import { useScopedOperationGroup } from '../api/use-scoped-operation';
import {
  readRiskHistory,
  readRiskPage,
  readRiskRecord,
  readRiskResult,
} from './operational-risk.response';
import type {
  OperationalRiskEntry,
  OperationalRiskJournalCorrection,
  OperationalRiskJournalStatement as JournalStatement,
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

export interface OperationalRiskWorkspaceProps {
  actor: ActorContext;
  identity: BrowserIdentity;
  onActorRevalidated: (actor: ActorContext) => Promise<void> | void;
  onCompanyContextRejected: (companyId: string) => void;
  onWorkspaceAccessRejected: () => Promise<void> | void;
}
type Pending =
  | { kind: 'submitting'; command: Command }
  | { kind: 'uncertain'; command: Command };
export type OperationalRiskNotice =
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
export type OperationalRiskLoad<Value> =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; value: Value; more: 'idle' | 'loading' | 'error' };

export function canReadOperationalRisks(actor: ActorContext): boolean {
  return holds(
    actor.activeCompany,
    'company_operational_risk_reader',
    'risk.read',
  );
}

export function canRecordOperationalRisks(actor: ActorContext): boolean {
  return (
    canReadOperationalRisks(actor) &&
    holds(
      actor.activeCompany,
      'company_operational_risk_recorder',
      'risk.record',
    )
  );
}

/**
 * Every Operational Risk read, draft and command of one keyed workspace.
 * Both interfaces render it, so the register, the selected Risk, its
 * journal statement, the frozen command and its exact retry, the conflict
 * review and the access recovery keep one owner.
 */
export function useOperationalRiskOwner({
  actor,
  identity,
  onActorRevalidated,
  onCompanyContextRejected,
  onWorkspaceAccessRejected,
}: OperationalRiskWorkspaceProps) {
  const companyId = actor.activeCompany?.id;
  const [list, setList] = useState<
    OperationalRiskLoad<OperationalRiskPage<OperationalRiskSummary>>
  >({ kind: 'loading' });
  const [selectedId, setSelectedId] = useState<string>();
  const [detail, setDetail] = useState<
    OperationalRiskLoad<OperationalRiskRecord>
  >({
    kind: 'loading',
  });
  const [history, setHistory] = useState<
    OperationalRiskLoad<OperationalRiskPage<OperationalRiskEntry>>
  >({ kind: 'loading' });
  const [editor, setEditor] = useState<Editor>();
  const [pending, setPending] = useState<Pending>();
  const [notice, setNotice] = useState<OperationalRiskNotice>();
  const [review, setReview] = useState<ConflictReview>();
  const reviewSequence = useRef(0);
  const [confirmedJournal, setConfirmedJournal] =
    useState<OperationalRiskJournalCorrection>();
  const [denied, setDenied] = useState(false);
  const retired = useRef(false);
  const selected = useRef<string | undefined>(undefined);
  const knownRevision = useRef(0);
  const activeCommand = useRef<Command | undefined>(undefined);
  const listWork = useScopedOperationGroup('risk-list');
  const detailWork = useScopedOperationGroup('risk-detail');
  const commandWork = useScopedOperationGroup('risk-command');
  const actorObservation = useActorObservation(actor);
  const recoveryWork = useScopedOperationGroup(String(actorObservation));
  const callbacks = useRef({
    onActorRevalidated,
    onCompanyContextRejected,
    onWorkspaceAccessRejected,
  });
  useLayoutEffect(() => {
    callbacks.current = {
      onActorRevalidated,
      onCompanyContextRejected,
      onWorkspaceAccessRejected,
    };
  });

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
    void loadList();
    // The scope is immutable for this keyed component.
  }, []);

  async function reject(
    result: ApiResult<unknown>,
    signal: AbortSignal,
  ): Promise<boolean> {
    if (signal.aborted || retired.current) return true;
    if (result.status !== 'unauthorized' && result.status !== 'forbidden')
      return false;

    // Local refusal applies to these Risk requests. Session recovery can only
    // start under the full Actor observation that admitted the refused read.
    const recovery = recoveryWork.begin();
    retired.current = true;
    setDenied(true);
    listWork.retire();
    detailWork.retire();
    commandWork.retire();
    setList({ kind: 'loading' });
    setDetail({ kind: 'loading' });
    setHistory({ kind: 'loading' });
    selected.current = undefined;
    knownRevision.current = 0;
    setSelectedId(undefined);
    setEditor(undefined);
    journal.clear();
    setConfirmedJournal(undefined);
    setReview(undefined);
    reviewSequence.current++;
    activeCommand.current = undefined;
    setPending(undefined);

    if (recovery) {
      const current = () => !recovery.signal.aborted;
      try {
        await handleAuthenticatedAccessRejection({
          result,
          identity,
          companyContextId: companyId,
          signal: recovery.signal,
          isCurrent: current,
          onCompanyContextRejected: (company) =>
            callbacks.current.onCompanyContextRejected(company),
          onActorRevalidated: (updated) =>
            callbacks.current.onActorRevalidated(updated),
          onWorkspaceAccessRejected: () =>
            callbacks.current.onWorkspaceAccessRejected(),
        });
      } finally {
        recovery.release();
      }
    }
    return true;
  }

  function observeRevision(riskId: string, revision: number): void {
    if (selected.current === riskId)
      knownRevision.current = Math.max(knownRevision.current, revision);
  }

  async function loadList(cursor?: string): Promise<boolean> {
    if (!companyId || retired.current) return false;
    const request = listWork.beginLatest();
    if (!request) return false;
    if (cursor)
      setList((previous) =>
        previous.kind === 'ready' ? { ...previous, more: 'loading' } : previous,
      );
    else setList({ kind: 'loading' });
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (request.signal.aborted) return false;
      const result = await api.request(
        `/operational-risks${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
        { companyContextId: companyId, signal: request.signal },
      );
      if ((await reject(result, request.signal)) || request.signal.aborted)
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
      if (!request.signal.aborted)
        setList((previous) =>
          cursor && previous.kind === 'ready'
            ? { ...previous, more: 'error' }
            : { kind: 'error' },
        );
      return false;
    } finally {
      request.release();
    }
  }

  async function loadDetail(
    riskId: string,
  ): Promise<OperationalRiskRecord | undefined> {
    if (!companyId || retired.current) return undefined;
    const request = detailWork.beginLatest();
    if (!request) return undefined;
    if (selected.current !== riskId) {
      knownRevision.current =
        list.kind === 'ready'
          ? (list.value.items.find((item) => item.id === riskId)?.revision ?? 0)
          : 0;
      journal.clear();
      setConfirmedJournal(undefined);
    }
    selected.current = riskId;
    setSelectedId(riskId);
    setDetail({ kind: 'loading' });
    setHistory({ kind: 'loading' });
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (request.signal.aborted) return undefined;
      const result = await api.request(
        `/operational-risks/${encodeURIComponent(riskId)}`,
        { companyContextId: companyId, signal: request.signal },
      );
      if ((await reject(result, request.signal)) || request.signal.aborted)
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
      const entries = await api.request(
        `/operational-risks/${encodeURIComponent(riskId)}/history`,
        { companyContextId: companyId, signal: request.signal },
      );
      if ((await reject(entries, request.signal)) || request.signal.aborted)
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
      if (!request.signal.aborted) {
        setDetail({ kind: 'error' });
        setHistory({ kind: 'error' });
      }
      return undefined;
    } finally {
      request.release();
    }
  }

  async function loadOlder(): Promise<void> {
    if (
      !companyId ||
      !selectedId ||
      retired.current ||
      history.kind !== 'ready' ||
      !history.value.next_cursor
    )
      return;
    const riskId = selectedId;
    const cursor = history.value.next_cursor;
    const request = detailWork.beginLatest();
    if (!request) return;
    setHistory((previous) =>
      previous.kind === 'ready' ? { ...previous, more: 'loading' } : previous,
    );
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (request.signal.aborted) return;
      const result = await api.request(
        `/operational-risks/${encodeURIComponent(riskId)}/history?cursor=${encodeURIComponent(cursor)}`,
        { companyContextId: companyId, signal: request.signal },
      );
      if (
        (await reject(result, request.signal)) ||
        request.signal.aborted ||
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
      if (!request.signal.aborted)
        setHistory((previous) =>
          previous.kind === 'ready' ? { ...previous, more: 'error' } : previous,
        );
    } finally {
      request.release();
    }
  }

  async function execute(command: Command): Promise<void> {
    if (!companyId || retired.current || commandWork.isPending()) return;
    const request = commandWork.begin();
    if (!request) return;
    reviewSequence.current++;
    setReview(undefined);
    activeCommand.current = command;
    setPending({ kind: 'submitting', command });
    setNotice(undefined);
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (request.signal.aborted) return;
      const result = await api.request(command.path, {
        method: 'POST',
        companyContextId: companyId,
        headers: {
          'content-type': 'application/json',
          'idempotency-key': command.key,
        },
        body: command.body,
        signal: request.signal,
      });
      if ((await reject(result, request.signal)) || request.signal.aborted)
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
        if (request.signal.aborted) return;
        const detailLoaded = await loadDetail(saved.risk.id);
        if (request.signal.aborted) return;
        const statementLoaded =
          command.kind === 'journal-correct'
            ? await journal.load(command.journalEntryId)
            : true;
        if (!request.signal.aborted) {
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
      if (!request.signal.aborted) setPending({ kind: 'uncertain', command });
    } finally {
      request.release();
    }
  }

  function submit(event: FormEvent): void {
    event.preventDefault();
    if (
      !editor ||
      activeCommand.current ||
      !canRecordOperationalRisks(actor) ||
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
    const sameLifetime = listWork.capture();
    const live = () =>
      sameLifetime() &&
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
      !canRecordOperationalRisks(actor) ||
      journal.state.kind !== 'ready'
    )
      return;
    const root = journal.state.value.originalEntry.id;
    const riskId = selectedId;
    const sequence = ++reviewSequence.current;
    const sameLifetime = listWork.capture();
    const latest = await journal.load(root);
    if (
      !latest ||
      !sameLifetime() ||
      retired.current ||
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

  /** Opens a Risk from the register, dropping the previous statement. */
  function selectRisk(riskId: string): void {
    setNotice(undefined);
    journal.clear();
    setConfirmedJournal(undefined);
    void loadDetail(riskId);
  }
  function moreRisks(): void {
    if (list.kind === 'ready' && list.value.next_cursor)
      void loadList(list.value.next_cursor);
  }
  function retryCommand(): void {
    if (pending?.kind === 'uncertain') void execute(pending.command);
  }
  function startRecord(): void {
    start({ kind: 'record', facts: emptyFacts() });
  }
  function startCorrection(risk: OperationalRiskRecord): void {
    start({
      kind: 'correct',
      riskId: risk.id,
      expectedRevision: risk.revision,
      predecessorId: risk.currentIntake.id,
      facts: draftFacts(risk.currentIntake.facts),
      reason: '',
    });
  }
  function startJournalNote(risk: OperationalRiskRecord): void {
    start({
      kind: 'journal',
      riskId: risk.id,
      expectedRevision: risk.revision,
      entryKind: 'observation',
      narrative: '',
      occurredOn: '',
    });
  }
  function cancelEditor(): void {
    reviewSequence.current++;
    setReview(undefined);
    setEditor(undefined);
    setNotice(undefined);
  }
  function viewStatement(root: string): void {
    void journal.load(root);
  }
  function retryStatement(): void {
    if (journal.state.kind === 'error' || journal.state.kind === 'unavailable')
      void journal.load(journal.state.root);
  }
  /**
   * Back to the register, for an interface that shows one Risk at a time:
   * it ends the editor and the selected Risk's reads. A command in flight
   * or awaiting its exact retry keeps both, as the current interface keeps
   * its frozen draft.
   */
  function close(): void {
    if (activeCommand.current) return;
    reviewSequence.current++;
    setReview(undefined);
    setEditor(undefined);
    setNotice(undefined);
    detailWork.retire();
    journal.clear();
    setConfirmedJournal(undefined);
    selected.current = undefined;
    knownRevision.current = 0;
    setSelectedId(undefined);
    setDetail({ kind: 'loading' });
    setHistory({ kind: 'loading' });
  }

  const canRecord = canRecordOperationalRisks(actor);
  return {
    companyId,
    companyName: actor.activeCompany?.displayName ?? '',
    canRead: canReadOperationalRisks(actor),
    canRecord,
    list,
    selectedId,
    detail,
    risk: detail.kind === 'ready' ? detail.value : undefined,
    history,
    editor,
    pending,
    busy: pending !== undefined,
    notice,
    conflict: isConflictNotice(notice),
    reviewed: review !== undefined,
    confirmedJournal,
    denied,
    statement: journal.state,
    knownRevision: knownRevision.current,
    changeEditor: setEditor,
    submit,
    reload,
    continueReviewed,
    startJournalCorrection,
    selectRisk,
    moreRisks,
    loadOlder,
    retryCommand,
    startRecord,
    startCorrection,
    startJournalNote,
    cancelEditor,
    viewStatement,
    retryStatement,
    close,
  };
}

export type OperationalRiskOwner = ReturnType<typeof useOperationalRiskOwner>;

function uniqueSummaries(
  items: OperationalRiskSummary[],
): OperationalRiskSummary[] {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

function isConflictNotice(notice: OperationalRiskNotice): boolean {
  return notice === 'conflict' || notice === 'idempotencyConflict';
}
