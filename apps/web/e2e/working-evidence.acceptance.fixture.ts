import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  expect,
  request,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { selectOption } from './select-option';
import { workingEvidenceMessages } from '../src/working-evidence/working-evidence.copy';
import { resolveMessage } from '../src/localization/messages';
const origin = 'http://127.0.0.1:4174';
const owner = {
  'x-test-external-provider': 'local-demo',
  'x-test-external-subject': 'workspace-owner',
  'x-test-display-name': 'Workspace Owner',
  'x-test-email': 'owner@example.test',
};
const person = {
  'x-test-external-provider': 'local-demo',
  'x-test-external-subject': 'local-demonstration-user',
  'x-test-display-name': 'Ada Ionescu',
  'x-test-email': 'ada@example.test',
};
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected public response');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown) {
  if (typeof value !== 'string' || !value)
    throw new Error('Expected public identity');
  return value;
}
async function fillCaseField(cases: Locator, name: string, value: string) {
  const field = cases.getByRole('textbox', { name, exact: true });
  await expect(field).toBeEditable();
  await field.fill(value);
}
async function savedFile(page: Page, control: Locator) {
  const waiting = page.waitForEvent('download');
  await control.click();
  const download = await waiting,
    path = await download.path();
  if (!path) throw new Error('Missing exact artifact');
  return readFile(path);
}
/** Independently read ZIP local entries, verifying the mandated uncompressed closed annex. */
function entries(bytes: Buffer) {
  const files = new Map<string, Buffer>();
  let offset = 0;
  while (
    offset + 30 <= bytes.length &&
    bytes.readUInt32LE(offset) === 0x04034b50
  ) {
    expect(bytes.readUInt16LE(offset + 8)).toBe(0);
    const size = bytes.readUInt32LE(offset + 18),
      nameLength = bytes.readUInt16LE(offset + 26),
      extraLength = bytes.readUInt16LE(offset + 28),
      name = bytes
        .subarray(offset + 30, offset + 30 + nameLength)
        .toString('utf8'),
      start = offset + 30 + nameLength + extraLength;
    expect(files.has(name)).toBe(false);
    files.set(name, bytes.subarray(start, start + size));
    offset = start + size;
  }
  expect(bytes.readUInt32LE(offset)).toBe(0x02014b50);
  return files;
}
export async function workingEvidenceJourney(page: Page, info: TestInfo) {
  const narrow = info.project.name.endsWith('narrow'),
    suffix = narrow ? 'narrow' : 'desktop';
  const companyId = text(process.env.ACCEPTANCE_PRIMARY_COMPANY_ID),
    membershipId = text(process.env.ACCEPTANCE_PRIMARY_MEMBERSHIP_ID);
  const headers = { ...person, 'x-company-context-id': companyId };
  const grants: string[] = [];
  const authorityRequest = await request.newContext();
  let cleanupFailure: AggregateError | undefined;
  let extracted: string | undefined;
  async function grant(bundle: string) {
    const response = await authorityRequest.post(
      `${origin}/api/company-${bundle}-assignments`,
      {
        headers: { ...owner, 'idempotency-key': randomUUID() },
        data: { companyId, workspaceMembershipId: membershipId },
      },
    );
    expect(response.status()).toBe(201);
    grants.push(bundle);
  }
  async function navigate(name: string) {
    if (narrow)
      await page.getByRole('button', { name: 'Open navigation' }).click();
    await page
      .getByRole('navigation', { name: 'Primary navigation' })
      .getByRole('link', { name, exact: true })
      .click();
  }
  try {
    for (const bundle of [
      'working-evidence-case-reader',
      'working-evidence-case-recorder',
      'received-audit-source-access',
      'document-content-reader',
      'document-content-uploader',
      'document-approver',
    ])
      await grant(bundle);
    const clientName = `Fictional evidence Client ${suffix}`,
      projectTitle = `Fictional evidence Project ${suffix}`,
      sourceTitle = `Fictional received original ${suffix}`,
      caseTitle = `Fictional working statement ${suffix}`;
    const clientResponse = await page.request.post(`${origin}/api/clients`, {
      headers: { ...headers, 'idempotency-key': randomUUID() },
      data: { displayName: clientName },
    });
    expect(clientResponse.status()).toBe(201);
    const clientId = text(object(await clientResponse.json()).id);
    const projectResponse = await page.request.post(`${origin}/api/projects`, {
      headers: { ...headers, 'idempotency-key': randomUUID() },
      data: { title: projectTitle, clientAccountId: clientId },
    });
    expect(projectResponse.status()).toBe(201);
    const original = await readFile(
      new URL(
        '../../api/test-support/fixtures/questionnaire-demo.pdf',
        import.meta.url,
      ),
    );
    await page.goto('/');
    if (narrow)
      await page.getByRole('button', { name: 'Open navigation' }).click();
    await selectOption(page.getByLabel('Active Company', { exact: true }), {
      label: 'PRISMA-PRIM',
    });
    if (narrow)
      await page.getByRole('button', { name: 'Close navigation' }).click();
    await navigate('Working Documents');
    const documents = page.locator('.working-documents');
    await selectOption(documents.getByLabel('Document family'), {
      value: 'received-audit-source',
    });
    await expect(documents.getByLabel('External HTTPS link')).toHaveCount(0);
    await selectOption(documents.getByLabel('Client', { exact: true }), {
      label: clientName,
    });
    await documents.getByLabel('Title', { exact: true }).fill(sourceTitle);
    await documents
      .getByLabel('Purpose', { exact: true })
      .fill('Fictional received original; no professional conclusion');
    const registering = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/documents',
    );
    await documents
      .getByRole('button', { name: 'Register working reference' })
      .focus();
    await page.keyboard.press('Enter');
    expect((await registering).status()).toBe(201);
    await expect(
      documents.getByRole('heading', { name: sourceTitle, exact: true }),
    ).toBeVisible();
    await documents.getByLabel('Choose the PDF file').setInputFiles({
      name: 'fictional-original.pdf',
      mimeType: 'application/pdf',
      buffer: original,
    });
    await documents
      .getByRole('button', { name: 'Preserve PDF', exact: true })
      .click();
    await expect(
      documents.getByText('fictional-original.pdf', { exact: true }),
    ).toBeVisible();
    await documents
      .getByRole('button', { name: 'Designate as official', exact: true })
      .click();
    await documents
      .getByRole('button', { name: 'Confirm official designation' })
      .click();
    await expect(
      documents.getByText('Version 1 is now official.'),
    ).toBeVisible();
    await navigate('Projects');
    const projects = page.locator('.project-workspace');
    await projects
      .getByLabel('Find Projects', { exact: true })
      .fill(projectTitle);
    await projects
      .getByRole('button', {
        name: `${projectTitle} Client: ${clientName}`,
        exact: true,
      })
      .click();
    await projects.getByRole('tab', { name: 'Working Evidence Cases' }).click();
    const cases = projects.locator('section.working-evidence');
    await cases
      .getByRole('button', { name: 'Record working statement' })
      .click();
    await fillCaseField(cases, 'Title', caseTitle);
    await fillCaseField(cases, 'Process', 'Fictional receiving process');
    const literal =
      'Fictional human observation <script>inert()</script> https://example.test/inert';
    await fillCaseField(cases, 'Human working statement', literal);
    await cases.getByRole('button', { name: 'Add support' }).focus();
    await page.keyboard.press('Enter');
    await fillCaseField(
      cases,
      'Support note',
      'Literal fictional support; no certification claim',
    );
    for (const locale of ['ro', 'ru', 'fr', 'en'] as const) {
      await selectOption(page.locator('#interface-locale'), { value: locale });
      await expect(
        cases.getByLabel(
          resolveMessage(workingEvidenceMessages, locale, 'statement'),
        ),
      ).toHaveValue(literal);
      await expect(page.locator('body')).toHaveJSProperty(
        'scrollWidth',
        await page.evaluate(() => document.documentElement.clientWidth),
      );
      await page.screenshot({
        path: info.outputPath(`working-evidence-${suffix}-${locale}-draft.png`),
        fullPage: true,
      });
    }
    const recording = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname.endsWith('/working-evidence-cases'),
    );
    await cases.getByRole('button', { name: 'Save complete revision' }).click();
    const recorded = await recording;
    expect(recorded.status()).toBe(201);
    const receipt = object(await recorded.json()),
      caseId = text(receipt.caseId),
      revisionId = text(receipt.revisionId);
    await expect(cases.getByText('Revision confirmed saved.')).toBeVisible();
    await expect(
      cases.getByRole('article').getByText(literal, { exact: true }),
    ).toBeVisible();
    await cases.getByRole('button', { name: 'Open current revision' }).click();
    await expect(
      cases.getByRole('article').getByText(literal, { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath(`working-evidence-${suffix}-en-current.png`),
      fullPage: true,
    });
    extracted = await mkdtemp(join(tmpdir(), 'fictional-working-evidence-'));
    const statementPath = join(extracted, 'downloaded-statement.html');
    const downloadingStatement = page.waitForEvent('download');
    await cases
      .getByRole('button', { name: 'Download frozen statement' })
      .click();
    await (await downloadingStatement).saveAs(statementPath);
    const statement = await readFile(statementPath);
    const frozenStatement = await authorityRequest.get(
      `${origin}/api/working-evidence-cases/${caseId}/revisions/${revisionId}/statement`,
      { headers },
    );
    expect(frozenStatement.status()).toBe(200);
    expect(await frozenStatement.body()).toEqual(statement);
    expect(statement.toString('utf8')).toContain(
      '&lt;script&gt;inert()&lt;/script&gt;',
    );
    expect(statement.toString('utf8')).not.toContain('<script>');
    const annex = await savedFile(
      page,
      cases.getByRole('button', { name: 'Download original-source annex' }),
    );
    expect(
      await savedFile(
        page,
        cases.getByRole('button', { name: 'Download original-source annex' }),
      ),
    ).toEqual(annex);
    const files = entries(annex),
      pdfNames = [...files.keys()].filter((name) =>
        /^evidence\/[0-9a-f-]{36}\.pdf$/u.test(name),
      );
    expect([...files.keys()]).toEqual([
      'statement.html',
      'index.html',
      ...pdfNames,
    ]);
    expect(pdfNames).toHaveLength(1);
    const pdfName = pdfNames[0];
    if (!pdfName) throw new Error('Missing annex original');
    expect(files.get(pdfName)).toEqual(original);
    for (const [name, bytes] of files) {
      expect(
        name === 'statement.html' ||
          name === 'index.html' ||
          /^evidence\/[0-9a-f-]{36}\.pdf$/u.test(name),
      ).toBe(true);
      await mkdir(join(extracted, 'evidence'), { recursive: true });
      await writeFile(join(extracted, name), bytes);
    }
    const offline = await page.context().newPage();
    await offline.goto(pathToFileURL(join(extracted, 'index.html')).href);
    const annexLink = offline.locator(`a[href="${pdfName}"]`).first();
    await expect(annexLink).toBeVisible();
    await expect(annexLink).toHaveAttribute('href', pdfName);
    expect(await savedFile(offline, annexLink)).toEqual(original);
    await offline.close();
    const appOrigin = new URL(page.url()).origin;
    const standalone = await page.context().newPage();
    await standalone.goto(pathToFileURL(statementPath).href);
    const standaloneLink = standalone
      .locator(
        `a[href^="${appOrigin}/#working-evidence/${caseId}/${revisionId}/"]`,
      )
      .first();
    await expect(standaloneLink).toBeVisible();
    await standaloneLink.click();
    await expect(standalone).toHaveURL(
      (url) =>
        url.origin === appOrigin &&
        url.pathname === '/' &&
        url.hash.startsWith(`#working-evidence/${caseId}/${revisionId}/`),
    );
    if (narrow) {
      const navigation = standalone.getByRole('button', {
        name: 'Open navigation',
      });
      await expect(navigation).toBeVisible();
      await navigation.click();
    }
    await selectOption(
      standalone.getByLabel('Active Company', { exact: true }),
      { label: 'PRISMA-PRIM' },
    );
    if (narrow)
      await standalone
        .getByRole('button', { name: 'Close navigation' })
        .click();
    const standaloneResolver = standalone.getByRole('region', {
      name: 'Open exact original PDF',
      exact: true,
    });
    await expect(standaloneResolver).toBeVisible();
    const standaloneButton = standaloneResolver.getByRole('button', {
      name: 'Open exact original PDF',
      exact: true,
    });
    await expect(standaloneButton).toBeEnabled();
    const standaloneRequest = standalone.waitForRequest((request) =>
      new URL(request.url()).pathname.startsWith(
        `/api/working-evidence-cases/${caseId}/revisions/${revisionId}/evidence/`,
      ),
    );
    expect(await savedFile(standalone, standaloneButton)).toEqual(original);
    expect((await standaloneRequest).headers()['x-company-context-id']).toBe(
      companyId,
    );
    await standalone.screenshot({
      path: info.outputPath(
        `working-evidence-${suffix}-standalone-authenticated-resolver.png`,
      ),
      fullPage: true,
    });
    await standalone.close();
    await cases.getByRole('button', { name: 'Open frozen statement' }).click();
    const online = page.frameLocator('iframe[title="Open frozen statement"]');
    const onlineLink = online
      .locator(
        `a[href^="${appOrigin}/#working-evidence/${caseId}/${revisionId}/"]`,
      )
      .first();
    await expect(onlineLink).toBeVisible();
    const href = text(await onlineLink.getAttribute('href'));
    await onlineLink.click();
    await expect(page).toHaveURL(
      new RegExp(`#working-evidence/${caseId}/${revisionId}/`, 'u'),
    );
    const requested = page.waitForRequest((request) =>
      new URL(request.url()).pathname.endsWith(
        `/evidence/${href.split('/').at(-1)}`,
      ),
    );
    const resolver = page.getByRole('region', {
      name: 'Open exact original PDF',
      exact: true,
    });
    await expect(resolver).toBeVisible();
    expect(
      await savedFile(
        page,
        resolver.getByRole('button', {
          name: 'Open exact original PDF',
          exact: true,
        }),
      ),
    ).toEqual(original);
    expect((await requested).headers()['x-company-context-id']).toBe(companyId);
    await page.screenshot({
      path: info.outputPath(
        `working-evidence-${suffix}-authenticated-resolver.png`,
      ),
      fullPage: true,
    });
    await navigate('Projects');
    await projects.getByRole('tab', { name: 'Working Evidence Cases' }).click();
    await cases
      .getByRole('button', { name: 'Correct complete revision' })
      .click();
    await fillCaseField(
      cases,
      'Human working statement',
      'Fictional corrected human observation',
    );
    await fillCaseField(
      cases,
      'Correction reason',
      'Fictional correction preserving prior words',
    );
    await page.screenshot({
      path: info.outputPath(`working-evidence-${suffix}-en-correction.png`),
      fullPage: true,
    });
    const correcting = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname.endsWith('/corrections'),
    );
    await cases.getByRole('button', { name: 'Save complete revision' }).click();
    expect((await correcting).status()).toBe(201);
    await expect(cases.getByText('Revision confirmed saved.')).toBeVisible();
    await expect(
      cases
        .getByRole('article')
        .getByText('Fictional corrected human observation', { exact: true }),
    ).toBeVisible();
    await cases.getByRole('button', { name: 'Open current revision' }).click();
    await expect(
      cases
        .getByRole('article')
        .getByText('Fictional corrected human observation', { exact: true }),
    ).toBeVisible();
    await cases.getByRole('button', { name: 'Revision history' }).click();
    await cases.getByRole('button', { name: /^Revision 1 ·/u }).click();
    await expect(
      cases.getByRole('article').getByText(literal, { exact: true }),
    ).toBeVisible();
    expect(
      await savedFile(
        page,
        cases.getByRole('button', { name: 'Download frozen statement' }),
      ),
    ).toEqual(statement);
    expect(
      await savedFile(
        page,
        cases.getByRole('button', { name: 'Download original-source annex' }),
      ),
    ).toEqual(annex);
    await page.screenshot({
      path: info.outputPath(`working-evidence-${suffix}-immutable-history.png`),
      fullPage: true,
    });
    for (const locale of ['ro', 'ru', 'fr'] as const) {
      await selectOption(page.locator('#interface-locale'), { value: locale });
      const message = (key: (typeof workingEvidenceMessages.keys)[number]) =>
        resolveMessage(workingEvidenceMessages, locale, key);
      const localizedTitle = `Fictional localized Case ${suffix} ${locale}`;
      const initialWords = `Fictional initial human observation ${locale}`;
      const correctedWords = `Fictional corrected human observation ${locale}`;
      await cases.getByRole('button', { name: message('create') }).click();
      await fillCaseField(cases, message('caseTitle'), localizedTitle);
      await fillCaseField(
        cases,
        message('process'),
        'Fictional receiving process',
      );
      await fillCaseField(cases, message('statement'), initialWords);
      await cases
        .getByRole('button', { name: message('add'), exact: true })
        .click();
      await fillCaseField(
        cases,
        message('supportNote'),
        'Fictional localized support',
      );
      await expect(
        cases.getByRole('combobox', { name: message('source'), exact: true }),
      ).toContainText(`${sourceTitle} · ${message('revision')} 1`);
      const localizedRecording = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          new URL(response.url()).pathname.endsWith('/working-evidence-cases'),
      );
      await cases
        .getByRole('button', { name: message('save'), exact: true })
        .click();
      expect((await localizedRecording).status()).toBe(201);
      await expect(
        cases.getByText(message('confirmed'), { exact: true }),
      ).toBeVisible();
      await expect(
        cases.getByRole('article').getByText(initialWords, { exact: true }),
      ).toBeVisible();
      await cases
        .getByRole('button', { name: message('current'), exact: true })
        .click();
      await expect(
        cases.getByRole('article').getByText(initialWords, { exact: true }),
      ).toBeVisible();
      await cases
        .getByRole('button', { name: message('statementOpen'), exact: true })
        .click();
      await expect(
        cases.getByTitle(message('statementOpen'), { exact: true }),
      ).toBeVisible();
      await expect(page.locator('body')).toHaveJSProperty(
        'scrollWidth',
        await page.evaluate(() => document.documentElement.clientWidth),
      );
      await page.screenshot({
        path: info.outputPath(
          `working-evidence-${suffix}-${locale}-current.png`,
        ),
        fullPage: true,
      });
      await cases
        .getByRole('button', { name: message('correct'), exact: true })
        .click();
      await fillCaseField(cases, message('statement'), correctedWords);
      await fillCaseField(
        cases,
        message('reason'),
        'Fictional complete localized correction',
      );
      await page.screenshot({
        path: info.outputPath(
          `working-evidence-${suffix}-${locale}-correction.png`,
        ),
        fullPage: true,
      });
      const localizedCorrection = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          new URL(response.url()).pathname.endsWith('/corrections'),
      );
      await cases
        .getByRole('button', { name: message('save'), exact: true })
        .click();
      expect((await localizedCorrection).status()).toBe(201);
      await expect(
        cases.getByText(message('confirmed'), { exact: true }),
      ).toBeVisible();
      await expect(
        cases.getByRole('article').getByText(correctedWords, { exact: true }),
      ).toBeVisible();
      await cases
        .getByRole('button', { name: message('current'), exact: true })
        .click();
      await expect(
        cases.getByRole('article').getByText(correctedWords, { exact: true }),
      ).toBeVisible();
      await cases
        .getByRole('button', { name: message('history'), exact: true })
        .click();
      await cases
        .getByRole('button')
        .filter({ hasText: `${message('revision')} 1 ·` })
        .click();
      await expect(
        cases.getByRole('article').getByText(initialWords, { exact: true }),
      ).toBeVisible();
      expect(
        await savedFile(
          page,
          cases.getByRole('button', { name: message('open'), exact: true }),
        ),
      ).toEqual(original);
      expect(
        (
          await savedFile(
            page,
            cases.getByRole('button', {
              name: message('statementDownload'),
              exact: true,
            }),
          )
        ).byteLength,
      ).toBeGreaterThan(0);
      expect(
        (
          await savedFile(
            page,
            cases.getByRole('button', {
              name: message('annexDownload'),
              exact: true,
            }),
          )
        ).byteLength,
      ).toBeGreaterThan(0);
      await expect(page.locator('body')).toHaveJSProperty(
        'scrollWidth',
        await page.evaluate(() => document.documentElement.clientWidth),
      );
      await page.screenshot({
        path: info.outputPath(
          `working-evidence-${suffix}-${locale}-history.png`,
        ),
        fullPage: true,
      });
    }
  } finally {
    const cleanupFailures: unknown[] = [];
    for (const bundle of grants.reverse()) {
      try {
        const response = await authorityRequest.delete(
          `${origin}/api/company-${bundle}-assignments/${membershipId}/${companyId}`,
          { headers: { ...owner, 'idempotency-key': randomUUID() } },
        );
        expect(response.status()).toBe(200);
      } catch (error: unknown) {
        cleanupFailures.push(error);
      }
    }
    if (extracted) {
      try {
        await rm(extracted, { recursive: true, force: true });
      } catch (error: unknown) {
        cleanupFailures.push(error);
      }
    }
    try {
      await authorityRequest.dispose();
    } catch (error: unknown) {
      cleanupFailures.push(error);
    }
    if (cleanupFailures.length) {
      try {
        await info.attach('working-evidence-owned-cleanup-errors', {
          contentType: 'text/plain',
          body: Buffer.from(
            cleanupFailures.map((error) => String(error)).join('\n'),
          ),
        });
      } catch (error: unknown) {
        cleanupFailures.push(error);
      }
      cleanupFailure = new AggregateError(
        cleanupFailures,
        'Owned fictional Case fixture cleanup failed.',
      );
    }
  }
  if (cleanupFailure) throw cleanupFailure;
}
