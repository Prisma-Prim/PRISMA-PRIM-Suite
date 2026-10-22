import './ideas-workspace.css';
import {
  useCallback,
  useEffect,
  useMemo,
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
import { useInterfaceLocale } from '../localization/interface-locale';
import { Select } from '../presentation/Select';
import { useIdeasCopy } from './ideas.copy';
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

interface Props {
  actor: ActorContext;
  identity: BrowserIdentity;
  onActorRevalidated: (actor: ActorContext) => Promise<void> | void;
  onCompanyContextRejected: (companyId: string) => void;
  onWorkspaceAccessRejected: () => Promise<void> | void;
}
type View<T> =
  | { status: 'loading' }
  | { status: 'ready'; value: T }
  | { status: 'error' | 'denied' | 'unavailable' };
type Intent = { body: string; key: string };
type ReviewIntent = Intent & { ideaId: string };
type Save<I extends Intent = Intent> =
  | { status: 'idle' | 'saved' | 'validation' | 'denied' | 'conflict' }
  | { status: 'saving' | 'uncertain'; intent: I };

export function IdeasWorkspace(props: Props) {
  const identityScope = useMemo(() => crypto.randomUUID(), [props.identity]);
  if (!ideasAuthority(props.actor).read) return null;
  return (
    <IdeasRegistry
      key={`${identityScope}:${ideasContextKey(props.actor)}`}
      {...props}
    />
  );
}
function IdeasRegistry(props: Props) {
  const { actor, identity } = props;
  const companyId = actor.activeCompany?.id ?? '';
  const copy = useIdeasCopy();
  const { formatDate, formatDateTime, formatNumber } = useInterfaceLocale();
  const authority = ideasAuthority(actor);
  const callbacks = useRef(props);
  callbacks.current = props;
  const [page, setPage] = useState<View<IdeaPage>>({ status: 'loading' });
  const [detail, setDetail] =
    useState<View<{ idea: Idea; history: History }>>();
  const [selectedId, setSelectedId] = useState<string>();
  const [description, setDescription] = useState('');
  const [origin, setOrigin] = useState('');
  const [save, setSave] = useState<Save>({ status: 'idle' });
  const [reviewSave, setReviewSave] = useState<
    Save<ReviewIntent> | { status: 'stale' }
  >({ status: 'idle' });
  const [kind, setKind] = useState<'deferred' | 'rejected'>('deferred');
  const [reason, setReason] = useState('');
  const [date, setDate] = useState('');
  const listPending = useRef<AbortController | undefined>(undefined);
  const detailPending = useRef<AbortController | undefined>(undefined);
  const mutationPending = useRef<AbortController | undefined>(undefined);
  const authorityEpoch = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const workspace = useRef<HTMLElement>(null);
  const openingTrigger = useRef<Element | null>(null);
  const rowTrigger = useRef<HTMLElement | null>(null);
  const busy = save.status === 'saving' || reviewSave.status === 'saving';

  const query = useCallback(
    async (
      path: string,
      signal: AbortSignal,
      command?: Intent,
    ): Promise<ApiResult<unknown>> => {
      const epoch = authorityEpoch.current;
      const api = await createAuthenticatedApiClient(identity);
      if (signal.aborted || epoch !== authorityEpoch.current)
        return { status: 'error' };
      const result = await api.request<unknown>(path, {
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
      if (signal.aborted || epoch !== authorityEpoch.current)
        return { status: 'error' };
      if (result.status === 'unauthorized' || result.status === 'forbidden') {
        authorityEpoch.current += 1;
        // Retire private content before authority revalidation. Other replies
        // from this generation cannot restore it, even on a shared signal.
        for (const pending of [listPending, detailPending, mutationPending]) {
          if (pending.current?.signal !== signal) pending.current?.abort();
        }
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
        if (result.status === 'unauthorized')
          await callbacks.current.onWorkspaceAccessRejected();
      }
      await handleAuthenticatedAccessRejection({
        result,
        identity,
        companyContextId: companyId,
        signal,
        onActorRevalidated: (actor) =>
          callbacks.current.onActorRevalidated(actor),
        onCompanyContextRejected: (id) =>
          callbacks.current.onCompanyContextRejected(id),
        onWorkspaceAccessRejected: () =>
          callbacks.current.onWorkspaceAccessRejected(),
      });
      return result;
    },
    [identity, companyId],
  );
  const loadList = useCallback(
    async (cursor?: string) => {
      listPending.current?.abort();
      const controller = new AbortController();
      listPending.current = controller;
      setPage({ status: 'loading' });
      try {
        const result = await query(
          `/ideas${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setPage(
          result.status === 'ok'
            ? { status: 'ready', value: parseIdeaPage(result.value, companyId) }
            : { status: refusal(result) },
        );
      } catch {
        if (!controller.signal.aborted) setPage({ status: 'error' });
      }
    },
    [query, companyId],
  );
  useEffect(() => {
    void loadList();
    return () => {
      listPending.current?.abort();
      detailPending.current?.abort();
      mutationPending.current?.abort();
    };
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
    if (mutationPending.current) return;
    detailPending.current?.abort();
    const controller = new AbortController();
    detailPending.current = controller;
    setSelectedId(ideaId);
    setDetail({ status: 'loading' });
    setReason('');
    setDate('');
    setKind('deferred');
    if (!options.preserveConfirmation) setReviewSave({ status: 'idle' });
    try {
      const [record, history] = await Promise.all([
        query(`/ideas/${encodeURIComponent(ideaId)}`, controller.signal),
        query(
          `/ideas/${encodeURIComponent(ideaId)}/dispositions${options.cursor ? `?cursor=${encodeURIComponent(options.cursor)}` : ''}`,
          controller.signal,
        ),
      ]);
      if (controller.signal.aborted) return;
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
      if (!controller.signal.aborted) setDetail({ status: 'error' });
    }
  }
  function close() {
    if (mutationPending.current) return;
    detailPending.current?.abort();
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
    if (!authority.record || mutationPending.current) return;
    const controller = new AbortController();
    mutationPending.current = controller;
    setSave({ status: 'saving', intent });
    let recordedIdeaId: string | undefined;
    try {
      const result = await query('/ideas', controller.signal, intent);
      if (controller.signal.aborted) return;
      if (result.status === 'ok') {
        const idea = parseIdea(result.value, companyId);
        setSave({ status: 'saved' });
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
      if (!controller.signal.aborted) setSave({ status: 'uncertain', intent });
    } finally {
      if (mutationPending.current === controller)
        mutationPending.current = undefined;
    }
    if (recordedIdeaId !== undefined && !controller.signal.aborted) {
      void open(recordedIdeaId);
      void loadList();
    }
  }
  async function executeReview(intent: ReviewIntent) {
    if (!authority.review || mutationPending.current) return;
    const controller = new AbortController();
    mutationPending.current = controller;
    setReviewSave({ status: 'saving', intent });
    let confirmed = false;
    try {
      const result = await query(
        `/ideas/${encodeURIComponent(intent.ideaId)}/dispositions`,
        controller.signal,
        intent,
      );
      if (controller.signal.aborted) return;
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
      if (!controller.signal.aborted)
        setReviewSave({ status: 'uncertain', intent });
    } finally {
      if (mutationPending.current === controller)
        mutationPending.current = undefined;
    }
    if (confirmed && !controller.signal.aborted) {
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
    if (
      busy ||
      !authority.review ||
      detail?.status !== 'ready' ||
      reviewSave.status === 'stale' ||
      reviewSave.status === 'conflict'
    )
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
  return (
    <section
      ref={workspace}
      className="ideas-workspace"
      id="ideas"
      tabIndex={-1}
      aria-labelledby="ideas-title"
    >
      <header>
        <h2 id="ideas-title">{copy('label')}</h2>
        <button type="button" disabled={busy} onClick={() => void loadList()}>
          {copy('refresh')}
        </button>
      </header>
      {save.status === 'saved' && <p role="status">{copy('saveConfirmed')}</p>}
      {save.status === 'uncertain' && (
        <div role="alert">
          <p>{copy('uncertain')}</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void executeRecord(save.intent)}
          >
            {copy('retry')}
          </button>
        </div>
      )}
      {(save.status === 'validation' ||
        save.status === 'denied' ||
        save.status === 'conflict') && (
        <p id="idea-validation" role="alert">
          {copy(save.status)}
        </p>
      )}
      {authority.record && (
        <form onSubmit={record} noValidate>
          <div className="ideas-fields">
            <label htmlFor="idea-description">
              {copy('description')}
              <textarea
                id="idea-description"
                required
                value={description}
                disabled={busy}
                aria-invalid={save.status === 'validation'}
                aria-describedby={
                  save.status === 'validation' ? 'idea-validation' : undefined
                }
                onChange={(event) => {
                  setDescription(event.target.value);
                  if (!busy) setSave({ status: 'idle' });
                }}
              />
            </label>
            <label htmlFor="idea-origin">
              {copy('origin')}
              <textarea
                id="idea-origin"
                required
                value={origin}
                disabled={busy}
                aria-invalid={save.status === 'validation'}
                aria-describedby={
                  save.status === 'validation' ? 'idea-validation' : undefined
                }
                onChange={(event) => {
                  setOrigin(event.target.value);
                  if (!busy) setSave({ status: 'idle' });
                }}
              />
            </label>
            <button type="submit" className="ideas-primary" disabled={busy}>
              {copy(save.status === 'saving' ? 'recording' : 'record')}
            </button>
          </div>
        </form>
      )}
      {page.status === 'loading' && <p role="status">{copy('loading')}</p>}
      {page.status !== 'ready' && page.status !== 'loading' && (
        <p role="alert">{copy(page.status)}</p>
      )}
      {page.status === 'ready' && (
        <div className="ideas-register">
          <p>
            {copy('label')}: {formatNumber(page.value.total)}
          </p>
          {page.value.ideas.length === 0 && <p>{copy('empty')}</p>}
          <ul className="ideas-list">
            {page.value.ideas.map((idea) => (
              <li key={idea.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={(event) => {
                    rowTrigger.current = event.currentTarget;
                    openingTrigger.current = event.currentTarget;
                    void open(idea.id);
                  }}
                >
                  {excerpt(idea.description)}
                </button>
                <span
                  className={`ideas-status ideas-status-${idea.disposition}`}
                >
                  {copy(idea.disposition)}
                </span>
              </li>
            ))}
          </ul>
          {page.value.nextCursor && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void loadList(page.value.nextCursor ?? undefined)}
            >
              {copy('next')}
            </button>
          )}
        </div>
      )}
      {detail?.status === 'loading' && <p role="status">{copy('loading')}</p>}
      {detail && detail.status !== 'loading' && detail.status !== 'ready' && (
        <p role="alert">{copy(detail.status)}</p>
      )}
      {selectedId && (
        <div className="ideas-actions">
          <button
            type="button"
            disabled={busy}
            onClick={() => void open(selectedId)}
          >
            {copy('reload')}
          </button>
          <button type="button" disabled={busy} onClick={close}>
            {copy('close')}
          </button>
        </div>
      )}
      {reviewSave.status === 'saved' && (
        <p role="status">{copy('saveConfirmed')}</p>
      )}
      {reviewSave.status === 'uncertain' && (
        <div role="alert">
          <p>{copy('uncertain')}</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void executeReview(reviewSave.intent)}
          >
            {copy('retry')}
          </button>
        </div>
      )}
      {(reviewSave.status === 'stale' ||
        reviewSave.status === 'conflict' ||
        reviewSave.status === 'validation' ||
        reviewSave.status === 'denied') && (
        <p id="idea-review-validation" role="alert">
          {copy(reviewSave.status)}
        </p>
      )}
      {detail?.status === 'ready' && (
        <article aria-label={copy('original')}>
          <h3 ref={heading} tabIndex={-1}>
            {copy('original')}
          </h3>
          <p className="ideas-literal">{detail.value.idea.description}</p>
          <p className="ideas-literal">{detail.value.idea.origin}</p>
          <p>
            {copy('submittedBy')}: {detail.value.idea.submittedBy.displayName}
          </p>
          <p>
            {copy('submittedAt')}:{' '}
            {formatDateTime(detail.value.idea.submittedAt)}
          </p>
          <p>
            <span
              className={`ideas-status ideas-status-${detail.value.idea.disposition}`}
            >
              {copy(detail.value.idea.disposition)}
            </span>{' '}
            · {copy('revision')} {formatNumber(detail.value.idea.revision)}
          </p>
          <h4>{copy('history')}</h4>
          {detail.value.history.entries.length === 0 && (
            <p>{copy('historyEmpty')}</p>
          )}
          <ol className="ideas-history">
            {detail.value.history.entries.map((entry) => (
              <li key={entry.id}>
                <strong>{copy(entry.kind)}</strong>
                <p className="ideas-literal">{entry.reason}</p>
                <p>
                  {entry.recordedBy.displayName} ·{' '}
                  {formatDateTime(entry.recordedAt)}
                </p>
                {entry.reconsiderationDate && (
                  <p>
                    {copy('date')}: {formatDate(entry.reconsiderationDate)}
                  </p>
                )}
              </li>
            ))}
          </ol>
          {detail.value.history.nextCursor && (
            <button
              type="button"
              disabled={busy}
              onClick={(event) => {
                openingTrigger.current = event.currentTarget;
                void open(detail.value.idea.id, {
                  cursor: detail.value.history.nextCursor ?? undefined,
                  preserveConfirmation: true,
                });
              }}
            >
              {copy('moreHistory')}
            </button>
          )}
          {authority.review && (
            <form onSubmit={review} noValidate>
              <p>{copy('reviewHelp')}</p>
              <div className="ideas-fields">
                <label htmlFor="idea-disposition">{copy('kind')}</label>
                <Select
                  id="idea-disposition"
                  value={kind}
                  options={[
                    { value: 'deferred', label: copy('deferred') },
                    { value: 'rejected', label: copy('rejected') },
                  ]}
                  disabled={
                    busy ||
                    reviewSave.status === 'stale' ||
                    reviewSave.status === 'conflict'
                  }
                  onValueChange={(value) => {
                    if (value === 'deferred' || value === 'rejected') {
                      setKind(value);
                      if (
                        reviewSave.status !== 'stale' &&
                        reviewSave.status !== 'conflict'
                      )
                        setReviewSave({ status: 'idle' });
                    }
                  }}
                />
                <label htmlFor="idea-reason">
                  {copy('reason')}
                  <textarea
                    id="idea-reason"
                    required
                    value={reason}
                    disabled={
                      busy ||
                      reviewSave.status === 'stale' ||
                      reviewSave.status === 'conflict'
                    }
                    aria-invalid={reviewSave.status === 'validation'}
                    aria-describedby={
                      reviewSave.status === 'validation'
                        ? 'idea-review-validation'
                        : undefined
                    }
                    onChange={(event) => {
                      setReason(event.target.value);
                      if (
                        reviewSave.status !== 'stale' &&
                        reviewSave.status !== 'conflict'
                      )
                        setReviewSave({ status: 'idle' });
                    }}
                  />
                </label>
                {kind === 'deferred' && (
                  <>
                    <label htmlFor="idea-date">
                      {copy('date')}
                      <input
                        id="idea-date"
                        type="date"
                        value={date}
                        disabled={
                          busy ||
                          reviewSave.status === 'stale' ||
                          reviewSave.status === 'conflict'
                        }
                        aria-describedby="idea-date-help"
                        onChange={(event) => {
                          setDate(event.target.value);
                          if (
                            reviewSave.status !== 'stale' &&
                            reviewSave.status !== 'conflict'
                          )
                            setReviewSave({ status: 'idle' });
                        }}
                      />
                    </label>
                    <small id="idea-date-help">{copy('dateHelp')}</small>
                  </>
                )}
                <button
                  type="submit"
                  className={
                    kind === 'rejected' ? 'ideas-reject' : 'ideas-primary'
                  }
                  disabled={
                    busy ||
                    reviewSave.status === 'stale' ||
                    reviewSave.status === 'conflict'
                  }
                >
                  {copy(
                    reviewSave.status === 'saving' ? 'recording' : 'review',
                  )}
                </button>
              </div>
            </form>
          )}
        </article>
      )}
    </section>
  );
}
function refusal(
  result: ApiResult<unknown>,
): 'error' | 'denied' | 'unavailable' {
  return result.status === 'forbidden' || result.status === 'unauthorized'
    ? 'denied'
    : result.status === 'notFound'
      ? 'unavailable'
      : 'error';
}
function excerpt(description: string): string {
  return (description.split('\n')[0]?.trim() || description.trim()).slice(
    0,
    140,
  );
}
