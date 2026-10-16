import { useContext, useEffect, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import { ApplicationPresentation } from '../production-shell/application-presentation';
import {
  sessionRevocationCopy,
  useSessionRevocationCopy,
} from './workspace-session-revocation.copy';

type Status = keyof typeof sessionRevocationCopy.status;
type Page = {
  records: Array<{
    workspaceMembershipId: string;
    displayName: string;
    status: Status;
  }>;
  nextCursor: string | null;
};
type State =
  { kind: 'idle' | 'loading' | 'error' } | { kind: 'ready'; page: Page };
export function WorkspaceSessionRevocations({
  actor,
  identity,
  onWorkspaceAccessRejected,
  onActivityRecorded,
}: {
  actor: ActorContext;
  identity: BrowserIdentity;
  onWorkspaceAccessRejected: () => Promise<void> | void;
  onActivityRecorded: () => Promise<void> | void;
}) {
  const copy = useSessionRevocationCopy();
  const isPrisme = useContext(ApplicationPresentation) === 'prisme';
  const [state, setState] = useState<State>({ kind: 'idle' });
  const pending = useRef<AbortController | undefined>(undefined);
  const canManage = actor.workspacePermissions.includes(
    'company.assignment.manage',
  );
  useEffect(() => {
    setState({ kind: 'idle' });
    return () => {
      pending.current?.abort();
      pending.current = undefined;
    };
  }, [
    actor.internalUserId,
    actor.workspaceId,
    actor.workspaceMembershipId,
    identity,
    canManage,
  ]);

  async function load(after?: string, retryMembershipId?: string) {
    if (pending.current || !canManage) return;
    const request = new AbortController();
    pending.current = request;
    setState({ kind: 'loading' });
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (request.signal.aborted) return;
      if (retryMembershipId) {
        const result = await api.request<unknown>(
          `/workspace-session-revocations/${retryMembershipId}/retry`,
          { method: 'POST', signal: request.signal },
        );
        if (request.signal.aborted) return;
        if (result.status === 'unauthorized' || result.status === 'forbidden') {
          if (result.status === 'unauthorized') await identity.rejectSession();
          else await onWorkspaceAccessRejected();
          throw new Error('Access denied');
        }
        if (
          result.status !== 'ok' ||
          !isRecord(result.value) ||
          result.value.status !== 'checked'
        )
          throw new Error('Unverified outcome');
        await onActivityRecorded();
        if (request.signal.aborted) return;
      }
      const result = await api.request<unknown>(
        `/workspace-session-revocations${after ? `?after=${encodeURIComponent(after)}` : ''}`,
        { signal: request.signal },
      );
      if (request.signal.aborted) return;
      if (result.status === 'unauthorized' || result.status === 'forbidden') {
        if (result.status === 'unauthorized') await identity.rejectSession();
        else await onWorkspaceAccessRejected();
        throw new Error('Access denied');
      }
      if (result.status !== 'ok') throw new Error('Status unavailable');
      const page = readPage(result.value);
      if (!page) throw new Error('Invalid status');
      setState({ kind: 'ready', page });
    } catch {
      if (!request.signal.aborted) setState({ kind: 'error' });
    } finally {
      if (pending.current === request) pending.current = undefined;
    }
  }

  if (!canManage) return null;
  return (
    <section
      aria-label={copy.title}
      className={
        isPrisme ? 'session-revocations session-revocations--prisme' : undefined
      }
    >
      <h3>{copy.title}</h3>
      <p>{copy.description}</p>
      <button
        type="button"
        className={isPrisme ? 'company-access-secondary-action' : undefined}
        disabled={state.kind === 'loading'}
        onClick={() => void load()}
      >
        {copy.refresh}
      </button>
      {state.kind === 'loading' && <p role="status">{copy.pending}</p>}
      {state.kind === 'error' && <p role="alert">{copy.error}</p>}
      {state.kind === 'ready' && (
        <>
          {state.page.records.length === 0 && <p>{copy.empty}</p>}
          <ul className={isPrisme ? 'session-revocation-list' : undefined}>
            {state.page.records.map((row) => (
              <li
                key={row.workspaceMembershipId}
                data-status={isPrisme ? row.status : undefined}
              >
                <strong>{row.displayName}</strong>
                <p>{copy.status[row.status]}</p>
                {(row.status === 'pending' ||
                  row.status === 'retry_required') && (
                  <button
                    type="button"
                    className={
                      isPrisme ? 'company-access-primary-action' : undefined
                    }
                    onClick={() =>
                      void load(undefined, row.workspaceMembershipId)
                    }
                  >
                    {copy.retry}
                  </button>
                )}
              </li>
            ))}
          </ul>
          {state.page.nextCursor && (
            <button
              type="button"
              className={
                isPrisme ? 'company-access-secondary-action' : undefined
              }
              onClick={() => {
                if (state.page.nextCursor) void load(state.page.nextCursor);
              }}
            >
              {copy.more}
            </button>
          )}
        </>
      )}
    </section>
  );
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function readPage(value: unknown): Page | undefined {
  if (
    !isRecord(value) ||
    !Array.isArray(value.records) ||
    value.records.length > 50 ||
    !(value.nextCursor === null || isUuid(value.nextCursor))
  )
    return;
  const records: Page['records'] = [];
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
function isStatus(value: unknown): value is Status {
  return (
    value === 'pending' ||
    value === 'running' ||
    value === 'retry_required' ||
    value === 'complete'
  );
}
