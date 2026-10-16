import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { InterfaceLocaleProvider } from '../localization/interface-locale';
import { InterfaceLocaleSelect } from '../localization/InterfaceLocaleSelect';
import { changeValue } from '../test/select-option';
import { CompanyContextAccess } from './CompanyContextAccess';
import { WorkspaceMembershipSuspension } from './WorkspaceMembershipSuspension';

const actor: ActorContext = {
  internalUserId: '00000000-0000-4000-8000-000000000001',
  workspaceMembershipId: '00000000-0000-4000-8000-000000000002',
  workspaceId: '00000000-0000-4000-8000-000000000003',
  workspaceName: 'Atelier {origine} / Пространство',
  displayName: 'Ana',
  email: 'ana@example.test',
  active: true,
  workspacePermissions: ['company.assignment.manage'],
};
const memberId = '11111111-1111-4111-8111-111111111111';
const memberLabel = 'Ana {originală} / Борис {имя} — ana@example.test';
const members = [{ workspaceMembershipId: memberId, label: memberLabel }];

function suspensionProps() {
  return {
    actor,
    identity: deterministicBrowserIdentity(),
    members,
    disabled: false,
    reloadAdministration: vi.fn(async () => true),
    onPendingChange: vi.fn(),
    onActivityRecorded: vi.fn(),
    onWorkspaceAccessRejected: vi.fn(),
  };
}

afterEach(() => vi.unstubAllGlobals());

it('starts the real member suspension review in Romanian without a saved locale', () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  render(
    <InterfaceLocaleProvider>
      <InterfaceLocaleSelect />
      <WorkspaceMembershipSuspension {...suspensionProps()} />
    </InterfaceLocaleProvider>,
  );
  changeValue(
    screen.getByRole('combobox', {
      name: 'Membru de suspendat',
    }),
    memberId,
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Examinează suspendarea' }),
  );
  expect(
    within(
      screen.getByRole('region', {
        name: 'Confirmă suspendarea accesului la spațiul de lucru',
      }),
    ).getByText(memberLabel),
  ).toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});

const localeCases = [
  {
    option: 'Română',
    title: 'Acces la spațiul de lucru',
    description:
      'Suspendă accesul unui membru activ fără a șterge identitatea, atribuirile sau istoricul.',
    member: 'Membru de suspendat',
    select: 'Selectează un membru',
    review: 'Examinează suspendarea',
    region: 'Confirmă suspendarea accesului la spațiul de lucru',
    warning:
      'Accesul la aplicație va fi oprit. Identitatea, atribuirile și istoricul vor fi păstrate. Sesiunile existente ale furnizorului de identitate vor fi, de asemenea, revocate în întreaga aplicație.',
    selected: 'Membru selectat',
    cancel: 'Anulează',
    confirm: 'Suspendă accesul',
    pending: 'Se suspendă accesul la spațiul de lucru…',
    success: 'Membrul a fost suspendat. Starea serverului a fost actualizată.',
    error:
      'Suspendarea nu a putut fi finalizată. Starea serverului a fost actualizată.',
    empty: 'Nu există niciun membru activ disponibil pentru suspendare.',
  },
  {
    option: 'Русский',
    title: 'Доступ к рабочему пространству',
    description:
      'Приостановите доступ действующего участника без удаления идентификационных данных, назначений или истории.',
    member: 'Участник для приостановки доступа',
    select: 'Выберите участника',
    review: 'Проверить приостановку доступа',
    region: 'Подтвердить приостановку доступа к рабочему пространству',
    warning:
      'Доступ к приложению будет прекращён. Идентификационные данные, назначения и история будут сохранены. Существующие сеансы поставщика идентификации также будут отозваны во всём приложении.',
    selected: 'Выбранный участник',
    cancel: 'Отмена',
    confirm: 'Приостановить доступ',
    pending: 'Приостановка доступа к рабочему пространству…',
    success: 'Доступ участника приостановлен. Состояние сервера обновлено.',
    error:
      'Не удалось завершить приостановку доступа. Состояние сервера обновлено.',
    empty: 'Нет действующих участников для приостановки доступа.',
  },
  {
    option: 'Français',
    title: 'Accès à l’espace de travail',
    description:
      'Suspendez l’accès d’un membre actif sans supprimer son identité, ses attributions ou son historique.',
    member: 'Membre à suspendre',
    select: 'Sélectionnez un membre',
    review: 'Examiner la suspension',
    region: 'Confirmer la suspension de l’accès à l’espace de travail',
    warning:
      'L’accès à l’application sera interrompu. L’identité, les attributions et l’historique seront conservés. Les sessions existantes du fournisseur d’identité seront également révoquées dans toute l’application.',
    selected: 'Membre sélectionné',
    cancel: 'Annuler',
    confirm: 'Suspendre l’accès',
    pending: 'Suspension de l’accès à l’espace de travail…',
    success: 'Membre suspendu. L’état du serveur a été actualisé.',
    error:
      'La suspension n’a pas pu être terminée. L’état du serveur a été actualisé.',
    empty: 'Aucun membre actif n’est disponible pour une suspension.',
  },
  {
    option: 'English',
    title: 'Workspace access',
    description:
      'Suspend an active member without deleting their identity, assignments, or history.',
    member: 'Member to suspend',
    select: 'Select a member',
    review: 'Review suspension',
    region: 'Confirm Workspace access suspension',
    warning:
      'Their application access will stop. Their identity, assignments, and history will be preserved. Existing identity-provider sessions will also be revoked across this application.',
    selected: 'Selected member',
    cancel: 'Cancel',
    confirm: 'Suspend access',
    pending: 'Suspending Workspace access…',
    success: 'Member suspended. Server state refreshed.',
    error: 'The suspension could not be completed. Server state was refreshed.',
    empty: 'No active member is available for suspension.',
  },
] as const;

function switchLocale(option: string) {
  fireEvent.click(
    screen.getByRole('combobox', {
      name: /Limba interfeței|Язык интерфейса|Langue de l’interface|Interface language/u,
    }),
  );
  fireEvent.click(screen.getByRole('option', { name: option }));
}

function tree(props: ReturnType<typeof suspensionProps>) {
  return (
    <InterfaceLocaleProvider>
      <InterfaceLocaleSelect />
      <WorkspaceMembershipSuspension {...props} />
    </InterfaceLocaleProvider>
  );
}

function deferredResponse() {
  let deliver: ((response: Response) => void) | undefined;
  const promise = new Promise<Response>((resolve) => {
    deliver = resolve;
  });
  return {
    promise,
    resolve(response: Response) {
      if (!deliver) throw new Error('Deferred response was not initialized');
      deliver(response);
    },
  };
}

it('preserves selection, open confirmation, cancellation and delayed success through all four locales without implicit work', async () => {
  const response = deferredResponse();
  const fetch = vi.fn().mockReturnValueOnce(response.promise);
  vi.stubGlobal('fetch', fetch);
  const props = suspensionProps();
  render(tree(props));
  for (const locale of localeCases) {
    switchLocale(locale.option);
    expect(
      screen.getByRole('heading', { name: locale.title }),
    ).toBeInTheDocument();
    expect(screen.getByText(locale.description)).toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: locale.member }),
    ).toHaveTextContent(locale.select);
    expect(screen.getByRole('button', { name: locale.review })).toBeDisabled();
  }
  changeValue(
    screen.getByRole('combobox', { name: 'Member to suspend' }),
    memberId,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Review suspension' }));
  for (const locale of localeCases) {
    switchLocale(locale.option);
    expect(screen.getByRole('combobox', { name: locale.member })).toHaveValue(
      memberId,
    );
    expect(
      screen.getByRole('combobox', { name: locale.member }),
    ).toHaveTextContent(memberLabel);
    const confirmation = screen.getByRole('region', { name: locale.region });
    expect(within(confirmation).getByText(memberLabel)).toBeInTheDocument();
    expect(
      within(confirmation).getByText(new RegExp(`^${locale.selected}:`, 'u')),
    ).toBeInTheDocument();
    expect(within(confirmation).getByText(locale.warning)).toBeInTheDocument();
    expect(
      within(confirmation).getByRole('button', { name: locale.cancel }),
    ).toBeEnabled();
    expect(fetch).not.toHaveBeenCalled();
    expect(props.reloadAdministration).not.toHaveBeenCalled();
    expect(props.onPendingChange).not.toHaveBeenCalled();
  }
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(
    screen.queryByRole('region', {
      name: 'Confirm Workspace access suspension',
    }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('combobox', { name: 'Member to suspend' }),
  ).toHaveValue(memberId);
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Review suspension' }));
  fireEvent.click(screen.getByRole('button', { name: 'Suspend access' }));
  await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  for (const locale of localeCases) {
    switchLocale(locale.option);
    expect(screen.getByRole('status')).toHaveTextContent(locale.pending);
    expect(
      screen.getByRole('combobox', { name: locale.member }),
    ).toBeDisabled();
    expect(screen.getByRole('combobox', { name: locale.member })).toHaveValue(
      memberId,
    );
    expect(screen.getByRole('button', { name: locale.review })).toBeDisabled();
    expect(fetch).toHaveBeenCalledOnce();
    expect(props.onPendingChange).toHaveBeenCalledExactlyOnceWith(true);
    expect(props.reloadAdministration).not.toHaveBeenCalled();
  }
  await act(async () =>
    response.resolve(
      Response.json(
        { workspaceMembershipId: memberId, status: 'inactive' },
        { status: 201 },
      ),
    ),
  );
  await screen.findByText('Member suspended. Server state refreshed.');
  expect(fetch.mock.calls[0]?.[0]).toBe(
    '/api/workspace-membership-suspensions',
  );
  expect(fetch.mock.calls[0]?.[1]).toMatchObject({
    method: 'POST',
    credentials: 'include',
    body: JSON.stringify({ workspaceMembershipId: memberId }),
  });
  const headers = new Headers(fetch.mock.calls[0]?.[1]?.headers);
  expect([...headers.keys()].sort()).toEqual([
    'content-type',
    'idempotency-key',
  ]);
  expect(headers.get('content-type')).toBe('application/json');
  expect(headers.get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/u);
  expect(props.onActivityRecorded).toHaveBeenCalledOnce();
  expect(props.reloadAdministration).toHaveBeenCalledOnce();
  expect(props.onPendingChange.mock.calls).toEqual([[true], [false]]);
  expect(props.onWorkspaceAccessRejected).not.toHaveBeenCalled();
  for (const locale of localeCases) {
    switchLocale(locale.option);
    expect(screen.getByRole('status')).toHaveTextContent(locale.success);
    expect(screen.getByRole('combobox', { name: locale.member })).toHaveValue(
      '',
    );
    expect(fetch).toHaveBeenCalledOnce();
  }
});

it('retains the existing explicit retry command across translated failure and re-review', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 409 }))
    .mockResolvedValueOnce(
      Response.json(
        { workspaceMembershipId: memberId, status: 'inactive' },
        { status: 201 },
      ),
    );
  vi.stubGlobal('fetch', fetch);
  const props = suspensionProps();
  render(tree(props));
  changeValue(
    screen.getByRole('combobox', { name: 'Membru de suspendat' }),
    memberId,
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Examinează suspendarea' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Suspendă accesul' }));
  await screen.findByRole('alert');
  for (const locale of localeCases) {
    switchLocale(locale.option);
    expect(screen.getByRole('alert')).toHaveTextContent(locale.error);
    expect(screen.getByRole('combobox', { name: locale.member })).toHaveValue(
      memberId,
    );
    expect(fetch).toHaveBeenCalledOnce();
    expect(props.reloadAdministration).toHaveBeenCalledOnce();
    expect(props.onActivityRecorded).not.toHaveBeenCalled();
  }
  fireEvent.click(screen.getByRole('button', { name: 'Review suspension' }));
  switchLocale('Français');
  expect(
    screen.getByRole('region', {
      name: 'Confirmer la suspension de l’accès à l’espace de travail',
    }),
  ).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Suspendre l’accès' }));
  await screen.findByText(
    'Membre suspendu. L’état du serveur a été actualisé.',
  );
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[1]?.[0]).toBe(fetch.mock.calls[0]?.[0]);
  expect(fetch.mock.calls[1]?.[1]?.body).toBe(fetch.mock.calls[0]?.[1]?.body);
  expect(
    new Headers(fetch.mock.calls[1]?.[1]?.headers).get('idempotency-key'),
  ).toBe(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('idempotency-key'));
  expect(props.reloadAdministration).toHaveBeenCalledTimes(2);
  expect(props.onActivityRecorded).toHaveBeenCalledOnce();
  expect(props.onPendingChange.mock.calls).toEqual([
    [true],
    [false],
    [true],
    [false],
  ]);
});

it('translates the empty state and preserves caller-disabled controls without making requests', () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const props = suspensionProps();
  const view = render(tree({ ...props, disabled: true }));
  for (const locale of localeCases) {
    switchLocale(locale.option);
    expect(
      screen.getByRole('combobox', { name: locale.member }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: locale.review })).toBeDisabled();
  }
  view.rerender(tree({ ...props, members: [] }));
  for (const locale of localeCases) {
    switchLocale(locale.option);
    expect(screen.getByText(locale.empty)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: locale.review }),
    ).not.toBeInTheDocument();
  }
  expect(fetch).not.toHaveBeenCalled();
  expect(props.onPendingChange).not.toHaveBeenCalled();
});

it.each([
  'identity',
  'Internal User',
  'Workspace',
  'membership',
  'unmount',
] as const)(
  'suppresses a delayed suspension after %s replacement despite a locale change',
  async (boundary) => {
    const response = deferredResponse();
    const fetch = vi.fn().mockReturnValueOnce(response.promise);
    vi.stubGlobal('fetch', fetch);
    const props = suspensionProps();
    const view = render(tree(props));
    changeValue(
      screen.getByRole('combobox', { name: 'Membru de suspendat' }),
      memberId,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Examinează suspendarea' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Suspendă accesul' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const signal = fetch.mock.calls[0]?.[1]?.signal;
    switchLocale('Français');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Suspension de l’accès à l’espace de travail…',
    );
    const replacementId = '99999999-9999-4999-8999-999999999999';
    switch (boundary) {
      case 'identity':
        view.rerender(
          tree({ ...props, identity: deterministicBrowserIdentity() }),
        );
        break;
      case 'Internal User':
        view.rerender(
          tree({
            ...props,
            actor: { ...actor, internalUserId: replacementId },
          }),
        );
        break;
      case 'Workspace':
        view.rerender(
          tree({ ...props, actor: { ...actor, workspaceId: replacementId } }),
        );
        break;
      case 'membership':
        view.rerender(
          tree({
            ...props,
            actor: { ...actor, workspaceMembershipId: replacementId },
          }),
        );
        break;
      case 'unmount':
        view.unmount();
        break;
      default: {
        const exhaustive: never = boundary;
        throw new Error(`Unexpected replacement: ${exhaustive}`);
      }
    }
    expect(signal?.aborted).toBe(true);
    await act(async () =>
      response.resolve(
        Response.json(
          { workspaceMembershipId: memberId, status: 'inactive' },
          { status: 201 },
        ),
      ),
    );
    expect(props.reloadAdministration).not.toHaveBeenCalled();
    expect(props.onActivityRecorded).not.toHaveBeenCalled();
    expect(props.onWorkspaceAccessRejected).not.toHaveBeenCalled();
    expect(props.onPendingChange).toHaveBeenLastCalledWith(false);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledOnce();
    if (boundary !== 'unmount') {
      expect(
        screen.getByRole('combobox', { name: 'Membre à suspendre' }),
      ).toHaveValue('');
      expect(
        screen.queryByRole('region', {
          name: 'Confirmer la suspension de l’accès à l’espace de travail',
        }),
      ).not.toBeInTheDocument();
    }
  },
);

it('removes an obsolete confirmation when the selected member disappears without making a command', () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const props = suspensionProps();
  const view = render(tree(props));
  changeValue(
    screen.getByRole('combobox', { name: 'Membru de suspendat' }),
    memberId,
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Examinează suspendarea' }),
  );
  switchLocale('Русский');
  view.rerender(tree({ ...props, members: [] }));
  expect(
    screen.queryByRole('region', {
      name: 'Подтвердить приостановку доступа к рабочему пространству',
    }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText('Нет действующих участников для приостановки доступа.'),
  ).toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
  expect(props.onPendingChange).not.toHaveBeenCalled();
});

it.each(['external session rejection', 'self suspension'] as const)(
  'preserves %s callbacks after a pending locale switch',
  async (outcome) => {
    const response = deferredResponse();
    const fetch = vi.fn().mockReturnValueOnce(response.promise);
    vi.stubGlobal('fetch', fetch);
    const props = suspensionProps();
    const rejectSession = vi.fn(async () => undefined);
    props.identity.rejectSession = rejectSession;
    const target =
      outcome === 'self suspension' ? actor.workspaceMembershipId : memberId;
    render(
      tree({
        ...props,
        members: [{ workspaceMembershipId: target, label: memberLabel }],
      }),
    );
    changeValue(
      screen.getByRole('combobox', { name: 'Membru de suspendat' }),
      target,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Examinează suspendarea' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Suspendă accesul' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    switchLocale('Русский');
    await act(async () =>
      response.resolve(
        outcome === 'self suspension'
          ? Response.json(
              { workspaceMembershipId: target, status: 'inactive' },
              { status: 201 },
            )
          : new Response(null, { status: 401 }),
      ),
    );
    if (outcome === 'self suspension') {
      expect(props.onWorkspaceAccessRejected).toHaveBeenCalledOnce();
      expect(rejectSession).not.toHaveBeenCalled();
    } else {
      expect(rejectSession).toHaveBeenCalledOnce();
      expect(props.onWorkspaceAccessRejected).not.toHaveBeenCalled();
    }
    expect(props.onActivityRecorded).not.toHaveBeenCalled();
    expect(props.reloadAdministration).not.toHaveBeenCalled();
    expect(props.onPendingChange.mock.calls).toEqual([[true], [false]]);
    expect(
      screen.queryByText(
        'Доступ участника приостановлен. Состояние сервера обновлено.',
      ),
    ).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledOnce();
  },
);

it('loses the suspension owner and suppresses its late response when parent administration authority is removed', async () => {
  const response = deferredResponse();
  const fetch = vi.fn(async (path: string, options?: RequestInit) => {
    if (path === '/api/company-context-assignments/administration')
      return Response.json({
        members: [
          {
            workspaceMembershipId: memberId,
            displayName: 'Ana {originală} / Борис {имя}',
            email: 'ana@example.test',
          },
        ],
        companies: [],
        assignments: [],
      });
    if (path === '/api/workspace-membership-suspensions') {
      expect(options?.method).toBe('POST');
      return response.promise;
    }
    throw new Error(`Unexpected request: ${path}`);
  });
  vi.stubGlobal('fetch', fetch);
  const props = {
    actor,
    identity: deterministicBrowserIdentity(),
    onActivityRecorded: vi.fn(),
    onWorkspaceAccessRejected: vi.fn(),
  };
  const composition = (current: typeof props) => (
    <InterfaceLocaleProvider>
      <InterfaceLocaleSelect />
      <CompanyContextAccess {...current} />
    </InterfaceLocaleProvider>
  );
  const view = render(composition(props));
  await screen.findByRole('combobox', { name: 'Membru de suspendat' });
  changeValue(
    screen.getByRole('combobox', { name: 'Membru de suspendat' }),
    memberId,
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Examinează suspendarea' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Suspendă accesul' }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  const signal = fetch.mock.calls[1]?.[1]?.signal;
  switchLocale('Français');
  view.rerender(
    composition({ ...props, actor: { ...actor, workspacePermissions: [] } }),
  );
  expect(signal?.aborted).toBe(true);
  switchLocale('Русский');
  await act(async () =>
    response.resolve(
      Response.json(
        { workspaceMembershipId: memberId, status: 'inactive' },
        { status: 201 },
      ),
    ),
  );
  expect(
    screen.queryByRole('region', { name: 'Company access' }),
  ).not.toBeInTheDocument();
  expect(props.onActivityRecorded).not.toHaveBeenCalled();
  expect(props.onWorkspaceAccessRejected).not.toHaveBeenCalled();
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
