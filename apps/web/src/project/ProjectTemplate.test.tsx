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
import {
  InterfaceLocaleProvider,
  interfaceLocaleStorageKey,
} from '../localization/interface-locale';
import { changeValue } from '../test/select-option';
import {
  ProjectTemplatePlan,
  ProjectTemplateSelector,
} from './ProjectTemplate';
import {
  copiedPlanFixture,
  templateFixture,
} from './project-template.test-fixtures';

const actor: ActorContext = {
  internalUserId: 'owner',
  workspaceMembershipId: 'member',
  workspaceId: 'workspace',
  workspaceName: 'Workspace',
  displayName: 'Owner',
  email: 'owner@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: {
    id: 'company-one',
    displayName: 'Company',
    clientPermissions: [],
    projectPermissions: ['project.read'],
  },
};
const identity = deterministicBrowserIdentity();
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});
function prepareLocale() {
  localStorage.setItem(interfaceLocaleStorageKey, 'en');
}

it('shows a catalogue failure without selecting malformed business data and retries only on deliberate action', async () => {
  const selection = vi.fn();
  let reads = 0;
  const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
    expect(init?.method ?? 'GET').toBe('GET');
    expect(new Headers(init?.headers).get('x-company-context-id')).toBe(
      'company-one',
    );
    reads += 1;
    return Response.json({
      templates:
        reads === 1 ? [{ ...templateFixture, stages: [] }] : [templateFixture],
    });
  });
  vi.stubGlobal('fetch', fetch);
  prepareLocale();
  render(
    <InterfaceLocaleProvider>
      <ProjectTemplateSelector
        actor={actor}
        identity={identity}
        selection={null}
        onSelection={selection}
        disabled={false}
      />
    </InterfaceLocaleProvider>,
  );
  await screen.findByText('Templates could not be loaded.');
  expect(
    screen.queryByRole('combobox', { name: 'Project template' }),
  ).not.toBeInTheDocument();
  expect(selection).not.toHaveBeenCalled();
  expect(reads).toBe(1);
  fireEvent.click(screen.getByRole('button', { name: 'Reload templates' }));
  const choice = await screen.findByRole('combobox', {
    name: 'Project template',
  });
  changeValue(choice, 'CONSULTING_PREPARATION_ILLUSTRATIVE:1');
  expect(selection).toHaveBeenCalledWith({
    templateKey: 'CONSULTING_PREPARATION_ILLUSTRATIVE',
    version: 1,
  });
  expect(reads).toBe(2);
});

it('shows dedicated read denial without disclosing a source definition or offering a retry loop', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 403 })),
  );
  prepareLocale();
  render(
    <InterfaceLocaleProvider>
      <ProjectTemplateSelector
        actor={actor}
        identity={identity}
        selection={null}
        onSelection={vi.fn()}
        disabled={false}
      />
    </InterfaceLocaleProvider>,
  );
  await screen.findByText('Explicit Project template access is required.');
  expect(
    screen.queryByRole('combobox', { name: 'Project template' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Reload templates' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText('Préparation d’une mission de conseil'),
  ).not.toBeInTheDocument();
});

it('refuses a copied plan missing Task identities and restores its exact original business text after explicit reload', async () => {
  let reads = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      reads += 1;
      return Response.json({
        template: reads === 1 ? templateFixture : copiedPlanFixture,
      });
    }),
  );
  prepareLocale();
  render(
    <InterfaceLocaleProvider>
      <ProjectTemplatePlan
        actor={actor}
        identity={identity}
        projectId="project-one"
      />
    </InterfaceLocaleProvider>,
  );
  await screen.findByText('The original plan could not be loaded.');
  expect(
    screen.queryByText('Clarifier la demande — Required'),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Reload templates' }));
  await screen.findByText('Clarifier la demande — Required');
  expect(screen.getByRole('heading', { name: 'Cadrage' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Préparation' })).toBeVisible();
  expect(screen.getByText('Préparer le plan — Required')).toBeVisible();
  expect(reads).toBe(2);
});

it('discards the old Company’s late catalogue reply after moving to a Company with no available model', async () => {
  let completeOld: (response: Response) => void = () => {
    throw new Error('The old request did not start.');
  };
  const oldResponse = new Promise<Response>((resolve) => {
    completeOld = resolve;
  });
  const fetch = vi.fn(async (_url: string, init?: RequestInit) =>
    new Headers(init?.headers).get('x-company-context-id') === 'company-one'
      ? oldResponse
      : Response.json({ templates: [] }),
  );
  vi.stubGlobal('fetch', fetch);
  prepareLocale();
  const props = {
    identity,
    selection: null,
    onSelection: vi.fn(),
    disabled: false,
  };
  const view = render(
    <InterfaceLocaleProvider>
      <ProjectTemplateSelector {...props} actor={actor} />
    </InterfaceLocaleProvider>,
  );
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  const otherActor: ActorContext = {
    ...actor,
    activeCompany: {
      id: 'company-two',
      displayName: 'Other Company',
      clientPermissions: [],
      projectPermissions: ['project.read'],
    },
  };
  view.rerender(
    <InterfaceLocaleProvider>
      <ProjectTemplateSelector {...props} actor={otherActor} />
    </InterfaceLocaleProvider>,
  );
  await screen.findByText('No templates are available.');
  await act(async () => {
    completeOld(Response.json({ templates: [templateFixture] }));
    await oldResponse;
  });
  expect(screen.getByText('No templates are available.')).toBeVisible();
  expect(
    screen.queryByRole('option', {
      name: /Préparation d’une mission de conseil/,
    }),
  ).not.toBeInTheDocument();
  expect(props.onSelection).not.toHaveBeenCalled();
});

it('offers the explicitly captured pilot model and renders thirteen preserved actions with intended outcomes', async () => {
  const { pilotSourceFixture, pilotCopyFixture } =
    await import('./project-pilot-plan.test-fixtures');
  const pilotActor: ActorContext = {
    ...actor,
    activeCompany: {
      ...actor.activeCompany,
      id: 'company-one',
      displayName: 'Company',
      clientPermissions: [],
      projectPermissions: ['project.read'],
      projectTemplatePermissionAssignmentId: 'grant-v2',
      projectTemplatePermissionSetVersion: 'v2',
      projectTemplatePermissions: [
        'project.template.read',
        'project.template.instantiate',
        'project.template.pilot.read',
        'project.template.pilot.instantiate',
      ],
    },
  };
  const choose = vi.fn();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      Response.json(
        url.endsWith('/template')
          ? { template: pilotCopyFixture }
          : {
              templates: url.includes('templateKey=CONSULTING_MISSION')
                ? [pilotSourceFixture]
                : [templateFixture],
              headVersion: 1,
              nextBeforeVersion: null,
            },
      ),
    ),
  );
  prepareLocale();
  render(
    <InterfaceLocaleProvider>
      <ProjectTemplateSelector
        actor={pilotActor}
        identity={identity}
        selection={null}
        onSelection={choose}
        disabled={false}
      />
      <ProjectTemplatePlan
        actor={pilotActor}
        identity={identity}
        projectId="pilot-project"
      />
    </InterfaceLocaleProvider>,
  );
  const selector = await screen.findByRole('combobox', {
    name: 'Project template',
  });

  changeValue(selector, 'CONSULTING_MISSION_PILOT_ILLUSTRATIVE:1');
  expect(choose).toHaveBeenCalledWith({
    templateKey: 'CONSULTING_MISSION_PILOT_ILLUSTRATIVE',
    version: 1,
  });
  expect(await screen.findByText('Plan de implementare (PDCA)')).toBeVisible();
  expect(screen.getByText('Asistență la audit extern')).toBeVisible();
  expect(screen.getByText('Certificare obținută')).toBeVisible();
  expect(screen.queryByText(/— Required/)).not.toBeInTheDocument();
});

it('lets a source-only v2 reader inspect the pilot before creation and preserves literal text through all interface locales', async () => {
  const { ProjectTemplateConfiguration } =
    await import('./ProjectTemplateConfiguration');
  const { InterfaceLocaleSelect } =
    await import('../localization/InterfaceLocaleSelect');
  const { pilotSourceFixture } =
    await import('./project-pilot-plan.test-fixtures');
  const reader: ActorContext = {
    ...actor,
    activeCompany: {
      id: 'company-one',
      displayName: 'Company',
      clientPermissions: [],
      projectPermissions: ['project.read'],
      projectTemplatePermissionAssignmentId: 'source-v2',
      projectTemplatePermissionSetVersion: 'v2',
      projectTemplatePermissions: [
        'project.template.read',
        'project.template.instantiate',
        'project.template.pilot.read',
        'project.template.pilot.instantiate',
      ],
    },
  };
  const fetch = vi.fn(async (url: string) =>
    Response.json({
      templates: [
        url.includes('templateKey=') ? pilotSourceFixture : templateFixture,
      ],
      headVersion: 1,
      nextBeforeVersion: null,
    }),
  );
  vi.stubGlobal('fetch', fetch);
  prepareLocale();
  const identity = deterministicBrowserIdentity();
  const view = render(
    <InterfaceLocaleProvider>
      <InterfaceLocaleSelect />
      <ProjectTemplateConfiguration actor={reader} identity={identity} />
    </InterfaceLocaleProvider>,
  );
  const selector = await screen.findByRole('combobox', {
    name: 'Project template',
  });
  changeValue(selector, 'CONSULTING_MISSION_PILOT_ILLUSTRATIVE:1');
  const preview = await screen.findByRole('region', {
    name: 'Selected source plan',
  });
  expect(preview.querySelectorAll('li')).toHaveLength(13);
  expect(screen.getByText('Plan de implementare (PDCA)')).toBeVisible();
  const requests = fetch.mock.calls.length;
  for (const locale of ['ro', 'ru', 'fr', 'en']) {
    changeValue(
      screen.getByRole('combobox', {
        name: /Interface language|Limba interfeței|Язык интерфейса|Langue de l’interface/,
      }),
      locale,
    );
    expect(screen.getByText('Certificare obținută')).toBeVisible();
    expect(
      screen.getByText(
        'Analiza sistemului existent și determinarea gradului de conformare la standardele ISO',
      ),
    ).toBeVisible();
  }
  expect(fetch.mock.calls).toHaveLength(requests);
  expect(
    screen.queryByRole('button', { name: /Create Project|Publish successor/ }),
  ).not.toBeInTheDocument();
  const replacementIdentity = deterministicBrowserIdentity();
  view.rerender(
    <InterfaceLocaleProvider>
      <InterfaceLocaleSelect />
      <ProjectTemplateConfiguration
        actor={reader}
        identity={replacementIdentity}
      />
    </InterfaceLocaleProvider>,
  );
  await screen.findByRole('combobox', { name: 'Project template' });
  expect(screen.queryByText('Certificare obținută')).not.toBeInTheDocument();
  changeValue(
    await screen.findByRole('combobox', { name: 'Project template' }),
    'CONSULTING_MISSION_PILOT_ILLUSTRATIVE:1',
  );
  expect(await screen.findByText('Certificare obținută')).toBeVisible();
  const legacyReader: ActorContext = {
    ...reader,
    activeCompany: reader.activeCompany
      ? {
          ...reader.activeCompany,
          projectTemplatePermissionSetVersion: 'v1',
          projectTemplatePermissions: [
            'project.template.read',
            'project.template.instantiate',
          ],
        }
      : undefined,
  };
  view.rerender(
    <InterfaceLocaleProvider>
      <InterfaceLocaleSelect />
      <ProjectTemplateConfiguration
        actor={legacyReader}
        identity={replacementIdentity}
      />
    </InterfaceLocaleProvider>,
  );
  expect(screen.queryByText('Certificare obținută')).not.toBeInTheDocument();
});
