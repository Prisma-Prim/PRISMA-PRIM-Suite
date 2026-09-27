import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from './test/render-with-interface-locale';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from './access-composition';
import type { ActorContext } from './access-types';
import { ClientDossierPanel } from './client/ClientDossierPanel';
import { ApplicationPresentation } from './production-shell/application-presentation';

const ion = {
  name: 'Ion Demo',
  telephone: '+373 60 000 366',
  position: 'Director general',
  decisionRoles: ['final_decision_maker', 'financial'],
};
const maria = {
  name: 'Maria Demo',
  position: 'Responsabil calitate',
  decisionRoles: ['influencer', 'technical'],
};
const ana = { name: 'Ana Demo', email: 'ana.demo@example.test' };
const dossier = {
  id: 'client-one',
  displayName: 'AGRONOVA Demo SRL',
  relatedToActiveCompany: true,
  taxId: '1003600036600',
  address: null,
  telephone: null,
  generalEmail: null,
  businessActivity: null,
  contacts: [ion, maria, ana],
  version: 2,
  involvedCompanyDisplayNames: ['PRISMA-PRIM', 'BIC'],
};
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
      clientPermissionSetVersion: 'v1',
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
  history = { corrections: [], nextCursor: null },
}: { presentation?: Presentation; history?: unknown } = {}) {
  const corrections: Record<string, unknown>[] = [];
  let current: Record<string, unknown> = dossier;
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
      if (path.endsWith('/legal-entities'))
        return respond({ clientVersion: 1, legalEntities: [] });
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
function roleBox(group: HTMLElement, label: string) {
  return within(
    within(group).getByRole('group', { name: 'Decision roles' }),
  ).getByRole('checkbox', { name: label });
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

describe('Client Contact position and decision roles', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows each Contact position and decision-role labels below its name and nothing when absent', async () => {
    renderDossier();
    await screen.findByRole('heading', { name: dossier.displayName });

    const first = contactItem('Ion Demo');
    expect(within(first).getByText('Director general')).toBeVisible();
    expect(
      within(first).getByText(
        'Decision roles: Final decision-maker, Financial',
      ),
    ).toBeVisible();
    expect(
      within(contactItem('Maria Demo')).getByText(
        'Decision roles: Influencer, Technical',
      ),
    ).toBeVisible();
    const plain = contactItem('Ana Demo');
    expect(plain).toHaveTextContent(/^Ana Demoana\.demo@example\.test$/u);
    expect(within(plain).queryByText(/Decision roles/u)).toBeNull();
  });

  it.each<Presentation>(['prisme', 'classic'])(
    'pre-fills every Contact position and decision roles and resubmits them unchanged when another field changes (%s)',
    async (presentation) => {
      const corrections = renderDossier({ presentation });
      const form = await openCorrection(presentation);

      const first = contactGroup(form, 1);
      expect(within(first).getByLabelText('Contact position')).toHaveValue(
        'Director general',
      );
      expect(roleBox(first, 'Final decision-maker')).toBeChecked();
      expect(roleBox(first, 'Financial')).toBeChecked();
      expect(roleBox(first, 'Influencer')).not.toBeChecked();
      const second = contactGroup(form, 2);
      expect(within(second).getByLabelText('Contact position')).toHaveValue(
        'Responsabil calitate',
      );
      expect(roleBox(second, 'Influencer')).toBeChecked();
      expect(roleBox(second, 'Technical')).toBeChecked();
      const third = contactGroup(form, 3);
      expect(within(third).getByLabelText('Contact position')).toHaveValue('');
      expect(
        within(
          within(third).getByRole('group', { name: 'Decision roles' }),
        ).getAllByRole('checkbox'),
      ).toHaveLength(6);
      expect(
        within(third)
          .getAllByRole('checkbox')
          .some(
            (checkbox) =>
              checkbox instanceof HTMLInputElement && checkbox.checked,
          ),
      ).toBe(false);

      fireEvent.change(within(form).getByLabelText('Telephone'), {
        target: { value: '+373 22 000 366' },
      });

      expect(await save(form, corrections)).toEqual([ion, maria, ana]);
    },
  );

  it("keeps every other Contact's values when one Contact changes or is removed", async () => {
    const corrections = renderDossier();
    const form = await openCorrection();

    fireEvent.change(
      within(contactGroup(form, 2)).getByLabelText('Contact telephone'),
      { target: { value: '+373 60 000 367' } },
    );
    const mariaWithTelephone = { ...maria, telephone: '+373 60 000 367' };
    expect(await save(form, corrections)).toEqual([
      ion,
      mariaWithTelephone,
      ana,
    ]);

    fireEvent.click(
      within(contactGroup(form, 1)).getByRole('button', {
        name: 'Remove Contact',
      }),
    );
    expect(await save(form, corrections)).toEqual([mariaWithTelephone, ana]);
    expect(
      within(contactItem('Maria Demo')).getByText(
        'Decision roles: Influencer, Technical',
      ),
    ).toBeVisible();
  });

  it('records a trimmed position and decision roles in vocabulary order, omitting cleared values', async () => {
    const corrections = renderDossier();
    const form = await openCorrection();
    const third = contactGroup(form, 3);
    fireEvent.change(within(third).getByLabelText('Contact position'), {
      target: { value: '  Responsabil achiziții  ' },
    });
    fireEvent.click(roleBox(third, 'Blocker'));
    fireEvent.click(roleBox(third, 'User'));
    const first = contactGroup(form, 1);
    fireEvent.change(within(first).getByLabelText('Contact position'), {
      target: { value: '   ' },
    });
    fireEvent.click(roleBox(first, 'Final decision-maker'));
    fireEvent.click(roleBox(first, 'Financial'));

    expect(await save(form, corrections)).toEqual([
      { name: 'Ion Demo', telephone: '+373 60 000 366' },
      maria,
      {
        ...ana,
        position: 'Responsabil achiziții',
        decisionRoles: ['user', 'blocker'],
      },
    ]);
  });

  it('shows a field error next to a Contact whose position is too long and sends nothing', async () => {
    const corrections = renderDossier();
    const form = await openCorrection();
    const second = contactGroup(form, 2);
    const position = within(second).getByLabelText('Contact position');

    fireEvent.change(position, { target: { value: 'P'.repeat(501) } });

    expect(position).toBeInvalid();
    expect(position).toHaveAccessibleDescription(
      'Position must be 500 characters or fewer.',
    );
    expect(
      within(contactGroup(form, 1)).getByLabelText('Contact position'),
    ).toBeValid();
    fireEvent.click(
      within(form).getByRole('button', { name: 'Save correction' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Position must be 500 characters or fewer.',
    );
    expect(corrections).toHaveLength(0);

    fireEvent.change(position, { target: { value: 'P'.repeat(500) } });
    expect(position).toBeValid();
  });

  it('shows position and decision-role labels in the correction history before and after', async () => {
    renderDossier({
      history: {
        corrections: [
          {
            id: 'correction-1',
            occurredAt: '2026-09-24T09:15:00.000Z',
            actor: { displayName: 'Iurie Demo' },
            changes: {
              contacts: {
                before: [{ name: 'Ion Demo', position: 'Director' }],
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
    expect(within(before).getByText('Director')).toBeVisible();
    expect(within(before).queryByText(/Decision roles/u)).toBeNull();
    const after = within(history).getByRole('group', { name: 'After' });
    expect(within(after).getByText('Director general')).toBeVisible();
    expect(
      within(after).getByText(
        'Decision roles: Final decision-maker, Financial',
      ),
    ).toBeVisible();
  });

  it('never renders a previous Client dossier after the selected Client changes', async () => {
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
            contacts: [{ name: 'Elena Demo', position: 'Șef achiziții' }],
          });
        if (path.endsWith('/correction-history'))
          return respond({ corrections: [], nextCursor: null });
        if (path.endsWith('/legal-entities'))
          return respond({ clientVersion: 1, legalEntities: [] });
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
    expect(
      within(contactItem('Elena Demo')).getByText('Șef achiziții'),
    ).toBeVisible();

    await act(async () => releaseFirst(respond(dossier)));

    expect(screen.queryByText('Director general')).toBeNull();
    expect(screen.queryByDisplayValue('Director general')).toBeNull();
    expect(
      screen.getByRole('heading', { name: 'Second Demo SRL' }),
    ).toBeVisible();
  });
});
