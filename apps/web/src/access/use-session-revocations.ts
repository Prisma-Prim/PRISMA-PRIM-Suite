import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import { useScopedOperationGroup } from '../api/use-scoped-operation';
import { useWorkspaceRequestScope } from './use-workspace-request-scope';
import type { sessionRevocationCopy } from './workspace-session-revocation.copy';

export type SessionRevocationStatus = keyof typeof sessionRevocationCopy.status;
export type SessionRevocationPage = {
  records: Array<{
    workspaceMembershipId: string;
    displayName: string;
    status: SessionRevocationStatus;
  }>;
  nextCursor: string | null;
};
export type SessionRevocationState =
  | { kind: 'idle' | 'loading' | 'error' }
  | { kind: 'ready'; page: SessionRevocationPage };
/**
 * The identity-provider session revocations of suspended members, read on
 * demand page by page, with a retry of a pending or failed revocation.
 */
export function useSessionRevocations({
  actor,
  identity,
  onWorkspaceAccessRejected,
  onActivityRecorded,
}: Readonly<{
  actor: ActorContext;
  identity: BrowserIdentity;
  onWorkspaceAccessRejected: () => Promise<void> | void;
  onActivityRecorded: () => Promise<void> | void;
}>) {
  const [state, setState] = useState<SessionRevocationState>({ kind: 'idle' });
  const {
    allowed: canManage,
    scope,
    captureRecovery,
  } = useWorkspaceRequestScope({
    actor,
    identity,
    permission: 'company.assignment.manage',
  });
  const requests = useScopedOperationGroup(scope);
  const callbacks = useRef({ onActivityRecorded, onWorkspaceAccessRejected });
  useLayoutEffect(() => {
    callbacks.current = { onActivityRecorded, onWorkspaceAccessRejected };
  });
  useEffect(() => {
    setState({ kind: 'idle' });
  }, [scope]);

  async function load(after?: string, retryMembershipId?: string) {
    if (requests.isPending() || !canManage) return;
    const request = requests.begin();
    if (!request) return;
    const current = () => requests.isLive() && !request.signal.aborted;
    const recoveryLive = captureRecovery();
    setState({ kind: 'loading' });
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (!current()) return;
      if (retryMembershipId) {
        const result = await api.request(
          `/workspace-session-revocations/${retryMembershipId}/retry`,
          { method: 'POST', signal: request.signal },
        );
        if (!current()) return;
        if (result.status === 'unauthorized' || result.status === 'forbidden') {
          if (recoveryLive()) {
            if (result.status === 'unauthorized')
              await identity.rejectSession();
            else await callbacks.current.onWorkspaceAccessRejected();
          }
          throw new Error('Access denied');
        }
        if (
          result.status !== 'ok' ||
          !isRecord(result.value) ||
          result.value.status !== 'checked'
        )
          throw new Error('Unverified outcome');
        await callbacks.current.onActivityRecorded();
        if (!current()) return;
      }
      const result = await api.request(
        `/workspace-session-revocations${after ? `?after=${encodeURIComponent(after)}` : ''}`,
        { signal: request.signal },
      );
      if (!current()) return;
      if (result.status === 'unauthorized' || result.status === 'forbidden') {
        if (recoveryLive()) {
          if (result.status === 'unauthorized') await identity.rejectSession();
          else await callbacks.current.onWorkspaceAccessRejected();
        }
        throw new Error('Access denied');
      }
      if (result.status !== 'ok') throw new Error('Status unavailable');
      const page = readPage(result.value);
      if (!page) throw new Error('Invalid status');
      setState({ kind: 'ready', page });
    } catch {
      if (current()) setState({ kind: 'error' });
    } finally {
      request.release();
    }
  }

  return { allowed: canManage, state, load };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function readPage(value: unknown): SessionRevocationPage | undefined {
  if (
    !isRecord(value) ||
    !Array.isArray(value.records) ||
    value.records.length > 50 ||
    !(value.nextCursor === null || isUuid(value.nextCursor))
  )
    return;
  const records: SessionRevocationPage['records'] = [];
  for (const row of value.records) {
    if (
      !isRecord(row) ||
      !isUuid(row.workspaceMembershipId) ||
      typeof row.displayName !== 'string' ||
      !isStatus(row.status)
    )
      return;
    records.push({
      workspaceMembershipId: row.workspaceMembershipId,
      displayName: row.displayName,
      status: row.status,
    });
  }
  return { records, nextCursor: value.nextCursor };
}
function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
function isStatus(value: unknown): value is SessionRevocationStatus {
  return (
    value === 'pending' ||
    value === 'running' ||
    value === 'retry_required' ||
    value === 'complete'
  );
}
