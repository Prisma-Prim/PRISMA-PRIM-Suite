import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { BrowserIdentity } from '../access-composition';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import { Select } from '../presentation/Select';
import { ExternalInvoiceParty } from './ExternalInvoiceParty';
import { useDocumentsCopy } from './documents.copy';
import {
  readDocumentDetail,
  type WorkingDocumentDetail,
} from './document-response';
import { useExternalInvoiceCopy } from './external-invoice.copy';
import {
  readExternalInvoiceSources,
  type ExternalInvoiceSourcePage,
} from './external-invoice-response';

type Source = ExternalInvoiceSourcePage['sources'][number];
type Command = {
  body: string;
  key: string;
  source: Source;
  sourceDescription: string;
  receivedOn: string | null;
};
type Attempt =
  | { status: 'editable'; refused?: true }
  | { status: 'pending' | 'uncertain'; command: Command }
  | { status: 'denied' | 'confirmed' };
type Sources =
  | { status: 'loading' | 'error' | 'denied' }
  | { status: 'ready'; page: ExternalInvoiceSourcePage };

/** Owns the immutable source intent and its identical uncertain retry. */
export function ExternalInvoiceRegistration({
  identity,
  companyId,
  onBusyChange,
  onRegistered,
  onStarted,
  onAccessRejected,
}: {
  identity: BrowserIdentity;
  companyId: string;
  onBusyChange: (busy: boolean) => void;
  onRegistered: (document: WorkingDocumentDetail) => void;
  onStarted: () => void;
  onAccessRejected: (signal: AbortSignal) => Promise<void> | void;
}) {
  const copy = useExternalInvoiceCopy();
  const id = useId();
  const documentCopy = useDocumentsCopy();
  const [sources, setSources] = useState<Sources>({ status: 'loading' });
  const [page, setPage] = useState<{ cursor?: string; revision: number }>({
    revision: 0,
  });
  const [selected, setSelected] = useState<Source>();
  const [title, setTitle] = useState('');
  const [purpose, setPurpose] = useState('');
  const [sourceDescription, setSourceDescription] = useState('');
  const [receivedOn, setReceivedOn] = useState('');
  const [attempt, setAttempt] = useState<Attempt>({ status: 'editable' });
  const pending = useRef<AbortController | undefined>(undefined);
  const rejectAccess = useRef(onAccessRejected);
  rejectAccess.current = onAccessRejected;
  const busy = attempt.status === 'pending' || attempt.status === 'uncertain';
  useEffect(
    () => () => {
      pending.current?.abort();
      onBusyChange(false);
    },
    [onBusyChange],
  );
  useEffect(() => {
    const request = new AbortController();
    setSources({ status: 'loading' });
    void (async () => {
      try {
        const api = await createAuthenticatedApiClient(identity);
        if (request.signal.aborted) return;
        const result = await api.request<unknown>(
          '/documents/external-invoice-sources' +
            (page.cursor ? '?cursor=' + encodeURIComponent(page.cursor) : ''),
          { companyContextId: companyId, signal: request.signal },
        );
        if (request.signal.aborted) return;
        if (result.status === 'unauthorized') {
          await identity.rejectSession();
          return;
        }
        if (result.status === 'forbidden' || result.status === 'notFound') {
          setSources({ status: 'denied' });
          await rejectAccess.current(request.signal);
          return;
        }
        if (result.status !== 'ok')
          throw new Error('Source selection unavailable');
        setSources({
          status: 'ready',
          page: readExternalInvoiceSources(result.value),
        });
      } catch {
        if (!request.signal.aborted) setSources({ status: 'error' });
      }
    })();
    return () => request.abort();
    // Locale/frame and unrelated capabilities do not own this source read.
    // The parent keys this owner by the precise source authority and scope.
  }, [companyId, identity, page]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (
      attempt.status === 'pending' ||
      attempt.status === 'denied' ||
      attempt.status === 'confirmed'
    )
      return;
    const command =
      attempt.status === 'uncertain'
        ? attempt.command
        : selected
          ? {
              key: crypto.randomUUID(),
              source: selected,
              sourceDescription: sourceDescription.trim(),
              receivedOn: receivedOn || null,
              body: JSON.stringify({
                type: 'external-invoice',
                opportunityId: selected.opportunityId,
                contractId: selected.contractId,
                contractVersionId: selected.contractVersionId,
                title,
                purpose,
                sourceDescription,
                receivedOn: receivedOn || null,
              }),
            }
          : undefined;
    if (!command) return;
    if (attempt.status === 'editable') onStarted();
    const request = new AbortController();
    pending.current = request;
    setAttempt({ status: 'pending', command });
    onBusyChange(true);
    let confirmed = false;
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (request.signal.aborted) return;
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
      if (request.signal.aborted) return;
      if (result.status === 'unauthorized') {
        await identity.rejectSession();
        return;
      }
      if (result.status === 'forbidden' || result.status === 'notFound') {
        setAttempt({ status: 'denied' });
        setSelected(undefined);
        setSourceDescription('');
        setReceivedOn('');
        onBusyChange(false);
        await rejectAccess.current(request.signal);
        return;
      }
      if (result.status === 'validation' || result.status === 'conflict') {
        setAttempt({ status: 'editable', refused: true });
        onBusyChange(false);
        return;
      }
      if (result.status !== 'ok') throw new Error('Uncertain registration');
      const saved = readDocumentDetail(result.value);
      if (
        saved.type !== 'external-invoice' ||
        saved.companyId !== companyId ||
        saved.clientId !== command.source.clientId ||
        saved.externalInvoiceRelation.access !== 'granted' ||
        saved.externalInvoiceRelation.opportunityId !==
          command.source.opportunityId ||
        saved.externalInvoiceRelation.contractId !==
          command.source.contractId ||
        saved.externalInvoiceRelation.contractVersionId !==
          command.source.contractVersionId ||
        saved.externalInvoiceRelation.contractVersionNumber !==
          command.source.contractVersionNumber ||
        saved.externalInvoiceRelation.illustrativeReference !==
          command.source.illustrativeReference ||
        saved.externalInvoiceRelation.sourceDescription !==
          command.sourceDescription ||
        saved.externalInvoiceRelation.receivedOn !== command.receivedOn ||
        JSON.stringify(saved.externalInvoiceRelation.recordedRecipient) !==
          JSON.stringify(command.source.recordedRecipient)
      )
        throw new Error('Uncertain external invoice registration');
      // Confirmation precedes independent refresh/activity work; it can never become uncertain.
      confirmed = true;
      setAttempt({ status: 'confirmed' });
      onBusyChange(false);
      onRegistered(saved);
    } catch {
      if (!request.signal.aborted && !confirmed)
        setAttempt({ status: 'uncertain', command });
    }
  }
  if (attempt.status === 'denied' || sources.status === 'denied')
    return <p role="alert">{copy.t('sourceDenied')}</p>;
  if (attempt.status === 'confirmed')
    return <p role="status">{copy.t('confirmed')}</p>;
  return (
    <form
      className="working-document-registration working-document-registration--external-invoice"
      onSubmit={(event) => void submit(event)}
    >
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
      {selected && <ExternalInvoiceParty party={selected.recordedRecipient} />}
      <div className="working-document-field">
        <label htmlFor={`${id}-version`}>{copy.t('exactVersion')}</label>
        <Select
          id={`${id}-version`}
          value={selected?.contractVersionId ?? ''}
          required
          disabled={
            busy || sources.status !== 'ready' || !sources.page.sources.length
          }
          placeholder={copy.t('selectVersion')}
          options={
            sources.status === 'ready'
              ? sources.page.sources.map((source) => ({
                  value: source.contractVersionId,
                  label: `${source.opportunityTitle} · ${copy.versionLabel(source.illustrativeReference, source.contractVersionNumber)} · ${source.recordedRecipient.legalName} · ${copy.t(source.recordedRecipient.kind === 'PRIMARY' ? 'primary' : 'additional')}`,
                }))
              : []
          }
          onValueChange={(value) => {
            if (sources.status === 'ready')
              setSelected(
                sources.page.sources.find(
                  (source) => source.contractVersionId === value,
                ),
              );
          }}
        />
      </div>
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
      <div className="working-document-field">
        <label htmlFor={`${id}-title`}>{documentCopy.titleLabel}</label>
        <input
          id={`${id}-title`}
          required
          maxLength={200}
          disabled={busy}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
      <div className="working-document-field">
        <label htmlFor={`${id}-purpose`}>{documentCopy.purpose}</label>
        <textarea
          id={`${id}-purpose`}
          required
          maxLength={2000}
          disabled={busy}
          value={purpose}
          onChange={(event) => setPurpose(event.target.value)}
        />
      </div>
      <div className="working-document-field">
        <label htmlFor={`${id}-source`}>{copy.t('declaredSource')}</label>
        <textarea
          id={`${id}-source`}
          required
          maxLength={2000}
          disabled={busy}
          value={sourceDescription}
          onChange={(event) => setSourceDescription(event.target.value)}
        />
      </div>
      <div className="working-document-field">
        <label htmlFor={`${id}-received-on`}>{copy.t('receivedOn')}</label>
        <input
          id={`${id}-received-on`}
          type="date"
          min="0001-01-01"
          max="9999-12-31"
          disabled={busy}
          value={receivedOn}
          onChange={(event) => setReceivedOn(event.target.value)}
        />
      </div>
      {attempt.status === 'editable' && attempt.refused && (
        <p role="alert">{copy.t('invalid')}</p>
      )}
      {attempt.status === 'uncertain' && (
        <p role="alert">{copy.t('uncertain')}</p>
      )}
      <button
        disabled={
          attempt.status === 'pending' ||
          (!selected && attempt.status !== 'uncertain')
        }
      >
        {copy.t(attempt.status === 'uncertain' ? 'retry' : 'register')}
      </button>
    </form>
  );
}
