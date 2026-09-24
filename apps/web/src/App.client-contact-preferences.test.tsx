import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from './access-composition';
import type { ActorContext } from './access-types';
import { ClientDossierPanel } from './client/ClientDossierPanel';
import { ClientWorkspace } from './client/ClientWorkspace';
import { ApplicationPresentation } from './production-shell/application-presentation';

/** U+1F600 is one Unicode code point stored as two UTF-16 code units. */
const astral = '\u{1F600}';
const preferences = 'Romanian; email preferred\nweekday mornings';
const ion = {
  name: 'Ion Demo',
  telephone: '+373 60 000 372',
  communicationPreferences: preferences,
};
/** Carries position and decision roles so every save proves they survive beside preferences. */
const maria = {
  name: 'Maria Demo',
  position: 'Responsabil calitate',
  decisionRoles: ['influencer', 'technical'],
  communicationPreferences: 'Telefon după ora 14:00',
};
const ana = { name: 'Ana Demo', email: 'ana.demo@example.test' };
const dossier = {
  id: 'client-one',
  displayName: 'AGRONOVA Demo SRL',
  relatedToActiveCompany: true,
  taxId: '1003600037200',
  address: null,
  telephone: null,
  generalEmail: null,
  businessActivity: null,
  contacts: [ion, maria, ana],
  version: 2,
  involvedCompanyDisplayNames: ['PRISMA-PRIM', 'BIC'],
};
const help =
  'Practical preferences only, such as language, preferred channel or suitable times. Saving them sends no message and records no consent or approval.';
const tooLong = 'Communication preferences must be 1000 characters or fewer.';
type Presentation = 'prisme' | 'classic';

function directorActor(): ActorContext {
  return {
    internalUserId: 'director',
    workspaceMembershipId: 'membership-1',
    workspaceId: 'workspace',
    workspaceName: 'Workspace',
    displayName: 'Director',
    email: 'director@example.test',
    active: true,
    workspacePermissions: [],
    activeCompany: {
      id: 'company-a',
      displayName: 'PRISMA-PRIM',
      clientPermissions: ['client.read', 'client.create', 'client.update'],
      clientPermissionAssignmentId: 'assignment-1',
      clientPermissionSetVersion: 'v2',
    },
  };
}
function respond(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}
function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Expected an object.');
  return Object.fromEntries(Object.entries(value));
}

function renderDossier({
  presentation = 'prisme',
  initial = dossier,
  history = { corrections: [], nextCursor: null },
}: {
  presentation?: Presentation;
  initial?: Record<string, unknown>;
  history?: unknown;
} = {}) {
  const corrections: Record<string, unknown>[] = [];
  let current: Record<string, unknown> = initial;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = input.toString();
      if (path.endsWith('/correction-history')) return respond(history);
      if (path.endsWith('/access/current-actor'))
        return respond(directorActor());
      if (path.endsWith('/clients/client-one') && init?.method === 'PATCH') {
        const body = record(JSON.parse(String(init.body)));
        corrections.push(body);
        const { expectedVersion, ...fields } = body;
        current = {
          ...current,
          ...fields,
          version: Number(expectedVersion) + 1,
        };
        return respond(current);
      }
      if (path.endsWith('/clients/client-one')) return respond(current);
      throw new Error('Unexpected API request: ' + path);
    }),
  );
  render(
    <ApplicationPresentation value={presentation}>
      <ClientDossierPanel
        clientAccountId={dossier.id}
        companyContextId="company-a"
        canUpdate
        identity={deterministicBrowserIdentity()}
        onCompanyContextRejected={() => undefined}
        onActivityRecorded={async () => undefined}
        onClientsChanged={async () => undefined}
      />
    </ApplicationPresentation>,
  );
  return corrections;
}
async function openCorrection(presentation: Presentation = 'prisme') {
  await screen.findByRole('heading', { name: dossier.displayName });
  if (presentation === 'prisme')
    fireEvent.click(
      screen.getByRole('button', { name: 'Correct Client dossier' }),
    );
  const form = screen.getByRole('form', { name: 'Correct Client dossier' });
  await waitFor(() => expect(form).toBeVisible());
  return form;
}
function contactGroup(form: HTMLElement, position: number) {
  return within(form).getByRole('group', { name: `Contact ${position}` });
}
function preferencesField(group: HTMLElement) {
  return within(group).getByLabelText('Contact communication preferences');
}
async function save(form: HTMLElement, corrections: unknown[]) {
  const count = corrections.length;
  fireEvent.click(
    within(form).getByRole('button', { name: 'Save correction' }),
  );
  await waitFor(() => expect(corrections).toHaveLength(count + 1));
  await screen.findByText('Client correction saved with attributable history.');
  return record(corrections[count]).contacts;
}
function contactItem(name: string) {
  const region = screen.getByRole('region', { name: 'Contacts' });
  const item = within(region).getByText(name).closest('li');
  if (!item) throw new Error(`Expected the ${name} Contact.`);
  return item;
}

describe('Client Contact communication preferences', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows each non-empty preference as wrapped plain text below its Contact and nothing when absent', async () => {
    const markup =
      '<a href="javascript:alert(1)">Call</a> https://example.test/call';
    renderDossier({
      initial: {
        ...dossier,
        contacts: [ion, { ...maria, communicationPreferences: markup }, ana],
      },
    });
    await screen.findByRole('heading', { name: dossier.displayName });

    const first = within(contactItem('Ion Demo')).getByText(
      /^Communication preferences:/u,
    );
    expect(first).toBeVisible();
    expect(first.textContent).toBe(`Communication preferences: ${preferences}`);
    const second = contactItem('Maria Demo');
    expect(second).toHaveTextContent(`Communication preferences: ${markup}`);
    expect(within(second).queryByRole('link')).toBeNull();
    expect(second.querySelector('a')).toBeNull();
    const plain = contactItem('Ana Demo');
    expect(plain).toHaveTextContent(/^Ana Demoana\.demo@example\.test$/u);
  });

  it.each<Presentation>(['prisme', 'classic'])(
    'pre-fills every Contact preference and resubmits it unchanged when another field changes (%s)',
    async (presentation) => {
      const corrections = renderDossier({ presentation });
      const form = await openCorrection(presentation);

      expect(preferencesField(contactGroup(form, 1))).toHaveValue(preferences);
      expect(
        preferencesField(contactGroup(form, 1)),
      ).toHaveAccessibleDescription(help);
      expect(preferencesField(contactGroup(form, 2))).toHaveValue(
        maria.communicationPreferences,
      );
      expect(preferencesField(contactGroup(form, 3))).toHaveValue('');

      fireEvent.change(within(form).getByLabelText('Telephone'), {
        target: { value: '+373 22 000 372' },
      });

      expect(await save(form, corrections)).toEqual([ion, maria, ana]);
    },
  );

  it("keeps every Contact's preferences when another Contact's telephone changes or a Contact is removed", async () => {
    const corrections = renderDossier();
    const form = await openCorrection();

    fireEvent.change(
      within(contactGroup(form, 1)).getByLabelText('Contact telephone'),
      { target: { value: '+373 60 000 373' } },
    );
    const ionWithTelephone = { ...ion, telephone: '+373 60 000 373' };
    expect(await save(form, corrections)).toEqual([
      ionWithTelephone,
      maria,
      ana,
    ]);
    expect(
      within(contactItem('Ion Demo')).getByText(/^Communication preferences:/u)
        .textContent,
    ).toBe(`Communication preferences: ${preferences}`);

    fireEvent.click(
      within(contactGroup(form, 2)).getByRole('button', {
        name: 'Remove Contact',
      }),
    );
    expect(await save(form, corrections)).toEqual([ionWithTelephone, ana]);
  });

  it('keeps position, decision roles and preferences together when any one of them changes', async () => {
    const corrections = renderDossier();
    const form = await openCorrection();
    const group = contactGroup(form, 2);

    fireEvent.change(within(group).getByLabelText('Contact position'), {
      target: { value: 'Director calitate' },
    });
    const repositioned = { ...maria, position: 'Director calitate' };
    expect(await save(form, corrections)).toEqual([ion, repositioned, ana]);

    fireEvent.click(within(group).getByRole('checkbox', { name: 'Technical' }));
    const narrowed = { ...repositioned, decisionRoles: ['influencer'] };
    expect(await save(form, corrections)).toEqual([ion, narrowed, ana]);

    fireEvent.change(preferencesField(group), {
      target: { value: 'Email only' },
    });
    const preferring = { ...narrowed, communicationPreferences: 'Email only' };
    expect(await save(form, corrections)).toEqual([ion, preferring, ana]);

    const item = contactItem('Maria Demo');
    expect(within(item).getByText('Director calitate')).toBeVisible();
    expect(within(item).getByText('Decision roles: Influencer')).toBeVisible();
    expect(
      within(item).getByText('Communication preferences: Email only'),
    ).toBeVisible();
  });

  it('submits trimmed preferences, keeps internal line breaks and omits a cleared value', async () => {
    const corrections = renderDossier();
    const form = await openCorrection();
    fireEvent.change(preferencesField(contactGroup(form, 3)), {
      target: { value: '  English;\n  video calls after 10:00  \n' },
    });
    fireEvent.change(preferencesField(contactGroup(form, 1)), {
      target: { value: ' \n ' },
    });

    expect(await save(form, corrections)).toEqual([
      { name: 'Ion Demo', telephone: '+373 60 000 372' },
      maria,
      {
        ...ana,
        communicationPreferences: 'English;\n  video calls after 10:00',
      },
    ]);
    expect(
      within(contactItem('Ion Demo')).queryByText(/Communication preferences/u),
    ).toBeNull();
  });

  it('counts Unicode code points, shows a field error for too-long preferences, keeps the draft and sends nothing', async () => {
    const corrections = renderDossier();
    const form = await openCorrection();
    const field = preferencesField(contactGroup(form, 2));

    fireEvent.change(field, { target: { value: astral.repeat(1_001) } });

    expect(field).toBeInvalid();
    expect(field).toHaveAccessibleDescription(`${help} ${tooLong}`);
    expect(preferencesField(contactGroup(form, 1))).toBeValid();
    fireEvent.click(
      within(form).getByRole('button', { name: 'Save correction' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(tooLong);
    expect(corrections).toHaveLength(0);
    expect(field).toHaveValue(astral.repeat(1_001));
    expect(within(form).getByLabelText('Telephone')).toHaveValue('');

    fireEvent.change(field, {
      target: { value: ` ${astral.repeat(1_000)} ` },
    });
    expect(field).toBeValid();
    expect(field).toHaveAccessibleDescription(help);
    expect(await save(form, corrections)).toEqual([
      ion,
      { ...maria, communicationPreferences: astral.repeat(1_000) },
      ana,
    ]);
  });

  it('shows preferences in the correction history before and after', async () => {
    renderDossier({
      history: {
        corrections: [
          {
            id: 'correction-1',
            occurredAt: '2026-09-24T09:15:00.000Z',
            actor: { displayName: 'Iurie Demo' },
            changes: {
              contacts: {
                before: [
                  {
                    name: 'Ion Demo',
                    communicationPreferences: 'Email only',
                  },
                ],
                after: [ion],
              },
            },
          },
        ],
        nextCursor: null,
      },
    });
    fireEvent.click(
      await screen.findByRole('button', { name: 'Show correction history' }),
    );
    const history = screen.getByRole('region', { name: 'Correction history' });
    const before = await within(history).findByRole('group', {
      name: 'Before',
    });
    expect(
      within(before).getByText('Communication preferences: Email only'),
    ).toBeVisible();
    const after = within(history).getByRole('group', { name: 'After' });
    expect(
      within(after).getByText(/^Communication preferences:/u).textContent,
    ).toBe(`Communication preferences: ${preferences}`);
  });

  it('never shows a previous Client preference after the selected Client changes', async () => {
    let releaseFirst: (response: Response) => void = () => undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const path = input.toString();
        if (path.endsWith('/access/current-actor'))
          return respond(directorActor());
        if (path.endsWith('/clients/client-one'))
          return new Promise<Response>((resolve) => {
            releaseFirst = resolve;
          });
        if (path.endsWith('/clients/client-two'))
          return respond({
            ...dossier,
            id: 'client-two',
            displayName: 'Second Demo SRL',
            contacts: [{ name: 'Elena Demo' }],
          });
        if (path.endsWith('/correction-history'))
          return respond({ corrections: [], nextCursor: null });
        throw new Error('Unexpected API request: ' + path);
      }),
    );
    const panel = (clientAccountId: string) => (
      <ApplicationPresentation value="prisme">
        <ClientDossierPanel
          clientAccountId={clientAccountId}
          companyContextId="company-a"
          canUpdate
          identity={deterministicBrowserIdentity()}
          onCompanyContextRejected={() => undefined}
          onActivityRecorded={async () => undefined}
          onClientsChanged={async () => undefined}
        />
      </ApplicationPresentation>
    );
    const rendered = render(panel('client-one'));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    rendered.rerender(panel('client-two'));
    await screen.findByRole('heading', { name: 'Second Demo SRL' });

    await act(async () => releaseFirst(respond(dossier)));

    expect(screen.queryByText(/Romanian/u)).toBeNull();
    expect(screen.queryByDisplayValue(preferences)).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Correct Client dossier' }),
    );
    const form = screen.getByRole('form', { name: 'Correct Client dossier' });
    expect(preferencesField(contactGroup(form, 1))).toHaveValue('');
  });

  it('registers an enriched Client with trimmed preferences and omits blank ones', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(respond([]))
        .mockResolvedValueOnce(
          respond(
            {
              id: 'client-preferences',
              displayName: 'Preferences Demo SRL',
              relatedToActiveCompany: true,
            },
            201,
          ),
        )
        .mockResolvedValueOnce(
          respond([
            {
              id: 'client-preferences',
              displayName: 'Preferences Demo SRL',
              relatedToActiveCompany: true,
            },
          ]),
        ),
    );
    render(
      <ClientWorkspace
        actor={directorActor()}
        identity={deterministicBrowserIdentity()}
        onCompanyContextRejected={vi.fn()}
        onActivityRecorded={vi.fn(async () => undefined)}
      />,
    );

    await screen.findByText('No Clients for PRISMA-PRIM yet.');
    fireEvent.change(screen.getByLabelText('Client display name'), {
      target: { value: 'Preferences Demo SRL' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Contact' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Contact' }));
    const first = screen.getByRole('group', { name: 'Contact 1' });
    const second = screen.getByRole('group', { name: 'Contact 2' });
    fireEvent.change(within(first).getByLabelText('Contact name'), {
      target: { value: 'Ion Demo' },
    });
    fireEvent.change(preferencesField(first), {
      target: { value: `  ${preferences}  ` },
    });
    expect(preferencesField(first)).toHaveAccessibleDescription(help);
    fireEvent.change(within(second).getByLabelText('Contact name'), {
      target: { value: 'Ana Demo' },
    });
    fireEvent.change(preferencesField(second), { target: { value: '   ' } });

    fireEvent.click(screen.getByRole('button', { name: 'Create Client' }));

    await screen.findByRole('heading', { name: 'Preferences Demo SRL' });
    const body = record(
      JSON.parse(String(vi.mocked(fetch).mock.calls[1]?.[1]?.body)),
    );
    expect(body.contacts).toEqual([
      { name: 'Ion Demo', communicationPreferences: preferences },
      { name: 'Ana Demo' },
    ]);
  });

  it('keeps a too-long registration draft and sends nothing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(respond([])));
    render(
      <ClientWorkspace
        actor={directorActor()}
        identity={deterministicBrowserIdentity()}
        onCompanyContextRejected={vi.fn()}
        onActivityRecorded={vi.fn(async () => undefined)}
      />,
    );

    await screen.findByText('No Clients for PRISMA-PRIM yet.');
    fireEvent.change(screen.getByLabelText('Client display name'), {
      target: { value: 'Preferences Demo SRL' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Contact' }));
    fireEvent.change(screen.getByLabelText('Contact name'), {
      target: { value: 'Ion Demo' },
    });
    fireEvent.change(
      screen.getByLabelText('Contact communication preferences'),
      { target: { value: 'x'.repeat(1_001) } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create Client' }));

    expect(screen.getByRole('alert')).toHaveTextContent(tooLong);
    expect(fetch).toHaveBeenCalledOnce();
    expect(
      screen.getByLabelText('Contact communication preferences'),
    ).toHaveValue('x'.repeat(1_001));
    expect(screen.getByLabelText('Contact name')).toHaveValue('Ion Demo');
  });
});
