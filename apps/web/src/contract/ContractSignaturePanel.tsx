import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { BrowserIdentity } from '../access-composition';
import {
  createAuthenticatedApiClient,
  conflictCode,
  type ApiResult,
} from '../api/authenticated-api-client';
import { useInterfaceLocale } from '../localization/interface-locale';
import type { ContractView } from './contract-response';
import {
  readContractSignature,
  type ContractSignatureView,
} from './contract-signature-response';
import { useContractSignatureCopy } from './contract-signature.copy';
import { contractQualityLabels } from './contract.copy';
type Feedback =
  | 'idle'
  | 'running'
  | 'uncertain'
  | 'invalid'
  | 'denied'
  | 'unavailable'
  | 'stale'
  | 'already'
  | 'notApproved'
  | 'errors'
  | 'warnings'
  | 'mismatch'
  | 'conflict'
  | 'success';
export function ContractSignaturePanel({
  identity,
  companyId,
  opportunityId,
  contract,
  mayRecord,
  protectedChecks,
  reject,
  onSignature,
  onProtectionChange,
}: {
  identity: BrowserIdentity;
  companyId: string;
  opportunityId: string;
  contract: ContractView;
  mayRecord: boolean;
  protectedChecks: boolean;
  reject: (
    result: ApiResult<unknown>,
    signal: AbortSignal,
  ) => Promise<'unauthorized' | 'forbidden' | undefined>;
  onSignature: (signature: ContractSignatureView) => void;
  onProtectionChange: (protectedCommand: boolean) => void;
}) {
  const copy = useContractSignatureCopy(),
    { locale } = useInterfaceLocale();
  const [feedback, setFeedback] = useState<Feedback>('idle');
  const [fields, setFields] = useState({
    providerSignatoryLabel: '',
    clientSignatoryLabel: '',
    providerSignedOn: '',
    clientSignedOn: '',
    note: '',
  });
  const [acknowledged, setAcknowledged] = useState<readonly string[]>([]);
  const pending = useRef<AbortController | undefined>(undefined),
    attempt = useRef<{ body: string; key: string } | undefined>(undefined);
  const { signature, decision } = contract.version;
  const eligible = mayRecord && decision?.kind === 'APPROVE' && !signature;
  const busy =
    feedback === 'running' || feedback === 'uncertain' || protectedChecks;
  const terminal = [
    'denied',
    'unavailable',
    'stale',
    'already',
    'notApproved',
    'mismatch',
    'conflict',
  ].includes(feedback);
  const warnings =
    contract.version.latestQualityRun?.results.filter(
      (result) =>
        result.status === 'WARNING' &&
        decision?.kind === 'APPROVE' &&
        !decision.acknowledgedWarningCodes.includes(result.code),
    ) ?? [];
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
  async function execute(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!eligible || feedback === 'running' || protectedChecks || terminal)
      return;
    const command = attempt.current ?? {
      key: crypto.randomUUID(),
      body: JSON.stringify({
        ...fields,
        expectedContractRevision: contract.revision,
        acknowledgedWarningCodes: acknowledged.filter((code) =>
          warnings.some((item) => item.code === code),
        ),
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
        `/contracts/opportunities/${encodeURIComponent(opportunityId)}/versions/${encodeURIComponent(contract.version.id)}/signature`,
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
        const recorded = readContractSignature(result.value, {
          versionId: contract.version.id,
          termEndsOn: contract.version.termEndsOn,
          approval: decision,
        });
        if (recorded.revision !== contract.revision + 1)
          throw new Error('Mismatched signature revision.');
        attempt.current = undefined;
        setFeedback('success');
        onSignature(recorded);
      } else if (result.status === 'validation') {
        attempt.current = undefined;
        setFeedback('invalid');
      } else if (result.status === 'notFound') {
        attempt.current = undefined;
        setFeedback('unavailable');
      } else if (result.status === 'conflict') {
        attempt.current = undefined;
        switch (conflictCode(result)) {
          case 'STALE_CONTRACT_REVISION':
          case 'CONTRACT_VERSION_SUPERSEDED':
            setFeedback('stale');
            break;
          case 'CONTRACT_VERSION_ALREADY_EXECUTED':
            setFeedback('already');
            break;
          case 'CONTRACT_VERSION_NOT_APPROVED':
            setFeedback('notApproved');
            break;
          case 'QUALITY_CHECK_ERRORS':
            setFeedback('errors');
            break;
          case 'QUALITY_CHECK_WARNINGS_UNACKNOWLEDGED':
            setFeedback('warnings');
            break;
          case 'REPRESENTATION_MISMATCH':
            setFeedback('mismatch');
            break;
          default:
            setFeedback('conflict');
        }
      } else setFeedback('uncertain');
    } catch {
      if (!controller.signal.aborted) setFeedback('uncertain');
    }
  }
  if (!signature && !eligible) return null;
  return (
    <section
      className="contract-signature contract-decision"
      aria-label={copy('title')}
    >
      <h5>{copy('title')}</h5>
      <p className="contract-banner">{copy('banner')}</p>
      {signature && (
        <>
          <p>{copy('executed')}</p>
          <dl>
            <dt>{copy('provider')}</dt>
            <dd>{signature.providerSignatoryLabel}</dd>
            <dt>{copy('providerDate')}</dt>
            <dd>
              <time dateTime={signature.providerSignedOn}>
                {signature.providerSignedOn}
              </time>
            </dd>
            <dt>{copy('client')}</dt>
            <dd>{signature.clientSignatoryLabel}</dd>
            <dt>{copy('clientDate')}</dt>
            <dd>
              <time dateTime={signature.clientSignedOn}>
                {signature.clientSignedOn}
              </time>
            </dd>
            {signature.note !== null && (
              <>
                <dt>{copy('note')}</dt>
                <dd>{signature.note}</dd>
              </>
            )}
            <dt>{copy('actor')}</dt>
            <dd>{signature.actorWorkspaceMembershipId}</dd>
            <dt>{copy('instant')}</dt>
            <dd>
              <time dateTime={signature.recordedAt}>
                {new Intl.DateTimeFormat(locale, {
                  dateStyle: 'medium',
                  timeStyle: 'medium',
                  timeZone: 'UTC',
                }).format(new Date(signature.recordedAt))}
              </time>
            </dd>
            <dt>{copy('checksum')}</dt>
            <dd className="contract-checksum">
              {signature.representationChecksum}
            </dd>
            <dt>{copy('run')}</dt>
            <dd>{signature.qualityRun.id}</dd>
            {signature.acknowledgedWarningCodes.map((code) => (
              <dd key={code}>{code}</dd>
            ))}
          </dl>
        </>
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
      {eligible && (
        <form onSubmit={(event) => void execute(event)}>
          <label>
            {copy('provider')}
            <input
              value={fields.providerSignatoryLabel}
              required
              disabled={busy || terminal}
              onChange={(event) =>
                setFields({
                  ...fields,
                  providerSignatoryLabel: event.target.value,
                })
              }
            />
          </label>
          <label>
            {copy('client')}
            <input
              value={fields.clientSignatoryLabel}
              required
              disabled={busy || terminal}
              onChange={(event) =>
                setFields({
                  ...fields,
                  clientSignatoryLabel: event.target.value,
                })
              }
            />
          </label>
          <label>
            {copy('providerDate')}
            <input
              type="date"
              min={decision?.decidedAt.slice(0, 10)}
              value={fields.providerSignedOn}
              required
              disabled={busy || terminal}
              onChange={(event) =>
                setFields({ ...fields, providerSignedOn: event.target.value })
              }
            />
          </label>
          <label>
            {copy('clientDate')}
            <input
              type="date"
              min={decision?.decidedAt.slice(0, 10)}
              value={fields.clientSignedOn}
              required
              disabled={busy || terminal}
              onChange={(event) =>
                setFields({ ...fields, clientSignedOn: event.target.value })
              }
            />
          </label>
          <label>
            {copy('note')}
            <textarea
              value={fields.note}
              disabled={busy || terminal}
              onChange={(event) =>
                setFields({ ...fields, note: event.target.value })
              }
            />
          </label>
          {warnings.map((item) => (
            <label className="contract-warning-acknowledgement" key={item.code}>
              <input
                type="checkbox"
                disabled={busy || terminal}
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
          {feedback === 'uncertain' ? (
            <button
              type="button"
              disabled={protectedChecks}
              onClick={() => void execute()}
            >
              {copy('retry')}
            </button>
          ) : (
            <button type="submit" disabled={busy || terminal}>
              {copy('record')}
            </button>
          )}
        </form>
      )}
    </section>
  );
}
