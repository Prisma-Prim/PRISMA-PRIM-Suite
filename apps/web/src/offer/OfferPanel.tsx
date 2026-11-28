import { useCapturedAccessRejection } from '../api/use-captured-access-rejection';
import { useRequestLifetime } from '../api/use-actor-requests';
import { useScopedOperationGroup } from '../api/use-scoped-operation';
import {
  supportedOfferMessageTarget,
  useOfferMessageCopy,
  type OfferMessageTarget,
} from '../offer-message/offer-message-preparation';
import {
  CommercialPdfSelection,
  type CommercialPdfCallbacks,
} from '../commercial-pdf/CommercialPdfDownload';
import { useModelOfferCopy } from './model-offer.copy';
import { OfferSummary } from './OfferSummary';
import { useOfferCommandLock } from './use-offer-command-lock';
import {
  useCallback,
  useMemo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import type { BrowserIdentity } from '../access-composition';
import {
  grantOf,
  holds,
  type CompanyGrantPermission,
} from '../access/company-grants';
import type { ActorContext } from '../access-types';
import {
  conflictCode,
  createAuthenticatedApiClient,
} from '../api/authenticated-api-client';
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
  type OfferSnapshotSummary,
  type OfferReadView,
  isIllustrativeOffer,
  isExecutableOffer,
  isModelOffer,
  applyOfferDecision,
  applyOfferQuality,
  applyOfferTransmission,
  applyOfferResponse,
} from './offer-response';
import './offer.css';
import {
  EstimateOfferPreparation,
  mayPrepareEstimateOffer,
  mayPrepareModelOffer,
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
type WorkflowCommand = 'quality' | 'decision' | 'transmission' | 'response';
const ignoreActor = (): void => undefined;
const ignoreWorkspace = (): void => undefined;

/** Scope/session/grant changes unmount all protected children and uncertain intent. */
export function OfferPanel(props: Parameters<typeof OfferPanelOwner>[0]) {
  const generation = useRequestLifetime(props.identity, 'offer');
  const ownerKey = JSON.stringify([
    offerAuthorityStamp(props.actor),
    props.opportunityId,
    props.requestedVersionId,
    props.expectedOfferId,
    props.currentClientId,
    generation,
  ]);
  return <OfferPanelOwner key={ownerKey} {...props} />;
}
function offerAuthorityStamp(actor: ActorContext) {
  return JSON.stringify([
    actor.active,
    actor.activeCompany?.id,
    actor.workspaceId,
    actor.workspaceMembershipId,
    actor.internalUserId,
    ...(
      [
        'company_offer_preparer',
        'company_offer_approver',
        'company_commercial_intake',
        'company_director_client_access',
        'company_profitability_contributor',
        'company_profitability_director',
      ] as const
    ).map((bundle) => grantOf(actor.activeCompany, bundle)),
  ]);
}

function OfferPanelOwner({
  actor,
  identity,
  opportunityId,
  requestedVersionId,
  pdf,
  onPrepareMessage,
  onMessageNavigate,
  expectedOfferId,
  onProtectedWorkChange,
  currentClientId,
  clientDisplayName,
  besideVersion = false,
  onChanged,
  onCompanyContextRejected,
  onActorRevalidated = ignoreActor,
  onWorkspaceAccessRejected = ignoreWorkspace,
}: {
  actor: ActorContext;
  identity: BrowserIdentity;
  opportunityId: string;
  /**
   * Lays the version's commands out beside its exact representation, so a
   * decision is never taken without the version it decides.
   */
  besideVersion?: boolean;
  /** After each confirmed command: preparation, version, check or record. */
  onChanged?: () => void;
  /**
   * The exact Offer Version to open instead of the head, superseded or not.
   * The Offer read decides what is shown; nothing else is requested.
   */
  requestedVersionId?: string;
  pdf?: CommercialPdfCallbacks;
  onPrepareMessage?: (source: OfferMessageTarget) => void;
  onMessageNavigate?: () => void;
  /** Optional identity guard for an exact record selected by discovery. */
  expectedOfferId?: string;
  onProtectedWorkChange?: (protectedWork: boolean) => void;
  currentClientId?: string;
  clientDisplayName?: string;
  onCompanyContextRejected: (companyId: string) => void;
  onActorRevalidated?: (actor: ActorContext) => Promise<void> | void;
  onWorkspaceAccessRejected?: () => Promise<void> | void;
}) {
  const copy = useOfferPreparationCopy();
  const messageCopy = useOfferMessageCopy();
  const estimateCopy = useEstimateOfferCopy();
  const modelCopy = useModelOfferCopy();
  const offerVersionCopy = useOfferVersionCopy();
  const { formatDateTime, formatDecimal } = useOfferPresentation();
  const company = actor.activeCompany;
  const companyId = company?.id;
  const prepares = (
    permission: CompanyGrantPermission<'company_offer_preparer'>,
  ) => holds(company, 'company_offer_preparer', permission);
  const approves = (
    permission: CompanyGrantPermission<'company_offer_approver'>,
  ) => holds(company, 'company_offer_approver', permission);
  const readsOpportunity = holds(
    company,
    'company_commercial_intake',
    'commercial.opportunity.read',
  );
  const mayRead =
    prepares('commercial.offer.read') || approves('commercial.offer.read');
  const mayPrepare =
    prepares('commercial.offer.prepare') &&
    holds(company, 'company_director_client_access', 'client.read') &&
    readsOpportunity;
  const mayApprove = approves('commercial.offer.approve');
  const mayTransmit = prepares('commercial.offer.transmission.record');
  const mayRespond =
    approves('commercial.offer.response.record') && readsOpportunity;
  const authorityStamp = offerAuthorityStamp(actor);
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [estimateOpen, setEstimateOpen] = useState(false);
  const [preparationMode, setPreparationMode] = useState<
    'INTERNAL' | 'COMPANY_MODEL'
  >('INTERNAL');
  const estimateOpenRef = useRef(false);
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
  const reads = useScopedOperationGroup('offer');
  const preparation = useScopedOperationGroup('preparation-sources');
  const writes = useScopedOperationGroup('offer-command');
  const attempt = useRef<Attempt | undefined>(undefined);
  const [workflowCommand, setWorkflowCommand] =
    useState<WorkflowCommand | null>(null);
  const workflowCommandRef = useRef<WorkflowCommand | null>(null);
  useOfferCommandLock(
    contentLocked || workflowCommand !== null,
    onProtectedWorkChange,
  );
  const commandLocks = useMemo(() => {
    const update = (command: WorkflowCommand, locked: boolean) => {
      if (locked) workflowCommandRef.current = command;
      else if (workflowCommandRef.current === command)
        workflowCommandRef.current = null;
      setWorkflowCommand(workflowCommandRef.current);
    };
    return {
      quality: (locked: boolean) => update('quality', locked),
      decision: (locked: boolean) => update('decision', locked),
      transmission: (locked: boolean) => update('transmission', locked),
      response: (locked: boolean) => update('response', locked),
    };
  }, []);

  const reject = useCapturedAccessRejection({
    actor,
    identity,
    companyContextId: companyId,
    scope: authorityStamp,
    onCompanyContextRejected,
    onActorRevalidated,
    onWorkspaceAccessRejected,
  });
  const rejection = useRef(reject);
  useLayoutEffect(() => {
    rejection.current = reject;
  });

  const load = useCallback(async () => {
    const request = reads.beginLatest();
    if (!request) return;
    const reject = rejection.current;
    setView({ kind: 'loading' });
    setPending(false);
    if (!mayRead || !companyId) {
      setView({ kind: 'denied' });
      request.release();
      return;
    }
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (request.signal.aborted) return;
      const offerResult = await api.request(
        `/offers/opportunities/${encodeURIComponent(opportunityId)}${
          requestedVersionId === undefined
            ? ''
            : `/versions/${encodeURIComponent(requestedVersionId)}`
        }`,
        { companyContextId: companyId, signal: request.signal },
      );
      if (request.signal.aborted) return;
      const offerDenied = await reject(offerResult, request.signal);
      if (request.signal.aborted) return;
      if (offerDenied) {
        setView({ kind: 'denied' });
        return;
      }
      if (offerResult.status !== 'ok') {
        setView({ kind: 'error' });
        return;
      }
      const offer = readOfferDetail(
        offerResult.value,
        expectedOfferId
          ? {
              companyId,
              opportunityId,
              offerId: expectedOfferId,
            }
          : undefined,
      );
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
        api.request(
          `/pricing/opportunities/${encodeURIComponent(opportunityId)}/snapshots?limit=25`,
          { companyContextId: companyId, signal: request.signal },
        ),
        api.request(
          `/clients/${encodeURIComponent(currentClientId)}/legal-entities`,
          { companyContextId: companyId, signal: request.signal },
        ),
      ]);
      if (request.signal.aborted) return;
      const denied =
        (await reject(snapshotsResult, request.signal)) ||
        (await reject(entitiesResult, request.signal));
      if (request.signal.aborted) return;
      if (denied) {
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
    } finally {
      request.release();
    }
  }, [
    companyId,
    currentClientId,
    identity,
    mayPrepare,
    mayRead,
    opportunityId,
    reads,
    requestedVersionId,
    expectedOfferId,
  ]);

  useEffect(() => {
    attempt.current = undefined;
    setFeedback(undefined);
    estimateOpenRef.current = false;
    setEstimateOpen(false);
    void load();
    return reads.retire;
  }, [load, authorityStamp]);

  async function beginVersion() {
    if (
      estimateOpenRef.current ||
      workflowCommandRef.current !== null ||
      view.kind !== 'offer' ||
      !companyId ||
      !currentClientId ||
      !mayPrepare
    )
      return;
    const offer = view.offer;
    reads.retire();
    const request = preparation.beginLatest();
    if (!request) return;
    setPending(true);
    setFeedback(undefined);
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (request.signal.aborted) return;
      const [snapshots, entities] = await Promise.all([
        api.request(
          `/pricing/opportunities/${encodeURIComponent(opportunityId)}/snapshots?limit=25`,
          { companyContextId: companyId, signal: request.signal },
        ),
        api.request(
          `/clients/${encodeURIComponent(currentClientId)}/legal-entities`,
          { companyContextId: companyId, signal: request.signal },
        ),
      ]);
      if (request.signal.aborted) return;
      const denied =
        (await reject(snapshots, request.signal)) ||
        (await reject(entities, request.signal));
      if (request.signal.aborted) return;
      if (denied) {
        setView({ kind: 'denied' });
        return;
      }
      if (snapshots.status !== 'ok' || entities.status !== 'ok') {
        setFeedback('targetUnavailable');
        return;
      }
      if (workflowCommandRef.current !== null) return;
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
      request.release();
      if (!request.signal.aborted) setPending(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (writes.isPending()) return;
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
    const request = writes.beginLatest();
    if (!request) return;
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (request.signal.aborted) return;
      const result = await api.request(
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
      const denied = await reject(result, request.signal);
      if (request.signal.aborted) return;
      if (denied) {
        setView({ kind: 'denied' });
      } else if (result.status === 'ok') {
        const offer = readOffer(result.value);
        attempt.current = undefined;
        setView({ kind: 'offer', offer });
        if (view.kind === 'version') setFeedback('created');
        onChanged?.();
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
      request.release();
      if (!request.signal.aborted) setPending(false);
    }
  }

  const messageTarget =
    view.kind === 'offer' && !estimateOpen
      ? supportedOfferMessageTarget({ actor, opportunityId, offer: view.offer })
      : null;
  // The shown version and its commands; `besideVersion` only arranges them.
  const shown = view.kind === 'offer' ? view.offer : undefined;
  const summary = shown && (
    <OfferSummary offer={shown} pdfAction={pdf?.action} />
  );
  const messageCommand = onPrepareMessage && messageTarget && (
    <button
      type="button"
      disabled={pending || workflowCommand !== null}
      onClick={() => onPrepareMessage(messageTarget)}
    >
      {messageCopy('prepare')}
    </button>
  );
  const estimateSource = shown && !isIllustrativeOffer(shown) && (
    <OfferEstimateSource
      actor={actor}
      identity={identity}
      opportunityId={opportunityId}
      source={shown.version.priceSource}
      reject={reject}
    />
  );
  const history = shown && companyId && (
    <fieldset
      className="offer-command-boundary"
      disabled={workflowCommand !== null}
    >
      <OfferVersionHistory
        key={`${authorityStamp}:${companyId}:${opportunityId}:${shown.id}:${shown.version.id}`}
        identity={identity}
        companyId={companyId}
        opportunityId={opportunityId}
        offer={shown}
        reject={reject}
        onNavigate={() => {
          pdf?.navigate();
          onMessageNavigate?.();
        }}
        onSelect={(offer) => {
          if (estimateOpenRef.current || workflowCommandRef.current !== null)
            return;
          reads.retire();
          preparation.retire();
          writes.retire();
          setPending(false);
          attempt.current = undefined;
          setFeedback(undefined);
          setView({ kind: 'offer', offer });
        }}
      />
    </fieldset>
  );
  const versionCommand = shown &&
    mayPrepare &&
    currentClientId &&
    !shown.version.supersededByVersionId &&
    shown.version.clientResponseState !== 'ACCEPTED' && (
      <button
        type="button"
        disabled={pending || workflowCommand !== null}
        onClick={() => void beginVersion()}
      >
        {offerVersionCopy.prepare}
      </button>
    );
  const versionFeedback = shown && feedback && (
    <p role={feedback === 'created' ? 'status' : 'alert'}>{copy[feedback]}</p>
  );
  const qualityCommand = shown && companyId && isExecutableOffer(shown) && (
    <fieldset
      className="offer-command-boundary"
      disabled={workflowCommand !== null && workflowCommand !== 'quality'}
    >
      <OfferQualityPanel
        key={`${authorityStamp}:${companyId}:${opportunityId}:${shown.version.id}`}
        onCommandLockChange={commandLocks.quality}
        identity={identity}
        companyId={companyId}
        opportunityId={opportunityId}
        offerVersionId={shown.version.id}
        qualityRuleSet={shown.version.qualityRuleSet}
        qualityRuleSetVersion={shown.version.qualityRuleSetVersion}
        initialRun={shown.version.latestQualityRun}
        mayRun={
          !shown.version.supersededByVersionId &&
          (isModelOffer(shown)
            ? prepares('commercial.offer.model_based.prepare') ||
              approves('commercial.offer.model_based.approve')
            : prepares('commercial.offer.prepare') || mayApprove)
        }
        reject={reject}
        onRun={(run) => {
          setView((current) =>
            !estimateOpenRef.current && current.kind === 'offer'
              ? {
                  kind: 'offer',
                  offer: applyOfferQuality(current.offer, run),
                }
              : current,
          );
          onChanged?.();
        }}
      />
    </fieldset>
  );
  const decisionCommand = shown &&
    companyId &&
    mayApprove &&
    (!isModelOffer(shown) ||
      approves('commercial.offer.model_based.approve')) &&
    !shown.version.supersededByVersionId && (
      <fieldset
        className="offer-command-boundary"
        disabled={workflowCommand !== null && workflowCommand !== 'decision'}
      >
        <OfferDecisionPanel
          key={`decision:${authorityStamp}:${companyId}:${opportunityId}:${shown.version.id}`}
          onCommandLockChange={commandLocks.decision}
          identity={identity}
          companyId={companyId}
          opportunityId={opportunityId}
          offer={shown}
          reject={reject}
          onDecision={(decision) => {
            setView((current) =>
              !estimateOpenRef.current && current.kind === 'offer'
                ? {
                    kind: 'offer',
                    offer: applyOfferDecision(current.offer, decision),
                  }
                : current,
            );
            onChanged?.();
          }}
        />
      </fieldset>
    );
  const transmissionCommand = shown &&
    companyId &&
    isExecutableOffer(shown) &&
    mayTransmit &&
    (!isModelOffer(shown) ||
      prepares('commercial.offer.model_based.transmission.record')) &&
    !shown.version.supersededByVersionId &&
    shown.version.decisionState === 'APPROVED' &&
    shown.version.transmissionState === 'NOT_TRANSMITTED' && (
      <fieldset
        className="offer-command-boundary"
        disabled={
          workflowCommand !== null && workflowCommand !== 'transmission'
        }
      >
        <OfferTransmissionPanel
          key={`transmission:${authorityStamp}:${companyId}:${opportunityId}:${shown.version.id}`}
          onCommandLockChange={commandLocks.transmission}
          identity={identity}
          companyId={companyId}
          opportunityId={opportunityId}
          offer={shown}
          reject={reject}
          onTransmission={(transmission) => {
            setView((current) =>
              !estimateOpenRef.current && current.kind === 'offer'
                ? {
                    kind: 'offer',
                    offer: applyOfferTransmission(current.offer, transmission),
                  }
                : current,
            );
            onChanged?.();
          }}
        />
      </fieldset>
    );
  const responseCommand = shown &&
    companyId &&
    isExecutableOffer(shown) &&
    mayRespond &&
    (!isModelOffer(shown) ||
      approves('commercial.offer.model_based.response.record')) &&
    !shown.version.supersededByVersionId &&
    shown.version.clientResponseState === 'PENDING' && (
      <fieldset
        className="offer-command-boundary"
        disabled={workflowCommand !== null && workflowCommand !== 'response'}
      >
        <OfferClientResponsePanel
          key={`response:${authorityStamp}:${companyId}:${opportunityId}:${shown.version.id}`}
          onCommandLockChange={commandLocks.response}
          identity={identity}
          companyId={companyId}
          opportunityId={opportunityId}
          offer={shown}
          reject={reject}
          onResponse={(response) => {
            setView((current) =>
              !estimateOpenRef.current && current.kind === 'offer'
                ? {
                    kind: 'offer',
                    offer: applyOfferResponse(current.offer, response),
                  }
                : current,
            );
            onChanged?.();
          }}
        />
      </fieldset>
    );
  return (
    <section className="offer-panel" aria-labelledby="offer-title">
      <CommercialPdfSelection
        onSelection={pdf?.select}
        inlineBlocked={estimateOpen}
        selection={
          view.kind === 'offer' && isModelOffer(view.offer)
            ? {
                kind: 'offer',
                rootId: view.offer.id,
                reference: view.offer.illustrativeReference,
                versionId: view.offer.version.id,
                versionNumber: view.offer.version.versionNumber,
                provenance: 'COMPANY_MODEL_ESTIMATE',
                createdAt: view.offer.version.financialDeclaration.declaredAt,
                sourceRendererCode: 'OFFER_COMPANY_CONSULTING_RO',
                sourceHtmlSha256: view.offer.version.representation.sha256,
              }
            : view.kind === 'offer' &&
                isExecutableOffer(view.offer) &&
                view.offer.version.provenance === 'ILLUSTRATIVE' &&
                view.offer.version.representation.templateVersion === 1 &&
                view.offer.version.createdAt !== null
              ? {
                  kind: 'offer',
                  rootId: view.offer.id,
                  reference: view.offer.illustrativeReference,
                  versionId: view.offer.version.id,
                  versionNumber: view.offer.version.versionNumber,
                  provenance: 'ILLUSTRATIVE',
                  createdAt: view.offer.version.createdAt,
                  sourceRendererCode: 'OFFER_ILLUSTRATIVE',
                  sourceHtmlSha256: view.offer.version.representation.sha256,
                }
              : null
        }
      />
      <h4 id="offer-title">
        {(estimateOpen && preparationMode === 'COMPANY_MODEL') ||
        (view.kind === 'offer' && isModelOffer(view.offer))
          ? modelCopy('title')
          : estimateOpen ||
              (view.kind === 'offer' && !isExecutableOffer(view.offer))
            ? estimateCopy('internal')
            : copy.title}
      </h4>
      <p>
        {(estimateOpen && preparationMode === 'COMPANY_MODEL') ||
        (view.kind === 'offer' && isModelOffer(view.offer))
          ? modelCopy('notice')
          : estimateOpen ||
              (view.kind === 'offer' && !isExecutableOffer(view.offer))
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
        !contentLocked &&
        (mayPrepareEstimateOffer(actor) || mayPrepareModelOffer(actor)) && (
          <fieldset
            className="offer-command-boundary"
            disabled={workflowCommand !== null}
          >
            {(['COMPANY_MODEL', 'INTERNAL'] as const)
              .filter(
                (mode) =>
                  (!estimateOpen || preparationMode === mode) &&
                  (mode === 'COMPANY_MODEL'
                    ? mayPrepareModelOffer(actor)
                    : mayPrepareEstimateOffer(actor)),
              )
              .map((mode) => (
                <EstimateOfferPreparation
                  mode={mode}
                  key={`${mode}:estimate:${authorityStamp}:${companyId}:${opportunityId}:${view.kind === 'offer' ? view.offer.version.id : 'first'}`}
                  actor={actor}
                  identity={identity}
                  opportunityId={opportunityId}
                  clientId={currentClientId}
                  clientLabel={clientDisplayName ?? copy.clientFallback}
                  offer={view.kind === 'offer' ? view.offer : undefined}
                  reject={reject}
                  onOpen={(open) => {
                    setPreparationMode(mode);
                    estimateOpenRef.current = open;
                    if (open) {
                      reads.retire();
                      preparation.retire();
                      writes.retire();
                      setPending(false);
                    }
                    setEstimateOpen(open);
                  }}
                  onCreated={(offer) => {
                    reads.retire();
                    preparation.retire();
                    writes.retire();
                    attempt.current = undefined;
                    setFeedback(undefined);
                    setView({ kind: 'offer', offer });
                    onChanged?.();
                  }}
                />
              ))}
          </fieldset>
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
      {shown && (
        <fieldset
          className="offer-existing-version"
          disabled={estimateOpen}
          aria-labelledby="offer-title"
        >
          {besideVersion ? (
            <div className="offer-version-beside">
              <div className="offer-version-document">
                {summary}
                {estimateSource}
              </div>
              <div className="offer-version-commands">
                {versionFeedback}
                {qualityCommand}
                {decisionCommand}
                {transmissionCommand}
                {responseCommand}
                {messageCommand}
                {versionCommand}
                {history}
              </div>
            </div>
          ) : (
            <>
              {summary}
              {messageCommand}
              {estimateSource}
              {history}
              {versionCommand}
              {versionFeedback}
              {qualityCommand}
              {decisionCommand}
              {transmissionCommand}
              {responseCommand}
            </>
          )}
        </fieldset>
      )}
    </section>
  );
}
