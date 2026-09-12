import { useCallback, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import type {
  ApiResult,
  ClientUnionConflictCode,
} from '../api/authenticated-api-client';
import {
  handleAuthenticatedAccessRejection,
  runLatestAuthenticatedRequest,
} from '../api/latest-authenticated-request';
import type { ClientContact } from './ClientContactEditor';
import { clientWorkspaceCopy as copy } from './client-workspace.copy';
import { resolveRetryCommand, type RetryCommand } from './client-command';

const SELECTABLE_FIELDS = [
  'displayName',
  'address',
  'telephone',
  'generalEmail',
  'businessActivity',
] as const;

type SelectableField = (typeof SELECTABLE_FIELDS)[number];

const FIELD_LABELS: Record<SelectableField, string> = {
  displayName: copy.displayNameLabel,
  address: copy.addressLabel,
  telephone: copy.telephoneLabel,
  generalEmail: copy.generalEmailLabel,
  businessActivity: copy.businessActivityLabel,
};

interface ComparedDossier {
  id: string;
  displayName: string;
  taxId: string | null;
  address: string | null;
  telephone: string | null;
  generalEmail: string | null;
  businessActivity: string | null;
  contacts: ClientContact[];
  version: number;
}

interface Comparison {
  comparisonReference: string;
  normalizedIdentifier: string;
  clients: [ComparedDossier, ComparedDossier];
  affectedCompanies: { id: string; displayName: string }[];
  differingFields: SelectableField[];
}

interface UnionOperation {
  unionOperationId: string;
  status: 'confirmed' | 'reversed';
  canonicalClientAccountId: string;
  supersededClientAccountId: string;
  contactCount: number;
}

type PanelState =
  | { status: 'idle' }
  | { status: 'comparing' }
  | { status: 'comparison'; comparison: Comparison }
  | { status: 'uniting'; comparison: Comparison }
  | { status: 'united'; operation: UnionOperation }
  | { status: 'reversing'; operation: UnionOperation }
  | { status: 'reversed'; operation: UnionOperation };

type PanelNotice =
  | { kind: 'none' }
  | { kind: 'validation'; message: string }
  | { kind: 'failure'; message: string };

export function ClientUnionPanel({
  companyContextId,
  identity,
  clients,
  onCompanyContextRejected,
  onActorRevalidated = () => undefined,
  onWorkspaceAccessRejected = () => undefined,
  onActivityRecorded,
  onClientsChanged,
}: {
  companyContextId: string;
  identity: BrowserIdentity;
  clients: { id: string; displayName: string }[];
  onCompanyContextRejected: (companyContextId: string) => void;
  onActorRevalidated?: (actor: ActorContext) => Promise<void> | void;
  onWorkspaceAccessRejected?: () => Promise<void> | void;
  onActivityRecorded: () => Promise<void>;
  onClientsChanged: () => Promise<void>;
}) {
  const [state, setState] = useState<PanelState>({ status: 'idle' });
  const [notice, setNotice] = useState<PanelNotice>({ kind: 'none' });
  const [firstClientId, setFirstClientId] = useState('');
  const [secondClientId, setSecondClientId] = useState('');
  const [canonicalClientId, setCanonicalClientId] = useState('');
  const [fieldSelections, setFieldSelections] = useState<
    Partial<Record<SelectableField, string>>
  >({});
  const [confirmedCompanyIds, setConfirmedCompanyIds] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [reversalReason, setReversalReason] = useState('');
  const pendingCompare = useRef<AbortController | undefined>(undefined);
  const pendingUnion = useRef<AbortController | undefined>(undefined);
  const pendingReversal = useRef<AbortController | undefined>(undefined);
  const unionCommand = useRef<RetryCommand | undefined>(undefined);
  const reversalCommand = useRef<RetryCommand | undefined>(undefined);
  const rejectCompanyContext = useRef(onCompanyContextRejected);
  rejectCompanyContext.current = onCompanyContextRejected;
  const acceptRevalidatedActor = useRef(onActorRevalidated);
  acceptRevalidatedActor.current = onActorRevalidated;
  const rejectWorkspaceAccess = useRef(onWorkspaceAccessRejected);
  rejectWorkspaceAccess.current = onWorkspaceAccessRejected;

  const handleAccessRejection = useCallback(
    async (result: ApiResult<unknown>, signal: AbortSignal) => {
      const rejection = await handleAuthenticatedAccessRejection({
        result,
        identity,
        companyContextId,
        onCompanyContextRejected: (rejectedCompanyId) =>
          rejectCompanyContext.current(rejectedCompanyId),
        onActorRevalidated: (actor) => acceptRevalidatedActor.current(actor),
        onWorkspaceAccessRejected: () => rejectWorkspaceAccess.current(),
        signal,
      });
      return signal.aborted || rejection !== undefined;
    },
    [companyContextId, identity],
  );

  function resetComparison() {
    setCanonicalClientId('');
    setFieldSelections({});
    setConfirmedCompanyIds([]);
    setReason('');
    setReversalReason('');
    unionCommand.current = undefined;
    reversalCommand.current = undefined;
  }

  async function compareDossiers(event: React.FormEvent) {
    event.preventDefault();
    if (!firstClientId || !secondClientId || firstClientId === secondClientId) {
      setNotice({
        kind: 'validation',
        message: copy.unionSelectionRequired,
      });
      return;
    }
    setNotice({ kind: 'none' });
    resetComparison();
    setState({ status: 'comparing' });
    await runLatestAuthenticatedRequest({
      pending: pendingCompare,
      identity,
      execute: (api, signal) =>
        api.request<unknown>('/client-union-comparisons', {
          method: 'POST',
          companyContextId,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            clientAccountIds: [firstClientId, secondClientId],
          }),
          signal,
        }),
      async onResult(result, signal) {
        if (await handleAccessRejection(result, signal)) return;
        if (result.status === 'notFound') {
          setState({ status: 'idle' });
          setNotice({ kind: 'failure', message: copy.unionUnavailable });
          return;
        }
        if (result.status !== 'ok') {
          setState({ status: 'idle' });
          setNotice({ kind: 'failure', message: copy.unionRetry });
          return;
        }
        const comparison = readComparison(result.value);
        if (comparison === 'remediation') {
          setState({ status: 'idle' });
          setNotice({ kind: 'failure', message: copy.unionRemediation });
          return;
        }
        if (!comparison) {
          setState({ status: 'idle' });
          setNotice({ kind: 'failure', message: copy.unionRetry });
          return;
        }
        setCanonicalClientId(comparison.clients[0].id);
        setState({ status: 'comparison', comparison });
      },
      onError: () => {
        setState({ status: 'idle' });
        setNotice({ kind: 'failure', message: copy.unionRetry });
      },
    });
  }

  async function confirmUnion(comparison: Comparison) {
    if (!reason.trim()) {
      setNotice({ kind: 'validation', message: copy.unionReasonRequired });
      return;
    }
    const affectedCompanyIds = comparison.affectedCompanies.map(
      (company) => company.id,
    );
    if (
      affectedCompanyIds.length !== confirmedCompanyIds.length ||
      !affectedCompanyIds.every((companyId) =>
        confirmedCompanyIds.includes(companyId),
      )
    ) {
      setNotice({ kind: 'validation', message: copy.unionCompaniesRequired });
      return;
    }
    const missingSelection = comparison.differingFields.find(
      (field) => !fieldSelections[field],
    );
    if (missingSelection) {
      setNotice({
        kind: 'validation',
        message: copy.unionDifferencesRequireReview,
      });
      return;
    }

    const serializedBody = JSON.stringify({
      comparisonReference: comparison.comparisonReference,
      canonicalClientAccountId: canonicalClientId,
      fieldSelections,
      reason: reason.trim(),
      confirmedCompanyIds: affectedCompanyIds,
    });
    const command = resolveRetryCommand(serializedBody, unionCommand.current);
    unionCommand.current = command;
    setNotice({ kind: 'none' });
    setState({ status: 'uniting', comparison });
    await runLatestAuthenticatedRequest({
      pending: pendingUnion,
      identity,
      execute: (api, signal) =>
        api.request<unknown>('/client-unions', {
          method: 'POST',
          companyContextId,
          headers: {
            'content-type': 'application/json',
            'idempotency-key': command.idempotencyKey,
          },
          body: command.serializedBody,
          signal,
        }),
      async onResult(result, signal) {
        if (await handleAccessRejection(result, signal)) return;
        if (result.status !== 'ok') {
          setState({ status: 'comparison', comparison });
          setNotice({
            kind: 'failure',
            message: unionFailureMessage(result),
          });
          return;
        }
        const operation = readOperation(result.value);
        if (!operation) {
          setState({ status: 'comparison', comparison });
          setNotice({ kind: 'failure', message: copy.unionRetry });
          return;
        }
        setState({ status: 'united', operation });
        void onActivityRecorded();
        await onClientsChanged();
      },
      onError: () => {
        setState({ status: 'comparison', comparison });
        setNotice({ kind: 'failure', message: copy.unionRetry });
      },
    });
  }

  async function reverseUnion(operation: UnionOperation) {
    if (!reversalReason.trim()) {
      setNotice({ kind: 'validation', message: copy.unionReasonRequired });
      return;
    }
    const serializedBody = JSON.stringify({ reason: reversalReason.trim() });
    const command = resolveRetryCommand(
      serializedBody,
      reversalCommand.current,
    );
    reversalCommand.current = command;
    setNotice({ kind: 'none' });
    setState({ status: 'reversing', operation });
    await runLatestAuthenticatedRequest({
      pending: pendingReversal,
      identity,
      execute: (api, signal) =>
        api.request<unknown>(
          `/client-unions/${encodeURIComponent(operation.unionOperationId)}/reversal`,
          {
            method: 'POST',
            companyContextId,
            headers: {
              'content-type': 'application/json',
              'idempotency-key': command.idempotencyKey,
            },
            body: command.serializedBody,
            signal,
          },
        ),
      async onResult(result, signal) {
        if (await handleAccessRejection(result, signal)) return;
        if (result.status !== 'ok') {
          setState({ status: 'united', operation });
          setNotice({
            kind: 'failure',
            message: unionFailureMessage(result),
          });
          return;
        }
        setState({
          status: 'reversed',
          operation: { ...operation, status: 'reversed' },
        });
        void onActivityRecorded();
        await onClientsChanged();
      },
      onError: () => {
        setState({ status: 'united', operation });
        setNotice({ kind: 'failure', message: copy.unionRetry });
      },
    });
  }

  const comparison =
    state.status === 'comparison' || state.status === 'uniting'
      ? state.comparison
      : undefined;
  const operation =
    state.status === 'united' ||
    state.status === 'reversing' ||
    state.status === 'reversed'
      ? state.operation
      : undefined;

  return (
    <section className="client-union" aria-labelledby="client-union-title">
      <h3 id="client-union-title">{copy.unionTitle}</h3>
      <p>{copy.unionDescription}</p>

      <form onSubmit={(event) => void compareDossiers(event)} noValidate>
        <label htmlFor="client-union-first">{copy.unionSelectLabel(1)}</label>
        <select
          id="client-union-first"
          value={firstClientId}
          onChange={(event) => setFirstClientId(event.target.value)}
        >
          <option value="">{copy.unionSelectPlaceholder}</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.displayName}
            </option>
          ))}
        </select>
        <label htmlFor="client-union-second">{copy.unionSelectLabel(2)}</label>
        <select
          id="client-union-second"
          value={secondClientId}
          onChange={(event) => setSecondClientId(event.target.value)}
        >
          <option value="">{copy.unionSelectPlaceholder}</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.displayName}
            </option>
          ))}
        </select>
        <button type="submit" disabled={state.status === 'comparing'}>
          {state.status === 'comparing'
            ? copy.unionComparing
            : copy.unionCompare}
        </button>
      </form>

      {notice.kind !== 'none' && <p role="alert">{notice.message}</p>}

      {comparison && (
        <div>
          <h4>{copy.unionComparisonTitle}</h4>
          <fieldset>
            <legend>{copy.unionCanonicalLegend}</legend>
            {comparison.clients.map((client) => (
              <label
                key={client.id}
                htmlFor={`client-union-canonical-${client.id}`}
              >
                <input
                  id={`client-union-canonical-${client.id}`}
                  type="radio"
                  name="client-union-canonical"
                  value={client.id}
                  checked={canonicalClientId === client.id}
                  onChange={() => setCanonicalClientId(client.id)}
                />
                {client.displayName}
              </label>
            ))}
          </fieldset>

          <p>{copy.unionDifferingFieldsHint}</p>
          <table>
            <thead>
              <tr>
                <th scope="col">{copy.unionFieldColumn}</th>
                {comparison.clients.map((client) => (
                  <th scope="col" key={client.id}>
                    {client.displayName}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">{copy.taxIdLabel}</th>
                {comparison.clients.map((client) => (
                  <td key={client.id}>{client.taxId ?? copy.notProvided}</td>
                ))}
              </tr>
              {SELECTABLE_FIELDS.map((field) => (
                <tr key={field}>
                  <th scope="row">{FIELD_LABELS[field]}</th>
                  {comparison.clients.map((client) => (
                    <td key={client.id}>
                      {comparison.differingFields.includes(field) ? (
                        <label
                          htmlFor={`client-union-${field}-${client.id}`}
                          aria-label={copy.unionKeepValueLabel(
                            FIELD_LABELS[field],
                            client.displayName,
                          )}
                        >
                          <input
                            id={`client-union-${field}-${client.id}`}
                            type="radio"
                            name={`client-union-${field}`}
                            value={client.id}
                            checked={fieldSelections[field] === client.id}
                            onChange={() =>
                              setFieldSelections((current) => ({
                                ...current,
                                [field]: client.id,
                              }))
                            }
                          />
                          {client[field] ?? copy.notProvided}
                        </label>
                      ) : (
                        (client[field] ?? copy.notProvided)
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <th scope="row">{copy.contactsLabel}</th>
                {comparison.clients.map((client) => (
                  <td key={client.id}>
                    {client.contacts.length === 0
                      ? copy.noContacts
                      : client.contacts
                          .map((contact) => contact.name)
                          .join(', ')}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>

          <fieldset>
            <legend>{copy.unionAffectedCompaniesLegend}</legend>
            {comparison.affectedCompanies.map((company) => (
              <label
                key={company.id}
                htmlFor={`client-union-company-${company.id}`}
              >
                <input
                  id={`client-union-company-${company.id}`}
                  type="checkbox"
                  checked={confirmedCompanyIds.includes(company.id)}
                  onChange={(event) =>
                    setConfirmedCompanyIds((current) =>
                      event.target.checked
                        ? [...current, company.id]
                        : current.filter(
                            (companyId) => companyId !== company.id,
                          ),
                    )
                  }
                />
                {company.displayName}
              </label>
            ))}
          </fieldset>

          <label htmlFor="client-union-reason">{copy.unionReasonLabel}</label>
          <textarea
            id="client-union-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <button
            type="button"
            disabled={state.status === 'uniting'}
            onClick={() => void confirmUnion(comparison)}
          >
            {state.status === 'uniting'
              ? copy.unionConfirming
              : copy.unionConfirm}
          </button>
        </div>
      )}

      {operation && operation.status === 'confirmed' && (
        <div>
          <p role="status">{copy.unionConfirmed}</p>
          <p>{copy.unionContactsPreserved(operation.contactCount)}</p>
          <label htmlFor="client-union-reversal-reason">
            {copy.unionReversalReasonLabel}
          </label>
          <textarea
            id="client-union-reversal-reason"
            value={reversalReason}
            onChange={(event) => setReversalReason(event.target.value)}
          />
          <button
            type="button"
            disabled={state.status === 'reversing'}
            onClick={() => void reverseUnion(operation)}
          >
            {state.status === 'reversing'
              ? copy.unionReversing
              : copy.unionReverse}
          </button>
        </div>
      )}

      {operation && operation.status === 'reversed' && (
        <p role="status">{copy.unionReversed}</p>
      )}
    </section>
  );
}

function unionFailureMessage(result: ApiResult<unknown>): string {
  if (result.status === 'notFound') return copy.unionUnavailable;
  if (result.status === 'conflict' && result.reason === 'clientUnionConflict') {
    return conflictMessage(result.code);
  }
  return copy.unionRetry;
}

function conflictMessage(code: ClientUnionConflictCode): string {
  switch (code) {
    case 'client_union_comparison_stale':
      return copy.unionStale;
    case 'client_union_differences_require_review':
      return copy.unionDifferencesRequireReview;
    case 'client_union_contact_capacity_exceeded':
      return copy.unionCapacityExceeded;
    case 'client_union_blocked':
      return copy.unionBlocked;
    case 'client_union_reversal_blocked':
      return copy.unionReversalBlocked;
    case 'client_union_changed_intent':
      return copy.unionChangedIntent;
    default:
      return assertNever(code);
  }
}

function readComparison(
  value: unknown,
): Comparison | 'remediation' | undefined {
  if (!isRecord(value)) return undefined;
  if (
    value.outcome === 'multiple_duplicate_candidates_require_data_remediation'
  ) {
    return 'remediation';
  }
  if (
    value.outcome !== 'comparison' ||
    typeof value.comparison_reference !== 'string' ||
    typeof value.normalizedIdentifier !== 'string' ||
    !Array.isArray(value.clients) ||
    value.clients.length !== 2 ||
    !Array.isArray(value.affectedCompanies) ||
    !Array.isArray(value.differingFields)
  ) {
    return undefined;
  }
  const first = readDossier(value.clients[0]);
  const second = readDossier(value.clients[1]);
  if (!first || !second) return undefined;
  const affectedCompanies: { id: string; displayName: string }[] = [];
  for (const company of value.affectedCompanies) {
    if (
      !isRecord(company) ||
      typeof company.id !== 'string' ||
      typeof company.displayName !== 'string'
    ) {
      return undefined;
    }
    affectedCompanies.push({
      id: company.id,
      displayName: company.displayName,
    });
  }
  const differingFields: SelectableField[] = [];
  for (const field of value.differingFields) {
    const selectable = SELECTABLE_FIELDS.find(
      (candidate) => candidate === field,
    );
    if (!selectable) return undefined;
    differingFields.push(selectable);
  }
  return {
    comparisonReference: value.comparison_reference,
    normalizedIdentifier: value.normalizedIdentifier,
    clients: [first, second],
    affectedCompanies,
    differingFields,
  };
}

function readDossier(value: unknown): ComparedDossier | undefined {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.displayName !== 'string' ||
    typeof value.version !== 'number' ||
    !Array.isArray(value.contacts)
  ) {
    return undefined;
  }
  const contacts: ClientContact[] = [];
  for (const contact of value.contacts) {
    if (!isRecord(contact) || typeof contact.name !== 'string') {
      return undefined;
    }
    contacts.push({
      name: contact.name,
      ...(typeof contact.telephone === 'string'
        ? { telephone: contact.telephone }
        : {}),
      ...(typeof contact.email === 'string' ? { email: contact.email } : {}),
    });
  }
  return {
    id: value.id,
    displayName: value.displayName,
    taxId: optionalText(value.taxId),
    address: optionalText(value.address),
    telephone: optionalText(value.telephone),
    generalEmail: optionalText(value.generalEmail),
    businessActivity: optionalText(value.businessActivity),
    contacts,
    version: value.version,
  };
}

function readOperation(value: unknown): UnionOperation | undefined {
  if (
    !isRecord(value) ||
    typeof value.unionOperationId !== 'string' ||
    typeof value.canonicalClientAccountId !== 'string' ||
    typeof value.supersededClientAccountId !== 'string' ||
    (value.status !== 'confirmed' && value.status !== 'reversed') ||
    !Array.isArray(value.snapshots)
  ) {
    return undefined;
  }
  const contactCount = value.snapshots.reduce<number>(
    (total, snapshot) =>
      total +
      (isRecord(snapshot) && Array.isArray(snapshot.contacts)
        ? snapshot.contacts.length
        : 0),
    0,
  );
  return {
    unionOperationId: value.unionOperationId,
    status: value.status,
    canonicalClientAccountId: value.canonicalClientAccountId,
    supersededClientAccountId: value.supersededClientAccountId,
    contactCount,
  };
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled governed union conflict: ${String(value)}`);
}
