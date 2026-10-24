import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import {
  createAuthenticatedApiClient,
  conflictCode,
  type ApiResult,
} from '../api/authenticated-api-client';
import {
  parseEstimateHistory,
  profitabilityAuthority,
} from '../profitability-estimate/profitability-contract';
import {
  readClientLegalEntityList,
  type ClientLegalEntity,
} from '../client/client-legal-entities-response';
import {
  readOffer,
  isIllustrativeOffer,
  type InternalOfferPriceSource,
  type InternalOfferView,
  type OfferReadView,
} from './offer-response';
import { useOfferPreparationCopy } from './offer-preparation.copy';
import { useEstimateOfferCopy } from './offer-estimate.copy';
import { useOfferPresentation } from './offer-presentation';

type RejectionHandler = (
  result: ApiResult<unknown>,
  signal: AbortSignal,
) => Promise<'unauthorized' | 'forbidden' | undefined>;
type State =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'sending'
  | 'unavailable'
  | 'denied'
  | 'invalid'
  | 'stale'
  | 'uncertain';
type Attempt = {
  body: string;
  key: string;
  source: InternalOfferPriceSource;
  expected: {
    offerId: string | null;
    revision: number;
    versionNumber: number;
    recipient: string;
    validityDays: number;
    scopeNote: string | null;
    commercialConditions: string | null;
  };
};

export function mayPrepareEstimateOffer(actor: ActorContext): boolean {
  const company = actor.activeCompany;
  return (
    company?.offerPermissionSetVersion === 'v2' &&
    !!company.offerPermissionAssignmentId &&
    [
      'commercial.offer.read',
      'commercial.offer.prepare',
      'commercial.offer.estimate.prepare',
    ].every((permission) =>
      company.offerPermissions?.some((own) => own === permission),
    ) &&
    company.clientPermissions?.includes('client.read') === true &&
    profitabilityAuthority(actor).read
  );
}

type PreparationProps = {
  actor: ActorContext;
  identity: BrowserIdentity;
  opportunityId: string;
  clientId: string;
  clientLabel: string;
  offer?: OfferReadView;
  reject: RejectionHandler;
  onCreated: (offer: InternalOfferView) => void;
  onOpen: (open: boolean) => void;
};
export function EstimateOfferPreparation(props: PreparationProps) {
  const generation = useRef({ identity: props.identity, value: 0 });
  if (generation.current.identity !== props.identity)
    generation.current = {
      identity: props.identity,
      value: generation.current.value + 1,
    };
  return (
    <EstimateOfferPreparationOwner key={generation.current.value} {...props} />
  );
}

/** Owns only price-source selection and an exact literal preparation command. */
function EstimateOfferPreparationOwner({
  actor,
  identity,
  opportunityId,
  clientId,
  clientLabel,
  offer,
  reject,
  onCreated,
  onOpen,
}: PreparationProps) {
  const copy = useEstimateOfferCopy();
  const content = useOfferPreparationCopy();
  const { formatDecimal, formatDateTime } = useOfferPresentation();
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>('idle');
  const [sources, setSources] = useState<InternalOfferPriceSource[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [entities, setEntities] = useState<ClientLegalEntity[]>([]);
  const [sourceId, setSourceId] = useState('');
  const [recipient, setRecipient] = useState(
    offer?.version.recipient.additionalLegalEntityId ?? 'PRIMARY',
  );
  const [days, setDays] = useState(String(offer?.version.validityDays ?? 30));
  const [scope, setScope] = useState(offer?.version.scopeNote ?? '');
  const [conditions, setConditions] = useState(
    offer?.version.commercialConditions ?? '',
  );
  const attempt = useRef<Attempt | undefined>(undefined);
  const active = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => active.current?.abort(), []);
  const companyId = actor.activeCompany?.id;
  const selected = sources.find(
    (source) => source.estimateVersionId === sourceId,
  );
  const locked = state === 'sending' || state === 'uncertain';

  async function load(nextCursor?: string) {
    if (!companyId || !mayPrepareEstimateOffer(actor)) return;
    active.current?.abort();
    const request = new AbortController();
    active.current = request;
    setState('loading');
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (request.signal.aborted) return;
      const [history, legal] = await Promise.all([
        api.request<unknown>(
          `/opportunities/${encodeURIComponent(opportunityId)}/profitability-estimates?limit=25${nextCursor ? '&cursor=' + encodeURIComponent(nextCursor) : ''}`,
          { companyContextId: companyId, signal: request.signal },
        ),
        api.request<unknown>(
          `/clients/${encodeURIComponent(clientId)}/legal-entities`,
          { companyContextId: companyId, signal: request.signal },
        ),
      ]);
      if (request.signal.aborted) return;
      const denied =
        (await reject(history, request.signal)) ||
        (await reject(legal, request.signal));
      if (request.signal.aborted) return;
      if (denied) {
        setSources([]);
        setSourceId('');
        setState('denied');
        return;
      }
      if (history.status !== 'ok' || legal.status !== 'ok') {
        setState('unavailable');
        return;
      }
      const page = parseEstimateHistory(history.value, {
        workspaceId: actor.workspaceId,
        companyId,
        opportunityId,
      });
      const choices: InternalOfferPriceSource[] = page.items.flatMap(
        (version) =>
          version.decision?.code === 'APPROVE'
            ? [
                {
                  kind: 'DIRECTOR_APPROVED_ESTIMATE',
                  estimateId: version.estimateId,
                  estimateVersionId: version.id,
                  estimateVersionNumber: version.versionNumber,
                  approvalDecisionId: version.decision.id,
                  approvedAt: version.decision.decidedAt,
                  amount: version.inputs.proposedPrice,
                  currency: version.inputs.currency,
                  taxTreatment: 'UNSPECIFIED',
                },
              ]
            : [],
      );
      setSources((previous) =>
        nextCursor ? [...previous, ...choices] : choices,
      );
      setCursor(page.nextCursor);
      setEntities(readClientLegalEntityList(legal.value).legalEntities);
      setState('ready');
    } catch {
      if (!request.signal.aborted) setState('unavailable');
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (
      !companyId ||
      (locked && state !== 'uncertain') ||
      !mayPrepareEstimateOffer(actor)
    )
      return;
    const validityDays = Number(days);
    if (
      !attempt.current &&
      (!selected ||
        !Number.isSafeInteger(validityDays) ||
        validityDays < 1 ||
        validityDays > 365)
    ) {
      setState('invalid');
      return;
    }
    const command =
      attempt.current ??
      (selected
        ? {
            key: crypto.randomUUID(),
            source: selected,
            expected: {
              offerId: offer?.id ?? null,
              revision: offer ? offer.revision + 1 : 1,
              versionNumber: offer ? offer.version.versionNumber + 1 : 1,
              recipient,
              validityDays,
              scopeNote: scope || null,
              commercialConditions: conditions || null,
            },
            body: JSON.stringify({
              ...(offer ? { expectedOfferRevision: offer.revision } : {}),
              estimateVersionId: selected.estimateVersionId,
              estimateVersionNumber: selected.estimateVersionNumber,
              recipient:
                recipient === 'PRIMARY'
                  ? { kind: 'PRIMARY' }
                  : { kind: 'ADDITIONAL', legalEntityId: recipient },
              validityDays,
              scopeNote: scope || null,
              commercialConditions: conditions || null,
            }),
          }
        : undefined);
    if (!command) return;
    attempt.current = command;
    setState('sending');
    active.current?.abort();
    const request = new AbortController();
    active.current = request;
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (request.signal.aborted) return;
      const result = await api.request<unknown>(
        `/offers/opportunities/${encodeURIComponent(opportunityId)}/${offer ? 'versions/' : ''}from-approved-estimate`,
        {
          companyContextId: companyId,
          method: 'POST',
          signal: request.signal,
          headers: {
            'content-type': 'application/json',
            'idempotency-key': command.key,
          },
          body: command.body,
        },
      );
      if (request.signal.aborted) return;
      const denied = await reject(result, request.signal);
      if (request.signal.aborted) return;
      if (denied) {
        attempt.current = undefined;
        setSources([]);
        setSourceId('');
        setState('denied');
        return;
      }
      if (result.status === 'ok') {
        const created = readOffer(result.value);
        if (
          isIllustrativeOffer(created) ||
          !sameApprovedSource(created.version.priceSource, command.source) ||
          created.companyId !== companyId ||
          created.opportunityId !== opportunityId ||
          !matchesPreparedContent(created, command.expected)
        )
          throw new Error('Unexpected prepared source.');
        attempt.current = undefined;
        onOpen(false);
        onCreated(created);
      } else if (
        result.status === 'validation' ||
        result.status === 'notFound' ||
        result.status === 'conflict'
      ) {
        attempt.current = undefined;
        setState(
          result.status === 'validation'
            ? 'invalid'
            : result.status === 'conflict' &&
                conflictCode(result) === 'STALE_OFFER_REVISION'
              ? 'stale'
              : 'unavailable',
        );
      } else setState('uncertain');
    } catch {
      if (!request.signal.aborted) setState('uncertain');
    }
  }

  const feedback = preparationFeedback(state);
  if (!mayPrepareEstimateOffer(actor)) return null;
  if (!open)
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          onOpen(true);
          void load();
        }}
      >
        {copy('prepare')}
      </button>
    );
  return (
    <form
      className="estimate-offer-preparation"
      onSubmit={(event) => void submit(event)}
    >
      <p>{copy('notice')}</p>
      {state === 'loading' && <p role="status">{copy('loading')}</p>}
      {state === 'sending' && <p role="status">{content.preparing}</p>}
      {feedback && <p role="alert">{copy(feedback)}</p>}
      {state !== 'denied' && (
        <>
          <label htmlFor={`${fieldId}-source`}>{copy('source')}</label>
          <select
            id={`${fieldId}-source`}
            value={sourceId}
            disabled={locked || state === 'loading'}
            onChange={(event) => {
              attempt.current = undefined;
              setSourceId(event.target.value);
            }}
          >
            <option value="">{copy('choose')}</option>
            {sources.map((source) => (
              <option
                key={source.estimateVersionId}
                value={source.estimateVersionId}
              >
                {source.estimateVersionNumber} · {formatDecimal(source.amount)}{' '}
                {source.currency} · {formatDateTime(source.approvedAt)}
              </option>
            ))}
          </select>
          {state === 'ready' && sources.length === 0 && (
            <p role="status">{copy('empty')}</p>
          )}
          {cursor && (
            <button
              type="button"
              disabled={locked || state === 'loading'}
              onClick={() => void load(cursor)}
            >
              {copy('more')}
            </button>
          )}
          {selected && (
            <dl>
              <dt>{copy('amount')}</dt>
              <dd>
                {formatDecimal(selected.amount)} {selected.currency}
              </dd>
              <dt>{copy('approval')}</dt>
              <dd>
                {formatDateTime(selected.approvedAt)} ·{' '}
                {selected.approvalDecisionId}
              </dd>
            </dl>
          )}
          <label>
            {content.recipient}
            <select
              value={recipient}
              disabled={locked}
              onChange={(event) => {
                attempt.current = undefined;
                setRecipient(event.target.value);
              }}
            >
              <option value="PRIMARY">{clientLabel}</option>
              {entities.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {entity.legalName}
                </option>
              ))}
            </select>
          </label>
          <label>
            {content.validityDays}
            <input
              type="number"
              min="1"
              max="365"
              value={days}
              disabled={locked}
              onChange={(event) => {
                attempt.current = undefined;
                setDays(event.target.value);
              }}
            />
          </label>
          <label>
            {content.scopeNote}
            <textarea
              maxLength={2000}
              value={scope}
              disabled={locked}
              onChange={(event) => {
                attempt.current = undefined;
                setScope(event.target.value);
              }}
            />
          </label>
          <label>
            {content.commercialConditions}
            <textarea
              maxLength={4000}
              value={conditions}
              disabled={locked}
              onChange={(event) => {
                attempt.current = undefined;
                setConditions(event.target.value);
              }}
            />
          </label>
          <button
            type="submit"
            disabled={
              state === 'sending' ||
              state === 'loading' ||
              (!selected && state !== 'uncertain')
            }
          >
            {state === 'uncertain' ? copy('retry') : copy('create')}
          </button>
        </>
      )}
      <button
        type="button"
        disabled={locked}
        onClick={() => {
          active.current?.abort();
          attempt.current = undefined;
          setOpen(false);
          onOpen(false);
        }}
      >
        {copy('cancel')}
      </button>
    </form>
  );
}

function sameApprovedSource(
  one: InternalOfferPriceSource,
  two: InternalOfferPriceSource,
): boolean {
  return (
    one.kind === two.kind &&
    one.estimateId === two.estimateId &&
    one.estimateVersionId === two.estimateVersionId &&
    one.estimateVersionNumber === two.estimateVersionNumber &&
    one.approvalDecisionId === two.approvalDecisionId &&
    one.approvedAt === two.approvedAt &&
    one.amount === two.amount &&
    one.currency === two.currency &&
    one.taxTreatment === two.taxTreatment
  );
}

function matchesPreparedContent(
  offer: InternalOfferView,
  expected: Attempt['expected'],
): boolean {
  const version = offer.version;
  return (
    (expected.offerId === null || offer.id === expected.offerId) &&
    offer.revision === expected.revision &&
    version.versionNumber === expected.versionNumber &&
    version.decisionState === 'PENDING' &&
    (expected.recipient === 'PRIMARY'
      ? version.recipient.kind === 'PRIMARY'
      : version.recipient.kind === 'ADDITIONAL' &&
        version.recipient.additionalLegalEntityId === expected.recipient) &&
    version.validityDays === expected.validityDays &&
    version.scopeNote === expected.scopeNote &&
    version.commercialConditions === expected.commercialConditions
  );
}

function preparationFeedback(state: State) {
  switch (state) {
    case 'unavailable':
    case 'denied':
    case 'invalid':
    case 'stale':
    case 'uncertain':
      return state;
    case 'idle':
    case 'loading':
    case 'ready':
    case 'sending':
      return undefined;
    default: {
      const exhaustive: never = state;
      return exhaustive;
    }
  }
}
