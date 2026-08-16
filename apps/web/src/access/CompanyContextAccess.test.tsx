import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { CompanyContextAccess } from './CompanyContextAccess';

describe('CompanyContextAccess', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('grants and revokes access through the canonical endpoints', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: 'assignment-1',
            workspaceMembershipId: 'member-1',
            companyId: 'company-1',
            bundle: 'Company Context Access',
            active: true,
          }),
          { status: 201 },
        ),
      ),
    );
    const actor: ActorContext = {
      internalUserId: 'owner',
      workspaceMembershipId: 'owner-membership',
      workspaceId: 'workspace',
      workspaceName: 'Workspace',
      displayName: 'Owner',
      email: 'owner@example.test',
      active: true as const,
      workspacePermissions: ['company.manage', 'company.assignment.manage'],
    };

    render(
      <CompanyContextAccess
        actor={actor}
        identity={deterministicBrowserIdentity()}
      />,
    );
    fireEvent.change(screen.getByLabelText('Workspace membership ID'), {
      target: { value: 'member-1' },
    });
    fireEvent.change(screen.getByLabelText('Company ID'), {
      target: { value: 'company-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/company-context-assignments',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'idempotency-key': expect.any(String),
          }),
        }),
      ),
    );
    const grantKey = new Headers(
      vi.mocked(fetch).mock.calls[0]?.[1]?.headers,
    ).get('idempotency-key');
    fireEvent.click(screen.getByRole('button', { name: 'Revoke access' }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/company-context-assignments/member-1/company-1',
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.objectContaining({
            'idempotency-key': expect.any(String),
          }),
        }),
      ),
    );
    const revokeKey = new Headers(
      vi.mocked(fetch).mock.calls[1]?.[1]?.headers,
    ).get('idempotency-key');
    expect(grantKey).toBeTruthy();
    expect(revokeKey).toBeTruthy();
    expect(revokeKey).not.toBe(grantKey);
  });
});
