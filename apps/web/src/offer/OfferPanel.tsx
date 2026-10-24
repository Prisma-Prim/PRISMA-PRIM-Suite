import { OfferSummary } from './OfferSummary';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import {
  conflictCode,
  createAuthenticatedApiClient,
} from '../api/authenticated-api-client';
import { handleAuthenticatedAccessRejection } from '../api/latest-authenticated-request';
import {
  readClientLegalEntityList,
  type ClientLegalEntity,
} from '../client/client-legal-entities-response';
import { Select } from '../presentation/Select';
import {
  useOfferPreparationCopy,
  useOfferVersionCopy,
} from './offer-preparation.copy';
import { useOfferPresentation } from './offer-presentation';
import {
  readOffer,
  readOfferDetail,
  readOfferSnapshotPage,
  offerClientResponseState,
  type OfferSnapshotSummary,
  type OfferReadView,
  isIllustrativeOffer,
} from './offer-response';
import './offer.css';
import {
  EstimateOfferPreparation,
  mayPrepareEstimateOffer,
} from './EstimateOfferPreparation';
import { OfferEstimateSource } from './OfferEstimateSource';
import { useEstimateOfferCopy } from './offer-estimate.copy';
import { OfferQualityPanel } from './OfferQualityPanel';
import { OfferDecisionPanel } from './OfferDecisionPanel';
import { OfferTransmissionPanel } from './OfferTransmissionPanel';
import { OfferClientResponsePanel } from './OfferClientResponsePanel';
import { OfferVersionHistory } from './OfferVersionHistory';

type Ready = {
  kind: 'empty';
  snapshots: OfferSnapshotSummary[];
  legalEntities: ClientLegalEntity[];
};
type View =
  | { kind: 'loading' | 'denied' | 'error' }
  | Ready
  | {
      kind: 'version';
      offer: OfferReadView;
      snapshots: OfferSnapshotSummary[];
      legalEntities: ClientLegalEntity[];
    }
  | { kind: 'offer'; offer: OfferReadView };
type Attempt = { body: string; idempotencyKey: string };
const ignoreActor = (): void => undefined;
const ignoreWorkspace = (): void => undefined;

export function OfferPanel({
  actor,
  identity,
  opportunityId,
  requestedVersionId,
  currentClientId,
  clientDisplayName,
  onCompanyContextRejected,
  onActorRevalidated = ignoreActor,
  onWorkspaceAccessRejected = ignoreWorkspace,
}: {
  actor: ActorContext;
  identity: BrowserIdentity;
  opportunityId: string;
  /**
   * The exact Offer Version to open instead of the head, superseded or not.
   * The Offer read decides what is shown; nothing else is requested.
   */
  requestedVersionId?: string;
  currentClientId?: string;
  clientDisplayName?: string;
  onCompanyContextRejected: (companyId: string) => void;
  onActorRevalidated?: (actor: ActorContext) => Promise<void> | void;
  onWorkspaceAccessRejected?: () => Promise<void> | void;
}) {
  const copy = useOfferPreparationCopy();
  const estimateCopy = useEstimateOfferCopy();
  const offerVersionCopy = useOfferVersionCopy();
  const { formatDateTime, formatDecimal } = useOfferPresentation();
  const companyId = actor.activeCompany?.id;
  const permissions = actor.activeCompany?.offerPermissions ?? [];
  const mayRead = permissions.includes('commercial.offer.read');
  const mayPrepare =
    permissions.includes('commercial.offer.prepare') &&
    actor.activeCompany?.clientPermissions?.includes('client.read') &&
    actor.activeCompany?.commercialIntakePermissions?.includes(
      'commercial.opportunity.read',
    );
  const mayApprove = permissions.includes('commercial.offer.approve');
  const mayTransmit = permissions.includes(
    'commercial.offer.transmission.record',
  );
  const mayRespond =
    permissions.includes('commercial.offer.response.record') &&
    actor.activeCompany?.commercialIntakePermissions?.includes(
      'commercial.opportunity.read',
    );
  const authorityStamp = JSON.stringify([
    actor.workspaceId,
    actor.workspaceMembershipId,
    actor.internalUserId,
    actor.activeCompany?.offerPermissionAssignmentId,
    actor.activeCompany?.offerApproverAssignmentId,
    actor.activeCompany?.commercialIntakePermissionAssignmentId,
    actor.activeCompany?.clientPermissionAssignmentId,
    permissions,
    actor.activeCompany?.commercialIntakePermissions,
    actor.activeCompany?.clientPermissions,
    actor.activeCompany?.offerPermissionSetVersion,
    actor.activeCompany?.profitabilityContributorPermissionAssignmentId,
    actor.activeCompany?.profitabilityContributorPermissionSetVersion,
    actor.activeCompany?.profitabilityContributorPermissions,
    actor.activeCompany?.profitabilityDirectorPermissionAssignmentId,
    actor.activeCompany?.profitabilityDirectorPermissionSetVersion,
    actor.activeCompany?.profitabilityDirectorPermissions,
  ]);
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [estimateOpen, setEstimateOpen] = useState(false);
  const [snapshotId, setSnapshotId] = useState('');
  const [recipient, setRecipient] = useState('PRIMARY');
  const [validityDays, setValidityDays] = useState('30');
  const [scopeNote, setScopeNote] = useState('');
  const [commercialConditions, setCommercialConditions] = useState('');
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<
    | 'invalid'
    | 'conflict'
    | 'uncertain'
    | 'targetUnavailable'
    | 'stale'
    | 'accepted'
    | 'created'
  >();
  const contentLocked = pending || feedback === 'uncertain';
  const pendingRequest = useRef<AbortController | undefined>(undefined);
  const attempt = useRef<Attempt | undefined>(undefined);

  const reject = useCallback(
    async (
      result: Parameters<
        typeof handleAuthenticatedAccessRejection
      >[0]['result'],
      signal: AbortSignal,
    ) =>
      handleAuthenticatedAccessRejection({
        result,
        identity,
        companyContextId: companyId,
        onCompanyContextRejected,
        onActorRevalidated,
        onWorkspaceAccessRejected,
        signal,
      }),
    [
      companyId,
      identity,
      onActorRevalidated,
      onCompanyContextRejected,
      onWorkspaceAccessRejected,
    ],
  );

  const load = useCallback(async () => {
    pendingRequest.current?.abort();
    const request = new AbortController();
    pendingRequest.current = request;
    setView({ kind: 'loading' });
    setPending(false);
    if (!mayRead || !companyId) {
      setView({ kind: 'denied' });
      return;
    }
    try {
      const api = await createAuthenticatedApiClient(identity);
      const offerResult = await api.request<unknown>(
        `/offers/opportunities/${encodeURIComponent(opportunityId)}${
          requestedVersionId === undefined
            ? ''
            : `/versions/${encodeURIComponent(requestedVersionId)}`
        }`,
        { companyContextId: companyId, signal: request.signal },
      );
      if (request.signal.aborted) return;
      if (await reject(offerResult, request.signal)) {
        setView({ kind: 'denied' });
        return;
      }
      if (offerResult.status !== 'ok') {
        setView({ kind: 'error' });
        return;
      }
      const offer = readOfferDetail(offerResult.value);
      if (
        offer &&
        !isIllustrativeOffer(offer) &&
        (offer.companyId !== companyId || offer.opportunityId !== opportunityId)
      )
        throw new Error('Unavailable Offer scope.');
      if (requestedVersionId !== undefined) {
        // A requested version is shown only as exactly that version.
        setView(
          offer?.version.id === requestedVersionId
            ? { kind: 'offer', offer }
            : { kind: 'error' },
        );
        return;
      }
      if (offer !== null) {
        setView({ kind: 'offer', offer });
        return;
      }
      if (!mayPrepare || !currentClientId) {
        setView({ kind: 'empty', snapshots: [], legalEntities: [] });
        return;
      }
      const [snapshotsResult, entitiesResult] = await Promise.all([
        api.request<unknown>(
          `/pricing/opportunities/${encodeURIComponent(opportunityId)}/snapshots?limit=25`,
          { companyContextId: companyId, signal: request.signal },
        ),
        api.request<unknown>(
          `/clients/${encodeURIComponent(currentClientId)}/legal-entities`,
          { companyContextId: companyId, signal: request.signal },
        ),
      ]);
      if (request.signal.aborted) return;
      if (
        (await reject(snapshotsResult, request.signal)) ||
        (await reject(entitiesResult, request.signal))
      ) {
        setView({ kind: 'denied' });
        return;
      }
      if (snapshotsResult.status !== 'ok' || entitiesResult.status !== 'ok') {
        setView({ kind: 'error' });
        return;
      }
      const snapshots = readOfferSnapshotPage(snapshotsResult.value);
      const legalEntities = readClientLegalEntityList(
        entitiesResult.value,
      ).legalEntities;
      setSnapshotId(snapshots[0]?.id ?? '');
      setView({ kind: 'empty', snapshots, legalEntities });
    } catch (error) {
      if (request.signal.aborted) return;
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setView({ kind: 'error' });
    }
  }, [
    companyId,
    currentClientId,
    identity,
    mayPrepare,
    mayRead,
    opportunityId,
    reject,
    requestedVersionId,
  ]);

  useEffect(() => {
    attempt.current = undefined;
    setFeedback(undefined);
    setEstimateOpen(false);
    void load();
    return () => pendingRequest.current?.abort();
  }, [load, authorityStamp]);

  async function beginVersion() {
    if (view.kind !== 'offer' || !companyId || !currentClientId || !mayPrepare)
      return;
    const offer = view.offer;
    pendingRequest.current?.abort();
    const request = new AbortController();
    pendingRequest.current = request;
    setPending(true);
    setFeedback(undefined);
    try {
      const api = await createAuthenticatedApiClient(identity);
      const [snapshots, entities] = await Promise.all([
        api.request<unknown>(
          `/pricing/opportunities/${encodeURIComponent(opportunityId)}/snapshots?limit=25`,
          { companyContextId: companyId, signal: request.signal },
        ),
        api.request<unknown>(
          `/clients/${encodeURIComponent(currentClientId)}/legal-entities`,
          { companyContextId: companyId, signal: request.signal },
        ),
      ]);
      if (request.signal.aborted) return;
      if (
        (await reject(snapshots, request.signal)) ||
        (await reject(entities, request.signal))
      ) {
        setView({ kind: 'denied' });
        return;
      }
      if (snapshots.status !== 'ok' || entities.status !== 'ok') {
        setFeedback('targetUnavailable');
        return;
      }
      setSnapshotId(
        isIllustrativeOffer(offer)
          ? offer.version.pricingSnapshotId
          : (readOfferSnapshotPage(snapshots.value)[0]?.id ?? ''),
      );
      setRecipient(
        offer.version.recipient.additionalLegalEntityId ?? 'PRIMARY',
      );
      setValidityDays(String(offer.version.validityDays));
      setScopeNote(offer.version.scopeNote ?? '');
      setCommercialConditions(offer.version.commercialConditions ?? '');
      attempt.current = undefined;
      setView({
        kind: 'version',
        offer,
        snapshots: readOfferSnapshotPage(snapshots.value),
        legalEntities: readClientLegalEntityList(entities.value).legalEntities,
      });
    } catch {
      if (!request.signal.aborted) setFeedback('targetUnavailable');
    } finally {
      if (!request.signal.aborted) setPending(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if ((view.kind !== 'empty' && view.kind !== 'version') || !companyId)
      return;
    const days = Number(validityDays);
    if (!snapshotId || !Number.isSafeInteger(days) || days < 1 || days > 365) {
      setFeedback('invalid');
      return;
    }
    const command = attempt.current ?? {
      idempotencyKey: crypto.randomUUID(),
      body: JSON.stringify({
        ...(view.kind === 'version'
          ? { expectedOfferRevision: view.offer.revision }
          : {}),
        pricingSnapshotId: snapshotId,
        recipient:
          recipient === 'PRIMARY'
            ? { kind: 'PRIMARY' }
            : { kind: 'ADDITIONAL', legalEntityId: recipient },
        validityDays: days,
        scopeNote: scopeNote || null,
        commercialConditions: commercialConditions || null,
      }),
    };
    attempt.current = command;
    setPending(true);
    setFeedback(undefined);
    const request = new AbortController();
    pendingRequest.current = request;
    try {
      const api = await createAuthenticatedApiClient(identity);
      const result = await api.request<unknown>(
        `/offers/opportunities/${encodeURIComponent(opportunityId)}${view.kind === 'version' ? '/versions' : ''}`,
        {
          method: 'POST',
          companyContextId: companyId,
          headers: {
            'content-type': 'application/json',
            'idempotency-key': command.idempotencyKey,
          },
          body: command.body,
          signal: request.signal,
        },
      );
      if (request.signal.aborted) return;
      if (await reject(result, request.signal)) {
        setView({ kind: 'denied' });
      } else if (result.status === 'ok') {
        const offer = readOffer(result.value);
        attempt.current = undefined;
        setView({ kind: 'offer', offer });
        if (view.kind === 'version') setFeedback('created');
      } else if (result.status === 'notFound') {
        attempt.current = undefined;
        setFeedback('targetUnavailable');
      } else if (result.status === 'validation') {
        attempt.current = undefined;
        setFeedback('invalid');
      } else if (result.status === 'conflict') {
        attempt.current = undefined;
        setFeedback(
          conflictCode(result) === 'STALE_OFFER_REVISION'
            ? 'stale'
            : conflictCode(result) === 'OFFER_ACCEPTED'
              ? 'accepted'
              : 'conflict',
        );
      } else {
        setFeedback('uncertain');
      }
    } catch (error) {
      if (request.signal.aborted) return;
      if (!(error instanceof DOMException && error.name === 'AbortError'))
        setFeedback('uncertain');
    } finally {
      if (!request.signal.aborted) setPending(false);
    }
  }

  return (
    <section className="offer-panel" aria-labelledby="offer-title">
      <h4 id="offer-title">
        {estimateOpen ||
        (view.kind === 'offer' && !isIllustrativeOffer(view.offer))
          ? estimateCopy('internal')
          : copy.title}
      </h4>
      <p>
        {estimateOpen ||
        (view.kind === 'offer' && !isIllustrativeOffer(view.offer))
          ? estimateCopy('notice')
          : copy.explanation}
      </p>
      {view.kind === 'loading' && <p role="status">{copy.loading}</p>}
      {view.kind === 'denied' && <p role="status">{copy.denied}</p>}
      {view.kind === 'error' && (
        <div>
          <p role="alert">{copy.unavailable}</p>
          <button type="button" onClick={() => void load()}>
            {copy.reload}
          </button>
        </div>
      )}
      {(view.kind === 'empty' ||
        (view.kind === 'offer' &&
          !view.offer.version.supersededByVersionId &&
          view.offer.version.clientResponseState !== 'ACCEPTED')) &&
        companyId &&
        currentClientId &&
        mayPrepareEstimateOffer(actor) && (
          <EstimateOfferPreparation
            key={`estimate:${authorityStamp}:${companyId}:${opportunityId}:${view.kind === 'offer' ? view.offer.version.id : 'first'}`}
            actor={actor}
            identity={identity}
            opportunityId={opportunityId}
            clientId={currentClientId}
            clientLabel={clientDisplayName ?? copy.clientFallback}
            offer={view.kind === 'offer' ? view.offer : undefined}
            reject={reject}
            onOpen={setEstimateOpen}
            onCreated={(offer) => {
              pendingRequest.current?.abort();
              attempt.current = undefined;
              setFeedback(undefined);
              setView({ kind: 'offer', offer });
            }}
          />
        )}
      {view.kind === 'empty' && !mayPrepare && <p>{copy.noOffer}</p>}
      {view.kind === 'empty' && mayPrepare && !currentClientId && (
        <p>{copy.noClient}</p>
      )}
      {(view.kind === 'empty' || view.kind === 'version') &&
        !estimateOpen &&
        mayPrepare &&
        currentClientId &&
        view.snapshots.length === 0 && <p>{copy.noSnapshot}</p>}
      {(view.kind === 'empty' || view.kind === 'version') &&
        !estimateOpen &&
        mayPrepare &&
        currentClientId &&
        view.snapshots.length > 0 && (
          <form noValidate onSubmit={(event) => void submit(event)}>
            {view.kind === 'version' && (
              <p>
                {offerVersionCopy.predecessor(view.offer.version.versionNumber)}
              </p>
            )}
            <label>
              {copy.pricingSnapshot}
              <Select
                id="offer-pricing-snapshot"
                value={snapshotId}
                disabled={contentLocked}
                options={view.snapshots.map((snapshot) => ({
                  value: snapshot.id,
                  label: `${formatDecimal(snapshot.total)} ${snapshot.currency} — ${formatDateTime(snapshot.committedAt)}`,
                }))}
                onValueChange={(value) => {
                  attempt.current = undefined;
                  setSnapshotId(value);
                }}
              />
            </label>
            <label>
              {copy.recipient}
              <Select
                id="offer-recipient"
                value={recipient}
                disabled={contentLocked}
                options={[
                  {
                    value: 'PRIMARY',
                    label: copy.primaryRecipient(
                      clientDisplayName ?? copy.clientFallback,
                    ),
                  },
                  ...view.legalEntities.map((entity) => ({
                    value: entity.id,
                    label: entity.legalName,
                  })),
                ]}
                onValueChange={(value) => {
                  attempt.current = undefined;
                  setRecipient(value);
                }}
              />
            </label>
            <label>
              {copy.validityDays}
              <input
                type="number"
                min="1"
                max="365"
                value={validityDays}
                disabled={contentLocked}
                onChange={(event) => {
                  attempt.current = undefined;
                  setValidityDays(event.target.value);
                }}
              />
            </label>
            <label>
              {copy.scopeNote}
              <textarea
                maxLength={2000}
                value={scopeNote}
                disabled={contentLocked}
                onChange={(event) => {
                  attempt.current = undefined;
                  setScopeNote(event.target.value);
                }}
              />
            </label>
            <label>
              {copy.commercialConditions}
              <textarea
                maxLength={4000}
                value={commercialConditions}
                disabled={contentLocked}
                onChange={(event) => {
                  attempt.current = undefined;
                  setCommercialConditions(event.target.value);
                }}
              />
            </label>
            <button type="submit" disabled={pending}>
              {pending
                ? copy.preparing
                : feedback === 'uncertain'
                  ? copy.retry
                  : view.kind === 'version'
                    ? offerVersionCopy.create
                    : copy.prepare}
            </button>
            {feedback && <p role="alert">{copy[feedback]}</p>}
            {view.kind === 'version' && (
              <button
                type="button"
                disabled={contentLocked}
                onClick={() => setView({ kind: 'offer', offer: view.offer })}
              >
                {offerVersionCopy.cancel}
              </button>
            )}
          </form>
        )}
      {view.kind === 'offer' && (
        <>
          <OfferSummary offer={view.offer} />
          {!isIllustrativeOffer(view.offer) && (
            <OfferEstimateSource
              actor={actor}
              identity={identity}
              opportunityId={opportunityId}
              source={view.offer.version.priceSource}
              reject={reject}
            />
          )}
          {companyId && (
            <OfferVersionHistory
              key={`${authorityStamp}:${companyId}:${opportunityId}:${view.offer.id}:${view.offer.version.id}`}
              identity={identity}
              companyId={companyId}
              opportunityId={opportunityId}
              offer={view.offer}
              reject={reject}
              onSelect={(offer) => {
                pendingRequest.current?.abort();
                setPending(false);
                attempt.current = undefined;
                setFeedback(undefined);
                setView({ kind: 'offer', offer });
              }}
            />
          )}
          {mayPrepare &&
            currentClientId &&
            !view.offer.version.supersededByVersionId &&
            view.offer.version.clientResponseState !== 'ACCEPTED' && (
              <button
                type="button"
                disabled={pending}
                onClick={() => void beginVersion()}
              >
                {offerVersionCopy.prepare}
              </button>
            )}
          {feedback && (
            <p role={feedback === 'created' ? 'status' : 'alert'}>
              {copy[feedback]}
            </p>
          )}
          {companyId && isIllustrativeOffer(view.offer) && (
            <OfferQualityPanel
              key={`${authorityStamp}:${companyId}:${opportunityId}:${view.offer.version.id}`}
              identity={identity}
              companyId={companyId}
              opportunityId={opportunityId}
              offerVersionId={view.offer.version.id}
              qualityRuleSetVersion={view.offer.version.qualityRuleSetVersion}
              initialRun={view.offer.version.latestQualityRun}
              mayRun={
                !view.offer.version.supersededByVersionId &&
                (permissions.includes('commercial.offer.prepare') || mayApprove)
              }
              reject={reject}
              onRun={(run) =>
                setView((current) =>
                  current.kind === 'offer' && isIllustrativeOffer(current.offer)
                    ? {
                        kind: 'offer',
                        offer: {
                          ...current.offer,
                          version: {
                            ...current.offer.version,
                            latestQualityRun: run,
                          },
                        },
                      }
                    : current,
                )
              }
            />
          )}
          {companyId &&
            mayApprove &&
            !view.offer.version.supersededByVersionId && (
              <OfferDecisionPanel
                key={`decision:${authorityStamp}:${companyId}:${opportunityId}:${view.offer.version.id}`}
                identity={identity}
                companyId={companyId}
                opportunityId={opportunityId}
                offer={view.offer}
                reject={reject}
                onDecision={(decision) =>
                  setView((current) => {
                    if (current.kind !== 'offer') return current;
                    if (!isIllustrativeOffer(current.offer)) {
                      if (decision.state !== 'REJECTED') return current;
                      return {
                        kind: 'offer',
                        offer: {
                          ...current.offer,
                          revision: decision.offerRevision,
                          version: {
                            ...current.offer.version,
                            decisionState: 'REJECTED',
                            decision,
                          },
                        },
                      };
                    }
                    return {
                      kind: 'offer',
                      offer: {
                        ...current.offer,
                        revision: decision.offerRevision,
                        version: {
                          ...current.offer.version,
                          decisionState: decision.state,
                          decision,
                          latestQualityRun:
                            decision.state === 'APPROVED'
                              ? decision.qualityRun
                              : current.offer.version.latestQualityRun,
                        },
                      },
                    };
                  })
                }
              />
            )}
          {companyId &&
            isIllustrativeOffer(view.offer) &&
            mayTransmit &&
            !view.offer.version.supersededByVersionId &&
            view.offer.version.decisionState === 'APPROVED' &&
            view.offer.version.transmissionState === 'NOT_TRANSMITTED' && (
              <OfferTransmissionPanel
                key={`transmission:${authorityStamp}:${companyId}:${opportunityId}:${view.offer.version.id}`}
                identity={identity}
                companyId={companyId}
                opportunityId={opportunityId}
                offer={view.offer}
                reject={reject}
                onTransmission={(transmission) =>
                  setView((current) =>
                    current.kind === 'offer' &&
                    isIllustrativeOffer(current.offer)
                      ? {
                          kind: 'offer',
                          offer: {
                            ...current.offer,
                            revision: transmission.offerRevision,
                            version: {
                              ...current.offer.version,
                              transmissionState: 'TRANSMITTED',
                              clientResponseState: 'PENDING',
                              clientResponse: null,
                              transmission,
                              latestQualityRun: transmission.qualityRun,
                            },
                          },
                        }
                      : current,
                  )
                }
              />
            )}
          {companyId &&
            isIllustrativeOffer(view.offer) &&
            mayRespond &&
            !view.offer.version.supersededByVersionId &&
            view.offer.version.clientResponseState === 'PENDING' && (
              <OfferClientResponsePanel
                key={`response:${authorityStamp}:${companyId}:${opportunityId}:${view.offer.version.id}`}
                identity={identity}
                companyId={companyId}
                opportunityId={opportunityId}
                offer={view.offer}
                reject={reject}
                onResponse={(response) =>
                  setView((current) =>
                    current.kind === 'offer' &&
                    current.offer.version.transmission
                      ? {
                          kind: 'offer',
                          offer: {
                            ...current.offer,
                            revision: response.offerRevision,
                            version: {
                              ...current.offer.version,
                              transmissionState: 'TRANSMITTED',
                              transmission: current.offer.version.transmission,
                              ...offerClientResponseState(response),
                            },
                          },
                        }
                      : current,
                  )
                }
              />
            )}
        </>
      )}
    </section>
  );
}
