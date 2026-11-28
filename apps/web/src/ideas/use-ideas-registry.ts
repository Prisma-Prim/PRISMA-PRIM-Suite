import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import {
  createAuthenticatedApiClient,
  type ApiResult,
} from '../api/authenticated-api-client';
import { handleAuthenticatedAccessRejection } from '../api/latest-authenticated-request';
import {
  useActorObservation,
  useRequestLifetime,
} from '../api/use-actor-requests';
import { useScopedOperationGroup } from '../api/use-scoped-operation';
import {
  calendarDate,
  ideasAuthority,
  ideasContextKey,
  parseDispositionResult,
  parseHistory,
  parseIdea,
  parseIdeaPage,
  type History,
  type Idea,
  type IdeaPage,
} from './ideas-contract';

export interface IdeasWorkspaceProps {
  actor: ActorContext;
  identity: BrowserIdentity;
  onActorRevalidated: (actor: ActorContext) => Promise<void> | void;
  onCompanyContextRejected: (companyId: string) => void;
  onWorkspaceAccessRejected: () => Promise<void> | void;
}
export type IdeasView<T> =
  | { status: 'loading' }
  | { status: 'ready'; value: T }
  | { status: 'error' | 'denied' | 'unavailable' };
type Intent = { body: string; key: string };
type ReviewIntent = Intent & { ideaId: string };
type Save<I extends Intent = Intent> =
  | { status: 'idle' | 'validation' | 'denied' | 'conflict' }
  /** A confirmed recording names the Idea it recorded. */
  | { status: 'saved'; ideaId?: string }
  | { status: 'saving' | 'uncertain'; intent: I };
export type IdeaDisposition = 'deferred' | 'rejected';

/**
 * The keyed lifetime of one Ideas owner: a new value starts a fresh owner
 * for a new browser identity or Ideas context, and `undefined` means the
 * actor cannot read Ideas, so no owner is mounted.
 */
export function useIdeasLifetime(props: IdeasWorkspaceProps) {
  const identityScope = useRequestLifetime(
    props.identity,
    ideasContextKey(props.actor),
  );
  return ideasAuthority(props.actor).read ? identityScope : undefined;
}

/**
 * Every Ideas read, draft and command of one keyed lifetime. Both interfaces
 * render it, so the list, the open Idea, the recording and review drafts,
 * their exact retries and the access recovery keep one owner.
 */
export function useIdeasRegistry(props: IdeasWorkspaceProps) {
  const { actor, identity } = props;
  const companyId = actor.activeCompany?.id ?? '';
  const authority = ideasAuthority(actor);
  const callbacks = useRef(props);
  useLayoutEffect(() => {
    callbacks.current = props;
  });
  const [page, setPage] = useState<IdeasView<IdeaPage>>({ status: 'loading' });
  const [detail, setDetail] =
    useState<IdeasView<{ idea: Idea; history: History }>>();
  const [selectedId, setSelectedId] = useState<string>();
  const [description, setDescription] = useState('');
  const [origin, setOrigin] = useState('');
  const [save, setSave] = useState<Save>({ status: 'idle' });
  const [reviewSave, setReviewSave] = useState<
    Save<ReviewIntent> | { status: 'stale' }
  >({ status: 'idle' });
  const [kind, setKind] = useState<IdeaDisposition>('deferred');
  const [reason, setReason] = useState('');
  const [date, setDate] = useState('');
  const listWork = useScopedOperationGroup('ideas-list');
  const detailWork = useScopedOperationGroup('ideas-detail');
  const commands = useScopedOperationGroup('ideas-command');
  const observation = useActorObservation(actor);
  const recoveryWork = useScopedOperationGroup(String(observation));
  const committedRecovery = useRef(recoveryWork);
  useLayoutEffect(() => {
    committedRecovery.current = recoveryWork;
  }, [recoveryWork]);
  const heading = useRef<HTMLHeadingElement>(null);
  const workspace = useRef<HTMLElement>(null);
  const openingTrigger = useRef<Element | null>(null);
  const rowTrigger = useRef<HTMLElement | null>(null);
  const busy = save.status === 'saving' || reviewSave.status === 'saving';
  /** A stale or conflicting review needs a deliberate reload first. */
  const reviewLocked =
    reviewSave.status === 'stale' || reviewSave.status === 'conflict';

  const query = useCallback(
    async (
      path: string,
      signal: AbortSignal,
      command?: Intent,
    ): Promise<ApiResult<unknown>> => {
      const recoveryOwner = committedRecovery.current;
      const api = await createAuthenticatedApiClient(identity);
      if (signal.aborted) return { status: 'error' };
      const result = await api.request(path, {
        companyContextId: companyId,
        signal,
        ...(command
          ? {
              method: 'POST',
              body: command.body,
              headers: {
                'idempotency-key': command.key,
                'content-type': 'application/json',
              },
            }
          : {}),
      });
      if (signal.aborted) return { status: 'error' };
      if (result.status !== 'unauthorized' && result.status !== 'forbidden')
        return result;
      const recovery = recoveryOwner.begin();
      listWork.retire();
      detailWork.retire();
      commands.retire();
      setPage({ status: 'denied' });
      setDetail(undefined);
      setSelectedId(undefined);
      setDescription('');
      setOrigin('');
      setReason('');
      setDate('');
      setKind('deferred');
      setSave({ status: 'denied' });
      setReviewSave({ status: 'idle' });
      openingTrigger.current = null;
      rowTrigger.current = null;
      if (recovery) {
        const current = () => !recovery.signal.aborted;
        try {
          if (result.status === 'unauthorized') {
            const workspaceRejection =
              callbacks.current.onWorkspaceAccessRejected();
            await Promise.all([workspaceRejection, identity.rejectSession()]);
            return result;
          }
          await handleAuthenticatedAccessRejection({
            result,
            identity,
            companyContextId: companyId,
            signal: recovery.signal,
            isCurrent: current,
            onActorRevalidated: (actor) =>
              callbacks.current.onActorRevalidated(actor),
            onCompanyContextRejected: (id) =>
              callbacks.current.onCompanyContextRejected(id),
            onWorkspaceAccessRejected: () =>
              callbacks.current.onWorkspaceAccessRejected(),
          });
        } finally {
          recovery.release();
        }
      }
      return result;
    },
    [identity, companyId, listWork, detailWork, commands],
  );
  const loadList = useCallback(
    async (cursor?: string) => {
      const operation = listWork.beginLatest();
      if (!operation) return;
      const { signal } = operation;
      setPage({ status: 'loading' });
      try {
        const result = await query(
          `/ideas${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
          signal,
        );
        if (signal.aborted) return;
        setPage(
          result.status === 'ok'
            ? { status: 'ready', value: parseIdeaPage(result.value, companyId) }
            : { status: refusal(result) },
        );
      } catch {
        if (!signal.aborted) setPage({ status: 'error' });
      } finally {
        operation.release();
      }
    },
    [query, companyId, listWork],
  );
  useEffect(() => {
    void loadList();
  }, [loadList]);
  useEffect(() => {
    if (
      detail?.status !== 'ready' ||
      !openingTrigger.current ||
      !heading.current
    )
      return;
    const trigger = openingTrigger.current;
    if (
      !heading.current.closest('[hidden]') &&
      (document.activeElement === trigger ||
        (!trigger.isConnected && document.activeElement === document.body))
    )
      heading.current.focus();
    openingTrigger.current = null;
  }, [detail]);

  async function open(
    ideaId: string,
    options: { cursor?: string; preserveConfirmation?: boolean } = {},
  ) {
    if (commands.isPending()) return;
    const operation = detailWork.beginLatest();
    if (!operation) return;
    const { signal } = operation;
    setSelectedId(ideaId);
    setDetail({ status: 'loading' });
    setReason('');
    setDate('');
    setKind('deferred');
    if (!options.preserveConfirmation) setReviewSave({ status: 'idle' });
    try {
      const [record, history] = await Promise.all([
        query(`/ideas/${encodeURIComponent(ideaId)}`, signal),
        query(
          `/ideas/${encodeURIComponent(ideaId)}/dispositions${options.cursor ? `?cursor=${encodeURIComponent(options.cursor)}` : ''}`,
          signal,
        ),
      ]);
      if (signal.aborted) return;
      if (record.status === 'ok' && history.status === 'ok') {
        const idea = parseIdea(record.value, companyId),
          entries = parseHistory(history.value, ideaId);
        if (idea.id !== ideaId || entries.total !== idea.revision - 1)
          throw new Error('Idea changed during the read.');
        setDetail({ status: 'ready', value: { idea, history: entries } });
      } else
        setDetail({
          status: refusal(record.status === 'ok' ? history : record),
        });
    } catch {
      if (!signal.aborted) setDetail({ status: 'error' });
    } finally {
      operation.release();
    }
  }
  function close() {
    if (commands.isPending()) return;
    detailWork.retire();
    setDetail(undefined);
    setSelectedId(undefined);
    setReason('');
    setDate('');
    setReviewSave({ status: 'idle' });
    if (
      rowTrigger.current?.isConnected &&
      !rowTrigger.current.closest('[hidden]')
    )
      rowTrigger.current.focus();
    else if (workspace.current && !workspace.current.closest('[hidden]'))
      workspace.current.focus();
  }
  async function executeRecord(intent: Intent) {
    if (!authority.record || commands.isPending()) return;
    const operation = commands.begin();
    if (!operation) return;
    const { signal } = operation;
    setSave({ status: 'saving', intent });
    let recordedIdeaId: string | undefined;
    try {
      const result = await query('/ideas', signal, intent);
      if (signal.aborted) return;
      if (result.status === 'ok') {
        const idea = parseIdea(result.value, companyId);
        setSave({ status: 'saved', ideaId: idea.id });
        setDescription('');
        setOrigin('');
        recordedIdeaId = idea.id;
      } else if (result.status === 'validation' || result.status === 'conflict')
        setSave({ status: result.status });
      else if (
        result.status === 'forbidden' ||
        result.status === 'unauthorized'
      )
        setSave({ status: 'denied' });
      else setSave({ status: 'uncertain', intent });
    } catch {
      if (!signal.aborted) setSave({ status: 'uncertain', intent });
    } finally {
      operation.release();
    }
    if (recordedIdeaId !== undefined && !signal.aborted) {
      void open(recordedIdeaId);
      void loadList();
    }
  }
  async function executeReview(intent: ReviewIntent) {
    if (!authority.review || commands.isPending()) return;
    const operation = commands.begin();
    if (!operation) return;
    const { signal } = operation;
    setReviewSave({ status: 'saving', intent });
    let confirmed = false;
    try {
      const result = await query(
        `/ideas/${encodeURIComponent(intent.ideaId)}/dispositions`,
        signal,
        intent,
      );
      if (signal.aborted) return;
      if (result.status === 'ok') {
        const response = parseDispositionResult(result.value, companyId);
        if (response.idea.id !== intent.ideaId)
          throw new Error('Invalid Idea target.');
        setReviewSave({ status: 'saved' });
        setReason('');
        setDate('');
        confirmed = true;
      } else if (result.status === 'conflict')
        setReviewSave({
          status:
            result.reason === undefined && result.code === 'STALE_VERSION'
              ? 'stale'
              : 'conflict',
        });
      else if (result.status === 'validation')
        setReviewSave({ status: 'validation' });
      else if (
        result.status === 'forbidden' ||
        result.status === 'unauthorized'
      )
        setReviewSave({ status: 'denied' });
      else setReviewSave({ status: 'uncertain', intent });
    } catch {
      if (!signal.aborted) setReviewSave({ status: 'uncertain', intent });
    } finally {
      operation.release();
    }
    if (confirmed && !signal.aborted) {
      void open(intent.ideaId, { preserveConfirmation: true });
      void loadList();
    }
  }
  function record(event: FormEvent) {
    event.preventDefault();
    if (busy || !authority.record) return;
    if (
      !description.trim() ||
      description.length > 5000 ||
      !origin.trim() ||
      origin.length > 300
    ) {
      setSave({ status: 'validation' });
      return;
    }
    const body = JSON.stringify({ description, origin });
    void executeRecord(
      save.status === 'uncertain' && save.intent.body === body
        ? save.intent
        : { body, key: crypto.randomUUID() },
    );
  }
  function review(event: FormEvent) {
    event.preventDefault();
    if (busy || !authority.review || detail?.status !== 'ready' || reviewLocked)
      return;
    if (
      !reason.trim() ||
      reason.length > 2000 ||
      (kind === 'deferred' && date !== '' && !calendarDate(date))
    ) {
      setReviewSave({ status: 'validation' });
      return;
    }
    const ideaId = detail.value.idea.id;
    const body = JSON.stringify({
      kind,
      reason,
      expectedRevision: detail.value.idea.revision,
      ...(kind === 'deferred' && date ? { reconsiderationDate: date } : {}),
    });
    const intent =
      reviewSave.status === 'uncertain' &&
      reviewSave.intent.ideaId === ideaId &&
      reviewSave.intent.body === body
        ? reviewSave.intent
        : { ideaId, body, key: crypto.randomUUID() };
    void executeReview(intent);
  }
  /** A draft edit clears the previous outcome unless a save is in flight. */
  function changeDescription(value: string) {
    setDescription(value);
    if (!busy) setSave({ status: 'idle' });
  }
  function changeOrigin(value: string) {
    setOrigin(value);
    if (!busy) setSave({ status: 'idle' });
  }
  /** A review edit keeps a stale or conflicting outcome until a reload. */
  function changeKind(value: IdeaDisposition) {
    setKind(value);
    if (!reviewLocked) setReviewSave({ status: 'idle' });
  }
  function changeReason(value: string) {
    setReason(value);
    if (!reviewLocked) setReviewSave({ status: 'idle' });
  }
  function changeDate(value: string) {
    setDate(value);
    if (!reviewLocked) setReviewSave({ status: 'idle' });
  }
  /** Opens an Idea from its row; focus returns to the row on close. */
  function openFromRow(ideaId: string, trigger: HTMLElement) {
    rowTrigger.current = trigger;
    openingTrigger.current = trigger;
    void open(ideaId);
  }
  function refresh() {
    void loadList();
  }
  function nextPage() {
    if (page.status === 'ready' && page.value.nextCursor)
      void loadList(page.value.nextCursor);
  }
  function reloadIdea() {
    if (selectedId) void open(selectedId);
  }
  function moreHistory(trigger: Element) {
    if (detail?.status !== 'ready' || !detail.value.history.nextCursor) return;
    openingTrigger.current = trigger;
    void open(detail.value.idea.id, {
      cursor: detail.value.history.nextCursor,
      preserveConfirmation: true,
    });
  }
  function retryRecord() {
    if (save.status === 'uncertain') void executeRecord(save.intent);
  }
  function retryReview() {
    if (reviewSave.status === 'uncertain')
      void executeReview(reviewSave.intent);
  }
  return {
    authority,
    page,
    detail,
    selectedId,
    description,
    origin,
    save,
    reviewSave,
    kind,
    reason,
    date,
    busy,
    reviewLocked,
    heading,
    workspace,
    record,
    review,
    changeDescription,
    changeOrigin,
    changeKind,
    changeReason,
    changeDate,
    openFromRow,
    refresh,
    nextPage,
    reloadIdea,
    close,
    moreHistory,
    retryRecord,
    retryReview,
  };
}

export type IdeasRegistry = ReturnType<typeof useIdeasRegistry>;

function refusal(
  result: ApiResult<unknown>,
): 'error' | 'denied' | 'unavailable' {
  return result.status === 'forbidden' || result.status === 'unauthorized'
    ? 'denied'
    : result.status === 'notFound'
      ? 'unavailable'
      : 'error';
}

/** The first line of an Idea, as its list and panel name it. */
export function ideaExcerpt(description: string): string {
  return (description.split('\n')[0]?.trim() || description.trim()).slice(
    0,
    140,
  );
}
