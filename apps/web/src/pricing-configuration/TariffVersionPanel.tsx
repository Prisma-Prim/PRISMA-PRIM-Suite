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
import { clockChangeRefusal, localInstant } from './local-instant';
import { tariffVersionCopy as copy } from './tariff-version.copy';
import './tariff-versions.css';

// The closed illustrative currency set the API accepts.
const currencies = ['MDL', 'EUR', 'RON', 'USD'] as const;
type Currency = (typeof currencies)[number];

type TariffVersionState = keyof typeof copy.stateLabels;

type TariffVersion = {
  id: string;
  offeringId: string;
  versionNumber: number;
  unit: string;
  unitAmount: string;
  currency: Currency;
  taxRatePercent: string;
  taxLabel: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  provenance: keyof typeof copy.provenanceLabels;
  provisional: true;
  state: TariffVersionState;
  supersession: {
    supersededByVersionId: string;
    supersededAt: string;
    supersededFrom: string;
  } | null;
  createdByWorkspaceMembershipId: string;
  createdAt: string;
};

type TariffScope = {
  offeringId: string;
  current: TariffVersion | null;
  headVersionNumber: number | null;
};

type TariffVersionPage = { items: TariffVersion[]; nextCursor?: string };

type Offering = {
  id: string;
  serviceDefinition: { code: string; name: string };
  commercialLabel: string | null;
};

type OfferingPage = { items: Offering[]; nextCursor?: string };

type OfferingsState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | {
      kind: 'ready';
      items: Offering[];
      nextCursor?: string;
      morePage: 'idle' | 'loading' | 'error';
    };

// One pass over the offering's scope, the first page and the pages that
// complete its schedule. `listed` holds every version those pages returned.
type TariffsPass =
  | {
      kind: 'read';
      scope: TariffScope;
      firstPage: TariffVersionPage;
      listed: TariffVersion[];
    }
  | { kind: 'failed' }
  | { kind: 'refused' };

type ViewState =
  | { kind: 'loading' }
  | { kind: 'error' }
  // Every bounded pass met a publication, or a start or end passing, between
  // its reads.
  | { kind: 'changing' }
  | {
      kind: 'ready';
      scope: TariffScope;
      // Every scheduled successor, in takeover order, whatever the history
      // pages loaded so far.
      scheduled: TariffVersion[];
      versions: TariffVersion[];
      nextCursor?: string;
      olderPage: 'idle' | 'loading' | 'error';
    };

type Draft = {
  unit: string;
  unitAmount: string;
  currency: '' | Currency;
  taxRatePercent: string;
  taxLabel: string;
  effectiveFrom: string;
  effectiveTo: string;
};

// One submitted publication: its offering, the exact payload including the
// head number the caller displayed, and the idempotency key that makes it
// retryable.
type Publication = {
  offeringId: string;
  payload: string;
  idempotencyKey: string;
};

type PublicationCommand = {
  unit: string;
  unitAmount: string;
  currency: Currency;
  taxRatePercent: string;
  taxLabel: string;
  effectiveFrom: string;
  effectiveTo?: string;
  expectedActiveVersionNumber: number | null;
};

type DraftReading =
  | { kind: 'command'; command: PublicationCommand }
  | { kind: 'invalid'; message: string };

// A definite answer. An uncertain one is not feedback: it leaves its
// publication unresolved.
type Feedback =
  | { kind: 'published' | 'unchanged'; versionNumber: number }
  | { kind: 'invalid'; message: string }
  | { kind: 'stale'; headVersionNumber: number | null };

type PublicationOutcome = Feedback | { kind: 'uncertain' };

type HttpResult = { status: number; body: unknown } | { status: 'network' };

const offeringsPath = '/commercial-catalogue/offerings';
const listPageSize = 25;
// The most passes one load makes while its reads disagree.
const loadPasses = 3;
const unitMaximum = 24;
const taxLabelMaximum = 60;
// The API grammars (pricing PRD section 8.1), applied inline so an invalid
// value is refused before anything is sent. Values are never trimmed,
// padded or converted to numbers.
const unitAmountGrammar = /^(0|[1-9][0-9]{0,6})(\.[0-9]{1,4})?$/u;
const taxRatePercentGrammar =
  /^(100(\.0{1,2})?|(0|[1-9][0-9]?)(\.[0-9]{1,2})?)$/u;
const emptyDraft: Draft = {
  unit: '',
  unitAmount: '',
  currency: '',
  taxRatePercent: '',
  taxLabel: '',
  effectiveFrom: '',
  effectiveTo: '',
};

export function TariffVersionPanel({
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
  const [offerings, setOfferings] = useState<OfferingsState>({
    kind: 'loading',
  });
  const [offeringId, setOfferingId] = useState<string>();
  const [view, setView] = useState<ViewState>({ kind: 'loading' });
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [feedback, setFeedback] = useState<Feedback>();
  const [pending, setPending] = useState(false);
  // A publication whose commit is unknown. Until a definite answer, only its
  // explicit retry is sent, unchanged, and no other publication replaces it.
  const [unresolved, setUnresolved] = useState<Publication>();
  const fieldId = useId();
  const offeringsRequest = useRef<AbortController | undefined>(undefined);
  const loadRequest = useRef<AbortController | undefined>(undefined);
  const olderRequest = useRef<AbortController | undefined>(undefined);
  const commandRequest = useRef<AbortController | undefined>(undefined);
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

  const abortAll = useCallback(() => {
    offeringsRequest.current?.abort();
    loadRequest.current?.abort();
    olderRequest.current?.abort();
    commandRequest.current?.abort();
  }, []);

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
          // A refusal drops everything this screen held, including an
          // unresolved publication.
          setDenied(true);
          setOfferings({ kind: 'loading' });
          setOfferingId(undefined);
          setView({ kind: 'loading' });
          setDraft(emptyDraft);
          setFeedback(undefined);
          setUnresolved(undefined);
          abortAll();
        }
      }
      return true;
    },
    [abortAll, identity],
  );

  const loadOfferings = useCallback(
    async (companyContextId: string, cursor?: string): Promise<void> => {
      offeringsRequest.current?.abort();
      const controller = new AbortController();
      offeringsRequest.current = controller;
      if (cursor === undefined) setOfferings({ kind: 'loading' });
      else
        setOfferings((current) =>
          current.kind === 'ready'
            ? { ...current, morePage: 'loading' }
            : current,
        );
      try {
        const result = await request({
          path: offeringsPagePath(cursor),
          companyContextId,
          signal: controller.signal,
        });
        if (await handleAccess(result, companyContextId, controller.signal))
          return;
        const page =
          result.status === 200 && isOfferingPage(result.body)
            ? result.body
            : undefined;
        setOfferings((current) => {
          if (cursor === undefined)
            return page
              ? {
                  kind: 'ready',
                  items: page.items,
                  morePage: 'idle',
                  ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
                }
              : { kind: 'error' };
          if (current.kind !== 'ready') return current;
          if (!page) return { ...current, morePage: 'error' };
          return {
            kind: 'ready',
            items: [...current.items, ...page.items],
            morePage: 'idle',
            ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
          };
        });
      } catch {
        if (!controller.signal.aborted)
          setOfferings((current) =>
            cursor === undefined
              ? { kind: 'error' }
              : current.kind === 'ready'
                ? { ...current, morePage: 'error' }
                : current,
          );
      }
    },
    [handleAccess, request],
  );

  const readTariffs = useCallback(
    async (
      companyContextId: string,
      selectedOfferingId: string,
      signal: AbortSignal,
    ): Promise<TariffsPass> => {
      const belongs = (version: TariffVersion) =>
        version.offeringId === selectedOfferingId;
      const scopeResult = await request({
        path: scopePath(selectedOfferingId),
        companyContextId,
        signal,
      });
      if (await handleAccess(scopeResult, companyContextId, signal))
        return { kind: 'refused' };
      const pageResult = await request({
        path: versionsPagePath(selectedOfferingId),
        companyContextId,
        signal,
      });
      if (await handleAccess(pageResult, companyContextId, signal))
        return { kind: 'refused' };
      const scope =
        scopeResult.status === 200 &&
        isTariffScope(scopeResult.body) &&
        scopeResult.body.offeringId === selectedOfferingId &&
        (scopeResult.body.current === null || belongs(scopeResult.body.current))
          ? scopeResult.body
          : undefined;
      const page =
        pageResult.status === 200 &&
        isTariffVersionPage(pageResult.body) &&
        pageResult.body.items.every(belongs)
          ? pageResult.body
          : undefined;
      if (!scope || !page) return { kind: 'failed' };
      // Each successor starts strictly later than its predecessor, so the
      // scheduled versions are the newest ones: the schedule is complete
      // once a page reaches a version that is not scheduled, or the list
      // ends. These pages complete the schedule; the history keeps its own.
      const listed = [...page.items];
      let oldest = page.items.at(-1);
      let cursor = page.nextCursor;
      while (cursor && oldest?.state === 'SCHEDULED') {
        const olderThan = oldest.versionNumber;
        const nextResult = await request({
          path: versionsPagePath(selectedOfferingId, cursor),
          companyContextId,
          signal,
        });
        if (await handleAccess(nextResult, companyContextId, signal))
          return { kind: 'refused' };
        const next =
          nextResult.status === 200 &&
          isTariffVersionPage(nextResult.body) &&
          nextResult.body.items.every(belongs)
            ? nextResult.body
            : undefined;
        // A page that does not move strictly older could repeat versions,
        // loop or end the schedule early, so it fails the whole reload.
        if (
          !next ||
          next.items.length === 0 ||
          !next.items.every((version) => version.versionNumber < olderThan)
        )
          return { kind: 'failed' };
        listed.push(...next.items);
        oldest = next.items.at(-1);
        cursor = next.nextCursor;
      }
      return { kind: 'read', scope, firstPage: page, listed };
    },
    [handleAccess, request],
  );

  // The offering's scope, first page and every scheduled successor load
  // together, so the displayed head, schedule and list always come from one
  // reload and a partial schedule is never shown as complete. Each is a
  // separate read, so a publication, or a start or end passing, between two
  // of them can make them disagree: the panel is not a pricing authority. A
  // pass whose reads disagree is never shown; the load makes at most
  // `loadPasses` passes in all, then asks the owner to reload.
  const load = useCallback(
    async (
      companyContextId: string,
      selectedOfferingId: string,
    ): Promise<void> => {
      loadRequest.current?.abort();
      olderRequest.current?.abort();
      const controller = new AbortController();
      loadRequest.current = controller;
      setView({ kind: 'loading' });
      try {
        for (let pass = 1; pass <= loadPasses; pass += 1) {
          const tariffs = await readTariffs(
            companyContextId,
            selectedOfferingId,
            controller.signal,
          );
          if (tariffs.kind === 'refused') return;
          if (tariffs.kind === 'failed') {
            setView({ kind: 'error' });
            return;
          }
          if (readsAgree(tariffs)) {
            const { scope, firstPage, listed } = tariffs;
            setView({
              kind: 'ready',
              scope,
              scheduled: listed
                .filter(isScheduled)
                .sort(
                  (left, right) => left.versionNumber - right.versionNumber,
                ),
              versions: firstPage.items,
              olderPage: 'idle',
              ...(firstPage.nextCursor
                ? { nextCursor: firstPage.nextCursor }
                : {}),
            });
            return;
          }
        }
        setView({ kind: 'changing' });
      } catch {
        if (!controller.signal.aborted) setView({ kind: 'error' });
      }
    },
    [readTariffs],
  );

  useEffect(() => {
    // A new Company, membership or Workspace starts from nothing: the chosen
    // offering, drafts, retries and every in-flight reply of the previous
    // context are dropped.
    abortAll();
    setUnresolved(undefined);
    setDenied(false);
    setOfferingId(undefined);
    setView({ kind: 'loading' });
    setDraft(emptyDraft);
    setFeedback(undefined);
    setPending(false);
    if (!companyId) {
      setDenied(true);
      return;
    }
    void loadOfferings(companyId);
    return abortAll;
  }, [
    abortAll,
    actor.workspaceId,
    actor.workspaceMembershipId,
    companyId,
    loadOfferings,
  ]);

  // Choosing another offering starts its own screen: the draft, its key and
  // any unresolved publication of the previous offering are dropped, and its
  // late replies are ignored.
  function chooseOffering(nextOfferingId: string): void {
    if (!companyId || nextOfferingId === (offeringId ?? '')) return;
    loadRequest.current?.abort();
    olderRequest.current?.abort();
    commandRequest.current?.abort();
    setUnresolved(undefined);
    setDraft(emptyDraft);
    setFeedback(undefined);
    setPending(false);
    setView({ kind: 'loading' });
    if (nextOfferingId === '') {
      setOfferingId(undefined);
      return;
    }
    setOfferingId(nextOfferingId);
    void load(companyId, nextOfferingId);
  }

  async function loadOlder(cursor: string): Promise<void> {
    if (!companyId || !offeringId) return;
    olderRequest.current?.abort();
    const controller = new AbortController();
    olderRequest.current = controller;
    const selectedOfferingId = offeringId;
    setView((current) =>
      current.kind === 'ready' ? { ...current, olderPage: 'loading' } : current,
    );
    try {
      const result = await request({
        path: versionsPagePath(selectedOfferingId, cursor),
        companyContextId: companyId,
        signal: controller.signal,
      });
      if (await handleAccess(result, companyId, controller.signal)) return;
      const page =
        result.status === 200 &&
        isTariffVersionPage(result.body) &&
        result.body.items.every(
          (version) => version.offeringId === selectedOfferingId,
        )
          ? result.body
          : undefined;
      setView((current) => {
        if (current.kind !== 'ready') return current;
        if (!page) return { ...current, olderPage: 'error' };
        return {
          kind: 'ready',
          scope: current.scope,
          scheduled: current.scheduled,
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
    if (!companyId || !offeringId) return;
    if (feedback?.kind === 'stale') setFeedback(undefined);
    void load(companyId, offeringId);
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (
      !companyId ||
      !offeringId ||
      pending ||
      unresolved !== undefined ||
      view.kind !== 'ready'
    )
      return;
    const reading = readDraft({
      draft,
      expectedActiveVersionNumber: view.scope.headVersionNumber,
      zone,
    });
    if (reading.kind === 'invalid') {
      setFeedback(reading);
      return;
    }
    await send({
      offeringId,
      payload: JSON.stringify(reading.command),
      idempotencyKey: crypto.randomUUID(),
    });
  }

  async function send(publication: Publication): Promise<void> {
    if (!companyId) return;
    commandRequest.current?.abort();
    const controller = new AbortController();
    commandRequest.current = controller;
    setPending(true);
    setFeedback(undefined);
    try {
      const result = await request({
        path: versionsPath(publication.offeringId),
        companyContextId: companyId,
        signal: controller.signal,
        method: 'POST',
        body: publication.payload,
        idempotencyKey: publication.idempotencyKey,
      });
      if (await handleAccess(result, companyId, controller.signal)) return;
      const outcome = publicationOutcome(result, publication.offeringId);
      // An uncertain outcome keeps the exact payload and key for an explicit
      // retry; every definite outcome is final for this publication.
      if (outcome.kind === 'uncertain') {
        setUnresolved(publication);
        return;
      }
      setUnresolved(undefined);
      setFeedback(outcome);
      if (outcome.kind === 'published' || outcome.kind === 'unchanged') {
        setDraft(emptyDraft);
        void load(companyId, publication.offeringId);
      }
    } catch {
      if (!controller.signal.aborted) setUnresolved(publication);
    } finally {
      if (!controller.signal.aborted) setPending(false);
    }
  }

  if (denied)
    return (
      <section className="tariff-versions">
        <p role="alert">{copy.denied}</p>
      </section>
    );

  const selected =
    offerings.kind === 'ready'
      ? offerings.items.find((item) => item.id === offeringId)
      : undefined;
  const head = view.kind === 'ready' ? view.scope.headVersionNumber : null;
  const scheduled = view.kind === 'ready' ? view.scheduled : [];
  const pendingRetry = pending ? undefined : unresolved;

  return (
    <section className="tariff-versions" aria-labelledby={`${fieldId}-title`}>
      <header className="tariff-versions-heading">
        <p>{copy.eyebrow}</p>
        <h2 id={`${fieldId}-title`}>{copy.title}</h2>
        <p>
          {copy.companyPrefix} {companyName}
        </p>
      </header>
      <aside className="tariff-versions-notice" aria-label={copy.noticeLabel}>
        <strong>{copy.illustrativeMarker}</strong>
        <p>{copy.illustrativeDetail}</p>
        <p>{copy.timeZone(zone)}</p>
      </aside>
      <div className="tariff-versions-panel">
        {offerings.kind === 'loading' ? <p>{copy.offeringsLoading}</p> : null}
        {offerings.kind === 'error' ? (
          <>
            <p role="alert">{copy.offeringsError}</p>
            <button
              type="button"
              onClick={() => {
                if (companyId) void loadOfferings(companyId);
              }}
            >
              {copy.reloadOfferings}
            </button>
          </>
        ) : null}
        {offerings.kind === 'ready' && offerings.items.length === 0 ? (
          <p>{copy.offeringsEmpty}</p>
        ) : null}
        {offerings.kind === 'ready' && offerings.items.length > 0 ? (
          <div className="tariff-versions-field">
            <label htmlFor={`${fieldId}-offering`}>{copy.offering}</label>
            <select
              id={`${fieldId}-offering`}
              value={offeringId ?? ''}
              onChange={(event) => chooseOffering(event.target.value)}
            >
              <option value="">{copy.chooseOffering}</option>
              {offerings.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {copy.offeringOption({
                    name: item.serviceDefinition.name,
                    code: item.serviceDefinition.code,
                    commercialLabel: item.commercialLabel,
                  })}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {offerings.kind === 'ready' && offerings.morePage === 'loading' ? (
          <p role="status">{copy.moreOfferingsLoading}</p>
        ) : null}
        {offerings.kind === 'ready' && offerings.morePage === 'error' ? (
          <p role="alert">{copy.moreOfferingsError}</p>
        ) : null}
        {offerings.kind === 'ready' && offerings.nextCursor ? (
          <button
            type="button"
            disabled={offerings.morePage === 'loading'}
            onClick={() => {
              if (companyId && offerings.nextCursor)
                void loadOfferings(companyId, offerings.nextCursor);
            }}
          >
            {copy.showMoreOfferings}
          </button>
        ) : null}
        {offerings.kind === 'ready' &&
        offerings.items.length > 0 &&
        !selected ? (
          <p>{copy.chooseOfferingPrompt}</p>
        ) : null}
      </div>
      {selected ? (
        <>
          <div className="tariff-versions-toolbar">
            <button
              type="button"
              onClick={reload}
              disabled={view.kind === 'loading'}
            >
              {copy.reload}
            </button>
          </div>
          <div className="tariff-versions-columns">
            <div className="tariff-versions-panel">
              <section aria-labelledby={`${fieldId}-current`}>
                <h3 id={`${fieldId}-current`}>{copy.currentTitle}</h3>
                {view.kind === 'loading' ? <p>{copy.currentLoading}</p> : null}
                {view.kind === 'error' ? (
                  <p role="alert">{copy.versionsError}</p>
                ) : null}
                {view.kind === 'changing' ? (
                  <p role="alert">{copy.versionsChanging}</p>
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
              <section aria-labelledby={`${fieldId}-scheduled`}>
                <h3 id={`${fieldId}-scheduled`}>{copy.scheduledTitle}</h3>
                {view.kind === 'ready' && scheduled.length === 0 ? (
                  <p>{copy.noScheduled}</p>
                ) : null}
                {scheduled.length > 0 ? (
                  <ol
                    className="tariff-versions-list"
                    aria-label={copy.scheduledTitle}
                  >
                    {scheduled.map((version) => (
                      <li key={version.id}>
                        <strong>
                          {copy.versionName(version.versionNumber)}
                        </strong>
                        <Amounts version={version} />
                        <span>
                          {copy.takesOver}{' '}
                          <Instant value={version.effectiveFrom} />
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : null}
              </section>
            </div>
            {canPublish ? (
              <section
                className="tariff-versions-panel"
                aria-labelledby={`${fieldId}-publish`}
              >
                <h3 id={`${fieldId}-publish`}>{copy.publishTitle}</h3>
                <p>
                  {head === null
                    ? copy.publishFirst
                    : copy.publishAfterHead(head)}
                </p>
                <form noValidate onSubmit={(event) => void submit(event)}>
                  <TextField
                    id={`${fieldId}-unit`}
                    label={copy.unit}
                    help={copy.unitHelp}
                    value={draft.unit}
                    onChange={(unit) =>
                      setDraft((current) => ({ ...current, unit }))
                    }
                  />
                  <TextField
                    id={`${fieldId}-amount`}
                    label={copy.unitAmount}
                    help={copy.unitAmountHelp}
                    value={draft.unitAmount}
                    decimal
                    onChange={(unitAmount) =>
                      setDraft((current) => ({ ...current, unitAmount }))
                    }
                  />
                  <div className="tariff-versions-field">
                    <label htmlFor={`${fieldId}-currency`}>
                      {copy.currency}
                    </label>
                    <select
                      id={`${fieldId}-currency`}
                      value={draft.currency}
                      onChange={(event) => {
                        const currency = readCurrency(event.target.value);
                        setDraft((current) => ({ ...current, currency }));
                      }}
                      required
                    >
                      <option value="">{copy.chooseCurrency}</option>
                      {currencies.map((currency) => (
                        <option key={currency} value={currency}>
                          {currency}
                        </option>
                      ))}
                    </select>
                  </div>
                  <TextField
                    id={`${fieldId}-rate`}
                    label={copy.taxRatePercent}
                    help={copy.taxRatePercentHelp}
                    value={draft.taxRatePercent}
                    decimal
                    onChange={(taxRatePercent) =>
                      setDraft((current) => ({ ...current, taxRatePercent }))
                    }
                  />
                  <TextField
                    id={`${fieldId}-tax-label`}
                    label={copy.taxLabel}
                    help={copy.taxLabelHelp}
                    value={draft.taxLabel}
                    onChange={(taxLabel) =>
                      setDraft((current) => ({ ...current, taxLabel }))
                    }
                  />
                  <div className="tariff-versions-field">
                    <label htmlFor={`${fieldId}-from`}>
                      {copy.effectiveFrom(zone)}
                    </label>
                    <input
                      id={`${fieldId}-from`}
                      type="datetime-local"
                      step={1}
                      value={draft.effectiveFrom}
                      onChange={(event) => {
                        const effectiveFrom = event.target.value;
                        setDraft((current) => ({ ...current, effectiveFrom }));
                      }}
                      required
                    />
                  </div>
                  <div className="tariff-versions-field">
                    <label htmlFor={`${fieldId}-to`}>
                      {copy.effectiveTo(zone)}
                    </label>
                    <input
                      id={`${fieldId}-to`}
                      type="datetime-local"
                      step={1}
                      value={draft.effectiveTo}
                      onChange={(event) => {
                        const effectiveTo = event.target.value;
                        setDraft((current) => ({ ...current, effectiveTo }));
                      }}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={
                      pending ||
                      unresolved !== undefined ||
                      view.kind !== 'ready'
                    }
                  >
                    {copy.publish}
                  </button>
                </form>
                {feedback ? <FeedbackMessage feedback={feedback} /> : null}
                {pendingRetry ? (
                  <>
                    <p role="alert">{copy.uncertain}</p>
                    <button
                      type="button"
                      onClick={() => void send(pendingRetry)}
                    >
                      {copy.retryPublication}
                    </button>
                  </>
                ) : null}
              </section>
            ) : null}
          </div>
          <section
            className="tariff-versions-panel"
            aria-labelledby={`${fieldId}-versions`}
          >
            <h3 id={`${fieldId}-versions`}>{copy.versionsTitle}</h3>
            {view.kind === 'loading' ? <p>{copy.versionsLoading}</p> : null}
            {view.kind === 'ready' && view.versions.length === 0 ? (
              <p>{copy.versionsEmpty}</p>
            ) : null}
            {view.kind === 'ready' && view.versions.length > 0 ? (
              <ul
                className="tariff-versions-list"
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
        </>
      ) : null}
    </section>
  );
}

function TextField({
  id,
  label,
  help,
  value,
  decimal = false,
  onChange,
}: {
  id: string;
  label: string;
  help: string;
  value: string;
  decimal?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="tariff-versions-field">
      <label htmlFor={id}>{label}</label>
      {/* A decimal is entered as text, never type=number, so the exact
          string the owner typed is what the grammar checks and sends. */}
      <input
        id={id}
        type="text"
        inputMode={decimal ? 'decimal' : undefined}
        autoComplete="off"
        spellCheck={decimal ? false : undefined}
        aria-describedby={`${id}-help`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
      />
      <small id={`${id}-help`}>{help}</small>
    </div>
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

// Every amount and rate carries its currency or percent sign and the
// provisional and illustrative markers in the same view.
function Amounts({ version }: { version: TariffVersion }) {
  return (
    <>
      <span className="tariff-versions-amount">
        {copy.amount({
          unitAmount: version.unitAmount,
          currency: version.currency,
          unit: version.unit,
        })}
      </span>
      <span>
        {copy.taxRate({
          taxRatePercent: version.taxRatePercent,
          taxLabel: version.taxLabel,
        })}
        , <em>{copy.noFiscalValidity}</em>
      </span>
      <span className="tariff-versions-markers">
        <em className="tariff-versions-badge">
          {copy.provenanceLabels[version.provenance]}
        </em>
        <em className="tariff-versions-badge">{copy.provisionalMarker}</em>
      </span>
    </>
  );
}

function VersionSummary({
  version,
  isHead = false,
}: {
  version: TariffVersion;
  isHead?: boolean;
}) {
  return (
    <div className="tariff-versions-version">
      <strong>{copy.versionName(version.versionNumber)}</strong>
      <span className="tariff-versions-state">
        {copy.stateLabels[version.state]}
      </span>
      {isHead ? (
        <em className="tariff-versions-badge">{copy.headMarker}</em>
      ) : null}
      <Amounts version={version} />
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
    default: {
      const exhaustive: never = feedback;
      return exhaustive;
    }
  }
}

function scopePath(offeringId: string): string {
  return `/pricing-configuration/offerings/${encodeURIComponent(offeringId)}/tariff-scope`;
}

function versionsPath(offeringId: string): string {
  return `/pricing-configuration/offerings/${encodeURIComponent(offeringId)}/tariff-versions`;
}

function versionsPagePath(offeringId: string, cursor?: string): string {
  return cursor === undefined
    ? `${versionsPath(offeringId)}?limit=${listPageSize}`
    : `${versionsPath(offeringId)}?limit=${listPageSize}&cursor=${encodeURIComponent(cursor)}`;
}

function offeringsPagePath(cursor?: string): string {
  return cursor === undefined
    ? `${offeringsPath}?limit=${listPageSize}`
    : `${offeringsPath}?limit=${listPageSize}&cursor=${encodeURIComponent(cursor)}`;
}

function isScheduled(version: TariffVersion): boolean {
  return version.state === 'SCHEDULED';
}

// Reads made at one instant agree: the newest version listed is the head the
// scope names, and a listed version is CURRENT exactly when the scope names
// it current. A publication between the reads lists a newer head, and a
// start or end passing between them moves the CURRENT version.
function readsAgree({
  scope,
  firstPage,
  listed,
}: Extract<TariffsPass, { kind: 'read' }>): boolean {
  return (
    (firstPage.items[0]?.versionNumber ?? null) === scope.headVersionNumber &&
    listed.every(
      (version) =>
        (version.state === 'CURRENT') === (version.id === scope.current?.id),
    )
  );
}

function readCurrency(value: string): Draft['currency'] {
  return currencies.find((currency) => currency === value) ?? '';
}

// Datetime-local values name wall-clock times in the browser time zone; each
// is converted once to the explicit instant the server receives. Every other
// value is sent exactly as entered.
function readDraft({
  draft,
  expectedActiveVersionNumber,
  zone,
}: {
  draft: Draft;
  expectedActiveVersionNumber: number | null;
  zone: string;
}): DraftReading {
  if (!isText(draft.unit, unitMaximum))
    return { kind: 'invalid', message: copy.invalid.unit };
  if (
    !unitAmountGrammar.test(draft.unitAmount) ||
    // Without leading zeros, a value is above zero once any digit is.
    !/[1-9]/u.test(draft.unitAmount)
  )
    return { kind: 'invalid', message: copy.invalid.unitAmount };
  const currency = draft.currency;
  if (currency === '')
    return { kind: 'invalid', message: copy.invalid.currency };
  if (!taxRatePercentGrammar.test(draft.taxRatePercent))
    return { kind: 'invalid', message: copy.invalid.taxRatePercent };
  if (!isText(draft.taxLabel, taxLabelMaximum))
    return { kind: 'invalid', message: copy.invalid.taxLabel };
  const content = {
    unit: draft.unit,
    unitAmount: draft.unitAmount,
    currency,
    taxRatePercent: draft.taxRatePercent,
    taxLabel: draft.taxLabel,
  };
  const effectiveFrom = localInstant(draft.effectiveFrom);
  if (effectiveFrom.kind === 'malformed')
    return { kind: 'invalid', message: copy.invalid.window };
  if (effectiveFrom.kind !== 'instant')
    return {
      kind: 'invalid',
      message: clockChangeRefusal('effectiveFrom', effectiveFrom.kind, zone),
    };
  if (draft.effectiveTo === '')
    return {
      kind: 'command',
      command: {
        ...content,
        effectiveFrom: effectiveFrom.instant,
        expectedActiveVersionNumber,
      },
    };
  const effectiveTo = localInstant(draft.effectiveTo);
  if (effectiveTo.kind === 'malformed')
    return { kind: 'invalid', message: copy.invalid.window };
  if (effectiveTo.kind !== 'instant')
    return {
      kind: 'invalid',
      message: clockChangeRefusal('effectiveTo', effectiveTo.kind, zone),
    };
  if (Date.parse(effectiveTo.instant) <= Date.parse(effectiveFrom.instant))
    return { kind: 'invalid', message: copy.invalid.window };
  return {
    kind: 'command',
    command: {
      ...content,
      effectiveFrom: effectiveFrom.instant,
      effectiveTo: effectiveTo.instant,
      expectedActiveVersionNumber,
    },
  };
}

// At least one non-whitespace character, at most the limit in code points,
// and no U+0000, which the server refuses.
function isText(value: string, maximum: number): boolean {
  return (
    value.trim().length > 0 &&
    Array.from(value).length <= maximum &&
    !value.includes('\u0000')
  );
}

// The publication endpoint's named refusals besides the stale head, by status
// and code. Each commits nothing, so it is a definite answer: it resolves an
// unresolved publication, and the kept draft is published again under a new
// key. An idempotency conflict is one of them, since repeating its key could
// only repeat it. Any answer not named here stays uncertain.
const publicationRejections: ReadonlyMap<string, string> = new Map([
  ['400:VALIDATION_ERROR', copy.validation],
  ['400:EFFECTIVE_FROM_PAST', copy.effectiveFromPast],
  ['400:EFFECTIVE_FROM_NOT_ADVANCING', copy.effectiveFromNotAdvancing],
  ['409:EFFECTIVE_WINDOW_GAP', copy.windowGap],
  ['409:VERSION_EXHAUSTED', copy.versionExhausted],
  ['409:IDEMPOTENCY_CONFLICT', copy.idempotencyConflict],
]);

// A field-specific validation refusal names the field the owner must change.
const validationFields: ReadonlyMap<string, string> = new Map([
  ['unit', copy.invalid.unit],
  ['unitAmount', copy.invalid.unitAmount],
  ['currency', copy.invalid.currency],
  ['taxRatePercent', copy.invalid.taxRatePercent],
  ['taxLabel', copy.invalid.taxLabel],
  ['effectiveFrom', copy.invalid.window],
  ['effectiveTo', copy.invalid.window],
]);

function publicationOutcome(
  result: HttpResult,
  offeringId: string,
): PublicationOutcome {
  if (result.status === 'network') return { kind: 'uncertain' };
  if (
    (result.status === 200 || result.status === 201) &&
    isRecord(result.body) &&
    (result.body.outcome === 'PUBLISHED' ||
      result.body.outcome === 'UNCHANGED') &&
    isTariffVersion(result.body.version) &&
    result.body.version.offeringId === offeringId
  )
    return {
      kind: result.body.outcome === 'PUBLISHED' ? 'published' : 'unchanged',
      versionNumber: result.body.version.versionNumber,
    };
  const body = isRecord(result.body) ? result.body : {};
  if (result.status === 409 && body.code === 'STALE_ACTIVE_VERSION') {
    const headVersionNumber = body.headVersionNumber;
    if (headVersionNumber === null || isVersionNumber(headVersionNumber))
      return { kind: 'stale', headVersionNumber };
  }
  const message = refusalMessage(result.status, body);
  return message ? { kind: 'invalid', message } : { kind: 'uncertain' };
}

function refusalMessage(
  status: number,
  body: Record<string, unknown>,
): string | undefined {
  if (typeof body.code !== 'string') return undefined;
  const fieldMessage =
    status === 400 &&
    body.code === 'VALIDATION_ERROR' &&
    typeof body.field === 'string'
      ? validationFields.get(body.field)
      : undefined;
  return fieldMessage ?? publicationRejections.get(`${status}:${body.code}`);
}

function isOfferingPage(value: unknown): value is OfferingPage {
  return (
    isRecord(value) &&
    Array.isArray(value.items) &&
    value.items.every(isOffering) &&
    (value.nextCursor === undefined || typeof value.nextCursor === 'string')
  );
}

function isOffering(value: unknown): value is Offering {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    isRecord(value.serviceDefinition) &&
    typeof value.serviceDefinition.code === 'string' &&
    typeof value.serviceDefinition.name === 'string' &&
    (value.commercialLabel === null ||
      typeof value.commercialLabel === 'string')
  );
}

function isTariffScope(value: unknown): value is TariffScope {
  return (
    isRecord(value) &&
    value.provisional === true &&
    typeof value.offeringId === 'string' &&
    (value.current === null || isTariffVersion(value.current)) &&
    (value.headVersionNumber === null ||
      isVersionNumber(value.headVersionNumber))
  );
}

function isTariffVersionPage(value: unknown): value is TariffVersionPage {
  return (
    isRecord(value) &&
    value.provisional === true &&
    Array.isArray(value.items) &&
    value.items.every(isTariffVersion) &&
    (value.nextCursor === undefined || typeof value.nextCursor === 'string')
  );
}

function isTariffVersion(value: unknown): value is TariffVersion {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.offeringId === 'string' &&
    isVersionNumber(value.versionNumber) &&
    typeof value.unit === 'string' &&
    typeof value.unitAmount === 'string' &&
    unitAmountGrammar.test(value.unitAmount) &&
    currencies.some((currency) => currency === value.currency) &&
    typeof value.taxRatePercent === 'string' &&
    taxRatePercentGrammar.test(value.taxRatePercent) &&
    typeof value.taxLabel === 'string' &&
    isDisplayableInstant(value.effectiveFrom) &&
    (value.effectiveTo === null || isDisplayableInstant(value.effectiveTo)) &&
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
): value is NonNullable<TariffVersion['supersession']> {
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
