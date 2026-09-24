import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { runLatestAuthenticatedRequest } from '../api/latest-authenticated-request';
import { formatApplicationDateTime } from '../presentation/date-time';
import {
  readDocumentCorrectionHistory,
  type DocumentCorrection,
  type DocumentCorrectionChange,
} from './document-response';
import { documentCorrectionHistoryCopy as copy } from './document-correction-history.copy';
import './document-correction-history.css';

interface LoadedHistory {
  status: 'ready';
  corrections: DocumentCorrection[];
  nextBeforeRevision: number | null;
  older: 'idle' | 'loading' | 'error';
}
type HistoryState =
  { status: 'loading' | 'error' | 'unavailable' } | LoadedHistory;

/**
 * The read-only material correction history of one open working Document.
 * It is keyed to the Document, member, Company and Representation authority
 * it was read under: any change starts a new collapsed section, which drops
 * its rows and ignores the replies still owed to the previous one.
 */
export function DocumentCorrectionHistory({
  actor,
  identity,
  documentId,
  workingRevision,
}: {
  actor: ActorContext;
  identity: BrowserIdentity;
  documentId: string;
  /** The open Document's revision; a newer one reloads an open first page. */
  workingRevision: number;
}) {
  const company = actor.activeCompany;
  if (!company?.documentPermissions?.includes('document.read')) return null;
  const canReadReference = company.documentPermissions.includes(
    'document.reference.read',
  );
  return (
    <CorrectionHistorySection
      key={JSON.stringify([
        actor.workspaceId,
        actor.workspaceMembershipId,
        company.id,
        documentId,
        canReadReference,
      ])}
      identity={identity}
      companyId={company.id}
      documentId={documentId}
      workingRevision={workingRevision}
      canReadReference={canReadReference}
    />
  );
}

function CorrectionHistorySection({
  identity,
  companyId,
  documentId,
  workingRevision,
  canReadReference,
}: {
  identity: BrowserIdentity;
  companyId: string;
  documentId: string;
  workingRevision: number;
  canReadReference: boolean;
}) {
  const titleId = useId();
  const contentId = useId();
  const [expanded, setExpanded] = useState(false);
  const [history, setHistory] = useState<HistoryState>({ status: 'loading' });
  /** History reads only; a correction or detail read is never aborted here. */
  const pending = useRef<AbortController | undefined>(undefined);

  const loadPage = useCallback(
    async (beforeRevision: number | undefined): Promise<void> => {
      // A first page replaces the section; an older page only extends the
      // loaded list it continues.
      const update = (
        firstPage: HistoryState,
        olderPage: (current: LoadedHistory) => HistoryState,
      ) =>
        setHistory((current) =>
          beforeRevision === undefined
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
        pending,
        identity,
        execute: (api, signal) =>
          api.request<unknown>(
            `/documents/${encodeURIComponent(documentId)}/correction-history${
              beforeRevision === undefined
                ? ''
                : `?beforeRevision=${beforeRevision}`
            }`,
            { companyContextId: companyId, signal },
          ),
        async onResult(result) {
          if (result.status === 'unauthorized') {
            await identity.rejectSession();
            return;
          }
          // Lost authority clears every loaded row, like a hidden Document.
          if (result.status === 'forbidden' || result.status === 'notFound') {
            setHistory({ status: 'unavailable' });
            return;
          }
          if (result.status !== 'ok') {
            fail();
            return;
          }
          const page = readDocumentCorrectionHistory(
            result.value,
            beforeRevision,
          );
          // Prior URLs are kept only under current Representation read.
          const corrections = canReadReference
            ? page.corrections
            : page.corrections.map((correction) => ({
                ...correction,
                changes: correction.changes.filter(
                  (change) => change.field !== 'url',
                ),
              }));
          update(
            {
              status: 'ready',
              corrections,
              nextBeforeRevision: page.nextBeforeRevision,
              older: 'idle',
            },
            (current) => ({
              ...current,
              corrections: [...current.corrections, ...corrections],
              nextBeforeRevision: page.nextBeforeRevision,
              older: 'idle',
            }),
          );
        },
        onError: fail,
      });
    },
    [documentId, companyId, canReadReference, identity],
  );

  // Expanding or a newer working revision reloads the first page from the
  // ledger; collapsing or unmounting abandons the history read in flight.
  useEffect(() => {
    if (!expanded) return;
    void loadPage(undefined);
    return () => pending.current?.abort();
  }, [expanded, loadPage, workingRevision]);

  return (
    <section
      className="working-document-correction-history"
      aria-labelledby={titleId}
    >
      <div className="working-document-correction-history-heading">
        <h4 id={titleId}>{copy.title}</h4>
        <button
          type="button"
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
        className="working-document-correction-history-content"
        hidden={!expanded}
      >
        {expanded && (
          <>
            <p>{copy.description}</p>
            <HistoryContent
              history={history}
              onRetry={() => void loadPage(undefined)}
              onLoadOlder={(beforeRevision) => void loadPage(beforeRevision)}
            />
          </>
        )}
      </div>
    </section>
  );
}

function HistoryContent({
  history,
  onRetry,
  onLoadOlder,
}: {
  history: HistoryState;
  onRetry: () => void;
  onLoadOlder: (beforeRevision: number) => void;
}) {
  switch (history.status) {
    case 'loading':
      return <p role="status">{copy.loading}</p>;
    case 'error':
      return (
        <>
          <p role="alert">{copy.error}</p>
          <button type="button" onClick={onRetry}>
            {copy.retry}
          </button>
        </>
      );
    case 'unavailable':
      return <p role="status">{copy.unavailable}</p>;
    case 'ready': {
      const { nextBeforeRevision } = history;
      if (history.corrections.length === 0) return <p>{copy.empty}</p>;
      return (
        <>
          <ol
            className="working-document-correction-history-list"
            aria-label={copy.list}
          >
            {history.corrections.map((correction) => (
              <li key={correction.revision}>
                <p className="working-document-correction-history-attribution">
                  <span className="working-document-correction-history-revision">
                    {copy.resultingRevision(correction.revision)}
                  </span>
                  <time dateTime={correction.occurredAt}>
                    {formatApplicationDateTime(correction.occurredAt)}
                  </time>
                  <span>{copy.correctedBy(correction.actorDisplayName)}</span>
                </p>
                {correction.changes.length === 0 ? (
                  <p>{copy.withheldChanges}</p>
                ) : (
                  <dl className="working-document-correction-history-changes">
                    {correction.changes.map((change) => (
                      <FieldChange key={change.field} change={change} />
                    ))}
                  </dl>
                )}
              </li>
            ))}
          </ol>
          {history.older === 'error' && <p role="alert">{copy.olderError}</p>}
          {nextBeforeRevision !== null && (
            <button
              type="button"
              disabled={history.older === 'loading'}
              onClick={() => onLoadOlder(nextBeforeRevision)}
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

/** Recorded values render as inert text; a prior URL is never a link. */
function FieldChange({ change }: { change: DocumentCorrectionChange }) {
  return (
    <div>
      <dt>{copy.fieldLabels[change.field]}</dt>
      <dd className="working-document-correction-history-value">
        <span>{change.before}</span>
        <span aria-hidden="true"> → </span>
        <span className="working-document-correction-history-assistive">
          {` ${copy.changedTo} `}
        </span>
        <span>{change.after}</span>
      </dd>
    </div>
  );
}

function assertNever(value: never): never {
  throw new Error(`Unexpected correction history state: ${String(value)}`);
}
