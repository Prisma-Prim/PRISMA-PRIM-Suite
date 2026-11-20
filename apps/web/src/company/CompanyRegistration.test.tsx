import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '../test/render-with-interface-locale';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { useInterfaceLocale } from '../localization/interface-locale';
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
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('presents first-Company onboarding in Prisme', () => {
    render(
      <CompanyRegistration actor={actor} identity={identity} {...callbacks} />,
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

  it('translates a visible client validation error without clearing the draft or sending a command', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<RegistrationWithFrenchSwitch />);

    const displayName = screen.getByLabelText('Company display name');
    fireEvent.change(displayName, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register Company' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Company display name is required.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Use French' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Le nom affiché de l’Entreprise est obligatoire.',
    );
    expect(displayName).toHaveValue('   ');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the current locale when pending server validation completes and sends one unchanged command', async () => {
    const pendingResponse = deferred<Response>();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return pendingResponse.promise;
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<RegistrationWithFrenchSwitch />);

    const displayName = screen.getByLabelText('Company display name');
    fireEvent.change(displayName, {
      target: { value: 'Draft Company' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Register Company' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole('button', { name: 'Use French' }));
    await act(async () => {
      pendingResponse.resolve(
        Response.json({ message: 'Server validation' }, { status: 400 }),
      );
      await pendingResponse.promise;
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Le nom affiché de l’Entreprise est obligatoire.',
    );
    expect(displayName).toHaveValue('Draft Company');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/companies',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ displayName: 'Draft Company' }),
      }),
    );
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get('idempotency-key')).toBeTruthy();
  });

  it('admits a new command after identity replacement while the old submission is held', async () => {
    const pending = deferred<Response>();
    const fetchMock = vi
      .fn<(url: string, init?: RequestInit) => Promise<Response>>()
      .mockImplementationOnce(() => pending.promise)
      .mockResolvedValueOnce(new Response(null, { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);
    const view = render(
      <CompanyRegistration actor={actor} identity={identity} {...callbacks} />,
    );
    fireEvent.change(screen.getByLabelText('Company display name'), {
      target: { value: 'Draft Company' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Register Company' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    view.rerender(
      <CompanyRegistration
        actor={actor}
        identity={{ ...identity }}
        {...callbacks}
      />,
    );
    const submit = screen.getByRole('button', { name: 'Register Company' });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const keys = fetchMock.mock.calls.map(([, init]) =>
      new Headers(init?.headers).get('idempotency-key'),
    );
    expect(new Set(keys).size).toBe(2);
    await act(async () => pending.resolve(new Response(null, { status: 401 })));
    expect(submit).toBeEnabled();
  });
});

function RegistrationWithFrenchSwitch() {
  const { changeLocale } = useInterfaceLocale();
  return (
    <>
      <button type="button" onClick={() => changeLocale('fr')}>
        Use French
      </button>
      <CompanyRegistration actor={actor} identity={identity} {...callbacks} />
    </>
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}
