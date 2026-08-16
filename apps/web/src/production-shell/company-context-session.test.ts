import { describe, expect, it, vi } from 'vitest';
import type { ActorContext } from '../access-types';
import type { AuthenticatedApiClient } from '../api/authenticated-api-client';
import { loadInitialCompanyContext } from './company-context-session';

describe('loadInitialCompanyContext', () => {
  it('loads assigned Companies without granting Company administration', async () => {
    const actor: ActorContext = {
      internalUserId: 'member',
      workspaceMembershipId: 'membership',
      workspaceId: 'workspace',
      workspaceName: 'Workspace',
      displayName: 'Member',
      email: 'member@example.test',
      active: true,
      workspacePermissions: [],
      companyContextAvailable: true,
    };
    const request = vi.fn().mockResolvedValue({
      status: 'ok',
      value: [
        { id: 'company-a', displayName: 'Assigned Company' },
        { id: 'company-b', displayName: 'Second Assigned Company' },
      ],
    });

    const result = await loadInitialCompanyContext(
      { request } as AuthenticatedApiClient,
      actor,
      new AbortController().signal,
    );

    expect(request).toHaveBeenCalledWith('/companies', expect.anything());
    expect(result).toMatchObject({
      status: 'ok',
      companyContext: { status: 'ready' },
    });
  });
});
