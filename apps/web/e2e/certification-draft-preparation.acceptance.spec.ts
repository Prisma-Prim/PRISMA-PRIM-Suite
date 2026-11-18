import { randomUUID } from 'node:crypto';
import { strToU8, zipSync } from 'fflate';
import { expect, test } from '@playwright/test';
import {
  certificationMessages,
  type CertificationMessageKey,
} from '../src/certification/certification.copy';
import { draftPreparationMessages } from '../src/certification/draft-preparation.copy';
import { formatMessage, resolveMessage } from '../src/localization/messages';
import { prepareDossier } from './dossier-analysis.acceptance-fixture';
import {
  certificationMembers,
  record,
  records,
  text,
} from './certification-journey.acceptance.fixture';
import { openSelect, selectOption } from './select-option';

test('a manager previews reviewed RU/RO sources, deliberately prepares selected fields and edits before native application submission', async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  const narrow = info.project.name.endsWith('narrow');
  const locale = narrow ? 'ru' : 'ro';
  const copy = (key: CertificationMessageKey) =>
    resolveMessage(certificationMessages, locale, key);
  const prep = (key: (typeof draftPreparationMessages.keys)[number]) =>
    resolveMessage(draftPreparationMessages, locale, key);
  const f = await prepareDossier(
    page.request,
    `Draft ${randomUUID().slice(0, 8)}`,
  );
  const api = 'http://127.0.0.1:4174/api';
  const headers = {
    ...certificationMembers.manager,
    'x-company-context-id': f.companyId,
  };
  async function post(path: string, body: unknown, admin = false) {
    const response = await page.request.post(api + path, {
      headers: {
        ...(admin ? certificationMembers.approver : headers),
        'idempotency-key': randomUUID(),
      },
      data: body,
    });
    expect(response.status(), await response.text()).toBe(201);
    return record(await response.json());
  }
  async function read(path: string) {
    const response = await page.request.get(api + path, { headers });
    expect(response.status(), await response.text()).toBe(200);
    return record(await response.json());
  }
  const membership = process.env.ACCEPTANCE_PRIMARY_MEMBERSHIP_ID;
  if (!membership) throw new Error('Acceptance membership required');
  for (const bundle of [
    'certification-reader',
    'certification-programme-manager',
  ])
    await post(
      `/company-${bundle}-assignments`,
      { companyId: f.companyId, workspaceMembershipId: membership },
      true,
    );
  const entity = record(
    (
      await post(`/clients/${f.clientId}/legal-entities`, {
        expectedClientVersion: (await read(`/clients/${f.clientId}`)).version,
        legalName: 'Fictional native application',
        taxId: null,
        legalAddress: 'Fictional address',
      })
    ).legalEntity,
  );
  const orderReference = `DRAFT-${randomUUID().slice(0, 8)}`;
  const caseId = text(
    (
      await post(`/projects/${f.projectId}/certification-cases`, {
        clientLegalEntityId: text(entity.id),
        orderReference,
      })
    ).id,
  );
  const base = `/certification-cases/${caseId}`;
  const facts = {
    declaredLegalName: 'Original native name',
    declaredAddress: 'Original native address',
    sites: [{ address: 'Fictional plant', activity: 'Dairy plant' }],
    requestedScope: 'Original native scope',
    foodChainSubcategories: ['CI'],
    haccpStudyCount: 2,
    totalHeadcount: 40,
    effectiveFte: 40,
    shiftCount: 1,
    seasonalActivity: null,
    otherCertifiedSystems: null,
    outsourcedProcesses: null,
    consultant: { used: false },
    auditLanguages: ['ro', 'ru'],
    preferredAuditPeriod: null,
  };
  await post(`${base}/application`, { expectedRevision: 1, facts });
  const parts = {
    '[Content_Types].xml':
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels':
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="root" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml':
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
      [
        'Denumire juridică: Firma Fictivă SRL',
        'Адрес: ул. Учебная 12',
        'Domeniu: Producție de lactate',
      ]
        .map((line) => `<w:p><w:r><w:t>${line}</w:t></w:r></w:p>`)
        .join('') +
      '</w:body></w:document>',
  };
  const prefix = `/projects/${f.projectId}/dossier-analysis`;
  const query = new URLSearchParams({
    documentId: f.documentId,
    documentVersionId: f.versionId,
    fileName: 'fictiv-ru-ro.docx',
    language: 'ro',
  });
  const upload = await page.request.post(
    `${api}${prefix}/sources/docx?${query}`,
    {
      headers: {
        ...headers,
        'idempotency-key': randomUUID(),
        'content-type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
      data: Buffer.from(
        zipSync(
          Object.fromEntries(
            Object.entries(parts).map(([path, xml]) => [path, strToU8(xml)]),
          ),
        ),
      ),
    },
  );
  expect(upload.status(), await upload.text()).toBe(201);
  const runId = text((await post(`${prefix}/runs`, {})).id);
  const detail = await read(`${prefix}/runs/${runId}`);
  const candidates = records(detail.candidates);
  const suggestions = ['legalName', 'address', 'scope'].map((field) => {
    const candidate = candidates.find((c) => c.field === field);
    if (!candidate) throw new Error(`Missing actual extracted ${field}`);
    return {
      field,
      value: candidate.value,
      rationale: 'Fictional human-reviewed source',
      citations: [candidate.citation],
    };
  });
  await post(`${prefix}/runs/${runId}/suggestions`, {
    snapshotHash: detail.snapshotHash,
    suggestions,
  });
  const proposed = await read(`${prefix}/runs/${runId}`);
  for (const suggestion of records(proposed.suggestions))
    await post(`${prefix}/suggestions/${text(suggestion.id)}/reviews`, {
      expectedRevision: 0,
      decision: 'confirm',
    });
  const reviewed = await read(`${prefix}/runs/${runId}`);
  const original = await read(base);
  const writes: string[] = [];
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      new URL(request.url()).pathname.startsWith(`/api${base}`)
    )
      writes.push(request.url());
  });
  await page.goto('/');
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await selectOption(
    page.getByLabel('Active Company', { exact: true }),
    f.companyId,
  );
  if (narrow) {
    await page.getByRole('button', { name: 'Close navigation' }).click();
    await page.getByRole('button', { name: 'Open navigation' }).click();
  }
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name: 'Projects', exact: true })
    .click();
  const projects = page.locator('.project-workspace');
  await projects
    .getByRole('searchbox', { name: 'Find Projects' })
    .fill(f.title);
  await projects
    .getByRole('list', { name: 'Projects', exact: true })
    .getByRole('button')
    .filter({ hasText: f.title })
    .click();
  await projects
    .getByRole('tab', { name: 'Certification', exact: true })
    .click();
  await page.getByRole('button', { name: orderReference, exact: true }).click();
  await page
    .getByRole('button', { name: 'Correct the application', exact: true })
    .click();
  await selectOption(
    page.getByRole('combobox', { name: 'Interface language', exact: true }),
    locale,
  );
  const form = page.getByRole('form', {
    name: copy('correctApplication'),
    exact: true,
  });
  await form
    .getByLabel(copy('declaredLegalName'), { exact: true })
    .fill('Typed name before preview');
  await form
    .getByLabel(copy('requestedScope'), { exact: true })
    .fill('Manual scope retained');
  await page.getByRole('button', { name: prep('open'), exact: true }).click();
  const availableRuns = await openSelect(
    page.getByLabel(prep('run'), { exact: true }),
  );
  await availableRuns
    .getByRole('option', { name: new RegExp(runId.slice(0, 8), 'u') })
    .click();
  await page
    .getByRole('button', { name: prep('preview'), exact: true })
    .click();
  const chooseName = page.getByRole('checkbox', {
    name: formatMessage(prep('choose'), {
      field: copy('declaredLegalName'),
      value: 'Firma Fictivă SRL',
    }),
    exact: true,
  });
  await expect(chooseName).not.toBeChecked();
  await expect(
    form.getByLabel(copy('declaredLegalName'), { exact: true }),
  ).toHaveValue('Typed name before preview');
  await expect(
    page.getByText('fictiv-ru-ro.docx', { exact: false }).first(),
  ).toBeVisible();
  await chooseName.check();
  await page
    .getByRole('checkbox', {
      name: formatMessage(prep('choose'), {
        field: copy('declaredAddress'),
        value: 'ул. Учебная 12',
      }),
      exact: true,
    })
    .check();
  await page.screenshot({
    path: info.outputPath(`draft-preview-${locale}.png`),
    fullPage: true,
  });
  await page
    .getByRole('group', { name: prep('open'), exact: true })
    .screenshot({
      path: info.outputPath(`draft-preview-focused-${locale}.png`),
    });
  await page.getByRole('button', { name: prep('apply'), exact: true }).click();
  await expect(page.getByText(prep('applied'), { exact: true })).toBeVisible();
  await expect(
    form.getByLabel(copy('declaredLegalName'), { exact: true }),
  ).toHaveValue('Firma Fictivă SRL');
  await expect(
    form.getByLabel(copy('requestedScope'), { exact: true }),
  ).toHaveValue('Manual scope retained');
  expect(writes).toHaveLength(0);
  expect(await read(base)).toEqual(original);
  await form
    .getByLabel(copy('declaredAddress'), { exact: true })
    .fill('ул. Учебная 14 — исправлено человеком');
  await form
    .getByLabel(copy('correctionReason'), { exact: true })
    .fill('Fictional explicit human correction after reviewing the original.');
  await page.screenshot({
    path: info.outputPath(`draft-edited-${locale}.png`),
    fullPage: true,
  });
  await form.screenshot({
    path: info.outputPath(`draft-edited-focused-${locale}.png`),
  });
  const save = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === `/api${base}/application`,
  );
  await form
    .getByRole('button', { name: copy('saveCorrection'), exact: true })
    .click();
  expect((await save).status()).toBe(201);
  expect(writes).toHaveLength(1);
  const saved = await read(base);
  expect(saved.revision).toBe(3);
  expect(record(saved.application).value).toMatchObject({
    ...facts,
    declaredLegalName: 'Firma Fictivă SRL',
    declaredAddress: 'ул. Учебная 14 — исправлено человеком',
    requestedScope: 'Manual scope retained',
  });
  const preserved = await read(`${prefix}/runs/${runId}`);
  // These Project-only sources are unchanged by a native application edit.
  expect(preserved.stale).toBe(false);
  expect(preserved.suggestions).toEqual(reviewed.suggestions);
  expect(JSON.stringify(preserved.suggestions)).toContain('ул. Учебная 12');
  const staleTarget = await page.request.get(
    `${api}${prefix}/runs/${runId}/certification-draft?caseId=${caseId}&expectedRevision=2`,
    { headers },
  );
  expect(staleTarget.status()).toBe(409);
  await expect(form).toHaveCount(0);
  await page
    .getByRole('region', { name: copy('applicationTitle'), exact: true })
    .screenshot({ path: info.outputPath(`draft-saved-focused-${locale}.png`) });
  await page.screenshot({
    path: info.outputPath(`draft-saved-${locale}.png`),
    fullPage: true,
  });
});
