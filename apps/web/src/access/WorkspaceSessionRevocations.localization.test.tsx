import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { InterfaceLocaleProvider } from '../localization/interface-locale';
import { InterfaceLocaleSelect } from '../localization/InterfaceLocaleSelect';
import { WorkspaceSessionRevocations } from './WorkspaceSessionRevocations';

const actor: ActorContext = {
  internalUserId: '00000000-0000-4000-8000-000000000001',
  workspaceMembershipId: '00000000-0000-4000-8000-000000000002',
  workspaceId: '00000000-0000-4000-8000-000000000003',
  workspaceName: 'Workspace',
  displayName: 'Ana',
  email: 'ana@example.test',
  active: true,
  workspacePermissions: ['company.assignment.manage'],
};

afterEach(() => vi.unstubAllGlobals());

it('starts the session-revocation journey in Romanian without a saved locale', () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  render(
    <InterfaceLocaleProvider>
      <InterfaceLocaleSelect />
      <WorkspaceSessionRevocations
        actor={actor}
        identity={deterministicBrowserIdentity()}
        onWorkspaceAccessRejected={vi.fn()}
        onActivityRecorded={vi.fn()}
      />
    </InterfaceLocaleProvider>,
  );
  expect(
    screen.getByRole('button', { name: 'Verifică revocarea sesiunilor' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('heading', {
      name: 'Sesiunile furnizorului de identitate',
    }),
  ).toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});

const memberId = '11111111-1111-4111-8111-111111111111';
const names = ['Ana {originală}', 'Борис {имя}', 'Camille', 'Daniel'];
const records = [
  { workspaceMembershipId: memberId, displayName: names[0], status: 'pending' },
  {
    workspaceMembershipId: '22222222-2222-4222-8222-222222222222',
    displayName: names[1],
    status: 'running',
  },
  {
    workspaceMembershipId: '33333333-3333-4333-8333-333333333333',
    displayName: names[2],
    status: 'retry_required',
  },
  {
    workspaceMembershipId: '44444444-4444-4444-8444-444444444444',
    displayName: names[3],
    status: 'complete',
  },
];
const cursor = '55555555-5555-4555-8555-555555555555';
const localeCases = [
  {
    option: 'Română',
    description:
      'Membrii suspendați rămân blocați în acest spațiu de lucru chiar dacă revocarea sesiunilor necesită o nouă încercare. Revocarea deconectează persoana din toate sesiunile acestei aplicații, inclusiv cele folosite pentru alte spații de lucru.',
    title: 'Sesiunile furnizorului de identitate',
    refresh: 'Verifică revocarea sesiunilor',
    retry: 'Reîncearcă revocarea sesiunilor',
    more: 'Următorii membri suspendați',
    loading: 'Se verifică revocarea sesiunilor…',
    empty: 'Nu există membri suspendați pe această pagină.',
    error:
      'Starea revocării sesiunilor nu a putut fi verificată. Accesul la spațiul de lucru rămâne suspendat.',
    statuses: [
      'Revocarea sesiunilor este în așteptare.',
      'Revocarea sesiunilor este în curs. Verifică din nou în curând.',
      'Revocarea sesiunilor necesită o nouă încercare. Reîncearcă după 30 de secunde.',
      'Sesiunile existente ale furnizorului au fost revocate. Accesul la spațiul de lucru rămâne suspendat.',
    ],
  },
  {
    option: 'Русский',
    description:
      'Участники с приостановленным доступом остаются заблокированными в этом рабочем пространстве, даже если отзыв сеансов требует ещё одной попытки. Отзыв завершает все сеансы человека в этом приложении, включая сеансы для других рабочих пространств.',
    title: 'Сеансы поставщика идентификации',
    refresh: 'Проверить отзыв сеансов',
    retry: 'Повторить отзыв сеансов',
    more: 'Следующие участники с приостановленным доступом',
    loading: 'Проверка отзыва сеансов…',
    empty: 'На этой странице нет участников с приостановленным доступом.',
    error:
      'Не удалось проверить состояние отзыва сеансов. Доступ к рабочему пространству остаётся приостановленным.',
    statuses: [
      'Отзыв сеансов ожидает выполнения.',
      'Отзыв сеансов выполняется. Проверьте ещё раз чуть позже.',
      'Требуется ещё одна попытка отзыва сеансов. Повторите через 30 секунд.',
      'Существующие сеансы поставщика отозваны. Доступ к рабочему пространству остаётся приостановленным.',
    ],
  },
  {
    option: 'Français',
    description:
      'Les membres suspendus restent bloqués dans cet espace de travail même si la révocation des sessions nécessite une nouvelle tentative. La révocation déconnecte la personne de toutes ses sessions dans cette application, y compris celles utilisées pour d’autres espaces de travail.',
    title: 'Sessions du fournisseur d’identité',
    refresh: 'Vérifier la révocation des sessions',
    retry: 'Réessayer la révocation des sessions',
    more: 'Membres suspendus suivants',
    loading: 'Vérification de la révocation des sessions…',
    empty: 'Aucun membre suspendu sur cette page.',
    error:
      'Impossible de vérifier la révocation des sessions. L’accès à l’espace de travail reste suspendu.',
    statuses: [
      'Révocation des sessions en attente.',
      'Révocation des sessions en cours. Vérifiez à nouveau dans un instant.',
      'La révocation des sessions nécessite une nouvelle tentative. Réessayez après 30 secondes.',
      'Les sessions existantes du fournisseur sont révoquées. L’accès à l’espace de travail reste suspendu.',
    ],
  },
  {
    option: 'English',
    description:
      'Suspended members remain blocked from this Workspace even if session revocation needs another attempt. Revocation signs the person out of all sessions in this application, including sessions used for other Workspaces.',
    title: 'Identity-provider sessions',
    refresh: 'Check session revocations',
    retry: 'Retry session revocation',
    more: 'Next suspended members',
    loading: 'Checking session revocations…',
    empty: 'No suspended members on this page.',
    error:
      'Session revocation status could not be verified. Workspace access remains suspended.',
    statuses: [
      'Session revocation pending.',
      'Session revocation in progress. Check again shortly.',
      'Session revocation needs another attempt. Retry after 30 seconds.',
      'Existing provider sessions revoked. Workspace access remains suspended.',
    ],
  },
] as const;

function switchLocale(option: string) {
  fireEvent.click(screen.getByRole('combobox'));
  fireEvent.click(screen.getByRole('option', { name: option }));
}

function deferredResponse() {
  let resolve: ((response: Response) => void) | undefined;
  const promise = new Promise<Response>((deliver) => {
    resolve = deliver;
  });
  return {
    promise,
    deliver(response: Response) {
      if (!resolve) throw new Error('Deferred response was not initialized');
      resolve(response);
    },
  };
}

it('preserves loaded members, all canonical statuses and a delayed explicit retry across all four locales', async () => {
  const retry = deferredResponse();
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ records, nextCursor: cursor }))
    .mockReturnValueOnce(retry.promise)
    .mockResolvedValueOnce(
      Response.json({
        records: [{ ...records[0], status: 'complete' }],
        nextCursor: null,
      }),
    );
  vi.stubGlobal('fetch', fetch);
  const activity = vi.fn();
  const rejectWorkspace = vi.fn();
  const rejectSession = vi.fn();
  render(
    <InterfaceLocaleProvider>
      <InterfaceLocaleSelect />
      <WorkspaceSessionRevocations
        actor={actor}
        identity={{ ...deterministicBrowserIdentity(), rejectSession }}
        onWorkspaceAccessRejected={rejectWorkspace}
        onActivityRecorded={activity}
      />
    </InterfaceLocaleProvider>,
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Verifică revocarea sesiunilor' }),
  );
  await screen.findByText('Ana {originală}');
  for (const locale of localeCases) {
    switchLocale(locale.option);
    expect(
      screen.getByRole('heading', { name: locale.title }),
    ).toBeInTheDocument();
    expect(screen.getByText(locale.description)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: locale.more }),
    ).toBeInTheDocument();
    for (const status of locale.statuses)
      expect(screen.getByText(status)).toBeInTheDocument();
    for (const name of names)
      expect(screen.getByText(name)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledOnce();
  }
  fireEvent.click(
    screen.getAllByRole('button', { name: 'Retry session revocation' })[0],
  );
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  for (const locale of localeCases) {
    switchLocale(locale.option);
    expect(screen.getByRole('status')).toHaveTextContent(locale.loading);
    expect(screen.getByRole('button', { name: locale.refresh })).toBeDisabled();
    expect(fetch).toHaveBeenCalledTimes(2);
  }
  await act(async () => {
    retry.deliver(Response.json({ status: 'checked' }));
  });
  await screen.findByText(
    'Existing provider sessions revoked. Workspace access remains suspended.',
  );
  expect(fetch.mock.calls[1]?.[0]).toBe(
    `/api/workspace-session-revocations/${memberId}/retry`,
  );
  expect(fetch.mock.calls[1]?.[1]).toMatchObject({
    method: 'POST',
    body: undefined,
  });
  expect(fetch.mock.calls[2]?.[0]).toBe('/api/workspace-session-revocations');
  expect(activity).toHaveBeenCalledOnce();
  expect(rejectWorkspace).not.toHaveBeenCalled();
  expect(rejectSession).not.toHaveBeenCalled();
});

it('translates delayed reads, failed status verification and empty-page continuation without implicit requests', async () => {
  const read = deferredResponse();
  const fetch = vi
    .fn()
    .mockReturnValueOnce(read.promise)
    .mockResolvedValueOnce(Response.json({ records: [], nextCursor: cursor }))
    .mockResolvedValueOnce(
      Response.json({ records: [records[0]], nextCursor: null }),
    );
  vi.stubGlobal('fetch', fetch);
  render(
    <InterfaceLocaleProvider>
      <InterfaceLocaleSelect />
      <WorkspaceSessionRevocations
        actor={actor}
        identity={deterministicBrowserIdentity()}
        onWorkspaceAccessRejected={vi.fn()}
        onActivityRecorded={vi.fn()}
      />
    </InterfaceLocaleProvider>,
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Verifică revocarea sesiunilor' }),
  );
  await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  for (const locale of localeCases) {
    switchLocale(locale.option);
    expect(screen.getByRole('status')).toHaveTextContent(locale.loading);
    expect(fetch).toHaveBeenCalledOnce();
  }
  await act(async () => {
    read.deliver(
      Response.json({
        records: [
          { displayName: 'Hidden malformed member', status: 'complete' },
        ],
        nextCursor: null,
      }),
    );
  });
  await screen.findByRole('alert');
  for (const locale of localeCases) {
    switchLocale(locale.option);
    expect(screen.getByRole('alert')).toHaveTextContent(locale.error);
    expect(
      screen.queryByText('Hidden malformed member'),
    ).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledOnce();
  }
  fireEvent.click(
    screen.getByRole('button', { name: 'Check session revocations' }),
  );
  await screen.findByText('No suspended members on this page.');
  for (const locale of localeCases) {
    switchLocale(locale.option);
    expect(screen.getByText(locale.empty)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: locale.more }),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
  }
  fireEvent.click(
    screen.getByRole('button', { name: 'Next suspended members' }),
  );
  await screen.findByText('Ana {originală}');
  expect(fetch.mock.calls[2]?.[0]).toBe(
    `/api/workspace-session-revocations?after=${cursor}`,
  );
  switchLocale('Русский');
  expect(
    screen.getByText('Отзыв сеансов ожидает выполнения.'),
  ).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(3);
});

it.each(['identity', 'Workspace', 'membership', 'permission'] as const)(
  'suppresses a delayed read after %s replacement even when the locale changes',
  async (boundary) => {
    const read = deferredResponse();
    const fetch = vi.fn().mockReturnValueOnce(read.promise);
    vi.stubGlobal('fetch', fetch);
    const props = {
      actor,
      identity: deterministicBrowserIdentity(),
      onWorkspaceAccessRejected: vi.fn(),
      onActivityRecorded: vi.fn(),
    };
    const tree = (current: typeof props) => (
      <InterfaceLocaleProvider>
        <InterfaceLocaleSelect />
        <WorkspaceSessionRevocations {...current} />
      </InterfaceLocaleProvider>
    );
    const view = render(tree(props));
    fireEvent.click(
      screen.getByRole('button', { name: 'Verifică revocarea sesiunilor' }),
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    switchLocale('Русский');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Проверка отзыва сеансов…',
    );
    let next: typeof props;
    switch (boundary) {
      case 'identity':
        next = { ...props, identity: deterministicBrowserIdentity() };
        break;
      case 'Workspace':
        next = {
          ...props,
          actor: {
            ...actor,
            workspaceId: '99999999-9999-4999-8999-999999999999',
          },
        };
        break;
      case 'membership':
        next = {
          ...props,
          actor: {
            ...actor,
            workspaceMembershipId: '99999999-9999-4999-8999-999999999999',
          },
        };
        break;
      case 'permission':
        next = { ...props, actor: { ...actor, workspacePermissions: [] } };
        break;
      default: {
        const exhaustive: never = boundary;
        throw new Error(`Unexpected boundary: ${exhaustive}`);
      }
    }
    view.rerender(tree(next));
    await act(async () => {
      read.deliver(Response.json({ records, nextCursor: cursor }));
    });
    expect(screen.queryByText('Ana {originală}')).not.toBeInTheDocument();
    expect(screen.queryByText('Борис {имя}')).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledOnce();
    expect(props.onActivityRecorded).not.toHaveBeenCalled();
    expect(props.onWorkspaceAccessRejected).not.toHaveBeenCalled();
  },
);
