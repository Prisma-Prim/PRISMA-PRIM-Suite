import { useEffect, useId, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import { readClientLegalEntityList } from '../client/client-legal-entities-response';
import { readClients } from '../documents/document-response';
import { Select } from '../presentation/Select';
import { usePaymentEvidenceCopy } from './payment-evidence.copy';
import type {
  PaymentEvidencePayerSelection as Selection,
  PaymentEvidenceRejection as Rejection,
} from './payment-evidence-types';
type PayerView =
  | {
      kind: 'PRIMARY';
      legalName: string;
      taxId: string | null;
      legalAddress: string | null;
    }
  | {
      kind: 'ADDITIONAL';
      legalEntityId: string;
      legalName: string;
      taxId: string | null;
      legalAddress: string | null;
    };
export function PaymentEvidencePayerPicker({
  identity,
  companyId,
  disabled,
  onSelect,
  onRejected,
}: {
  identity: BrowserIdentity;
  companyId: string;
  disabled: boolean;
  onSelect: (selected: Selection | undefined) => void;
  onRejected: Rejection;
}) {
  const copy = usePaymentEvidenceCopy(),
    id = useId();
  const [clients, setClients] =
      useState<Array<{ id: string; displayName: string }>>(),
    [clientId, setClientId] = useState(''),
    [parties, setParties] = useState<PayerView[]>(),
    [partyValue, setPartyValue] = useState(''),
    [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const selected = parties?.find((party) =>
    party.kind === 'PRIMARY'
      ? partyValue === 'PRIMARY'
      : party.legalEntityId === partyValue,
  );
  const rejection = useRef(onRejected);
  rejection.current = onRejected;
  useEffect(() => {
    const request = new AbortController(),
      current = () => !request.signal.aborted;
    void (async () => {
      try {
        const api = await createAuthenticatedApiClient(identity);
        if (!current()) return;
        const result = await api.request('/clients', {
          companyContextId: companyId,
          signal: request.signal,
          cache: 'no-store',
        });
        if (!current()) return;
        if (result.status !== 'ok') {
          await rejection.current(result, request.signal, current);
          if (current()) setError(true);
          return;
        }
        const loaded = readClients(result.value);
        if (current()) setClients(loaded);
      } catch {
        if (current()) setError(true);
      }
    })();
    return () => request.abort();
  }, [companyId, identity, retry]);
  useEffect(() => {
    onSelect(undefined);
    setParties(undefined);
    setPartyValue('');
    if (!clientId) return;
    const request = new AbortController(),
      current = () => !request.signal.aborted;
    void (async () => {
      try {
        const api = await createAuthenticatedApiClient(identity);
        if (!current()) return;
        const [dossier, entities] = await Promise.all([
          api.request('/clients/' + encodeURIComponent(clientId), {
            companyContextId: companyId,
            signal: request.signal,
          }),
          api.request(
            '/clients/' + encodeURIComponent(clientId) + '/legal-entities',
            { companyContextId: companyId, signal: request.signal },
          ),
        ]);
        if (!current()) return;
        if (dossier.status !== 'ok' || entities.status !== 'ok') {
          await rejection.current(
            dossier.status !== 'ok' ? dossier : entities,
            request.signal,
            current,
          );
          if (current()) setError(true);
          return;
        }
        const primary = primaryParty(dossier.value, clientId),
          additional = readClientLegalEntityList(entities.value).legalEntities;
        if (current())
          setParties([
            primary,
            ...additional.map((entity) => ({
              kind: 'ADDITIONAL' as const,
              legalEntityId: entity.id,
              legalName: entity.legalName,
              taxId: entity.taxId,
              legalAddress: entity.legalAddress,
            })),
          ]);
      } catch {
        if (current()) setError(true);
      }
    })();
    return () => request.abort();
  }, [clientId, companyId, identity, onSelect, retry]);
  function choose(value: string) {
    setPartyValue(value);
    const party = parties?.find((p) =>
      p.kind === 'PRIMARY' ? value === 'PRIMARY' : p.legalEntityId === value,
    );
    onSelect(
      party
        ? {
            clientId,
            party:
              party.kind === 'PRIMARY'
                ? { kind: 'PRIMARY' }
                : { kind: 'ADDITIONAL', legalEntityId: party.legalEntityId },
          }
        : undefined,
    );
  }
  return (
    <fieldset disabled={disabled}>
      <label htmlFor={id + '-client'}>{copy('client')}</label>
      <Select
        id={id + '-client'}
        value={clientId}
        options={(clients ?? []).map((client) => ({
          value: client.id,
          label: client.displayName,
        }))}
        onValueChange={setClientId}
        placeholder={copy('selectClient')}
        disabled={disabled || !clients}
        required
      />
      <label htmlFor={id + '-payer'}>{copy('payer')}</label>
      <Select
        id={id + '-payer'}
        value={partyValue}
        options={(parties ?? []).map((party) => ({
          value: party.kind === 'PRIMARY' ? 'PRIMARY' : party.legalEntityId,
          label:
            (party.kind === 'PRIMARY' ? copy('primary') : copy('additional')) +
            ' · ' +
            party.legalName,
        }))}
        onValueChange={choose}
        placeholder={copy('selectPayer')}
        disabled={disabled || !parties}
        required
      />
      {selected && (
        <div className="payment-evidence-party">
          <p>{selected.legalName}</p>
          <dl>
            <dt>{copy('taxId')}</dt>
            <dd>{selected.taxId ?? copy('notRecorded')}</dd>
            <dt>{copy('address')}</dt>
            <dd>{selected.legalAddress ?? copy('notRecorded')}</dd>
          </dl>
        </div>
      )}
      {error && (
        <div role="alert">
          <p>{copy('error')}</p>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              setError(false);
              setClientId('');
              setClients(undefined);
              setParties(undefined);
              setPartyValue('');
              onSelect(undefined);
              setRetry((value) => value + 1);
            }}
          >
            {copy('retry')}
          </button>
        </div>
      )}
    </fieldset>
  );
}
function primaryParty(value: unknown, clientId: string): PayerView {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid Client identity');
  const row = Object.fromEntries(Object.entries(value));
  if (
    row.id !== clientId ||
    typeof row.displayName !== 'string' ||
    !row.displayName ||
    (row.taxId !== null && typeof row.taxId !== 'string') ||
    (row.address !== null && typeof row.address !== 'string')
  )
    throw new Error('Invalid Client identity');
  return {
    kind: 'PRIMARY',
    legalName: row.displayName,
    taxId: row.taxId,
    legalAddress: row.address,
  };
}
