import { createHash } from 'node:crypto';
import { strToU8, zipSync } from 'fflate';
import { expect, test, type Page } from '@playwright/test';
import { prepareDossier } from './dossier-analysis.acceptance-fixture';
import { selectOption } from './select-option';

test('an editor preserves exact originals and deliberately resumes a partially failed native batch', async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  const narrow = info.project.name.endsWith('narrow'),
    locale = narrow ? 'ru' : 'ro';
  const fixture = await prepareDossier(
    page.request,
    narrow ? 'Intake Narrow' : 'Intake Desktop',
  );
  const copy = narrow
    ? {
        open: 'Импортировать PDF / Word',
        panel: 'Импорт файлов с возобновлением',
        files: 'Выбрать файлы PDF / Word',
        consent: 'Я проверил проект, клиента, язык и сведения о документах.',
        register: 'Зарегистрировать проверенный пакет',
        resume: 'Начать / возобновить импорт',
        pause: 'Приостановить импорт',
        paused: 'Приостановлено',
        complete: 'Оригинал сохранён и выбран',
        failed: 'Оригинал отклонён или не читается',
        reopen: 'Открыть пакет',
        reselect: 'Повторно выбрать оригинал',
        wrong: 'Это другой файл.',
        ready: 'Точный оригинал проверен на этой странице.',
        skip: 'Отложить этот файл',
        done: 'Пакет обработан',
        language: 'Язык документов',
      }
    : {
        open: 'Importă fișiere PDF / Word',
        panel: 'Import de fișiere cu reluare',
        files: 'Alege fișiere PDF / Word',
        consent:
          'Am verificat proiectul, clientul, limba și datele documentelor.',
        register: 'Înregistrează lotul verificat',
        resume: 'Pornește / reia importul',
        pause: 'Pune importul în pauză',
        paused: 'În pauză',
        complete: 'Original păstrat și selectat',
        failed: 'Original refuzat sau ilizibil',
        reopen: 'Redeschide lotul',
        reselect: 'Alege din nou originalul',
        wrong: 'Acesta este alt fișier.',
        ready: 'Originalul exact este verificat în această pagină.',
        skip: 'Lasă acest fișier deoparte',
        done: 'Lot procesat',
        language: 'Limba documentelor',
      };
  async function openProject() {
    await page.goto('/');
    if (narrow)
      await page.getByRole('button', { name: 'Open navigation' }).click();
    await selectOption(
      page.getByRole('combobox', { name: 'Active Company', exact: true }),
      fixture.companyId,
    );
    await page
      .getByRole('navigation', { name: 'Primary navigation' })
      .getByRole('link', { name: 'Projects', exact: true })
      .click();
    await page
      .locator('.project-workspace')
      .getByRole('list', { name: 'Projects', exact: true })
      .getByRole('button')
      .filter({ hasText: fixture.title })
      .click();
    await page.getByRole('tab', { name: 'Dossier analysis' }).focus();
    await page.keyboard.press('Enter');
    await selectOption(
      page.getByRole('combobox', { name: 'Interface language', exact: true }),
      locale,
    );
    await page.getByRole('button', { name: copy.open }).click();
  }
  await openProject();
  const panel = page.getByRole('region', { name: copy.panel });
  await selectOption(
    panel.getByRole('combobox', { name: copy.language }),
    locale,
  );
  const later = Buffer.from(
    zipSync({
      '[Content_Types].xml': strToU8(
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
      ),
      '_rels/.rels': strToU8(
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="root" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
      ),
      'word/document.xml': strToU8(
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Denumire juridică: Firma Fictivă SRL</w:t></w:r></w:p><w:p><w:r><w:t>Адрес: ул. Учебная 1454</w:t></w:r></w:p></w:body></w:document>',
      ),
    }),
  );
  const wordMime =
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const invalid = Buffer.from('PK\u0003\u0004not an OPC Word file');
  let interrupted = false;
  // Fault only the transport of this original, leaving all business responses native.
  await page.route('**/intake-batches/*/items/*/content?*', async (route) => {
    if (!interrupted && route.request().postDataBuffer()?.equals(later)) {
      interrupted = true;
      await route.abort('connectionreset');
    } else await route.continue();
  });
  await panel.getByLabel(copy.files).setInputFiles([
    {
      name: 'audit-ru.pdf',
      mimeType: 'application/pdf',
      buffer: fixture.bytes,
    },
    { name: 'tabel-ro.docx', mimeType: wordMime, buffer: fixture.docx },
    { name: 'broken.docx', mimeType: wordMime, buffer: invalid },
    { name: 'resume-ru-ro.docx', mimeType: wordMime, buffer: later },
    { name: 'duplicate.docx', mimeType: wordMime, buffer: fixture.docx },
    {
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Fictional excluded file'),
    },
  ]);
  await expect(
    panel.getByText('resume-ru-ro.docx', { exact: true }),
  ).toBeVisible();
  await selectOption(
    panel
      .locator('fieldset ol > li')
      .nth(0)
      .getByRole('combobox', { name: copy.language }),
    'ru',
  );
  await selectOption(
    panel
      .locator('fieldset ol > li')
      .nth(1)
      .getByRole('combobox', { name: copy.language }),
    'ro',
  );
  await panel.getByLabel(copy.consent).check();
  const admission = page.waitForResponse(
    (response) =>
      response.url().endsWith('/intake-batches') &&
      response.request().method() === 'POST',
  );
  await panel.getByRole('button', { name: copy.register }).click();
  expect((await admission).status()).toBe(201);
  await panel.getByRole('button', { name: copy.resume }).click();
  await expect(panel.getByRole('button', { name: copy.resume })).toBeEnabled({
    timeout: 30_000,
  });
  await expect(panel.getByText(copy.complete, { exact: true })).toHaveCount(2);
  expect(interrupted).toBe(true);
  await expect(panel.getByText(copy.failed, { exact: false })).toBeVisible();
  await panel.getByRole('button', { name: copy.pause }).click();
  await expect(panel.getByRole('status')).toContainText(copy.paused);
  await capturePanel(page, panel, info.outputPath('intake-partial-paused.png'));
  // A new page lifetime deliberately has no in-memory File handles.
  await page.addInitScript(() =>
    localStorage.setItem('prisma-prim.interface-locale', 'en'),
  );
  await openProject();
  await panel.getByRole('button', { name: new RegExp(copy.reopen) }).click();
  await expect(panel.getByText(copy.complete, { exact: true })).toHaveCount(2);
  const remaining = panel
    .locator('[data-intake-item]')
    .filter({ has: page.getByText('resume-ru-ro.docx', { exact: true }) });
  await remaining.getByLabel(copy.reselect).setInputFiles({
    name: 'resume-ru-ro.docx',
    mimeType: wordMime,
    buffer: fixture.docx,
  });
  await expect(panel.getByRole('alert')).toContainText(copy.wrong);
  await remaining.getByLabel(copy.reselect).setInputFiles({
    name: 'resume-ru-ro.docx',
    mimeType: wordMime,
    buffer: later,
  });
  await expect(remaining.getByText(copy.ready)).toBeVisible();
  await panel.getByRole('button', { name: copy.resume }).click();
  await expect(panel.getByText(copy.complete, { exact: true })).toHaveCount(3);
  await expect(panel.getByRole('button', { name: copy.resume })).toBeEnabled({
    timeout: 30_000,
  });
  for (const name of ['broken.docx', 'duplicate.docx'])
    await panel
      .locator('[data-intake-item]')
      .filter({ has: page.getByText(name, { exact: true }) })
      .getByRole('button', { name: copy.skip })
      .click();
  await expect(panel.getByRole('status')).toContainText(copy.done);
  await expect(panel.locator('[data-intake-item]')).toHaveCount(6);
  const headers = {
    'x-test-external-provider': 'local-demo',
    'x-test-external-subject': 'local-demonstration-user',
    'x-test-display-name': 'Ada Ionescu',
    'x-test-email': 'ada@example.test',
    'x-company-context-id': fixture.companyId,
  };
  const base = `http://127.0.0.1:4174/api/projects/${fixture.projectId}/dossier-analysis`;
  const list = await page.request.get(`${base}/intake-batches`, { headers });
  expect(list.status()).toBe(200);
  const batches = records(object(await list.json()).items),
    current = batches[0];
  if (!current) throw new Error('Missing native batch.');
  const items = records(current.items),
    originals = new Map([
      ['audit-ru.pdf', fixture.bytes],
      ['tabel-ro.docx', fixture.docx],
      ['resume-ru-ro.docx', later],
    ]);
  const proof: {
    fileName: string;
    sha256: string;
    documentId: string;
    sourceId: string;
  }[] = [];
  for (const item of items) {
    const file = object(item.file),
      expected =
        typeof file.fileName === 'string'
          ? originals.get(file.fileName)
          : undefined;
    if (!expected) continue;
    const progress = object(item.progress),
      target = object(progress.target);
    expect(progress.stage).toBe('complete');
    const downloaded = await page.request.get(
      `${base}/sources/${string(progress.sourceId)}/original`,
      { headers },
    );
    expect(downloaded.status()).toBe(200);
    expect(await downloaded.body()).toEqual(expected);
    const native = await page.request.get(
      `http://127.0.0.1:4174/api/documents/${string(target.documentId)}`,
      { headers },
    );
    expect(object(object(await native.json()).version).status).toBe('draft');
    if (file.kind === 'pdf') {
      const history = await page.request.get(
        `http://127.0.0.1:4174/api/documents/${string(target.documentId)}/versions/${string(target.versionId)}/content/history`,
        { headers },
      );
      expect(records(object(await history.json()).uploads)).toHaveLength(1);
    }
    proof.push({
      fileName: string(file.fileName),
      sha256: createHash('sha256').update(expected).digest('hex'),
      documentId: string(target.documentId),
      sourceId: string(progress.sourceId),
    });
  }
  expect(proof).toHaveLength(3);
  await info.attach('native-intake-proof', {
    body: JSON.stringify(
      {
        locale,
        batchId: current.id,
        admittedItems: 6,
        completedOriginals: proof,
        syntheticTransportInterruption: interrupted,
      },
      null,
      2,
    ),
    contentType: 'application/json',
  });
  await capturePanel(
    page,
    panel,
    info.outputPath('intake-resumed-complete.png'),
  );
  expect(
    await page.evaluate(() => Object.values(localStorage).join('\n')),
  ).not.toContain('resume-ru-ro.docx');
});

function object(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected public record.');
  return Object.fromEntries(Object.entries(value));
}
function records(value: unknown) {
  if (!Array.isArray(value)) throw new Error('Expected public list.');
  const rows: unknown[] = value;
  return rows.map(object);
}
function string(value: unknown) {
  if (typeof value !== 'string' || !value)
    throw new Error('Expected public identity.');
  return value;
}
async function capturePanel(
  page: Page,
  panel: ReturnType<Page['getByRole']>,
  path: string,
) {
  await panel.scrollIntoViewIfNeeded();
  await panel.locator('h3').click();
  await panel.screenshot({ path, animations: 'disabled' });
  await expect(page.locator('body')).toBeVisible();
}
