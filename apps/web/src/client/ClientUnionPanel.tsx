import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { formatApplicationDateTime } from '../presentation/date-time';
import {
  handleAuthenticatedAccessRejection,
  runLatestAuthenticatedRequest,
} from '../api/latest-authenticated-request';
import { resolveRetryCommand, type RetryCommand } from './client-command';
import {
  readUnionDetail,
  readUnionHistory,
  readUnionReview,
  readUnionSources,
  unionFields,
  unionObject,
  unionString,
  type UnionComparison,
  type UnionDetail,
  type UnionField,
  type UnionHistory,
} from './client-union-contract';
import { clientUnionCopy as copy } from './client-union.copy';
import { clientWorkspaceCopy as clientCopy } from './client-workspace.copy';
import { ApplicationPresentation } from '../production-shell/application-presentation';
import { ClientUnionComparison } from './ClientUnionComparison';
import './client-union-comparison.css';

type UnionFailureFeedback = 'error' | 'confirmationUncertain';

type UnionView =
  | { kind: 'idle' }
  | { kind: 'comparison'; comparison: UnionComparison }
  | { kind: 'history'; history: UnionHistory }
  | { kind: 'sources'; sources: ReturnType<typeof readUnionSources> }
  | { kind: 'detail'; detail: UnionDetail }
  | { kind: 'saved'; reference: string }
  | { kind: 'reversed' }
  | { kind: 'remediation' };
const labels: Record<UnionField, string> = {
  displayName: clientCopy.displayNameLabel,
  taxId: clientCopy.taxIdLabel,
  address: clientCopy.addressLabel,
  telephone: clientCopy.telephoneLabel,
  generalEmail: clientCopy.generalEmailLabel,
  businessActivity: clientCopy.businessActivityLabel,
};

export function ClientUnionPanel({
  clientId,
  companyContextId,
  identity,
  canResolve,
  onChanged,
  onConfirmed,
  onCompanyContextRejected,
  onActorRevalidated,
  onWorkspaceAccessRejected,
}: {
  clientId: string | undefined;
  companyContextId: string;
  identity: BrowserIdentity;
  canResolve: boolean;
  onChanged: (canonicalClientId?: string) => Promise<void>;
  onConfirmed?: (canonicalClientId: string) => void;
  onCompanyContextRejected: (companyId: string) => void;
  onActorRevalidated: (actor: ActorContext) => Promise<void> | void;
  onWorkspaceAccessRejected: () => Promise<void> | void;
}) {
  const isPrisme = useContext(ApplicationPresentation) === 'prisme';
  const openingTrigger = useRef<Element | null>(null);
  const receiveComparisonHeading = useCallback(
    (heading: HTMLHeadingElement | null) => {
      if (!heading) return;
      const trigger = openingTrigger.current;
      openingTrigger.current = null;
      if (
        isPrisme &&
        trigger &&
        document.activeElement === trigger &&
        !heading.closest('[hidden]')
      )
        heading.focus();
    },
    [isPrisme],
  );
  const [view, setView] = useState<UnionView>({ kind: 'idle' });
  const [feedback, setFeedback] = useState<
    UnionFailureFeedback | 'idle' | 'busy' | 'unavailable' | 'refreshError'
  >('idle');
  const pending = useRef<AbortController | undefined>(undefined);
  const retry = useRef<{ path: string; command: RetryCommand } | undefined>(
    undefined,
  );
  const callbacks = useRef({
    onChanged,
    onConfirmed,
    onCompanyContextRejected,
    onActorRevalidated,
    onWorkspaceAccessRejected,
  });
  callbacks.current = {
    onChanged,
    onConfirmed,
    onCompanyContextRejected,
    onActorRevalidated,
    onWorkspaceAccessRejected,
  };

  useEffect(() => {
    pending.current?.abort();
    retry.current = undefined;
    openingTrigger.current = null;
    setView({ kind: 'idle' });
    setFeedback('idle');
    return () => pending.current?.abort();
  }, [clientId, companyContextId, identity, canResolve]);

  async function run<T>({
    path,
    parse,
    receive,
    input,
    failureFeedback = 'error',
  }: {
    path: string;
    parse: (value: unknown) => T;
    receive: (value: T, signal: AbortSignal) => Promise<void> | void;
    input?: unknown;
    failureFeedback?: UnionFailureFeedback;
  }) {
    const serializedBody =
      input === undefined ? undefined : JSON.stringify(input);
    const command =
      serializedBody === undefined
        ? undefined
        : resolveRetryCommand(
            serializedBody,
            retry.current?.path === path ? retry.current.command : undefined,
          );
    if (command) retry.current = { path, command };
    setFeedback('busy');
    await runLatestAuthenticatedRequest({
      pending,
      identity,
      execute: (api, signal) =>
        api.request<unknown>(path, {
          companyContextId,
          signal,
          ...(command
            ? {
                method: 'POST',
                body: command.serializedBody,
                headers: {
                  'content-type': 'application/json',
                  'idempotency-key': command.idempotencyKey,
                },
              }
            : {}),
        }),
      async onResult(result, signal) {
        const rejected = await handleAuthenticatedAccessRejection({
          result,
          identity,
          companyContextId,
          signal,
          ...callbacks.current,
        });
        if (signal.aborted) return;
        if (
          rejected ||
          result.status === 'notFound' ||
          result.status === 'conflict'
        ) {
          retry.current = undefined;
          setView({ kind: 'idle' });
          setFeedback('unavailable');
          return;
        }
        if (result.status !== 'ok') {
          setFeedback(failureFeedback);
          return;
        }
        const parsed = parse(result.value);
        retry.current = undefined;
        setFeedback('idle');
        await receive(parsed, signal);
      },
      onError: () => setFeedback(failureFeedback),
    });
  }

  function loadDetail(reference: string) {
    return run({
      path: `/client-union-operations/${encodeURIComponent(reference)}`,
      parse: readUnionDetail,
      receive: (detail) => setView({ kind: 'detail', detail }),
    });
  }
  function loadHistory(sourceId: string) {
    return run({
      path: `/clients/${encodeURIComponent(sourceId)}/union-history`,
      parse: readUnionHistory,
      receive: (history) => setView({ kind: 'history', history }),
    });
  }
  function close() {
    pending.current?.abort();
    retry.current = undefined;
    openingTrigger.current = null;
    setView({ kind: 'idle' });
    setFeedback('idle');
  }
  const busy = feedback === 'busy';
  return (
    <section className="client-dossier client-union" aria-label={copy.title}>
      <h3>{copy.title}</h3>
      <div className="client-union-actions">
        {canResolve && clientId && (
          <button
            type="button"
            aria-disabled={busy}
            aria-expanded={view.kind === 'comparison'}
            onClick={() => {
              if (busy) return;
              openingTrigger.current = isPrisme ? document.activeElement : null;
              void run({
                path: `/clients/${encodeURIComponent(clientId)}/union-reviews`,
                input: {},
                parse: readUnionReview,
                receive: (review) =>
                  setView(
                    review.outcome === 'comparison'
                      ? { kind: 'comparison', comparison: review }
                      : { kind: 'remediation' },
                  ),
              });
            }}
          >
            {copy.review}
          </button>
        )}
        {clientId && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void loadHistory(clientId)}
          >
            {copy.history}
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run({
              path: '/client-union-sources',
              parse: readUnionSources,
              receive: (sources) => setView({ kind: 'sources', sources }),
            })
          }
        >
          {copy.sources}
        </button>
        {(view.kind !== 'idle' || busy) && (
          <button type="button" onClick={close}>
            {copy.close}
          </button>
        )}
      </div>
      {feedback === 'busy' && <p role="status">{copy.loading}</p>}
      {feedback === 'error' && <p role="alert">{copy.error}</p>}
      {feedback === 'refreshError' && <p role="alert">{copy.refreshError}</p>}
      {feedback === 'unavailable' && <p role="alert">{copy.unavailable}</p>}
      {view.kind === 'remediation' && <p role="alert">{copy.remediation}</p>}
      {view.kind === 'comparison' && (
        <ClientUnionComparison
          key={view.comparison.reviewReference}
          comparison={view.comparison}
          busy={busy}
          uncertain={feedback === 'confirmationUncertain'}
          onHeadingReady={receiveComparisonHeading}
          onConfirm={(input) =>
            run({
              path: `/client-union-reviews/${encodeURIComponent(view.comparison.reviewReference)}/confirm`,
              input,
              failureFeedback: 'confirmationUncertain',
              parse: (value) => {
                const row = unionObject(value);
                if (row.outcome !== 'united')
                  throw new Error('Invalid union outcome.');
                return {
                  reference: unionString(row.projectionReference),
                  canonicalClientId: unionString(row.canonicalClientId),
                };
              },
              receive: async (result, signal) => {
                setView({ kind: 'saved', reference: result.reference });
                callbacks.current.onConfirmed?.(result.canonicalClientId);
                try {
                  await callbacks.current.onChanged(result.canonicalClientId);
                } catch {
                  if (!signal.aborted) setFeedback('refreshError');
                }
              },
            })
          }
        />
      )}
      {view.kind === 'saved' && (
        <div>
          {!onConfirmed && <p role="status">{copy.saved}</p>}
          <button
            type="button"
            disabled={busy}
            onClick={() => void loadDetail(view.reference)}
          >
            {copy.viewDetails}
          </button>
        </div>
      )}
      {view.kind === 'reversed' && <p role="status">{copy.reversed}</p>}
      {view.kind === 'sources' && (
        <div>
          <h4>{copy.sources}</h4>
          {view.sources.length === 0 && <p>{copy.noSources}</p>}
          <ul>
            {view.sources.map((source) => (
              <li key={source.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void loadHistory(source.id)}
                >
                  {source.displayName}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {view.kind === 'history' && (
        <div>
          {view.history.events.length === 0 && <p>{copy.noHistory}</p>}
          <ul>
            {view.history.events.map((event) => (
              <li key={event.projectionReference}>
                <span>
                  {copy.resolver} {copy.actionLabels[event.action]}
                </span>
                {view.history.detailReferences.includes(
                  event.projectionReference,
                ) && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void loadDetail(event.projectionReference)}
                  >
                    {copy.viewDetails}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {view.kind === 'detail' && (
        <UnionOperationDetail
          detail={view.detail}
          busy={busy}
          onOpenCanonical={() => {
            close();
            void callbacks.current.onChanged(view.detail.canonicalClientId);
          }}
          onReverse={(reason) =>
            run({
              path: `/client-union-operations/${encodeURIComponent(view.detail.projectionReference)}/reversal`,
              input: {
                reason,
                companyIds: view.detail.companies.map((company) => company.id),
              },
              parse: (value) => {
                const row = unionObject(value);
                if (row.outcome !== 'reversed')
                  throw new Error('Invalid reversal outcome.');
                return row;
              },
              receive: async () => {
                setView({ kind: 'reversed' });
                await callbacks.current.onChanged();
              },
            })
          }
        />
      )}
    </section>
  );
}

function Dossiers({ clients }: { clients: UnionComparison['clients'] }) {
  return (
    <div className="client-union-comparison">
      {clients.map((client) => (
        <article key={client.id}>
          <h4>{client.displayName}</h4>
          <p>{clientCopy.version(client.version)}</p>
          <dl>
            {unionFields.map((field) => (
              <div key={field}>
                <dt>{labels[field]}</dt>
                <dd>{client[field] ?? copy.notProvided}</dd>
              </div>
            ))}
          </dl>
          <h4>{clientCopy.contactsLabel}</h4>
          <ul>
            {client.contacts.map((contact, index) => (
              <li key={`${client.id}:${client.version}:${index}`}>
                <strong>{contact.name}</strong>
                {contact.telephone && <span>{contact.telephone}</span>}
                {contact.email && <span>{contact.email}</span>}
              </li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}

function UnionOperationDetail({
  detail,
  busy,
  onOpenCanonical,
  onReverse,
}: {
  detail: UnionDetail;
  busy: boolean;
  onOpenCanonical: () => void;
  onReverse: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  return (
    <div>
      <h4>{copy.restrictedTitle}</h4>
      <p>
        {detail.actor.displayName} ·{' '}
        <time dateTime={detail.occurredAt}>
          {formatApplicationDateTime(detail.occurredAt)}
        </time>
      </p>
      <p>{detail.reason}</p>
      {detail.state === 'united' && (
        <button type="button" disabled={busy} onClick={onOpenCanonical}>
          {copy.openCanonical}
        </button>
      )}
      <h4>{copy.originals}</h4>
      <Dossiers clients={detail.originals} />
      {detail.reversal && (
        <div>
          <p>{copy.reversed}</p>
          <p>
            {detail.reversal.actor.displayName} ·{' '}
            <time dateTime={detail.reversal.occurredAt}>
              {formatApplicationDateTime(detail.reversal.occurredAt)}
            </time>
          </p>
          <p>{detail.reversal.reason}</p>
        </div>
      )}
      {detail.state === 'united' && !detail.canReverse && (
        <p role="status">{copy.reversalBlocked}</p>
      )}
      {detail.state === 'united' && detail.canReverse && (
        <form
          className="client-union-form"
          aria-label={copy.reverse}
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy && confirmed && reason.trim()) void onReverse(reason);
          }}
        >
          <fieldset disabled={busy}>
            <legend>{copy.reverse}</legend>
            <label>
              {copy.reverseReason}
              <textarea
                required
                maxLength={2000}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <label className="client-union-check">
              <input
                type="checkbox"
                required
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              {copy.confirmedCompanies}{' '}
              {detail.companies
                .map((company) => company.displayName)
                .join(', ')}
            </label>
          </fieldset>
          <button type="submit" disabled={busy}>
            {busy ? copy.saving : copy.reverse}
          </button>
        </form>
      )}
    </div>
  );
}
