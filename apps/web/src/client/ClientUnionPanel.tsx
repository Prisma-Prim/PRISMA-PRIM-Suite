import { useEffect, useRef, useState, type FormEvent } from 'react';
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

type UnionView =
  | { kind: 'idle' }
  | { kind: 'comparison'; comparison: UnionComparison }
  | { kind: 'history'; history: UnionHistory }
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
  onCompanyContextRejected,
  onActorRevalidated,
  onWorkspaceAccessRejected,
}: {
  clientId: string;
  companyContextId: string;
  identity: BrowserIdentity;
  canResolve: boolean;
  onChanged: (canonicalClientId?: string) => Promise<void>;
  onCompanyContextRejected: (companyId: string) => void;
  onActorRevalidated: (actor: ActorContext) => Promise<void> | void;
  onWorkspaceAccessRejected: () => Promise<void> | void;
}) {
  const [view, setView] = useState<UnionView>({ kind: 'idle' });
  const [feedback, setFeedback] = useState<
    'idle' | 'busy' | 'error' | 'unavailable'
  >('idle');
  const pending = useRef<AbortController | undefined>(undefined);
  const retry = useRef<{ path: string; command: RetryCommand } | undefined>(
    undefined,
  );
  const callbacks = useRef({
    onChanged,
    onCompanyContextRejected,
    onActorRevalidated,
    onWorkspaceAccessRejected,
  });
  callbacks.current = {
    onChanged,
    onCompanyContextRejected,
    onActorRevalidated,
    onWorkspaceAccessRejected,
  };

  useEffect(() => {
    pending.current?.abort();
    retry.current = undefined;
    setView({ kind: 'idle' });
    setFeedback('idle');
    return () => pending.current?.abort();
  }, [clientId, companyContextId, identity, canResolve]);

  async function run<T>({
    path,
    parse,
    receive,
    input,
  }: {
    path: string;
    parse: (value: unknown) => T;
    receive: (value: T) => Promise<void> | void;
    input?: unknown;
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
          setFeedback('error');
          return;
        }
        const parsed = parse(result.value);
        retry.current = undefined;
        setFeedback('idle');
        await receive(parsed);
      },
      onError: () => setFeedback('error'),
    });
  }

  function loadDetail(reference: string) {
    return run({
      path: `/client-union-operations/${encodeURIComponent(reference)}`,
      parse: readUnionDetail,
      receive: (detail) => setView({ kind: 'detail', detail }),
    });
  }
  function close() {
    pending.current?.abort();
    retry.current = undefined;
    setView({ kind: 'idle' });
    setFeedback('idle');
  }
  const busy = feedback === 'busy';
  return (
    <section className="client-dossier client-union" aria-label={copy.title}>
      <h3>{copy.title}</h3>
      <div className="client-union-actions">
        {canResolve && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
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
              })
            }
          >
            {copy.review}
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run({
              path: `/clients/${encodeURIComponent(clientId)}/union-history`,
              parse: readUnionHistory,
              receive: (history) => setView({ kind: 'history', history }),
            })
          }
        >
          {copy.history}
        </button>
        {(view.kind !== 'idle' || busy) && (
          <button type="button" onClick={close}>
            {copy.close}
          </button>
        )}
      </div>
      {feedback === 'busy' && <p role="status">{copy.loading}</p>}
      {feedback === 'error' && <p role="alert">{copy.error}</p>}
      {feedback === 'unavailable' && <p role="alert">{copy.unavailable}</p>}
      {view.kind === 'remediation' && <p role="alert">{copy.remediation}</p>}
      {view.kind === 'comparison' && (
        <UnionComparisonForm
          key={view.comparison.reviewReference}
          comparison={view.comparison}
          busy={busy}
          onConfirm={(input) =>
            run({
              path: `/client-union-reviews/${encodeURIComponent(view.comparison.reviewReference)}/confirm`,
              input,
              parse: (value) => {
                const row = unionObject(value);
                if (row.outcome !== 'united')
                  throw new Error('Invalid union outcome.');
                return {
                  reference: unionString(row.projectionReference),
                  canonicalClientId: unionString(row.canonicalClientId),
                };
              },
              receive: async (result) => {
                setView({ kind: 'saved', reference: result.reference });
                await callbacks.current.onChanged(result.canonicalClientId);
              },
            })
          }
        />
      )}
      {view.kind === 'saved' && (
        <div>
          <p role="status">{copy.saved}</p>
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

function UnionComparisonForm({
  comparison,
  busy,
  onConfirm,
}: {
  comparison: UnionComparison;
  busy: boolean;
  onConfirm: (value: unknown) => Promise<void>;
}) {
  const [canonicalClientId, setCanonical] = useState('');
  const [fields, setFields] = useState<Record<UnionField, string>>({
    displayName: '',
    taxId: '',
    address: '',
    telephone: '',
    generalEmail: '',
    businessActivity: '',
  });
  const [reason, setReason] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [companiesConfirmed, setCompaniesConfirmed] = useState(false);
  const capacityExceeded =
    comparison.clients.reduce(
      (count, client) => count + client.contacts.length,
      0,
    ) > 50;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      busy ||
      capacityExceeded ||
      !canonicalClientId ||
      !reason.trim() ||
      !reviewed ||
      !companiesConfirmed ||
      unionFields.some((field) => !fields[field])
    )
      return;
    void onConfirm({
      canonicalClientId,
      fields,
      reason,
      reviewedDifferences: reviewed,
      companyIds: comparison.companies.map((company) => company.id),
    });
  }
  return (
    <div>
      <h4>{copy.compare}</h4>
      <p>{copy.preserved}</p>
      <Dossiers clients={comparison.clients} />
      {capacityExceeded && <p role="alert">{copy.capacity}</p>}
      <form
        aria-label={copy.confirm}
        onSubmit={submit}
        className="client-union-form"
      >
        <fieldset disabled={busy || capacityExceeded}>
          <legend>{copy.canonical}</legend>
          <label>
            {copy.canonical}
            <select
              required
              value={canonicalClientId}
              onChange={(event) => setCanonical(event.target.value)}
            >
              <option value="">{copy.choose}</option>
              {comparison.clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.displayName}
                </option>
              ))}
            </select>
          </label>
          {unionFields.map((field) => (
            <label key={field}>
              {labels[field]}
              <select
                required
                value={fields[field]}
                onChange={(event) =>
                  setFields({ ...fields, [field]: event.target.value })
                }
              >
                <option value="">{copy.choose}</option>
                {comparison.clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.displayName}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label>
            {copy.reason}
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
              checked={reviewed}
              onChange={(event) => setReviewed(event.target.checked)}
              required
            />
            {copy.reviewed}
          </label>
          <label className="client-union-check">
            <input
              type="checkbox"
              checked={companiesConfirmed}
              onChange={(event) => setCompaniesConfirmed(event.target.checked)}
              required
            />
            {copy.confirmedCompanies}{' '}
            {comparison.companies
              .map((company) => company.displayName)
              .join(', ')}
          </label>
        </fieldset>
        <button type="submit" disabled={busy || capacityExceeded}>
          {busy ? copy.saving : copy.confirm}
        </button>
      </form>
    </div>
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
  onReverse,
}: {
  detail: UnionDetail;
  busy: boolean;
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
