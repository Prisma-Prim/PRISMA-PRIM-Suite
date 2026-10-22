import { useContractRecordedValues } from './contract-recorded-values';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { BrowserIdentity } from '../access-composition';
import {
  createAuthenticatedApiClient,
  conflictCode,
  type ApiResult,
} from '../api/authenticated-api-client';
import { Select } from '../presentation/Select';
import {
  readOfferSnapshotPage,
  type OfferSnapshotSummary,
} from '../offer/offer-response';
import {
  contractPath,
  readContract,
  type ContractView,
} from './contract-response';
import { useContractAddendumCopy } from './contract-addendum.copy';
type Feedback =
  | 'idle'
  | 'running'
  | 'uncertain'
  | 'invalid'
  | 'denied'
  | 'stale'
  | 'unavailable'
  | 'conflict'
  | 'success';
export function ContractAddendumEditor({
  identity,
  companyId,
  opportunityId,
  contract,
  maySelectSnapshot,
  protectedCommand,
  reject,
  onProtectionChange,
  onCreated,
}: {
  identity: BrowserIdentity;
  companyId: string;
  opportunityId: string;
  contract: ContractView;
  maySelectSnapshot: boolean;
  protectedCommand: boolean;
  reject: (
    result: ApiResult<unknown>,
    signal: AbortSignal,
  ) => Promise<'unauthorized' | 'forbidden' | undefined>;
  onProtectionChange: (value: boolean) => void;
  onCreated: (contractId: string) => void;
}) {
  const { formatDecimal } = useContractRecordedValues();
  const copy = useContractAddendumCopy();
  const revising = contract.kind === 'ADDENDUM';
  const [summary, setSummary] = useState(
      revising ? (contract.version.changeSummary ?? '') : '',
    ),
    [end, setEnd] = useState(
      revising ? (contract.version.termEndsOn ?? '') : '',
    ),
    [snapshot, setSnapshot] = useState(
      maySelectSnapshot && revising
        ? (contract.version.pricingSnapshotId ?? '')
        : '',
    );
  const [snapshots, setSnapshots] = useState<OfferSnapshotSummary[]>([]),
    [snapshotState, setSnapshotState] = useState<
      'closed' | 'loading' | 'ready' | 'error'
    >('closed'),
    [feedback, setFeedback] = useState<Feedback>('idle'),
    [nextSnapshotCursor, setNextSnapshotCursor] = useState<string | null>(null);
  const pending = useRef<AbortController | undefined>(undefined),
    snapshotPending = useRef<AbortController | undefined>(undefined),
    attempt = useRef<{ body: string; key: string } | undefined>(undefined);
  useEffect(() => {
    onProtectionChange(feedback === 'running' || feedback === 'uncertain');
  }, [feedback, onProtectionChange]);
  useEffect(
    () => () => {
      pending.current?.abort();
      snapshotPending.current?.abort();
      onProtectionChange(false);
    },
    [onProtectionChange],
  );
  const locked =
    protectedCommand || feedback === 'running' || feedback === 'uncertain';
  async function loadSnapshots(cursor?: string) {
    if (!maySelectSnapshot || locked) return;
    snapshotPending.current?.abort();
    const controller = new AbortController();
    snapshotPending.current = controller;
    setSnapshotState('loading');
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (controller.signal.aborted) return;
      const result = await api.request<unknown>(
        `/pricing/opportunities/${encodeURIComponent(opportunityId)}/snapshots?limit=25${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        { companyContextId: companyId, signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      const denied = await reject(result, controller.signal);
      if (controller.signal.aborted) return;
      if (denied || result.status !== 'ok') {
        setSnapshotState('error');
        return;
      }
      const page = result.value;
      if (
        typeof page !== 'object' ||
        page === null ||
        ('nextCursor' in page &&
          page.nextCursor !== null &&
          typeof page.nextCursor !== 'string')
      )
        throw new Error('Invalid Snapshot cursor.');
      const items = readOfferSnapshotPage(page);
      setSnapshots((current) =>
        cursor
          ? [
              ...current,
              ...items.filter(
                (item) => !current.some((old) => old.id === item.id),
              ),
            ]
          : items,
      );
      setNextSnapshotCursor(
        'nextCursor' in page && typeof page.nextCursor === 'string'
          ? page.nextCursor
          : null,
      );
      setSnapshotState('ready');
    } catch {
      if (!controller.signal.aborted) setSnapshotState('error');
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
    if (!attempt.current && (!summary.trim() || summary.length > 4000)) {
      setFeedback('invalid');
      return;
    }
    const command = attempt.current ?? {
      key: crypto.randomUUID(),
      body: JSON.stringify({
        expectedContractRevision: contract.revision,
        changeSummary: summary,
        termEndsOn: end || null,
        pricingSnapshotId: snapshot || null,
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
        revising
          ? contractPath(opportunityId, contract) + '/versions'
          : `/contracts/opportunities/${encodeURIComponent(opportunityId)}/agreements/${encodeURIComponent(contract.id)}/addenda`,
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
        let id: string;
        if (revising) {
          const value = result.value;
          if (
            typeof value !== 'object' ||
            value === null ||
            !('contractId' in value) ||
            value.contractId !== contract.id ||
            !('revision' in value) ||
            value.revision !== contract.revision + 1 ||
            !('versionNumber' in value) ||
            value.versionNumber !== contract.version.versionNumber + 1 ||
            !('provisional' in value) ||
            value.provisional !== true
          )
            throw new Error('Invalid Addendum revision result.');
          id = contract.id;
        } else {
          const created = readContract(result.value);
          if (
            created.kind !== 'ADDENDUM' ||
            created.parentContractId !== contract.id ||
            created.companyId !== companyId ||
            created.opportunityId !== opportunityId
          )
            throw new Error('Invalid created Addendum target.');
          id = created.id;
        }
        attempt.current = undefined;
        setFeedback('success');
        onCreated(id);
      } else if (result.status === 'validation') {
        attempt.current = undefined;
        setFeedback('invalid');
      } else if (result.status === 'notFound') {
        attempt.current = undefined;
        setFeedback('unavailable');
      } else if (result.status === 'conflict') {
        attempt.current = undefined;
        setFeedback(
          conflictCode(result) === 'STALE_CONTRACT_REVISION'
            ? 'stale'
            : 'conflict',
        );
      } else setFeedback('uncertain');
    } catch {
      if (!controller.signal.aborted) setFeedback('uncertain');
    }
  }
  return (
    <section aria-label={copy(revising ? 'revise' : 'create')}>
      <h5>{copy(revising ? 'revise' : 'create')}</h5>
      <form onSubmit={(event) => void submit(event)}>
        <label>
          {copy('summary')}
          <textarea
            required
            maxLength={4000}
            value={summary}
            disabled={locked}
            onChange={(event) => setSummary(event.target.value)}
          />
        </label>
        <label>
          {copy('end')}
          <input
            type="date"
            value={end}
            disabled={locked}
            onChange={(event) => setEnd(event.target.value)}
          />
        </label>
        {maySelectSnapshot && (
          <>
            <button
              type="button"
              disabled={locked || snapshotState === 'loading'}
              onClick={() => void loadSnapshots()}
            >
              {copy('chooseSnapshot')}
            </button>
            <label>
              {copy('snapshot')}
              <Select
                id="addendum-snapshot"
                value={snapshot}
                disabled={locked}
                options={[
                  { value: '', label: copy('noSnapshot') },
                  ...(snapshot &&
                  !snapshots.some((item) => item.id === snapshot)
                    ? [{ value: snapshot, label: snapshot }]
                    : []),
                  ...snapshots.map((item) => ({
                    value: item.id,
                    label:
                      item.currency +
                      ' · ' +
                      formatDecimal(item.total) +
                      ' · ' +
                      item.id,
                  })),
                ]}
                onValueChange={setSnapshot}
              />
            </label>
            {nextSnapshotCursor && (
              <button
                type="button"
                disabled={locked || snapshotState === 'loading'}
                onClick={() => void loadSnapshots(nextSnapshotCursor)}
              >
                {copy('moreSnapshots')}
              </button>
            )}
            {snapshotState === 'error' && (
              <p role="alert">{copy('snapshotError')}</p>
            )}
          </>
        )}
        <button
          type="submit"
          disabled={
            protectedCommand ||
            feedback === 'running' ||
            ['denied', 'stale', 'unavailable', 'conflict', 'success'].includes(
              feedback,
            )
          }
        >
          {copy(
            feedback === 'uncertain'
              ? 'retry'
              : feedback === 'running'
                ? 'running'
                : revising
                  ? 'revise'
                  : 'create',
          )}
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
