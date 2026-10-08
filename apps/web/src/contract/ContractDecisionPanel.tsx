import { useEffect, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import {
  createAuthenticatedApiClient,
  conflictCode,
  type ApiResult,
} from '../api/authenticated-api-client';
import type { ContractView } from './contract-response';
import {
  readContractDecision,
  type ContractDecisionView,
} from './contract-decision-response';
import { useContractDecisionCopy } from './contract-decision.copy';
import { contractQualityLabels } from './contract.copy';
import { useInterfaceLocale } from '../localization/interface-locale';
type Feedback =
  | 'idle'
  | 'running'
  | 'uncertain'
  | 'invalid'
  | 'denied'
  | 'unavailable'
  | 'stale'
  | 'already'
  | 'errors'
  | 'warnings'
  | 'conflict'
  | 'success';
export function ContractDecisionPanel({
  identity,
  companyId,
  opportunityId,
  contract,
  mayDecide,
  protectedChecks,
  reject,
  onDecision,
  onProtectionChange,
}: {
  identity: BrowserIdentity;
  companyId: string;
  opportunityId: string;
  contract: ContractView;
  mayDecide: boolean;
  protectedChecks: boolean;
  reject: (
    result: ApiResult<unknown>,
    signal: AbortSignal,
  ) => Promise<'unauthorized' | 'forbidden' | undefined>;
  onDecision: (decision: ContractDecisionView) => void;
  onProtectionChange: (protectedCommand: boolean) => void;
}) {
  const copy = useContractDecisionCopy();
  const { locale } = useInterfaceLocale();
  const [feedback, setFeedback] = useState<Feedback>('idle');
  const [reason, setReason] = useState('');
  const [acknowledged, setAcknowledged] = useState<readonly string[]>([]);
  const attempt = useRef<
    { body: string; key: string; kind: 'approve' | 'reject' } | undefined
  >(undefined);
  const pending = useRef<AbortController | undefined>(undefined);
  const decision = contract.version.decision;
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
  const warnings =
    contract.version.latestQualityRun?.results.filter(
      (item) => item.status === 'WARNING',
    ) ?? [];
  const busy =
    feedback === 'running' || feedback === 'uncertain' || protectedChecks;
  async function execute(kind: 'approve' | 'reject') {
    if (
      !mayDecide ||
      decision ||
      feedback === 'running' ||
      protectedChecks ||
      ['denied', 'unavailable', 'stale', 'already'].includes(feedback)
    )
      return;
    const command = attempt.current ?? {
      kind,
      key: crypto.randomUUID(),
      body: JSON.stringify(
        kind === 'approve'
          ? {
              expectedContractRevision: contract.revision,
              acknowledgedWarningCodes: acknowledged.filter((code) =>
                warnings.some((item) => item.code === code),
              ),
            }
          : { expectedContractRevision: contract.revision, reason },
      ),
    };
    attempt.current = command;
    const request = new AbortController();
    pending.current = request;
    setFeedback('running');
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (request.signal.aborted) return;
      const result = await api.request<unknown>(
        `/contracts/opportunities/${encodeURIComponent(opportunityId)}/versions/${encodeURIComponent(contract.version.id)}/${command.kind}`,
        {
          method: 'POST',
          companyContextId: companyId,
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
        setFeedback('denied');
      } else if (result.status === 'ok') {
        const recorded = readContractDecision(
          result.value,
          contract.version.id,
          contract.version.termEndsOn,
        );
        if (
          recorded.kind !==
            (command.kind === 'approve' ? 'APPROVE' : 'REJECT') ||
          recorded.revision !== contract.revision + 1
        )
          throw new Error('Mismatched decision result.');
        attempt.current = undefined;
        setFeedback('success');
        onDecision(recorded);
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
          code === 'STALE_CONTRACT_REVISION'
            ? 'stale'
            : code === 'CONTRACT_VERSION_ALREADY_DECIDED'
              ? 'already'
              : code === 'QUALITY_CHECK_ERRORS'
                ? 'errors'
                : code === 'QUALITY_CHECK_WARNINGS_UNACKNOWLEDGED'
                  ? 'warnings'
                  : code === 'CONTRACT_VERSION_SUPERSEDED'
                    ? 'stale'
                    : 'conflict',
        );
      } else setFeedback('uncertain');
    } catch {
      if (!request.signal.aborted) setFeedback('uncertain');
    }
  }
  return (
    <section className="contract-decision" aria-label={copy('title')}>
      <h5>{copy('title')}</h5>
      <p>
        {copy(
          decision
            ? decision.kind === 'APPROVE'
              ? 'approved'
              : 'rejected'
            : 'pending',
        )}
      </p>
      {decision && (
        <dl>
          <dt>{copy('actor')}</dt>
          <dd>{decision.actorWorkspaceMembershipId}</dd>
          <dt>{copy('instant')}</dt>
          <dd>
            <time dateTime={decision.decidedAt}>
              {new Intl.DateTimeFormat(locale, {
                dateStyle: 'medium',
                timeStyle: 'medium',
                timeZone: 'UTC',
              }).format(new Date(decision.decidedAt))}
            </time>
          </dd>
          {decision.kind === 'REJECT' ? (
            <>
              <dt>{copy('reason')}</dt>
              <dd>{decision.reason}</dd>
            </>
          ) : (
            <>
              <dt>{copy('checksum')}</dt>
              <dd className="contract-checksum">
                {decision.representationChecksum}
              </dd>
              <dt>{copy('run')}</dt>
              <dd>{decision.qualityRun.id}</dd>
              {decision.acknowledgedWarningCodes.map((code) => (
                <dd key={code}>{code}</dd>
              ))}
            </>
          )}
        </dl>
      )}
      {feedback !== 'idle' && (
        <p
          role={
            feedback === 'running' || feedback === 'success'
              ? 'status'
              : 'alert'
          }
        >
          {copy(feedback)}
        </p>
      )}
      {!decision && mayDecide && (
        <>
          {warnings.map((item) => (
            <label className="contract-warning-acknowledgement" key={item.code}>
              <input
                type="checkbox"
                disabled={busy}
                checked={acknowledged.includes(item.code)}
                onChange={(event) =>
                  setAcknowledged((values) =>
                    event.target.checked
                      ? [...values, item.code]
                      : values.filter((code) => code !== item.code),
                  )
                }
              />
              {copy('acknowledge')}: {contractQualityLabels[item.code]}
            </label>
          ))}
          <label>
            {copy('reason')}
            <textarea
              value={reason}
              maxLength={500}
              disabled={busy}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          {feedback === 'uncertain' ? (
            <button
              type="button"
              disabled={protectedChecks}
              onClick={() => void execute(attempt.current?.kind ?? 'approve')}
            >
              {copy('retry')}
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={
                  busy ||
                  ['denied', 'unavailable', 'stale', 'already'].includes(
                    feedback,
                  )
                }
                onClick={() => void execute('approve')}
              >
                {copy('approve')}
              </button>
              <button
                type="button"
                disabled={
                  busy ||
                  ['denied', 'unavailable', 'stale', 'already'].includes(
                    feedback,
                  )
                }
                onClick={() => void execute('reject')}
              >
                {copy('reject')}
              </button>
            </>
          )}
        </>
      )}
    </section>
  );
}
