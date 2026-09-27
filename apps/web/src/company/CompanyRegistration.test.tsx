import { render, screen } from '../test/render-with-interface-locale';
import { describe, expect, it } from 'vitest';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { ApplicationPresentation } from '../production-shell/application-presentation';
import { CompanyRegistration } from './CompanyRegistration';

const actor = {
  internalUserId: 'user',
  workspaceMembershipId: 'membership',
  workspaceId: 'workspace',
  workspaceName: 'Workspace',
  displayName: 'Workspace Owner',
  email: 'owner@example.test',
  active: true,
  workspacePermissions: ['company.manage'],
} satisfies ActorContext;

const identity: BrowserIdentity = {
  loaded: true,
  signedIn: true,
  getToken: async () => 'test-session',
  signOut: async () => {},
  rejectSession: async () => {},
  signedOutView: null,
};

const callbacks = {
  onCompanyContextRejected: () => {},
  onCompanyRegistered: () => {},
};

describe('Company registration presentation', () => {
  it('presents first-Company onboarding in Prisme while preserving the Classic public markup', () => {
    const classic = render(
      <CompanyRegistration actor={actor} identity={identity} {...callbacks} />,
    );
    const classicRegistration = screen.getByRole('region', {
      name: 'Provider Company',
    });
    expect(classicRegistration).toHaveClass('company-registration', {
      exact: true,
    });
    expect(classicRegistration.querySelector('form')).not.toHaveClass(
      'company-registration-form',
    );
    expect(
      screen.getByRole('button', { name: 'Register Company' }),
    ).not.toHaveClass('company-registration-primary-action');
    classic.unmount();

    render(
      <ApplicationPresentation value="prisme">
        <CompanyRegistration actor={actor} identity={identity} {...callbacks} />
      </ApplicationPresentation>,
    );
    const prismeRegistration = screen.getByRole('region', {
      name: 'Provider Company',
    });
    expect(prismeRegistration).toHaveClass('company-registration--prisme');
    expect(prismeRegistration.querySelector('form')).toHaveClass(
      'company-registration-form',
    );
    expect(
      screen.getByRole('button', { name: 'Register Company' }),
    ).toHaveClass('company-registration-primary-action');
  });
});
