import { useModelOfferCopy } from './model-offer.copy';
import {
  declaredGross,
  readSelectedOfferModel,
  type ModelOfferView,
  type SelectedOfferModel,
} from './model-offer-response';
import { SelectedOfferModelContent } from './ModelOfferDetails';
import { exactRecord, text } from '../offer-model/offer-model-content';
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
} & (
  | { mode: 'INTERNAL' }
  | {
      mode: 'COMPANY_MODEL';
      model: SelectedOfferModel;
      financialDeclaration: NonNullable<
        ReturnType<typeof modelFormIntent>
      >['financialDeclaration'];
    }
);

export function mayPrepareEstimateOffer(actor: ActorContext): boolean {
  const company = actor.activeCompany;
  return (
    (company?.offerPermissionSetVersion === 'v2' ||
      company?.offerPermissionSetVersion === 'v3') &&
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

export function mayPrepareModelOffer(actor: ActorContext): boolean {
  const company = actor.activeCompany;
  return (
    mayPrepareEstimateOffer(actor) &&
    company?.offerPermissionSetVersion === 'v3' &&
    company.offerPermissions?.includes('commercial.offer.model.select') ===
      true &&
    company.offerPermissions.includes('commercial.offer.model_based.prepare')
  );
}

type PreparationProps = {
  mode?: 'INTERNAL' | 'COMPANY_MODEL';
  actor: ActorContext;
  identity: BrowserIdentity;
  opportunityId: string;
  clientId: string;
  clientLabel: string;
  offer?: OfferReadView;
  reject: RejectionHandler;
  onCreated: (offer: InternalOfferView | ModelOfferView) => void;
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
  mode = 'INTERNAL',
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
  const modelCopy = useModelOfferCopy();
  const permitted =
    mode === 'COMPANY_MODEL'
      ? mayPrepareModelOffer(actor)
      : mayPrepareEstimateOffer(actor);
  const [model, setModel] = useState<SelectedOfferModel>();
  const [modelChosen, setModelChosen] = useState(false);
  const [netConfirmed, setNetConfirmed] = useState(false);
  const [taxAmount, setTaxAmount] = useState('');
  const [taxLabel, setTaxLabel] = useState('');
  const [basis, setBasis] = useState('');
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
    if (!companyId || !permitted) return;
    active.current?.abort();
    const request = new AbortController();
    active.current = request;
    setState('loading');
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (request.signal.aborted) return;
      const [history, legal, selectedModel] = await Promise.all([
        api.request<unknown>(
          `/opportunities/${encodeURIComponent(opportunityId)}/profitability-estimates?limit=25${nextCursor ? '&cursor=' + encodeURIComponent(nextCursor) : ''}`,
          { companyContextId: companyId, signal: request.signal },
        ),
        api.request<unknown>(
          `/clients/${encodeURIComponent(clientId)}/legal-entities`,
          { companyContextId: companyId, signal: request.signal },
        ),
        mode === 'COMPANY_MODEL'
          ? api.request<unknown>('/offer-models/consulting-ro/for-offer', {
              companyContextId: companyId,
              signal: request.signal,
            })
          : Promise.resolve(null),
      ]);
      if (request.signal.aborted) return;
      const denied =
        (await reject(history, request.signal)) ||
        (await reject(legal, request.signal)) ||
        (selectedModel && (await reject(selectedModel, request.signal)));
      if (request.signal.aborted) return;
      if (denied) {
        setSources([]);
        setSourceId('');
        setModel(undefined);
        setModelChosen(false);
        setNetConfirmed(false);
        setState('denied');
        return;
      }
      if (
        history.status !== 'ok' ||
        legal.status !== 'ok' ||
        (selectedModel && selectedModel.status !== 'ok')
      ) {
        setState('unavailable');
        return;
      }
      if (selectedModel?.status === 'ok') {
        const projection = exactRecord(selectedModel.value, ['selection']);
        setModel(
          projection.selection === null
            ? undefined
            : readSelectedOfferModel(projection.selection),
        );
        setModelChosen(false);
        setNetConfirmed(false);
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
    if (!companyId || (locked && state !== 'uncertain') || !permitted) return;
    const validityDays = Number(days);
    const modelIntent =
      mode === 'COMPANY_MODEL'
        ? modelFormIntent({
            model,
            modelChosen,
            netConfirmed,
            taxAmount,
            taxLabel,
            basis,
          })
        : undefined;
    if (!attempt.current && mode === 'COMPANY_MODEL' && !modelIntent) {
      setState('invalid');
      return;
    }
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
            ...(modelIntent
              ? { mode: 'COMPANY_MODEL' as const, ...modelIntent }
              : { mode: 'INTERNAL' as const }),
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
              ...(modelIntent
                ? {
                    modelVersionId: modelIntent.model.versionId,
                    modelVersionNumber: modelIntent.model.versionNumber,
                    financialDeclaration: modelIntent.financialDeclaration,
                  }
                : {}),
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
        `/offers/opportunities/${encodeURIComponent(opportunityId)}/${offer ? 'versions/' : ''}from-approved-${command.mode === 'COMPANY_MODEL' ? 'model' : 'estimate'}`,
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
        setModel(undefined);
        setModelChosen(false);
        setNetConfirmed(false);
        setState('denied');
        return;
      }
      if (result.status === 'ok') {
        const created = readOffer(result.value);
        if (
          isIllustrativeOffer(created) ||
          !sameApprovedSource(created.version.priceSource, command.source) ||
          !matchesPreparationMode(created, command) ||
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
  if (!permitted) return null;
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
        {mode === 'COMPANY_MODEL' ? modelCopy('prepare') : copy('prepare')}
      </button>
    );
  return (
    <form
      className="estimate-offer-preparation"
      onSubmit={(event) => void submit(event)}
    >
      <p>{mode === 'COMPANY_MODEL' ? modelCopy('notice') : copy('notice')}</p>
      {state === 'loading' && <p role="status">{copy('loading')}</p>}
      {state === 'sending' && <p role="status">{content.preparing}</p>}
      {feedback && <p role="alert">{copy(feedback)}</p>}
      {state !== 'denied' && (
        <>
          {mode === 'COMPANY_MODEL' &&
            (model ? (
              <>
                <SelectedOfferModelContent model={model} />
                <label className="model-offer-confirmation">
                  <input
                    type="checkbox"
                    checked={modelChosen}
                    disabled={locked}
                    onChange={(event) => {
                      attempt.current = undefined;
                      setModelChosen(event.target.checked);
                      setNetConfirmed(false);
                    }}
                  />
                  {modelCopy('chooseModel')}
                </label>
              </>
            ) : (
              state === 'ready' && <p role="status">{modelCopy('noModel')}</p>
            ))}
          <label htmlFor={`${fieldId}-source`}>{copy('source')}</label>
          <select
            id={`${fieldId}-source`}
            value={sourceId}
            disabled={locked || state === 'loading'}
            onChange={(event) => {
              attempt.current = undefined;
              setSourceId(event.target.value);
              setNetConfirmed(false);
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
          {mode === 'COMPANY_MODEL' && (
            <fieldset disabled={locked}>
              <label className="model-offer-confirmation">
                <input
                  type="checkbox"
                  checked={netConfirmed}
                  onChange={(event) => {
                    attempt.current = undefined;
                    setNetConfirmed(event.target.checked);
                  }}
                />
                {modelCopy('netConfirmed')}
              </label>
              <label>
                {modelCopy('tax')}
                <input
                  type="text"
                  inputMode="decimal"
                  value={taxAmount}
                  onChange={(event) => {
                    attempt.current = undefined;
                    setTaxAmount(event.target.value);
                  }}
                />
              </label>
              <label>
                {modelCopy('taxLabel')}
                <textarea
                  maxLength={200}
                  value={taxLabel}
                  onChange={(event) => {
                    attempt.current = undefined;
                    setTaxLabel(event.target.value);
                  }}
                />
              </label>
              <label>
                {modelCopy('basis')}
                <textarea
                  maxLength={2000}
                  value={basis}
                  onChange={(event) => {
                    attempt.current = undefined;
                    setBasis(event.target.value);
                  }}
                />
              </label>
              {selected && /^[0-9]+\.[0-9]{2}$/u.test(taxAmount) && (
                <dl>
                  <dt>{modelCopy('net')}</dt>
                  <dd>
                    {formatDecimal(selected.amount)} {selected.currency}
                  </dd>
                  <dt>{modelCopy('tax')}</dt>
                  <dd>
                    {formatDecimal(taxAmount)} {selected.currency}
                  </dd>
                  <dt>{modelCopy('gross')}</dt>
                  <dd>
                    {formatDecimal(declaredGross(selected.amount, taxAmount))}{' '}
                    {selected.currency}
                  </dd>
                </dl>
              )}
            </fieldset>
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
            {state === 'uncertain'
              ? copy('retry')
              : mode === 'COMPANY_MODEL'
                ? modelCopy('create')
                : copy('create')}
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
  one: Omit<InternalOfferPriceSource, 'taxTreatment'>,
  two: Omit<InternalOfferPriceSource, 'taxTreatment'>,
): boolean {
  return (
    one.kind === two.kind &&
    one.estimateId === two.estimateId &&
    one.estimateVersionId === two.estimateVersionId &&
    one.estimateVersionNumber === two.estimateVersionNumber &&
    one.approvalDecisionId === two.approvalDecisionId &&
    one.approvedAt === two.approvedAt &&
    one.amount === two.amount &&
    one.currency === two.currency
  );
}

function matchesPreparedContent(
  offer: InternalOfferView | ModelOfferView,
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

function modelFormIntent(input: {
  model: SelectedOfferModel | undefined;
  modelChosen: boolean;
  netConfirmed: boolean;
  taxAmount: string;
  taxLabel: string;
  basis: string;
}) {
  if (
    !input.model ||
    !input.modelChosen ||
    !input.netConfirmed ||
    !/^[0-9]+\.[0-9]{2}$/u.test(input.taxAmount)
  )
    return;
  try {
    return {
      model: input.model,
      financialDeclaration: {
        kind: 'NET_PLUS_DECLARED_TAX' as const,
        netAmountConfirmed: true as const,
        taxAmount: input.taxAmount,
        taxLabel: text(input.taxLabel, 200),
        basis: text(input.basis, 2_000),
      },
    };
  } catch {
    return;
  }
}
function matchesPreparationMode(
  offer: InternalOfferView | ModelOfferView,
  command: Attempt,
) {
  if (command.mode === 'INTERNAL')
    return offer.version.provenance === 'APPROVED_ESTIMATE_INTERNAL_DRAFT';
  if (offer.version.provenance !== 'COMPANY_MODEL_ESTIMATE') return false;
  const actual = offer.version.financialDeclaration;
  return (
    JSON.stringify(offer.version.modelSource) ===
      JSON.stringify(command.model) &&
    actual.netAmount === command.source.amount &&
    actual.taxAmount === command.financialDeclaration.taxAmount &&
    actual.taxLabel === command.financialDeclaration.taxLabel &&
    actual.basis === command.financialDeclaration.basis
  );
}
