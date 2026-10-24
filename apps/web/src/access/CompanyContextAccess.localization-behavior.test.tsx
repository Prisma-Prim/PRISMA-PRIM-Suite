import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  InterfaceLocaleProvider,
  interfaceLocaleStorageKey,
} from '../localization/interface-locale';
import { InterfaceLocaleSelect } from '../localization/InterfaceLocaleSelect';
import { ApplicationPresentation } from '../production-shell/application-presentation';
import { selectOption } from '../test/select-option';
import { CompanyContextAccess } from './CompanyContextAccess';
import {
  assignmentAdministration,
  assignmentAdministrator,
  assignmentBundleCases,
  assignmentCompanyId,
  assignmentCompanyName,
  assignmentCompanyReference,
  assignmentLocaleCases,
  assignmentMemberId,
  assignmentMemberLabel,
  assignmentMemberReference,
  assignmentOtherCompanyId,
  assignmentOtherCompanyReference,
  assignmentOtherMemberId,
  assignmentOtherMemberReference,
  type AssignmentLocaleFixture,
} from './company-assignment-localization.test-fixtures';

type AccessProps = ComponentProps<typeof CompanyContextAccess>;
const administrationPath = '/api/company-context-assignments/administration';
const directorPath = '/api/company-director-client-assignments';
const directorBundle = assignmentBundleCases.find(
  (bundle) => bundle.value === 'director-client',
);
if (!directorBundle) throw new Error('Missing independent Director fixture');

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function accessProps() {
  return {
    actor: assignmentAdministrator,
    identity: {
      loaded: true,
      signedIn: true,
      getToken: vi.fn(async () => null),
      rejectSession: vi.fn(async () => undefined),
      signOut: vi.fn(async () => undefined),
      signedOutView: null,
    },
    onActorRevalidated: vi.fn(async () => undefined),
    onCompanyContextRejected: vi.fn(async () => undefined),
    onActivityRecorded: vi.fn(async () => undefined),
    onClientAuthorityChanged: vi.fn(async () => undefined),
    onWorkspaceAccessRejected: vi.fn(async () => undefined),
  };
}

function accessTree({
  props,
  presentation = 'classic',
}: {
  props: AccessProps;
  presentation?: 'classic' | 'prisme';
}) {
  return (
    <InterfaceLocaleProvider>
      <InterfaceLocaleSelect />
      <ApplicationPresentation value={presentation}>
        <CompanyContextAccess {...props} />
      </ApplicationPresentation>
    </InterfaceLocaleProvider>
  );
}

function renderAccess({
  props = accessProps(),
  savedLocale = 'ro',
  presentation = 'classic',
}: {
  props?: AccessProps;
  savedLocale?: string | null;
  presentation?: 'classic' | 'prisme';
} = {}) {
  if (savedLocale === null) localStorage.removeItem(interfaceLocaleStorageKey);
  else localStorage.setItem(interfaceLocaleStorageKey, savedLocale);
  return render(accessTree({ props, presentation }));
}

function switchLocale({ locale }: { locale: AssignmentLocaleFixture }) {
  selectOption(
    screen.getByRole('combobox', {
      name: /^(?:Limba interfeței|Язык интерфейса|Langue de l’interface|Interface language)$/u,
    }),
    locale.locale,
  );
}

async function chooseTargets({
  locale,
  bundle = 'director-client',
  targetMemberId = assignmentMemberId,
}: {
  locale: AssignmentLocaleFixture;
  bundle?: string;
  targetMemberId?: string;
}) {
  const member = await screen.findByRole('combobox', { name: locale.member });
  const company = screen.getByRole('combobox', {
    name: locale.company,
  });
  const choice = screen.getByRole('combobox', { name: locale.bundle });
  selectOption(member, targetMemberId);
  selectOption(company, assignmentCompanyId);
  selectOption(choice, bundle);
  return { member, company, bundle: choice };
}

function currentState({ locale }: { locale: AssignmentLocaleFixture }) {
  return screen.getByText(new RegExp(`^${locale.state}:`, 'u'));
}

function deferredResponse() {
  let complete: ((response: Response) => void) | undefined;
  const promise = new Promise<Response>((resolve) => {
    complete = resolve;
  });
  return {
    promise,
    resolve(response: Response) {
      if (complete === undefined)
        throw new Error('Deferred response has not been initialized');
      complete(response);
    },
  };
}

function recordCommand({
  input,
  options,
}: {
  input: RequestInfo | URL;
  options?: RequestInit;
}) {
  return {
    path: String(input),
    method: options?.method ?? 'GET',
    key: new Headers(options?.headers).get('idempotency-key'),
    body: options?.body,
  };
}

it.each(assignmentBundleCases)(
  'recognizes canonical $canonical in every non-English locale without translating its identity or captured version',
  async (bundle) => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(administrationPath);
      return Response.json(
        assignmentAdministration({ activeBundles: [bundle] }),
      );
    });
    vi.stubGlobal('fetch', fetch);
    const props = accessProps();
    renderAccess({ props });
    const romanian = assignmentLocaleCases[0];
    const controls = await chooseTargets({
      locale: romanian,
      bundle: bundle.value,
    });
    for (const locale of assignmentLocaleCases.filter(
      (item) => item.locale !== 'en',
    )) {
      switchLocale({ locale });
      const bundleControl = screen.getByRole('combobox', {
        name: locale.bundle,
      });
      expect(bundleControl).toBe(controls.bundle);
      expect(bundleControl).toHaveAttribute('data-value', bundle.value);
      expect(bundleControl).toHaveTextContent(bundle.labels[locale.locale]);
      expect(currentState({ locale })).toHaveTextContent(
        bundle.version === null
          ? `${locale.state}: ${locale.grantedState}`
          : `${locale.state}: ${locale.version} ${bundle.version}`,
      );
      expect(screen.getByRole('button', { name: locale.grant })).toBeDisabled();
      expect(screen.getByRole('button', { name: locale.revoke })).toBeEnabled();
      expect(controls.member).toHaveAttribute('data-value', assignmentMemberId);
      expect(controls.company).toHaveAttribute(
        'data-value',
        assignmentCompanyId,
      );
      expect(fetch).toHaveBeenCalledOnce();
      expect(props.identity.getToken).toHaveBeenCalledOnce();
      expect(props.onActorRevalidated).not.toHaveBeenCalled();
      expect(props.onActivityRecorded).not.toHaveBeenCalled();
      expect(props.onClientAuthorityChanged).not.toHaveBeenCalled();
    }
  },
);

it.each(assignmentLocaleCases)(
  'completes grant → canonical v2 reload → revoke in $locale and preserves duplicate identities and original order',
  async (locale) => {
    let active = false;
    const commands: ReturnType<typeof recordCommand>[] = [];
    const fetch = vi.fn(
      async (input: RequestInfo | URL, options?: RequestInit) => {
        if (String(input) === administrationPath)
          return Response.json(
            assignmentAdministration({
              activeBundles: active ? [directorBundle] : [],
            }),
          );
        commands.push(recordCommand({ input, options }));
        active = options?.method === 'POST';
        return Response.json({}, { status: active ? 201 : 200 });
      },
    );
    vi.stubGlobal('fetch', fetch);
    const props = accessProps();
    renderAccess({ props, savedLocale: locale.locale, presentation: 'prisme' });
    const controls = await chooseTargets({ locale });
    const access = screen.getByRole('region', { name: locale.title });
    expect(access).toHaveClass('company-access--prisme');
    expect(controls.member).toHaveTextContent(
      `${assignmentMemberLabel} — ${locale.reference} ${assignmentMemberReference}`,
    );
    expect(controls.company).toHaveTextContent(
      `${assignmentCompanyName} — ${locale.reference} ${assignmentCompanyReference}`,
    );
    fireEvent.click(controls.member);
    const memberOptions = within(screen.getByRole('listbox')).getAllByRole(
      'option',
    );
    expect(
      memberOptions.map((option) => option.getAttribute('data-value')),
    ).toEqual(['', assignmentMemberId, assignmentOtherMemberId]);
    expect(memberOptions.map((option) => option.textContent)).toEqual([
      locale.selectMember,
      `${assignmentMemberLabel} — ${locale.reference} ${assignmentMemberReference}`,
      `${assignmentMemberLabel} — ${locale.reference} ${assignmentOtherMemberReference}`,
    ]);
    fireEvent.keyDown(controls.member, { key: 'Escape' });
    fireEvent.click(controls.company);
    const companyOptions = within(screen.getByRole('listbox')).getAllByRole(
      'option',
    );
    expect(
      companyOptions.map((option) => option.getAttribute('data-value')),
    ).toEqual(['', assignmentCompanyId, assignmentOtherCompanyId]);
    expect(companyOptions.map((option) => option.textContent)).toEqual([
      locale.selectCompany,
      `${assignmentCompanyName} — ${locale.reference} ${assignmentCompanyReference}`,
      `${assignmentCompanyName} — ${locale.reference} ${assignmentOtherCompanyReference}`,
    ]);
    fireEvent.keyDown(controls.company, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: locale.grant }));
    await screen.findByText(locale.granted);
    expect(currentState({ locale })).toHaveTextContent(
      `${locale.state}: ${locale.version} v2`,
    );
    expect(screen.getByText(locale.captured)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: locale.revoke }));
    await screen.findByText(locale.revoked);
    expect(currentState({ locale })).toHaveTextContent(
      `${locale.state}: ${locale.notGranted}`,
    );
    expect(commands).toEqual([
      {
        path: directorPath,
        method: 'POST',
        key: expect.any(String),
        body: JSON.stringify({
          workspaceMembershipId: assignmentMemberId,
          companyId: assignmentCompanyId,
        }),
      },
      {
        path: `${directorPath}/${assignmentMemberId}/${assignmentCompanyId}`,
        method: 'DELETE',
        key: expect.any(String),
        body: undefined,
      },
    ]);
    expect(commands[0]?.key).not.toBe(commands[1]?.key);
    expect(props.onActivityRecorded).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledTimes(5);
  },
);

it.each([null, 'unsupported'])(
  'defaults to Romanian with saved locale %s',
  async (savedLocale) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(assignmentAdministration())),
    );
    renderAccess({ savedLocale });
    await screen.findByRole('combobox', {
      name: 'Membru al spațiului de lucru',
    });
    expect(
      screen.getByRole('region', { name: 'Acces la companie' }),
    ).toBeVisible();
    expect(document.documentElement.lang).toBe('ro');
  },
);

it.each(assignmentLocaleCases)(
  'shows loading, read failure, explicit retry and empty state in $locale',
  async (locale) => {
    const response = deferredResponse();
    const fetch = vi
      .fn()
      .mockReturnValueOnce(response.promise)
      .mockResolvedValueOnce(
        Response.json({ members: [], companies: [], assignments: [] }),
      );
    vi.stubGlobal('fetch', fetch);
    renderAccess({ savedLocale: locale.locale });
    expect(screen.getByRole('status')).toHaveTextContent(locale.loading);
    await act(async () =>
      response.resolve(new Response(null, { status: 503 })),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(locale.error);
    expect(fetch).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: locale.retry }));
    await screen.findByText(locale.empty);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(
      screen.queryByRole('combobox', { name: locale.member }),
    ).not.toBeInTheDocument();
  },
);

it.each(['grant', 'revoke'] as const)(
  'preserves a pending %s through locale changes and renders its delayed result in the current language',
  async (submission) => {
    const pending = deferredResponse();
    let active = submission === 'revoke';
    const commands: ReturnType<typeof recordCommand>[] = [];
    const fetch = vi.fn(
      async (input: RequestInfo | URL, options?: RequestInit) => {
        if (String(input) === administrationPath)
          return Response.json(
            assignmentAdministration({
              activeBundles: active ? [directorBundle] : [],
            }),
          );
        commands.push(recordCommand({ input, options }));
        active = submission === 'grant';
        return pending.promise;
      },
    );
    vi.stubGlobal('fetch', fetch);
    const props = accessProps();
    renderAccess({ props });
    const controls = await chooseTargets({ locale: assignmentLocaleCases[0] });
    fireEvent.click(
      screen.getByRole('button', {
        name: assignmentLocaleCases[0][submission],
      }),
    );
    await waitFor(() => expect(commands).toHaveLength(1));
    const french = assignmentLocaleCases[2];
    switchLocale({ locale: french });
    for (const control of Object.values(controls))
      expect(control).toBeDisabled();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(props.onActivityRecorded).not.toHaveBeenCalled();
    const russian = assignmentLocaleCases[1];
    switchLocale({ locale: russian });
    expect(commands).toHaveLength(1);
    await act(async () => pending.resolve(Response.json({}, { status: 200 })));
    await screen.findByText(
      submission === 'grant' ? russian.granted : russian.revoked,
    );
    expect(currentState({ locale: russian })).toHaveTextContent(
      submission === 'grant' ? `${russian.version} v2` : russian.notGranted,
    );
    expect(commands).toHaveLength(1);
    expect(props.onActivityRecorded).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledTimes(3);
  },
);

it('keeps an uncertain exact command across language changes and retires its key only after deliberate intent change', async () => {
  const commands: ReturnType<typeof recordCommand>[] = [];
  const fetch = vi.fn(
    async (input: RequestInfo | URL, options?: RequestInit) => {
      if (String(input) === administrationPath)
        return Response.json(assignmentAdministration());
      commands.push(recordCommand({ input, options }));
      throw new TypeError('Synthetic uncertain connection');
    },
  );
  vi.stubGlobal('fetch', fetch);
  renderAccess();
  await chooseTargets({ locale: assignmentLocaleCases[0] });
  fireEvent.click(
    screen.getByRole('button', { name: assignmentLocaleCases[0].grant }),
  );
  await screen.findByRole('alert');
  switchLocale({ locale: assignmentLocaleCases[2] });
  expect(commands).toHaveLength(1);
  // The existing command owner already reloaded after the uncertain response.
  // Language selection adds no read and does not retry the command.
  expect(fetch).toHaveBeenCalledTimes(3);
  fireEvent.click(
    screen.getByRole('button', { name: assignmentLocaleCases[2].grant }),
  );
  await waitFor(() => expect(commands).toHaveLength(2));
  await screen.findByRole('alert');
  expect(commands[1]).toEqual(commands[0]);
  selectOption(
    screen.getByRole('combobox', {
      name: assignmentLocaleCases[2].company,
    }),
    assignmentOtherCompanyId,
  );
  switchLocale({ locale: assignmentLocaleCases[1] });
  fireEvent.click(
    screen.getByRole('button', { name: assignmentLocaleCases[1].grant }),
  );
  await waitFor(() => expect(commands).toHaveLength(3));
  expect(commands[2]?.key).not.toBe(commands[0]?.key);
  expect(commands[2]?.body).toBe(
    JSON.stringify({
      workspaceMembershipId: assignmentMemberId,
      companyId: assignmentOtherCompanyId,
    }),
  );
});

it('keeps a confirmed command unresolved until an explicit valid administration read and localizes its eventual result', async () => {
  let reads = 0;
  let active = false;
  const commands: ReturnType<typeof recordCommand>[] = [];
  const fetch = vi.fn(
    async (input: RequestInfo | URL, options?: RequestInit) => {
      if (String(input) === administrationPath) {
        reads += 1;
        if (reads === 2) return new Response(null, { status: 503 });
        return Response.json(
          assignmentAdministration({
            activeBundles: active ? [directorBundle] : [],
          }),
        );
      }
      commands.push(recordCommand({ input, options }));
      active = true;
      return Response.json({}, { status: 201 });
    },
  );
  vi.stubGlobal('fetch', fetch);
  const props = accessProps();
  renderAccess({ props });
  await chooseTargets({ locale: assignmentLocaleCases[0] });
  fireEvent.click(
    screen.getByRole('button', { name: assignmentLocaleCases[0].grant }),
  );
  await screen.findByRole('button', { name: assignmentLocaleCases[0].retry });
  switchLocale({ locale: assignmentLocaleCases[2] });
  expect(screen.getByRole('alert')).toHaveTextContent(
    assignmentLocaleCases[2].error,
  );
  expect(
    screen.queryByText(assignmentLocaleCases[2].granted),
  ).not.toBeInTheDocument();
  expect(reads).toBe(2);
  expect(commands).toHaveLength(1);
  fireEvent.click(
    screen.getByRole('button', { name: assignmentLocaleCases[2].retry }),
  );
  await screen.findByText(assignmentLocaleCases[2].granted);
  expect(currentState({ locale: assignmentLocaleCases[2] })).toHaveTextContent(
    `${assignmentLocaleCases[2].version} v2`,
  );
  expect(reads).toBe(3);
  expect(commands).toHaveLength(1);
  expect(props.onActivityRecorded).toHaveBeenCalledOnce();
});

it.each([
  'identity',
  'internal user',
  'Workspace',
  'membership',
  'permission',
] as const)(
  'retires a pending mutation on actual %s replacement and ignores its late result after a language switch',
  async (boundary) => {
    const pending = deferredResponse();
    let signal: AbortSignal | null | undefined;
    const fetch = vi.fn(
      async (input: RequestInfo | URL, options?: RequestInit) => {
        if (String(input) === administrationPath)
          return Response.json(assignmentAdministration());
        signal = options?.signal;
        return pending.promise;
      },
    );
    vi.stubGlobal('fetch', fetch);
    const props = accessProps();
    const view = renderAccess({ props });
    await chooseTargets({ locale: assignmentLocaleCases[0] });
    fireEvent.click(
      screen.getByRole('button', { name: assignmentLocaleCases[0].grant }),
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    switchLocale({ locale: assignmentLocaleCases[2] });
    let replacement: AccessProps;
    switch (boundary) {
      case 'identity':
        replacement = { ...props, identity: accessProps().identity };
        break;
      case 'internal user':
        replacement = {
          ...props,
          actor: { ...props.actor, internalUserId: 'replacement-user' },
        };
        break;
      case 'Workspace':
        replacement = {
          ...props,
          actor: { ...props.actor, workspaceId: 'replacement-workspace' },
        };
        break;
      case 'membership':
        replacement = {
          ...props,
          actor: {
            ...props.actor,
            workspaceMembershipId: 'replacement-membership',
          },
        };
        break;
      case 'permission':
        replacement = {
          ...props,
          actor: { ...props.actor, workspacePermissions: [] },
        };
        break;
      default: {
        const exhaustivenessCheck: never = boundary;
        throw new Error(
          `Unhandled retirement boundary: ${exhaustivenessCheck}`,
        );
      }
    }
    view.rerender(accessTree({ props: replacement }));
    expect(signal?.aborted).toBe(true);
    if (boundary !== 'permission')
      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    const countBeforeLateResponse = fetch.mock.calls.length;
    await act(async () => pending.resolve(Response.json({}, { status: 201 })));
    expect(fetch).toHaveBeenCalledTimes(countBeforeLateResponse);
    expect(props.onActivityRecorded).not.toHaveBeenCalled();
    expect(props.onActorRevalidated).not.toHaveBeenCalled();
    expect(props.onClientAuthorityChanged).not.toHaveBeenCalled();
    expect(
      screen.queryByText(assignmentLocaleCases[2].granted),
    ).not.toBeInTheDocument();
    if (boundary === 'permission')
      expect(
        screen.queryByRole('region', { name: assignmentLocaleCases[2].title }),
      ).not.toBeInTheDocument();
  },
);

it.each(assignmentLocaleCases)(
  'fails closed on an unknown canonical label in $locale',
  async (locale) => {
    const state = assignmentAdministration({ activeBundles: [directorBundle] });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          ...state,
          assignments: state.assignments.map((assignment) => ({
            ...assignment,
            bundle: 'Unrecognized Company Director',
          })),
        }),
      ),
    );
    renderAccess({ savedLocale: locale.locale });
    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toHaveTextContent(locale.error);
    expect(
      screen.queryByRole('combobox', { name: locale.member }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: locale.grant }),
    ).not.toBeInTheDocument();
  },
);

it('preserves an open sibling suspension review and its selected member through a pure locale change', async () => {
  const fetch = vi.fn(async () => Response.json(assignmentAdministration()));
  vi.stubGlobal('fetch', fetch);
  const props = accessProps();
  renderAccess({ props });
  await screen.findByRole('combobox', { name: 'Membru de suspendat' });
  selectOption(
    screen.getByRole('combobox', { name: 'Membru de suspendat' }),
    assignmentMemberId,
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Examinează suspendarea' }),
  );
  const review = screen.getByRole('region', {
    name: 'Confirmă suspendarea accesului la spațiul de lucru',
  });
  switchLocale({ locale: assignmentLocaleCases[2] });
  expect(
    screen.getByRole('region', {
      name: 'Confirmer la suspension de l’accès à l’espace de travail',
    }),
  ).toBe(review);
  expect(review).toHaveTextContent(assignmentMemberLabel);
  expect(fetch).toHaveBeenCalledOnce();
  expect(props.onActivityRecorded).not.toHaveBeenCalled();
});

it.each(assignmentLocaleCases)(
  'rejects an unknown captured Director version in $locale without exposing administration data',
  async (locale) => {
    const state = assignmentAdministration({ activeBundles: [directorBundle] });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          ...state,
          assignments: state.assignments.map((assignment) => ({
            ...assignment,
            permissionSetVersion: 'v999',
          })),
        }),
      ),
    );
    renderAccess({ savedLocale: locale.locale });
    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toHaveTextContent(locale.error);
    expect(
      screen.queryByText(assignmentMemberLabel, { exact: false }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: locale.grant }),
    ).not.toBeInTheDocument();
  },
);

it('updates delayed initial-read feedback to the current language without starting another read', async () => {
  const pending = deferredResponse();
  const fetch = vi.fn().mockReturnValue(pending.promise);
  vi.stubGlobal('fetch', fetch);
  const props = accessProps();
  renderAccess({ props });
  await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  switchLocale({ locale: assignmentLocaleCases[2] });
  expect(screen.getByRole('status')).toHaveTextContent(
    assignmentLocaleCases[2].loading,
  );
  expect(fetch).toHaveBeenCalledOnce();
  expect(props.identity.getToken).toHaveBeenCalledOnce();
  await act(async () => pending.resolve(new Response(null, { status: 503 })));
  expect(screen.getByRole('alert')).toHaveTextContent(
    assignmentLocaleCases[2].error,
  );
  expect(props.onActorRevalidated).not.toHaveBeenCalled();
  expect(props.onActivityRecorded).not.toHaveBeenCalled();
});

it('cancels an obsolete initial read before a replacement identity can receive its data', async () => {
  const pending = deferredResponse();
  let signal: AbortSignal | null | undefined;
  let reads = 0;
  const fetch = vi.fn(
    async (_input: RequestInfo | URL, options?: RequestInit) => {
      reads += 1;
      if (reads === 1) {
        signal = options?.signal;
        return pending.promise;
      }
      return Response.json({ members: [], companies: [], assignments: [] });
    },
  );
  vi.stubGlobal('fetch', fetch);
  const props = accessProps();
  const view = renderAccess({ props });
  await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  switchLocale({ locale: assignmentLocaleCases[1] });
  view.rerender(
    accessTree({ props: { ...props, identity: accessProps().identity } }),
  );
  expect(signal?.aborted).toBe(true);
  await screen.findByText(assignmentLocaleCases[1].empty);
  await act(async () =>
    pending.resolve(
      Response.json(
        assignmentAdministration({ activeBundles: [directorBundle] }),
      ),
    ),
  );
  expect(screen.getByText(assignmentLocaleCases[1].empty)).toBeVisible();
  expect(
    screen.queryByRole('combobox', { name: assignmentLocaleCases[1].member }),
  ).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(props.onActivityRecorded).not.toHaveBeenCalled();
});

it('requires actual assignment-management permission regardless of business titles and language', () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const props = accessProps();
  renderAccess({
    props: {
      ...props,
      actor: {
        ...props.actor,
        displayName: 'Workspace Owner / Company Director',
        workspacePermissions: [],
      },
    },
  });
  switchLocale({ locale: assignmentLocaleCases[1] });
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
  expect(props.identity.getToken).not.toHaveBeenCalled();
});

it.each(['ok', 'company forbidden', 'session unauthorized'] as const)(
  'preserves self-assignment revalidation and callbacks for %s after a pending locale switch',
  async (outcome) => {
    const revalidation = deferredResponse();
    const props = accessProps();
    const selfActor = {
      ...props.actor,
      activeCompany: {
        id: assignmentCompanyId,
        displayName: assignmentCompanyName,
      },
    };
    let active = false;
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === administrationPath)
        return Response.json(
          assignmentAdministration({
            activeBundles: active ? [directorBundle] : [],
            targetMemberId: selfActor.workspaceMembershipId,
          }),
        );
      if (String(input) === '/api/access/current-actor')
        return revalidation.promise;
      expect(String(input)).toBe(directorPath);
      active = true;
      return Response.json({}, { status: 201 });
    });
    vi.stubGlobal('fetch', fetch);
    renderAccess({ props: { ...props, actor: selfActor } });
    await chooseTargets({
      locale: assignmentLocaleCases[0],
      targetMemberId: selfActor.workspaceMembershipId,
    });
    fireEvent.click(
      screen.getByRole('button', { name: assignmentLocaleCases[0].grant }),
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    switchLocale({ locale: assignmentLocaleCases[2] });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(props.onActorRevalidated).not.toHaveBeenCalled();
    await act(async () =>
      revalidation.resolve(
        outcome === 'ok'
          ? Response.json(selfActor)
          : new Response(null, {
              status: outcome === 'company forbidden' ? 403 : 401,
            }),
      ),
    );
    if (outcome === 'session unauthorized') {
      expect(props.identity.rejectSession).toHaveBeenCalledOnce();
      expect(props.onActivityRecorded).not.toHaveBeenCalled();
      expect(props.onClientAuthorityChanged).not.toHaveBeenCalled();
      expect(fetch).toHaveBeenCalledTimes(3);
    } else {
      await screen.findByText(assignmentLocaleCases[2].granted);
      expect(props.onClientAuthorityChanged).toHaveBeenCalledOnce();
      expect(props.onActivityRecorded).toHaveBeenCalledTimes(
        outcome === 'ok' ? 1 : 0,
      );
      expect(props.onActorRevalidated).toHaveBeenCalledTimes(
        outcome === 'ok' ? 1 : 0,
      );
      expect(props.onCompanyContextRejected).toHaveBeenCalledTimes(
        outcome === 'company forbidden' ? 1 : 0,
      );
      expect(fetch).toHaveBeenCalledTimes(4);
    }
  },
);

it('preserves authenticated mutation rejection after a pending language switch', async () => {
  const mutation = deferredResponse();
  const fetch = vi.fn(async (input: RequestInfo | URL) =>
    String(input) === administrationPath
      ? Response.json(assignmentAdministration())
      : mutation.promise,
  );
  vi.stubGlobal('fetch', fetch);
  const props = accessProps();
  renderAccess({ props });
  await chooseTargets({ locale: assignmentLocaleCases[0] });
  fireEvent.click(
    screen.getByRole('button', { name: assignmentLocaleCases[0].grant }),
  );
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  switchLocale({ locale: assignmentLocaleCases[2] });
  await act(async () => mutation.resolve(new Response(null, { status: 401 })));
  expect(props.identity.rejectSession).toHaveBeenCalledOnce();
  expect(props.onActivityRecorded).not.toHaveBeenCalled();
  expect(props.onClientAuthorityChanged).not.toHaveBeenCalled();
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(
    screen.queryByText(assignmentLocaleCases[2].granted),
  ).not.toBeInTheDocument();
});

it('states exactly the approved commercial capabilities and action-specific prerequisites in English', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(assignmentAdministration())),
  );
  renderAccess({ savedLocale: 'en' });
  await chooseTargets({
    locale: assignmentLocaleCases[3],
    bundle: 'offer-preparer',
  });
  expect(
    screen.getByText(
      'New Company Offer Preparer grants capture v3: Offer read, preparation, exact Pricing Snapshot read, approved-estimate drafts and full approved-model Offers with recorded simulated transmission. Company context, Opportunity/Client read and economic-source read remain separately authorized. Model configuration and Offer approval are separate. Existing v1/v2 grants retain their captured rights; revoke and grant again to enable the full-model journey.',
    ),
  ).toBeVisible();
  selectOption(
    screen.getByRole('combobox', { name: 'Access bundle' }),
    'offer-approver',
  );
  expect(
    screen.getByText(
      'New Company Offer Approver grants capture v2: Offer read, decisions and recorded simulated Client responses, including full approved-model Offers. Company context and Opportunity read remain separately authorized. It grants no preparation, Client, Pricing, economic-source or model-configuration access. Existing v1 grants retain their captured rights; revoke and grant again to enable the full-model journey.',
    ),
  ).toBeVisible();
  selectOption(
    screen.getByRole('combobox', { name: 'Access bundle' }),
    'contract-preparer',
  );
  expect(
    screen.getByText(
      'Company Contract Preparer v1 grants Contract read, preparation and Project linking. Company context and Opportunity read must be authorized separately. Creating from an Offer requires that Offer’s read; creating a Version and naming an entity for a direct Contract require Client read and an active Client–Company relationship. Choosing a Pricing Snapshot requires its separate read permission. Linking requires Project read; creating a Project additionally requires Project creation and the Project’s Client read. Later Contract reads do not universally require Offer or Client read. The bundle grants no Offer, Client, Pricing or Project authority.',
    ),
  ).toBeVisible();
});
