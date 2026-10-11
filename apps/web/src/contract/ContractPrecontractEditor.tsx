import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { BrowserIdentity } from '../access-composition';
import {
  createAuthenticatedApiClient,
  conflictCode,
  type ApiResult,
} from '../api/authenticated-api-client';
import { readContract } from './contract-response';
import { useContractPrecontractCopy } from './contract-precontract.copy';
type Feedback =
  | 'idle'
  | 'running'
  | 'uncertain'
  | 'invalid'
  | 'denied'
  | 'unavailable'
  | 'exists'
  | 'after'
  | 'conflict';
const TERMINAL: readonly Feedback[] = [
  'denied',
  'unavailable',
  'exists',
  'after',
  'conflict',
];
/** PRD 19.2 Precontract creation from the Accepted Offer before the Contract. */
export function ContractPrecontractEditor({
  identity,
  companyId,
  opportunityId,
  acceptedVersionId,
  protectedCommand,
  reject,
  onProtectionChange,
  onCreated,
}: {
  identity: BrowserIdentity;
  companyId: string;
  opportunityId: string;
  acceptedVersionId: string;
  protectedCommand: boolean;
  reject: (
    result: ApiResult<unknown>,
    signal: AbortSignal,
  ) => Promise<'unauthorized' | 'forbidden' | undefined>;
  onProtectionChange: (value: boolean) => void;
  onCreated: (contractId: string) => void;
}) {
  const copy = useContractPrecontractCopy();
  const [scope, setScope] = useState(''),
    [financial, setFinancial] = useState(''),
    [limits, setLimits] = useState(''),
    [start, setStart] = useState(''),
    [end, setEnd] = useState(''),
    [special, setSpecial] = useState(''),
    [feedback, setFeedback] = useState<Feedback>('idle');
  const pending = useRef<AbortController | undefined>(undefined),
    attempt = useRef<{ body: string; key: string } | undefined>(undefined);
  useEffect(() => {
    onProtectionChange(feedback === 'running' || feedback === 'uncertain');
  }, [feedback, onProtectionChange]);
  useEffect(
    () => () => {
      pending.current?.abort();
      onProtectionChange(false);
    },
    [onProtectionChange],
  );
  const locked =
    protectedCommand || feedback === 'running' || feedback === 'uncertain';
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (
      protectedCommand ||
      feedback === 'running' ||
      TERMINAL.includes(feedback)
    )
      return;
    if (
      !attempt.current &&
      ([scope, financial, limits].some(
        (value) => !value.trim() || value.length > 2000,
      ) ||
        !end ||
        (start && end < start) ||
        special.length > 4000)
    ) {
      setFeedback('invalid');
      return;
    }
    const command = attempt.current ?? {
      key: crypto.randomUUID(),
      body: JSON.stringify({
        kind: 'PRECONTRACT',
        acceptedOfferVersionId: acceptedVersionId,
        preliminaryWorkScope: scope,
        preliminaryFinancialConditions: financial,
        preliminaryLimits: limits,
        termStartsOn: start || null,
        termEndsOn: end,
        specialConditions: special || null,
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
        `/contracts/opportunities/${encodeURIComponent(opportunityId)}`,
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
      } else if (result.status === 'ok') {
        const created = readContract(result.value);
        if (
          created.kind !== 'PRECONTRACT' ||
          created.companyId !== companyId ||
          created.opportunityId !== opportunityId ||
          created.sourceOfferVersionId !== acceptedVersionId
        )
          throw new Error('Invalid created Precontract.');
        attempt.current = undefined;
        setFeedback('idle');
        onCreated(created.id);
      } else if (result.status === 'validation') {
        attempt.current = undefined;
        setFeedback('invalid');
      } else if (result.status === 'notFound') {
        attempt.current = undefined;
        setFeedback('unavailable');
      } else if (result.status === 'conflict') {
        attempt.current = undefined;
        const code = conflictCode(result);
        setFeedback(
          code === 'PRECONTRACT_AFTER_CONTRACT'
            ? 'after'
            : code === 'CONTRACT_ALREADY_EXISTS'
              ? 'exists'
              : 'conflict',
        );
      } else setFeedback('uncertain');
    } catch {
      if (!controller.signal.aborted) setFeedback('uncertain');
    }
  }
  return (
    <section className="contract-precontract" aria-label={copy('create')}>
      <h5>{copy('create')}</h5>
      <p>{copy('intro')}</p>
      <form onSubmit={(event) => void submit(event)}>
        <label>
          {copy('scope')}
          <textarea
            required
            maxLength={2000}
            value={scope}
            disabled={locked}
            onChange={(event) => setScope(event.target.value)}
          />
        </label>
        <label>
          {copy('financial')}
          <textarea
            required
            maxLength={2000}
            value={financial}
            disabled={locked}
            onChange={(event) => setFinancial(event.target.value)}
          />
        </label>
        <label>
          {copy('limits')}
          <textarea
            required
            maxLength={2000}
            value={limits}
            disabled={locked}
            onChange={(event) => setLimits(event.target.value)}
          />
        </label>
        <label>
          {copy('start')}
          <input
            type="date"
            value={start}
            disabled={locked}
            onChange={(event) => setStart(event.target.value)}
          />
        </label>
        <label>
          {copy('end')}
          <input
            type="date"
            required
            value={end}
            disabled={locked}
            onChange={(event) => setEnd(event.target.value)}
          />
        </label>
        <label>
          {copy('special')}
          <textarea
            maxLength={4000}
            value={special}
            disabled={locked}
            onChange={(event) => setSpecial(event.target.value)}
          />
        </label>
        <button
          type="submit"
          disabled={
            protectedCommand ||
            feedback === 'running' ||
            TERMINAL.includes(feedback)
          }
        >
          {copy(
            feedback === 'uncertain'
              ? 'retry'
              : feedback === 'running'
                ? 'running'
                : 'create',
          )}
        </button>
      </form>
      {feedback !== 'idle' && feedback !== 'running' && (
        <p role="alert">{copy(feedback)}</p>
      )}
    </section>
  );
}
