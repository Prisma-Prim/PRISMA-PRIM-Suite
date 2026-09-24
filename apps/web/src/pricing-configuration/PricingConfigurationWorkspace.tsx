import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { handleAuthenticatedAccessRejection } from '../api/latest-authenticated-request';
import { selectedWorkspaceId } from '../access/workspace-selection';
import { formatApplicationDateTime } from '../presentation/date-time';
import { pricingConfigurationCopy as copy } from './pricing-configuration.copy';
import './pricing-configuration.css';

type RuleVersionState = keyof typeof copy.stateLabels;

type RuleVersion = {
  id: string;
  versionNumber: number;
  label: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  ruleShape: 'UNIT_PRICE_TIMES_QUANTITY';
  roundingMode: 'HALF_UP';
  roundingScale: 2;
  taxApplication: 'PER_LINE';
  provenance: keyof typeof copy.provenanceLabels;
  provisional: true;
  state: RuleVersionState;
  supersession: {
    supersededByVersionId: string;
    supersededAt: string;
    supersededFrom: string;
  } | null;
  createdByWorkspaceMembershipId: string;
  createdAt: string;
};

type RuleScope = {
  current: RuleVersion | null;
  headVersionNumber: number | null;
};

type RuleVersionPage = { items: RuleVersion[]; nextCursor?: string };

type ViewState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | {
      kind: 'ready';
      scope: RuleScope;
      versions: RuleVersion[];
      nextCursor?: string;
      olderPage: 'idle' | 'loading' | 'error';
    };

type Draft = { label: string; effectiveFrom: string; effectiveTo: string };

// One submitted publication: the exact payload, including the head number
// the caller displayed, and the idempotency key that makes it retryable.
type Publication = { payload: string; idempotencyKey: string };

type Feedback =
  | { kind: 'published' | 'unchanged'; versionNumber: number }
  | { kind: 'invalid'; message: string }
  | { kind: 'stale'; headVersionNumber: number | null }
  | { kind: 'uncertain' };

type HttpResult = { status: number; body: unknown } | { status: 'network' };

const scopePath = '/pricing-configuration/rule-scope';
const versionsPath = '/pricing-configuration/rule-versions';
const listPageSize = 25;
const labelMaximum = 120;
const emptyDraft: Draft = { label: '', effectiveFrom: '', effectiveTo: '' };

export function PricingConfigurationWorkspace({
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
  const [denied, setDenied] = useState(false);
  const [view, setView] = useState<ViewState>({ kind: 'loading' });
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [feedback, setFeedback] = useState<Feedback>();
  const [pending, setPending] = useState(false);
  const fieldId = useId();
  const loadRequest = useRef<AbortController | undefined>(undefined);
  const olderRequest = useRef<AbortController | undefined>(undefined);
  const commandRequest = useRef<AbortController | undefined>(undefined);
  const retry = useRef<Publication | undefined>(undefined);
  const rejectCompany = useRef(onCompanyContextRejected);
  const acceptActor = useRef(onActorRevalidated);
  const rejectWorkspace = useRef(onWorkspaceAccessRejected);
  rejectCompany.current = onCompanyContextRejected;
  acceptActor.current = onActorRevalidated;
  rejectWorkspace.current = onWorkspaceAccessRejected;
  const companyId = actor.activeCompany?.id;
  const companyName = actor.activeCompany?.displayName ?? actor.workspaceName;
  const canPublish =
    actor.activeCompany?.pricingConfigurationPermissions?.includes(
      'commercial.pricing.configuration.manage',
    ) === true;
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;

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
          setView({ kind: 'loading' });
          setDraft(emptyDraft);
          setFeedback(undefined);
          retry.current = undefined;
          loadRequest.current?.abort();
          olderRequest.current?.abort();
          commandRequest.current?.abort();
        }
      }
      return true;
    },
    [identity],
  );

  // The scope and the first page load together, so the displayed head and
  // list always come from one reload.
  const load = useCallback(
    async (companyContextId: string): Promise<void> => {
      loadRequest.current?.abort();
      olderRequest.current?.abort();
      const controller = new AbortController();
      loadRequest.current = controller;
      setView({ kind: 'loading' });
      try {
        const scopeResult = await request({
          path: scopePath,
          companyContextId,
          signal: controller.signal,
        });
        if (
          await handleAccess(scopeResult, companyContextId, controller.signal)
        )
          return;
        const pageResult = await request({
          path: `${versionsPath}?limit=${listPageSize}`,
          companyContextId,
          signal: controller.signal,
        });
        if (await handleAccess(pageResult, companyContextId, controller.signal))
          return;
        const scope =
          scopeResult.status === 200 && isRuleScope(scopeResult.body)
            ? scopeResult.body
            : undefined;
        const page =
          pageResult.status === 200 && isRuleVersionPage(pageResult.body)
            ? pageResult.body
            : undefined;
        setView(
          scope && page
            ? {
                kind: 'ready',
                scope,
                versions: page.items,
                olderPage: 'idle',
                ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
              }
            : { kind: 'error' },
        );
      } catch {
        if (!controller.signal.aborted) setView({ kind: 'error' });
      }
    },
    [handleAccess, request],
  );

  useEffect(() => {
    // A new Company, membership or Workspace starts from nothing: drafts,
    // retries and every in-flight reply of the previous context are dropped.
    commandRequest.current?.abort();
    retry.current = undefined;
    setDenied(false);
    setDraft(emptyDraft);
    setFeedback(undefined);
    setPending(false);
    if (!companyId) {
      setDenied(true);
      return;
    }
    void load(companyId);
    return () => {
      loadRequest.current?.abort();
      olderRequest.current?.abort();
      commandRequest.current?.abort();
    };
  }, [actor.workspaceId, actor.workspaceMembershipId, companyId, load]);

  async function loadOlder(cursor: string): Promise<void> {
    if (!companyId) return;
    olderRequest.current?.abort();
    const controller = new AbortController();
    olderRequest.current = controller;
    setView((current) =>
      current.kind === 'ready' ? { ...current, olderPage: 'loading' } : current,
    );
    try {
      const result = await request({
        path: `${versionsPath}?limit=${listPageSize}&cursor=${encodeURIComponent(cursor)}`,
        companyContextId: companyId,
        signal: controller.signal,
      });
      if (await handleAccess(result, companyId, controller.signal)) return;
      const page =
        result.status === 200 && isRuleVersionPage(result.body)
          ? result.body
          : undefined;
      setView((current) => {
        if (current.kind !== 'ready') return current;
        if (!page) return { ...current, olderPage: 'error' };
        return {
          kind: 'ready',
          scope: current.scope,
          versions: [...current.versions, ...page.items],
          olderPage: 'idle',
          ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
        };
      });
    } catch {
      if (!controller.signal.aborted)
        setView((current) =>
          current.kind === 'ready'
            ? { ...current, olderPage: 'error' }
            : current,
        );
    }
  }

  function reload(): void {
    if (!companyId) return;
    if (feedback?.kind === 'stale') setFeedback(undefined);
    void load(companyId);
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!companyId || pending || view.kind !== 'ready') return;
    const command = readDraft(draft, view.scope.headVersionNumber);
    if (!command) {
      setFeedback({ kind: 'invalid', message: copy.validation });
      return;
    }
    const payload = JSON.stringify(command);
    await send({
      payload,
      idempotencyKey:
        retry.current?.payload === payload
          ? retry.current.idempotencyKey
          : crypto.randomUUID(),
    });
  }

  async function send(publication: Publication): Promise<void> {
    if (!companyId) return;
    retry.current = publication;
    commandRequest.current?.abort();
    const controller = new AbortController();
    commandRequest.current = controller;
    setPending(true);
    setFeedback(undefined);
    try {
      const result = await request({
        path: versionsPath,
        companyContextId: companyId,
        signal: controller.signal,
        method: 'POST',
        body: publication.payload,
        idempotencyKey: publication.idempotencyKey,
      });
      if (await handleAccess(result, companyId, controller.signal)) return;
      const outcome = publicationOutcome(result);
      // An uncertain outcome keeps the exact payload and key for an explicit
      // retry; every definite outcome is final for this publication.
      if (outcome.kind !== 'uncertain') retry.current = undefined;
      setFeedback(outcome);
      if (outcome.kind === 'published' || outcome.kind === 'unchanged') {
        setDraft(emptyDraft);
        void load(companyId);
      }
    } catch {
      if (!controller.signal.aborted) setFeedback({ kind: 'uncertain' });
    } finally {
      if (!controller.signal.aborted) setPending(false);
    }
  }

  if (denied)
    return (
      <section className="pricing-configuration">
        <p role="alert">{copy.denied}</p>
      </section>
    );

  const head = view.kind === 'ready' ? view.scope.headVersionNumber : null;
  const scheduled =
    view.kind === 'ready'
      ? view.versions
          .filter((version) => version.state === 'SCHEDULED')
          .sort((left, right) => left.versionNumber - right.versionNumber)
      : [];
  const pendingRetry =
    feedback?.kind === 'uncertain' ? retry.current : undefined;

  return (
    <section
      className="pricing-configuration"
      aria-labelledby="pricing-configuration-title"
    >
      <header className="pricing-configuration-heading">
        <p>{copy.eyebrow}</p>
        <h2 id="pricing-configuration-title">{copy.title}</h2>
        <p>
          {copy.companyPrefix} {companyName}
        </p>
      </header>
      <aside
        className="pricing-configuration-notice"
        aria-label={copy.noticeLabel}
      >
        <strong>{copy.illustrativeMarker}</strong>
        <p>{copy.illustrativeDetail}</p>
        <p>{copy.timeZone(zone)}</p>
      </aside>
      <div className="pricing-configuration-toolbar">
        <button
          type="button"
          onClick={reload}
          disabled={view.kind === 'loading'}
        >
          {copy.reload}
        </button>
      </div>
      <div className="pricing-configuration-columns">
        <div className="pricing-configuration-panel">
          <section aria-labelledby="pricing-current-title">
            <h3 id="pricing-current-title">{copy.currentTitle}</h3>
            {view.kind === 'loading' ? <p>{copy.currentLoading}</p> : null}
            {view.kind === 'error' ? (
              <p role="alert">{copy.versionsError}</p>
            ) : null}
            {view.kind === 'ready' ? (
              <>
                {view.scope.current ? (
                  <VersionSummary version={view.scope.current} />
                ) : (
                  <p>{copy.noCurrent}</p>
                )}
                <p>{head === null ? copy.noHead : copy.head(head)}</p>
              </>
            ) : null}
          </section>
          <section aria-labelledby="pricing-scheduled-title">
            <h3 id="pricing-scheduled-title">{copy.scheduledTitle}</h3>
            {view.kind === 'ready' && scheduled.length === 0 ? (
              <p>{copy.noScheduled}</p>
            ) : null}
            {scheduled.length > 0 ? (
              <ol
                className="pricing-configuration-list"
                aria-label={copy.scheduledTitle}
              >
                {scheduled.map((version) => (
                  <li key={version.id}>
                    <strong>{copy.versionName(version.versionNumber)}</strong>
                    <span>{version.label}</span>
                    <span>
                      {copy.takesOver} <Instant value={version.effectiveFrom} />
                    </span>
                  </li>
                ))}
              </ol>
            ) : null}
          </section>
        </div>
        {canPublish ? (
          <section
            className="pricing-configuration-panel"
            aria-labelledby="pricing-publish-title"
          >
            <h3 id="pricing-publish-title">{copy.publishTitle}</h3>
            <p>
              {head === null ? copy.publishFirst : copy.publishAfterHead(head)}
            </p>
            <p>{copy.fixedRule}</p>
            <form noValidate onSubmit={(event) => void submit(event)}>
              <div className="pricing-configuration-field">
                <label htmlFor={fieldId + '-label'}>{copy.label}</label>
                <input
                  id={fieldId + '-label'}
                  value={draft.label}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      label: event.target.value,
                    }))
                  }
                  required
                />
              </div>
              <small>{copy.labelHelp}</small>
              <div className="pricing-configuration-field">
                <label htmlFor={fieldId + '-from'}>
                  {copy.effectiveFrom(zone)}
                </label>
                <input
                  id={fieldId + '-from'}
                  type="datetime-local"
                  step={1}
                  value={draft.effectiveFrom}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      effectiveFrom: event.target.value,
                    }))
                  }
                  required
                />
              </div>
              <div className="pricing-configuration-field">
                <label htmlFor={fieldId + '-to'}>
                  {copy.effectiveTo(zone)}
                </label>
                <input
                  id={fieldId + '-to'}
                  type="datetime-local"
                  step={1}
                  value={draft.effectiveTo}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      effectiveTo: event.target.value,
                    }))
                  }
                />
              </div>
              <button type="submit" disabled={pending || view.kind !== 'ready'}>
                {copy.publish}
              </button>
            </form>
            {feedback ? <FeedbackMessage feedback={feedback} /> : null}
            {pendingRetry ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => void send(pendingRetry)}
              >
                {copy.retryPublication}
              </button>
            ) : null}
          </section>
        ) : null}
      </div>
      <section
        className="pricing-configuration-panel"
        aria-labelledby="pricing-versions-title"
      >
        <h3 id="pricing-versions-title">{copy.versionsTitle}</h3>
        {view.kind === 'loading' ? <p>{copy.versionsLoading}</p> : null}
        {view.kind === 'ready' && view.versions.length === 0 ? (
          <p>{copy.versionsEmpty}</p>
        ) : null}
        {view.kind === 'ready' && view.versions.length > 0 ? (
          <ul
            className="pricing-configuration-list"
            aria-label={copy.versionsList}
          >
            {view.versions.map((version) => (
              <li key={version.id}>
                <VersionSummary
                  version={version}
                  isHead={version.versionNumber === head}
                />
              </li>
            ))}
          </ul>
        ) : null}
        {view.kind === 'ready' && view.olderPage === 'loading' ? (
          <p role="status">{copy.olderLoading}</p>
        ) : null}
        {view.kind === 'ready' && view.olderPage === 'error' ? (
          <p role="alert">{copy.olderError}</p>
        ) : null}
        {view.kind === 'ready' && view.nextCursor ? (
          <LoadOlder
            cursor={view.nextCursor}
            disabled={view.olderPage === 'loading'}
            onLoad={(cursor) => void loadOlder(cursor)}
          />
        ) : null}
      </section>
    </section>
  );
}

function LoadOlder({
  cursor,
  disabled,
  onLoad,
}: {
  cursor: string;
  disabled: boolean;
  onLoad: (cursor: string) => void;
}) {
  return (
    <button type="button" disabled={disabled} onClick={() => onLoad(cursor)}>
      {copy.showOlder}
    </button>
  );
}

function VersionSummary({
  version,
  isHead = false,
}: {
  version: RuleVersion;
  isHead?: boolean;
}) {
  return (
    <div className="pricing-configuration-version">
      <strong>{copy.versionName(version.versionNumber)}</strong>
      <span>{version.label}</span>
      <span className="pricing-configuration-state">
        {copy.stateLabels[version.state]}
      </span>
      {isHead ? (
        <em className="pricing-configuration-badge">{copy.headMarker}</em>
      ) : null}
      <span>
        {copy.window} {copy.from} <Instant value={version.effectiveFrom} />{' '}
        {version.effectiveTo ? (
          <>
            {copy.until} <Instant value={version.effectiveTo} />
          </>
        ) : (
          copy.openEnded
        )}
      </span>
      {version.supersession ? (
        <span>
          {copy.takenOverFrom}{' '}
          <Instant value={version.supersession.supersededFrom} />
        </span>
      ) : null}
      <em className="pricing-configuration-badge">
        {copy.provenanceLabels[version.provenance]}
      </em>
    </div>
  );
}

function Instant({ value }: { value: string }) {
  return <time dateTime={value}>{formatApplicationDateTime(value)}</time>;
}

function FeedbackMessage({ feedback }: { feedback: Feedback }) {
  switch (feedback.kind) {
    case 'published':
      return <p role="status">{copy.published(feedback.versionNumber)}</p>;
    case 'unchanged':
      return <p role="status">{copy.unchanged(feedback.versionNumber)}</p>;
    case 'invalid':
      return <p role="alert">{feedback.message}</p>;
    case 'stale':
      return <p role="alert">{copy.stale(feedback.headVersionNumber)}</p>;
    case 'uncertain':
      return <p role="alert">{copy.uncertain}</p>;
    default: {
      const exhaustive: never = feedback;
      return exhaustive;
    }
  }
}

// A datetime-local value names a wall-clock time in the browser time zone;
// it is converted once to the explicit instant the server receives.
function readDraft(
  draft: Draft,
  expectedActiveVersionNumber: number | null,
):
  | {
      label: string;
      effectiveFrom: string;
      effectiveTo?: string;
      expectedActiveVersionNumber: number | null;
    }
  | undefined {
  if (
    draft.label.trim().length === 0 ||
    Array.from(draft.label).length > labelMaximum
  )
    return undefined;
  const effectiveFrom = localInstant(draft.effectiveFrom);
  if (!effectiveFrom) return undefined;
  if (draft.effectiveTo === '')
    return { label: draft.label, effectiveFrom, expectedActiveVersionNumber };
  const effectiveTo = localInstant(draft.effectiveTo);
  if (!effectiveTo || Date.parse(effectiveTo) <= Date.parse(effectiveFrom))
    return undefined;
  return {
    label: draft.label,
    effectiveFrom,
    effectiveTo,
    expectedActiveVersionNumber,
  };
}

function localInstant(value: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/u.test(value))
    return undefined;
  const instant = new Date(value);
  return Number.isNaN(instant.getTime()) ? undefined : instant.toISOString();
}

function publicationOutcome(result: HttpResult): Feedback {
  if (result.status === 'network') return { kind: 'uncertain' };
  if (
    (result.status === 200 || result.status === 201) &&
    isRecord(result.body) &&
    (result.body.outcome === 'PUBLISHED' ||
      result.body.outcome === 'UNCHANGED') &&
    isRuleVersion(result.body.version)
  )
    return {
      kind: result.body.outcome === 'PUBLISHED' ? 'published' : 'unchanged',
      versionNumber: result.body.version.versionNumber,
    };
  const code = isRecord(result.body) ? result.body.code : undefined;
  if (result.status === 409 && code === 'STALE_ACTIVE_VERSION') {
    const headVersionNumber = isRecord(result.body)
      ? result.body.headVersionNumber
      : undefined;
    if (headVersionNumber === null || isVersionNumber(headVersionNumber))
      return { kind: 'stale', headVersionNumber };
  }
  const messages: Record<string, string> = {
    '400:VALIDATION_ERROR': copy.validation,
    '400:EFFECTIVE_FROM_PAST': copy.effectiveFromPast,
    '400:EFFECTIVE_FROM_NOT_ADVANCING': copy.effectiveFromNotAdvancing,
    '409:EFFECTIVE_WINDOW_GAP': copy.windowGap,
    '409:VERSION_EXHAUSTED': copy.versionExhausted,
  };
  const message =
    typeof code === 'string' ? messages[`${result.status}:${code}`] : undefined;
  return message ? { kind: 'invalid', message } : { kind: 'uncertain' };
}

function isRuleScope(value: unknown): value is RuleScope {
  return (
    isRecord(value) &&
    value.provisional === true &&
    (value.current === null || isRuleVersion(value.current)) &&
    (value.headVersionNumber === null ||
      isVersionNumber(value.headVersionNumber))
  );
}

function isRuleVersionPage(value: unknown): value is RuleVersionPage {
  return (
    isRecord(value) &&
    value.provisional === true &&
    Array.isArray(value.items) &&
    value.items.every(isRuleVersion) &&
    (value.nextCursor === undefined || typeof value.nextCursor === 'string')
  );
}

function isRuleVersion(value: unknown): value is RuleVersion {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    isVersionNumber(value.versionNumber) &&
    typeof value.label === 'string' &&
    isDisplayableInstant(value.effectiveFrom) &&
    (value.effectiveTo === null || isDisplayableInstant(value.effectiveTo)) &&
    value.ruleShape === 'UNIT_PRICE_TIMES_QUANTITY' &&
    value.roundingMode === 'HALF_UP' &&
    value.roundingScale === 2 &&
    value.taxApplication === 'PER_LINE' &&
    value.provenance === 'ILLUSTRATIVE' &&
    value.provisional === true &&
    (value.state === 'SCHEDULED' ||
      value.state === 'CURRENT' ||
      value.state === 'SUPERSEDED') &&
    (value.supersession === null || isSupersession(value.supersession)) &&
    typeof value.createdByWorkspaceMembershipId === 'string' &&
    isDisplayableInstant(value.createdAt)
  );
}

function isSupersession(
  value: unknown,
): value is NonNullable<RuleVersion['supersession']> {
  return (
    isRecord(value) &&
    typeof value.supersededByVersionId === 'string' &&
    isDisplayableInstant(value.supersededAt) &&
    isDisplayableInstant(value.supersededFrom)
  );
}

function isVersionNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

// Every instant handed to the shared formatter is proved to be the canonical
// API instant at this response boundary.
function isDisplayableInstant(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const instant = new Date(value);
  return !Number.isNaN(instant.getTime()) && instant.toISOString() === value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
