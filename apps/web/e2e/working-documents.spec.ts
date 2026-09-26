import { expect, test } from '@playwright/test';
import {
  actorContextFixture,
  operationalHomeFixture,
} from './actor-context.fixture';

test('registers and reopens a Company-confidential working reference', async ({
  page,
}, testInfo) => {
  const company = { id: 'company-documents', displayName: 'PRISMA-PRIM' };
  const client = { id: 'client-documents', displayName: 'Synthetic Client' };
  const document = {
    id: 'document-239',
    companyId: company.id,
    clientId: client.id,
    clientDisplayName: client.displayName,
    title: 'Initial assessment questionnaire',
    purpose: 'Prepare the assessment',
    type: 'questionnaire',
    confidentiality: 'company-confidential',
    createdAt: '2026-09-19T00:00:00.000Z',
    workingRevision: 1,
    correction: 'allowed',
    version: {
      id: 'version-239',
      status: 'draft',
      representation: {
        id: 'representation-239',
        kind: 'external-reference',
        verification: 'unverified',
        access: 'granted',
        url: 'https://example.test/questionnaire',
      },
    },
  };
  let saved = false;
  let denied = false;
  let loadError = false;
  let correctionConflict = false;
  let currentDocument = document;
  const correctionRequests: Array<{ body: unknown; key: string | undefined }> =
    [];
  let historyReads = 0;
  const recordedCorrection = {
    revision: 2,
    occurredAt: '2026-09-19T01:00:00.000Z',
    actor: { displayName: 'Document Registrar' },
    changes: {
      title: {
        before: document.title,
        after: 'Corrected assessment questionnaire',
      },
      purpose: {
        before: document.purpose,
        after: 'Prepare the corrected assessment',
      },
      url: {
        before: document.version.representation.url,
        after: 'https://example.test/corrected-questionnaire',
      },
    },
  };
  await page.route('**/api/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith(`/documents/${document.id}/correction-history`)) {
      historyReads += 1;
      expect(request.headers()['x-company-context-id']).toBe(company.id);
      return route.fulfill({
        json: {
          corrections:
            currentDocument.workingRevision >= 2 ? [recordedCorrection] : [],
          nextBeforeRevision: null,
        },
      });
    }
    if (path.endsWith('/access/current-actor'))
      return route.fulfill({
        json: {
          ...actorContextFixture,
          workspacePermissions: [],
          ...(request.headers()['x-company-context-id']
            ? {
                activeCompany: {
                  ...company,
                  clientPermissions: ['client.read'],
                  documentPermissions: [
                    'document.read',
                    'document.register',
                    'document.reference.read',
                    'document.correct',
                  ],
                },
              }
            : {}),
        },
      });
    if (path.endsWith('/companies')) return route.fulfill({ json: [company] });
    if (path.endsWith('/operational-home'))
      return route.fulfill({
        json: operationalHomeFixture(company.id, { active_clients: 1 }),
      });
    if (path.endsWith('/activity-log'))
      return route.fulfill({
        json: {
          events:
            saved && !denied
              ? [
                  ...(currentDocument.workingRevision === 2
                    ? [
                        {
                          id: 'event-250',
                          action: 'document.corrected',
                          occurredAt: '2026-09-19T01:00:00.000Z',
                          actor: {
                            internalUserId: actorContextFixture.internalUserId,
                            displayName: 'Document Registrar',
                          },
                          target: {
                            type: 'document',
                            documentId: document.id,
                            documentTitle: currentDocument.title,
                            companyId: company.id,
                          },
                          metadata: {},
                        },
                      ]
                    : []),
                  {
                    id: 'event-239',
                    action: 'document.registered',
                    occurredAt: document.createdAt,
                    actor: {
                      internalUserId: actorContextFixture.internalUserId,
                      displayName: 'Document Registrar',
                    },
                    target: {
                      type: 'document',
                      documentId: document.id,
                      documentTitle: currentDocument.title,
                      companyId: company.id,
                    },
                    metadata: {},
                  },
                ]
              : [],
        },
      });
    if (path.endsWith('/clients')) return route.fulfill({ json: [client] });
    if (path.includes('/documents')) {
      if (denied) return route.fulfill({ status: 403 });
      if (loadError) return route.fulfill({ status: 500 });
      if (request.method() === 'POST') {
        expect(request.headers()['x-company-context-id']).toBe(company.id);
        expect(request.headers()['idempotency-key']).toBeTruthy();
        expect(request.postDataJSON()).toEqual({
          clientId: client.id,
          title: document.title,
          purpose: document.purpose,
          url: document.version.representation.url,
        });
        saved = true;
        return route.fulfill({ status: 201, json: document });
      }
      if (request.method() === 'PATCH') {
        correctionRequests.push({
          body: request.postDataJSON(),
          key: request.headers()['idempotency-key'],
        });
        if (correctionConflict) return route.fulfill({ status: 409 });
        currentDocument = {
          ...document,
          title: 'Corrected assessment questionnaire',
          purpose: 'Prepare the corrected assessment',
          workingRevision: 2,
          version: {
            ...document.version,
            representation: {
              ...document.version.representation,
              url: 'https://example.test/corrected-questionnaire',
            },
          },
        };
        if (correctionRequests.length === 1)
          return route.fulfill({ status: 500 });
        return route.fulfill({
          json: { documentId: document.id, revision: 2, outcome: 'corrected' },
        });
      }
      return route.fulfill({
        json: path.endsWith('/documents')
          ? saved
            ? [currentDocument]
            : []
          : currentDocument,
      });
    }
    return route.fulfill({ status: 404 });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?frame=prisme#documents');
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByLabel('Active Company', { exact: true })
    .selectOption(company.id);
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Close navigation' }).click();
  await expect(
    page.getByText('No working references registered yet.'),
  ).toBeVisible();
  const workspace = page.getByRole('region', { name: 'Working Documents' });
  await expect(workspace).toHaveClass(/working-documents--prisme/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('documents-empty.png'),
    fullPage: true,
  });
  await page.getByLabel('Client', { exact: true }).selectOption(client.id);
  await page.getByLabel('Title', { exact: true }).fill(document.title);
  await page.getByLabel('Purpose', { exact: true }).fill(document.purpose);
  await page
    .getByLabel('External HTTPS link')
    .fill(document.version.representation.url);
  const register = page.getByRole('button', {
    name: 'Register working reference',
  });
  await page.keyboard.press('Tab');
  await expect(register).toBeFocused();
  expect(
    await register.evaluate(
      (element) => getComputedStyle(element).outlineStyle,
    ),
  ).toBe('solid');
  expect(
    await register.evaluate(
      (element) => getComputedStyle(element).outlineColor,
    ),
  ).toBe('rgb(121, 98, 237)');
  await register.click();
  await expect(
    page.getByRole('heading', { name: document.title }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Open external reference' }),
  ).toHaveAttribute('rel', 'noopener noreferrer');
  await page.reload();
  await page.getByRole('button', { name: document.title }).click();
  await expect(
    page.getByText('Draft questionnaire · Company-confidential'),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('documents-reopened.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Edit reference' }).click();
  await page
    .getByLabel('Title', { exact: true })
    .fill('Corrected assessment questionnaire');
  await page
    .locator('article textarea')
    .fill('Prepare the corrected assessment');
  await page
    .getByLabel('External HTTPS link')
    .fill('https://example.test/corrected-questionnaire');
  await page.getByRole('button', { name: 'Save correction' }).click();
  await expect(page.getByRole('alert')).toContainText('result is uncertain');
  await page.getByRole('button', { name: 'Retry same correction' }).click();
  await expect(
    page.getByRole('heading', { name: 'Corrected assessment questionnaire' }),
  ).toBeVisible();
  expect(correctionRequests).toHaveLength(2);
  expect(correctionRequests[0]).toEqual(correctionRequests[1]);
  await page.screenshot({
    path: testInfo.outputPath('documents-corrected.png'),
    fullPage: true,
  });
  // The history is read from the persisted ledger after reopening the detail.
  await page.reload();
  await page
    .getByRole('button', { name: 'Corrected assessment questionnaire' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Corrected assessment questionnaire' }),
  ).toBeVisible();
  const historyToggle = page.getByRole('button', {
    name: 'Show reference correction history',
  });
  await expect(historyToggle).toHaveAttribute('aria-expanded', 'false');
  expect(historyReads).toBe(0);
  await historyToggle.focus();
  await page.keyboard.press('Enter');
  const history = page.getByRole('region', {
    name: 'Correction history',
    exact: true,
  });
  const entry = history
    .getByRole('list', { name: 'Reference corrections, newest first' })
    .getByRole('listitem');
  await expect(entry).toHaveCount(1);
  await expect(
    entry.getByText('Working revision 2', { exact: true }),
  ).toBeVisible();
  await expect(entry).toContainText('Corrected by Document Registrar');
  await expect(entry.locator('time')).toHaveAttribute(
    'datetime',
    recordedCorrection.occurredAt,
  );
  await expect(entry).toContainText(
    `${document.title} → changed to Corrected assessment questionnaire`,
  );
  await expect(entry).toContainText(
    `${document.version.representation.url} → changed to https://example.test/corrected-questionnaire`,
  );
  // Recorded references stay inert text inside the history.
  await expect(history.getByRole('link')).toHaveCount(0);
  expect(historyReads).toBe(1);
  expect(
    await page.evaluate(
      () => window.document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await history.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath('documents-correction-history.png'),
    fullPage: true,
  });
  // Classic presents the same open history with the same keyboard controls.
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Use classic frame' }).click();
  const classicHistory = page
    .locator('#documents article')
    .getByRole('region', { name: 'Correction history', exact: true });
  const classicToggle = classicHistory.getByRole('button', {
    name: /reference correction history$/u,
  });
  await expect(classicToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(
    classicHistory.getByText('Working revision 2', { exact: true }),
  ).toBeVisible();
  await expect(classicHistory.getByRole('listitem')).toContainText(
    `${document.purpose} → changed to Prepare the corrected assessment`,
  );
  await classicToggle.focus();
  await page.keyboard.press('Enter');
  await expect(classicToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(classicHistory.getByRole('listitem')).toHaveCount(0);
  await expect(classicToggle).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(classicHistory.getByRole('listitem')).toHaveCount(1);
  expect(historyReads).toBe(2);
  expect(
    await page.evaluate(
      () => window.document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await classicHistory.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath('documents-correction-history-classic.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Try Prisme' }).click();
  await expect(history.getByRole('listitem')).toHaveCount(1);
  await page.getByRole('button', { name: 'Edit reference' }).click();
  await page
    .getByLabel('Title', { exact: true })
    .fill('Competing correction intention');
  // Reading history again leaves the open correction draft untouched.
  await page
    .getByRole('button', { name: 'Hide reference correction history' })
    .click();
  await page
    .getByRole('button', { name: 'Show reference correction history' })
    .click();
  await expect(entry).toHaveCount(1);
  expect(historyReads).toBe(3);
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(
    'Competing correction intention',
  );
  correctionConflict = true;
  await page.getByRole('button', { name: 'Save correction' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'This reference changed. Reload it before correcting it again.',
  );
  await expect(
    page.getByRole('button', { name: 'Edit reference' }),
  ).toHaveCount(0);
  correctionConflict = false;
  currentDocument = {
    ...currentDocument,
    title: 'Concurrent server correction',
    workingRevision: 3,
  };
  await page.getByRole('button', { name: 'Reload reference' }).click();
  await expect(
    page.getByRole('heading', { name: currentDocument.title }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Edit reference' }),
  ).toBeEnabled();
  loadError = true;
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('could not be loaded');
  loadError = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(
    page.getByRole('button', { name: currentDocument.title }),
  ).toBeVisible();
  denied = true;
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('do not have access');
  await page.screenshot({
    path: testInfo.outputPath('documents-denied.png'),
    fullPage: true,
  });
});
