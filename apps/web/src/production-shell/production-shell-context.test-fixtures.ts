import { vi } from 'vitest';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import type { ProductionShellContext } from './useProductionShellContext';

export const baseActor: ActorContext = {
  internalUserId: 'user-1',
  workspaceMembershipId: 'membership-1',
  workspaceId: 'workspace-1',
  workspaceName: 'Workspace',
  displayName: 'Ada',
  email: 'ada@example.test',
  active: true,
  workspacePermissions: ['company.manage'],
};

export const companies = [
  { id: 'company-a', displayName: 'Company A' },
  { id: 'company-b', displayName: 'Company B' },
];

export function browserIdentity(): BrowserIdentity {
  return {
    loaded: true,
    signedIn: true,
    getToken: async () => 'token',
    rejectSession: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
    signedOutView: null,
  };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

export function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200 });
}

export function selectedActor(id: string, displayName: string): ActorContext {
  return { ...baseActor, activeCompany: { id, displayName } };
}

export function activeCompanyId(
  context: ProductionShellContext,
): string | undefined {
  return context.status === 'active'
    ? context.actor.activeCompany?.id
    : undefined;
}

export function readyCompanies(context: ProductionShellContext) {
  if (context.status !== 'active' || context.companyContext.status !== 'ready')
    throw new Error('Expected ready Company context');
  return context.companyContext.companies;
}
