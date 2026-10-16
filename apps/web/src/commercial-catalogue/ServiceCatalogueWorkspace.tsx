import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { handleAuthenticatedAccessRejection } from '../api/latest-authenticated-request';
import { selectedWorkspaceId } from '../access/workspace-selection';
import { Select } from '../presentation/Select';
import { useServiceCatalogueCopy } from './service-catalogue.copy';
import './service-catalogue.css';

type ServiceDefinition = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  provenance: 'ILLUSTRATIVE';
  provisional: true;
  createdByWorkspaceMembershipId: string;
  createdAt: string;
};

type CompanyServiceOffering = {
  id: string;
  companyId: string;
  serviceDefinitionId: string;
  serviceDefinition: { code: string; name: string };
  commercialLabel: string | null;
  availability: 'AVAILABLE';
  provenance: 'ILLUSTRATIVE';
  provisional: true;
  createdByWorkspaceMembershipId: string;
  createdAt: string;
};

type Page<T> = { items: T[]; nextCursor?: string };

type ListState<T> =
  | { kind: 'loading' }
  | {
      kind: 'ready';
      companyId: string;
      items: T[];
      nextCursor?: string;
      olderPage: 'idle' | 'loading' | 'error';
    }
  | { kind: 'error' };

type Feedback = { tone: 'status' | 'alert' } & (
  | {
      message: 'definitionCreated' | 'definitionUnchanged' | 'codeConflict';
      code: string;
    }
  | {
      message: 'offeringCreated' | 'offeringUnchanged' | 'offeringDuplicate';
      name: string;
    }
  | {
      message:
        | 'definitionValidation'
        | 'offeringValidation'
        | 'definitionUnavailable'
        | 'error';
    }
);
type HttpResult = { status: number; body: unknown } | { status: 'network' };
type DefinitionForm = { code: string; name: string; description: string };
type OfferingForm = { serviceDefinitionId: string; commercialLabel: string };

const listPageSize = 25;
const codeGrammar = /^[A-Z0-9_-]{1,40}$/u;
const emptyDefinition: DefinitionForm = { code: '', name: '', description: '' };
const emptyOffering: OfferingForm = {
  serviceDefinitionId: '',
  commercialLabel: '',
};
const definitionsPath = '/commercial-catalogue/service-definitions';
const offeringsPath = '/commercial-catalogue/offerings';

export function ServiceCatalogueWorkspace({
  actor,
  identity,
  onCompanyContextRejected,
  onActorRevalidated = () => undefined,
  onWorkspaceAccessRejected = () => undefined,
}: {
  actor: ActorContext;
  identity: BrowserIdentity;
  onCompanyContextRejected: (companyContextId: string) => void;
  onActorRevalidated?: (actor: ActorContext) => Promise<void> | void;
  onWorkspaceAccessRejected?: () => Promise<void> | void;
}) {
  const copy = useServiceCatalogueCopy();
  const [denied, setDenied] = useState(false);
  const [definitions, setDefinitions] = useState<ListState<ServiceDefinition>>({
    kind: 'loading',
  });
  const [offerings, setOfferings] = useState<ListState<CompanyServiceOffering>>(
    { kind: 'loading' },
  );
  const [definitionForm, setDefinitionForm] =
    useState<DefinitionForm>(emptyDefinition);
  const [offeringForm, setOfferingForm] = useState<OfferingForm>(emptyOffering);
  const [definitionFeedback, setDefinitionFeedback] = useState<Feedback>();
  const [offeringFeedback, setOfferingFeedback] = useState<Feedback>();
  const [pending, setPending] = useState(false);
  const fieldId = useId();
  const definitionRequest = useRef<AbortController | undefined>(undefined);
  const offeringRequest = useRef<AbortController | undefined>(undefined);
  const commandRequest = useRef<AbortController | undefined>(undefined);
  const definitionRetry = useRef<{ payload: string; key: string }>(undefined);
  const offeringRetry = useRef<{ payload: string; key: string }>(undefined);
  const offeringsBootstrap = useRef<string | undefined>(undefined);
  const rejectCompany = useRef(onCompanyContextRejected);
  const acceptActor = useRef(onActorRevalidated);
  const rejectWorkspace = useRef(onWorkspaceAccessRejected);
  rejectCompany.current = onCompanyContextRejected;
  acceptActor.current = onActorRevalidated;
  rejectWorkspace.current = onWorkspaceAccessRejected;
  const companyId = actor.activeCompany?.id;
  const companyName = actor.activeCompany?.displayName ?? actor.workspaceName;

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
        const response = await fetch(
          `${import.meta.env.VITE_API_URL ?? '/api'}${path}`,
          {
            method,
            credentials: 'include',
            headers: {
              ...(identity.requestHeaders ??
                (token ? { Authorization: `Bearer ${token}` } : {})),
              ...(workspaceId ? { 'x-workspace-context-id': workspaceId } : {}),
              'x-company-context-id': companyContextId,
              ...(body ? { 'content-type': 'application/json' } : {}),
              ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
            },
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
    ): Promise<boolean> => {
      if (signal.aborted) return true;
      if (result.status === 401) {
        await identity.rejectSession();
        return true;
      }
      if (result.status !== 403) return false;
      try {
        await handleAuthenticatedAccessRejection({
          result: { status: 'forbidden' },
          identity,
          companyContextId,
          onCompanyContextRejected: (rejectedCompanyId) =>
            rejectCompany.current(rejectedCompanyId),
          onActorRevalidated: (revalidatedActor) =>
            acceptActor.current(revalidatedActor),
          onWorkspaceAccessRejected: () => rejectWorkspace.current(),
          signal,
        });
      } finally {
        if (!signal.aborted) {
          setDenied(true);
          setDefinitions({ kind: 'loading' });
          setOfferings({ kind: 'loading' });
          setDefinitionForm(emptyDefinition);
          setOfferingForm(emptyOffering);
          setDefinitionFeedback(undefined);
          setOfferingFeedback(undefined);
          definitionRetry.current = undefined;
          offeringRetry.current = undefined;
          definitionRequest.current?.abort();
          offeringRequest.current?.abort();
          commandRequest.current?.abort();
        }
      }
      return true;
    },
    [identity],
  );

  const loadOfferings = useCallback(
    async (companyContextId: string, cursor?: string): Promise<void> => {
      offeringRequest.current?.abort();
      const controller = new AbortController();
      offeringRequest.current = controller;
      setOfferings((current) =>
        startedPage({ current, companyContextId, cursor }),
      );
      try {
        const result = await request({
          path: `${offeringsPath}?limit=${listPageSize}${
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
          result.status === 200 && isPage(result.body, isCompanyServiceOffering)
            ? result.body
            : undefined;
        setOfferings((current) =>
          appliedPage({ current, companyContextId, cursor, page }),
        );
      } catch {
        if (!controller.signal.aborted)
          setOfferings((current) =>
            appliedPage({ current, companyContextId, cursor, page: undefined }),
          );
      }
    },
    [handleAccess, request],
  );

  const loadDefinitions = useCallback(
    async (companyContextId: string, cursor?: string): Promise<void> => {
      definitionRequest.current?.abort();
      const controller = new AbortController();
      definitionRequest.current = controller;
      setDefinitions((current) =>
        startedPage({ current, companyContextId, cursor }),
      );
      try {
        const result = await request({
          path: `${definitionsPath}?limit=${listPageSize}${
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
          result.status === 200 && isPage(result.body, isServiceDefinition)
            ? result.body
            : undefined;
        setDefinitions((current) =>
          appliedPage({ current, companyContextId, cursor, page }),
        );
        // The first definitions read to settle for this Company starts the
        // offerings read, even when a created definition's refresh replaced
        // the initial read.
        if (offeringsBootstrap.current === companyContextId) {
          offeringsBootstrap.current = undefined;
          void loadOfferings(companyContextId);
        }
      } catch {
        if (!controller.signal.aborted)
          setDefinitions((current) =>
            appliedPage({ current, companyContextId, cursor, page: undefined }),
          );
      }
    },
    [handleAccess, loadOfferings, request],
  );

  useEffect(() => {
    commandRequest.current?.abort();
    definitionRetry.current = undefined;
    offeringRetry.current = undefined;
    // Definitions first: one denial settles the whole screen before the
    // Company-scoped offerings are requested.
    offeringsBootstrap.current = companyId;
    setDenied(false);
    setDefinitionFeedback(undefined);
    setOfferingFeedback(undefined);
    setPending(false);
    if (!companyId) {
      setDenied(true);
      return;
    }
    void loadDefinitions(companyId);
    return () => {
      definitionRequest.current?.abort();
      offeringRequest.current?.abort();
      commandRequest.current?.abort();
    };
  }, [
    actor.workspaceId,
    actor.workspaceMembershipId,
    companyId,
    loadDefinitions,
  ]);

  async function submitDefinition(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (!companyId || pending) return;
    const code = definitionForm.code.trim();
    const name = definitionForm.name;
    if (
      !codeGrammar.test(code) ||
      name.trim().length === 0 ||
      characterCount(name) > 160 ||
      characterCount(definitionForm.description) > 2_000
    ) {
      setDefinitionFeedback({
        tone: 'alert',
        message: 'definitionValidation',
      });
      return;
    }
    const payload = JSON.stringify({
      code,
      name,
      ...(definitionForm.description
        ? { description: definitionForm.description }
        : {}),
    });
    const idempotencyKey =
      definitionRetry.current?.payload === payload
        ? definitionRetry.current.key
        : crypto.randomUUID();
    definitionRetry.current = { payload, key: idempotencyKey };
    const controller = startCommand();
    setDefinitionFeedback(undefined);
    try {
      const result = await request({
        path: definitionsPath,
        companyContextId: companyId,
        signal: controller.signal,
        method: 'POST',
        body: payload,
        idempotencyKey,
      });
      if (controller.signal.aborted) return;
      if (await handleAccess(result, companyId, controller.signal)) return;
      if (
        (result.status === 200 || result.status === 201) &&
        isDefinitionResult(result.body)
      ) {
        const { outcome, definition } = result.body;
        setDefinitionFeedback({
          tone: 'status',
          message:
            outcome === 'CREATED' ? 'definitionCreated' : 'definitionUnchanged',
          code: definition.code,
        });
        setDefinitionForm(emptyDefinition);
        setOfferingForm((current) => ({
          ...current,
          serviceDefinitionId: definition.id,
        }));
        definitionRetry.current = undefined;
        await loadDefinitions(companyId);
        return;
      }
      setDefinitionFeedback(
        hasErrorCode(result, 409, 'SERVICE_CODE_CONFLICT')
          ? { tone: 'alert', message: 'codeConflict', code }
          : {
              tone: 'alert',
              message: hasErrorCode(result, 400, 'VALIDATION_ERROR')
                ? 'definitionValidation'
                : 'error',
            },
      );
    } catch {
      if (!controller.signal.aborted)
        setDefinitionFeedback({ tone: 'alert', message: 'error' });
    } finally {
      if (!controller.signal.aborted) setPending(false);
    }
  }

  async function submitOffering(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (!companyId || pending) return;
    const selected =
      definitions.kind === 'ready'
        ? definitions.items.find(
            (definition) => definition.id === offeringForm.serviceDefinitionId,
          )
        : undefined;
    if (!selected || characterCount(offeringForm.commercialLabel) > 160) {
      setOfferingFeedback({ tone: 'alert', message: 'offeringValidation' });
      return;
    }
    const payload = JSON.stringify({
      serviceDefinitionId: selected.id,
      ...(offeringForm.commercialLabel
        ? { commercialLabel: offeringForm.commercialLabel }
        : {}),
    });
    const idempotencyKey =
      offeringRetry.current?.payload === payload
        ? offeringRetry.current.key
        : crypto.randomUUID();
    offeringRetry.current = { payload, key: idempotencyKey };
    const controller = startCommand();
    setOfferingFeedback(undefined);
    try {
      const result = await request({
        path: offeringsPath,
        companyContextId: companyId,
        signal: controller.signal,
        method: 'POST',
        body: payload,
        idempotencyKey,
      });
      if (controller.signal.aborted) return;
      if (await handleAccess(result, companyId, controller.signal)) return;
      if (
        (result.status === 200 || result.status === 201) &&
        isOfferingResult(result.body)
      ) {
        const { outcome, offering } = result.body;
        setOfferingFeedback({
          tone: 'status',
          message:
            outcome === 'CREATED' ? 'offeringCreated' : 'offeringUnchanged',
          name: offering.serviceDefinition.name,
        });
        setOfferingForm(emptyOffering);
        offeringRetry.current = undefined;
        await loadOfferings(companyId);
        return;
      }
      if (result.status === 404) {
        setOfferingFeedback({
          tone: 'alert',
          message: 'definitionUnavailable',
        });
        await loadDefinitions(companyId);
        return;
      }
      setOfferingFeedback(
        hasErrorCode(result, 409, 'OFFERING_CONFLICT')
          ? { tone: 'alert', message: 'offeringDuplicate', name: selected.name }
          : {
              tone: 'alert',
              message: hasErrorCode(result, 400, 'VALIDATION_ERROR')
                ? 'offeringValidation'
                : 'error',
            },
      );
    } catch {
      if (!controller.signal.aborted)
        setOfferingFeedback({ tone: 'alert', message: 'error' });
    } finally {
      if (!controller.signal.aborted) setPending(false);
    }
  }

  function startCommand(): AbortController {
    commandRequest.current?.abort();
    const controller = new AbortController();
    commandRequest.current = controller;
    setPending(true);
    return controller;
  }

  function feedbackMessage(feedback: Feedback): string {
    if ('code' in feedback) return copy[feedback.message](feedback.code);
    if ('name' in feedback) return copy[feedback.message](feedback.name);
    return copy[feedback.message];
  }

  if (denied) {
    return (
      <section className="service-catalogue">
        <p role="alert">{copy.denied}</p>
      </section>
    );
  }
  const definitionChoices =
    definitions.kind === 'ready' ? definitions.items : [];
  return (
    <section
      className="service-catalogue"
      aria-labelledby="service-catalogue-title"
    >
      <header className="service-catalogue-heading">
        <p>{copy.eyebrow}</p>
        <h2 id="service-catalogue-title">{copy.title}</h2>
        <p>
          {copy.companyPrefix} {companyName}
        </p>
      </header>
      <aside className="service-catalogue-notice" aria-label={copy.noticeLabel}>
        <strong>{copy.illustrativeMarker}</strong>
        <p>{copy.illustrativeDetail}</p>
        <p>{copy.abilityDisclaimer}</p>
      </aside>
      <div className="service-catalogue-columns">
        <section
          className="service-catalogue-panel"
          aria-labelledby="service-definitions-title"
        >
          <h3 id="service-definitions-title">{copy.definitionsTitle}</h3>
          <p>{copy.definitionsDescription}</p>
          <form noValidate onSubmit={(event) => void submitDefinition(event)}>
            <div className="service-catalogue-field">
              <label htmlFor={fieldId + '-code'}>{copy.code}</label>
              <input
                id={fieldId + '-code'}
                value={definitionForm.code}
                onChange={(event) =>
                  setDefinitionForm((current) => ({
                    ...current,
                    code: event.target.value.toUpperCase(),
                  }))
                }
                required
                maxLength={40}
              />
            </div>
            <small>{copy.codeHelp}</small>
            <div className="service-catalogue-field">
              <label htmlFor={fieldId + '-name'}>{copy.name}</label>
              <input
                id={fieldId + '-name'}
                value={definitionForm.name}
                onChange={(event) =>
                  setDefinitionForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                required
              />
            </div>
            <div className="service-catalogue-field">
              <label htmlFor={fieldId + '-description'}>
                {copy.description}
              </label>
              <textarea
                id={fieldId + '-description'}
                value={definitionForm.description}
                onChange={(event) =>
                  setDefinitionForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </div>
            <button
              className="service-catalogue-action service-catalogue-action--primary"
              type="submit"
              disabled={pending}
            >
              {copy.defineService}
            </button>
          </form>
          {definitionFeedback ? (
            <p role={definitionFeedback.tone}>
              {feedbackMessage(definitionFeedback)}
            </p>
          ) : null}
          <CatalogueList
            state={definitions}
            label={copy.definitionsList}
            loading={copy.definitionsLoading}
            empty={copy.definitionsEmpty}
            error={copy.definitionsError}
            retry={copy.retryDefinitions}
            showOlder={copy.showOlderDefinitions}
            olderLoading={copy.olderDefinitionsLoading}
            olderError={copy.olderDefinitionsError}
            onReload={() => companyId && void loadDefinitions(companyId)}
            onLoadOlder={(cursor) =>
              companyId && void loadDefinitions(companyId, cursor)
            }
            renderItem={(definition) => (
              <>
                <strong>{definition.code}</strong>
                <span>{definition.name}</span>
                {definition.description ? (
                  <small>{definition.description}</small>
                ) : null}
                <em className="service-catalogue-badge">
                  {copy.provenanceLabels[definition.provenance]}
                </em>
              </>
            )}
          />
        </section>
        <section
          className="service-catalogue-panel"
          aria-labelledby="company-offerings-title"
        >
          <h3 id="company-offerings-title">
            {copy.offeringsTitle(companyName)}
          </h3>
          <p>{copy.offeringsDescription}</p>
          <form noValidate onSubmit={(event) => void submitOffering(event)}>
            <div className="service-catalogue-field">
              <label htmlFor={fieldId + '-definition'}>
                {copy.offeredDefinition}
              </label>
              <Select
                id={fieldId + '-definition'}
                value={offeringForm.serviceDefinitionId}
                placeholder={copy.selectDefinition}
                options={definitionChoices.map((definition) => ({
                  value: definition.id,
                  label: `${definition.code} — ${definition.name}`,
                }))}
                onValueChange={(value) =>
                  setOfferingForm((current) => ({
                    ...current,
                    serviceDefinitionId: value,
                  }))
                }
                required
              />
            </div>
            {definitions.kind === 'ready' && definitionChoices.length === 0 ? (
              <p>{copy.noDefinitionsToOffer}</p>
            ) : null}
            <div className="service-catalogue-field">
              <label htmlFor={fieldId + '-commercial-label'}>
                {copy.commercialLabel}
              </label>
              <input
                id={fieldId + '-commercial-label'}
                value={offeringForm.commercialLabel}
                onChange={(event) =>
                  setOfferingForm((current) => ({
                    ...current,
                    commercialLabel: event.target.value,
                  }))
                }
              />
            </div>
            <small>{copy.commercialLabelHelp}</small>
            <button
              className="service-catalogue-action service-catalogue-action--primary"
              type="submit"
              disabled={pending}
            >
              {copy.offerService}
            </button>
          </form>
          {offeringFeedback ? (
            <p role={offeringFeedback.tone}>
              {feedbackMessage(offeringFeedback)}
            </p>
          ) : null}
          <CatalogueList
            state={offerings}
            label={copy.offeringsList}
            loading={copy.offeringsLoading}
            empty={copy.offeringsEmpty(companyName)}
            error={copy.offeringsError}
            retry={copy.retryOfferings}
            showOlder={copy.showOlderOfferings}
            olderLoading={copy.olderOfferingsLoading}
            olderError={copy.olderOfferingsError}
            onReload={() => companyId && void loadOfferings(companyId)}
            onLoadOlder={(cursor) =>
              companyId && void loadOfferings(companyId, cursor)
            }
            renderItem={(offering) => (
              <>
                <strong>{offering.serviceDefinition.name}</strong>
                <span>{offering.serviceDefinition.code}</span>
                {offering.commercialLabel ? (
                  <small>{offering.commercialLabel}</small>
                ) : null}
                <span>{copy.availabilityLabels[offering.availability]}</span>
                <em className="service-catalogue-badge">
                  {copy.provenanceLabels[offering.provenance]}
                </em>
              </>
            )}
          />
        </section>
      </div>
    </section>
  );
}

function CatalogueList<T extends { id: string }>({
  state,
  label,
  loading,
  empty,
  error,
  retry,
  showOlder,
  olderLoading,
  olderError,
  onReload,
  onLoadOlder,
  renderItem,
}: {
  state: ListState<T>;
  label: string;
  loading: string;
  empty: string;
  error: string;
  retry: string;
  showOlder: string;
  olderLoading: string;
  olderError: string;
  onReload: () => void;
  onLoadOlder: (cursor: string) => void;
  renderItem: (item: T) => ReactNode;
}) {
  if (state.kind === 'loading') return <p>{loading}</p>;
  if (state.kind === 'error')
    return (
      <>
        <p role="alert">{error}</p>
        <button
          className="service-catalogue-action service-catalogue-action--secondary"
          type="button"
          onClick={onReload}
        >
          {retry}
        </button>
      </>
    );
  if (state.items.length === 0) return <p>{empty}</p>;
  const nextCursor = state.nextCursor;
  return (
    <>
      <ul className="service-catalogue-list" aria-label={label}>
        {state.items.map((item) => (
          <li key={item.id}>{renderItem(item)}</li>
        ))}
      </ul>
      {state.olderPage === 'loading' ? (
        <p role="status">{olderLoading}</p>
      ) : null}
      {state.olderPage === 'error' ? <p role="alert">{olderError}</p> : null}
      {nextCursor ? (
        <button
          className="service-catalogue-action service-catalogue-action--secondary"
          type="button"
          disabled={state.olderPage === 'loading'}
          onClick={() => onLoadOlder(nextCursor)}
        >
          {showOlder}
        </button>
      ) : null}
    </>
  );
}

function startedPage<T>({
  current,
  companyContextId,
  cursor,
}: {
  current: ListState<T>;
  companyContextId: string;
  cursor: string | undefined;
}): ListState<T> {
  if (!cursor) return { kind: 'loading' };
  return sameCompanyPage(current, companyContextId)
    ? { ...current, olderPage: 'loading' }
    : current;
}

function appliedPage<T>({
  current,
  companyContextId,
  cursor,
  page,
}: {
  current: ListState<T>;
  companyContextId: string;
  cursor: string | undefined;
  page: Page<T> | undefined;
}): ListState<T> {
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

function sameCompanyPage<T>(
  current: ListState<T>,
  companyContextId: string,
): current is Extract<ListState<T>, { kind: 'ready' }> {
  return current.kind === 'ready' && current.companyId === companyContextId;
}

function readyPage<T>({
  companyId,
  items,
  nextCursor,
}: {
  companyId: string;
  items: T[];
  nextCursor: string | undefined;
}): ListState<T> {
  return {
    kind: 'ready',
    companyId,
    items,
    olderPage: 'idle',
    ...(nextCursor === undefined ? {} : { nextCursor }),
  };
}

// Counts Unicode code points like the server limits. A string's length and a
// browser maxLength count UTF-16 code units and double supplementary ones.
function characterCount(value: string): number {
  return Array.from(value).length;
}

function hasErrorCode(
  result: HttpResult,
  status: number,
  code: string,
): boolean {
  return (
    result.status === status &&
    isRecord(result.body) &&
    result.body.code === code
  );
}

function isPage<T>(
  value: unknown,
  isItem: (item: unknown) => item is T,
): value is Page<T> {
  return (
    isRecord(value) &&
    Array.isArray(value.items) &&
    value.items.every(isItem) &&
    (value.nextCursor === undefined || typeof value.nextCursor === 'string')
  );
}

function isDefinitionResult(value: unknown): value is {
  outcome: 'CREATED' | 'UNCHANGED';
  definition: ServiceDefinition;
} {
  return (
    isRecord(value) &&
    isOutcome(value.outcome) &&
    isServiceDefinition(value.definition)
  );
}

function isOfferingResult(value: unknown): value is {
  outcome: 'CREATED' | 'UNCHANGED';
  offering: CompanyServiceOffering;
} {
  return (
    isRecord(value) &&
    isOutcome(value.outcome) &&
    isCompanyServiceOffering(value.offering)
  );
}

function isOutcome(value: unknown): value is 'CREATED' | 'UNCHANGED' {
  return value === 'CREATED' || value === 'UNCHANGED';
}

function isServiceDefinition(value: unknown): value is ServiceDefinition {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.code === 'string' &&
    typeof value.name === 'string' &&
    isNullableString(value.description) &&
    value.provenance === 'ILLUSTRATIVE' &&
    value.provisional === true &&
    typeof value.createdByWorkspaceMembershipId === 'string' &&
    typeof value.createdAt === 'string'
  );
}

function isCompanyServiceOffering(
  value: unknown,
): value is CompanyServiceOffering {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.companyId === 'string' &&
    typeof value.serviceDefinitionId === 'string' &&
    isRecord(value.serviceDefinition) &&
    typeof value.serviceDefinition.code === 'string' &&
    typeof value.serviceDefinition.name === 'string' &&
    isNullableString(value.commercialLabel) &&
    value.availability === 'AVAILABLE' &&
    value.provenance === 'ILLUSTRATIVE' &&
    value.provisional === true &&
    typeof value.createdByWorkspaceMembershipId === 'string' &&
    typeof value.createdAt === 'string'
  );
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
