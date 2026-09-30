import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '../test/render-with-interface-locale';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { ApplicationPresentation } from '../production-shell/application-presentation';
import {
  useInterfaceLocale,
  type InterfaceLocale,
} from '../localization/interface-locale';
import { WorkspaceInvitations } from './WorkspaceInvitations';

const actor: ActorContext = {
  internalUserId: 'user',
  workspaceId: 'workspace',
  workspaceMembershipId: 'member',
  workspaceName: 'Workspace',
  displayName: 'Owner',
  email: 'owner@example.test',
  active: true,
  workspacePermissions: ['member.invite'],
};
const identity: BrowserIdentity = {
  loaded: true,
  signedIn: true,
  getToken: async () => 'test-session',
  signOut: async () => {},
  rejectSession: async () => {},
  signedOutView: null,
};
const invitation = {
  id: 'invitation',
  email: 'recipient@example.test',
  status: 'pending',
  deliveryStatus: 'pending',
  expiresAt: '2026-10-01T00:00:00.000Z',
  createdAt: '2026-09-01T00:00:00.000Z',
  revokedAt: null,
  nextCheckAt: '2026-09-01T00:00:30.000Z',
};
afterEach(() => vi.unstubAllGlobals());

describe('Workspace invitation controls', () => {
  it('presents invitation administration in Prisme while preserving the Classic public markup', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ invitations: [invitation], nextCursor: null }),
      ),
    );

    const classic = render(
      <WorkspaceInvitations
        actor={actor}
        identity={identity}
        onActivityRecorded={() => {}}
        onWorkspaceAccessRejected={() => {}}
      />,
    );
    const classicInvitations = await screen.findByRole('region', {
      name: 'Workspace invitations',
    });
    expect(classicInvitations).toHaveClass('production-content-surface');
    expect(classicInvitations).not.toHaveClass('workspace-invitations--prisme');
    expect(classicInvitations.firstElementChild?.tagName).toBe('H2');
    expect(classicInvitations.querySelector('form')).not.toHaveClass(
      'workspace-invitations-form',
    );
    expect(classicInvitations.querySelector('ul')).not.toHaveClass(
      'workspace-invitation-list',
    );
    classic.unmount();

    render(
      <ApplicationPresentation value="prisme">
        <WorkspaceInvitations
          actor={actor}
          identity={identity}
          onActivityRecorded={() => {}}
          onWorkspaceAccessRejected={() => {}}
        />
      </ApplicationPresentation>,
    );
    const prismeInvitations = await screen.findByRole('region', {
      name: 'Workspace invitations',
    });
    expect(prismeInvitations).toHaveClass('workspace-invitations--prisme');
    expect(prismeInvitations.querySelector('form')).toHaveClass(
      'workspace-invitations-form',
    );
    expect(prismeInvitations.querySelector('ul')).toHaveClass(
      'workspace-invitation-list',
    );
  });

  it.each([false, true])(
    'distinguishes provider use from local consumption = %s',
    async (consumed) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          Response.json({
            invitations: [
              {
                ...invitation,
                status: 'accepted',
                deliveryStatus: 'accepted',
                consumedAt: consumed ? invitation.createdAt : null,
              },
            ],
            nextCursor: null,
          }),
        ),
      );
      render(
        <WorkspaceInvitations
          actor={actor}
          identity={identity}
          onActivityRecorded={() => {}}
          onWorkspaceAccessRejected={() => {}}
        />,
      );
      if (consumed) {
        await screen.findByText(
          'Accepted into the Workspace. Business access is assigned separately.',
        );
        expect(
          screen.queryByRole('button', { name: 'Revoke invitation' }),
        ).toBeNull();
      } else
        expect(
          await screen.findByRole('button', { name: 'Revoke invitation' }),
        ).toBeInTheDocument();
    },
  );
  it('reports provider use discovered during local revocation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          invitations: [
            {
              ...invitation,
              status: 'revoked',
              deliveryStatus: 'accepted',
              revokedAt: invitation.createdAt,
            },
          ],
          nextCursor: null,
        }),
      ),
    );
    render(
      <WorkspaceInvitations
        actor={actor}
        identity={identity}
        onActivityRecorded={() => {}}
        onWorkspaceAccessRejected={() => {}}
      />,
    );
    await screen.findByText(
      'Clerk reports that this invitation was already used. Local revocation remains recorded; no Workspace access is granted here.',
    );
    expect(
      screen.queryByRole('button', { name: 'Revoke invitation' }),
    ).toBeNull();
  });
  it('reuses the exact command after an uncertain HTTP response', async () => {
    const sends: RequestInit[] = [];
    const transport = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        sends.push(init);
        return sends.length === 1
          ? new Response('', { status: 503 })
          : Response.json(invitation);
      }
      return Response.json({ invitations: [], nextCursor: null });
    });
    vi.stubGlobal('fetch', transport);
    render(
      <>
        <WorkspaceInvitations
          actor={actor}
          identity={identity}
          onActivityRecorded={() => {}}
          onWorkspaceAccessRejected={() => {}}
        />
        <LocaleChange locale="fr" />
      </>,
    );
    await screen.findByLabelText('Recipient email');
    fireEvent.change(screen.getByLabelText('Recipient email'), {
      target: { value: invitation.email },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send invitation' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Passer en français' }));
    expect(screen.getByLabelText('E-mail du destinataire')).toHaveValue(
      invitation.email,
    );
    expect(screen.getByLabelText('Expire dans ce nombre de jours')).toHaveValue(
      7,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Envoyer l’invitation' }),
    );
    await waitFor(() => expect(sends).toHaveLength(2));
    expect(sends[0]?.body).toEqual(sends[1]?.body);
    expect(sends[0]?.headers).toEqual(sends[1]?.headers);
  });

  it('shows invitation-owned required errors and translates them without sending a command', async () => {
    const transport = vi.fn(async () =>
      Response.json({ invitations: [], nextCursor: null }),
    );
    vi.stubGlobal('fetch', transport);
    render(
      <>
        <WorkspaceInvitations
          actor={actor}
          identity={identity}
          onActivityRecorded={() => {}}
          onWorkspaceAccessRejected={() => {}}
        />
        <LocaleChange locale="fr" />
      </>,
    );

    await screen.findByLabelText('Recipient email');
    fireEvent.change(screen.getByLabelText('Expires in days'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send invitation' }));

    expect(await screen.findByText('Enter the recipient email.')).toBeVisible();
    expect(
      screen.getByText('Enter the number of days before expiry.'),
    ).toBeVisible();
    expect(transport).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Passer en français' }));
    expect(
      screen.getByText('Saisissez l’e-mail du destinataire.'),
    ).toBeVisible();
    expect(
      screen.getByText('Saisissez le nombre de jours avant l’expiration.'),
    ).toBeVisible();
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed email and non-integer or out-of-range expiry without sending a command', async () => {
    const transport = vi.fn(async () =>
      Response.json({ invitations: [], nextCursor: null }),
    );
    vi.stubGlobal('fetch', transport);
    render(
      <WorkspaceInvitations
        actor={actor}
        identity={identity}
        onActivityRecorded={() => {}}
        onWorkspaceAccessRejected={() => {}}
      />,
    );

    const emailInput = await screen.findByLabelText('Recipient email');
    const expiryInput = screen.getByLabelText('Expires in days');
    fireEvent.change(emailInput, { target: { value: 'not-an-email' } });
    fireEvent.change(expiryInput, { target: { value: '1.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send invitation' }));

    expect(screen.getByText('Enter a valid email address.')).toBeVisible();
    expect(
      screen.getByText('Enter a whole number between 1 and 30.'),
    ).toBeVisible();
    expect(emailInput).toHaveAttribute('aria-invalid', 'true');
    expect(expiryInput).toHaveAttribute('aria-invalid', 'true');
    expect(transport).toHaveBeenCalledTimes(1);

    fireEvent.change(emailInput, { target: { value: invitation.email } });
    for (const invalidExpiry of ['0', '31']) {
      fireEvent.change(expiryInput, { target: { value: invalidExpiry } });
      fireEvent.click(screen.getByRole('button', { name: 'Send invitation' }));
      expect(
        screen.getByText('Enter a whole number between 1 and 30.'),
      ).toBeVisible();
      expect(transport).toHaveBeenCalledTimes(1);
    }
  });

  it('requires confirmation to revoke and distinguishes local revocation from provider confirmation', async () => {
    const transport = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === 'POST'
        ? Response.json({
            ...invitation,
            status: 'revoked',
            revokedAt: invitation.createdAt,
          })
        : Response.json({ invitations: [invitation], nextCursor: null }),
    );
    vi.stubGlobal('fetch', transport);
    render(
      <WorkspaceInvitations
        actor={actor}
        identity={identity}
        onActivityRecorded={() => {}}
        onWorkspaceAccessRejected={() => {}}
      />,
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Revoke invitation' }),
    );
    expect(transport).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm revocation' }));
    await screen.findByText(
      'Revocation recorded. The email link still requires confirmation from Clerk.',
    );
  });
});

function LocaleChange({ locale }: { locale: InterfaceLocale }) {
  const { changeLocale } = useInterfaceLocale();
  return (
    <button type="button" onClick={() => changeLocale(locale)}>
      Passer en français
    </button>
  );
}
