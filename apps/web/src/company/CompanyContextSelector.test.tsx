import {
  fireEvent,
  render,
  screen,
} from '../test/render-with-interface-locale';
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

  it('does not reload the active Company when it is selected again', () => {
    const onSelect = vi.fn(async () => undefined);
    render(
      <CompanyContextSelector
        actor={{
          ...memberActor,
          activeCompany: { id: 'company-a', displayName: 'Company A' },
        }}
        state={{
          status: 'ready',
          cardinality: 'many',
          companies: [
            { id: 'company-a', displayName: 'Company A' },
            { id: 'company-b', displayName: 'Company B' },
          ],
          selection: { status: 'idle' },
        }}
        onSelect={onSelect}
      />,
    );

    const select = screen.getByRole('combobox', { name: 'Active Company' });
    fireEvent.click(select);
    fireEvent.click(screen.getByRole('option', { name: 'Company A' }));

    expect(onSelect).not.toHaveBeenCalled();
    expect(select).toHaveFocus();
    expect(select).toHaveAttribute('aria-expanded', 'false');
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
