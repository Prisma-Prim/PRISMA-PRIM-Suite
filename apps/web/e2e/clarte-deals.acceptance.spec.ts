import { expect, test, type Page, type Route } from '@playwright/test';
import { companyGrants } from '../src/access/company-grants.test-fixture';
import type { ClientRequest } from '../src/commercial-intake/CommercialIntakeWorkspace';
import { dealDetailFor, dealSummaryFor } from '../src/test/deal-responses';
import {
  buildClientRequest,
  buildStageHistoryEntry,
} from '../src/test/commercial-intake-responses';
import { actorContextFixture } from './actor-context.fixture';
import { isPhoneLayout, openClarte } from './clarte.fixture';
import { selectOption } from './select-option';

// Every API response is intercepted: fictional Clients, deals and people.
const company = {
  id: '00000000-0000-4000-8000-000000001533',
  displayName: 'PRISMA-PRIM',
};
const tester = {
  workspaceMembershipId: actorContextFixture.workspaceMembershipId,
  displayName: actorContextFixture.displayName,
};
const colleague = {
  workspaceMembershipId: '00000000-0000-4000-8000-000000001534',
  displayName: 'Ion Popa',
};
const actor = {
  ...actorContextFixture,
  activeCompany: {
    ...company,
    grants: companyGrants(
      {
        bundle: 'company_director_client_access',
        version: 'v1',
        assignmentId: '00000000-0000-4000-8000-000000001541',
      },
      {
        bundle: 'company_commercial_intake',
        version: 'v4',
        assignmentId: '00000000-0000-4000-8000-000000001542',
      },
      {
        bundle: 'company_opportunity_manager',
        version: 'v2',
        assignmentId: '00000000-0000-4000-8000-000000001543',
      },
    ),
  },
};

function request(
  key: string,
  client: string,
  title: string,
  owner: typeof tester,
  capturedAt: string,
): ClientRequest {
  return buildClientRequest({
    id: `00000000-0000-4000-8000-0000000016${key}`,
    companyId: company.id,
    subject: `${title} request`,
    originalText: `Fictional request from ${client}.`,
    capturedAt,
    clientAssociationStatus: 'visible',
    clientReference: {
      originalClientId: `00000000-0000-4000-8000-0000000017${key}`,
      currentClientId: `00000000-0000-4000-8000-0000000017${key}`,
      displayName: client,
    },
    initialOpportunity: {
      id: `00000000-0000-4000-8000-0000000018${key}`,
      title,
      nextAction: 'Call the Client',
      responsibleActor: owner,
    },
  });
}

const atOffer = request(
  '01',
  'Valea Verde SRL',
  'Certification ISO 22000',
  tester,
  '2026-11-20T08:00:00.000Z',
);
const atRequest = request(
  '02',
  'Lumen Dairy SRL',
  'HACCP set-up',
  tester,
  '2026-11-26T08:00:00.000Z',
);
const atContract = request(
  '03',
  'Codru Logistic SRL',
  'ISO 9001 surveillance',
  colleague,
  '2026-11-10T08:00:00.000Z',
);
const lost = request(
  '04',
  'Prut Grain SA',
  'ISO 14001 certification',
  colleague,
  '2026-11-01T08:00:00.000Z',
);
const stages = [
  { id: '00000000-0000-4000-8000-000000001901', label: 'Qualification' },
  { id: '00000000-0000-4000-8000-000000001902', label: 'Negotiation' },
];

function serveDeals(page: Page) {
  let detail = atOffer;
  const reads: string[] = [];
  const atOfferStage = {
    thread: { kind: 'in_progress', currentStage: 'offer' },
    lastChangedAt: '2026-11-27T09:00:00.000Z',
  } as const;
  const deal = () =>
    dealDetailFor(detail, {
      ...atOfferStage,
      stages: [
        {
          stage: 'request',
          marker: 'done',
          capturedAt: detail.capturedAt,
          clientAssociationStatus: 'visible',
        },
        {
          stage: 'costing',
          marker: 'done',
          pricingSnapshot: {
            readable: true,
            value: {
              calculatedAt: '2026-11-22T10:00:00.000Z',
              currency: 'MDL',
              total: '46000.00',
            },
          },
          profitabilityEstimate: {
            readable: true,
            value: { versionNumber: 1, decision: 'APPROVE' },
          },
        },
        {
          stage: 'offer',
          marker: 'current',
          offer: {
            versionNumber: 2,
            decisionState: 'APPROVED',
            transmissionState: 'TRANSMITTED',
            clientResponseState: 'PENDING',
            validUntil: '2026-12-20T10:00:00.000Z',
          },
        },
        { stage: 'contract', marker: 'upcoming', agreements: [] },
        { stage: 'delivery', marker: 'upcoming', projects: [] },
        { stage: 'closure', marker: 'not_available' },
        { stage: 'collection', marker: 'not_applicable', link: 'not_linked' },
      ],
    });
  const rows = () => [
    dealSummaryFor(atRequest, {
      lastChangedAt: '2026-11-26T08:00:00.000Z',
    }),
    dealSummaryFor(detail, atOfferStage),
    dealSummaryFor(atContract, {
      thread: { kind: 'in_progress', currentStage: 'contract' },
      followUpOn: { readable: true, value: '2026-12-02' },
      lastChangedAt: '2026-11-25T08:00:00.000Z',
    }),
    dealSummaryFor(lost, {
      status: 'LOST',
      thread: { kind: 'closed', status: 'LOST' },
      lastChangedAt: '2026-11-15T08:00:00.000Z',
    }),
  ];
  return page
    .route('**/api/**', async (route: Route) => {
      const call = route.request();
      const url = new URL(call.url());
      const path = url.pathname;
      reads.push(`${call.method()} ${path}${url.search}`);
      if (path === '/api/access/current-actor')
        return route.fulfill({ json: actor });
      if (path === '/api/companies')
        return route.fulfill({ json: [{ ...company, status: 'active' }] });
      if (path === '/api/activity-log')
        return route.fulfill({ json: { events: [] } });
      if (path === '/api/operational-home')
        return route.fulfill({
          json: {
            companyId: company.id,
            today: '2026-11-28',
            summaries: [{ kind: 'active_clients', count: 4 }],
          },
        });
      if (path === '/api/clients') return route.fulfill({ json: [] });
      if (path === '/api/client-duplicate-reviews')
        return route.fulfill({ json: { items: [], next_cursor: null } });
      if (path === '/api/deals') {
        const mine = url.searchParams.get('view') === 'mine_open';
        return route.fulfill({
          json: {
            items: rows().filter(
              (row) =>
                !mine ||
                (row.owner.workspaceMembershipId ===
                  tester.workspaceMembershipId &&
                  (row.status === 'OPEN' || row.status === 'ON_HOLD')),
            ),
          },
        });
      }
      if (path === `/api/deals/${detail.initialOpportunity.id}`)
        return route.fulfill({ json: deal() });
      if (path === `/api/commercial-intake/requests/${detail.id}`)
        return route.fulfill({ json: detail });
      if (path === '/api/sales-stages')
        return route.fulfill({
          json: {
            revision: 1,
            stages: stages.map((stage, index) => ({
              ...stage,
              position: index + 1,
              state: 'ACTIVE',
            })),
          },
        });
      const command = `/api/commercial-intake/opportunities/${detail.initialOpportunity.id}`;
      if (path === `${command}/next-action` && call.method() === 'POST') {
        const body: unknown = call.postDataJSON();
        const nextAction =
          typeof body === 'object' && body !== null && 'nextAction' in body
            ? String(body.nextAction)
            : '';
        const version = detail.initialOpportunity.version + 1;
        detail = {
          ...detail,
          initialOpportunity: {
            ...detail.initialOpportunity,
            nextAction,
            version,
          },
        };
        return route.fulfill({
          json: {
            receipt: {
              opportunityId: detail.initialOpportunity.id,
              nextAction,
              version,
              outcome: 'updated',
            },
            request: detail,
          },
        });
      }
      if (path === `${command}/stage` && call.method() === 'POST') {
        const body: unknown = call.postDataJSON();
        const chosen = stages.find(
          (stage) =>
            typeof body === 'object' &&
            body !== null &&
            'salesStageId' in body &&
            body.salesStageId === stage.id,
        );
        if (!chosen) return route.fulfill({ status: 400, json: {} });
        const version = detail.initialOpportunity.version + 1;
        detail = {
          ...detail,
          initialOpportunity: {
            ...detail.initialOpportunity,
            version,
            salesStage: { ...chosen, state: 'ACTIVE' },
            stageHistory: {
              entries: [
                buildStageHistoryEntry({
                  newStage: { salesStageId: chosen.id, label: chosen.label },
                  version,
                  actor: {
                    workspaceMembershipId: tester.workspaceMembershipId,
                    displayLabel: tester.displayName,
                  },
                  changedAt: '2026-11-28T09:30:00.000Z',
                }),
              ],
            },
          },
        };
        return route.fulfill({
          json: {
            receipt: {
              opportunityId: detail.initialOpportunity.id,
              salesStageId: chosen.id,
              version,
              outcome: 'updated',
            },
            request: detail,
          },
        });
      }
      return route.fulfill({ status: 404, json: {} });
    })
    .then(() => reads);
}

async function screenshot(page: Page, name: string) {
  await page.screenshot({
    path: test.info().outputPath(`${name}.png`),
    fullPage: false,
  });
}

test('lists, sorts and groups deals, then follows one deal through its Request stage commands', async ({
  page,
}) => {
  const reads = await serveDeals(page);
  await openClarte(page, '/#requests');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Deals');
  const dealLinks = page.locator('.clarte-row-link');
  await expect(dealLinks).toHaveText([
    'HACCP set-up',
    'Certification ISO 22000',
    'ISO 9001 surveillance',
    'ISO 14001 certification',
  ]);
  await expect(page.getByText('Not available to you').first()).toBeVisible();

  // Sort by stage, then by stage descending.
  await page.getByRole('button', { name: 'Stage', exact: true }).click();
  await expect(dealLinks).toHaveText([
    'HACCP set-up',
    'Certification ISO 22000',
    'ISO 9001 surveillance',
    'ISO 14001 certification',
  ]);
  await page.getByRole('button', { name: 'Stage', exact: true }).click();
  await expect(dealLinks.first()).toHaveText('ISO 14001 certification');
  await screenshot(page, 'clarte-deals-list');

  // Filter the loaded rows by owner, then My open dossiers.
  await page
    .getByRole('searchbox', { name: 'Filter loaded deals' })
    .fill('Popa');
  await expect(dealLinks).toHaveText([
    'ISO 14001 certification',
    'ISO 9001 surveillance',
  ]);
  await page.getByRole('searchbox', { name: 'Filter loaded deals' }).fill('');
  await page.getByRole('button', { name: 'My open dossiers' }).click();
  await expect(dealLinks).toHaveCount(2);
  expect(reads).toContain('GET /api/deals?limit=25&view=mine_open');

  // The board groups the loaded rows by current stage.
  await page.getByRole('button', { name: 'All deals' }).click();
  await expect(dealLinks).toHaveCount(4);
  await page.getByRole('button', { name: 'Board' }).click();
  await expect(
    page.getByText(
      'The board groups only the deals loaded so far by their current stage.',
    ),
  ).toBeVisible();
  const offerColumn = page.getByRole('region', { name: /^Offer/u });
  await expect(offerColumn).toContainText('Valea Verde SRL');
  await expect(page.getByRole('region', { name: /^Closed/u })).toContainText(
    'Prut Grain SA',
  );
  await screenshot(page, 'clarte-deals-board');

  // Open the deal at the Offer stage.
  await offerColumn.getByRole('button').click();
  await expect(
    page.getByRole('heading', { level: 2, name: 'Certification ISO 22000' }),
  ).toBeFocused();
  const thread = page.getByRole('list', { name: 'Deal stages' });
  await expect(thread.getByRole('button')).toHaveText([
    /Request.*Done/u,
    /Costing.*Done/u,
    /Offer.*Current stage/u,
    /Contract.*Upcoming/u,
    /Delivery.*Upcoming/u,
    /Closure.*Not available to you/u,
    /Collection.*Not applicable/u,
  ]);
  const nextStep = page.getByRole('region', { name: 'Next step' });
  await expect(nextStep).toContainText('Current stage: Offer');
  await expect(nextStep).toContainText('Call the Client');
  await expect(
    page.getByRole('region', { name: 'Offer', exact: true }),
  ).toContainText('Awaiting the Client’s response');
  if (isPhoneLayout(page)) {
    // On phone the Next step card comes before the stage panel and the
    // thread scrolls sideways inside its own box.
    const card = await nextStep.boundingBox();
    const panel = await page.locator('.clarte-stage-panel').boundingBox();
    expect(card && panel && card.y < panel.y).toBe(true);
    expect(
      await thread.evaluate((list) => list.scrollWidth > list.clientWidth),
    ).toBe(true);
  }
  await screenshot(page, 'clarte-deal-page');

  // Change the next action from the Next step card.
  await nextStep
    .getByRole('button', { name: 'Change the next action' })
    .click();
  const field = page.getByLabel('Next action', { exact: true });
  await expect(field).toHaveValue('Call the Client');
  await field.fill('Send the signed questionnaire');
  await page.getByRole('button', { name: 'Save next action' }).click();
  await expect(nextStep).toContainText('Send the signed questionnaire');

  // Set the Sales Stage in the Request stage and see the header follow.
  await page.getByRole('button', { name: 'Change Sales Stage' }).click();
  await selectOption(page.getByLabel('New Sales Stage'), {
    label: 'Negotiation',
  });
  await page.getByRole('button', { name: 'Save Sales Stage' }).click();
  await expect(page.locator('.clarte-deal-kicker')).toContainText(
    'Sales Stage: Negotiation',
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await screenshot(page, 'clarte-deal-request-stage');

  // Each confirmed command reread the deal without a page reload.
  expect(
    reads.filter((read) =>
      read.startsWith(`GET /api/deals/${atOffer.initialOpportunity.id}`),
    ),
  ).toHaveLength(3);

  // Back to the list: the row shows the new next action.
  await page.getByRole('button', { name: 'Back to deals' }).click();
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await expect(
    page.getByRole('row', { name: /Certification ISO 22000/u }),
  ).toContainText('Send the signed questionnaire');
});
