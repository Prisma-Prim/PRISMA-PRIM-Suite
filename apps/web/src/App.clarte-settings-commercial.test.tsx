import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import {
  commands,
  companyId,
  restoreBrowser,
  serve,
  settingsActor,
  stubBrowser,
} from './clarte/settings-config/settings-config.test-support';
import { renderInInterface } from './test/app-interface';
import {
  fireEvent,
  screen,
  waitFor,
  within,
} from './test/render-with-interface-locale';
import { selectOption } from './test/select-option';

// Fictional Company, stages, Services, Offerings and versions only.
beforeEach(stubBrowser);
afterEach(restoreBrowser);

function openSettingsSection(hash: string) {
  window.history.replaceState(null, '', `/#${hash}`);
  renderInInterface(
    'clarte',
    <App identity={deterministicBrowserIdentity()} />,
  );
}

function stage(position: number, label: string) {
  return { id: `stage-${position}`, label, position, state: 'ACTIVE' };
}

describe('Sales stages in the Clarté Settings console', () => {
  const configurator = () =>
    settingsActor({
      grants: [
        {
          bundle: 'company_commercial_intake',
          version: 'v4',
          assignmentId: 'intake-assignment',
        },
        {
          bundle: 'company_sales_stage_configuration',
          version: 'v1',
          assignmentId: 'stage-configuration-assignment',
        },
      ],
    });

  it('adds a stage at the end of the Company list from a side panel (EX-064)', async () => {
    let stages = [stage(1, 'Lead nou'), stage(2, 'Calificare')];
    const sent = serve(configurator, (request) => {
      if (request.path !== '/api/sales-stages') return undefined;
      if (request.method === 'POST') {
        stages = [...stages, stage(3, 'Negociere finală')];
        return Response.json(
          { configuration: { revision: 3, stages } },
          { status: 201 },
        );
      }
      return Response.json({ revision: 2, stages });
    });
    openSettingsSection('sales-stages');

    const list = await screen.findByRole('list', { name: 'Sales Stages' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['1Lead nouActive', '2CalificareActive']);
    expect(
      screen.getByRole('region', { name: 'Fictional Consulting · Stages: 2' }),
    ).toBeVisible();
    expect(
      screen.getByText(/Up to 30 stages, each with a unique label/u),
    ).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Add a stage' }));
    const panel = screen.getByRole('dialog', { name: 'Sales Stage settings' });
    fireEvent.change(within(panel).getByLabelText('New stage label'), {
      target: { value: 'Negociere finală' },
    });
    fireEvent.click(within(panel).getByRole('button', { name: 'Add stage' }));

    await waitFor(() =>
      expect(commands(sent, '/api/sales-stages')).toHaveLength(1),
    );
    const [created] = commands(sent, '/api/sales-stages');
    expect(created?.body).toEqual({
      expectedRevision: 2,
      label: 'Negociere finală',
    });
    expect(created?.key).toBeTruthy();
    expect(created?.company).toBe(companyId);
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Sales Stage added.',
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Sales Stages' }))
        .getAllByRole('listitem')
        .at(-1),
    ).toHaveTextContent('Negociere finală');
  });

  it('keeps the form open on a taken label and shows a Commercial Intake reader the list read-only', async () => {
    serve(configurator, (request) => {
      if (request.path !== '/api/sales-stages') return undefined;
      if (request.method === 'POST')
        return Response.json(
          { code: 'SALES_STAGE_LABEL_TAKEN' },
          { status: 400 },
        );
      return Response.json({ revision: 1, stages: [stage(1, 'Calificare')] });
    });
    openSettingsSection('sales-stages');
    fireEvent.click(await screen.findByRole('button', { name: 'Add a stage' }));
    const panel = screen.getByRole('dialog', { name: 'Sales Stage settings' });
    fireEvent.change(within(panel).getByLabelText('New stage label'), {
      target: { value: 'Calificare' },
    });
    fireEvent.click(within(panel).getByRole('button', { name: 'Add stage' }));
    expect(
      await within(panel).findByText(
        'Another Sales Stage of this Company already uses this label.',
      ),
    ).toBeVisible();
    expect(within(panel).getByLabelText('New stage label')).toHaveValue(
      'Calificare',
    );
  });

  it('shows the list without the add action to a reader without the configuration bundle', async () => {
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
        }),
      (request) =>
        request.path === '/api/sales-stages'
          ? Response.json({ revision: 0, stages: [] })
          : undefined,
    );
    openSettingsSection('sales-stages');
    expect(
      await screen.findByText(
        'No Sales Stage is configured for this Company yet.',
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        'Only a holder of Company Sales Stage Configuration can add Sales Stages.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Add a stage' }),
    ).not.toBeInTheDocument();
  });
});

describe('Service catalogue in the Clarté Settings console', () => {
  const definition = {
    id: '00000000-0000-4000-8000-000000000071',
    code: 'SVC_GAMMA',
    name: 'Serviciu demonstrativ Gamma',
    description: 'Descriere demonstrativă',
    provenance: 'ILLUSTRATIVE',
    provisional: true,
    createdByWorkspaceMembershipId: 'membership-1',
    createdAt: '2026-11-20T10:00:00.000Z',
  };
  const offering = {
    id: '00000000-0000-4000-8000-000000000072',
    companyId,
    serviceDefinitionId: definition.id,
    serviceDefinition: { code: definition.code, name: definition.name },
    commercialLabel: 'Etichetă comercială demonstrativă',
    availability: 'AVAILABLE',
    provenance: 'ILLUSTRATIVE',
    provisional: true,
    createdByWorkspaceMembershipId: 'membership-1',
    createdAt: '2026-11-20T10:05:00.000Z',
  };
  const catalogueManager = () =>
    settingsActor({
      grants: [
        {
          bundle: 'company_service_catalogue',
          version: 'v1',
          assignmentId: 'catalogue-assignment',
        },
      ],
    });

  it('defines a shared Service and registers an Offering from it (EX-070, EX-071)', async () => {
    let definitions: unknown[] = [];
    let offerings: unknown[] = [];
    const sent = serve(catalogueManager, (request) => {
      if (request.path === '/api/commercial-catalogue/service-definitions') {
        if (request.method === 'POST') {
          definitions = [definition];
          return Response.json(
            { outcome: 'CREATED', definition },
            { status: 201 },
          );
        }
        return Response.json({ items: definitions });
      }
      if (request.path === '/api/commercial-catalogue/offerings') {
        if (request.method === 'POST') {
          offerings = [offering];
          return Response.json(
            { outcome: 'CREATED', offering },
            { status: 201 },
          );
        }
        return Response.json({ items: offerings });
      }
      return undefined;
    });
    openSettingsSection('catalogue');

    expect(
      await screen.findByText('No Service Definitions in this Workspace yet.'),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Define Service' }));
    const definePanel = screen.getByRole('dialog', {
      name: 'Shared Service Definitions',
    });
    fireEvent.change(within(definePanel).getByLabelText('Service code'), {
      target: { value: 'svc_gamma' },
    });
    fireEvent.change(within(definePanel).getByLabelText('Service name'), {
      target: { value: definition.name },
    });
    fireEvent.change(within(definePanel).getByLabelText('Description'), {
      target: { value: definition.description },
    });
    fireEvent.click(
      within(definePanel).getByRole('button', { name: 'Define Service' }),
    );
    await waitFor(() =>
      expect(
        commands(sent, '/api/commercial-catalogue/service-definitions'),
      ).toHaveLength(1),
    );
    expect(
      commands(sent, '/api/commercial-catalogue/service-definitions')[0]?.body,
    ).toEqual({
      code: 'SVC_GAMMA',
      name: definition.name,
      description: definition.description,
    });
    const definitionsTable = await screen.findByRole('table', {
      name: 'Service Definitions',
    });
    expect(within(definitionsTable).getByText('SVC_GAMMA')).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Record offering' }));
    const offerPanel = screen.getByRole('dialog', {
      name: 'Offerings of Fictional Consulting',
    });
    selectOption(
      within(offerPanel).getByLabelText('Service Definition'),
      definition.id,
    );
    fireEvent.change(within(offerPanel).getByLabelText('Commercial label'), {
      target: { value: offering.commercialLabel },
    });
    fireEvent.click(
      within(offerPanel).getByRole('button', { name: 'Record offering' }),
    );
    await waitFor(() =>
      expect(
        commands(sent, '/api/commercial-catalogue/offerings'),
      ).toHaveLength(1),
    );
    expect(
      commands(sent, '/api/commercial-catalogue/offerings')[0]?.body,
    ).toEqual({
      serviceDefinitionId: definition.id,
      commercialLabel: offering.commercialLabel,
    });
    const offeringsTable = await screen.findByRole('table', {
      name: 'Company Service Offerings',
    });
    expect(
      within(offeringsTable).getByText('Etichetă comercială demonstrativă'),
    ).toBeVisible();
  });
});

describe('Pricing in the Clarté Settings console', () => {
  const offeringId = '10000000-0000-4000-8000-00000000000a';
  function ruleVersion(versionNumber: number, state: string, label: string) {
    return {
      id: `00000000-0000-4000-8000-00000000010${versionNumber}`,
      versionNumber,
      label,
      effectiveFrom: `2026-0${versionNumber + 4}-01T08:00:00.000Z`,
      effectiveTo: null,
      ruleShape: 'UNIT_PRICE_TIMES_QUANTITY',
      roundingMode: 'HALF_UP',
      roundingScale: 2,
      taxApplication: 'PER_LINE',
      provenance: 'ILLUSTRATIVE',
      provisional: true,
      state,
      supersession: null,
      createdByWorkspaceMembershipId: 'membership-1',
      createdAt: '2026-04-01T08:00:00.000Z',
    };
  }
  function tariffVersion(versionNumber: number, state: string) {
    return {
      id: `00000000-0000-4000-8000-00000000020${versionNumber}`,
      offeringId,
      versionNumber,
      unit: 'unitate-demo',
      unitAmount: '1250.0000',
      currency: 'MDL',
      taxRatePercent: '20',
      taxLabel: 'TVA',
      effectiveFrom: `2026-0${versionNumber + 4}-01T08:00:00.000Z`,
      effectiveTo: null,
      provenance: 'ILLUSTRATIVE',
      provisional: true,
      state,
      supersession: null,
      createdByWorkspaceMembershipId: 'membership-1',
      createdAt: '2026-04-01T08:00:00.000Z',
    };
  }
  const pricingManager = () =>
    settingsActor({
      grants: [
        {
          bundle: 'company_pricing_configuration',
          version: 'v1',
          assignmentId: 'pricing-assignment',
        },
      ],
    });

  it('reads current and scheduled Pricing Rule versions and publishes the next one (EX-073, EX-074)', async () => {
    const current = ruleVersion(1, 'CURRENT', 'Regulă demonstrativă A');
    const scheduled = ruleVersion(2, 'SCHEDULED', 'Regulă demonstrativă B');
    let head = scheduled;
    const sent = serve(pricingManager, (request) => {
      if (request.path === '/api/pricing-configuration/rule-scope')
        return Response.json({
          current,
          headVersionNumber: head.versionNumber,
          provisional: true,
        });
      if (request.path === '/api/pricing-configuration/rule-versions') {
        if (request.method === 'POST') {
          head = ruleVersion(3, 'SCHEDULED', 'Regulă demonstrativă C');
          return Response.json(
            { outcome: 'PUBLISHED', version: head },
            { status: 201 },
          );
        }
        return Response.json({
          items:
            head.versionNumber === 3
              ? [head, scheduled, current]
              : [scheduled, current],
          provisional: true,
        });
      }
      return undefined;
    });
    openSettingsSection('pricing');

    const currentTable = await screen.findByRole('table', {
      name: 'Current Pricing Rule Version',
    });
    expect(
      within(currentTable).getByText('Regulă demonstrativă A'),
    ).toBeVisible();
    expect(within(currentTable).getByText('Current')).toBeVisible();
    expect(
      within(
        screen.getByRole('table', { name: 'Scheduled successors' }),
      ).getByText('Regulă demonstrativă B'),
    ).toBeVisible();

    fireEvent.click(
      screen.getByRole('button', { name: 'Publish a Pricing Rule Version' }),
    );
    const panel = screen.getByRole('dialog', {
      name: 'Publish a Pricing Rule Version',
    });
    fireEvent.change(within(panel).getByLabelText('Label'), {
      target: { value: 'Regulă demonstrativă C' },
    });
    fireEvent.change(within(panel).getByLabelText(/^Effective from/u), {
      target: { value: '2030-01-01T08:00:00' },
    });
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Publish version' }),
    );
    await waitFor(() =>
      expect(
        commands(sent, '/api/pricing-configuration/rule-versions'),
      ).toHaveLength(1),
    );
    expect(
      commands(sent, '/api/pricing-configuration/rule-versions')[0]?.body,
    ).toMatchObject({
      label: 'Regulă demonstrativă C',
      expectedActiveVersionNumber: 2,
    });
    expect(await screen.findByText('Version 3 published.')).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('reads an Offering’s Tariff versions and publishes a Tariff version for it (EX-075, EX-076)', async () => {
    const current = tariffVersion(1, 'CURRENT');
    let published = false;
    const sent = serve(pricingManager, (request) => {
      if (request.path === '/api/pricing-configuration/rule-scope')
        return Response.json({
          current: null,
          headVersionNumber: null,
          provisional: true,
        });
      if (request.path === '/api/pricing-configuration/rule-versions')
        return Response.json({ items: [], provisional: true });
      if (request.path === '/api/commercial-catalogue/offerings')
        return Response.json({
          items: [
            {
              id: offeringId,
              serviceDefinition: {
                code: 'SVC_ALPHA',
                name: 'Serviciu demonstrativ Alfa',
              },
              commercialLabel: null,
            },
          ],
        });
      if (
        request.path ===
        `/api/pricing-configuration/offerings/${offeringId}/tariff-scope`
      )
        return Response.json({
          offeringId,
          current,
          headVersionNumber: published ? 2 : 1,
          provisional: true,
        });
      if (
        request.path ===
        `/api/pricing-configuration/offerings/${offeringId}/tariff-versions`
      ) {
        if (request.method === 'POST') {
          published = true;
          return Response.json(
            { outcome: 'PUBLISHED', version: tariffVersion(2, 'SCHEDULED') },
            { status: 201 },
          );
        }
        return Response.json({
          items: published
            ? [tariffVersion(2, 'SCHEDULED'), current]
            : [current],
          provisional: true,
        });
      }
      return undefined;
    });
    openSettingsSection('pricing');

    const tariffs = await screen.findByRole('region', {
      name: 'Tariff Versions',
    });
    selectOption(
      await within(tariffs).findByLabelText('Company Service Offering'),
      offeringId,
    );
    const history = await within(tariffs).findByRole('table', {
      name: 'All Tariff Versions of this offering',
    });
    expect(
      within(history).getByText('1,250.0000 MDL per unitate-demo'),
    ).toBeVisible();

    fireEvent.click(
      within(tariffs).getByRole('button', { name: 'Publish a Tariff Version' }),
    );
    const panel = screen.getByRole('dialog', {
      name: 'Publish a Tariff Version',
    });
    fireEvent.change(within(panel).getByLabelText('Unit'), {
      target: { value: 'unitate-demo' },
    });
    fireEvent.change(within(panel).getByLabelText('Unit amount'), {
      target: { value: '1300' },
    });
    selectOption(within(panel).getByLabelText('Currency'), 'MDL');
    fireEvent.change(within(panel).getByLabelText('Tax rate percent'), {
      target: { value: '20' },
    });
    fireEvent.change(within(panel).getByLabelText('Tax label'), {
      target: { value: 'TVA' },
    });
    fireEvent.change(within(panel).getByLabelText(/^Effective from/u), {
      target: { value: '2030-01-01T08:00:00' },
    });
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Publish Tariff Version' }),
    );
    await waitFor(() =>
      expect(
        commands(
          sent,
          `/api/pricing-configuration/offerings/${offeringId}/tariff-versions`,
        ),
      ).toHaveLength(1),
    );
    expect(
      commands(
        sent,
        `/api/pricing-configuration/offerings/${offeringId}/tariff-versions`,
      )[0]?.body,
    ).toMatchObject({
      unit: 'unitate-demo',
      unitAmount: '1300',
      currency: 'MDL',
      taxRatePercent: '20',
      taxLabel: 'TVA',
      expectedActiveVersionNumber: 1,
    });
    expect(
      await within(tariffs).findByText('Tariff Version 2 published.'),
    ).toBeVisible();
  });
});
