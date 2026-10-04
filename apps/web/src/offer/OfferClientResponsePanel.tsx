import { useEffect, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import {
  createAuthenticatedApiClient,
  conflictCode,
  type ApiResult,
} from '../api/authenticated-api-client';
import { offerClientResponseCopy as copy } from './offer.copy';
import {
  readOfferClientResponse,
  type OfferClientResponseView,
  type OfferView,
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
  | 'alreadyRecorded'
  | 'notTransmitted'
  | 'elapsed'
  | 'notElapsed'
  | 'conflict';
type Attempt = { body: string; key: string };

export function OfferClientResponsePanel({
  identity,
  companyId,
  opportunityId,
  offer,
  onResponse,
  reject,
}: {
  identity: BrowserIdentity;
  companyId: string;
  opportunityId: string;
  offer: OfferView;
  onResponse: (response: OfferClientResponseView) => void;
  reject: (
    result: ApiResult<unknown>,
    signal: AbortSignal,
  ) => Promise<'unauthorized' | 'forbidden' | undefined>;
}) {
  const [state, setState] = useState<State>('idle');
  const [receivedAt, setReceivedAt] = useState('');
  const [reason, setReason] = useState('');
  const attempt = useRef<Attempt | undefined>(undefined);
  const pending = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => pending.current?.abort(), []);
  const locked = state === 'running' || state === 'uncertain';
  const blocked = [
    'denied',
    'unavailable',
    'stale',
    'superseded',
    'alreadyRecorded',
    'notTransmitted',
    'conflict',
  ].includes(state);
  async function execute(outcome: OfferClientResponseView['outcome']) {
    if (
      state === 'running' ||
      offer.version.clientResponse ||
      !offer.version.transmission
    )
      return;
    if (
      !attempt.current &&
      outcome !== 'EXPIRED' &&
      (!Number.isFinite(Date.parse(receivedAt)) ||
        (outcome === 'REJECTED' &&
          (!reason.trim() || reason.length > 500 || reason.includes('\0'))))
    ) {
      setState('invalid');
      return;
    }
    const command = attempt.current ?? {
      key: crypto.randomUUID(),
      body: JSON.stringify({
        expectedOfferRevision: offer.revision,
        outcome,
        ...(outcome === 'EXPIRED' ? {} : { receivedAt }),
        ...(outcome === 'REJECTED' ? { reason } : {}),
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
        `/offers/opportunities/${encodeURIComponent(opportunityId)}/versions/${encodeURIComponent(offer.version.id)}/client-response`,
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
        const response = readOfferClientResponse({
          value: result.value,
          offerVersionId: offer.version.id,
          transmission: offer.version.transmission,
          validUntil: offer.version.validUntil,
        });
        attempt.current = undefined;
        setState('idle');
        onResponse(response);
      } else if (result.status === 'notFound') {
        attempt.current = undefined;
        setState('unavailable');
      } else if (result.status === 'validation') {
        attempt.current = undefined;
        setState('invalid');
      } else if (result.status === 'conflict') {
        attempt.current = undefined;
        setState(responseConflict(conflictCode(result)));
      } else setState('uncertain');
    } catch {
      if (!request.signal.aborted) setState('uncertain');
    }
  }
  if (
    offer.version.transmissionState !== 'TRANSMITTED' ||
    offer.version.clientResponseState !== 'PENDING'
  )
    return null;
  return (
    <section
      className="offer-client-response"
      aria-labelledby="offer-client-response-title"
    >
      <h5 id="offer-client-response-title">{copy.title}</h5>
      <p>{copy.explanation}</p>
      {offer.version.validityElapsed && <p>{copy.pendingElapsed}</p>}
      {state !== 'idle' && (
        <p role={state === 'running' ? 'status' : 'alert'}>{copy[state]}</p>
      )}
      <label>
        {copy.receivedAt}
        <input
          type="text"
          value={receivedAt}
          placeholder={copy.timeExample}
          disabled={locked || blocked}
          onChange={(event) => setReceivedAt(event.target.value)}
        />
      </label>
      <p>{copy.receivedHelp}</p>
      <label>
        {copy.reason}
        <textarea
          value={reason}
          maxLength={500}
          disabled={locked || blocked}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      {!blocked && (
        <>
          <button
            type="button"
            disabled={locked}
            onClick={() => void execute('ACCEPTED')}
          >
            {copy.accept}
          </button>
          <button
            type="button"
            disabled={locked}
            onClick={() => void execute('REJECTED')}
          >
            {copy.reject}
          </button>
          <button
            type="button"
            disabled={locked}
            onClick={() => void execute('EXPIRED')}
          >
            {copy.expire}
          </button>
          {state === 'uncertain' && (
            <button type="button" onClick={() => void execute('ACCEPTED')}>
              {copy.retry}
            </button>
          )}
        </>
      )}
    </section>
  );
}
function responseConflict(code: string | undefined): State {
  switch (code) {
    case 'STALE_OFFER_REVISION':
      return 'stale';
    case 'OFFER_VERSION_SUPERSEDED':
      return 'superseded';
    case 'CLIENT_RESPONSE_ALREADY_RECORDED':
      return 'alreadyRecorded';
    case 'OFFER_VERSION_NOT_TRANSMITTED':
      return 'notTransmitted';
    case 'OFFER_VALIDITY_ELAPSED':
      return 'elapsed';
    case 'OFFER_VALIDITY_NOT_ELAPSED':
      return 'notElapsed';
    default:
      return 'conflict';
  }
}
