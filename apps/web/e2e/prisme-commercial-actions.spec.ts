import { expect, test, type Page } from '@playwright/test';
import { actorContextFixture } from './actor-context.fixture';

const company = {
  id: '00000000-0000-4000-8000-000000000359',
  displayName: 'PRISMA-PRIM',
};
const requestId = '00000000-0000-4000-8000-000000000360';
const opportunityId = '00000000-0000-4000-8000-000000000361';
const longNextAction =
  'Confirm the evidence, participants and expected outcome '.repeat(9).trim();

test('keeps commercial Request actions clear and operable in Prisme', async ({
  page,
}, testInfo) => {
  let releaseCapture: () => void = () => undefined;
  let captureStarted = false;
  const captureGate = new Promise<void>((resolve) => {
    releaseCapture = resolve;
  });
  let currentRequest = requestDetail(longNextAction, 1);

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/access/current-actor')
      return route.fulfill({
        json: {
          ...actorContextFixture,
          workspacePermissions: [],
          activeCompany: {
            ...company,
            clientPermissions: ['client.read'],
            commercialIntakePermissions: [
              'commercial.request.read',
              'commercial.request.create',
              'commercial.opportunity.read',
              'commercial.opportunity.create',
              'commercial.opportunity.next_action.update',
            ],
          },
        },
      });
    if (path === '/api/companies') return route.fulfill({ json: [company] });
    if (path === '/api/activity-log')
      return route.fulfill({ json: { events: [] } });
    if (path === '/api/clients')
      return route.fulfill({ json: { clients: [], nextCursor: null } });
    if (path === '/api/commercial-intake/requests') {
      if (request.method() === 'POST') {
        captureStarted = true;
        await captureGate;
        return route.fulfill({ status: 201, json: currentRequest });
      }
      return route.fulfill({
        json: {
          items: [requestListItem(currentRequest)],
          nextCursor: 'older-requests',
        },
      });
    }
    if (path === `/api/commercial-intake/requests/${requestId}`)
      return route.fulfill({ json: currentRequest });
    if (
      path ===
        `/api/commercial-intake/opportunities/${opportunityId}/next-action` &&
      request.method() === 'POST'
    ) {
      currentRequest = requestDetail('Confirm the final review meeting', 2);
      return route.fulfill({
        json: {
          receipt: {
            opportunityId,
            nextAction: 'Confirm the final review meeting',
            version: 2,
            outcome: 'updated',
          },
          request: currentRequest,
        },
      });
    }
    return route.fulfill({ status: 404 });
  });

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?frame=prisme#requests');

  const intake = page.locator('.commercial-intake-workspace');
  const capture = intake.getByRole('button', { name: 'Capture Request' });
  const search = intake.getByRole('button', { name: 'Search Clients' });
  const requestRow = intake
    .getByRole('list', { name: 'Client Requests' })
    .getByRole('button');
  const showOlder = intake.getByRole('button', { name: 'Show older Requests' });

  await expect(capture).toHaveCSS('background-color', 'rgb(100, 81, 232)');
  await expect(capture).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(search).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(search).toHaveCSS('border-color', 'rgb(216, 211, 235)');
  await expect(showOlder).toHaveCSS('border-color', 'rgb(216, 211, 235)');
  await expect(requestRow).not.toHaveCSS(
    'background-color',
    'rgb(100, 81, 232)',
  );

  await search.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(
    intake.getByLabel('Search Clients by name', { exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(search).toBeFocused();
  await expect(search).toHaveCSS('outline-color', 'rgb(121, 98, 237)');
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath(
      `prisme-commercial-actions-form-${testInfo.project.name}.png`,
    ),
    fullPage: true,
  });

  await capture.click();
  await expect(
    intake.getByRole('alert').and(
      intake.getByText('Enter the required request and Opportunity fields.', {
        exact: true,
      }),
    ),
  ).toHaveText('Enter the required request and Opportunity fields.');
  await intake
    .getByLabel('Original request text')
    .fill('An existing commercial Request needs a qualification review.');
  await intake
    .getByLabel('Subject')
    .fill('Commercial Request action hierarchy');
  await intake
    .getByLabel('Opportunity title')
    .fill('Qualify the commercial Request');
  await intake.getByLabel('Next action').fill(longNextAction);
  await capture.click();
  await expect.poll(() => captureStarted).toBe(true);
  await expect(capture).toBeDisabled();
  await expect(capture).toHaveCSS('cursor', 'not-allowed');
  releaseCapture();

  await expect(
    intake.getByRole('heading', {
      name: 'Commercial Request action hierarchy',
    }),
  ).toBeVisible();
  const back = intake.getByRole('button', { name: 'Back to Requests' });
  const edit = intake.getByRole('button', { name: 'Edit next action' });
  await expect(back).toHaveCSS('border-color', 'rgb(216, 211, 235)');
  await expect(edit).toHaveCSS('border-color', 'rgb(216, 211, 235)');
  await edit.click();

  const save = intake.getByRole('button', { name: 'Save next action' });
  const cancel = intake
    .locator('form.commercial-intake-next-action')
    .getByRole('button', { name: 'Cancel', exact: true });
  await expect(save).toHaveCSS('background-color', 'rgb(100, 81, 232)');
  await expect(cancel).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await intake.getByLabel('Next action').fill('Discarded draft');
  await cancel.click();
  await expect(intake.getByLabel('Next action')).toHaveCount(0);
  await expect(
    intake.getByText(`Next action: ${longNextAction}`),
  ).toBeVisible();

  await edit.click();
  await intake
    .getByLabel('Next action')
    .fill('Confirm the final review meeting');
  await save.click();
  await expect(
    intake
      .getByRole('alert')
      .and(intake.getByText('Next action saved.', { exact: true })),
  ).toHaveText('Next action saved.');
  await expect(
    intake.getByText('Next action: Confirm the final review meeting'),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath(
      `prisme-commercial-actions-${testInfo.project.name}.png`,
    ),
    fullPage: true,
  });
});

function requestDetail(nextAction: string, version: number) {
  return {
    id: requestId,
    companyId: company.id,
    sourceKind: 'MANUAL_TEXT',
    sourceLabel: 'Manual commercial intake',
    reportedReceivedAt: null,
    subject: 'Commercial Request action hierarchy',
    originalText:
      'An existing commercial Request needs a qualification review.',
    capturedByWorkspaceMembershipId: actorContextFixture.workspaceMembershipId,
    capturedAt: '2026-09-26T08:00:00.000Z',
    version: 1,
    clientAssociationStatus: 'absent',
    initialOpportunity: {
      id: opportunityId,
      title: 'Qualify the commercial Request',
      scope: null,
      nextAction,
      status: 'OPEN',
      statusEnteredAt: '2026-09-26T08:00:00.000Z',
      outcomeHistory: { entries: [] },
      responsibleWorkspaceMembershipId:
        actorContextFixture.workspaceMembershipId,
      responsibleActor: {
        workspaceMembershipId: actorContextFixture.workspaceMembershipId,
        displayName: actorContextFixture.displayName,
      },
      createdAt: '2026-09-26T08:00:00.000Z',
      version,
    },
  };
}

function requestListItem(request: ReturnType<typeof requestDetail>) {
  return {
    id: request.id,
    subject: request.subject,
    capturedAt: request.capturedAt,
    initialOpportunity: {
      status: 'OPEN',
      title: request.initialOpportunity.title,
      nextAction: request.initialOpportunity.nextAction,
      responsibleActor: request.initialOpportunity.responsibleActor,
    },
  };
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  expect(
    dimensions.documentWidth,
    JSON.stringify(dimensions),
  ).toBeLessThanOrEqual(dimensions.viewportWidth);
}
