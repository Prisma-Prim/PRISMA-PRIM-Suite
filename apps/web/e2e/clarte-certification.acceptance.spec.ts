import { readFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';
import type { ActorContext } from '../src/access-types';
import {
  FakeCertificationServer,
  certificationActor,
  certificationIds,
} from '../src/certification/certification-fake-server';
import {
  preparatoryLifecycle,
  unassignedResponsibility,
} from './actor-context.fixture';
import { isPhoneLayout, openClarte } from './clarte.fixture';
import { selectOption } from './select-option';

// Fictional data only: a fictional dairy and two fictional members.
const project = {
  id: certificationIds.project,
  companyId: certificationIds.company,
  clientAccountId: certificationIds.client,
  clientDisplayName: 'Lactis Demo',
  title: 'Fictional dairy ISO 22000 certification',
  status: 'preparatory',
  createdAt: '2026-11-02T08:00:00.000Z',
};
const ionId = '15380000-0000-4000-8000-000000000021';
const ion = 'Ion Fictional Auditor';
const reference = 'CERT-2026/11';

/** Ada plans and decides; Ion leads the audit team and reports. */
function members() {
  const ada = certificationActor({ manager: true, approver: true });
  const auditor = certificationActor({ manager: false, auditor: true });
  const ionActor: ActorContext = {
    ...auditor,
    internalUserId: 'fictional-ion',
    workspaceMembershipId: ionId,
    displayName: ion,
    email: 'ion@example.test',
  };
  return { ada, ion: ionActor };
}

/**
 * Every API request is answered: Certification by the shared fictional
 * Certification server, the Project shell by fixed fictional reads.
 */
async function serve(page: Page) {
  const actors = members();
  let current: ActorContext = actors.ada;
  const server = new FakeCertificationServer({
    actor: () => current,
    // Each act is recorded and checked as the member signed in.
    member: () => ({
      workspaceMembershipId: current.workspaceMembershipId,
      displayName: current.displayName,
    }),
  });
  server.teamCandidates.push({
    workspaceMembershipId: ionId,
    displayLabel: ion,
  });
  server.seed({ orderReference: 'CERT-2026/07', accepted: true });
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const json = (value: unknown) => route.fulfill({ json: value });
    if (
      path.includes('certification') ||
      path === '/api/access/current-actor'
    ) {
      const body = request.postData();
      const reply = await server.fetch(url.href, {
        method: request.method(),
        headers: request.headers(),
        ...(body === null ? {} : { body }),
      });
      return route.fulfill({
        status: reply.status,
        headers: {
          'content-type':
            reply.headers.get('content-type') ?? 'application/json',
        },
        body: Buffer.from(await reply.arrayBuffer()),
      });
    }
    if (path === '/api/companies')
      return json([
        {
          id: certificationIds.company,
          displayName: 'Synthetic Certification Body',
        },
      ]);
    if (path === '/api/activity-log') return json({ events: [] });
    if (path === '/api/operational-home')
      return json({
        companyId: certificationIds.company,
        today: '2026-11-28',
        summaries: [],
      });
    if (path === '/api/clients')
      return json([
        {
          id: certificationIds.client,
          displayName: project.clientDisplayName,
          relatedToActiveCompany: true,
        },
      ]);
    if (path === '/api/client-duplicate-reviews')
      return json({ items: [], next_cursor: null });
    if (path === '/api/assigned-tasks') return json([]);
    if (path === '/api/projects') return json([project]);
    if (path === `/api/projects/${project.id}`) return json(project);
    if (path.endsWith('/lifecycle')) return json(preparatoryLifecycle);
    if (path.endsWith('/responsible')) return json(unassignedResponsibility);
    if (path.endsWith('/tasks')) return json({ mutable: true, tasks: [] });
    if (path.endsWith('/eligible-task-assignees')) return json({ members: [] });
    return route.fulfill({ status: 404, json: {} });
  });
  return {
    server,
    becomeIon: () => {
      current = actors.ion;
    },
  };
}

/** Captures the viewport with the Certification screen at its top. */
async function screenshot(page: Page, name: string, top: Locator) {
  const width = isPhoneLayout(page) ? '390' : '1440';
  await top.evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await page.screenshot({
    path: test.info().outputPath(`${name}-${width}.png`),
    fullPage: false,
  });
}

async function noHorizontalScroll(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

/** The open Case's page, named by its heading. */
function casePage(panel: Locator) {
  return panel.getByRole('article', { name: /^Certification Case /u });
}

/** Missions and audits › the Project › Certification. */
async function openCertification(page: Page) {
  await openClarte(page, '/#projects');
  const projects = page.getByRole('region', { name: 'Projects' });
  await projects
    .getByRole('button', { name: new RegExp(project.title, 'u') })
    .click();
  await page.getByRole('tab', { name: 'Certification', exact: true }).click();
  return page.getByRole('tabpanel', { name: 'Certification' });
}

function step(panel: Locator, name: string) {
  return panel
    .getByRole('navigation', { name: 'Steps of the Certification Case' })
    .getByRole('list', { name: 'Steps' })
    .getByRole('button')
    .filter({
      has: panel.page().locator('b', { hasText: new RegExp(`^${name}$`, 'u') }),
    });
}

async function expectStatus(panel: Locator, name: string, status: string) {
  await expect(step(panel, name)).toContainText(status);
}

test('opens a Case, records and reviews the application, confirms the duration, records the contract, approves the team and records the Stage 1 plan and report', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const api = await serve(page);
  const panel = await openCertification(page);

  // The Project's Cases, then a new Case opened from its side panel.
  const cases = panel.getByRole('region', {
    name: 'Certification Cases of this Project',
  });
  await expect(
    cases.getByRole('button', { name: 'CERT-2026/07' }),
  ).toBeVisible();
  await noHorizontalScroll(page);
  await screenshot(page, 'clarte-certification-cases', cases);
  await cases
    .getByRole('button', { name: 'Open a Certification Case' })
    .click();
  const opening = page.getByRole('dialog', {
    name: 'Open a Certification Case',
  });
  await selectOption(opening.getByLabel('Client legal entity'), {
    value: certificationIds.entity,
  });
  await opening.getByLabel('Order reference').fill(reference);
  await opening
    .getByRole('button', { name: 'Open Certification Case' })
    .click();
  await expect(
    panel.getByRole('heading', { name: `Certification Case ${reference}` }),
  ).toBeVisible();
  await expect(
    panel.getByText(
      `Lactis Demo SRL · ISO 22000:2018 · Initial certification · Project: ${project.title}`,
    ),
  ).toBeVisible();
  await expectStatus(panel, 'Application', 'Current step');

  // The client sent the signed originals; a colleague attached them.
  const caseId = [...api.server.cases.keys()].at(-1);
  if (!caseId) throw new Error('Missing opened Case');
  for (const [title, role] of [
    ['Signed certification agreement', 'agreement'],
    ['Stage 1 plan', 'plan'],
    ['Stage 1 report', 'report'],
  ] as const)
    api.server.attachAsColleague(caseId, api.server.addSource(title), role);
  await panel.getByRole('button', { name: 'Reload Case' }).click();

  // The client's application.
  const application = panel.getByRole('form', {
    name: 'Record the application',
  });
  await application
    .getByLabel('Declared legal name', { exact: true })
    .fill('Lactis Demo SRL');
  await application
    .getByLabel('Declared address', { exact: true })
    .fill('Str. Exemplu 1, Demo City');
  await application
    .getByLabel('Site address', { exact: true })
    .fill('Str. Exemplu 1, Demo City');
  await application
    .getByLabel('Activity on the site', { exact: true })
    .fill('Dairy plant');
  await application
    .getByLabel('Requested scope', { exact: true })
    .fill('Production of pasteurised milk and yoghurt');
  await application.getByRole('checkbox', { name: 'CI', exact: true }).check();
  await application.getByLabel('HACCP studies', { exact: true }).fill('2');
  await application.getByLabel('Total headcount', { exact: true }).fill('40');
  await application
    .getByLabel('Effective full-time equivalents', { exact: true })
    .fill('37.5');
  await application.getByLabel('Shifts', { exact: true }).fill('2');
  await application
    .getByLabel('Outsourced processes', { exact: true })
    .fill('Laboratory testing');
  await application
    .getByRole('group', { name: 'Did the client use a consultant?' })
    .getByRole('radio', { name: 'No' })
    .check();
  await application.getByLabel('Audit language 1', { exact: true }).fill('ro');
  await application
    .getByLabel('Preferred audit period', { exact: true })
    .fill('Second quarter');
  await application
    .getByRole('button', { name: 'Record the application' })
    .click();
  await expect(
    panel.getByRole('button', { name: 'Correct the application' }),
  ).toBeVisible();
  await expectStatus(panel, 'Application', 'Done');
  await noHorizontalScroll(page);
  await screenshot(page, 'clarte-certification-application', casePage(panel));

  // The review against its four criteria.
  await step(panel, 'Application review').click();
  const review = panel.getByRole('form', { name: 'Record the review' });
  for (const criterion of [
    'The requested scope and food chain category can be certified',
    'A competent audit team is available',
    'A competent certification decision maker is available',
    'Impartiality and other risks are acceptable',
  ]) {
    const group = review.getByRole('group', { name: criterion });
    await group.getByRole('radio', { name: 'Yes' }).check();
    await group
      .getByLabel('Note')
      .fill('Confirmed with the signed questionnaire.');
  }
  await review.getByRole('radio', { name: 'Accept the application' }).check();
  await review.getByRole('button', { name: 'Record the review' }).click();
  await expectStatus(panel, 'Application review', 'Done');

  // The audit duration: computed proposal, confirmed unchanged.
  await step(panel, 'Audit duration').click();
  const inputs = panel.getByRole('form', { name: 'Duration inputs' });
  await selectOption(inputs.getByLabel('Primary subcategory'), { value: 'CI' });
  await inputs.getByRole('button', { name: 'Compute the proposal' }).click();
  const confirm = panel.getByRole('form', {
    name: 'Confirm the audit duration',
  });
  await confirm
    .getByRole('button', { name: 'Confirm the audit duration' })
    .click();
  await expect(
    panel.getByRole('button', { name: 'Correct the audit duration' }),
  ).toBeVisible();
  await noHorizontalScroll(page);
  await screenshot(page, 'clarte-certification-duration', casePage(panel));

  // The certification contract on its signed original.
  await step(panel, 'Certification agreement').click();
  const agreement = panel.getByRole('form', { name: 'Record the agreement' });
  await agreement.getByLabel('Signed on').fill('2026-11-02');
  await selectOption(agreement.getByLabel('Signed original'), {
    label:
      'Signed certification agreement — version 1 (signed-certification-agreement.pdf)',
  });
  await agreement.getByRole('button', { name: 'Record the agreement' }).click();
  await expect(
    panel.getByRole('button', { name: 'Correct the agreement' }),
  ).toBeVisible();

  // The audit team: an eligible internal auditor found, proposed, approved.
  await step(panel, 'Audit team').click();
  await panel.getByLabel('Auditor name').fill('Ion');
  await panel.getByRole('button', { name: 'Find auditors' }).click();
  const team = panel.getByRole('form', { name: 'Propose the team' });
  const leader = team.getByRole('group', { name: 'Member 1' });
  await leader.getByLabel('Name', { exact: true }).fill(ion);
  await selectOption(leader.getByLabel('Role in the team'), {
    label: 'Team leader',
  });
  await selectOption(leader.getByLabel('Workspace member'), { label: ion });
  await leader
    .getByRole('checkbox', { name: 'Holds the client’s food chain category' })
    .check();
  await leader
    .getByLabel('Competence')
    .fill('Qualified ISO 22000 lead auditor, category C.');
  for (const declaration of [
    'Provided no consultancy to the client',
    'Was not employed by the client',
    'Has no involvement in the client’s management',
    'Committed to confidentiality',
  ])
    await leader
      .getByRole('group', { name: declaration })
      .getByRole('radio', { name: 'Confirmed' })
      .check();
  await team.getByRole('button', { name: 'Propose the team' }).click();
  const decision = panel
    .getByRole('region', { name: 'Team decision' })
    .getByRole('form', { name: 'Record the decision' });
  await decision.getByRole('radio', { name: 'Approve the team' }).check();
  await decision
    .getByRole('checkbox', {
      name: 'I attest that the person deciding on this team is not a member of the audit team.',
    })
    .check();
  await decision.getByRole('button', { name: 'Record the decision' }).click();
  await expectStatus(panel, 'Audit team', 'Done');
  await noHorizontalScroll(page);
  await screenshot(page, 'clarte-certification-team', casePage(panel));

  // The Stage 1 plan, by the programme manager.
  await step(panel, 'Stage 1 audit').click();
  const plan = panel
    .getByRole('region', { name: 'Audit plan' })
    .getByRole('form', { name: 'Record the Stage 1 plan' });
  await plan.getByLabel('Start date').fill('2026-11-10');
  await plan.getByLabel('End date').fill('2026-11-10');
  await plan.getByLabel('On-site auditor-days').fill('1');
  await plan.getByLabel('Remote auditor-days').fill('0');
  await plan
    .getByLabel('Objectives')
    .fill('Evaluate readiness of the food safety management system');
  await plan
    .getByLabel('Audit scope')
    .fill('Production of pasteurised milk and yoghurt');
  await selectOption(plan.getByLabel('Audit plan PDF'), {
    label: 'Stage 1 plan — version 1 (stage-1-plan.pdf)',
  });
  await plan.getByRole('button', { name: 'Record the Stage 1 plan' }).click();
  await expect(
    panel.getByRole('button', { name: 'Correct the Stage 1 plan' }),
  ).toBeVisible();

  // The Stage 1 report, by the approved team's leader.
  api.becomeIon();
  const leaderPanel = await openCertification(page);
  await leaderPanel.getByRole('button', { name: reference }).click();
  await expectStatus(leaderPanel, 'Stage 1 audit', 'Current step');
  const report = leaderPanel
    .getByRole('region', { name: 'Audit report' })
    .getByRole('form', { name: 'Record the Stage 1 report' });
  await report.getByLabel('Report date').fill('2026-11-10');
  await report
    .getByRole('group', { name: 'Readiness for Stage 2' })
    .getByRole('radio', { name: 'Ready for Stage 2', exact: true })
    .check();
  await report
    .getByLabel('Basis of the conclusion')
    .fill('Documented system implemented.');
  await selectOption(report.getByLabel('Audit report PDF'), {
    label: 'Stage 1 report — version 1 (stage-1-report.pdf)',
  });
  await report
    .getByRole('checkbox', { name: 'The document review is completed' })
    .check();
  await report
    .getByRole('button', { name: 'Record the Stage 1 report' })
    .click();
  await expectStatus(leaderPanel, 'Stage 1 audit', 'Done');
  await expectStatus(leaderPanel, 'Stage 2 audit', 'Current step');
  await step(leaderPanel, 'Stage 1 audit').click();
  await expect(
    leaderPanel.getByRole('button', { name: 'Correct the Stage 1 report' }),
  ).toBeVisible();
  await noHorizontalScroll(page);
  await screenshot(page, 'clarte-certification-stage-1', casePage(leaderPanel));

  // The dossier register, generated in the interface language.
  const pending = page.waitForEvent('download');
  await leaderPanel
    .getByRole('button', { name: 'Download the dossier register (PDF)' })
    .click();
  const saved = await (await pending).path();
  if (!saved) throw new Error('Missing register download');
  expect((await readFile(saved)).subarray(0, 5).toString()).toBe('%PDF-');

  expect(
    api.server
      .mutations()
      .map((request) => request.path.replace(caseId, '<case>')),
  ).toEqual([
    `/api/projects/${project.id}/certification-cases`,
    '/api/certification-cases/<case>/application',
    '/api/certification-cases/<case>/application-review',
    '/api/certification-cases/<case>/duration',
    '/api/certification-cases/<case>/agreement',
    '/api/certification-cases/<case>/team',
    '/api/certification-cases/<case>/team-decision',
    '/api/certification-cases/<case>/stages/stage-1/plan',
    '/api/certification-cases/<case>/stages/stage-1/report',
  ]);
  expect(
    api.server.requests.find((request) => request.path.endsWith('/register'))
      ?.search,
  ).toBe('?language=en');
});
