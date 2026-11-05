import { useEffect, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import { useAuthorityLifetime } from '../access/use-authority-lifetime';
import {
  createAuthenticatedApiClient,
  conflictCode,
} from '../api/authenticated-api-client';
import {
  readDocumentVersionReceipt,
  type DocumentVersion,
  type DocumentVersionReceipt,
} from '../documents/document-response';
import { useDocumentVersionsCopy } from '../documents/document-versions.copy';
import { useDocumentNavigationProtection } from '../documents/document-navigation-protection';
import type { PaymentEvidenceRejection } from './payment-evidence-types';
type Command =
  | {
      action: 'drafted';
      body: string;
      key: string;
      expectedRevision: number;
      sourceVersionNumber: number;
    }
  | {
      action: 'designated_official';
      body: string;
      key: string;
      expectedRevision: number;
      versionId: string;
      versionNumber: number;
      supersededVersionNumber: number | null;
    };
type State =
  | { status: 'idle' }
  | { status: 'confirming'; command: Command }
  | { status: 'pending' | 'uncertain'; command: Command }
  | { status: 'confirmed'; receipt: DocumentVersionReceipt }
  | { status: 'conflict'; expectedRevision: number }
  | { status: 'denied' | 'capacity' };
/** One native action's envelope never depends on a sibling read or content capture. */
export function PaymentEvidenceVersionCommand({
  identity,
  companyId,
  documentId,
  authorityKey,
  action,
  expectedRevision,
  sourceVersion,
  target,
  canStart,
  onConfirmed,
  onProtectedWorkChange,
  onRejected,
}: {
  identity: BrowserIdentity;
  companyId: string;
  documentId: string;
  authorityKey: string;
  action: 'drafted' | 'designated_official';
  expectedRevision: number;
  sourceVersion: DocumentVersion | undefined;
  target: DocumentVersion | undefined;
  canStart: boolean;
  onConfirmed: (receipt: DocumentVersionReceipt) => Promise<void> | void;
  onProtectedWorkChange: (protectedWork: boolean) => void;
  onRejected: PaymentEvidenceRejection;
}) {
  const copy = useDocumentVersionsCopy(),
    [state, setState] = useState<State>({ status: 'idle' });
  const life = useAuthorityLifetime(
      JSON.stringify([authorityKey, documentId, action]),
      identity,
    ),
    pending = useRef<AbortController | undefined>(undefined),
    confirmButton = useRef<HTMLButtonElement>(null);
  const callbacks = useRef({ onConfirmed, onRejected });
  callbacks.current = { onConfirmed, onRejected };
  useDocumentNavigationProtection(
    state.status === 'confirming' ||
      state.status === 'pending' ||
      state.status === 'uncertain',
    onProtectedWorkChange,
  );
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    if (state.status !== 'confirming') return;
    const live = life();
    const origin = document.activeElement;
    requestAnimationFrame(() => {
      if (
        live() &&
        document.activeElement === origin &&
        confirmButton.current &&
        !confirmButton.current.closest('[hidden]')
      )
        confirmButton.current.focus();
    });
  }, [life, state.status]);
  useEffect(() => {
    if (
      state.status === 'conflict' &&
      expectedRevision !== state.expectedRevision
    )
      setState({ status: 'idle' });
  }, [expectedRevision, state]);
  function prepare() {
    if (!canStart || expectedRevision >= 2147483647) return;
    const base = {
      body: JSON.stringify({ expectedRevision }),
      key: crypto.randomUUID(),
      expectedRevision,
    };
    if (action === 'drafted' && sourceVersion) {
      void submit({
        ...base,
        action,
        sourceVersionNumber: sourceVersion.number,
      });
      return;
    }
    if (action === 'designated_official' && target?.status === 'draft')
      setState({
        status: 'confirming',
        command: {
          ...base,
          action,
          versionId: target.id,
          versionNumber: target.number,
          supersededVersionNumber: sourceVersion?.number ?? null,
        },
      });
  }
  async function submit(command: Command) {
    const request = new AbortController(),
      live = life(),
      current = () => !request.signal.aborted && live();
    pending.current = request;
    setState({ status: 'pending', command });
    let settled = false;
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (!current()) return;
      const path =
        '/documents/' +
        encodeURIComponent(documentId) +
        '/versions' +
        (command.action === 'drafted'
          ? ''
          : '/' +
            encodeURIComponent(command.versionId) +
            '/official-designation');
      const result = await api.request<unknown>(path, {
        method: 'POST',
        companyContextId: companyId,
        signal: request.signal,
        headers: {
          'content-type': 'application/json',
          'idempotency-key': command.key,
        },
        body: command.body,
      });
      if (!current()) return;
      if (
        result.status === 'unauthorized' ||
        result.status === 'forbidden' ||
        result.status === 'notFound'
      ) {
        settled = true;
        setState({ status: 'denied' });
        await callbacks.current.onRejected(result, request.signal, current);
        return;
      }
      if (result.status === 'conflict' || result.status === 'validation') {
        settled = true;
        setState(
          result.status === 'conflict' &&
            conflictCode(result) === 'document_version_capacity_exceeded'
            ? { status: 'capacity' }
            : {
                status: 'conflict',
                expectedRevision: command.expectedRevision,
              },
        );
        return;
      }
      if (result.status !== 'ok')
        throw new Error('Uncertain native Version command');
      const receipt = readDocumentVersionReceipt(result.value);
      if (!current()) return;
      if (
        receipt.documentId !== documentId ||
        receipt.action !== command.action ||
        receipt.workingRevision !== command.expectedRevision + 1 ||
        !uuid(receipt.versionId) ||
        (command.action === 'drafted' &&
          (receipt.action !== 'drafted' ||
            receipt.sourceVersionNumber !== command.sourceVersionNumber ||
            receipt.versionNumber !== command.sourceVersionNumber + 1)) ||
        (command.action === 'designated_official' &&
          (receipt.action !== 'designated_official' ||
            receipt.versionId !== command.versionId ||
            receipt.versionNumber !== command.versionNumber ||
            receipt.supersededVersionNumber !==
              command.supersededVersionNumber))
      )
        throw new Error('Unexpected Version receipt');
      settled = true;
      setState({ status: 'confirmed', receipt });
      await Promise.resolve(callbacks.current.onConfirmed(receipt)).catch(
        () => undefined,
      );
    } catch {
      if (!settled && current()) setState({ status: 'uncertain', command });
    }
  }
  return (
    <div className="payment-evidence-version-command">
      {(state.status === 'idle' || state.status === 'confirmed') && (
        <button type="button" disabled={!canStart} onClick={prepare}>
          {action === 'drafted' ? copy.startDraft : copy.designate}
        </button>
      )}
      {state.status === 'confirming' &&
        state.command.action === 'designated_official' && (
          <div role="group" aria-label={copy.designate}>
            <p>
              {copy.confirmDesignation(
                state.command.versionNumber,
                state.command.supersededVersionNumber,
              )}
            </p>
            <button
              type="button"
              ref={confirmButton}
              onClick={() => {
                if (state.status === 'confirming') void submit(state.command);
              }}
            >
              {copy.confirm}
            </button>
            <button type="button" onClick={() => setState({ status: 'idle' })}>
              {copy.cancel}
            </button>
          </div>
        )}
      {state.status === 'pending' && <p role="status">{copy.pending}</p>}
      {state.status === 'uncertain' && (
        <div role="alert">
          <p>{copy.uncertain}</p>
          <button
            type="button"
            onClick={() => {
              if (state.status === 'uncertain') void submit(state.command);
            }}
          >
            {copy.retryCommand}
          </button>
        </div>
      )}
      {state.status === 'confirmed' && (
        <p role="status">
          {state.receipt.action === 'drafted'
            ? copy.drafted(state.receipt.versionNumber)
            : copy.designated(state.receipt.versionNumber)}
        </p>
      )}
      {state.status === 'conflict' && <p role="alert">{copy.conflict}</p>}
      {state.status === 'capacity' && (
        <p role="alert">{copy.versionCapacity}</p>
      )}
      {state.status === 'denied' && <p role="alert">{copy.denied}</p>}
    </div>
  );
}
function uuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
    value,
  );
}
