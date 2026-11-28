import { readFile } from 'node:fs/promises';
import {
  expect,
  test,
  type Locator,
  type Page,
  type Route,
} from '@playwright/test';
import {
  clarteContractSource as contractSource,
  clarteDocumentPdf,
  clarteDocumentsClient as client,
  clarteDocumentsProject as project,
  clarteKnowledgePdf,
  clarteKnowledgeSource as knowledgeSource,
  clartePassageText as passageText,
  createClarteDocumentsApi,
  registeredDocumentId,
  seededDocumentIds,
} from '../src/clarte/documents/clarte-documents.test-fixture';
import { isPhoneLayout, openClarte } from './clarte.fixture';
import { selectOption } from './select-option';

const pdf = Buffer.from(clarteDocumentPdf);
const knowledgePdf = Buffer.from(clarteKnowledgePdf);

/** Every API request is answered by the shared fictional Documents API. */
async function serveDocuments(page: Page) {
  const api = createClarteDocumentsApi();
  await page.route('**/api/**', async (route: Route) => {
    const request = route.request();
    const contentType = request.headers()['content-type'] ?? '';
    const json = contentType.startsWith('application/json');
    const reply = api.reply({
      method: request.method(),
      url: new URL(request.url()),
      body: json ? request.postDataJSON() : undefined,
    });
    if (reply.pdf)
      return route.fulfill({
        status: reply.status,
        body: Buffer.from(reply.pdf),
        headers: { 'content-type': 'application/pdf' },
      });
    return route.fulfill({ status: reply.status, json: reply.json });
  });
  return api;
}

async function screenshot(page: Page, name: string) {
  const width = isPhoneLayout(page) ? '390' : '1440';
  await page.screenshot({
    path: test.info().outputPath(`${name}-${width}.png`),
    fullPage: false,
  });
}

async function download(page: Page, button: Locator, bytes: Buffer) {
  const pending = page.waitForEvent('download');
  await button.click();
  const saved = await (await pending).path();
  if (!saved) throw new Error('Missing download');
  expect(await readFile(saved)).toEqual(bytes);
}

async function noHorizontalScroll(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

test('registers a reference, makes it official with its PDF, links a received Contract, organizes a Project and reads Knowledge', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const api = await serveDocuments(page);
  await openClarte(page, '/#documents');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Documents');
  const register = page.locator('section#documents');
  await expect(
    register.getByRole('button', {
      name: 'Fictional initial assessment questionnaire',
    }),
  ).toBeVisible();

  // List and filter: by type, then by text.
  const types = register.getByRole('navigation', { name: 'Document type' });
  await types.getByRole('button', { name: 'Received Contract PDF, 1' }).click();
  await expect(register.locator('.clarte-document-rows > li')).toHaveCount(1);
  await types.getByRole('button', { name: 'All, 3' }).click();
  await register.getByLabel('Filter working Documents').fill('valea');
  await expect(register.locator('.clarte-document-rows > li')).toHaveCount(1);
  await register.getByLabel('Filter working Documents').fill('');
  await expect(register.locator('.clarte-document-rows > li')).toHaveCount(3);
  if (!isPhoneLayout(page)) {
    const heights = await register
      .locator('.clarte-document-rows > li')
      .evaluateAll((rows) =>
        rows.map((row) => row.getBoundingClientRect().height),
      );
    for (const height of heights) expect(height).toBeCloseTo(63, 0);
  }
  await noHorizontalScroll(page);
  await screenshot(page, 'clarte-documents-register');

  // Record an external work reference.
  await register.getByRole('button', { name: 'Register a Document' }).click();
  const form = page.getByRole('dialog', { name: 'Register a Document' });
  await selectOption(form.getByLabel('Client'), { label: client.displayName });
  await form.getByLabel('Title').fill('Fictional supplier questionnaire');
  await form.getByLabel('Purpose').fill('Collect fictional supplier answers');
  await form
    .getByLabel('External HTTPS link')
    .fill('https://example.test/fictional/supplier.docx');
  await form
    .getByRole('button', { name: 'Register working reference' })
    .click();

  // Its side panel: keep a PDF on the draft Version, download it, designate it.
  const panel = page.getByRole('dialog', {
    name: 'Fictional supplier questionnaire',
  });
  await expect(
    panel.getByText('Collect fictional supplier answers'),
  ).toBeVisible();
  const versions = panel.getByRole('region', { name: 'Versions' });
  await expect(
    versions.getByRole('heading', { name: 'Version 1' }),
  ).toBeVisible();
  await expect(versions.getByLabel('Choose the PDF file')).toBeHidden();
  const draft = versions.getByRole('listitem').filter({ hasText: 'Version 1' });
  const frame = await draft.boundingBox();
  const badge = await draft.getByText('Draft', { exact: true }).boundingBox();
  if (!frame || !badge) throw new Error('Draft Version summary is missing');
  expect(badge.x + badge.width).toBeLessThanOrEqual(frame.x + frame.width);
  await noHorizontalScroll(page);
  await screenshot(page, 'clarte-documents-panel');
  const parts = panel.getByRole('navigation', { name: 'Document sections' });
  await parts.getByRole('button', { name: 'Versions' }).click();
  await expect(draft).toBeInViewport();
  await screenshot(page, 'clarte-documents-versions');
  await parts.getByRole('button', { name: 'References' }).click();
  await expect(
    versions.getByRole('list', { name: 'References for Version 1' }),
  ).toBeInViewport();
  await screenshot(page, 'clarte-documents-references');
  await parts.getByRole('button', { name: 'Versions' }).click();
  await panel.getByRole('button', { name: 'Show version details' }).click();
  await versions.getByLabel('Choose the PDF file').setInputFiles({
    name: 'fictional-supplier.pdf',
    mimeType: 'application/pdf',
    buffer: pdf,
  });
  await versions.getByRole('button', { name: 'Preserve PDF' }).click();
  await download(
    page,
    versions.getByRole('button', { name: 'Download Version 1 PDF' }).first(),
    pdf,
  );
  await versions.getByRole('button', { name: 'PDF history' }).click();
  await expect(
    versions.getByRole('list', { name: 'PDF history' }).getByRole('listitem'),
  ).toHaveCount(1);
  await versions.getByRole('button', { name: 'Designate as official' }).click();
  await versions
    .getByRole('button', { name: 'Confirm official designation' })
    .click();
  await expect(versions.getByText('Version 1 is now official.')).toBeVisible();
  await noHorizontalScroll(page);
  await screenshot(page, 'clarte-documents-official');
  await panel.getByRole('button', { name: 'Close' }).click();
  await expect(panel).toHaveCount(0);

  // Record a received Contract PDF linked to its exact Contract version.
  await register.getByRole('button', { name: 'Register a Document' }).click();
  await selectOption(form.getByLabel('Document family'), {
    label: 'Received Contract PDF',
  });
  await selectOption(form.getByLabel('Exact Contract Version'), {
    value: contractSource.contractVersionId,
  });
  await form.getByLabel('Title').fill('Fictional signed Contract CTR-29 v2');
  await form.getByLabel('Purpose').fill('Keep the fictional signed original');
  await form.getByLabel('Declared source').fill('Fictional courier delivery');
  await form
    .getByRole('button', { name: 'Register received Contract PDF' })
    .click();
  const received = page.getByRole('dialog', {
    name: 'Fictional signed Contract CTR-29 v2',
  });
  await expect(received.getByText('Fictional courier delivery')).toBeVisible();
  await received.getByRole('button', { name: 'Close' }).click();

  // Associate the open Document with a Project through the existing picker.
  await register
    .getByRole('button', { name: 'Fictional stage 1 audit report' })
    .click();
  const report = page.getByRole('dialog', {
    name: 'Fictional stage 1 audit report',
  });
  await report
    .getByRole('button', { name: 'Associate with a Project' })
    .click();
  const association = page.getByRole('dialog', {
    name: 'Associate with a Project',
  });
  await selectOption(association.getByLabel('Project'), { value: project.id });
  const projectDocuments = association.getByRole('region', {
    name: 'Working Documents',
  });
  await projectDocuments
    .getByRole('button', { name: 'Attach working Document' })
    .click();
  await projectDocuments
    .getByRole('button', { name: 'Attach Fictional stage 1 audit report' })
    .click();
  await expect(
    projectDocuments.getByRole('heading', {
      name: 'Fictional stage 1 audit report',
    }),
  ).toBeVisible();
  await association.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(report.getByText(project.title)).toBeVisible();
  await report.getByRole('button', { name: 'Close' }).click();

  // Remove and open linked Documents through the register's Project panel.
  await register
    .getByRole('button', { name: 'Documents of a Project' })
    .click();
  const organizer = page.getByRole('dialog', {
    name: 'Documents of a Project',
  });
  await selectOption(organizer.getByLabel('Project'), { value: project.id });
  const linked = organizer.getByRole('region', { name: 'Working Documents' });
  await expect(
    linked.getByRole('heading', {
      name: 'Fictional initial assessment questionnaire',
    }),
  ).toBeVisible();
  await expect(
    linked.getByRole('heading', { name: 'Fictional stage 1 audit report' }),
  ).toBeVisible();
  await linked
    .getByRole('button', {
      name: 'Remove Fictional initial assessment questionnaire',
    })
    .click();
  await expect(
    linked.getByRole('heading', {
      name: 'Fictional initial assessment questionnaire',
    }),
  ).toHaveCount(0);
  await noHorizontalScroll(page);
  await screenshot(page, 'clarte-documents-project');
  await linked.getByRole('button', { name: 'Open Document' }).click();
  await expect(report.getByText(project.title)).toBeVisible();
  await report.getByRole('button', { name: 'Close' }).click();

  // Knowledge: literal search, exact passage and its verified source PDF.
  await page
    .getByRole('navigation', { name: 'Documents views' })
    .getByRole('link', { name: 'Knowledge base' })
    .click();
  const knowledge = page.locator('section#knowledge-evidence');
  await expect(knowledge.getByText(knowledgeSource.title)).toBeVisible();
  await knowledge.getByLabel('Literal search').fill('accredited laboratory');
  await knowledge.getByRole('button', { name: 'Search passages' }).click();
  const passages = knowledge.getByRole('region', { name: 'Passages found' });
  await expect(passages).toContainText(passageText);
  await download(
    page,
    passages.getByRole('button', { name: 'Download exact source PDF' }),
    knowledgePdf,
  );
  const citation = knowledge.getByRole('article', {
    name: knowledgeSource.title,
  });
  await expect(citation).toContainText(passageText);
  await noHorizontalScroll(page);
  await screenshot(page, 'clarte-documents-knowledge');

  const supplier = registeredDocumentId(1);
  expect([...api.unhandled]).toEqual([]);
  expect(api.writes).toEqual([
    'POST /api/documents',
    `POST /api/documents/${supplier}/versions/${supplier}-v1/content`,
    `POST /api/documents/${supplier}/versions/${supplier}-v1/official-designation`,
    'POST /api/documents',
    `POST /api/documents/${seededDocumentIds.report}/project-association`,
    `POST /api/documents/${seededDocumentIds.questionnaire}/project-association`,
  ]);
});
