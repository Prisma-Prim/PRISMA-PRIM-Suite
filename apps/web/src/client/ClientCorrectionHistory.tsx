import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useId,
  useRef,
  useState,
} from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import {
  handleAuthenticatedAccessRejection,
  runLatestAuthenticatedRequest,
} from '../api/latest-authenticated-request';
import { useRequestLifetime } from '../api/use-actor-requests';
import { useScopedOperation } from '../api/use-scoped-operation';
import { useInterfaceLocale } from '../localization/interface-locale';
import {
  ClientContactDescription,
  type ClientContact,
} from './ClientContactEditor';
import { ClientDirectoryFeedback } from './ClientDirectoryFeedback';
import {
  readClientCorrectionHistory,
  type ClientCorrection,
  type ClientCorrectionChange,
} from './client-correction-history';
import { useClientCorrectionHistoryCopy } from './client-correction-history.copy';
import './client-correction-history.css';

interface LoadedHistory {
  status: 'ready';
  corrections: ClientCorrection[];
  nextCursor: string | null;
  older: 'idle' | 'loading' | 'error';
}
type HistoryState =
  { status: 'loading' | 'error' | 'unavailable' } | LoadedHistory;

export function ClientCorrectionHistory({
  clientAccountId,
  dossierVersion,
  companyContextId,
  identity,
  captureRecovery,
  onCompanyContextRejected,
  onActorRevalidated,
  onWorkspaceAccessRejected,
}: {
  clientAccountId: string;
  dossierVersion: number;
  companyContextId: string;
  identity: BrowserIdentity;
  captureRecovery?: () => () => boolean;
  onCompanyContextRejected: (companyContextId: string) => void;
  onActorRevalidated: (actor: ActorContext) => Promise<void> | void;
  onWorkspaceAccessRejected: () => Promise<void> | void;
}) {
  const copy = useClientCorrectionHistoryCopy();
  const titleId = useId();
  const contentId = useId();
  const [expanded, setExpanded] = useState(false);
  const [history, setHistory] = useState<HistoryState>({ status: 'loading' });
  const requestScope = String(
    useRequestLifetime(
      identity,
      JSON.stringify([
        clientAccountId,
        companyContextId,
        dossierVersion,
        expanded,
      ]),
    ),
  );
  const historyRead = useScopedOperation(requestScope);
  const rejectCompanyContext = useRef(onCompanyContextRejected);
  const acceptRevalidatedActor = useRef(onActorRevalidated);
  const rejectWorkspaceAccess = useRef(onWorkspaceAccessRejected);
  useLayoutEffect(() => {
    rejectCompanyContext.current = onCompanyContextRejected;
    acceptRevalidatedActor.current = onActorRevalidated;
    rejectWorkspaceAccess.current = onWorkspaceAccessRejected;
  });

  const loadPage = useCallback(
    async (cursor: string | undefined): Promise<void> => {
      const requestSignal = historyRead.begin();
      if (!requestSignal) return;
      const recoveryCurrent = captureRecovery?.();
      // A first page replaces the section; an older page only extends the
      // loaded list it continues.
      const update = (
        firstPage: HistoryState,
        olderPage: (current: LoadedHistory) => HistoryState,
      ) =>
        setHistory((current) =>
          cursor === undefined
            ? firstPage
            : current.status === 'ready'
              ? olderPage(current)
              : current,
        );
      const fail = () =>
        update({ status: 'error' }, (current) => ({
          ...current,
          older: 'error',
        }));
      update({ status: 'loading' }, (current) => ({
        ...current,
        older: 'loading',
      }));
      await runLatestAuthenticatedRequest({
        signal: requestSignal,
        identity,
        execute: (api, signal) =>
          api.request(
            `/clients/${encodeURIComponent(clientAccountId)}/correction-history${
              cursor === undefined
                ? ''
                : `?cursor=${encodeURIComponent(cursor)}`
            }`,
            { companyContextId, signal },
          ),
        async onResult(result, signal) {
          if (signal.aborted) return;
          const rejection = await handleAuthenticatedAccessRejection({
            result,
            identity,
            companyContextId,
            onCompanyContextRejected: (rejectedCompanyId) =>
              rejectCompanyContext.current(rejectedCompanyId),
            onActorRevalidated: (revalidatedActor) =>
              acceptRevalidatedActor.current(revalidatedActor),
            onWorkspaceAccessRejected: () => rejectWorkspaceAccess.current(),
            signal,
            isCurrent: () => !signal.aborted && (recoveryCurrent?.() ?? true),
          });
          if (signal.aborted) return;
          if (rejection || result.status === 'notFound') {
            setHistory({ status: 'unavailable' });
            return;
          }
          if (result.status !== 'ok') {
            fail();
            return;
          }
          const page = readClientCorrectionHistory(result.value);
          update({ status: 'ready', ...page, older: 'idle' }, (current) => ({
            ...current,
            corrections: [...current.corrections, ...page.corrections],
            nextCursor: page.nextCursor,
            older: 'idle',
          }));
        },
        onError: fail,
      });
    },
    [captureRecovery, clientAccountId, companyContextId, historyRead, identity],
  );

  // Expanding, a new dossier version or another request identity reloads the
  // first page; collapsing or unmounting abandons the latest request.
  useEffect(() => {
    if (!expanded) return;
    void loadPage(undefined);
  }, [expanded, loadPage, dossierVersion]);

  return (
    <section className="client-correction-history" aria-labelledby={titleId}>
      <div className="client-correction-history-heading">
        <h4 id={titleId}>{copy.title}</h4>
        <button
          type="button"
          className="client-secondary-action"
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={() => {
            if (!expanded) setHistory({ status: 'loading' });
            setExpanded(!expanded);
          }}
        >
          {expanded ? copy.hide : copy.show}
        </button>
      </div>
      <div
        id={contentId}
        className="client-correction-history-content"
        hidden={!expanded}
      >
        {expanded && (
          <HistoryContent
            history={history}
            onRetry={() => void loadPage(undefined)}
            onShowOlder={(cursor) => void loadPage(cursor)}
          />
        )}
      </div>
    </section>
  );
}

function HistoryContent({
  history,
  onRetry,
  onShowOlder,
}: {
  history: HistoryState;
  onRetry: () => void;
  onShowOlder: (cursor: string) => void;
}) {
  const copy = useClientCorrectionHistoryCopy();
  const { formatDateTime } = useInterfaceLocale();
  switch (history.status) {
    case 'loading':
      return (
        <ClientDirectoryFeedback role="status" tone="pending">
          {copy.loading}
        </ClientDirectoryFeedback>
      );
    case 'error':
      return (
        <>
          <ClientDirectoryFeedback role="alert" tone="error">
            {copy.error}
          </ClientDirectoryFeedback>
          <button
            type="button"
            className="client-secondary-action"
            onClick={onRetry}
          >
            {copy.retry}
          </button>
        </>
      );
    case 'unavailable':
      return (
        <ClientDirectoryFeedback role="status">
          {copy.unavailable}
        </ClientDirectoryFeedback>
      );
    case 'ready': {
      const { nextCursor } = history;
      if (history.corrections.length === 0)
        return <ClientDirectoryFeedback>{copy.empty}</ClientDirectoryFeedback>;
      return (
        <>
          <ol className="client-correction-history-list" aria-label={copy.list}>
            {history.corrections.map((correction) => (
              <li key={correction.id}>
                <p className="client-correction-history-attribution">
                  <time dateTime={correction.occurredAt}>
                    {formatDateTime(correction.occurredAt)}
                  </time>
                  <span>{copy.correctedBy(correction.actorDisplayName)}</span>
                </p>
                <dl className="client-correction-history-changes">
                  {correction.changes.map((change) => (
                    <FieldChange key={change.field} change={change} />
                  ))}
                </dl>
              </li>
            ))}
          </ol>
          {history.older === 'error' && (
            <ClientDirectoryFeedback role="alert" tone="error">
              {copy.olderError}
            </ClientDirectoryFeedback>
          )}
          {nextCursor !== null && (
            <button
              type="button"
              className="client-secondary-action"
              disabled={history.older === 'loading'}
              onClick={() => onShowOlder(nextCursor)}
            >
              {history.older === 'loading' ? copy.loadingOlder : copy.showOlder}
            </button>
          )}
        </>
      );
    }
    default:
      return assertNever(history);
  }
}

function FieldChange({ change }: { change: ClientCorrectionChange }) {
  const copy = useClientCorrectionHistoryCopy();
  return (
    <div>
      <dt>{copy.fieldLabels[change.field]}</dt>
      {change.field === 'contacts' ? (
        <dd className="client-correction-history-contacts">
          <ContactVersion label={copy.before} contacts={change.before} />
          <ContactVersion label={copy.after} contacts={change.after} />
        </dd>
      ) : (
        <dd className="client-correction-history-value">
          <span>{change.before ?? copy.notProvided}</span>
          <span aria-hidden="true"> → </span>
          <span className="client-correction-history-assistive">
            {` ${copy.changedTo} `}
          </span>
          <span>{change.after ?? copy.notProvided}</span>
        </dd>
      )}
    </div>
  );
}

function ContactVersion({
  label,
  contacts,
}: {
  label: string;
  contacts: ClientContact[];
}) {
  const copy = useClientCorrectionHistoryCopy();
  const labelId = useId();
  return (
    <div role="group" aria-labelledby={labelId}>
      <span id={labelId} className="client-correction-history-version">
        {label}
      </span>
      {contacts.length === 0 ? (
        <p>{copy.noContacts}</p>
      ) : (
        <ul>
          {contacts.map((contact, index) => (
            <li key={`${contact.name}-${index}`}>
              <strong>{contact.name}</strong>
              {contact.telephone && <span>{contact.telephone}</span>}
              {contact.email && <span>{contact.email}</span>}
              <ClientContactDescription contact={contact} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function assertNever(value: never): never {
  throw new Error(`Unexpected correction history state: ${String(value)}`);
}
