import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import { useAuthorityLifetime } from '../access/use-authority-lifetime';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import { Select } from '../presentation/Select';
import { useDocumentsCopy } from './documents.copy';
import {
  readDocumentDetail,
  type WorkingDocumentDetail,
} from './document-response';
import {
  canReadReceivedAddendumRelation,
  receivedAddendumSourceAuthority,
} from './received-addendum-access';
import {
  readReceivedAddendumMetadata,
  readReceivedAddendumSources,
  type ReceivedAddendumSourcePage,
} from './received-addendum-response';
import { useReceivedAddendumCopy } from './received-addendum.copy';

type Props = {
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
type Source = ReceivedAddendumSourcePage['sources'][number];
type Command = {
  key: string;
  body: string;
  source: Source;
  metadata: ReturnType<typeof readReceivedAddendumMetadata>;
};
type Attempt =
  | { status: 'editable'; refused?: true }
  | { status: 'pending' | 'uncertain'; command: Command }
  | { status: 'denied' | 'confirmed' };
type Sources =
  | { status: 'loading' | 'error' | 'denied' }
  | { status: 'ready'; page: ReceivedAddendumSourcePage };
type Capture = ReturnType<typeof useAuthorityLifetime>;

/** A replacement retires the complete source intent, including A → B → A. */
export function ReceivedAddendumRegistration(props: Props) {
  const signature = JSON.stringify([
    receivedAddendumSourceAuthority(props.actor),
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
function RegistrationSession({
  actor,
  identity,
  companyId,
  captureOwner,
  captureRecovery,
  ...callbacks
}: Props & { captureOwner: Capture; captureRecovery: Capture }) {
  const copy = useReceivedAddendumCopy(),
    documentCopy = useDocumentsCopy(),
    id = useId();
  const allowed =
    identity.loaded &&
    identity.signedIn &&
    actor.activeCompany?.id === companyId &&
    canReadReceivedAddendumRelation(actor) &&
    actor.activeCompany?.documentPermissions?.includes('document.register') ===
      true;
  const [sources, setSources] = useState<Sources>({ status: 'loading' });
  const [page, setPage] = useState<{ cursor?: string; revision: number }>({
    revision: 0,
  });
  const [selected, setSelected] = useState<Source>();
  const [title, setTitle] = useState(''),
    [purpose, setPurpose] = useState('');
  const [sourceDescription, setSourceDescription] = useState(''),
    [receivedOn, setReceivedOn] = useState('');
  const [attempt, setAttempt] = useState<Attempt>({ status: 'editable' });
  const pending = useRef<AbortController | undefined>(undefined),
    sending = useRef(false);
  const callbacksRef = useRef(callbacks),
    message = useRef<HTMLParagraphElement>(null);
  callbacksRef.current = callbacks;
  const busy = attempt.status === 'pending' || attempt.status === 'uncertain';
  useEffect(
    () => () => {
      pending.current?.abort();
      callbacksRef.current.onBusyChange(false);
    },
    [],
  );
  useEffect(() => {
    if (!allowed) return;
    const request = new AbortController(),
      owner = captureOwner(),
      recovery = captureRecovery();
    const current = () => !request.signal.aborted && owner();
    const currentRecovery = () => current() && recovery();
    setSources({ status: 'loading' });
    void (async () => {
      try {
        const api = await createAuthenticatedApiClient(identity);
        if (!current()) return;
        const result = await api.request<unknown>(
          '/documents/received-addendum-sources' +
            (page.cursor ? '?cursor=' + encodeURIComponent(page.cursor) : ''),
          {
            companyContextId: companyId,
            signal: request.signal,
            cache: 'no-store',
          },
        );
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
              request.signal,
              currentRecovery,
            );
          return;
        }
        if (result.status !== 'ok')
          throw new Error('Parent sources unavailable');
        const next = readReceivedAddendumSources(result.value);
        if (current()) setSources({ status: 'ready', page: next });
      } catch {
        if (current())
          setSources((previous) =>
            previous.status === 'denied' ? previous : { status: 'error' },
          );
      }
    })();
    return () => request.abort();
  }, [allowed, captureOwner, captureRecovery, companyId, identity, page]);
  useEffect(() => {
    const owner = captureOwner();
    if (
      owner() &&
      (attempt.status === 'uncertain' ||
        (attempt.status === 'editable' && attempt.refused))
    )
      message.current?.focus();
  }, [attempt, captureOwner]);

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
        const metadata = readReceivedAddendumMetadata({
          title,
          purpose,
          sourceDescription,
          receivedOn: receivedOn || null,
        });
        command = {
          key: crypto.randomUUID(),
          source: selected,
          metadata,
          body: JSON.stringify({
            type: 'received-addendum',
            parentContractId: selected.parentContractId,
            parentContractVersionId: selected.parentContractVersionId,
            title,
            purpose,
            sourceDescription,
            receivedOn: receivedOn || null,
          }),
        };
      } catch {
        setAttempt({ status: 'editable', refused: true });
        return;
      }
      callbacksRef.current.onStarted();
    }
    const request = new AbortController(),
      owner = captureOwner(),
      recovery = captureRecovery();
    const current = () => !request.signal.aborted && owner();
    const currentRecovery = () => current() && recovery();
    pending.current = request;
    sending.current = true;
    setAttempt({ status: 'pending', command });
    callbacksRef.current.onBusyChange(true);
    let unresolved = true;
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (!current()) return;
      const result = await api.request<unknown>('/documents', {
        method: 'POST',
        companyContextId: companyId,
        signal: request.signal,
        headers: {
          'content-type': 'application/json',
          'idempotency-key': command.key,
        },
        body: command.body,
      });
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
            request.signal,
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
      const uuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
      if (
        saved.type !== 'received-addendum' ||
        !uuid.test(saved.id) ||
        !uuid.test(saved.version.id) ||
        saved.companyId !== companyId ||
        saved.clientId !== command.source.clientId ||
        saved.receivedAddendumRelation.access !== 'granted'
      )
        throw new Error('Uncertain registration');
      const relation = saved.receivedAddendumRelation;
      if (
        relation.parentContractId !== command.source.parentContractId ||
        relation.parentContractVersionId !==
          command.source.parentContractVersionId ||
        relation.contractVersionNumber !==
          command.source.contractVersionNumber ||
        relation.illustrativeReference !==
          command.source.illustrativeReference ||
        JSON.stringify(relation.recordedRecipient) !==
          JSON.stringify(command.source.recordedRecipient) ||
        relation.sourceDescription !== command.metadata.sourceDescription ||
        relation.receivedOn !== command.metadata.receivedOn ||
        relation.registeredBy.workspaceMembershipId !==
          actor.workspaceMembershipId ||
        relation.registeredBy.internalUserId !== actor.internalUserId
      )
        throw new Error('Uncertain registration');
      unresolved = false;
      setAttempt({ status: 'confirmed' });
      callbacksRef.current.onBusyChange(false);
      await callbacksRef.current.onRegistered(saved);
    } catch {
      if (current() && unresolved) setAttempt({ status: 'uncertain', command });
    } finally {
      if (pending.current === request) {
        pending.current = undefined;
        sending.current = false;
      }
    }
  }
  if (!allowed || attempt.status === 'denied' || sources.status === 'denied')
    return <p role="alert">{copy.t('sourceDenied')}</p>;
  if (attempt.status === 'confirmed')
    return <p role="status">{copy.t('confirmed')}</p>;
  const invalid = attempt.status === 'editable' && attempt.refused === true;
  const describedBy = invalid ? `${id}-error` : undefined;
  return (
    <form
      className="working-document-registration"
      style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}
      onSubmit={(event) => void submit(event)}
    >
      <p className="working-documents-warning">{copy.t('warning')}</p>
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
      <label htmlFor={`${id}-parent`}>{copy.t('exactVersion')}</label>
      <Select
        id={`${id}-parent`}
        value={selected?.parentContractVersionId ?? ''}
        required
        disabled={
          busy || sources.status !== 'ready' || !sources.page.sources.length
        }
        placeholder={copy.t('selectVersion')}
        invalid={invalid}
        describedBy={describedBy}
        options={
          sources.status === 'ready'
            ? sources.page.sources.map((source) => ({
                value: source.parentContractVersionId,
                label: `${copy.versionLabel(source.illustrativeReference, source.contractVersionNumber)} · ${source.clientDisplayName} · ${source.recordedRecipient.legalName} · ${source.opportunityTitle}`,
              }))
            : []
        }
        onValueChange={(value) => {
          if (!busy && sources.status === 'ready')
            setSelected(
              sources.page.sources.find(
                (source) => source.parentContractVersionId === value,
              ),
            );
        }}
      />
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
      {selected && (
        <dl className="working-document-party">
          <dt>{copy.t('company')}</dt>
          <dd className="working-document-literal">
            {actor.activeCompany?.displayName}
          </dd>
          <dt>{copy.t('client')}</dt>
          <dd className="working-document-literal">
            {selected.clientDisplayName}
          </dd>
          <dt>{copy.t('opportunity')}</dt>
          <dd className="working-document-literal">
            {selected.opportunityTitle}
          </dd>
          <dt>
            {copy.t('recipient')} ·{' '}
            {copy.t(
              selected.recordedRecipient.kind === 'PRIMARY'
                ? 'primaryRecipient'
                : 'additionalRecipient',
            )}
          </dt>
          <dd className="working-document-literal">
            {selected.recordedRecipient.legalName}
          </dd>
          {selected.recordedRecipient.taxId !== null && (
            <>
              <dt>{copy.t('taxId')}</dt>
              <dd className="working-document-literal">
                {selected.recordedRecipient.taxId}
              </dd>
            </>
          )}
          {selected.recordedRecipient.legalAddress !== null && (
            <>
              <dt>{copy.t('legalAddress')}</dt>
              <dd className="working-document-literal">
                {selected.recordedRecipient.legalAddress}
              </dd>
            </>
          )}
        </dl>
      )}
      <label htmlFor={`${id}-title`}>{documentCopy.titleLabel}</label>
      <input
        id={`${id}-title`}
        required
        maxLength={200}
        disabled={busy}
        value={title}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(event) => setTitle(event.target.value)}
      />
      <label htmlFor={`${id}-purpose`}>{documentCopy.purpose}</label>
      <textarea
        id={`${id}-purpose`}
        required
        maxLength={2000}
        disabled={busy}
        value={purpose}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(event) => setPurpose(event.target.value)}
      />
      <label htmlFor={`${id}-source`}>{copy.t('declaredSource')}</label>
      <textarea
        id={`${id}-source`}
        required
        maxLength={2000}
        disabled={busy}
        value={sourceDescription}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(event) => setSourceDescription(event.target.value)}
      />
      <label htmlFor={`${id}-received`}>{copy.t('receivedOn')}</label>
      <input
        id={`${id}-received`}
        inputMode="numeric"
        maxLength={10}
        disabled={busy}
        value={receivedOn}
        aria-invalid={invalid || undefined}
        aria-describedby={`${id}-date-hint${describedBy ? ' ' + describedBy : ''}`}
        onChange={(event) => setReceivedOn(event.target.value)}
      />
      <p id={`${id}-date-hint`}>{copy.t('dateHint')}</p>
      {(invalid || attempt.status === 'uncertain') && (
        <p id={`${id}-error`} ref={message} role="alert" tabIndex={-1}>
          {copy.t(attempt.status === 'uncertain' ? 'uncertain' : 'invalid')}
        </p>
      )}
      <button
        disabled={
          attempt.status === 'pending' ||
          (!selected && attempt.status !== 'uncertain')
        }
      >
        {copy.t(
          attempt.status === 'pending'
            ? 'pending'
            : attempt.status === 'uncertain'
              ? 'retry'
              : 'register',
        )}
      </button>
    </form>
  );
}
