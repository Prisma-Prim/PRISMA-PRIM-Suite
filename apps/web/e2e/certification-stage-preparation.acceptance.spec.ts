import { randomUUID, createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { strToU8, zipSync } from 'fflate';
import { expect, test, type Locator } from '@playwright/test';
import {
  certificationMessages,
  type CertificationMessageKey,
} from '../src/certification/certification.copy';
import { draftPreparationMessages } from '../src/certification/draft-preparation.copy';
import { resolveMessage, formatMessage } from '../src/localization/messages';
import {
  prepareCertificationJourney,
  certificationMembers,
  record,
  records,
  text,
  type Identity,
  addDays,
} from './certification-journey.acceptance.fixture';
import { openSelect, selectOption } from './select-option';

test('a manager reuses reviewed scope and a leader appends cited RU/RO context before ordinary native plan and report submission', async ({
  page,
}, info) => {
  test.setTimeout(300_000);
  const narrow = info.project.name.endsWith('narrow'),
    locale = narrow ? 'ru' : 'ro';
  const copy = (key: CertificationMessageKey) =>
    resolveMessage(certificationMessages, locale, key);
  const prep = (key: (typeof draftPreparationMessages.keys)[number]) =>
    resolveMessage(draftPreparationMessages, locale, key);
  const { manager, auditor, approver } = certificationMembers;
  const f = await prepareCertificationJourney(
    page.request,
    `1467-${locale}-${randomUUID().slice(0, 8)}`,
    { stopAfter: 'team' },
  );
  await page.addInitScript(
    (value) => localStorage.setItem('prisma-prim.interface-locale', value),
    locale,
  );
  for (const bundle of [
    'document-registrar',
    'received-audit-source-access',
    'document-content-reader',
  ]) {
    const response = await f.post(approver, `/company-${bundle}-assignments`, {
      companyId: f.companyId,
      workspaceMembershipId: f.auditorMembership,
    });
    expect(response.status(), await response.text()).toBe(201);
  }
  const plan1 = await f.attach('plan', 'Fictional Stage 1 plan');
  const sourceAttachment = await f.attach(
    'evidence',
    'Fictional bilingual scope source',
  );
  const source = records(
    (await f.read(manager, `${f.base}/documents`)).items,
  ).find((item) => item.id === sourceAttachment);
  if (!source) throw new Error('Missing exact native source');
  const docx = zipSync({
    '[Content_Types].xml': strToU8(
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ),
    '_rels/.rels': strToU8(
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="root" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ),
    'word/document.xml': strToU8(
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Domeniu: Producție de lactate</w:t></w:r></w:p><w:p><w:r><w:t>Наименование: Учебная молочная компания</w:t></w:r></w:p></w:body></w:document>',
    ),
  });
  const prefix = `/projects/${text((await f.read(manager, f.base)).projectId)}/dossier-analysis`;
  const query = new URLSearchParams({
    documentId: text(source.documentId),
    documentVersionId: text(source.versionId),
    caseId: f.caseId,
    attachmentId: sourceAttachment,
    fileName: 'domeniu-область.docx',
    language: 'ro',
  });
  const upload = await page.request.post(
    `http://127.0.0.1:4174/api${prefix}/sources/docx?${query}`,
    {
      headers: {
        ...manager,
        'x-company-context-id': f.companyId,
        'idempotency-key': randomUUID(),
        'content-type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
      data: Buffer.from(docx),
    },
  );
  expect(upload.status(), await upload.text()).toBe(201);
  const sourceId = text(record(await upload.json()).id);
  async function reviewedRun() {
    const made = await f.post(manager, `${prefix}/runs`, {});
    expect(made.status(), await made.text()).toBe(201);
    const runId = text(record(await made.json()).id);
    const detail = await f.read(manager, `${prefix}/runs/${runId}`);
    const candidates = records(detail.candidates);
    const scope = candidates.find(
      (c) => c.field === 'scope' && record(c.citation).sourceId === sourceId,
    );
    if (!scope) throw new Error('Missing actual extracted scope');
    const imported = await f.post(
      manager,
      `${prefix}/runs/${runId}/suggestions`,
      {
        snapshotHash: detail.snapshotHash,
        suggestions: [
          {
            field: 'scope',
            value: scope.value,
            rationale: 'Fictional explicit human review',
            citations: [scope.citation],
          },
        ],
      },
    );
    expect(imported.status(), await imported.text()).toBe(201);
    const proposal = records(
      (await f.read(manager, `${prefix}/runs/${runId}`)).suggestions,
    )[0];
    if (!proposal) throw new Error('Missing native proposal');
    const reviewed = await f.post(
      manager,
      `${prefix}/suggestions/${text(proposal.id)}/reviews`,
      {
        expectedRevision: 0,
        decision: 'correct',
        replacementValue: 'Producție de lactate — verificat',
      },
    );
    expect(reviewed.status(), await reviewed.text()).toBe(201);
    return runId;
  }
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
      { value: f.companyId },
    );
    if (narrow) {
      await page.locator('.production-menu-button').click();
      await page.locator('.production-menu-button').click();
    }
    await page.locator('nav a[href="#projects"]').click();
    const projects = page.locator('.project-workspace');
    await projects.getByRole('searchbox').fill(f.projectTitle);
    await projects
      .locator('.project-list')
      .getByRole('button')
      .filter({ hasText: f.projectTitle })
      .click();
    await projects
      .getByRole('tab', { name: copy('title'), exact: true })
      .click();
    await page
      .getByRole('button', { name: f.orderReference, exact: true })
      .click();
  }
  async function prepare(region: Locator, runId: string) {
    await region
      .getByRole('button', { name: prep('open'), exact: true })
      .click();
    const options = await openSelect(
      region.getByLabel(prep('run'), { exact: true }),
    );
    await options
      .getByRole('option', { name: new RegExp(runId.slice(0, 8), 'u') })
      .click();
    await region
      .getByRole('button', { name: prep('preview'), exact: true })
      .click();
    const field = locale === 'ru' ? 'Область' : 'Domeniu';
    const choice = region.getByRole('checkbox', {
      name: formatMessage(prep('choose'), {
        field,
        value: 'Producție de lactate — verificat',
      }),
      exact: true,
    });
    await expect(choice).not.toBeChecked();
    await choice.check();
    await expect(
      region.getByText('word/document.xml#paragraph:1', { exact: true }),
    ).toBeVisible();
    await region
      .getByRole('group', { name: prep('open'), exact: true })
      .screenshot({
        path: info.outputPath(`stage-preview-${runId}-${locale}.png`),
      });
    await region
      .getByRole('button', { name: prep('apply'), exact: true })
      .click();
    await expect(
      region.getByText(prep('applied'), { exact: true }),
    ).toBeVisible();
  }
  async function save(form: Locator, label: string, path: string) {
    const pending = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === `/api${f.base}${path}` &&
        r.request().method() === 'POST',
    );
    await form.getByRole('button', { name: label, exact: true }).click();
    const response = await pending;
    expect(response.status(), await response.text()).toBe(201);
  }
  const run1 = await reviewedRun();
  const beforePlan = await f.read(manager, f.base);
  const confirmed = record(record(record(beforePlan.duration).value).confirmed);
  await openCase(manager);
  const stage1 = page.getByRole('region', {
    name: copy('stage1Title'),
    exact: true,
  });
  const planForm = stage1.getByRole('form', {
    name: copy('recordStage1Plan'),
    exact: true,
  });
  await planForm
    .getByLabel(copy('stageObjectives'), { exact: true })
    .fill('Obiective definite de auditor');
  await prepare(stage1, run1);
  await expect(
    planForm.getByLabel(copy('stageScope'), { exact: true }),
  ).toHaveValue('Producție de lactate — verificat');
  await expect(
    planForm.getByLabel(copy('stageObjectives'), { exact: true }),
  ).toHaveValue('Obiective definite de auditor');
  expect(await f.read(manager, f.base)).toEqual(beforePlan);
  const manualScope = 'Producție de lactate — ajustat explicit de auditor';
  await planForm
    .getByLabel(copy('stageScope'), { exact: true })
    .fill(manualScope);
  for (const key of ['stageStartDate', 'stageEndDate'] as const)
    await planForm
      .getByLabel(copy(key), { exact: true })
      .fill(addDays(f.today, -30));
  await planForm
    .getByLabel(copy('stageOnSiteDays'), { exact: true })
    .fill(text(confirmed.stage1OnSite));
  await planForm.getByLabel(copy('stageRemoteDays'), { exact: true }).fill('0');
  await selectOption(
    planForm.getByLabel(copy('stagePlanDocument'), { exact: true }),
    { value: plan1 },
  );
  await stage1
    .getByRole('heading', { name: copy('stage1Title'), exact: true })
    .click();
  await planForm
    .getByLabel(copy('stageObjectives'), { exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath(`stage-plan-edited-${locale}.png`),
  });
  await save(planForm, copy('recordStage1Plan'), '/stages/stage-1/plan');
  const planned = await f.read(manager, f.base);
  expect(
    records(planned.stages).find((v) => v.step === 'stage_1_plan'),
  ).toMatchObject({
    value: { scope: manualScope, objectives: 'Obiective definite de auditor' },
  });
  const report1 = await f.attach('report', 'Fictional Stage 1 report');
  await f.step(auditor, `${f.base}/stages/stage-1/report`, {
    reportDate: addDays(f.today, -30),
    documentReviewCompleted: true,
    conclusion: 'ready',
    conclusionNote: 'Fictional human professional judgment',
    reportAttachmentId: report1,
  });
  const plan2 = await f.attach('plan', 'Fictional Stage 2 plan');
  await f.step(manager, `${f.base}/stages/stage-2/plan`, {
    startDate: addDays(f.today, -21),
    endDate: addDays(f.today, -21),
    onSiteDays: text(confirmed.stage2OnSite),
    remoteDays: '0',
    objectives: 'Human Stage 2 objectives',
    scope: manualScope,
    planAttachmentId: plan2,
    sentToClientOn: null,
    deviationNote: null,
  });
  const report2 = await f.attach('report', 'Fictional Stage 2 report');
  const run2 = await reviewedRun();
  const beforeReport = await f.read(auditor, f.base);
  await openCase(auditor);
  const stage2 = page.getByRole('region', {
    name: copy('stage2Title'),
    exact: true,
  });
  const reportForm = stage2.getByRole('form', {
    name: copy('recordStage2Report'),
    exact: true,
  });
  await reportForm
    .getByLabel(copy('stageSummary'), { exact: true })
    .fill('Ручной текст аудитора.');
  await prepare(stage2, run2);
  const summary = await reportForm
    .getByLabel(copy('stageSummary'), { exact: true })
    .inputValue();
  expect(summary).toContain(
    'Ручной текст аудитора.\n\n' + prep('contextHeading'),
  );
  expect(summary).toContain('«Producție de lactate — verificat»');
  expect(summary).toContain(
    'domeniu-область.docx · v1 · ' +
      text(source.versionId) +
      ' · word/document.xml#paragraph:1',
  );
  expect(summary).toContain('«Producție de lactate»');
  expect(await f.read(auditor, f.base)).toEqual(beforeReport);
  const finalSummary = summary + '\nДополнение аудитора после проверки.';
  await reportForm
    .getByLabel(copy('stageSummary'), { exact: true })
    .fill(finalSummary);
  await reportForm
    .getByLabel(copy('stageReportDate'), { exact: true })
    .fill(addDays(f.today, -21));
  await selectOption(
    reportForm.getByLabel(copy('stageReportDocument'), { exact: true }),
    { value: report2 },
  );
  await stage2
    .getByRole('heading', { name: copy('stage2Title'), exact: true })
    .click();
  await reportForm
    .getByLabel(copy('stageSummary'), { exact: true })
    .press('Control+Home');
  await expect(
    reportForm.getByLabel(copy('stageSummary'), { exact: true }),
  ).toHaveValue(finalSummary);
  await reportForm
    .getByLabel(copy('stageSummary'), { exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath(`stage-report-edited-${locale}.png`),
  });
  await save(reportForm, copy('recordStage2Report'), '/stages/stage-2/report');
  const reported = await f.read(auditor, f.base);
  expect(
    records(reported.stages).find((v) => v.step === 'stage_2_report'),
  ).toMatchObject({
    value: { summary: finalSummary, certificationBodyApproval: null },
  });
  expect(
    records(reported.stages).find((v) => v.step === 'stage_1_report'),
  ).toMatchObject({
    value: { conclusionNote: 'Fictional human professional judgment' },
  });
  await writeFile(
    info.outputPath(`stage-proof-${locale}.json`),
    JSON.stringify(
      {
        dataKind: 'fictional',
        locale,
        caseId: f.caseId,
        run1,
        run2,
        sourceId,
        sourceVersionId: source.versionId,
        originalSha256: createHash('sha256').update(docx).digest('hex'),
        scope: manualScope,
        summary: finalSummary,
        nativeStage2Revision: reported.revision,
      },
      null,
      2,
    ),
  );
});
