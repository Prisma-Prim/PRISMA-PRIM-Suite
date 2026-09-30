import {
  fireEvent,
  render as testingLibraryRender,
  screen,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import {
  InterfaceLocaleProvider,
  interfaceLocaleStorageKey,
  type InterfaceLocale,
} from '../localization/interface-locale';
import { assertMessageCoverage } from '../localization/messages';
import { invitationAcceptanceMessages } from './invitation-acceptance.copy';
import { WorkspaceInvitationAcceptance } from './WorkspaceInvitationAcceptance';
import { workspaceInvitationsMessages } from './workspace-invitations.copy';
import { WorkspaceInvitations } from './WorkspaceInvitations';

const actor: ActorContext = {
  internalUserId: 'user-467',
  workspaceMembershipId: 'membership-467',
  workspaceId: 'workspace-467',
  workspaceName: 'PRISMA Workspace',
  displayName: 'Ada Ionescu',
  email: 'ada@example.test',
  active: true,
  workspacePermissions: ['member.invite'],
};
const identity: BrowserIdentity = {
  loaded: true,
  signedIn: true,
  getToken: async () => 'verified-token',
  signOut: async () => {},
  rejectSession: async () => {},
  signedOutView: null,
};
const invitationIntent = {
  invitationId: 'aaaaaaaa-0000-4000-8000-000000000467',
  key: 'bbbbbbbb-0000-4000-8000-000000000467',
  attempted: false,
};

const localeCases = [
  {
    locale: 'ro',
    adminTitle: 'Invitații în spațiul de lucru',
    send: 'Trimiteți invitația',
    recipientTitle: 'Alăturați-vă spațiului de lucru',
    accept: 'Acceptați invitația',
    pending: 'Invitație trimisă; se așteaptă folosirea ei.',
    date: '27 sept. 2026',
    loading: 'Se încarcă invitațiile…',
    empty: 'Nu există invitații pe această pagină.',
    forbidden: 'Nu mai aveți permisiunea de a gestiona invitațiile.',
    reload: 'Reîncărcați invitațiile',
  },
  {
    locale: 'ru',
    adminTitle: 'Приглашения в рабочее пространство',
    send: 'Отправить приглашение',
    recipientTitle: 'Присоединиться к рабочему пространству',
    accept: 'Принять приглашение',
    pending: 'Приглашение отправлено; ожидается его использование.',
    date: '27 сент. 2026',
    loading: 'Загрузка приглашений…',
    empty: 'На этой странице нет приглашений.',
    forbidden: 'У вас больше нет разрешения управлять приглашениями.',
    reload: 'Загрузить приглашения заново',
  },
  {
    locale: 'fr',
    adminTitle: 'Invitations à l’espace de travail',
    send: 'Envoyer l’invitation',
    recipientTitle: 'Rejoindre votre espace de travail',
    accept: 'Accepter l’invitation',
    pending: 'Invitation envoyée ; en attente d’utilisation.',
    date: '27 sept. 2026',
    loading: 'Chargement des invitations…',
    empty: 'Aucune invitation sur cette page.',
    forbidden: 'Vous n’avez plus l’autorisation de gérer les invitations.',
    reload: 'Recharger les invitations',
  },
  {
    locale: 'en',
    adminTitle: 'Workspace invitations',
    send: 'Send invitation',
    recipientTitle: 'Join your Workspace',
    accept: 'Accept invitation',
    pending: 'Invitation sent; awaiting use.',
    date: 'Sep 27, 2026',
    loading: 'Loading invitations…',
    empty: 'No invitations on this page.',
    forbidden: 'You no longer have permission to manage invitations.',
    reload: 'Reload invitations',
  },
] as const satisfies readonly Readonly<{
  locale: InterfaceLocale;
  adminTitle: string;
  send: string;
  recipientTitle: string;
  accept: string;
  pending: string;
  date: string;
  loading: string;
  empty: string;
  forbidden: string;
  reload: string;
}>[];

const validationCases = [
  {
    locale: 'ro',
    email: 'E-mailul destinatarului',
    expiry: 'Expiră în zile',
    send: 'Trimiteți invitația',
    emailRequired: 'Introduceți e-mailul destinatarului.',
    expiryRequired: 'Introduceți numărul de zile până la expirare.',
    emailInvalid: 'Introduceți o adresă de e-mail validă.',
    expiryInvalid: 'Introduceți un număr întreg între 1 și 30.',
  },
  {
    locale: 'ru',
    email: 'Электронная почта получателя',
    expiry: 'Срок действия в днях',
    send: 'Отправить приглашение',
    emailRequired: 'Введите адрес электронной почты получателя.',
    expiryRequired: 'Введите количество дней до истечения срока.',
    emailInvalid: 'Введите действительный адрес электронной почты.',
    expiryInvalid: 'Введите целое число от 1 до 30.',
  },
  {
    locale: 'fr',
    email: 'E-mail du destinataire',
    expiry: 'Expire dans ce nombre de jours',
    send: 'Envoyer l’invitation',
    emailRequired: 'Saisissez l’e-mail du destinataire.',
    expiryRequired: 'Saisissez le nombre de jours avant l’expiration.',
    emailInvalid: 'Saisissez une adresse e-mail valide.',
    expiryInvalid: 'Saisissez un nombre entier compris entre 1 et 30.',
  },
  {
    locale: 'en',
    email: 'Recipient email',
    expiry: 'Expires in days',
    send: 'Send invitation',
    emailRequired: 'Enter the recipient email.',
    expiryRequired: 'Enter the number of days before expiry.',
    emailInvalid: 'Enter a valid email address.',
    expiryInvalid: 'Enter a whole number between 1 and 30.',
  },
] as const satisfies readonly Readonly<{
  locale: InterfaceLocale;
  email: string;
  expiry: string;
  send: string;
  emailRequired: string;
  expiryRequired: string;
  emailInvalid: string;
  expiryInvalid: string;
}>[];

const invitation = {
  id: 'invitation-467',
  email: 'recipient@example.test',
  status: 'pending',
  deliveryStatus: 'pending',
  expiresAt: '2026-09-27T12:00:00.000Z',
  createdAt: '2026-09-20T12:00:00.000Z',
  revokedAt: null,
  consumedAt: null,
  nextCheckAt: '2026-09-27T12:05:00.000Z',
};

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

describe('localized Workspace invitation boundaries', () => {
  it('has release-complete Romanian, Russian, French and English catalogs', () => {
    expect(() =>
      assertMessageCoverage(
        'workspace-invitations',
        workspaceInvitationsMessages,
      ),
    ).not.toThrow();
    expect(() =>
      assertMessageCoverage(
        'invitation-acceptance',
        invitationAcceptanceMessages,
      ),
    ).not.toThrow();
  });

  it.each(localeCases)(
    'renders the administrative boundary in $locale',
    async ({ locale, adminTitle, send, pending, date }) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          Response.json({ invitations: [invitation], nextCursor: null }),
        ),
      );
      renderAtLocale(
        locale,
        <WorkspaceInvitations
          actor={actor}
          identity={identity}
          onActivityRecorded={() => {}}
          onWorkspaceAccessRejected={() => {}}
        />,
      );

      expect(
        await screen.findByRole('heading', { name: adminTitle }),
      ).toBeVisible();
      expect(screen.getByRole('button', { name: send })).toBeVisible();
      expect(screen.getByText(pending)).toBeVisible();
      expect(screen.getAllByText(new RegExp(date, 'u'))).not.toHaveLength(0);
      expect(screen.queryByText(invitation.expiresAt)).toBeNull();
      expect(screen.queryByText(/workspaceInvitations\./u)).toBeNull();
    },
  );

  it.each(localeCases)(
    'renders the recipient boundary in $locale',
    ({ locale, recipientTitle, accept }) => {
      renderAtLocale(
        locale,
        <WorkspaceInvitationAcceptance
          identity={identity}
          intent={invitationIntent}
        />,
      );

      expect(
        screen.getByRole('heading', { name: recipientTitle }),
      ).toBeVisible();
      expect(screen.getByRole('button', { name: accept })).toBeVisible();
      expect(screen.queryByText(/invitationAcceptance\./u)).toBeNull();
    },
  );

  it.each(validationCases)(
    'renders invitation-owned validation in $locale without sending invalid commands',
    async ({
      locale,
      email,
      expiry,
      send,
      emailRequired,
      expiryRequired,
      emailInvalid,
      expiryInvalid,
    }) => {
      const transport = vi.fn(async () =>
        Response.json({ invitations: [], nextCursor: null }),
      );
      vi.stubGlobal('fetch', transport);
      renderAtLocale(
        locale,
        <WorkspaceInvitations
          actor={actor}
          identity={identity}
          onActivityRecorded={() => {}}
          onWorkspaceAccessRejected={() => {}}
        />,
      );

      const emailInput = await screen.findByLabelText(email);
      const expiryInput = screen.getByLabelText(expiry);
      fireEvent.change(expiryInput, { target: { value: '' } });
      fireEvent.click(screen.getByRole('button', { name: send }));
      expect(await screen.findByText(emailRequired)).toBeVisible();
      expect(screen.getByText(expiryRequired)).toBeVisible();

      fireEvent.change(emailInput, { target: { value: 'invalid-email' } });
      fireEvent.change(expiryInput, { target: { value: '1.5' } });
      fireEvent.click(screen.getByRole('button', { name: send }));
      expect(await screen.findByText(emailInvalid)).toBeVisible();
      expect(screen.getByText(expiryInvalid)).toBeVisible();
      expect(transport).toHaveBeenCalledTimes(1);
    },
  );

  it.each(localeCases)(
    'renders loading, empty, failure and permission states in $locale',
    async ({ locale, loading, empty, forbidden, reload }) => {
      let response: 'loading' | 'empty' | 'error' | 'forbidden' = 'loading';
      const pending = new Promise<Response>(() => {});
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          switch (response) {
            case 'loading':
              return pending;
            case 'empty':
              return Response.json({ invitations: [], nextCursor: null });
            case 'error':
              return new Response(null, { status: 503 });
            case 'forbidden':
              return new Response(null, { status: 403 });
          }
        }),
      );
      let view = renderAtLocale(
        locale,
        <WorkspaceInvitations
          actor={actor}
          identity={identity}
          onActivityRecorded={() => {}}
          onWorkspaceAccessRejected={() => {}}
        />,
      );
      expect(screen.getByRole('status')).toHaveTextContent(loading);

      response = 'empty';
      view.unmount();
      view = renderAtLocale(
        locale,
        <WorkspaceInvitations
          actor={actor}
          identity={identity}
          onActivityRecorded={() => {}}
          onWorkspaceAccessRejected={() => {}}
        />,
      );
      expect(await screen.findByText(empty)).toBeVisible();

      response = 'error';
      view.unmount();
      view = renderAtLocale(
        locale,
        <WorkspaceInvitations
          actor={actor}
          identity={identity}
          onActivityRecorded={() => {}}
          onWorkspaceAccessRejected={() => {}}
        />,
      );
      expect(await screen.findByRole('button', { name: reload })).toBeVisible();

      response = 'forbidden';
      view.unmount();
      renderAtLocale(
        locale,
        <WorkspaceInvitations
          actor={actor}
          identity={identity}
          onActivityRecorded={() => {}}
          onWorkspaceAccessRejected={() => {}}
        />,
      );
      expect(await screen.findByRole('alert')).toHaveTextContent(forbidden);
    },
  );
});

function renderAtLocale(locale: InterfaceLocale, children: ReactNode) {
  localStorage.setItem(interfaceLocaleStorageKey, locale);
  return testingLibraryRender(
    <InterfaceLocaleProvider>{children}</InterfaceLocaleProvider>,
  );
}
