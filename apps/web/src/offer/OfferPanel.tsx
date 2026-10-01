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
import { formatApplicationDateTime } from '../presentation/date-time';
import { Select } from '../presentation/Select';
import { offerCopy as copy } from './offer.copy';
import {
  readOffer,
  readOfferDetail,
  readOfferSnapshotPage,
  type OfferSnapshotSummary,
  type OfferView,
} from './offer-response';
import './offer.css';

type Ready = {
  kind: 'empty';
  snapshots: OfferSnapshotSummary[];
  legalEntities: ClientLegalEntity[];
};
type View =
  | { kind: 'loading' | 'denied' | 'error' }
  | Ready
  | { kind: 'offer'; offer: OfferView };
type Attempt = { body: string; idempotencyKey: string };
const ignoreActor = (): void => undefined;
const ignoreWorkspace = (): void => undefined;

export function OfferPanel({
  actor,
  identity,
  opportunityId,
  currentClientId,
  clientDisplayName,
  onCompanyContextRejected,
  onActorRevalidated = ignoreActor,
  onWorkspaceAccessRejected = ignoreWorkspace,
}: {
  actor: ActorContext;
  identity: BrowserIdentity;
  opportunityId: string;
  currentClientId?: string;
  clientDisplayName?: string;
  onCompanyContextRejected: (companyId: string) => void;
  onActorRevalidated?: (actor: ActorContext) => Promise<void> | void;
  onWorkspaceAccessRejected?: () => Promise<void> | void;
}) {
  const companyId = actor.activeCompany?.id;
  const permissions = actor.activeCompany?.offerPermissions ?? [];
  const mayRead = permissions.includes('commercial.offer.read');
  const mayPrepare = permissions.includes('commercial.offer.prepare');
  const [view, setView] = useState<View>({ kind: 'loading' });
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
    | 'unsupportedAdjustment'
    | 'targetUnavailable'
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
        `/offers/opportunities/${encodeURIComponent(opportunityId)}`,
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
  ]);

  useEffect(() => {
    attempt.current = undefined;
    setFeedback(undefined);
    void load();
    return () => pendingRequest.current?.abort();
  }, [load]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (view.kind !== 'empty' || !companyId) return;
    const days = Number(validityDays);
    if (!snapshotId || !Number.isSafeInteger(days) || days < 1 || days > 365) {
      setFeedback('invalid');
      return;
    }
    const command = attempt.current ?? {
      idempotencyKey: crypto.randomUUID(),
      body: JSON.stringify({
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
        `/offers/opportunities/${encodeURIComponent(opportunityId)}`,
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
        attempt.current = undefined;
        setView({ kind: 'offer', offer: readOffer(result.value) });
      } else if (result.status === 'notFound') {
        attempt.current = undefined;
        setFeedback('targetUnavailable');
      } else if (result.status === 'validation') {
        attempt.current = undefined;
        setFeedback('invalid');
      } else if (result.status === 'conflict') {
        attempt.current = undefined;
        setFeedback(
          conflictCode(result) === 'PRICING_SNAPSHOT_ADJUSTMENT_UNSUPPORTED'
            ? 'unsupportedAdjustment'
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
      <h4 id="offer-title">{copy.title}</h4>
      <p>{copy.explanation}</p>
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
      {view.kind === 'empty' && !mayPrepare && <p>{copy.noOffer}</p>}
      {view.kind === 'empty' && mayPrepare && !currentClientId && (
        <p>{copy.noClient}</p>
      )}
      {view.kind === 'empty' &&
        mayPrepare &&
        currentClientId &&
        view.snapshots.length === 0 && <p>{copy.noSnapshot}</p>}
      {view.kind === 'empty' &&
        mayPrepare &&
        currentClientId &&
        view.snapshots.length > 0 && (
          <form noValidate onSubmit={(event) => void submit(event)}>
            <label>
              {copy.pricingSnapshot}
              <Select
                id="offer-pricing-snapshot"
                value={snapshotId}
                disabled={contentLocked}
                options={view.snapshots.map((snapshot) => ({
                  value: snapshot.id,
                  label: `${snapshot.total} ${snapshot.currency} — ${formatApplicationDateTime(snapshot.committedAt)}`,
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
                  : copy.prepare}
            </button>
            {feedback && <p role="alert">{copy[feedback]}</p>}
          </form>
        )}
      {view.kind === 'offer' && <OfferSummary offer={view.offer} />}
    </section>
  );
}

function OfferSummary({ offer }: { offer: OfferView }) {
  const version = offer.version;
  return (
    <div className="offer-summary">
      <strong>{copy.provisional}</strong>
      <dl>
        <div>
          <dt>{copy.reference}</dt>
          <dd>{offer.illustrativeReference}</dd>
        </div>
        <div>
          <dt>{copy.version}</dt>
          <dd>{version.versionNumber}</dd>
        </div>
        <div>
          <dt>{copy.issuingCompany}</dt>
          <dd>{version.issuingCompanyLabel}</dd>
        </div>
        <div>
          <dt>{copy.recipient}</dt>
          <dd>{version.recipient.legalName}</dd>
        </div>
        <div>
          <dt>{copy.validUntil}</dt>
          <dd>{formatApplicationDateTime(version.validUntil)}</dd>
        </div>
        <div>
          <dt>{copy.states}</dt>
          <dd>{copy.stateValue}</dd>
        </div>
        <div>
          <dt>{copy.snapshotTotal}</dt>
          <dd>
            {version.pricingSnapshot.total} {version.pricingSnapshot.currency}
          </dd>
        </div>
      </dl>
      {version.scopeNote && <p>{version.scopeNote}</p>}
      {version.commercialConditions && <p>{version.commercialConditions}</p>}
    </div>
  );
}
