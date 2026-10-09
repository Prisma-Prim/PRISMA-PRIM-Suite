import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { BrowserIdentity } from '../access-composition';
import {
  createAuthenticatedApiClient,
  conflictCode,
  type ApiResult,
} from '../api/authenticated-api-client';
import {
  readClientLegalEntityList,
  type ClientLegalEntity,
} from '../client/client-legal-entities-response';
import {
  readOfferSnapshotPage,
  type OfferSnapshotSummary,
} from '../offer/offer-response';
import { Select } from '../presentation/Select';
import { readContract, type ContractView } from './contract-response';
import { useContractDirectCopy } from './contract-direct.copy';
type Mode =
  | { kind: 'create'; clientId: string }
  | { kind: 'revise'; contract: Extract<ContractView, { origin: 'DIRECT' }> };
type Feedback =
  | 'idle'
  | 'running'
  | 'uncertain'
  | 'invalid'
  | 'denied'
  | 'unavailable'
  | 'stale'
  | 'conflict'
  | 'success';
export function ContractDirectEditor({
  identity,
  companyId,
  opportunityId,
  mode,
  protectedCommand,
  reject,
  onCreated,
  onProtectionChange,
}: {
  identity: BrowserIdentity;
  companyId: string;
  opportunityId: string;
  mode: Mode;
  protectedCommand: boolean;
  reject: (
    result: ApiResult<unknown>,
    signal: AbortSignal,
  ) => Promise<'unauthorized' | 'forbidden' | undefined>;
  onCreated: (contract?: ContractView) => void;
  onProtectionChange: (value: boolean) => void;
}) {
  const copy = useContractDirectCopy(),
    id = useId();
  const version = mode.kind === 'revise' ? mode.contract.version : null;
  const [scope, setScope] = useState(version?.scopeNote ?? ''),
    [commercial, setCommercial] = useState(version?.commercialConditions ?? ''),
    [reason, setReason] = useState(''),
    [start, setStart] = useState(version?.termStartsOn ?? ''),
    [end, setEnd] = useState(version?.termEndsOn ?? ''),
    [special, setSpecial] = useState(version?.specialConditions ?? ''),
    [party, setParty] = useState('PRIMARY'),
    [snapshot, setSnapshot] = useState('');
  const [choices, setChoices] = useState<{
      snapshots: OfferSnapshotSummary[];
      entities: ClientLegalEntity[];
      nextCursor: string | null;
    } | null>(null),
    [choiceState, setChoiceState] = useState<'loading' | 'ready' | 'error'>(
      'loading',
    ),
    [feedback, setFeedback] = useState<Feedback>('idle');
  const attempt = useRef<{ body: string; key: string } | undefined>(undefined),
    pending = useRef<AbortController | undefined>(undefined),
    choicePending = useRef<AbortController | undefined>(undefined);
  const frozen =
    protectedCommand || feedback === 'running' || feedback === 'uncertain';
  useEffect(() => {
    onProtectionChange(feedback === 'running' || feedback === 'uncertain');
  }, [feedback, onProtectionChange]);
  useEffect(() => {
    void loadChoices();
    return () => {
      pending.current?.abort();
      choicePending.current?.abort();
      onProtectionChange(false);
    };
  }, [identity, companyId, opportunityId]);
  async function loadChoices(cursor?: string) {
    choicePending.current?.abort();
    const controller = new AbortController();
    choicePending.current = controller;
    setChoiceState('loading');
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (controller.signal.aborted) return;
      const [prices, entities] = await Promise.all([
        api.request<unknown>(
          `/pricing/opportunities/${encodeURIComponent(opportunityId)}/snapshots?limit=25${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`,
          { companyContextId: companyId, signal: controller.signal },
        ),
        mode.kind === 'create' && !cursor
          ? api.request<unknown>(
              `/clients/${encodeURIComponent(mode.clientId)}/legal-entities`,
              { companyContextId: companyId, signal: controller.signal },
            )
          : Promise.resolve(null),
      ]);
      if (controller.signal.aborted) return;
      if (
        (await reject(prices, controller.signal)) ||
        (entities && (await reject(entities, controller.signal)))
      ) {
        if (!controller.signal.aborted) {
          setFeedback('denied');
          setChoiceState('error');
        }
        return;
      }
      if (controller.signal.aborted) return;
      if (prices.status !== 'ok' || (entities && entities.status !== 'ok'))
        throw new Error('Unavailable direct choices.');
      const page = prices.value;
      if (
        typeof page !== 'object' ||
        page === null ||
        ('nextCursor' in page &&
          page.nextCursor !== null &&
          typeof page.nextCursor !== 'string')
      )
        throw new Error('Invalid direct Snapshot cursor.');
      const nextCursor =
        'nextCursor' in page && typeof page.nextCursor === 'string'
          ? page.nextCursor
          : null;
      const snapshots = readOfferSnapshotPage(page),
        legalEntities =
          entities?.status === 'ok'
            ? readClientLegalEntityList(entities.value).legalEntities
            : [];
      setChoices((current) => ({
        snapshots:
          cursor && current
            ? [
                ...current.snapshots,
                ...snapshots.filter(
                  (item) =>
                    !current.snapshots.some((old) => old.id === item.id),
                ),
              ]
            : snapshots,
        entities: cursor && current ? current.entities : legalEntities,
        nextCursor,
      }));
      if (!cursor)
        setSnapshot(
          snapshots.some((item) => item.id === version?.pricingSnapshotId)
            ? (version?.pricingSnapshotId ?? '')
            : (snapshots[0]?.id ?? ''),
        );
      setChoiceState('ready');
    } catch {
      if (!controller.signal.aborted) setChoiceState('error');
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (
      protectedCommand ||
      feedback === 'running' ||
      ['denied', 'stale', 'unavailable', 'conflict', 'success'].includes(
        feedback,
      )
    )
      return;
    if (
      !attempt.current &&
      (choiceState !== 'ready' ||
        !snapshot ||
        !scope.trim() ||
        scope.length > 2000 ||
        commercial.length > 4000 ||
        special.length > 4000 ||
        (start && end && end < start) ||
        (mode.kind === 'create' && (!reason.trim() || reason.length > 500)))
    ) {
      setFeedback('invalid');
      return;
    }
    const command = attempt.current ?? {
      key: crypto.randomUUID(),
      body: JSON.stringify({
        pricingSnapshotId: snapshot,
        scopeNote: scope,
        commercialConditions: commercial || null,
        termStartsOn: start || null,
        termEndsOn: end || null,
        specialConditions: special || null,
        ...(mode.kind === 'create'
          ? {
              recipient:
                party === 'PRIMARY'
                  ? { kind: 'PRIMARY' }
                  : { kind: 'ADDITIONAL', legalEntityId: party },
              directReason: reason,
            }
          : { expectedContractRevision: mode.contract.revision }),
      }),
    };
    attempt.current = command;
    const controller = new AbortController();
    pending.current = controller;
    setFeedback('running');
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (controller.signal.aborted) return;
      const result = await api.request<unknown>(
        `/contracts/opportunities/${encodeURIComponent(opportunityId)}/${mode.kind === 'create' ? 'direct' : 'versions'}`,
        {
          method: 'POST',
          companyContextId: companyId,
          signal: controller.signal,
          headers: {
            'content-type': 'application/json',
            'idempotency-key': command.key,
          },
          body: command.body,
        },
      );
      if (controller.signal.aborted) return;
      const denied = await reject(result, controller.signal);
      if (controller.signal.aborted) return;
      if (denied) {
        attempt.current = undefined;
        setFeedback('denied');
        return;
      }
      if (result.status === 'ok') {
        let contract: ContractView | undefined;
        if (mode.kind === 'create') {
          contract = readContract(result.value);
          if (
            contract.origin !== 'DIRECT' ||
            contract.companyId !== companyId ||
            contract.opportunityId !== opportunityId ||
            contract.directReason !== reason
          )
            throw new Error('Invalid direct Contract result.');
        } else {
          const value = result.value;
          if (
            typeof value !== 'object' ||
            value === null ||
            !('contractId' in value) ||
            value.contractId !== mode.contract.id ||
            !('contractVersionId' in value) ||
            typeof value.contractVersionId !== 'string' ||
            !('revision' in value) ||
            value.revision !== mode.contract.revision + 1 ||
            !('versionNumber' in value) ||
            value.versionNumber !== mode.contract.version.versionNumber + 1 ||
            !('provisional' in value) ||
            value.provisional !== true
          )
            throw new Error('Invalid direct Version result.');
        }
        attempt.current = undefined;
        setFeedback('success');
        onCreated(contract);
        return;
      }
      if (result.status === 'validation') {
        attempt.current = undefined;
        setFeedback('invalid');
      } else if (result.status === 'notFound') {
        attempt.current = undefined;
        setFeedback('unavailable');
      } else if (result.status === 'conflict') {
        attempt.current = undefined;
        const code = conflictCode(result);
        setFeedback(
          code === 'STALE_CONTRACT_REVISION' ||
            code === 'CONTRACT_VERSION_SUPERSEDED'
            ? 'stale'
            : 'conflict',
        );
      } else setFeedback('uncertain');
    } catch {
      if (!controller.signal.aborted) setFeedback('uncertain');
    }
  }
  return (
    <section className="contract-revision" aria-label={copy('title')}>
      <h5>{copy('title')}</h5>
      {choiceState === 'loading' && <p role="status">{copy('loading')}</p>}
      {choiceState === 'error' && (
        <>
          <p role="alert">{copy('error')}</p>
          <button
            type="button"
            disabled={frozen}
            onClick={() => void loadChoices()}
          >
            {copy('retry')}
          </button>
        </>
      )}
      {choices && (
        <form onSubmit={(event) => void submit(event)}>
          {mode.kind === 'create' && (
            <>
              <label>
                {copy('party')}
                <Select
                  id={id + '-party'}
                  value={party}
                  options={[
                    { value: 'PRIMARY', label: copy('primary') },
                    ...choices.entities.map((item) => ({
                      value: item.id,
                      label: item.legalName,
                    })),
                  ]}
                  onValueChange={setParty}
                  disabled={frozen}
                />
              </label>
              <label>
                {copy('reason')}
                <textarea
                  value={reason}
                  maxLength={500}
                  required
                  disabled={frozen}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
            </>
          )}
          <label>
            {copy('snapshot')}
            <Select
              id={id + '-snapshot'}
              value={snapshot}
              options={choices.snapshots.map((item) => ({
                value: item.id,
                label: item.currency + ' · ' + item.total + ' · ' + item.id,
              }))}
              onValueChange={setSnapshot}
              disabled={frozen}
              required
            />
          </label>
          {choices.nextCursor && (
            <button
              type="button"
              disabled={frozen || choiceState === 'loading'}
              onClick={() => void loadChoices(choices.nextCursor ?? undefined)}
            >
              {copy('more')}
            </button>
          )}
          {choices.snapshots.length === 0 && <p>{copy('empty')}</p>}
          <label>
            {copy('scope')}
            <textarea
              value={scope}
              maxLength={2000}
              required
              disabled={frozen}
              onChange={(event) => setScope(event.target.value)}
            />
          </label>
          <label>
            {copy('commercial')}
            <textarea
              value={commercial}
              maxLength={4000}
              disabled={frozen}
              onChange={(event) => setCommercial(event.target.value)}
            />
          </label>
          <label>
            {copy('start')}
            <input
              type="date"
              value={start}
              disabled={frozen}
              onChange={(event) => setStart(event.target.value)}
            />
          </label>
          <label>
            {copy('end')}
            <input
              type="date"
              value={end}
              disabled={frozen}
              onChange={(event) => setEnd(event.target.value)}
            />
          </label>
          <label>
            {copy('special')}
            <textarea
              value={special}
              maxLength={4000}
              disabled={frozen}
              onChange={(event) => setSpecial(event.target.value)}
            />
          </label>
          <button
            type="submit"
            disabled={
              protectedCommand ||
              feedback === 'running' ||
              choiceState !== 'ready' ||
              choices.snapshots.length === 0 ||
              [
                'denied',
                'stale',
                'unavailable',
                'conflict',
                'success',
              ].includes(feedback)
            }
          >
            {copy(
              feedback === 'uncertain'
                ? 'retry'
                : feedback === 'running'
                  ? 'running'
                  : mode.kind === 'create'
                    ? 'create'
                    : 'revise',
            )}
          </button>
        </form>
      )}
      {feedback !== 'idle' && feedback !== 'running' && (
        <p role={feedback === 'success' ? 'status' : 'alert'}>
          {copy(feedback)}
        </p>
      )}
    </section>
  );
}
