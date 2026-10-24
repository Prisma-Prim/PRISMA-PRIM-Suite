import { useEffect, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import {
  createAuthenticatedApiClient,
  conflictCode,
  type ApiResult,
} from '../api/authenticated-api-client';
import { useOfferDecisionCopy } from './offer-quality-decision.copy';
import {
  readOfferDecision,
  type OfferReadView,
  isIllustrativeOffer,
  type OfferDecisionView,
  type OfferQualityRunView,
} from './offer-response';

type State =
  | 'idle'
  | 'running'
  | 'uncertain'
  | 'invalid'
  | 'denied'
  | 'unavailable'
  | 'stale'
  | 'superseded'
  | 'alreadyDecided'
  | 'conflict'
  | 'qualityErrors'
  | 'warningsChanged';
type Attempt = { kind: 'approve' | 'reject'; body: string; key: string };

export function OfferDecisionPanel({
  identity,
  companyId,
  opportunityId,
  offer,
  onDecision,
  reject,
}: {
  identity: BrowserIdentity;
  companyId: string;
  opportunityId: string;
  offer: OfferReadView;
  onDecision: (decision: OfferDecisionView) => void;
  reject: (
    result: ApiResult<unknown>,
    signal: AbortSignal,
  ) => Promise<'unauthorized' | 'forbidden' | undefined>;
}) {
  const copy = useOfferDecisionCopy();
  const [state, setState] = useState<State>('idle');
  const [reason, setReason] = useState('');
  const [acknowledged, setAcknowledged] = useState<
    Array<OfferQualityRunView['results'][number]['code']>
  >([]);
  const attempt = useRef<Attempt | undefined>(undefined);
  const pending = useRef<AbortController | undefined>(undefined);
  const displayedRun = useRef(offer.version.latestQualityRun?.id);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    if (displayedRun.current !== offer.version.latestQualityRun?.id) {
      displayedRun.current = offer.version.latestQualityRun?.id;
      setAcknowledged([]);
    }
  }, [offer.version.latestQualityRun?.id]);
  const warnings =
    offer.version.latestQualityRun?.results.filter(
      (result) => result.status === 'WARNING',
    ) ?? [];
  const locked = state === 'running' || state === 'uncertain';
  async function execute(kind: 'approve' | 'reject') {
    if (
      state === 'running' ||
      offer.version.decision ||
      (kind === 'approve' && !isIllustrativeOffer(offer))
    )
      return;
    if (
      !attempt.current &&
      kind === 'reject' &&
      (reason.trim().length === 0 || reason.length > 500)
    ) {
      setState('invalid');
      return;
    }
    const command = attempt.current ?? {
      kind,
      key: crypto.randomUUID(),
      body: JSON.stringify(
        kind === 'approve'
          ? {
              expectedOfferRevision: offer.revision,
              acknowledgedWarningCodes: acknowledged,
            }
          : { expectedOfferRevision: offer.revision, reason },
      ),
    };
    attempt.current = command;
    pending.current?.abort();
    const request = new AbortController();
    pending.current = request;
    setState('running');
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (request.signal.aborted) return;
      const result = await api.request<unknown>(
        `/offers/opportunities/${encodeURIComponent(opportunityId)}/versions/${encodeURIComponent(offer.version.id)}/${command.kind}`,
        {
          method: 'POST',
          companyContextId: companyId,
          headers: {
            'content-type': 'application/json',
            'idempotency-key': command.key,
          },
          body: command.body,
          signal: request.signal,
        },
      );
      if (request.signal.aborted) return;
      const denied = await reject(result, request.signal);
      if (request.signal.aborted) return;
      if (denied) {
        attempt.current = undefined;
        setState('denied');
      } else if (result.status === 'ok') {
        const decision = readOfferDecision(result.value, {
          offerVersionId: offer.version.id,
          ...(isIllustrativeOffer(offer)
            ? { ruleSetVersion: offer.version.qualityRuleSetVersion }
            : {}),
        });
        attempt.current = undefined;
        setState('idle');
        onDecision(decision);
      } else if (result.status === 'notFound') {
        attempt.current = undefined;
        setState('unavailable');
      } else if (result.status === 'validation') {
        attempt.current = undefined;
        setState('invalid');
      } else if (result.status === 'conflict') {
        attempt.current = undefined;
        setState(decisionConflict(conflictCode(result)));
      } else setState('uncertain');
    } catch {
      if (!request.signal.aborted) setState('uncertain');
    }
  }
  if (offer.version.decision)
    return (
      <p role="status">
        {offer.version.decision.state === 'APPROVED'
          ? copy.approved
          : copy.rejected}
      </p>
    );
  const blocked = [
    'denied',
    'unavailable',
    'stale',
    'superseded',
    'alreadyDecided',
    'conflict',
  ].includes(state);
  return (
    <section className="offer-decision" aria-labelledby="offer-decision-title">
      <h5 id="offer-decision-title">{copy.title}</h5>
      {isIllustrativeOffer(offer) && <p>{copy.explanation}</p>}
      {state !== 'idle' && (
        <p role={state === 'running' ? 'status' : 'alert'}>{copy[state]}</p>
      )}
      {!blocked && (
        <>
          {warnings.length > 0 && (
            <fieldset disabled={locked}>
              <legend>{copy.acknowledge}</legend>
              {warnings.map(({ code }) => (
                <label key={code}>
                  <input
                    type="checkbox"
                    checked={acknowledged.includes(code)}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setAcknowledged((current) =>
                        checked
                          ? [...current, code]
                          : current.filter((item) => item !== code),
                      );
                    }}
                  />
                  {copy.qualityLabels[code]}
                </label>
              ))}
            </fieldset>
          )}
          {isIllustrativeOffer(offer) && (
            <button
              type="button"
              disabled={locked}
              onClick={() => void execute('approve')}
            >
              {copy.approve}
            </button>
          )}
          <label>
            {copy.reason}
            <textarea
              value={reason}
              maxLength={500}
              disabled={locked}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={locked}
            onClick={() => void execute('reject')}
          >
            {copy.reject}
          </button>
          {state === 'uncertain' && (
            <button
              type="button"
              onClick={() => void execute(attempt.current?.kind ?? 'approve')}
            >
              {copy.retry}
            </button>
          )}
        </>
      )}
    </section>
  );
}
function decisionConflict(code: string | undefined): State {
  switch (code) {
    case 'STALE_OFFER_REVISION':
      return 'stale';
    case 'OFFER_VERSION_SUPERSEDED':
      return 'superseded';
    case 'OFFER_VERSION_ALREADY_DECIDED':
      return 'alreadyDecided';
    case 'QUALITY_CHECK_ERRORS':
      return 'qualityErrors';
    case 'QUALITY_CHECK_WARNINGS_UNACKNOWLEDGED':
      return 'warningsChanged';
    default:
      return 'conflict';
  }
}
