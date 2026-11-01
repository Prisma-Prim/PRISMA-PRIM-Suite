import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { opportunityFollowUpAuthority } from '../access/opportunity-follow-up-authority';
import type { OpportunityOutcomeStatus } from '../commercial-intake/opportunity-outcome';
import {
  isCalendarDate,
  isFollowUpReason,
  readFollowUpCurrent,
  readFollowUpHistory,
  readFollowUpReceipt,
  receiptMatches,
  sameFollowUpFact,
  type FollowUpCommand,
  type FollowUpCurrent,
  type FollowUpHistoryEntry,
  type FollowUpReceipt,
} from './follow-up-contract';
import { useFollowUpCopy } from './follow-up.copy';
import {
  useFollowUpLifetime,
  useFollowUpOwner,
  type FollowUpAccessProps,
  type FollowUpAuthority,
} from './follow-up-owner';
import {
  FollowUpEditor,
  type FollowUpDraft as Draft,
  type FollowUpAttempt as Attempt,
  type FollowUpEdit as Edit,
} from './FollowUpEditor';
import { FollowUpFact } from './FollowUpFact';
import { FollowUpHistory, type HistoryReadState } from './FollowUpHistory';
import './follow-up.css';

export type OpportunityFollowUpPanelProps = FollowUpAccessProps & {
  requestId: string;
  opportunityId: string;
  nativeVersion: number;
  nativeStatus: OpportunityOutcomeStatus;
  nativeOutcomeObservation: string;
  editorAvailable: boolean;
  onProtectedChange: (protectedEdit: boolean) => void;
};
type Read =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'denied' }
  | { kind: 'ready'; value: FollowUpCurrent };

export function OpportunityFollowUpPanel(props: OpportunityFollowUpPanelProps) {
  const authority = opportunityFollowUpAuthority(props.actor);
  const scope = JSON.stringify([
    authority?.key,
    props.requestId,
    props.opportunityId,
    props.nativeOutcomeObservation,
    props.identity.loaded,
    props.identity.signedIn,
  ]);
  const generation = useFollowUpLifetime(props, scope);
  if (!authority || !props.identity.loaded || !props.identity.signedIn)
    return null;
  return (
    <FollowUpPanelOwner key={generation} {...props} authority={authority} />
  );
}

function FollowUpPanelOwner(
  props: OpportunityFollowUpPanelProps & { authority: FollowUpAuthority },
) {
  const copy = useFollowUpCopy();
  const owner = useFollowUpOwner(props, props.authority);
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const historyHeading = useRef<HTMLHeadingElement>(null);
  const historyCursors = useRef(new Set<string>());
  const [read, setRead] = useState<Read>({ kind: 'loading' });
  const [edit, setEdit] = useState<Edit>({ kind: 'idle' });
  const [confirmed, setConfirmed] = useState<FollowUpReceipt | undefined>();
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [history, setHistory] = useState<FollowUpHistoryEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [historyState, setHistoryState] = useState<HistoryReadState>('idle');
  const [refreshing, setRefreshing] = useState(false);
  const protectedEdit = edit.kind !== 'idle';
  const protectedCallback = useRef(props.onProtectedChange);
  protectedCallback.current = props.onProtectedChange;
  useLayoutEffect(() => {
    if (!protectedEdit) return;
    protectedCallback.current(true);
    return () => protectedCallback.current(false);
  }, [protectedEdit]);
  const path = `/commercial-intake/opportunities/${encodeURIComponent(props.opportunityId)}/follow-up`;

  function deny() {
    setRead({ kind: 'denied' });
    setEdit({ kind: 'idle' });
    setConfirmed(undefined);
    setRefreshFailed(false);
    setHistory([]);
    setNextCursor(null);
    setHistoryState('idle');
  }

  async function refresh(keepConfirmation = false, focus = false) {
    historyCursors.current.clear();
    setRefreshing(true);
    setHistoryState('idle');
    if (!keepConfirmation) {
      setRead({ kind: 'loading' });
      setConfirmed(undefined);
    }
    const result = await owner.request(path);
    if (!owner.isLive() || result.status === 'retired') return;
    setRefreshing(false);
    if (
      result.status === 'forbidden' ||
      result.status === 'unauthorized' ||
      result.status === 'notFound'
    ) {
      deny();
      return;
    }
    const value =
      result.status === 'ok' ? readFollowUpCurrent(result.value) : undefined;
    if (
      !value ||
      value.opportunityId !== props.opportunityId ||
      value.requestId !== props.requestId
    ) {
      if (keepConfirmation) setRefreshFailed(true);
      else setRead({ kind: 'error' });
      return;
    }
    setRefreshFailed(false);
    setRead({ kind: 'ready', value });
    setHistory(value.history.entries);
    setNextCursor(value.history.nextCursor);
    if (focus) heading.current?.focus();
  }
  useEffect(() => {
    void refresh();
  }, []);

  function openEditor(current: FollowUpCurrent) {
    setConfirmed(undefined);
    setRefreshFailed(false);
    setEdit({
      kind: 'editing',
      draft: {
        date:
          current.head.state === 'RECORDED'
            ? (current.head.followUpOn ?? '')
            : '',
        reason: '',
      },
      invalid: false,
    });
  }

  async function send(attempt: Attempt) {
    setEdit({ kind: 'sending', attempt });
    const result = await owner.request(path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': attempt.key,
      },
      body: attempt.body,
    });
    if (!owner.isLive() || result.status === 'retired') return;
    if (
      result.status === 'forbidden' ||
      result.status === 'unauthorized' ||
      result.status === 'notFound'
    ) {
      deny();
      return;
    }
    if (result.status === 'conflict') {
      setEdit({ kind: 'conflict', attempt });
      heading.current?.focus();
      return;
    }
    if (result.status === 'validation') {
      setEdit({ kind: 'editing', draft: attempt.draft, invalid: true });
      return;
    }
    const receipt =
      result.status === 'ok' ? readFollowUpReceipt(result.value) : undefined;
    if (
      !receipt ||
      !receiptMatches(receipt, attempt.observed, attempt.command)
    ) {
      setEdit({ kind: 'uncertain', attempt });
      heading.current?.focus();
      return;
    }
    setConfirmed(receipt);
    setEdit({ kind: 'idle' });
    heading.current?.focus();
    await refresh(true);
  }
  function save(current: FollowUpCurrent, draft: Draft) {
    const followUpOn = draft.date === '' ? null : draft.date;
    const material =
      current.head.state === 'UNRECORDED' ||
      current.head.followUpOn !== followUpOn ||
      current.head.confirmedEpoch !== current.outcomeEpoch;
    const reason = draft.reason === '' ? null : draft.reason;
    if (
      (followUpOn !== null && !isCalendarDate(followUpOn)) ||
      (reason !== null && !isFollowUpReason(reason)) ||
      (current.head.state === 'RECORDED' && material && reason === null)
    ) {
      setEdit({ kind: 'editing', draft, invalid: true });
      return;
    }
    const command: FollowUpCommand = {
      expectedRevision: current.head.revision,
      observedOpportunityVersion: current.opportunityVersion,
      followUpOn,
      reason,
    };
    void send({
      draft,
      command,
      body: JSON.stringify(command),
      key: crypto.randomUUID(),
      observed: current,
    });
  }
  async function older(current: FollowUpCurrent, cursor: string) {
    historyCursors.current.add(cursor);
    setHistoryState('loading');
    const result = await owner.request(
      `${path}/history?cursor=${encodeURIComponent(cursor)}`,
    );
    if (!owner.isLive() || result.status === 'retired') return;
    if (
      result.status === 'forbidden' ||
      result.status === 'unauthorized' ||
      result.status === 'notFound'
    ) {
      deny();
      return;
    }
    if (result.status === 'conflict') {
      setHistoryState('changed');
      historyHeading.current?.focus();
      return;
    }
    const page =
      result.status === 'ok' ? readFollowUpHistory(result.value) : undefined;
    const previous = history.at(-1);
    const first = page?.entries[0];
    if (
      !page ||
      page.opportunityId !== props.opportunityId ||
      page.headRevision !== current.head.revision ||
      (page.nextCursor !== null &&
        historyCursors.current.has(page.nextCursor)) ||
      !previous ||
      !first ||
      first.revision !== previous.revision - 1 ||
      !sameFollowUpFact(previous.before, first.after) ||
      page.entries.some((entry) =>
        history.some((loaded) => loaded.commandId === entry.commandId),
      )
    ) {
      setHistoryState('error');
      return;
    }
    setHistory([...history, ...page.entries]);
    setNextCursor(page.nextCursor);
    setHistoryState('idle');
    historyHeading.current?.focus();
  }
  const current =
    read.kind === 'ready' && !refreshing && !refreshFailed
      ? read.value
      : undefined;
  const versionChanged =
    current && props.nativeVersion > current.opportunityVersion;
  const canEdit =
    current &&
    props.authority.canManage &&
    current.status === 'OPEN' &&
    props.nativeStatus === 'OPEN' &&
    historyState !== 'changed';
  const busy =
    refreshing || historyState === 'loading' || edit.kind === 'sending';
  return (
    <section className="opportunity-follow-up" aria-labelledby={`${id}-title`}>
      <h4 id={`${id}-title`} ref={heading} tabIndex={-1}>
        {copy('title')}
      </h4>
      {read.kind === 'loading' ? <p role="status">{copy('loading')}</p> : null}
      {read.kind === 'denied' ? <p role="alert">{copy('denied')}</p> : null}
      {read.kind === 'error' ? <p role="alert">{copy('loadError')}</p> : null}
      {confirmed ? (
        <div role="status">
          <p>{copy(confirmed.outcome === 'updated' ? 'saved' : 'unchanged')}</p>
          <FollowUpFact fact={confirmed.fact} />
        </div>
      ) : null}
      {refreshFailed ? <p role="alert">{copy('refreshFailed')}</p> : null}
      {current ? (
        <>
          <FollowUpFact fact={current.head} />
          {current.head.state === 'RECORDED' ? (
            <p>
              {copy(
                current.status === 'OPEN' &&
                  current.head.confirmedEpoch === current.outcomeEpoch
                  ? 'confirmed'
                  : 'stale',
              )}
            </p>
          ) : null}
          {!props.authority.canManage ? <p>{copy('readOnly')}</p> : null}
          {current.status !== 'OPEN' || props.nativeStatus !== 'OPEN' ? (
            <p>{copy('notOpen')}</p>
          ) : null}
          {versionChanged || edit.kind === 'conflict' ? (
            <p role="alert">{copy('conflict')}</p>
          ) : null}
          {edit.kind === 'idle' && canEdit ? (
            <button
              type="button"
              className="commercial-intake-secondary-action"
              disabled={
                !props.editorAvailable || busy || Boolean(versionChanged)
              }
              onClick={() => openEditor(current)}
            >
              {copy(current.head.state === 'UNRECORDED' ? 'record' : 'edit')}
            </button>
          ) : null}
          {edit.kind !== 'idle' ? (
            <FollowUpEditor
              edit={edit}
              disabled={busy || Boolean(versionChanged)}
              onChange={(draft) =>
                setEdit({ kind: 'editing', draft, invalid: false })
              }
              onSave={(draft) => save(current, draft)}
              onRetry={(attempt) => void send(attempt)}
              onCancel={() => {
                const review =
                  edit.kind === 'uncertain' || edit.kind === 'conflict';
                setEdit({ kind: 'idle' });
                if (review) void refresh(false, true);
                else heading.current?.focus();
              }}
            />
          ) : null}
          <FollowUpHistory
            id={`${id}-history`}
            heading={historyHeading}
            entries={history}
            nextCursor={nextCursor}
            state={historyState}
            disabled={busy || protectedEdit}
            onOlder={(cursor) => void older(current, cursor)}
          />
        </>
      ) : null}
      {read.kind !== 'denied' && read.kind !== 'loading' ? (
        <button
          type="button"
          className="commercial-intake-secondary-action"
          disabled={busy || (protectedEdit && edit.kind !== 'conflict')}
          onClick={() => {
            setEdit({ kind: 'idle' });
            void refresh(Boolean(confirmed), true);
          }}
        >
          {copy('reload')}
        </button>
      ) : null}
    </section>
  );
}
