import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { grantOf, holds } from '../access/company-grants';
import { selectedWorkspaceId } from '../access/workspace-selection';
import { handleAuthenticatedAccessRejection } from '../api/latest-authenticated-request';
import type { CommercialIntakeRequest } from './RequestClientAssociation';
import type {
  SalesStageAccessHandler,
  SalesStageSettingsProps,
} from './use-sales-stage-settings';

type HttpResult = Awaited<ReturnType<CommercialIntakeRequest>>;

function intakeReadsOf(company: ActorContext['activeCompany']): boolean {
  return (
    holds(company, 'company_commercial_intake', 'commercial.request.read') &&
    holds(company, 'company_commercial_intake', 'commercial.opportunity.read')
  );
}

/**
 * The Sales Stage settings outside the Requests workspace, as the Clarté
 * Settings console opens them: the same `/sales-stages` transport, authority
 * keys and access handling as Commercial Intake. A refused configuration
 * keeps the list readable while the revalidated actor still reads Commercial
 * Intake; any other refusal closes the screen until the actor is read again.
 */
export function useSalesStageTransport({
  actor,
  identity,
  onActivityRecorded,
  onActorRevalidated,
  onCompanyContextRejected,
  onWorkspaceAccessRejected,
}: Readonly<{
  actor: ActorContext;
  identity: BrowserIdentity;
  onActivityRecorded: () => Promise<void> | void;
  onActorRevalidated: (actor: ActorContext) => Promise<void> | void;
  onCompanyContextRejected: (companyId: string) => void;
  onWorkspaceAccessRejected: () => Promise<void> | void;
}>):
  | { status: 'denied'; retry: () => void }
  | { status: 'no-company' }
  | { status: 'ready'; settings: SalesStageSettingsProps } {
  const company = actor.activeCompany;
  const companyId = company?.id;
  const intakeGrant = grantOf(company, 'company_commercial_intake');
  const canConfigure =
    holds(
      company,
      'company_sales_stage_configuration',
      'commercial.sales_stage.configure',
    ) && intakeReadsOf(company);
  const read = JSON.stringify([
    actor.active,
    actor.workspaceId,
    actor.internalUserId,
    actor.workspaceMembershipId,
    companyId,
    intakeGrant,
  ]);
  const configure = JSON.stringify([
    read,
    grantOf(company, 'company_sales_stage_configuration'),
    canConfigure,
  ]);
  const [denied, setDenied] = useState(false);
  const callbacks = useRef({
    onActorRevalidated,
    onCompanyContextRejected,
    onWorkspaceAccessRejected,
  });
  useLayoutEffect(() => {
    callbacks.current = {
      onActorRevalidated,
      onCompanyContextRejected,
      onWorkspaceAccessRejected,
    };
  });

  const request: CommercialIntakeRequest = useCallback(
    async ({
      path,
      companyContextId,
      signal,
      method = 'GET',
      body,
      idempotencyKey,
    }): Promise<HttpResult> => {
      try {
        signal.throwIfAborted();
        const token = identity.requestHeaders
          ? null
          : await identity.getToken();
        signal.throwIfAborted();
        const workspaceId = selectedWorkspaceId();
        const response = await fetch(
          `${import.meta.env.VITE_API_URL ?? '/api'}${path}`,
          {
            method,
            credentials: 'include',
            headers: {
              ...(identity.requestHeaders ??
                (token ? { Authorization: `Bearer ${token}` } : {})),
              ...(workspaceId ? { 'x-workspace-context-id': workspaceId } : {}),
              'x-company-context-id': companyContextId,
              ...(body ? { 'content-type': 'application/json' } : {}),
              ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
            },
            body,
            signal,
          },
        );
        signal.throwIfAborted();
        let responseBody: unknown;
        try {
          responseBody = await response.json();
        } catch {
          responseBody = undefined;
        }
        signal.throwIfAborted();
        return { status: response.status, body: responseBody };
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === 'AbortError')
          throw error;
        return { status: 'network' };
      }
    },
    [identity],
  );

  const handleAccess: SalesStageAccessHandler = useCallback(
    async (result, companyContextId, signal, resource) => {
      if (signal.aborted) return 'rejected';
      if (result.status === 401) {
        await identity.rejectSession();
        return 'rejected';
      }
      if (result.status !== 403) return 'ok';
      let retained = false;
      try {
        await handleAuthenticatedAccessRejection({
          result: { status: 'forbidden' },
          identity,
          companyContextId,
          onCompanyContextRejected: (rejected) =>
            callbacks.current.onCompanyContextRejected(rejected),
          onActorRevalidated: (revalidated) => {
            retained =
              resource !== 'intake' &&
              revalidated.activeCompany?.id === companyContextId &&
              intakeReadsOf(revalidated.activeCompany);
            return callbacks.current.onActorRevalidated(revalidated);
          },
          onWorkspaceAccessRejected: () =>
            callbacks.current.onWorkspaceAccessRejected(),
          signal,
        });
      } catch {
        // The received refusal stays definite even if revalidation fails.
      }
      if (signal.aborted) return 'rejected';
      if (retained) return 'retained';
      setDenied(true);
      return 'rejected';
    },
    [identity],
  );

  if (denied) return { status: 'denied', retry: () => setDenied(false) };
  if (!companyId) return { status: 'no-company' };
  return {
    status: 'ready',
    settings: {
      identity,
      authority: { read, configure },
      companyId,
      canConfigure,
      request,
      handleAccess,
      onConfigured: onActivityRecorded,
    },
  };
}
