import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { handleAuthenticatedAccessRejection } from '../api/latest-authenticated-request';
import { selectedWorkspaceId } from '../access/workspace-selection';
import { formatApplicationDateTime } from '../presentation/date-time';
import { pricingSnapshotCopy as copy } from './pricing-snapshot.copy';
import './pricing-snapshots.css';

const quantityGrammar = /^(0|[1-9][0-9]{0,8})(\.[0-9]{1,3})?$/u;
const netReductionGrammar = /^(0|[1-9][0-9]{0,21})\.[0-9]{2}$/u;
const pageSize = 25;
const maximumCalculationLines = 20;
const calculationTimeoutMs = 15_000;

type Currency = 'MDL' | 'EUR' | 'RON' | 'USD';
type HttpResult = { status: number; body: unknown } | { status: 'network' };

type Offering = {
  id: string;
  serviceDefinition: { code: string; name: string };
  commercialLabel: string | null;
};
type OfferingPage = { items: Offering[]; nextCursor?: string };
type TariffVersion = {
  id: string;
  versionNumber: number;
  unit: string;
  unitAmount: string;
  currency: Currency;
  taxRatePercent: string;
  taxLabel: string;
};
type TariffScope = { offeringId: string; current: TariffVersion | null };
type RuleScope = {
  current: { id: string; versionNumber: number } | null;
};
type PriceableOffering = Offering & { tariff: TariffVersion };

type SnapshotLine = {
  position: number;
  serviceCode: string;
  serviceName: string;
  offeringId: string;
  commercialLabel: string | null;
  tariffVersionNumber: number;
  unit: string;
  unitAmount: string;
  currency: Currency;
  taxRatePercent: string;
  taxLabel: string;
  quantity: string;
  rawLineAmount: string;
  lineNet: string;
  rawLineTax: string;
  lineTax: string;
  adjustment: {
    type: 'FIXED_NET_DISCOUNT';
    netReduction: string;
    taxReduction: string;
    reason: string;
    appliedByWorkspaceMembershipId: string;
    appliedAt: string;
  } | null;
  netReduction: string;
  taxReduction: string;
  adjustedLineNet: string;
  adjustedRawLineTax: string;
  adjustedLineTax: string;
};
type PricingSnapshot = {
  id: string;
  opportunityId: string;
  clientRequestId: string;
  clientReference?: { displayName: string };
  calculatedByWorkspaceMembershipId: string;
  pricingRuleVersion: { id: string; versionNumber: number };
  currency: Currency;
  lines: SnapshotLine[];
  subtotal: string;
  taxTotal: string;
  total: string;
  calculatedAt: string;
  committedAt: string;
  provenance: 'ILLUSTRATIVE';
  provisional: true;
};
type SnapshotPage = { items: PricingSnapshot[]; nextCursor?: string };

type ReadyState = {
  rule: RuleScope['current'];
  offerings: PriceableOffering[];
  snapshots: PricingSnapshot[];
  nextCursor?: string;
};
type ViewState =
  | { kind: 'loading' }
  | { kind: 'denied' }
  | { kind: 'error' }
  | ({ kind: 'ready' } & ReadyState);
type DraftLine = {
  selected: boolean;
  quantity: string;
  adjustmentEnabled: boolean;
  netReduction: string;
  adjustmentReason: string;
};
type CalculationAttempt = {
  payload: string;
  idempotencyKey: string;
  offeringIds: readonly string[];
};
type FieldFeedback = {
  kind: 'net-reduction';
  offeringId: string;
  message: string;
};
type Feedback =
  | 'invalid'
  | 'too-many-lines'
  | 'stale'
  | 'not-effective'
  | 'mixed-currency'
  | 'conflict';
type DetailState =
  | { kind: 'closed' }
  | { kind: 'loading'; snapshotId: string }
  | { kind: 'unavailable'; snapshotId: string }
  | { kind: 'open'; snapshot: PricingSnapshot };

export function PricingSnapshotPanel({
  actor,
  identity,
  opportunityId,
  onCompanyContextRejected,
  onActorRevalidated = () => undefined,
  onWorkspaceAccessRejected = () => undefined,
}: {
  actor: ActorContext;
  identity: BrowserIdentity;
  opportunityId: string;
  onCompanyContextRejected: (companyContextId: string) => void;
  onActorRevalidated?: (actor: ActorContext) => Promise<void> | void;
  onWorkspaceAccessRejected?: () => Promise<void> | void;
}) {
  const [view, setView] = useState<ViewState>({ kind: 'loading' });
  const [drafts, setDrafts] = useState<Record<string, DraftLine>>({});
  const [detail, setDetail] = useState<DetailState>({ kind: 'closed' });
  const [feedback, setFeedback] = useState<Feedback>();
  const [fieldFeedback, setFieldFeedback] = useState<FieldFeedback>();
  const [pending, setPending] = useState(false);
  const [unresolved, setUnresolved] = useState<CalculationAttempt>();
  const [olderPending, setOlderPending] = useState(false);
  const [olderError, setOlderError] = useState(false);
  const loadRequest = useRef<AbortController | undefined>(undefined);
  const commandRequest = useRef<AbortController | undefined>(undefined);
  const olderRequest = useRef<AbortController | undefined>(undefined);
  const detailRequest = useRef<AbortController | undefined>(undefined);
  const fieldId = useId();
  const companyId = actor.activeCompany?.id;
  const permissions = actor.activeCompany?.pricingUserPermissions ?? [];
  const mayRead = permissions.includes('commercial.pricing.snapshot.read');
  const mayCalculate = permissions.includes('commercial.pricing.calculate');
  const mayAdjust =
    actor.activeCompany?.pricingAdjustmentPermissions?.includes(
      'commercial.pricing.adjustment.apply',
    ) ?? false;
  const rejectCompany = useRef(onCompanyContextRejected);
  const acceptActor = useRef(onActorRevalidated);
  const rejectWorkspace = useRef(onWorkspaceAccessRejected);
  rejectCompany.current = onCompanyContextRejected;
  acceptActor.current = onActorRevalidated;
  rejectWorkspace.current = onWorkspaceAccessRejected;

  const request = useCallback(
    async ({
      path,
      signal,
      method = 'GET',
      body,
      idempotencyKey,
    }: {
      path: string;
      signal: AbortSignal;
      method?: 'GET' | 'POST';
      body?: string;
      idempotencyKey?: string;
    }): Promise<HttpResult> => {
      if (!companyId) return { status: 403, body: undefined };
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
              'x-company-context-id': companyId,
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
    [companyId, identity],
  );

  const handleAccess = useCallback(
    async (result: HttpResult, signal: AbortSignal): Promise<boolean> => {
      if (result.status === 401) {
        await identity.rejectSession();
        return true;
      }
      if (result.status !== 403) return false;
      await handleAuthenticatedAccessRejection({
        result: { status: 'forbidden' },
        identity,
        companyContextId: companyId,
        onCompanyContextRejected: (id) => rejectCompany.current(id),
        onActorRevalidated: (value) => acceptActor.current(value),
        onWorkspaceAccessRejected: () => rejectWorkspace.current(),
        signal,
      });
      return true;
    },
    [companyId, identity],
  );

  const load = useCallback(
    async (preserveDrafts = false) => {
      commandRequest.current?.abort();
      commandRequest.current = undefined;
      setPending(false);
      olderRequest.current?.abort();
      olderRequest.current = undefined;
      setOlderPending(false);
      setOlderError(false);
      detailRequest.current?.abort();
      detailRequest.current = undefined;
      loadRequest.current?.abort();
      const controller = new AbortController();
      loadRequest.current = controller;
      setView({ kind: 'loading' });
      setDetail({ kind: 'closed' });
      setFeedback(undefined);
      setFieldFeedback(undefined);
      setUnresolved(undefined);
      try {
        if (!companyId || !mayRead || !mayCalculate) {
          setView({ kind: 'denied' });
          return;
        }
        const [ruleResult, offeringsResult, snapshotsResult] =
          await Promise.all([
            request({
              path: '/pricing-configuration/rule-scope',
              signal: controller.signal,
            }),
            request({
              path: '/commercial-catalogue/offerings?limit=50',
              signal: controller.signal,
            }),
            request({
              path: snapshotListPath(opportunityId),
              signal: controller.signal,
            }),
          ]);
        if (controller.signal.aborted) return;
        for (const result of [ruleResult, offeringsResult, snapshotsResult])
          if (await handleAccess(result, controller.signal)) {
            setView({ kind: 'denied' });
            return;
          }
        if (
          ruleResult.status !== 200 ||
          offeringsResult.status !== 200 ||
          snapshotsResult.status !== 200 ||
          !isRuleScope(ruleResult.body) ||
          !isOfferingPage(offeringsResult.body) ||
          !isSnapshotPage(snapshotsResult.body)
        ) {
          setView({ kind: 'error' });
          return;
        }
        const offerings = await loadAllOfferings(
          offeringsResult.body,
          request,
          handleAccess,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (!offerings) {
          setView({ kind: 'denied' });
          return;
        }
        const scopes = await Promise.all(
          offerings.map((offering) =>
            request({
              path: `/pricing-configuration/offerings/${encodeURIComponent(offering.id)}/tariff-scope`,
              signal: controller.signal,
            }),
          ),
        );
        if (controller.signal.aborted) return;
        const priceable: PriceableOffering[] = [];
        for (const [index, result] of scopes.entries()) {
          if (await handleAccess(result, controller.signal)) {
            setView({ kind: 'denied' });
            return;
          }
          const offering = offerings[index];
          if (
            result.status !== 200 ||
            !isTariffScope(result.body) ||
            !offering
          ) {
            setView({ kind: 'error' });
            return;
          }
          if (result.body.current)
            priceable.push({ ...offering, tariff: result.body.current });
        }
        setDrafts((current) =>
          Object.fromEntries(
            priceable.map((offering) => [
              offering.id,
              preserveDrafts
                ? (current[offering.id] ?? emptyDraftLine())
                : emptyDraftLine(),
            ]),
          ),
        );
        setView({
          kind: 'ready',
          rule: ruleResult.body.current,
          offerings: priceable,
          snapshots: snapshotsResult.body.items,
          ...(snapshotsResult.body.nextCursor
            ? { nextCursor: snapshotsResult.body.nextCursor }
            : {}),
        });
      } catch (error: unknown) {
        if (!(error instanceof DOMException && error.name === 'AbortError'))
          setView({ kind: 'error' });
      } finally {
        if (loadRequest.current === controller) loadRequest.current = undefined;
      }
    },
    [companyId, handleAccess, mayCalculate, mayRead, opportunityId, request],
  );

  useEffect(() => {
    void load();
    return () => {
      loadRequest.current?.abort();
      commandRequest.current?.abort();
      olderRequest.current?.abort();
      detailRequest.current?.abort();
    };
  }, [load]);

  async function submit(attempt?: CalculationAttempt): Promise<void> {
    if (view.kind !== 'ready' || !view.rule || !companyId || pending) return;
    if (
      !attempt &&
      countSelectedOfferings(view, drafts) > maximumCalculationLines
    ) {
      setFeedback('too-many-lines');
      return;
    }
    const nextAttempt = attempt ?? calculationAttempt(view, drafts);
    if (!nextAttempt) {
      setFeedback('invalid');
      return;
    }
    commandRequest.current?.abort();
    const controller = new AbortController();
    commandRequest.current = controller;
    setPending(true);
    setFeedback(undefined);
    setFieldFeedback(undefined);
    let timeoutId: number | undefined;
    try {
      const response = request({
        path: snapshotBasePath(opportunityId),
        signal: controller.signal,
        method: 'POST',
        body: nextAttempt.payload,
        idempotencyKey: nextAttempt.idempotencyKey,
      })
        .then((result) => ({ kind: 'response' as const, result }))
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError')
            return { kind: 'aborted' as const };
          throw error;
        });
      const timeout = new Promise<{ kind: 'timeout' }>((resolve) => {
        timeoutId = window.setTimeout(
          () => resolve({ kind: 'timeout' }),
          calculationTimeoutMs,
        );
      });
      const outcome = await Promise.race([response, timeout]);
      if (outcome.kind === 'timeout') {
        if (controller.signal.aborted || commandRequest.current !== controller)
          return;
        controller.abort();
        setUnresolved(nextAttempt);
        return;
      }
      if (
        outcome.kind === 'aborted' ||
        controller.signal.aborted ||
        commandRequest.current !== controller
      )
        return;
      const { result } = outcome;
      if (result.status === 'network' || result.status >= 500) {
        setUnresolved(nextAttempt);
        return;
      }
      if (result.status !== 200 && result.status !== 201)
        setUnresolved(undefined);
      if (await handleAccess(result, controller.signal)) {
        setView({ kind: 'denied' });
        return;
      }
      if (result.status === 200 || result.status === 201) {
        if (!isSnapshot(result.body)) {
          setUnresolved(nextAttempt);
          return;
        }
        const snapshot = result.body;
        setUnresolved(undefined);
        setDetail({ kind: 'open', snapshot });
        setView((current) =>
          current.kind === 'ready'
            ? {
                ...current,
                snapshots: [
                  snapshot,
                  ...current.snapshots.filter(
                    (stored) => stored.id !== snapshot.id,
                  ),
                ],
              }
            : current,
        );
        setDrafts((current) =>
          Object.fromEntries(
            Object.entries(current).map(([id]) => [id, emptyDraftLine()]),
          ),
        );
        return;
      }
      const nextFieldFeedback = fieldFeedbackFor(result, nextAttempt);
      if (nextFieldFeedback) setFieldFeedback(nextFieldFeedback);
      else setFeedback(feedbackFor(result));
    } finally {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      if (commandRequest.current === controller) {
        commandRequest.current = undefined;
        setPending(false);
      }
    }
  }

  async function reopen(snapshotId: string): Promise<void> {
    detailRequest.current?.abort();
    const controller = new AbortController();
    detailRequest.current = controller;
    setDetail({ kind: 'loading', snapshotId });
    try {
      const result = await request({
        path: `${snapshotBasePath(opportunityId)}/${encodeURIComponent(snapshotId)}`,
        signal: controller.signal,
      });
      if (controller.signal.aborted || detailRequest.current !== controller)
        return;
      const accessRejected = await handleAccess(result, controller.signal);
      if (controller.signal.aborted || detailRequest.current !== controller)
        return;
      if (accessRejected) {
        setDetail({ kind: 'closed' });
        setView({ kind: 'denied' });
      } else if (result.status === 200 && isSnapshot(result.body)) {
        setDetail({ kind: 'open', snapshot: result.body });
      } else {
        setDetail({ kind: 'unavailable', snapshotId });
      }
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (!controller.signal.aborted && detailRequest.current === controller)
        setDetail({ kind: 'unavailable', snapshotId });
    } finally {
      if (detailRequest.current === controller)
        detailRequest.current = undefined;
    }
  }

  async function loadOlder(): Promise<void> {
    if (view.kind !== 'ready' || !view.nextCursor || olderPending) return;
    olderRequest.current?.abort();
    const controller = new AbortController();
    olderRequest.current = controller;
    setOlderPending(true);
    setOlderError(false);
    try {
      const result = await request({
        path: `${snapshotBasePath(opportunityId)}?limit=${pageSize}&cursor=${encodeURIComponent(view.nextCursor)}`,
        signal: controller.signal,
      });
      if (controller.signal.aborted || olderRequest.current !== controller)
        return;
      const accessRejected = await handleAccess(result, controller.signal);
      if (controller.signal.aborted || olderRequest.current !== controller)
        return;
      if (accessRejected) {
        setView({ kind: 'denied' });
      } else if (result.status === 200 && isSnapshotPage(result.body)) {
        const page = result.body;
        setView((current) =>
          current.kind === 'ready'
            ? {
                ...current,
                snapshots: [...current.snapshots, ...page.items],
                ...(page.nextCursor
                  ? { nextCursor: page.nextCursor }
                  : { nextCursor: undefined }),
              }
            : current,
        );
      } else {
        setOlderError(true);
      }
    } catch (error: unknown) {
      if (
        !(error instanceof DOMException && error.name === 'AbortError') &&
        !controller.signal.aborted &&
        olderRequest.current === controller
      )
        setOlderError(true);
    } finally {
      if (olderRequest.current === controller) {
        olderRequest.current = undefined;
        setOlderPending(false);
      }
    }
  }

  const selectedOfferingCount =
    view.kind === 'ready' ? countSelectedOfferings(view, drafts) : 0;
  const selectionLimitReached =
    selectedOfferingCount >= maximumCalculationLines;

  return (
    <section
      className="pricing-snapshot-panel"
      aria-labelledby={`${fieldId}-title`}
    >
      <header>
        <p>{copy.provisional}</p>
        <h4 id={`${fieldId}-title`}>{copy.title}</h4>
        <p>{copy.explanation}</p>
      </header>
      {view.kind === 'loading' ? <p role="status">{copy.loading}</p> : null}
      {view.kind === 'denied' ? <p role="alert">{copy.denied}</p> : null}
      {view.kind === 'error' ? (
        <p role="alert">
          {copy.unavailable}{' '}
          <button type="button" onClick={() => void load()}>
            {copy.retry}
          </button>
        </p>
      ) : null}
      {view.kind === 'ready' ? (
        <>
          {!view.rule ? <p role="status">{copy.noRule}</p> : null}
          {view.rule && view.offerings.length === 0 ? (
            <p role="status">{copy.noOfferings}</p>
          ) : null}
          {view.rule && view.offerings.length > 0 ? (
            <form
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                void submit(unresolved);
              }}
            >
              <p>
                {copy.ruleVersion}: {view.rule.versionNumber}
              </p>
              <p id={`${fieldId}-selection-limit`} aria-live="polite">
                {selectionLimitReached
                  ? copy.selectionLimitReached
                  : copy.selectionLimit}
              </p>
              <div className="pricing-snapshot-lines">
                {view.offerings.map((offering) => {
                  const draft = drafts[offering.id] ?? emptyDraftLine();
                  const netReductionFeedback =
                    fieldFeedback?.kind === 'net-reduction' &&
                    fieldFeedback.offeringId === offering.id
                      ? fieldFeedback
                      : undefined;
                  return (
                    <fieldset
                      key={offering.id}
                      disabled={pending || !!unresolved}
                    >
                      <label>
                        <input
                          type="checkbox"
                          checked={draft.selected}
                          disabled={!draft.selected && selectionLimitReached}
                          aria-describedby={`${fieldId}-selection-limit`}
                          onChange={(event) =>
                            event.target.checked && selectionLimitReached
                              ? setFeedback('too-many-lines')
                              : setDrafts((current) => ({
                                  ...current,
                                  [offering.id]: {
                                    ...draft,
                                    selected: event.target.checked,
                                  },
                                }))
                          }
                        />
                        {offering.commercialLabel ??
                          offering.serviceDefinition.name}
                      </label>
                      <small>
                        {offering.serviceDefinition.code} · {copy.tariff}{' '}
                        {offering.tariff.versionNumber} ·{' '}
                        {offering.tariff.unitAmount} {offering.tariff.currency}/
                        {offering.tariff.unit}
                      </small>
                      <label>
                        {copy.quantity}
                        <input
                          inputMode="decimal"
                          value={draft.quantity}
                          required={draft.selected}
                          aria-invalid={
                            draft.selected && !validQuantity(draft.quantity)
                          }
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [offering.id]: {
                                ...draft,
                                quantity: event.target.value,
                              },
                            }))
                          }
                        />
                      </label>
                      {mayAdjust && draft.selected ? (
                        <div className="pricing-snapshot-adjustment">
                          <label>
                            <input
                              type="checkbox"
                              checked={draft.adjustmentEnabled}
                              onChange={(event) =>
                                setDrafts((current) => ({
                                  ...current,
                                  [offering.id]: {
                                    ...draft,
                                    adjustmentEnabled: event.target.checked,
                                  },
                                }))
                              }
                            />
                            {copy.applyAdjustment}
                          </label>
                          {draft.adjustmentEnabled ? (
                            <>
                              <label>
                                {copy.netReduction}
                                <input
                                  inputMode="decimal"
                                  value={draft.netReduction}
                                  required
                                  aria-invalid={
                                    !validNetReduction(draft.netReduction) ||
                                    netReductionFeedback !== undefined
                                  }
                                  aria-describedby={
                                    netReductionFeedback
                                      ? `${fieldId}-${offering.id}-net-reduction-error`
                                      : undefined
                                  }
                                  onChange={(event) => {
                                    if (netReductionFeedback)
                                      setFieldFeedback(undefined);
                                    setDrafts((current) => ({
                                      ...current,
                                      [offering.id]: {
                                        ...draft,
                                        netReduction: event.target.value,
                                      },
                                    }));
                                  }}
                                />
                              </label>
                              {netReductionFeedback ? (
                                <small
                                  id={`${fieldId}-${offering.id}-net-reduction-error`}
                                  role="alert"
                                >
                                  {netReductionFeedback.message}
                                </small>
                              ) : null}
                              <label>
                                {copy.adjustmentReason}
                                <textarea
                                  value={draft.adjustmentReason}
                                  required
                                  aria-invalid={
                                    !validAdjustmentReason(
                                      draft.adjustmentReason,
                                    )
                                  }
                                  onChange={(event) =>
                                    setDrafts((current) => ({
                                      ...current,
                                      [offering.id]: {
                                        ...draft,
                                        adjustmentReason: event.target.value,
                                      },
                                    }))
                                  }
                                />
                              </label>
                            </>
                          ) : null}
                        </div>
                      ) : null}
                    </fieldset>
                  );
                })}
              </div>
              {feedback ? (
                <div role="alert">
                  <p>{feedbackCopy(feedback)}</p>
                  {feedback === 'stale' || feedback === 'not-effective' ? (
                    <button type="button" onClick={() => void load(true)}>
                      {copy.reload}
                    </button>
                  ) : null}
                </div>
              ) : null}
              {unresolved ? <p role="alert">{copy.uncertain}</p> : null}
              <button type="submit" disabled={pending}>
                {pending
                  ? copy.calculating
                  : unresolved
                    ? copy.retry
                    : copy.calculate}
              </button>
            </form>
          ) : null}
          <SnapshotHistory
            snapshots={view.snapshots}
            hasOlder={!!view.nextCursor}
            olderPending={olderPending}
            olderError={olderError}
            onOlder={() => void loadOlder()}
            onOpen={(snapshotId) => void reopen(snapshotId)}
          />
          {detail.kind === 'loading' ? (
            <p role="status">{copy.snapshotLoading}</p>
          ) : null}
          {detail.kind === 'unavailable' ? (
            <div role="alert">
              <p>{copy.snapshotUnavailable}</p>
              <button
                type="button"
                onClick={() => void reopen(detail.snapshotId)}
              >
                {copy.retrySnapshot}
              </button>
            </div>
          ) : null}
          {detail.kind === 'open' ? (
            <SnapshotDetail
              snapshot={detail.snapshot}
              onClose={() => setDetail({ kind: 'closed' })}
            />
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function SnapshotHistory({
  snapshots,
  hasOlder,
  olderPending,
  olderError,
  onOlder,
  onOpen,
}: {
  snapshots: PricingSnapshot[];
  hasOlder: boolean;
  olderPending: boolean;
  olderError: boolean;
  onOlder: () => void;
  onOpen: (snapshotId: string) => void;
}) {
  return (
    <section aria-labelledby="pricing-snapshot-history-title">
      <h5 id="pricing-snapshot-history-title">{copy.snapshots}</h5>
      {snapshots.length === 0 ? <p>{copy.noSnapshots}</p> : null}
      <ul className="pricing-snapshot-history">
        {snapshots.map((snapshot) => (
          <li key={snapshot.id}>
            <button type="button" onClick={() => onOpen(snapshot.id)}>
              {copy.reopen}: {snapshot.total} {snapshot.currency} ·{' '}
              {formatApplicationDateTime(snapshot.calculatedAt)}
            </button>
            <small>{copy.provisional}</small>
          </li>
        ))}
      </ul>
      {olderError ? <p role="alert">{copy.olderUnavailable}</p> : null}
      {hasOlder ? (
        <button type="button" onClick={onOlder} disabled={olderPending}>
          {copy.older}
        </button>
      ) : null}
    </section>
  );
}

function SnapshotDetail({
  snapshot,
  onClose,
}: {
  snapshot: PricingSnapshot;
  onClose: () => void;
}) {
  return (
    <section className="pricing-snapshot-detail" aria-label={copy.title}>
      <button type="button" onClick={onClose}>
        {copy.close}
      </button>
      <p>
        <strong>{copy.provisional}</strong>
      </p>
      <p>
        {copy.calculatedAt}: {formatApplicationDateTime(snapshot.calculatedAt)}
      </p>
      <p>
        {copy.calculatedBy}: {snapshot.calculatedByWorkspaceMembershipId}
      </p>
      <p>
        {copy.ruleVersion}: {snapshot.pricingRuleVersion.versionNumber}
      </p>
      {snapshot.clientReference ? (
        <p>
          {copy.client}: {snapshot.clientReference.displayName}
        </p>
      ) : null}
      <ol>
        {snapshot.lines.map((line) => (
          <li key={`${snapshot.id}:${line.position}`}>
            <strong>{line.commercialLabel ?? line.serviceName}</strong>
            <span>
              {copy.tariff}: {line.tariffVersionNumber}
            </span>
            <span>
              {line.quantity} × {line.unitAmount} {line.currency}/{line.unit}
            </span>
            <span>
              {copy.originalAmounts}: {line.lineNet} + {line.lineTax}{' '}
              {line.currency}
            </span>
            {line.adjustment ? (
              <div className="pricing-snapshot-adjustment-trace">
                <span>
                  {copy.adjustmentType}: {copy.fixedNetDiscount}
                </span>
                <span>
                  {copy.netReduction}: {line.adjustment.netReduction}{' '}
                  {line.currency}
                </span>
                <span>
                  {copy.taxReduction}: {line.adjustment.taxReduction}{' '}
                  {line.currency}
                </span>
                <span>
                  {copy.adjustmentReason}: {line.adjustment.reason}
                </span>
                <span>
                  {copy.adjustedAmounts}: {line.adjustedLineNet} +{' '}
                  {line.adjustedLineTax} {line.currency}
                </span>
                <span>
                  {copy.adjustmentAppliedBy}:{' '}
                  {line.adjustment.appliedByWorkspaceMembershipId}
                </span>
                <span>
                  {copy.adjustmentAppliedAt}:{' '}
                  {formatApplicationDateTime(line.adjustment.appliedAt)}
                </span>
              </div>
            ) : null}
          </li>
        ))}
      </ol>
      <dl>
        <div>
          <dt>{copy.subtotal}</dt>
          <dd>
            {snapshot.subtotal} {snapshot.currency}
          </dd>
        </div>
        <div>
          <dt>{copy.tax}</dt>
          <dd>
            {snapshot.taxTotal} {snapshot.currency}
          </dd>
        </div>
        <div>
          <dt>{copy.total}</dt>
          <dd>
            <strong>
              {snapshot.total} {snapshot.currency}
            </strong>
          </dd>
        </div>
      </dl>
      <p>{copy.provisional}</p>
    </section>
  );
}

function calculationAttempt(
  view: ReadyState,
  drafts: Record<string, DraftLine>,
): CalculationAttempt | undefined {
  if (!view.rule) return undefined;
  const lines = view.offerings.flatMap((offering) => {
    const draft = drafts[offering.id];
    return draft?.selected &&
      validQuantity(draft.quantity) &&
      validAdjustmentDraft(draft)
      ? [
          {
            offeringId: offering.id,
            tariffVersionNumber: offering.tariff.versionNumber,
            quantity: draft.quantity,
            ...(draft.adjustmentEnabled
              ? {
                  adjustment: {
                    type: 'FIXED_NET_DISCOUNT',
                    netReduction: draft.netReduction,
                    reason: draft.adjustmentReason,
                  },
                }
              : {}),
          },
        ]
      : [];
  });
  const selected = view.offerings.filter(
    (offering) => drafts[offering.id]?.selected,
  );
  if (
    lines.length === 0 ||
    lines.length > maximumCalculationLines ||
    lines.length !== selected.length
  )
    return undefined;
  return {
    payload: JSON.stringify({
      pricingRuleVersionNumber: view.rule.versionNumber,
      lines,
    }),
    idempotencyKey: crypto.randomUUID(),
    offeringIds: lines.map((line) => line.offeringId),
  };
}

function countSelectedOfferings(
  view: ReadyState,
  drafts: Record<string, DraftLine>,
): number {
  return view.offerings.filter((offering) => drafts[offering.id]?.selected)
    .length;
}

function validQuantity(value: string): boolean {
  if (!quantityGrammar.test(value)) return false;
  const [whole = '0', fraction = ''] = value.split('.');
  return BigInt(`${whole}${fraction.padEnd(3, '0')}`) > 0n;
}

function emptyDraftLine(): DraftLine {
  return {
    selected: false,
    quantity: '',
    adjustmentEnabled: false,
    netReduction: '',
    adjustmentReason: '',
  };
}

function validAdjustmentDraft(draft: DraftLine): boolean {
  return (
    !draft.adjustmentEnabled ||
    (validNetReduction(draft.netReduction) &&
      validAdjustmentReason(draft.adjustmentReason))
  );
}

function validNetReduction(value: string): boolean {
  if (!netReductionGrammar.test(value)) return false;
  return BigInt(value.replace('.', '')) > 0n;
}

function validAdjustmentReason(value: string): boolean {
  return (
    value.length >= 1 &&
    Array.from(value).length <= 500 &&
    /\S/u.test(value) &&
    !value.includes('\u0000') &&
    !/[\uD800-\uDFFF]/u.test(value)
  );
}

function snapshotBasePath(opportunityId: string): string {
  return `/pricing/opportunities/${encodeURIComponent(opportunityId)}/snapshots`;
}

function snapshotListPath(opportunityId: string): string {
  return `/pricing/opportunities/${encodeURIComponent(opportunityId)}/snapshots?limit=${pageSize}`;
}

async function loadAllOfferings(
  first: OfferingPage,
  request: (input: {
    path: string;
    signal: AbortSignal;
  }) => Promise<HttpResult>,
  handleAccess: (result: HttpResult, signal: AbortSignal) => Promise<boolean>,
  signal: AbortSignal,
): Promise<Offering[] | undefined> {
  const items = [...first.items];
  let cursor = first.nextCursor;
  while (cursor) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const result = await request({
      path: `/commercial-catalogue/offerings?limit=50&cursor=${encodeURIComponent(cursor)}`,
      signal,
    });
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (await handleAccess(result, signal)) return undefined;
    if (result.status !== 200 || !isOfferingPage(result.body))
      throw new Error('The offering page could not be loaded.');
    items.push(...result.body.items);
    cursor = result.body.nextCursor;
  }
  return items;
}

function feedbackFor(
  result: Exclude<HttpResult, { status: 'network' }>,
): Feedback {
  if (result.status === 400) return 'invalid';
  if (result.status !== 409 || !isRecord(result.body)) return 'invalid';
  switch (result.body.code) {
    case 'STALE_PRICING_RULE_VERSION':
    case 'STALE_TARIFF_VERSION':
      return 'stale';
    case 'PRICING_RULE_NOT_EFFECTIVE':
    case 'TARIFF_NOT_EFFECTIVE':
      return 'not-effective';
    case 'MIXED_CURRENCY':
      return 'mixed-currency';
    case 'IDEMPOTENCY_CONFLICT':
      return 'conflict';
    default:
      return 'invalid';
  }
}

function fieldFeedbackFor(
  result: Exclude<HttpResult, { status: 'network' }>,
  attempt: CalculationAttempt,
): FieldFeedback | undefined {
  if (
    result.status !== 400 ||
    !isRecord(result.body) ||
    result.body.code !== 'VALIDATION_ERROR' ||
    typeof result.body.field !== 'string' ||
    typeof result.body.message !== 'string'
  )
    return undefined;
  const match = /^lines\[(0|[1-9][0-9]*)\]\.adjustment\.netReduction$/u.exec(
    result.body.field,
  );
  const index = match?.[1];
  if (index === undefined) return undefined;
  const offeringId = attempt.offeringIds[Number.parseInt(index, 10)];
  if (!offeringId) return undefined;
  return {
    kind: 'net-reduction',
    offeringId,
    message: result.body.message,
  };
}

function feedbackCopy(feedback: Feedback): string {
  switch (feedback) {
    case 'invalid':
      return copy.corrected;
    case 'too-many-lines':
      return copy.tooManyLines;
    case 'stale':
      return copy.stale;
    case 'not-effective':
      return copy.notEffective;
    case 'mixed-currency':
      return copy.mixedCurrency;
    case 'conflict':
      return copy.conflict;
  }
  return unreachableFeedback(feedback);
}

function unreachableFeedback(feedback: never): never {
  throw new Error(`Unexpected pricing feedback: ${String(feedback)}`);
}

function isRuleScope(value: unknown): value is RuleScope {
  return (
    isRecord(value) &&
    (value.current === null ||
      (isRecord(value.current) &&
        typeof value.current.id === 'string' &&
        typeof value.current.versionNumber === 'number'))
  );
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
    typeof value.offeringId === 'string' &&
    (value.current === null || isTariff(value.current))
  );
}
function isTariff(value: unknown): value is TariffVersion {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.versionNumber === 'number' &&
    typeof value.unit === 'string' &&
    typeof value.unitAmount === 'string' &&
    isCurrency(value.currency) &&
    typeof value.taxRatePercent === 'string' &&
    typeof value.taxLabel === 'string'
  );
}
function isSnapshotPage(value: unknown): value is SnapshotPage {
  return (
    isRecord(value) &&
    Array.isArray(value.items) &&
    value.items.every(isSnapshot) &&
    (value.nextCursor === undefined || typeof value.nextCursor === 'string')
  );
}
function isSnapshot(value: unknown): value is PricingSnapshot {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.opportunityId === 'string' &&
    typeof value.clientRequestId === 'string' &&
    typeof value.calculatedByWorkspaceMembershipId === 'string' &&
    isCurrency(value.currency) &&
    isRecord(value.pricingRuleVersion) &&
    typeof value.pricingRuleVersion.id === 'string' &&
    typeof value.pricingRuleVersion.versionNumber === 'number' &&
    Array.isArray(value.lines) &&
    value.lines.every(isSnapshotLine) &&
    typeof value.subtotal === 'string' &&
    typeof value.taxTotal === 'string' &&
    typeof value.total === 'string' &&
    isDisplayableInstant(value.calculatedAt) &&
    typeof value.committedAt === 'string' &&
    value.provenance === 'ILLUSTRATIVE' &&
    value.provisional === true &&
    (value.clientReference === undefined ||
      (isRecord(value.clientReference) &&
        typeof value.clientReference.displayName === 'string'))
  );
}
function isSnapshotLine(value: unknown): value is SnapshotLine {
  return (
    isRecord(value) &&
    typeof value.position === 'number' &&
    typeof value.serviceCode === 'string' &&
    typeof value.serviceName === 'string' &&
    typeof value.offeringId === 'string' &&
    (value.commercialLabel === null ||
      typeof value.commercialLabel === 'string') &&
    typeof value.tariffVersionNumber === 'number' &&
    typeof value.unit === 'string' &&
    typeof value.unitAmount === 'string' &&
    isCurrency(value.currency) &&
    typeof value.taxRatePercent === 'string' &&
    typeof value.taxLabel === 'string' &&
    typeof value.quantity === 'string' &&
    typeof value.rawLineAmount === 'string' &&
    typeof value.lineNet === 'string' &&
    typeof value.rawLineTax === 'string' &&
    typeof value.lineTax === 'string' &&
    (value.adjustment === null || isSnapshotAdjustment(value.adjustment)) &&
    typeof value.netReduction === 'string' &&
    typeof value.taxReduction === 'string' &&
    typeof value.adjustedLineNet === 'string' &&
    typeof value.adjustedRawLineTax === 'string' &&
    typeof value.adjustedLineTax === 'string'
  );
}
function isSnapshotAdjustment(
  value: unknown,
): value is NonNullable<SnapshotLine['adjustment']> {
  return (
    isRecord(value) &&
    value.type === 'FIXED_NET_DISCOUNT' &&
    typeof value.netReduction === 'string' &&
    typeof value.taxReduction === 'string' &&
    typeof value.reason === 'string' &&
    typeof value.appliedByWorkspaceMembershipId === 'string' &&
    isDisplayableInstant(value.appliedAt)
  );
}
function isCurrency(value: unknown): value is Currency {
  return (
    value === 'MDL' || value === 'EUR' || value === 'RON' || value === 'USD'
  );
}
function isDisplayableInstant(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const instant = new Date(value);
  return !Number.isNaN(instant.getTime()) && instant.toISOString() === value;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
