import { randomUUID } from 'node:crypto';
import { expect, test, type Locator } from '@playwright/test';
import { openSelect, selectOption } from './select-option';
import {
  prepareCertificationJourney,
  certificationMembers,
  record,
  records,
  text,
  type Identity,
} from './certification-journey.acceptance.fixture';
import {
  certificationMessages,
  type CertificationMessageKey,
} from '../src/certification/certification.copy';
import { formatMessage, resolveMessage } from '../src/localization/messages';

test('links a previously uninvolved internal auditor through the first team and independent approval, then records that auditor’s Stage work', async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  const narrow = info.project.name.endsWith('narrow');
  const locale = narrow ? 'ru' : 'ro';
  const copy = (key: CertificationMessageKey) =>
    resolveMessage(certificationMessages, locale, key);
  await page.addInitScript(
    (value) => localStorage.setItem('prisma-prim.interface-locale', value),
    locale,
  );
  const journey = await prepareCertificationJourney(
    page.request,
    `1439-${randomUUID().slice(0, 8)}`,
    { stopAfter: 'agreement' },
  );
  const { manager, auditor, approver } = certificationMembers;
  const initial = await journey.read(manager, journey.base);
  expect(initial.team).toBeNull();
  // Only prerequisites are seeded. Proposal, independent approval, plan and
  // report below use actual controls; the auditor has no earlier Case act.
  const planId = await journey.attach(
    'plan',
    'Fictional first-team Stage 1 plan',
  );
  const reportId = await journey.attach(
    'report',
    'Fictional first-team Stage 1 report',
  );
  const history = await journey.read(manager, `${journey.base}/timeline`);
  expect(JSON.stringify(history)).not.toContain(journey.auditorMembership);
  let member: Identity = manager;
  await page.route('**/api/**', (route) =>
    route.fallback({ headers: { ...route.request().headers(), ...member } }),
  );

  async function openCase(next: Identity) {
    member = next;
    await page.goto('/');
    if (narrow) await page.locator('.production-menu-button').click();
    await selectOption(
      page.locator('.prisme-company-selector').getByRole('combobox'),
      { value: journey.companyId },
    );
    if (narrow) {
      await page.locator('.production-menu-button').click();
      await page.locator('.production-menu-button').click();
    }
    await page.locator('nav a[href="#projects"]').click();
    const projects = page.locator('.project-workspace');
    await projects.getByRole('searchbox').fill(journey.projectTitle);
    await projects
      .locator('.project-list')
      .getByRole('button')
      .filter({ hasText: journey.projectTitle })
      .click();
    await projects
      .getByRole('tab', { name: copy('title'), exact: true })
      .click();
    await page
      .getByRole('button', { name: journey.orderReference, exact: true })
      .click();
    return page.getByRole('article', {
      name: formatMessage(copy('caseHeading'), {
        reference: journey.orderReference,
      }),
      exact: true,
    });
  }
  async function save(
    form: Locator,
    key: CertificationMessageKey,
    path: string,
  ) {
    const response = page.waitForResponse(
      (reply) =>
        reply.request().method() === 'POST' &&
        new URL(reply.url()).pathname === `/api${journey.base}${path}`,
    );
    await form.getByRole('button', { name: copy(key), exact: true }).click();
    const saved = await response;
    expect(saved.status(), await saved.text()).toBe(201);
    return record(await saved.json());
  }
  async function capture(name: string, target: Locator) {
    await target.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`${name}-${locale}.png`) });
  }

  let article = await openCase(manager);
  const team = article.getByRole('form', {
    name: copy('proposeTeam'),
    exact: true,
  });
  await team
    .getByLabel(copy('teamMemberName'), { exact: true })
    .fill('Ion Popa');
  await selectOption(team.getByLabel(copy('teamMemberRole'), { exact: true }), {
    value: 'team_leader',
  });
  const selector = team.getByLabel(copy('teamMemberLink'), { exact: true });
  const candidates = await openSelect(selector);
  await candidates
    .locator(`[role="option"][data-value="${journey.auditorMembership}"]`)
    .click();
  await team
    .getByRole('checkbox', { name: copy('holdsCategory'), exact: true })
    .check();
  await team
    .getByLabel(copy('competenceNote'), { exact: true })
    .fill('Auditor fictiv ISO 22000, categoria C / Учебный аудитор.');
  for (const radio of await team
    .locator('input[type="radio"][value="confirmed"]')
    .all())
    await radio.check();
  await capture('first-team-authorized-different-auditor', selector);
  const proposed = await save(team, 'proposeTeam', '/team');
  expect(record(record(proposed.team).value).members).toMatchObject([
    { workspaceMembershipId: journey.auditorMembership },
  ]);

  article = await openCase(auditor);
  await expect(
    article.getByRole('form', { name: copy('recordDecision'), exact: true }),
  ).toHaveCount(0);
  await expect(
    article.getByRole('form', {
      name: copy('recordDossierReview'),
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    article.getByRole('form', {
      name: copy('recordCertificationDecision'),
      exact: true,
    }),
  ).toHaveCount(0);
  await capture(
    'auditor-cannot-approve-own-team',
    article.getByRole('region', { name: copy('teamTitle'), exact: true }),
  );

  article = await openCase(approver);
  const approval = article.getByRole('form', {
    name: copy('recordDecision'),
    exact: true,
  });
  await approval
    .getByRole('radio', { name: copy('decisionApprove'), exact: true })
    .check();
  await approval
    .getByRole('checkbox', {
      name: copy('teamDecisionAttestation'),
      exact: true,
    })
    .check();
  await save(approval, 'recordDecision', '/team-decision');

  article = await openCase(manager);
  const plan = article.getByRole('form', {
    name: copy('recordStage1Plan'),
    exact: true,
  });
  await plan
    .getByLabel(copy('stageStartDate'), { exact: true })
    .fill(journey.stages.stage1.start);
  await plan
    .getByLabel(copy('stageEndDate'), { exact: true })
    .fill(journey.stages.stage1.end);
  await plan
    .getByLabel(copy('stageOnSiteDays'), { exact: true })
    .fill(text(journey.confirmedDuration.stage1OnSite));
  await plan.getByLabel(copy('stageRemoteDays'), { exact: true }).fill('0');
  await plan
    .getByLabel(copy('stageObjectives'), { exact: true })
    .fill('Verificare fictivă / Учебная проверка.');
  await plan
    .getByLabel(copy('stageScope'), { exact: true })
    .fill('Fictional dairy production');
  await selectOption(
    plan.getByLabel(copy('stagePlanDocument'), { exact: true }),
    { value: planId },
  );
  await save(plan, 'recordStage1Plan', '/stages/stage-1/plan');

  article = await openCase(auditor);
  const report = article.getByRole('form', {
    name: copy('recordStage1Report'),
    exact: true,
  });
  await report
    .getByLabel(copy('stageReportDate'), { exact: true })
    .fill(journey.stages.stage1.end);
  await report
    .getByRole('checkbox', {
      name: copy('stageDocumentReviewConfirm'),
      exact: true,
    })
    .check();
  await report
    .getByRole('radio', { name: copy('stageConclusionReady'), exact: true })
    .check();
  await report
    .getByLabel(copy('stageConclusionNote'), { exact: true })
    .fill('Pregătit / Готов (fictiv).');
  await selectOption(
    report.getByLabel(copy('stageReportDocument'), { exact: true }),
    { value: reportId },
  );
  await save(report, 'recordStage1Report', '/stages/stage-1/report');
  const final = await journey.read(auditor, journey.base);
  expect(final.nextStep).toBe('stage_2_plan');
  const stage1Report = records(final.stages).find(
    (stage) => stage.step === 'stage_1_report',
  );
  expect(stage1Report?.recordedBy).toMatchObject({
    workspaceMembershipId: journey.auditorMembership,
  });
  await capture(
    'selected-auditor-stage-report-confirmed',
    article.getByRole('region', { name: copy('stage1Title'), exact: true }),
  );
});
