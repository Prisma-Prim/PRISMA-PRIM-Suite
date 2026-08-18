import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ActorContext } from '../access-types';
import { CompanyContextSelector } from './CompanyContextSelector';

describe('CompanyContextSelector', () => {
  it('guides a member without assignments to ask for Company access', () => {
    render(
      <CompanyContextSelector
        actor={memberActor}
        state={{
          status: 'ready',
          cardinality: 'zero',
          companies: [],
          selection: { status: 'idle' },
        }}
        onSelect={vi.fn()}
      />,
    );

    expect(
      screen.getByText(
        'No Company is assigned to you. Ask a Workspace Owner to grant Company Context Access.',
      ),
    ).toBeVisible();
    expect(screen.queryByText(/Register a Company/)).not.toBeInTheDocument();
  });
});

const memberActor: ActorContext = {
  internalUserId: 'member',
  workspaceMembershipId: 'membership',
  workspaceId: 'workspace',
  workspaceName: 'Workspace',
  displayName: 'Member',
  email: 'member@example.test',
  active: true,
  workspacePermissions: [],
};
