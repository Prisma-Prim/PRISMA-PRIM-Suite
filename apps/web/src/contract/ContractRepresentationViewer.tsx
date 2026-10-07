import { useEffect, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import { handleAuthenticatedAccessRejection } from '../api/latest-authenticated-request';
import { contractCopy as copy } from './contract.copy';

type DocumentView =
  | { kind: 'closed' | 'loading' | 'denied' | 'error' }
  | { kind: 'ready'; html: string; sha256: string };

export function ContractRepresentationViewer({
  identity,
  companyId,
  opportunityId,
  contractId,
  versionId,
  onCompanyContextRejected,
  onActorRevalidated,
  onWorkspaceAccessRejected,
}: {
  identity: BrowserIdentity;
  companyId: string;
  opportunityId: string;
  contractId: string;
  versionId: string;
  onCompanyContextRejected: (companyId: string) => void;
  onActorRevalidated: (actor: ActorContext) => Promise<void> | void;
  onWorkspaceAccessRejected: () => Promise<void> | void;
}) {
  const [view, setView] = useState<DocumentView>({ kind: 'closed' });
  const [requestNumber, setRequestNumber] = useState(0);
  useEffect(() => {
    if (requestNumber === 0) return;
    const controller = new AbortController();
    const { signal } = controller;
    setView({ kind: 'loading' });
    void (async () => {
      try {
        const api = await createAuthenticatedApiClient(identity);
        if (signal.aborted) return;
        const result = await api.request<unknown>(
          `/contracts/opportunities/${encodeURIComponent(opportunityId)}/versions/${encodeURIComponent(versionId)}/representation`,
          { companyContextId: companyId, signal },
        );
        if (signal.aborted) return;
        if (
          await handleAuthenticatedAccessRejection({
            result,
            identity,
            companyContextId: companyId,
            onCompanyContextRejected,
            onActorRevalidated,
            onWorkspaceAccessRejected,
            signal,
          })
        ) {
          if (!signal.aborted) setView({ kind: 'denied' });
          return;
        }
        if (signal.aborted) return;
        if (result.status !== 'ok') {
          setView({ kind: result.status === 'notFound' ? 'denied' : 'error' });
          return;
        }
        setView({
          kind: 'ready',
          ...readRepresentation({ value: result.value, contractId, versionId }),
        });
      } catch {
        if (!signal.aborted) setView({ kind: 'error' });
      }
    })();
    return () => controller.abort();
  }, [
    requestNumber,
    identity,
    companyId,
    opportunityId,
    contractId,
    versionId,
    onCompanyContextRejected,
    onActorRevalidated,
    onWorkspaceAccessRejected,
  ]);
  return (
    <section className="contract-representation" aria-label={copy.document}>
      <button
        type="button"
        disabled={view.kind === 'loading'}
        onClick={() => setRequestNumber((number) => number + 1)}
      >
        {requestNumber === 0 ? copy.openDocument : copy.reloadDocument}
      </button>
      {view.kind === 'loading' && <p role="status">{copy.documentLoading}</p>}
      {(view.kind === 'denied' || view.kind === 'error') && (
        <p role="alert">
          {view.kind === 'denied' ? copy.denied : copy.documentError}
        </p>
      )}
      {view.kind === 'ready' && (
        <>
          <p>{copy.draft}</p>
          <p>
            {copy.checksum}: <code>{view.sha256}</code>
          </p>
          <iframe
            title={copy.document}
            sandbox=""
            referrerPolicy="no-referrer"
            srcDoc={view.html}
          />
        </>
      )}
    </section>
  );
}
function readRepresentation({
  value,
  contractId,
  versionId,
}: {
  value: unknown;
  contractId: string;
  versionId: string;
}) {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Invalid Contract representation.');
  if (
    !('contractId' in value) ||
    value.contractId !== contractId ||
    !('contractVersionId' in value) ||
    value.contractVersionId !== versionId ||
    !('templateCode' in value) ||
    value.templateCode !== 'CONTRACT_ILLUSTRATIVE' ||
    !('templateVersion' in value) ||
    value.templateVersion !== 1 ||
    !('html' in value) ||
    typeof value.html !== 'string' ||
    !value.html.length ||
    !('sha256' in value) ||
    typeof value.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(value.sha256)
  )
    throw new Error('Invalid exact Contract representation.');
  if (
    !('clauseVersions' in value) ||
    !Array.isArray(value.clauseVersions) ||
    value.clauseVersions.length !== 5
  )
    throw new Error('Invalid Contract clause bindings.');
  const codes = [
    'CL_SUBJECT',
    'CL_PRICE',
    'CL_TERM',
    'CL_CONDITIONS',
    'CL_GENERAL',
  ];
  if (
    !value.clauseVersions.every(
      (entry: unknown, index) =>
        typeof entry === 'object' &&
        entry !== null &&
        !Array.isArray(entry) &&
        'code' in entry &&
        entry.code === codes[index] &&
        'version' in entry &&
        entry.version === 1 &&
        Object.keys(entry).length === 2,
    )
  )
    throw new Error('Invalid Contract clause bindings.');
  return { html: value.html, sha256: value.sha256 };
}
