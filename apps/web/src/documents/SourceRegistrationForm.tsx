import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import { useAuthorityLifetime } from '../access/use-authority-lifetime';
import { runLatestAuthenticatedRequest } from '../api/latest-authenticated-request';
import { useScopedOperation } from '../api/use-scoped-operation';
import { Select } from '../presentation/Select';
import { useDocumentsCopy } from './documents.copy';
import {
  readDocumentDetail,
  type WorkingDocumentDetail,
} from './document-response';
import {
  useSourceRegistrationCopies,
  type SourceRegistrationAdapter,
  type SourceFieldLayout,
} from './source-registration';

export type SourceRegistrationProps = {
  actor: ActorContext;
  identity: BrowserIdentity;
  companyId: string;
  onBusyChange: (busy: boolean) => void;
  onRegistered: (document: WorkingDocumentDetail) => Promise<void> | void;
  onStarted: () => void;
  onAccessRejected: (
    signal: AbortSignal,
    isCurrent?: () => boolean,
  ) => Promise<void> | void;
};
type Props<Source> = SourceRegistrationProps & {
  adapter: SourceRegistrationAdapter<Source>;
};
type Command = {
  key: string;
  body: string;
  confirms(document: WorkingDocumentDetail): boolean;
};
type Attempt =
  | { status: 'editable'; refused?: true }
  | { status: 'pending' | 'uncertain'; command: Command }
  | { status: 'denied' | 'confirmed' };
type Sources<Source> =
  | { status: 'loading' | 'error' | 'denied' }
  | { status: 'ready'; page: { sources: Source[]; nextCursor: string | null } };
type Capture = ReturnType<typeof useAuthorityLifetime>;

export function SourceRegistrationForm<Source>(props: Props<Source>) {
  const signature = JSON.stringify([
    props.adapter.family,
    props.adapter.authority(props.actor),
    props.companyId,
    props.identity.loaded,
    props.identity.signedIn,
  ]);
  const captureOwner = useAuthorityLifetime(signature, props.identity);
  const captureRecovery = useAuthorityLifetime(
    JSON.stringify(props.actor),
    props.identity,
  );
  const [owner, setOwner] = useState({
    signature,
    identity: props.identity,
    generation: 0,
  });
  if (owner.signature !== signature || owner.identity !== props.identity) {
    setOwner({
      signature,
      identity: props.identity,
      generation: owner.generation + 1,
    });
  }
  return (
    <RegistrationSession
      key={JSON.stringify([signature, owner.generation])}
      {...props}
      captureOwner={captureOwner}
      captureRecovery={captureRecovery}
    />
  );
}

function RegistrationSession<Source>({
  actor,
  identity,
  companyId,
  adapter,
  captureOwner,
  captureRecovery,
  ...callbacks
}: Props<Source> & { captureOwner: Capture; captureRecovery: Capture }) {
  const copies = useSourceRegistrationCopies();
  const copy = adapter.copy(copies),
    view = adapter.presentation(copies),
    documentCopy = useDocumentsCopy(),
    id = useId();
  const allowed =
    identity.loaded &&
    identity.signedIn &&
    actor.activeCompany?.id === companyId &&
    adapter.canRegister(actor);
  const [sources, setSources] = useState<Sources<Source>>({
    status: 'loading',
  });
  const [page, setPage] = useState<{ cursor?: string; revision: number }>({
    revision: 0,
  });
  const [selected, setSelected] = useState<Source>();
  const [title, setTitle] = useState(''),
    [purpose, setPurpose] = useState('');
  const [sourceDescription, setSourceDescription] = useState(''),
    [receivedOn, setReceivedOn] = useState('');
  const [attempt, setAttempt] = useState<Attempt>({ status: 'editable' });
  const sourceRead = useScopedOperation(
    JSON.stringify([adapter.family, companyId, page]),
  );
  const registration = useScopedOperation(
    JSON.stringify([adapter.family, companyId]),
  );
  const pending = useRef<AbortSignal | undefined>(undefined),
    sending = useRef(false);
  const callbacksRef = useRef(callbacks),
    message = useRef<HTMLParagraphElement>(null);
  callbacksRef.current = callbacks;
  const busy = attempt.status === 'pending' || attempt.status === 'uncertain';
  useEffect(
    () => () => {
      callbacksRef.current.onBusyChange(false);
    },
    [],
  );
  useEffect(() => {
    if (!allowed) return;
    const signal = sourceRead.begin();
    if (!signal) return;
    const owner = captureOwner(),
      recovery = captureRecovery();
    const current = () => !signal.aborted && owner();
    const currentRecovery = () => current() && recovery();
    setSources({ status: 'loading' });
    void runLatestAuthenticatedRequest({
      identity,
      signal,
      execute: async (api) => {
        if (!current()) throw new Error('Retired source selection');
        return api.request(
          adapter.endpoint +
            (page.cursor ? '?cursor=' + encodeURIComponent(page.cursor) : ''),
          {
            companyContextId: companyId,
            signal,
            cache: 'no-store',
          },
        );
      },
      onResult: async (result) => {
        if (!current()) return;
        if (result.status === 'unauthorized') {
          setSources({ status: 'denied' });
          if (currentRecovery()) await identity.rejectSession();
          return;
        }
        if (result.status === 'forbidden' || result.status === 'notFound') {
          setSources({ status: 'denied' });
          if (currentRecovery())
            await callbacksRef.current.onAccessRejected(
              signal,
              currentRecovery,
            );
          return;
        }
        if (result.status !== 'ok')
          throw new Error('Source selection unavailable');
        const next = adapter.readSources(result.value);
        if (current()) setSources({ status: 'ready', page: next });
      },
      onError: () => {
        if (current())
          setSources((previous) =>
            previous.status === 'denied' ? previous : { status: 'error' },
          );
      },
    });
  }, [
    adapter,
    allowed,
    captureOwner,
    captureRecovery,
    companyId,
    identity,
    page,
    sourceRead,
  ]);
  useEffect(() => {
    const owner = captureOwner();
    if (
      view.focusErrors &&
      owner() &&
      (attempt.status === 'uncertain' ||
        (attempt.status === 'editable' && attempt.refused))
    )
      message.current?.focus();
  }, [attempt, captureOwner, view.focusErrors]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (
      !allowed ||
      sending.current ||
      attempt.status === 'pending' ||
      attempt.status === 'denied' ||
      attempt.status === 'confirmed'
    )
      return;
    let command: Command;
    if (attempt.status === 'uncertain') command = attempt.command;
    else {
      if (!selected) return;
      try {
        command = {
          key: crypto.randomUUID(),
          ...adapter.prepare({
            source: selected,
            fields: { title, purpose, sourceDescription, receivedOn },
            actor,
            companyId,
          }),
        };
      } catch {
        setAttempt({ status: 'editable', refused: true });
        return;
      }
    }
    const signal = registration.begin();
    if (!signal) return;
    if (attempt.status === 'editable') callbacksRef.current.onStarted();
    const owner = captureOwner(),
      recovery = captureRecovery();
    const current = () => !signal.aborted && owner();
    const currentRecovery = () => current() && recovery();
    pending.current = signal;
    sending.current = true;
    setAttempt({ status: 'pending', command });
    callbacksRef.current.onBusyChange(true);
    let unresolved = true;
    await runLatestAuthenticatedRequest({
      identity,
      signal,
      execute: async (api) => {
        if (!current()) throw new Error('Retired registration');
        return api.request('/documents', {
          method: 'POST',
          companyContextId: companyId,
          signal,
          headers: {
            'content-type': 'application/json',
            'idempotency-key': command.key,
          },
          body: command.body,
        });
      },
      onResult: async (result) => {
        if (!current()) return;
        if (result.status === 'unauthorized') {
          unresolved = false;
          setAttempt({ status: 'denied' });
          callbacksRef.current.onBusyChange(false);
          if (currentRecovery()) await identity.rejectSession();
          return;
        }
        if (result.status === 'forbidden' || result.status === 'notFound') {
          unresolved = false;
          setAttempt({ status: 'denied' });
          setSelected(undefined);
          setSourceDescription('');
          setReceivedOn('');
          callbacksRef.current.onBusyChange(false);
          if (currentRecovery())
            await callbacksRef.current.onAccessRejected(
              signal,
              currentRecovery,
            );
          return;
        }
        if (result.status === 'validation' || result.status === 'conflict') {
          unresolved = false;
          setAttempt({ status: 'editable', refused: true });
          callbacksRef.current.onBusyChange(false);
          return;
        }
        if (result.status !== 'ok') throw new Error('Uncertain registration');
        const saved = readDocumentDetail(result.value);
        if (!current()) return;
        if (!command.confirms(saved)) throw new Error('Uncertain registration');
        unresolved = false;
        setAttempt({ status: 'confirmed' });
        callbacksRef.current.onBusyChange(false);
        await callbacksRef.current.onRegistered(saved);
      },
      onError: () => {
        if (current() && unresolved)
          setAttempt({ status: 'uncertain', command });
      },
    });
    if (pending.current === signal) {
      pending.current = undefined;
      sending.current = false;
    }
  }
  if (!allowed || attempt.status === 'denied' || sources.status === 'denied')
    return <p role="alert">{copy.t('sourceDenied')}</p>;
  if (attempt.status === 'confirmed')
    return <p role="status">{copy.t('confirmed')}</p>;
  const invalid = attempt.status === 'editable' && attempt.refused === true;
  const describedBy = invalid && view.focusErrors ? `${id}-error` : undefined;
  const fieldInvalid = (view.focusErrors && invalid) || undefined;
  const details = selected && adapter.details?.render(selected, actor, copies);
  return (
    <form
      className={view.className}
      style={view.style}
      onSubmit={(event) => void submit(event)}
    >
      {view.warning && (
        <p className="working-documents-warning">{view.warning}</p>
      )}
      {sources.status === 'loading' && <p role="status">{copy.t('loading')}</p>}
      {sources.status === 'error' && (
        <>
          <p role="alert">{copy.t('loadFailed')}</p>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              setPage((value) => ({ ...value, revision: value.revision + 1 }))
            }
          >
            {copy.t('retryLoad')}
          </button>
        </>
      )}
      {sources.status === 'ready' && sources.page.sources.length === 0 && (
        <p>{copy.t('sourceUnavailable')}</p>
      )}
      {adapter.details?.placement === 'before-picker' && details}
      <RegistrationField
        layout={view.fields.selection}
        label={copy.t('exactVersion')}
        htmlFor={`${id}-version`}
      >
        <Select
          id={`${id}-version`}
          value={selected ? adapter.sourceId(selected) : ''}
          required
          disabled={
            busy || sources.status !== 'ready' || !sources.page.sources.length
          }
          placeholder={copy.t('selectVersion')}
          invalid={fieldInvalid}
          describedBy={describedBy}
          options={
            sources.status === 'ready'
              ? sources.page.sources.map((source) => ({
                  value: adapter.sourceId(source),
                  label: adapter.sourceLabel(source, copies),
                }))
              : []
          }
          onValueChange={(value) => {
            if (!busy && sources.status === 'ready')
              setSelected(
                sources.page.sources.find(
                  (source) => adapter.sourceId(source) === value,
                ),
              );
          }}
        />
      </RegistrationField>
      {sources.status === 'ready' && sources.page.nextCursor && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setSelected(undefined);
            setPage((value) => ({
              cursor: sources.page.nextCursor ?? undefined,
              revision: value.revision + 1,
            }));
          }}
        >
          {copy.t('loadNext')}
        </button>
      )}
      {adapter.details?.placement === 'after-picker' && details}
      <RegistrationField
        layout={view.fields.title}
        label={documentCopy.titleLabel}
        htmlFor={`${id}-title`}
      >
        <input
          id={`${id}-title`}
          required
          maxLength={200}
          disabled={busy}
          value={title}
          aria-invalid={fieldInvalid}
          aria-describedby={describedBy}
          onChange={(event) => setTitle(event.target.value)}
        />
      </RegistrationField>
      <RegistrationField
        layout={view.fields.purpose}
        label={documentCopy.purpose}
        htmlFor={`${id}-purpose`}
      >
        <textarea
          id={`${id}-purpose`}
          required
          maxLength={2000}
          disabled={busy}
          value={purpose}
          aria-invalid={fieldInvalid}
          aria-describedby={describedBy}
          onChange={(event) => setPurpose(event.target.value)}
        />
      </RegistrationField>
      <RegistrationField
        layout={view.fields.source}
        label={copy.t('declaredSource')}
        htmlFor={`${id}-source`}
      >
        <textarea
          id={`${id}-source`}
          required
          maxLength={2000}
          disabled={busy}
          value={sourceDescription}
          aria-invalid={fieldInvalid}
          aria-describedby={describedBy}
          onChange={(event) => setSourceDescription(event.target.value)}
        />
      </RegistrationField>
      <RegistrationField
        layout={view.fields.received}
        label={copy.t('receivedOn')}
        htmlFor={`${id}-received`}
      >
        <input
          id={`${id}-received`}
          {...(view.date.kind === 'native'
            ? {
                type: 'date',
                ...(view.date.bounded
                  ? { min: '0001-01-01', max: '9999-12-31' }
                  : {}),
              }
            : { inputMode: 'numeric', maxLength: 10 })}
          disabled={busy}
          value={receivedOn}
          aria-invalid={fieldInvalid}
          aria-describedby={
            view.date.kind === 'text'
              ? `${id}-date-hint${describedBy ? ' ' + describedBy : ''}`
              : describedBy
          }
          onChange={(event) => setReceivedOn(event.target.value)}
        />
      </RegistrationField>
      {view.date.kind === 'text' && (
        <p id={`${id}-date-hint`}>{view.date.hint}</p>
      )}
      {(invalid || attempt.status === 'uncertain') && (
        <p
          id={`${id}-error`}
          ref={message}
          role="alert"
          tabIndex={view.focusErrors ? -1 : undefined}
        >
          {copy.t(attempt.status === 'uncertain' ? 'uncertain' : 'invalid')}
        </p>
      )}
      <button
        disabled={
          attempt.status === 'pending' ||
          (!selected && attempt.status !== 'uncertain')
        }
      >
        {attempt.status === 'pending' && view.pendingLabel
          ? view.pendingLabel
          : copy.t(attempt.status === 'uncertain' ? 'retry' : 'register')}
      </button>
    </form>
  );
}

function RegistrationField({
  layout,
  label,
  htmlFor,
  children,
}: {
  layout: SourceFieldLayout;
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  switch (layout) {
    case 'label':
      return (
        <label htmlFor={htmlFor}>
          {label}
          {children}
        </label>
      );
    case 'separate':
      return (
        <>
          <label htmlFor={htmlFor}>{label}</label>
          {children}
        </>
      );
    case 'grouped':
      return (
        <div className="working-document-field">
          <label htmlFor={htmlFor}>{label}</label>
          {children}
        </div>
      );
    default: {
      const exhaustive: never = layout;
      return exhaustive;
    }
  }
}
