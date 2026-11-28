import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import type { ActorContext } from './access-types';
import {
  commands,
  restoreBrowser,
  serve,
  settingsActor,
  stubBrowser,
} from './clarte/settings-config/settings-config.test-support';
import {
  actor as missionPlanActor,
  cataloguePage,
  source,
} from './mission-plan/mission-plan.fixture';
import { templateFixture } from './project/project-template.test-fixtures';
import { renderInInterface } from './test/app-interface';
import {
  fireEvent,
  screen,
  waitFor,
  within,
} from './test/render-with-interface-locale';

// Fictional templates, plans and deadline sets only.
beforeEach(stubBrowser);
afterEach(restoreBrowser);

function openSettingsSection(hash: string) {
  window.history.replaceState(null, '', `/#${hash}`);
  renderInInterface(
    'clarte',
    <App identity={deterministicBrowserIdentity()} />,
  );
}

describe('Project templates in the Clarté Settings console', () => {
  const configurator = () =>
    settingsActor({
      grants: [
        {
          bundle: 'company_project_access',
          version: 'v1',
          assignmentId: 'project-assignment',
        },
        {
          bundle: 'company_project_template_user',
          version: 'v1',
          assignmentId: 'template-assignment',
        },
        {
          bundle: 'company_project_template_configuration',
          version: 'v1',
          assignmentId: 'template-configuration-assignment',
        },
      ],
    });

  it('reads the template head and publishes its next version from a side panel (EX-141, EX-142)', async () => {
    let published = false;
    const sent = serve(configurator, (request) => {
      if (request.path === '/api/project-templates')
        return Response.json({
          templates: [
            published
              ? {
                  ...templateFixture,
                  version: 2,
                  stages: templateFixture.stages.map((stage) => ({
                    ...stage,
                    tasks: stage.tasks.map((task) => ({
                      ...task,
                      title:
                        task.key === 'clarify_request'
                          ? 'Clarificarea cererii'
                          : task.title,
                    })),
                  })),
                }
              : templateFixture,
          ],
          headVersion: published ? 2 : 1,
          nextBeforeVersion: null,
        });
      if (
        request.path ===
          '/api/project-templates/CONSULTING_PREPARATION_ILLUSTRATIVE/versions' &&
        request.method === 'POST'
      ) {
        published = true;
        return Response.json(
          {
            versionId: '30000000-0000-4000-8000-000000000002',
            templateKey: templateFixture.templateKey,
            version: 2,
            sourceVersion: 1,
          },
          { status: 201 },
        );
      }
      return undefined;
    });
    openSettingsSection('project-templates');

    const templates = await screen.findByRole('region', {
      name: 'Template Versions',
    });
    expect(
      await within(templates).findByText('Clarifier la demande'),
    ).toBeVisible();
    fireEvent.click(
      within(templates).getByRole('button', {
        name: 'Publish a Template successor',
      }),
    );
    const panel = screen.getByRole('dialog', {
      name: 'Publish a Template successor',
    });
    fireEvent.change(within(panel).getByLabelText('Required Task 1 title'), {
      target: { value: 'Clarificarea cererii' },
    });
    expect(
      within(
        within(panel).getByRole('list', { name: 'Successor preview' }),
      ).getAllByRole('listitem')[0],
    ).toHaveTextContent('Clarificarea cererii');
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Publish successor Version' }),
    );
    expect(
      await screen.findByText('Successor Version 2 published.'),
    ).toBeVisible();
    const [publication] = commands(
      sent,
      '/api/project-templates/CONSULTING_PREPARATION_ILLUSTRATIVE/versions',
    );
    expect(publication?.body).toMatchObject({
      sourceVersion: 1,
      expectedHeadVersion: 1,
    });
    expect(publication?.key).toBeTruthy();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      await within(templates).findByText('Clarificarea cererii'),
    ).toBeVisible();
  });

  it('moves template configuration from Missions to Settings in Clarté', async () => {
    serve(configurator, () => undefined);
    openSettingsSection('settings');
    const sections = await screen.findByRole('navigation', {
      name: 'Settings sections',
    });
    expect(
      within(sections).getByRole('link', { name: 'Project templates' }),
    ).toBeVisible();
    // Without Project workspace access, nothing is left under Missions.
    expect(
      within(
        screen.getByRole('navigation', { name: 'Primary navigation' }),
      ).queryByRole('link', { name: 'Missions and audits' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Template Versions' }),
    ).not.toBeInTheDocument();
  });
});

describe('Mission Plans in the Clarté Settings console', () => {
  it('reads the plans and their history and publishes a new plan (EX-143, EX-144)', async () => {
    let published: unknown;
    const sent = serve(
      (): ActorContext => missionPlanActor,
      (request) => {
        if (
          request.path === '/api/mission-plans' &&
          request.method === 'POST'
        ) {
          published = request.body;
          return Response.json(
            {
              version: {
                ...source,
                id: '60000000-0000-4000-8000-000000001547',
                planId: '50000000-0000-4000-8000-000000001547',
                title: 'Plan de implementare ISO 14001',
                activities:
                  typeof published === 'object' &&
                  published !== null &&
                  'activities' in published
                    ? published.activities
                    : [],
              },
            },
            { status: 201 },
          );
        }
        if (request.path.endsWith(`/versions/${source.id}`))
          return Response.json({ version: source });
        if (request.path.endsWith('/versions'))
          return Response.json({ headVersionNumber: 1, items: [source] });
        if (request.path === '/api/mission-plans')
          return Response.json(cataloguePage);
        return undefined;
      },
    );
    openSettingsSection('project-templates');

    const plans = await screen.findByRole('region', { name: 'Mission plans' });
    expect(
      await within(plans).findByText('Synthetic reusable plan · Version 1'),
    ).toBeVisible();
    fireEvent.click(
      within(plans).getByRole('button', {
        name: 'Version history: Synthetic reusable plan',
      }),
    );
    expect(
      await within(plans).findByRole('button', { name: /Open Version/u }),
    ).toBeVisible();

    fireEvent.click(within(plans).getByRole('button', { name: 'New plan' }));
    const panel = screen.getByRole('dialog', { name: 'New plan' });
    for (const [label, value] of [
      ['Plan name', 'Plan de implementare ISO 14001'],
      ['Activity title', 'Diagnostic inițial'],
      ['Planned action', 'Analiza situației existente'],
      ['Intended result', 'Raport de diagnostic'],
    ] as const)
      fireEvent.change(within(panel).getByLabelText(label, { exact: true }), {
        target: { value },
      });
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Publish plan' }),
    );
    await waitFor(() =>
      expect(commands(sent, '/api/mission-plans')).toHaveLength(1),
    );
    expect(commands(sent, '/api/mission-plans')[0]?.body).toMatchObject({
      title: 'Plan de implementare ISO 14001',
    });
    expect(await screen.findByText('Publication confirmed.')).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('Procedure deadlines in the Clarté Settings console', () => {
  const administrator = () =>
    settingsActor({
      grants: [],
      workspacePermissions: ['company.assignment.manage'],
    });
  const configuredBy = {
    workspaceMembershipId: '00000000-0000-4000-8000-000000003547',
    displayName: 'Ana Fictiv',
  };

  it('configures the next version of the deadlines in calendar days (EX-233)', async () => {
    const first = {
      version: 1,
      days: {
        stage_plan_sent: 10,
        audit_dossier_transmitted: 15,
        stage_2_report_released: null,
      },
      configuredBy,
      configuredAt: '2026-10-01T09:00:00.000Z',
    };
    const second = {
      ...first,
      version: 2,
      days: { ...first.days, audit_dossier_transmitted: 20 },
      configuredAt: '2026-11-28T09:00:00.000Z',
    };
    let saved = false;
    const sent = serve(administrator, (request) => {
      if (request.path !== '/api/certification-procedure-deadlines')
        return undefined;
      if (request.method === 'POST') {
        saved = true;
        return Response.json(second);
      }
      return Response.json(
        saved
          ? { current: second, history: [second, first] }
          : { current: first, history: [first] },
      );
    });
    openSettingsSection('procedure-deadlines');

    const deadlines = await screen.findByRole('region', {
      name: 'Procedure deadline configuration',
    });
    expect(within(deadlines).getByText('10 days')).toBeVisible();
    expect(within(deadlines).getByText('not configured')).toBeVisible();
    fireEvent.click(within(deadlines).getByRole('button', { name: 'Edit' }));
    const panel = screen.getByRole('dialog', {
      name: 'Procedure deadline configuration',
    });
    const dossier = within(panel).getByLabelText(
      /Audit dossier transmitted.*, in calendar days/u,
    );
    expect(dossier).toHaveValue('15');
    fireEvent.change(dossier, { target: { value: '20' } });
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Save the deadlines' }),
    );
    await waitFor(() =>
      expect(
        commands(sent, '/api/certification-procedure-deadlines'),
      ).toHaveLength(1),
    );
    expect(
      commands(sent, '/api/certification-procedure-deadlines')[0]?.body,
    ).toEqual({
      expectedVersion: 1,
      days: {
        stage_plan_sent: 10,
        audit_dossier_transmitted: 20,
        stage_2_report_released: null,
      },
    });
    expect(
      await screen.findByText('Deadline set version 2 saved.'),
    ).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(deadlines).getByText('20 days')).toBeVisible();
    expect(
      within(
        screen.getByRole('list', { name: 'History of the deadline set' }),
      ).getAllByRole('listitem'),
    ).toHaveLength(2);
  });

  it('offers no deadline section to a member who does not assign the certification bundles', async () => {
    serve(
      () => settingsActor({ grants: [] }),
      () => undefined,
    );
    openSettingsSection('settings');
    await screen.findByRole('navigation', { name: 'Settings sections' });
    expect(
      screen.queryByRole('link', { name: 'Procedure deadlines' }),
    ).not.toBeInTheDocument();
  });
});

describe('Configuration sections in the four interface languages', () => {
  it('names the new sections and their group in Romanian, Russian, French and English', async () => {
    serve(
      () =>
        settingsActor({
          grants: [
            {
              bundle: 'company_commercial_intake',
              version: 'v4',
              assignmentId: 'intake-assignment',
            },
          ],
          workspacePermissions: ['company.assignment.manage'],
        }),
      () => undefined,
    );
    openSettingsSection('language');
    await screen.findByRole('navigation', { name: 'Settings sections' });
    for (const [language, stages, deadlines, delivery] of [
      ['Română', 'Etape de vânzare', 'Termene de procedură', 'Realizare'],
      ['Русский', 'Этапы продаж', 'Сроки процедуры', 'Выполнение работ'],
      ['Français', 'Étapes de vente', 'Délais de procédure', 'Réalisation'],
      ['English', 'Sales stages', 'Procedure deadlines', 'Delivery'],
    ] as const) {
      fireEvent.click(
        screen.getByRole('radio', { name: new RegExp(language, 'u') }),
      );
      expect(
        await screen.findByRole('link', { name: stages }),
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: deadlines })).toBeInTheDocument();
      expect(screen.getAllByText(delivery).length).toBeGreaterThan(0);
    }
  });
});
