import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { handleAuthenticatedAccessRejection } from '../api/latest-authenticated-request';
import { selectedWorkspaceId } from '../access/workspace-selection';
import { commercialIntakeCopy as copy } from './commercial-intake.copy';
import './commercial-intake.css';

type RequestListItem = {
  id: string;
  subject: string | null;
  capturedAt: string;
  initialOpportunity: {
    title: string;
    nextAction: string;
    responsibleActor: { workspaceMembershipId: string; displayName: string };
  };
};

type ClientRequest = {
  id: string;
  companyId: string;
  sourceKind: 'MANUAL_TEXT';
  sourceLabel: string | null;
  reportedReceivedAt: string | null;
  subject: string | null;
  originalText: string;
  capturedByWorkspaceMembershipId: string;
  capturedAt: string;
  version: 1;
  clientReference?: {
    originalClientId: string;
    currentClientId?: string;
    displayName: string;
  };
  initialOpportunity: {
    id: string;
    title: string;
    scope: string | null;
    nextAction: string;
    status: 'OPEN';
    responsibleWorkspaceMembershipId: string;
    createdAt: string;
    version: 1;
  };
};

type RequestPage = { items: RequestListItem[]; nextCursor?: string };

type LoadState =
  | { kind: 'loading' }
  | {
      kind: 'ready';
      companyId: string;
      items: RequestListItem[];
      nextCursor?: string;
      olderPage: 'idle' | 'loading' | 'error';
    }
  | { kind: 'denied' }
  | { kind: 'error' };

type FormState = {
  originalText: string;
  sourceLabel: string;
  reportedReceivedAt: string;
  subject: string;
  clientAccountId: string;
  opportunityTitle: string;
  opportunityScope: string;
  nextAction: string;
};

type ClientChoice = {
  id: string;
  displayName: string;
  relatedToActiveCompany: boolean;
};
type ClientSearchState =
  | { kind: 'idle' | 'loading' | 'validation' | 'denied' | 'error' }
  | { kind: 'ready'; clients: ClientChoice[] };

type HttpResult = { status: number; body: unknown } | { status: 'network' };

const listPageSize = 25;

const emptyForm: FormState = {
  originalText: '',
  sourceLabel: '',
  reportedReceivedAt: '',
  subject: '',
  clientAccountId: '',
  opportunityTitle: '',
  opportunityScope: '',
  nextAction: '',
};

export function CommercialIntakeWorkspace({
  actor,
  identity,
  onCompanyContextRejected,
  onActorRevalidated = () => undefined,
  onWorkspaceAccessRejected = () => undefined,
  onActivityRecorded = () => undefined,
}: {
  actor: ActorContext;
  identity: BrowserIdentity;
  onCompanyContextRejected: (companyContextId: string) => void;
  onActorRevalidated?: (actor: ActorContext) => Promise<void> | void;
  onWorkspaceAccessRejected?: () => Promise<void> | void;
  onActivityRecorded?: () => Promise<void> | void;
}) {
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [selected, setSelected] = useState<ClientRequest>();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [clientQuery, setClientQuery] = useState('');
  const [clientSearch, setClientSearch] = useState<ClientSearchState>({
    kind: 'idle',
  });
  const [feedback, setFeedback] = useState('');
  const [pending, setPending] = useState(false);
  const listRequest = useRef<AbortController | undefined>(undefined);
  const commandRequest = useRef<AbortController | undefined>(undefined);
  const clientSearchRequest = useRef<AbortController | undefined>(undefined);
  const retry = useRef<{ payload: string; key: string } | undefined>(undefined);
  const rejectCompany = useRef(onCompanyContextRejected);
  const acceptActor = useRef(onActorRevalidated);
  const rejectWorkspace = useRef(onWorkspaceAccessRejected);
  rejectCompany.current = onCompanyContextRejected;
  acceptActor.current = onActorRevalidated;
  rejectWorkspace.current = onWorkspaceAccessRejected;
  const companyId = actor.activeCompany?.id;
  const canSearchClients =
    actor.workspacePermissions.includes('client.manage') ||
    actor.activeCompany?.clientPermissions?.includes('client.read') === true;

  const request = useCallback(
    async ({
      path,
      companyContextId,
      signal,
      method = 'GET',
      body,
      idempotencyKey,
    }: {
      path: string;
      companyContextId: string;
      signal: AbortSignal;
      method?: 'GET' | 'POST';
      body?: string;
      idempotencyKey?: string;
    }): Promise<HttpResult> => {
      try {
        const token = identity.requestHeaders
          ? null
          : await identity.getToken();
        const workspaceId = selectedWorkspaceId();
        const headers = {
          ...(identity.requestHeaders ??
            (token ? { Authorization: `Bearer ${token}` } : {})),
          ...(workspaceId ? { 'x-workspace-context-id': workspaceId } : {}),
          'x-company-context-id': companyContextId,
          ...(body ? { 'content-type': 'application/json' } : {}),
          ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
        };
        const response = await fetch(
          `${import.meta.env.VITE_API_URL ?? '/api'}${path}`,
          {
            method,
            credentials: 'include',
            headers,
            body,
            signal,
          },
        );
        let responseBody: unknown;
        try {
          responseBody = await response.json();
        } catch {
          responseBody = undefined;
        }
        return { status: response.status, body: responseBody };
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === 'AbortError')
          throw error;
        return { status: 'network' };
      }
    },
    [identity],
  );

  const handleAccess = useCallback(
    async (
      result: HttpResult,
      companyContextId: string,
      signal: AbortSignal,
      resource: 'intake' | 'client-search' = 'intake',
    ): Promise<boolean> => {
      if (signal.aborted) return true;
      if (result.status === 401) {
        await identity.rejectSession();
        return true;
      }
      if (result.status !== 403) return false;
      let retainAuthorizedIntake = false;
      try {
        await handleAuthenticatedAccessRejection({
          result: { status: 'forbidden' },
          identity,
          companyContextId,
          onCompanyContextRejected: (rejectedCompanyId) =>
            rejectCompany.current(rejectedCompanyId),
          onActorRevalidated: (revalidatedActor) => {
            const company = revalidatedActor.activeCompany;
            retainAuthorizedIntake =
              resource === 'client-search' &&
              company?.id === companyContextId &&
              company.commercialIntakePermissions?.includes(
                'commercial.request.read',
              ) === true &&
              company.commercialIntakePermissions.includes(
                'commercial.opportunity.read',
              );
            return acceptActor.current(revalidatedActor);
          },
          onWorkspaceAccessRejected: () => rejectWorkspace.current(),
          signal,
        });
      } finally {
        if (!signal.aborted && !retainAuthorizedIntake) {
          setLoad({ kind: 'denied' });
          setSelected(undefined);
          setForm(emptyForm);
          setFeedback('');
          retry.current = undefined;
          listRequest.current?.abort();
          commandRequest.current?.abort();
        }
      }
      return true;
    },
    [identity],
  );

  const loadRequests = useCallback(
    async (companyContextId: string, cursor?: string): Promise<void> => {
      listRequest.current?.abort();
      const controller = new AbortController();
      listRequest.current = controller;
      setLoad((current) => startedPage({ current, companyContextId, cursor }));
      try {
        const result = await request({
          path: `/commercial-intake/requests?limit=${listPageSize}${
            cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''
          }`,
          companyContextId,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (await handleAccess(result, companyContextId, controller.signal))
          return;
        if (controller.signal.aborted) return;
        const page =
          result.status === 200 && isRequestList(result.body)
            ? result.body
            : undefined;
        setLoad((current) =>
          appliedPage({ current, companyContextId, cursor, page }),
        );
      } catch {
        if (!controller.signal.aborted)
          setLoad((current) =>
            appliedPage({
              current,
              companyContextId,
              cursor,
              page: undefined,
            }),
          );
      }
    },
    [handleAccess, request],
  );

  useEffect(() => {
    commandRequest.current?.abort();
    clientSearchRequest.current?.abort();
    retry.current = undefined;
    setSelected(undefined);
    setFeedback('');
    setClientQuery('');
    setClientSearch({ kind: 'idle' });
    setPending(false);
    if (!companyId) {
      setLoad({ kind: 'denied' });
      return;
    }
    void loadRequests(companyId);
    return () => {
      listRequest.current?.abort();
      clientSearchRequest.current?.abort();
    };
  }, [actor.workspaceId, actor.workspaceMembershipId, companyId, loadRequests]);

  function updateField(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function searchClients(): Promise<void> {
    if (!companyId || !canSearchClients) return;
    updateField('clientAccountId', '');
    const query = clientQuery.trim();
    if (!query) {
      setClientSearch({ kind: 'validation' });
      return;
    }
    clientSearchRequest.current?.abort();
    const controller = new AbortController();
    clientSearchRequest.current = controller;
    setClientSearch({ kind: 'loading' });
    try {
      const result = await request({
        path: `/clients/search?query=${encodeURIComponent(query)}`,
        companyContextId: companyId,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (result.status === 401) {
        await identity.rejectSession();
        return;
      }
      if (result.status === 403) {
        await handleAccess(
          result,
          companyId,
          controller.signal,
          'client-search',
        );
        if (controller.signal.aborted) return;
        setClientSearch({ kind: 'denied' });
        return;
      }
      setClientSearch(
        result.status === 200 && isClientChoices(result.body)
          ? {
              kind: 'ready',
              clients: result.body.filter(
                (client) => client.relatedToActiveCompany,
              ),
            }
          : { kind: 'error' },
      );
    } catch {
      if (!controller.signal.aborted) setClientSearch({ kind: 'error' });
    }
  }

  async function selectRequest(id: string): Promise<void> {
    if (!companyId) return;
    commandRequest.current?.abort();
    const controller = new AbortController();
    commandRequest.current = controller;
    setPending(true);
    setFeedback('');
    try {
      const result = await request({
        path: `/commercial-intake/requests/${encodeURIComponent(id)}`,
        companyContextId: companyId,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (await handleAccess(result, companyId, controller.signal)) return;
      if (result.status === 200 && isClientRequest(result.body))
        setSelected(result.body);
      else setFeedback(copy.error);
    } catch {
      if (!controller.signal.aborted) setFeedback(copy.error);
    } finally {
      if (!controller.signal.aborted) setPending(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!companyId || pending) return;
    if (
      !form.originalText.trim() ||
      !form.opportunityTitle.trim() ||
      !form.nextAction.trim()
    ) {
      setFeedback(copy.validation);
      return;
    }
    const reportedReceivedAt = form.reportedReceivedAt
      ? localDateTimeToIso(form.reportedReceivedAt)
      : undefined;
    if (form.reportedReceivedAt && !reportedReceivedAt) {
      setFeedback(copy.validation);
      return;
    }
    const command = {
      originalText: form.originalText,
      ...(form.sourceLabel ? { sourceLabel: form.sourceLabel } : {}),
      ...(reportedReceivedAt ? { reportedReceivedAt } : {}),
      ...(form.subject ? { subject: form.subject } : {}),
      ...(form.clientAccountId
        ? { clientAccountId: form.clientAccountId }
        : {}),
      opportunity: {
        title: form.opportunityTitle,
        ...(form.opportunityScope ? { scope: form.opportunityScope } : {}),
        nextAction: form.nextAction,
      },
    };
    const payload = JSON.stringify(command);
    const idempotencyKey =
      retry.current?.payload === payload
        ? retry.current.key
        : crypto.randomUUID();
    retry.current = { payload, key: idempotencyKey };
    commandRequest.current?.abort();
    const controller = new AbortController();
    commandRequest.current = controller;
    setPending(true);
    setFeedback('');
    try {
      const result = await request({
        path: '/commercial-intake/requests',
        companyContextId: companyId,
        signal: controller.signal,
        method: 'POST',
        body: payload,
        idempotencyKey,
      });
      if (controller.signal.aborted) return;
      if (await handleAccess(result, companyId, controller.signal)) return;
      if (isUnavailableClient(result)) {
        setFeedback(copy.unavailableClient);
        return;
      }
      if (
        (result.status === 200 || result.status === 201) &&
        isClientRequest(result.body)
      ) {
        setSelected(result.body);
        setForm(emptyForm);
        retry.current = undefined;
        await onActivityRecorded();
        if (!controller.signal.aborted) await loadRequests(companyId);
        return;
      }
      setFeedback(copy.error);
    } catch {
      if (!controller.signal.aborted) setFeedback(copy.error);
    } finally {
      if (!controller.signal.aborted) setPending(false);
    }
  }

  if (load.kind === 'denied') {
    return (
      <section className="commercial-intake-workspace">
        <p role="alert">{copy.denied}</p>
      </section>
    );
  }
  const companyName = actor.activeCompany?.displayName ?? actor.workspaceName;
  return (
    <section
      className="commercial-intake-workspace"
      aria-labelledby="commercial-intake-title"
    >
      <header className="commercial-intake-heading">
        <p>{copy.eyebrow}</p>
        <h2 id="commercial-intake-title">{copy.title}</h2>
        <p>
          {copy.companyPrefix} {companyName}
        </p>
      </header>
      <aside
        className="commercial-intake-source"
        aria-label="Manual source information"
      >
        <strong>{copy.manualSource}</strong>
        <p>{copy.manualSourceDetail}</p>
      </aside>
      {feedback ? <p role="alert">{feedback}</p> : null}
      {selected ? (
        <RequestDetail
          request={selected}
          onBack={() => setSelected(undefined)}
        />
      ) : (
        <>
          <form
            className="commercial-intake-form"
            noValidate
            onSubmit={(event) => void submit(event)}
          >
            <label>
              {copy.originalText}
              <textarea
                value={form.originalText}
                onChange={(event) =>
                  updateField('originalText', event.target.value)
                }
                required
                maxLength={20000}
              />
            </label>
            <label>
              {copy.sourceLabel}
              <input
                value={form.sourceLabel}
                onChange={(event) =>
                  updateField('sourceLabel', event.target.value)
                }
                maxLength={120}
              />
            </label>
            <label>
              {copy.reportedReceivedAt}
              <input
                type="datetime-local"
                value={form.reportedReceivedAt}
                onChange={(event) =>
                  updateField('reportedReceivedAt', event.target.value)
                }
              />
            </label>
            <label>
              {copy.subject}
              <input
                value={form.subject}
                onChange={(event) => updateField('subject', event.target.value)}
                maxLength={200}
              />
            </label>
            {canSearchClients ? (
              <div className="commercial-intake-field">
                <label htmlFor="commercial-intake-client-search">
                  {copy.clientSearch}
                </label>
                <input
                  id="commercial-intake-client-search"
                  value={clientQuery}
                  onChange={(event) => {
                    setClientQuery(event.target.value);
                    setClientSearch({ kind: 'idle' });
                    updateField('clientAccountId', '');
                  }}
                  maxLength={200}
                />
                <button
                  type="button"
                  disabled={clientSearch.kind === 'loading'}
                  onClick={() => void searchClients()}
                >
                  {copy.searchClients}
                </button>
                {clientSearch.kind === 'ready' ? (
                  clientSearch.clients.length > 0 ? (
                    <>
                      <label htmlFor="commercial-intake-client">
                        {copy.existingClient}
                      </label>
                      <select
                        id="commercial-intake-client"
                        value={form.clientAccountId}
                        onChange={(event) =>
                          updateField('clientAccountId', event.target.value)
                        }
                      >
                        <option value="">{copy.noClient}</option>
                        {clientSearch.clients.map((client) => (
                          <option key={client.id} value={client.id}>
                            {client.displayName}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : (
                    <p>{copy.clientSearchEmpty}</p>
                  )
                ) : clientSearch.kind === 'denied' ? (
                  <p>{copy.clientSearchDenied}</p>
                ) : clientSearch.kind === 'validation' ? (
                  <p>{copy.clientSearchValidation}</p>
                ) : clientSearch.kind === 'error' ? (
                  <p>{copy.clientSearchError}</p>
                ) : null}
                <small>{copy.clientHelp}</small>
              </div>
            ) : (
              <p>{copy.clientSearchDenied}</p>
            )}
            <label>
              {copy.opportunityTitle}
              <input
                value={form.opportunityTitle}
                onChange={(event) =>
                  updateField('opportunityTitle', event.target.value)
                }
                required
                maxLength={160}
              />
            </label>
            <label>
              {copy.opportunityScope}
              <textarea
                value={form.opportunityScope}
                onChange={(event) =>
                  updateField('opportunityScope', event.target.value)
                }
                maxLength={2000}
              />
            </label>
            <label>
              {copy.nextAction}
              <input
                value={form.nextAction}
                onChange={(event) =>
                  updateField('nextAction', event.target.value)
                }
                required
                maxLength={500}
              />
            </label>
            <button type="submit" disabled={pending}>
              {copy.capture}
            </button>
          </form>
          <RequestList
            load={load}
            pending={pending}
            onSelect={(id) => void selectRequest(id)}
            onReload={() => companyId && void loadRequests(companyId)}
            onLoadOlder={(cursor) =>
              companyId && void loadRequests(companyId, cursor)
            }
            companyName={companyName}
          />
        </>
      )}
    </section>
  );
}

function startedPage({
  current,
  companyContextId,
  cursor,
}: {
  current: LoadState;
  companyContextId: string;
  cursor: string | undefined;
}): LoadState {
  if (!cursor) return { kind: 'loading' };
  return sameCompanyPage(current, companyContextId)
    ? { ...current, olderPage: 'loading' }
    : current;
}

function appliedPage({
  current,
  companyContextId,
  cursor,
  page,
}: {
  current: LoadState;
  companyContextId: string;
  cursor: string | undefined;
  page: RequestPage | undefined;
}): LoadState {
  if (!cursor)
    return page
      ? readyPage({
          companyId: companyContextId,
          items: page.items,
          nextCursor: page.nextCursor,
        })
      : { kind: 'error' };
  if (!sameCompanyPage(current, companyContextId)) return current;
  return page
    ? readyPage({
        companyId: companyContextId,
        items: [...current.items, ...page.items],
        nextCursor: page.nextCursor,
      })
    : { ...current, olderPage: 'error' };
}

function sameCompanyPage(
  current: LoadState,
  companyContextId: string,
): current is Extract<LoadState, { kind: 'ready' }> {
  return current.kind === 'ready' && current.companyId === companyContextId;
}

function readyPage({
  companyId,
  items,
  nextCursor,
}: {
  companyId: string;
  items: RequestListItem[];
  nextCursor: string | undefined;
}): LoadState {
  return {
    kind: 'ready',
    companyId,
    items,
    olderPage: 'idle',
    ...(nextCursor === undefined ? {} : { nextCursor }),
  };
}

function RequestList({
  load,
  pending,
  onSelect,
  onReload,
  onLoadOlder,
  companyName,
}: {
  load: LoadState;
  pending: boolean;
  onSelect: (id: string) => void;
  onReload: () => void;
  onLoadOlder: (cursor: string) => void;
  companyName: string;
}) {
  if (load.kind === 'loading') return <p>{copy.loading}</p>;
  if (load.kind === 'denied') return <p role="alert">{copy.denied}</p>;
  if (load.kind === 'error')
    return (
      <>
        <p role="alert">{copy.error}</p>
        <button type="button" onClick={onReload}>
          {copy.retry}
        </button>
      </>
    );
  if (load.items.length === 0) return <p>{copy.empty(companyName)}</p>;
  const nextCursor = load.nextCursor;
  return (
    <>
      <ul className="commercial-intake-list" aria-label={copy.list}>
        {load.items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              disabled={pending}
              onClick={() => onSelect(item.id)}
            >
              <strong>{item.subject ?? copy.title}</strong>
              <span>{item.initialOpportunity.title}</span>
              <small>
                {copy.responsible}:{' '}
                {item.initialOpportunity.responsibleActor.displayName}
              </small>
            </button>
          </li>
        ))}
      </ul>
      {load.olderPage === 'loading' ? (
        <p role="status">{copy.olderLoading}</p>
      ) : null}
      {load.olderPage === 'error' ? (
        <p role="alert">{copy.olderError}</p>
      ) : null}
      {nextCursor ? (
        <button
          type="button"
          disabled={load.olderPage === 'loading'}
          onClick={() => onLoadOlder(nextCursor)}
        >
          {copy.showOlder}
        </button>
      ) : null}
    </>
  );
}

function RequestDetail({
  request,
  onBack,
}: {
  request: ClientRequest;
  onBack: () => void;
}) {
  return (
    <article
      className="commercial-intake-detail"
      aria-labelledby="commercial-intake-detail-title"
    >
      <button type="button" onClick={onBack}>
        {copy.back}
      </button>
      <p>{copy.detail}</p>
      <h3 id="commercial-intake-detail-title">
        {request.subject ?? copy.title}
      </h3>
      <dl>
        <div>
          <dt>{copy.source}</dt>
          <dd>{copy.sourceKindLabels[request.sourceKind]}</dd>
        </div>
        {request.sourceLabel ? (
          <div>
            <dt>{copy.sourceLabel}</dt>
            <dd>{request.sourceLabel}</dd>
          </div>
        ) : null}
        {request.reportedReceivedAt ? (
          <div>
            <dt>{copy.reportedReceivedAt}</dt>
            <dd>
              <time dateTime={request.reportedReceivedAt}>
                {new Date(request.reportedReceivedAt).toLocaleString(
                  undefined,
                  {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZoneName: 'short',
                  },
                )}
              </time>
            </dd>
          </div>
        ) : null}
        <div>
          <dt>{copy.originalText}</dt>
          <dd>{request.originalText}</dd>
        </div>
        {request.clientReference ? (
          <div>
            <dt>{copy.client}</dt>
            <dd>{request.clientReference.displayName}</dd>
          </div>
        ) : null}
      </dl>
      <section>
        <h4>{copy.initialOpportunity}</h4>
        <p>{request.initialOpportunity.title}</p>
        {request.initialOpportunity.scope ? (
          <p>{request.initialOpportunity.scope}</p>
        ) : null}
        <p>{request.initialOpportunity.nextAction}</p>
        <p>
          {copy.status}:{' '}
          {copy.opportunityStatusLabels[request.initialOpportunity.status]}
        </p>
      </section>
    </article>
  );
}

function isUnavailableClient(result: HttpResult): boolean {
  return (
    (result.status === 404 || result.status === 409) &&
    isRecord(result.body) &&
    result.body.code === 'CLIENT_REFERENCE_UNAVAILABLE'
  );
}

function isRequestList(value: unknown): value is RequestPage {
  return (
    isRecord(value) &&
    Array.isArray(value.items) &&
    value.items.every(isRequestListItem) &&
    (value.nextCursor === undefined || typeof value.nextCursor === 'string')
  );
}

function isRequestListItem(value: unknown): value is RequestListItem {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    isNullableString(value.subject) &&
    typeof value.capturedAt === 'string' &&
    isRecord(value.initialOpportunity) &&
    typeof value.initialOpportunity.title === 'string' &&
    typeof value.initialOpportunity.nextAction === 'string' &&
    isRecord(value.initialOpportunity.responsibleActor) &&
    typeof value.initialOpportunity.responsibleActor.workspaceMembershipId ===
      'string' &&
    typeof value.initialOpportunity.responsibleActor.displayName === 'string'
  );
}

function isClientRequest(value: unknown): value is ClientRequest {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.companyId === 'string' &&
    value.sourceKind === 'MANUAL_TEXT' &&
    isNullableString(value.sourceLabel) &&
    isNullableString(value.reportedReceivedAt) &&
    isNullableString(value.subject) &&
    typeof value.originalText === 'string' &&
    typeof value.capturedByWorkspaceMembershipId === 'string' &&
    typeof value.capturedAt === 'string' &&
    value.version === 1 &&
    isInitialOpportunity(value.initialOpportunity) &&
    (value.clientReference === undefined ||
      isClientReference(value.clientReference))
  );
}

function isClientChoices(value: unknown): value is ClientChoice[] {
  return (
    Array.isArray(value) &&
    value.every(
      (client) =>
        isRecord(client) &&
        typeof client.id === 'string' &&
        typeof client.displayName === 'string' &&
        typeof client.relatedToActiveCompany === 'boolean',
    )
  );
}

function isInitialOpportunity(
  value: unknown,
): value is ClientRequest['initialOpportunity'] {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    isNullableString(value.scope) &&
    typeof value.nextAction === 'string' &&
    value.status === 'OPEN' &&
    typeof value.responsibleWorkspaceMembershipId === 'string' &&
    typeof value.createdAt === 'string' &&
    value.version === 1
  );
}

function isClientReference(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.originalClientId === 'string' &&
    (value.currentClientId === undefined ||
      typeof value.currentClientId === 'string') &&
    typeof value.displayName === 'string'
  );
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function localDateTimeToIso(value: string): string | undefined {
  const instant = new Date(value);
  return Number.isNaN(instant.getTime()) ? undefined : instant.toISOString();
}
