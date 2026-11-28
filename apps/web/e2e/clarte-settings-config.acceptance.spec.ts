import { expect, test, type Page, type Route } from '@playwright/test';
import { companyGrants } from '../src/access/company-grants.test-fixture';
import { syntheticContent as offerContent } from '../src/offer-model/offer-model.fixture';
import { templateFixture } from '../src/project/project-template.test-fixtures';
import { actorContextFixture } from './actor-context.fixture';
import { isPhoneLayout, openClarte, openClarteEntry } from './clarte.fixture';

// Every API response is intercepted: a fictional Company, no live backend.
const company = {
  id: '00000000-0000-4000-8000-000000001547',
  displayName: 'PRISMA-PRIM',
};
const scope = {
  workspaceId: actorContextFixture.workspaceId,
  companyId: company.id,
};
const grant = (index: number) =>
  `00000000-0000-4000-8000-0000000017${String(index).padStart(2, '0')}`;

/** A fictional configurator holding every configuration bundle of the slice. */
function configurator() {
  return {
    ...actorContextFixture,
    workspacePermissions: ['company.manage', 'company.assignment.manage'],
    activeCompany: {
      ...company,
      grants: companyGrants(
        {
          bundle: 'company_commercial_intake',
          version: 'v4',
          assignmentId: grant(1),
        },
        {
          bundle: 'company_sales_stage_configuration',
          version: 'v1',
          assignmentId: grant(2),
        },
        {
          bundle: 'company_service_catalogue',
          version: 'v1',
          assignmentId: grant(3),
        },
        {
          bundle: 'company_pricing_configuration',
          version: 'v1',
          assignmentId: grant(4),
        },
        {
          bundle: 'company_offer_model_editor',
          version: 'v1',
          assignmentId: grant(5),
        },
        {
          bundle: 'company_offer_model_approver',
          version: 'v1',
          assignmentId: grant(6),
        },
        {
          bundle: 'company_contract_model_editor',
          version: 'v1',
          assignmentId: grant(7),
        },
        {
          bundle: 'company_mission_plan_configuration',
          version: 'v1',
          assignmentId: grant(8),
        },
        {
          bundle: 'company_project_access',
          version: 'v1',
          assignmentId: grant(9),
        },
        {
          bundle: 'company_project_template_user',
          version: 'v1',
          assignmentId: grant(10),
        },
        {
          bundle: 'company_project_template_configuration',
          version: 'v1',
          assignmentId: grant(11),
        },
      ),
    },
  };
}

const attribution = {
  actor: {
    workspaceMembershipId: actorContextFixture.workspaceMembershipId,
    internalUserId: actorContextFixture.internalUserId,
    displayName: actorContextFixture.displayName,
  },
  recordedAt: '2026-11-20T09:00:00.000Z',
};
const offerVersion = (versionNumber: number, predecessor: string | null) => ({
  id: `00000000-0000-4000-8000-00000000600${versionNumber}`,
  versionNumber,
  predecessorVersionId: predecessor,
  content: offerContent,
  ...attribution,
  decision: null,
  withdrawal: null,
});
const firstOffer = offerVersion(1, null);
const secondOffer = offerVersion(2, firstOffer.id);
const offerModel = {
  id: '00000000-0000-4000-8000-000000005001',
  ...scope,
  code: 'INTEGRATED_MANAGEMENT_CONSULTING_RO',
  language: 'ro',
};

const plan = {
  ...scope,
  id: '00000000-0000-4000-8000-000000007001',
  planId: '00000000-0000-4000-8000-000000007000',
  versionNumber: 1,
  title: 'Plan demonstrativ',
  activityCount: 2,
  publishedAt: '2026-10-14T09:00:00.000Z',
  actor: {
    membershipId: actorContextFixture.workspaceMembershipId,
    displayName: actorContextFixture.displayName,
  },
  activities: [
    {
      key: '00000000-0000-4000-8000-000000007101',
      title: 'Activitate demonstrativă 1',
      activity: 'Acțiune demonstrativă 1',
      intendedResult: 'Rezultat demonstrativ 1',
    },
    {
      key: '00000000-0000-4000-8000-000000007102',
      title: 'Activitate demonstrativă 2',
      activity: 'Acțiune demonstrativă 2',
      intendedResult: 'Rezultat demonstrativ 2',
    },
  ],
};

const offering = {
  id: '00000000-0000-4000-8000-000000008001',
  companyId: company.id,
  serviceDefinitionId: '00000000-0000-4000-8000-000000008101',
  serviceDefinition: {
    code: 'SVC_ALPHA',
    name: 'Serviciu demonstrativ Alfa',
  },
  commercialLabel: 'Descriere demonstrativă',
  availability: 'AVAILABLE',
  provenance: 'ILLUSTRATIVE',
  provisional: true,
  createdByWorkspaceMembershipId: actorContextFixture.workspaceMembershipId,
  createdAt: '2026-10-01T09:00:00.000Z',
};
const definition = (code: string, name: string, id: string) => ({
  id,
  code,
  name,
  description: null,
  provenance: 'ILLUSTRATIVE',
  provisional: true,
  createdByWorkspaceMembershipId: actorContextFixture.workspaceMembershipId,
  createdAt: '2026-10-01T09:00:00.000Z',
});
const tariff = (versionNumber: number, state: string, unitAmount: string) => ({
  id: `00000000-0000-4000-8000-00000000900${versionNumber}`,
  offeringId: offering.id,
  versionNumber,
  unit: 'unitate-demo',
  unitAmount,
  currency: 'MDL',
  taxRatePercent: '20',
  taxLabel: 'TVA',
  effectiveFrom: '2026-01-01T00:00:00.000Z',
  effectiveTo: null,
  provenance: 'ILLUSTRATIVE',
  provisional: true,
  state,
  supersession: null,
  createdByWorkspaceMembershipId: actorContextFixture.workspaceMembershipId,
  createdAt: '2025-12-20T09:00:00.000Z',
});
const deadlineSet = (version: number, auditDossier: number) => ({
  version,
  days: {
    stage_plan_sent: 10,
    audit_dossier_transmitted: auditDossier,
    stage_2_report_released: 30,
  },
  configuredBy: {
    workspaceMembershipId: actorContextFixture.workspaceMembershipId,
    displayName: actorContextFixture.displayName,
  },
  configuredAt: `2026-1${version}-01T09:00:00.000Z`,
});

function body(route: Route): unknown {
  const text = route.request().postData();
  return text ? JSON.parse(text) : undefined;
}

/** A stateful fake of every configuration read and command of the journey. */
async function serveConfigurator(page: Page) {
  const stages = [
    'Lead nou',
    'Calificare inițială',
    'Evaluare internă',
    'Propunere',
    'Discuție contractuală',
  ].map((label, index) => ({
    id: `00000000-0000-4000-8000-00000000400${index}`,
    label,
    position: index + 1,
    state: 'ACTIVE',
  }));
  const definitions = [
    definition(
      'SVC_ALPHA',
      'Serviciu demonstrativ Alfa',
      offering.serviceDefinitionId,
    ),
    definition(
      'SVC_BETA',
      'Serviciu demonstrativ Beta',
      '00000000-0000-4000-8000-000000008102',
    ),
  ];
  const tariffs = [tariff(1, 'CURRENT', '1250.0000')];
  let offerModelRevision: 'pending' | 'proposed' | 'approved' = 'pending';
  let deadlines = [deadlineSet(1, 15)];
  const writes: string[] = [];
  await page.route('**/api/**', async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (method !== 'GET') writes.push(`${method} ${path}`);
    if (path === '/api/access/current-actor')
      return route.fulfill({ json: configurator() });
    if (path === '/api/companies') return route.fulfill({ json: [company] });
    if (path === '/api/activity-log')
      return route.fulfill({ json: { events: [] } });
    if (path === '/api/sales-stages' && method === 'GET')
      return route.fulfill({ json: { revision: stages.length, stages } });
    if (path === '/api/sales-stages') {
      const sent = body(route);
      const label =
        typeof sent === 'object' && sent !== null && 'label' in sent
          ? String(sent.label)
          : '';
      stages.push({
        id: '00000000-0000-4000-8000-000000004099',
        label,
        position: stages.length + 1,
        state: 'ACTIVE',
      });
      return route.fulfill({
        status: 201,
        json: { configuration: { revision: stages.length, stages } },
      });
    }
    if (path === '/api/commercial-catalogue/service-definitions') {
      if (method === 'GET')
        return route.fulfill({ json: { items: definitions } });
      const created = definition(
        'SVC_GAMMA',
        'Serviciu demonstrativ Gamma',
        '00000000-0000-4000-8000-000000008103',
      );
      definitions.unshift(created);
      return route.fulfill({
        status: 201,
        json: { outcome: 'CREATED', definition: created },
      });
    }
    if (path === '/api/commercial-catalogue/offerings')
      return route.fulfill({ json: { items: [offering] } });
    if (path === '/api/pricing-configuration/rule-scope')
      return route.fulfill({
        json: { current: null, headVersionNumber: null, provisional: true },
      });
    if (path === '/api/pricing-configuration/rule-versions')
      return route.fulfill({ json: { items: [], provisional: true } });
    const tariffRoot = `/api/pricing-configuration/offerings/${offering.id}`;
    if (path === `${tariffRoot}/tariff-scope`)
      return route.fulfill({
        json: {
          offeringId: offering.id,
          current: tariffs.at(-1),
          headVersionNumber: tariffs[0]?.versionNumber ?? null,
          provisional: true,
        },
      });
    if (path === `${tariffRoot}/tariff-versions` && method === 'GET')
      return route.fulfill({ json: { items: tariffs, provisional: true } });
    if (path === `${tariffRoot}/tariff-versions`) {
      const published = {
        ...tariff(2, 'SCHEDULED', '1300'),
        effectiveFrom: '2030-01-01T00:00:00.000Z',
      };
      tariffs.unshift(published);
      return route.fulfill({
        status: 201,
        json: { outcome: 'PUBLISHED', version: published },
      });
    }
    if (path === '/api/offer-models/consulting-ro')
      return route.fulfill({
        json: {
          model:
            offerModelRevision === 'pending'
              ? {
                  ...offerModel,
                  revision: 1,
                  head: firstOffer,
                  activeVersion: null,
                }
              : offerModelRevision === 'proposed'
                ? {
                    ...offerModel,
                    revision: 2,
                    head: secondOffer,
                    activeVersion: null,
                  }
                : approvedOfferModel(),
        },
      });
    if (path === '/api/offer-models/consulting-ro/versions' && method === 'GET')
      return route.fulfill({ json: { versions: [], nextCursor: null } });
    if (path === '/api/offer-models/consulting-ro/versions') {
      offerModelRevision = 'proposed';
      return route.fulfill({
        status: 201,
        json: {
          model: {
            ...offerModel,
            revision: 2,
            head: secondOffer,
            activeVersion: null,
          },
        },
      });
    }
    if (path.endsWith('/decision')) {
      offerModelRevision = 'approved';
      return route.fulfill({
        status: 201,
        json: { model: approvedOfferModel() },
      });
    }
    if (path === '/api/contract-models/consulting-ro')
      return route.fulfill({ json: { model: null } });
    if (path === '/api/project-templates')
      return route.fulfill({
        json: {
          templates: [templateFixture],
          headVersion: 1,
          nextBeforeVersion: null,
        },
      });
    if (path === '/api/mission-plans' && method === 'GET')
      return route.fulfill({
        json: {
          items: [
            {
              ...scope,
              planId: plan.planId,
              createdAt: '2026-10-14T09:00:00.000000Z',
              head: plan,
            },
          ],
        },
      });
    if (path === `/api/mission-plans/${plan.planId}/versions/${plan.id}`)
      return route.fulfill({ json: { version: plan } });
    if (
      path === `/api/mission-plans/${plan.planId}/versions` &&
      method === 'GET'
    )
      return route.fulfill({ json: { headVersionNumber: 1, items: [plan] } });
    if (path === `/api/mission-plans/${plan.planId}/versions`) {
      const sent = body(route);
      const content =
        typeof sent === 'object' && sent !== null ? sent : { title: '' };
      return route.fulfill({
        status: 201,
        json: {
          version: {
            ...plan,
            ...content,
            id: '00000000-0000-4000-8000-000000007002',
            versionNumber: 2,
            publishedAt: '2026-11-28T09:00:00.000Z',
          },
        },
      });
    }
    if (path === '/api/certification-procedure-deadlines' && method === 'GET')
      return route.fulfill({
        json: { current: deadlines[0] ?? null, history: deadlines },
      });
    if (path === '/api/certification-procedure-deadlines') {
      const saved = deadlineSet(2, 20);
      deadlines = [saved, ...deadlines];
      return route.fulfill({ json: saved });
    }
    return route.fulfill({ status: 404, json: {} });
  });
  return writes;
}

function approvedOfferModel() {
  return {
    ...offerModel,
    revision: 3,
    head: {
      ...secondOffer,
      decision: {
        id: '00000000-0000-4000-8000-000000006101',
        outcome: 'APPROVE',
        basis: 'Text verificat integral',
        ...attribution,
      },
    },
    activeVersion: {
      id: secondOffer.id,
      versionNumber: 2,
      sourceKind: offerContent.sourceKind,
      serviceTitle: offerContent.serviceTitle,
    },
  };
}

async function screenshot(page: Page, name: string) {
  // Each screen is captured from its top; none scrolls the page sideways.
  await page.evaluate(() => window.scrollTo(0, 0));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath(`${name}.png`),
    fullPage: false,
  });
}

/** The console's list on desktop; on phone the home is the list, reached by the back link. */
async function openSection(page: Page, section: string, hash: string) {
  if (isPhoneLayout(page)) {
    if (!page.url().endsWith('#settings'))
      await page.getByRole('link', { name: 'All settings' }).click();
    await page
      .getByRole('region', { name: 'All settings' })
      .getByRole('link', { name: new RegExp(`^${section}`, 'u') })
      .click();
  } else {
    await page
      .getByRole('navigation', { name: 'Settings sections' })
      .getByRole('link', { name: section, exact: true })
      .click();
  }
  await expect(page).toHaveURL(new RegExp(`${hash}$`, 'u'));
  const region = page.getByRole('region', { name: section, exact: true });
  await expect(region).toBeVisible();
  return region;
}

test('configures sales stages, catalogue, pricing, models, plans and deadlines from the Settings console', async ({
  page,
}) => {
  const writes = await serveConfigurator(page);
  await openClarte(page, '/');
  await openClarteEntry(page, 'Settings');
  await expect(page).toHaveURL(/#settings$/u);
  const home = page.getByRole('region', { name: 'All settings' });
  await expect(
    home.getByRole('link', { name: /^Sales stages/u }),
  ).toBeVisible();
  await expect(
    home.getByRole('link', { name: /^Procedure deadlines/u }),
  ).toBeVisible();

  // Sales stages: add a stage at the end of the list.
  const stages = await openSection(page, 'Sales stages', '#sales-stages');
  await stages.getByRole('button', { name: 'Add a stage' }).click();
  const stageForm = page.getByRole('dialog', { name: 'Sales Stage settings' });
  await stageForm.getByLabel('New stage label').fill('Închidere');
  await stageForm.getByRole('button', { name: 'Add stage' }).click();
  await expect(stageForm).toHaveCount(0);
  await expect(
    stages.getByRole('list', { name: 'Sales Stages' }).getByRole('listitem'),
  ).toHaveCount(6);
  await screenshot(page, 'clarte-settings-config-sales-stages');

  // Service catalogue: define a shared Service.
  const catalogue = await openSection(page, 'Service Catalogue', '#catalogue');
  await catalogue.getByRole('button', { name: 'Define Service' }).click();
  const serviceForm = page.getByRole('dialog', {
    name: 'Shared Service Definitions',
  });
  await serviceForm.getByLabel('Service code').fill('SVC_GAMMA');
  await serviceForm
    .getByLabel('Service name')
    .fill('Serviciu demonstrativ Gamma');
  await serviceForm.getByRole('button', { name: 'Define Service' }).click();
  await expect(serviceForm).toHaveCount(0);
  await expect(
    catalogue.getByRole('table', { name: 'Service Definitions' }),
  ).toContainText('SVC_GAMMA');
  await screenshot(page, 'clarte-settings-config-catalogue');

  // Pricing: publish a Tariff version for an Offering.
  const pricing = await openSection(page, 'Pricing Configuration', '#pricing');
  const tariffs = pricing.getByRole('region', { name: 'Tariff Versions' });
  await tariffs.getByLabel('Company Service Offering').click();
  await page
    .getByRole('option', { name: /Serviciu demonstrativ Alfa/u })
    .click();
  await expect(
    tariffs.getByRole('table', { name: 'Current Tariff Version' }),
  ).toContainText('1,250.0000 MDL');
  await screenshot(page, 'clarte-settings-config-pricing');
  await tariffs
    .getByRole('button', { name: 'Publish a Tariff Version' })
    .click();
  const tariffForm = page.getByRole('dialog', {
    name: 'Publish a Tariff Version',
  });
  await tariffForm.getByLabel('Unit', { exact: true }).fill('unitate-demo');
  await tariffForm.getByLabel('Unit amount').fill('1300');
  await tariffForm.getByLabel('Currency').click();
  await page.getByRole('option', { name: 'MDL' }).click();
  await tariffForm.getByLabel('Tax rate percent').fill('20');
  await tariffForm.getByLabel('Tax label').fill('TVA');
  await tariffForm.getByLabel(/^Effective from/u).fill('2030-01-01T00:00');
  await tariffForm
    .getByRole('button', { name: 'Publish Tariff Version' })
    .click();
  await expect(tariffForm).toHaveCount(0);
  await expect(tariffs.getByText('Tariff Version 2 published.')).toBeVisible();

  // Offer model: propose the next complete version, then approve it.
  const offerModelSection = await openSection(
    page,
    'Consulting Offer model',
    '#offer-models',
  );
  await offerModelSection
    .getByRole('button', { name: 'Copy current version into a new draft' })
    .click();
  const offerForm = page.getByRole('dialog', { name: 'New model version' });
  await offerForm
    .getByRole('button', { name: 'Submit complete version' })
    .click();
  await expect(offerForm).toHaveCount(0);
  await expect(offerModelSection.getByText('Version 2 saved.')).toBeVisible();
  await offerModelSection.getByRole('button', { name: 'Decide' }).click();
  const decision = page.getByRole('dialog', {
    name: 'Awaiting model approval',
  });
  await decision.getByLabel('Decision basis').fill('Text verificat integral');
  await decision
    .getByRole('button', { name: 'Approve this exact version' })
    .click();
  await expect(decision).toHaveCount(0);
  await expect(
    offerModelSection.getByRole('region', {
      name: 'Available approved version: 2',
    }),
  ).toBeVisible();
  await screenshot(page, 'clarte-settings-config-offer-model');

  // Contract model: nothing configured yet in this Company.
  const contractModel = await openSection(
    page,
    'Consulting Contract model',
    '#contract-models',
  );
  await expect(
    contractModel.getByText(
      'No consulting Contract model has been configured.',
    ),
  ).toBeVisible();

  // Mission Plans: publish the next version of a plan.
  const templates = await openSection(
    page,
    'Project templates',
    '#project-templates',
  );
  await expect(
    templates
      .getByRole('region', { name: 'Template Versions' })
      .getByText('Clarifier la demande'),
  ).toBeVisible();
  const plans = templates.getByRole('region', { name: 'Mission plans' });
  await plans
    .getByRole('button', { name: `Open Version: ${plan.title}`, exact: true })
    .click();
  await plans
    .getByRole('button', { name: `Open Version: ${plan.title} · Version 1` })
    .click();
  await screenshot(page, 'clarte-settings-config-project-templates');
  await plans.getByRole('button', { name: 'Successor Version' }).click();
  const planForm = page.getByRole('dialog', { name: 'Successor Version' });
  await planForm.getByLabel('Plan name').fill('Plan demonstrativ revizuit');
  await planForm.getByRole('button', { name: 'Publish plan' }).click();
  await expect(planForm).toHaveCount(0);
  await expect(plans.getByText('Publication confirmed.')).toBeVisible();

  // Procedure deadlines: change one deadline in a new version.
  const deadlineSection = await openSection(
    page,
    'Procedure deadlines',
    '#procedure-deadlines',
  );
  await deadlineSection.getByRole('button', { name: 'Edit' }).click();
  const deadlineForm = page.getByRole('dialog', {
    name: 'Procedure deadline configuration',
  });
  await deadlineForm.getByLabel(/^Audit dossier transmitted/u).fill('20');
  await deadlineForm
    .getByRole('button', { name: 'Save the deadlines' })
    .click();
  await expect(deadlineForm).toHaveCount(0);
  await expect(
    deadlineSection.getByText('Deadline set version 2 saved.'),
  ).toBeVisible();
  await screenshot(page, 'clarte-settings-config-deadlines');

  expect(writes).toEqual([
    'POST /api/sales-stages',
    'POST /api/commercial-catalogue/service-definitions',
    `POST /api/pricing-configuration/offerings/${offering.id}/tariff-versions`,
    'POST /api/offer-models/consulting-ro/versions',
    `POST /api/offer-models/consulting-ro/versions/${secondOffer.id}/decision`,
    `POST /api/mission-plans/${plan.planId}/versions`,
    'POST /api/certification-procedure-deadlines',
  ]);
});
