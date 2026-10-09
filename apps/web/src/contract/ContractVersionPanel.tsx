import { contractPath } from './contract-response';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { BrowserIdentity } from '../access-composition';
import {
  createAuthenticatedApiClient,
  conflictCode,
  type ApiResult,
} from '../api/authenticated-api-client';
import type { ContractView } from './contract-response';
import { useContractVersionCopy } from './contract-version.copy';
type Feedback =
  | 'idle'
  | 'running'
  | 'uncertain'
  | 'invalid'
  | 'denied'
  | 'unavailable'
  | 'stale'
  | 'executed'
  | 'conflict'
  | 'success';
export function ContractVersionPanel({
  identity,
  companyId,
  opportunityId,
  contract,
  mayRevise,
  protectedCommand,
  reject,
  onCreated,
  onProtectionChange,
}: {
  identity: BrowserIdentity;
  companyId: string;
  opportunityId: string;
  contract: ContractView;
  mayRevise: boolean;
  protectedCommand: boolean;
  reject: (
    result: ApiResult<unknown>,
    signal: AbortSignal,
  ) => Promise<'unauthorized' | 'forbidden' | undefined>;
  onCreated: () => void;
  onProtectionChange: (value: boolean) => void;
}) {
  const copy = useContractVersionCopy();
  const [feedback, setFeedback] = useState<Feedback>('idle');
  const [start, setStart] = useState(contract.version.termStartsOn ?? ''),
    [end, setEnd] = useState(contract.version.termEndsOn ?? ''),
    [conditions, setConditions] = useState(
      contract.version.specialConditions ?? '',
    );
  const attempt = useRef<{ body: string; key: string } | undefined>(undefined),
    pending = useRef<AbortController | undefined>(undefined);
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
  const frozen =
    feedback === 'running' || feedback === 'uncertain' || protectedCommand;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (
      !mayRevise ||
      protectedCommand ||
      feedback === 'running' ||
      [
        'denied',
        'unavailable',
        'stale',
        'executed',
        'conflict',
        'success',
      ].includes(feedback)
    )
      return;
    if (
      !attempt.current &&
      ((start && end && end < start) || conditions.length > 4000)
    ) {
      setFeedback('invalid');
      return;
    }
    const command = attempt.current ?? {
      key: crypto.randomUUID(),
      body: JSON.stringify({
        expectedContractRevision: contract.revision,
        termStartsOn: start || null,
        termEndsOn: end || null,
        specialConditions: conditions || null,
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
        `${contractPath(opportunityId, contract)}/versions`,
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
        const value = result.value;
        if (
          typeof value !== 'object' ||
          value === null ||
          !('contractId' in value) ||
          value.contractId !== contract.id ||
          !('contractVersionId' in value) ||
          typeof value.contractVersionId !== 'string' ||
          !('revision' in value) ||
          value.revision !== contract.revision + 1 ||
          !('versionNumber' in value) ||
          value.versionNumber !== contract.version.versionNumber + 1 ||
          !('provisional' in value) ||
          value.provisional !== true
        )
          throw new Error('Invalid Contract Version result.');
        attempt.current = undefined;
        setFeedback('success');
        onCreated();
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
          code === 'CONTRACT_EXECUTED'
            ? 'executed'
            : code === 'STALE_CONTRACT_REVISION' ||
                code === 'CONTRACT_VERSION_SUPERSEDED'
              ? 'stale'
              : 'conflict',
        );
      } else setFeedback('uncertain');
    } catch {
      if (!controller.signal.aborted) setFeedback('uncertain');
    }
  }
  if (
    !mayRevise ||
    contract.version.supersededByVersionId ||
    contract.version.executionState === 'EXECUTED'
  )
    return null;
  return (
    <section className="contract-revision" aria-label={copy('title')}>
      <h5>{copy('title')}</h5>
      <form onSubmit={(event) => void submit(event)}>
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
          {copy('conditions')}
          <textarea
            value={conditions}
            disabled={frozen}
            onChange={(event) => setConditions(event.target.value)}
          />
        </label>
        <button
          type="submit"
          disabled={
            feedback === 'running' ||
            protectedCommand ||
            [
              'denied',
              'unavailable',
              'stale',
              'executed',
              'conflict',
              'success',
            ].includes(feedback)
          }
        >
          {feedback === 'uncertain'
            ? copy('retry')
            : feedback === 'running'
              ? copy('running')
              : copy('create')}
        </button>
      </form>
      {feedback !== 'idle' && feedback !== 'running' && (
        <p role={feedback === 'success' ? 'status' : 'alert'}>
          {copy(feedback)}
        </p>
      )}
    </section>
  );
}
