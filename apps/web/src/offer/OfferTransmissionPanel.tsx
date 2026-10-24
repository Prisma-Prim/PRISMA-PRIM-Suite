import { useEffect, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import {
  createAuthenticatedApiClient,
  conflictCode,
  type ApiResult,
} from '../api/authenticated-api-client';
import { useOfferTransmissionCopy } from './offer-transmission-response.copy';
import { useOfferQualityCopy } from './offer-quality-decision.copy';
import {
  readOfferTransmission,
  type OfferQualityRunView,
  type ExecutableOfferView,
  type OfferTransmissionView,
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
  | 'alreadyTransmitted'
  | 'notApproved'
  | 'mismatch'
  | 'conflict'
  | 'qualityErrors'
  | 'warningsChanged';
type Attempt = { body: string; key: string };

export function OfferTransmissionPanel({
  identity,
  companyId,
  opportunityId,
  offer,
  onTransmission,
  reject,
}: {
  identity: BrowserIdentity;
  companyId: string;
  opportunityId: string;
  offer: ExecutableOfferView;
  onTransmission: (decision: OfferTransmissionView) => void;
  reject: (
    result: ApiResult<unknown>,
    signal: AbortSignal,
  ) => Promise<'unauthorized' | 'forbidden' | undefined>;
}) {
  const copy = useOfferTransmissionCopy();
  const { qualityLabels } = useOfferQualityCopy();
  const [state, setState] = useState<State>('idle');
  const [note, setNote] = useState('');
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
      (result) =>
        result.status === 'WARNING' &&
        offer.version.decision?.state === 'APPROVED' &&
        !offer.version.decision.acknowledgedWarningCodes.includes(result.code),
    ) ?? [];
  const locked = state === 'running' || state === 'uncertain';
  async function execute() {
    if (
      state === 'running' ||
      offer.version.transmission ||
      offer.version.decision?.state !== 'APPROVED'
    )
      return;
    if (!attempt.current && (note.length > 500 || note.includes('\0'))) {
      setState('invalid');
      return;
    }
    const command = attempt.current ?? {
      key: crypto.randomUUID(),
      body: JSON.stringify({
        expectedOfferRevision: offer.revision,
        acknowledgedWarningCodes: acknowledged,
        note,
      }),
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
        `/offers/opportunities/${encodeURIComponent(opportunityId)}/versions/${encodeURIComponent(offer.version.id)}/transmission`,
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
        const transmission = readOfferTransmission(
          result.value,
          {
            offerVersionId: offer.version.id,
            ruleSet: offer.version.qualityRuleSet,
            ruleSetVersion: offer.version.qualityRuleSetVersion,
          },
          offer.version.decision,
        );
        attempt.current = undefined;
        setState('idle');
        onTransmission(transmission);
      } else if (result.status === 'notFound') {
        attempt.current = undefined;
        setState('unavailable');
      } else if (result.status === 'validation') {
        attempt.current = undefined;
        setState('invalid');
      } else if (result.status === 'conflict') {
        attempt.current = undefined;
        setState(transmissionConflict(conflictCode(result)));
      } else setState('uncertain');
    } catch {
      if (!request.signal.aborted) setState('uncertain');
    }
  }
  if (
    offer.version.decision?.state !== 'APPROVED' ||
    offer.version.transmission
  )
    return null;
  const blocked = [
    'denied',
    'unavailable',
    'stale',
    'superseded',
    'alreadyTransmitted',
    'notApproved',
    'mismatch',
    'conflict',
  ].includes(state);
  return (
    <section
      className="offer-transmission"
      aria-labelledby="offer-transmission-title"
    >
      <h5 id="offer-transmission-title">{copy.title}</h5>
      <p>{copy.explanation}</p>
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
                  {qualityLabels[code]}
                </label>
              ))}
            </fieldset>
          )}
          <label>
            {copy.note}
            <textarea
              value={note}
              maxLength={500}
              disabled={locked}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={locked}
            onClick={() => void execute()}
          >
            {copy.record}
          </button>
          {state === 'uncertain' && (
            <button type="button" onClick={() => void execute()}>
              {copy.retry}
            </button>
          )}
        </>
      )}
    </section>
  );
}
function transmissionConflict(code: string | undefined): State {
  switch (code) {
    case 'STALE_OFFER_REVISION':
      return 'stale';
    case 'OFFER_VERSION_SUPERSEDED':
      return 'superseded';
    case 'OFFER_VERSION_ALREADY_TRANSMITTED':
      return 'alreadyTransmitted';
    case 'OFFER_VERSION_NOT_APPROVED':
      return 'notApproved';
    case 'REPRESENTATION_MISMATCH':
      return 'mismatch';
    case 'QUALITY_CHECK_ERRORS':
      return 'qualityErrors';
    case 'QUALITY_CHECK_WARNINGS_UNACKNOWLEDGED':
      return 'warningsChanged';
    default:
      return 'conflict';
  }
}
