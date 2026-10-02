import { expectSelectAppearance } from './select-appearance';
import { enterClassicCompatibility } from './classic-compatibility';
import { expectValue, selectOption } from './select-option';
import { expect, test } from '@playwright/test';
import {
  actorContextFixture,
  operationalHomeFixture,
} from './actor-context.fixture';
import {
  DOCUMENT_VERSIONS_PATH,
  draftVersionsOf,
} from './document-versions.fixture';

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
    if (DOCUMENT_VERSIONS_PATH.test(path))
      return route.fulfill({ json: draftVersionsOf(currentDocument) });
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
  await selectOption(
    page.getByLabel('Active Company', { exact: true }),
    company.id,
  );
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
  const clientSelect = page.getByLabel('Client', { exact: true });
  await expectSelectAppearance(clientSelect);
  const registrationForm = clientSelect.locator('xpath=ancestor::form');
  expect(
    await registrationForm.evaluate((form: HTMLFormElement) =>
      form.checkValidity(),
    ),
  ).toBe(false);
  await registrationForm.evaluate((form: HTMLFormElement) =>
    form.requestSubmit(),
  );
  await expect(clientSelect).toBeFocused();

  await selectOption(clientSelect, client.id);
  await registrationForm.evaluate((form: HTMLFormElement) =>
    form.requestSubmit(),
  );
  await expect(page.getByLabel('Title', { exact: true })).toBeFocused();
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
  await enterClassicCompatibility(page);
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
  await expectValue(
    page.getByLabel('Title', { exact: true }),
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

test('designates official Versions, starts and corrects a new draft and keeps the superseded Version readable', async ({
  page,
}, testInfo) => {
  const company = { id: 'company-versions', displayName: 'PRISMA-PRIM' };
  const client = { id: 'client-versions', displayName: 'GRUP Demo SA' };
  const documentId = 'document-400';
  const firstTitle = 'Chestionar de evaluare inițială — GRUP Demo SA';
  const purpose = 'Evaluate the initial situation of GRUP Demo SA';
  const firstUrl = 'https://example.test/demo/chestionar-v1.docx';
  const secondTitle =
    'Chestionar de evaluare inițială — GRUP Demo SA — versiune corectată cu observațiile primite de la client';
  const secondUrl = `https://example.test/demo/${'segment-foarte-lung-'.repeat(8)}chestionar-v2.docx`;
  const renderedUrl = 'https://example.test/demo/chestionar-v1.pdf';
  const signedUrl = 'https://example.test/demo/chestionar-v1-semnat.pdf';
  interface StoredReference {
    id: string;
    position: number;
    form: 'editable' | 'rendered' | 'signed' | 'other';
    appendedAfterDesignation: boolean;
    addedAt: string;
    url: string;
  }
  interface StoredVersion {
    id: string;
    number: number;
    status: 'draft' | 'official' | 'superseded';
    createdAt: string;
    references: StoredReference[];
    designatedAt?: string;
    frozen?: { title: string; purpose: string };
    supersededAt?: string;
    supersededByVersionNumber?: number;
  }
  const server = {
    registered: false,
    title: firstTitle,
    workingRevision: 1,
    versions: [] as StoredVersion[],
    commands: [] as Array<{ path: string; body: unknown }>,
  };
  const at = (minute: number) =>
    `2026-09-26T08:${String(minute).padStart(2, '0')}:00.000Z`;
  const reference = (stored: StoredReference, index: number) => ({
    id: stored.id,
    kind: 'external-reference',
    verification: 'unverified',
    position: stored.position,
    form: stored.form,
    primary: index === 0,
    appendedAfterDesignation: stored.appendedAfterDesignation,
    addedAt: stored.addedAt,
    addedBy: { displayName: 'Document Registrar' },
    access: 'granted',
    url: stored.url,
  });
  const working = () =>
    server.versions.find((version) => version.status === 'draft') ??
    server.versions.find((version) => version.status === 'official');
  const detail = () => {
    const version = working();
    if (!version) throw new Error('Expected a working Version.');
    const primary = version.references[0];
    if (!primary) throw new Error('Expected a primary reference.');
    return {
      id: documentId,
      companyId: company.id,
      clientId: client.id,
      clientDisplayName: client.displayName,
      title: server.title,
      purpose,
      type: 'questionnaire',
      confidentiality: 'company-confidential',
      createdAt: at(0),
      workingRevision: server.workingRevision,
      correction: version.status === 'draft' ? 'allowed' : 'read-only',
      version: {
        id: version.id,
        status: version.status,
        representation: reference(primary, 0),
      },
    };
  };
  const versionView = (version: StoredVersion) => ({
    id: version.id,
    number: version.number,
    status: version.status,
    createdAt: version.createdAt,
    createdBy: { displayName: 'Document Registrar' },
    representations: version.references.map(reference),
    ...(version.status === 'draft'
      ? {}
      : {
          designatedAt: version.designatedAt,
          designatedBy: { displayName: 'Document Approver' },
          frozen: version.frozen,
        }),
    ...(version.status === 'superseded'
      ? {
          supersededAt: version.supersededAt,
          supersededByVersionNumber: version.supersededByVersionNumber,
        }
      : {}),
  });
  const receipt = (version: StoredVersion, extra: Record<string, unknown>) => ({
    documentId,
    workingRevision: server.workingRevision,
    versionId: version.id,
    versionNumber: version.number,
    ...extra,
  });
  const isCurrent = (body: unknown) => {
    const expected =
      typeof body === 'object' && body !== null && 'expectedRevision' in body
        ? body.expectedRevision
        : undefined;
    return expected === server.workingRevision;
  };
  await page.route('**/api/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
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
                    'document.version.manage',
                    'document.version.designate_official',
                  ],
                  documentPermissionSetVersion: 'v3',
                  documentApproverAssignmentId: 'approver-assignment',
                  documentApproverPermissionSetVersion: 'v1',
                },
              }
            : {}),
        },
      });
    if (path.endsWith('/companies')) return route.fulfill({ json: [company] });
    if (path.endsWith('/activity-log'))
      return route.fulfill({ json: { events: [] } });
    if (path.endsWith('/clients')) return route.fulfill({ json: [client] });
    if (path === '/api/documents' && method === 'POST') {
      expect(request.postDataJSON()).toEqual({
        clientId: client.id,
        title: firstTitle,
        purpose,
        url: firstUrl,
      });
      server.registered = true;
      server.versions = [
        {
          id: 'version-1',
          number: 1,
          status: 'draft',
          createdAt: at(0),
          references: [
            {
              id: 'reference-1-other',
              position: 1,
              form: 'other',
              appendedAfterDesignation: false,
              addedAt: at(0),
              url: firstUrl,
            },
          ],
        },
      ];
      return route.fulfill({ status: 201, json: detail() });
    }
    if (path === '/api/documents')
      return route.fulfill({ json: server.registered ? [detail()] : [] });
    if (path === `/api/documents/${documentId}/correction-history`)
      return route.fulfill({
        json: { corrections: [], nextBeforeRevision: null },
      });
    if (path === `/api/documents/${documentId}/versions` && method === 'GET')
      return route.fulfill({
        json: {
          workingRevision: server.workingRevision,
          mutable: true,
          versions: [...server.versions]
            .sort((left, right) => right.number - left.number)
            .map(versionView),
        },
      });
    if (
      method === 'POST' &&
      path.startsWith(`/api/documents/${documentId}/versions`)
    ) {
      const body: unknown = request.postDataJSON();
      server.commands.push({ path, body });
      expect(request.headers()['idempotency-key']).toBeTruthy();
      if (!isCurrent(body))
        return route.fulfill({
          status: 409,
          json: { code: 'document_revision_conflict', message: 'Stale.' },
        });
      const minute = server.workingRevision + 1;
      const addMatch = path.match(
        new RegExp(
          `^/api/documents/${documentId}/versions/([^/]+)/representations$`,
        ),
      );
      if (addMatch) {
        const version = server.versions.find(
          (candidate) => candidate.id === addMatch[1],
        );
        if (!version) throw new Error('Expected the target Version.');
        if (
          typeof body !== 'object' ||
          body === null ||
          !('form' in body) ||
          !('url' in body) ||
          typeof body.url !== 'string' ||
          (body.form !== 'editable' &&
            body.form !== 'rendered' &&
            body.form !== 'signed' &&
            body.form !== 'other')
        )
          throw new Error('Expected a typed reference command.');
        const added: StoredReference = {
          id: `reference-${version.number}-${version.references.length + 1}`,
          position:
            Math.max(...version.references.map((item) => item.position)) + 1,
          form: body.form,
          appendedAfterDesignation: version.status === 'official',
          addedAt: at(minute),
          url: body.url,
        };
        version.references.push(added);
        server.workingRevision += 1;
        return route.fulfill({
          status: 201,
          json: receipt(version, {
            action: 'representation_added',
            representationId: added.id,
            appendedAfterDesignation: added.appendedAfterDesignation,
          }),
        });
      }
      const removalMatch = path.match(
        new RegExp(
          `^/api/documents/${documentId}/versions/([^/]+)/representations/([^/]+)/removal$`,
        ),
      );
      if (removalMatch) {
        const version = server.versions.find(
          (candidate) => candidate.id === removalMatch[1],
        );
        if (!version) throw new Error('Expected the target Version.');
        const removed = version.references.find(
          (item) => item.id === removalMatch[2],
        );
        if (!removed) throw new Error('Expected the target reference.');
        version.references = version.references.filter(
          (item) => item.id !== removed.id,
        );
        server.workingRevision += 1;
        return route.fulfill({
          json: receipt(version, {
            action: 'representation_removed',
            representationId: removed.id,
          }),
        });
      }
      if (path.endsWith('/official-designation')) {
        const draft = server.versions.find(
          (version) =>
            path ===
            `/api/documents/${documentId}/versions/${version.id}/official-designation`,
        );
        if (draft?.status !== 'draft') throw new Error('Expected the draft.');
        const previous = server.versions.find(
          (version) => version.status === 'official',
        );
        if (previous) {
          previous.status = 'superseded';
          previous.supersededAt = at(minute);
          previous.supersededByVersionNumber = draft.number;
        }
        draft.status = 'official';
        draft.designatedAt = at(minute);
        draft.frozen = { title: server.title, purpose };
        server.workingRevision += 1;
        return route.fulfill({
          json: receipt(draft, {
            action: 'designated_official',
            supersededVersionNumber: previous?.number ?? null,
          }),
        });
      }
      const source = server.versions.find(
        (version) => version.status === 'official',
      );
      if (!source) throw new Error('Expected the official Version.');
      const drafted: StoredVersion = {
        id: `version-${server.versions.length + 1}`,
        number: server.versions.length + 1,
        status: 'draft',
        createdAt: at(minute),
        references: source.references
          .filter((item) => !item.appendedAfterDesignation)
          .map((item, index) => ({
            ...item,
            id: `reference-${server.versions.length + 1}-${index + 1}`,
            position: index + 1,
            addedAt: at(minute),
          })),
      };
      server.versions.push(drafted);
      server.workingRevision += 1;
      return route.fulfill({
        status: 201,
        json: receipt(drafted, {
          action: 'drafted',
          sourceVersionNumber: source.number,
        }),
      });
    }
    if (path === `/api/documents/${documentId}` && method === 'PATCH') {
      const body: unknown = request.postDataJSON();
      server.commands.push({ path, body });
      const draft = server.versions.find(
        (version) => version.status === 'draft',
      );
      if (!isCurrent(body) || !draft) return route.fulfill({ status: 409 });
      if (typeof body === 'object' && body !== null) {
        if ('title' in body && typeof body.title === 'string')
          server.title = body.title;
        if ('url' in body && typeof body.url === 'string') {
          const primary = draft.references[0];
          if (!primary) throw new Error('Expected a primary reference.');
          primary.url = body.url;
        }
      }
      server.workingRevision += 1;
      return route.fulfill({
        json: {
          documentId,
          revision: server.workingRevision,
          outcome: 'corrected',
        },
      });
    }
    if (path === `/api/documents/${documentId}`)
      return route.fulfill({ json: detail() });
    return route.fulfill({ status: 404 });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?frame=prisme#documents');
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await selectOption(
    page.getByLabel('Active Company', { exact: true }),
    company.id,
  );
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Close navigation' }).click();
  await selectOption(page.getByLabel('Client', { exact: true }), client.id);
  await page.getByLabel('Title', { exact: true }).fill(firstTitle);
  await page.getByLabel('Purpose', { exact: true }).fill(purpose);
  await page.getByLabel('External HTTPS link').fill(firstUrl);
  await page
    .getByRole('button', { name: 'Register working reference' })
    .click();
  await expect(page.getByRole('heading', { name: firstTitle })).toBeVisible();

  const versions = page.getByRole('region', { name: 'Versions' });
  const rows = versions
    .getByRole('list', { name: 'Document Versions, newest first' })
    .locator(':scope > li');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Version 1');
  await expect(rows.first()).toContainText('Draft');

  // 1. The registrar records the rendered form before designation.
  await selectOption(rows.first().getByLabel('Reference form'), 'rendered');
  await rows.first().getByLabel('HTTPS URL').fill(renderedUrl);
  await rows.first().getByRole('button', { name: 'Add reference' }).click();
  await expect(versions.getByRole('status')).toHaveText(
    'A reference was added to Version 1.',
  );
  await expect(
    rows.first().getByRole('list', { name: 'References for Version 1' }),
  ).toContainText('Rendered · Position 2');

  // 2. The Approver designates Version 1 from the keyboard.
  const designate = versions.getByRole('button', {
    name: 'Designate as official',
  });
  await rows.first().getByLabel('HTTPS URL').click();
  await page.keyboard.press('Shift+Tab');
  await expect(rows.first().getByLabel('Reference form')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(designate).toBeFocused();
  expect(
    await designate.evaluate(
      (element) => getComputedStyle(element).outlineStyle,
    ),
  ).toBe('solid');
  await page.keyboard.press('Enter');
  await expect(
    versions.getByRole('group', {
      name: 'Designate Version 1 as the official Version? No Version will be superseded.',
    }),
  ).toBeVisible();
  await expect(
    versions.getByRole('button', { name: 'Confirm official designation' }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(versions.getByRole('status')).toHaveText(
    'Version 1 is now official.',
  );
  await expect(
    page.getByText('Official questionnaire · Company-confidential'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Edit reference' }),
  ).toHaveCount(0);
  await expect(rows.first()).toContainText(
    'The recorded references, their forms, and the title of this official Version are frozen.',
  );
  expect(
    await page.evaluate(
      () => window.document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await versions.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath('document-versions-official.png'),
    fullPage: true,
  });

  // 3. The registrar confirms the irreversible signed append.
  await selectOption(rows.first().getByLabel('Reference form'), 'signed');
  await rows.first().getByLabel('HTTPS URL').fill(signedUrl);
  await rows
    .first()
    .getByRole('button', { name: 'Add reference to official Version' })
    .click();
  await expect(
    versions.getByRole('group', {
      name: 'Add this reference to official Version 1? It will belong to this exact Version and can never be removed.',
    }),
  ).toBeVisible();
  await versions
    .getByRole('button', { name: 'Add irreversible reference' })
    .click();
  await expect(versions.getByRole('status')).toHaveText(
    'A reference was added to Version 1.',
  );
  await expect(rows.first()).toContainText('Signed · Position 3');
  await expect(rows.first()).toContainText('Added after designation');

  // 4. Version 2 copies the two pre-designation references, then drops the
  // original source before its primary URL is corrected.
  await versions.getByRole('button', { name: 'Start new draft' }).click();
  await expect(versions.getByRole('status')).toHaveText(
    'Version 2 was started as a draft.',
  );
  await expect(
    page.getByText('Draft questionnaire · Company-confidential'),
  ).toBeVisible();
  await expect(rows).toHaveCount(2);
  const draftReferences = rows
    .first()
    .getByRole('list', { name: 'References for Version 2' })
    .locator(':scope > li');
  await expect(draftReferences).toHaveCount(2);
  await expect(
    rows.first().getByRole('list', { name: 'References for Version 2' }),
  ).not.toContainText('Signed');
  await draftReferences.first().getByRole('button', { name: 'Remove' }).click();
  await expect(versions.getByRole('status')).toHaveText(
    'A draft reference was removed from Version 2.',
  );
  await expect(draftReferences).toHaveCount(1);
  await expect(draftReferences.first()).toContainText(
    'Rendered · Position 2 · Primary',
  );
  await page.getByRole('button', { name: 'Edit reference' }).click();
  await page.getByLabel('Title', { exact: true }).fill(secondTitle);
  await page.getByLabel('External HTTPS link').fill(secondUrl);
  await page.getByRole('button', { name: 'Save correction' }).click();
  await expect(page.getByRole('heading', { name: secondTitle })).toBeVisible();

  // 5. The Approver designates Version 2; Version 1 stays readable, superseded.
  await versions.getByRole('button', { name: 'Designate as official' }).click();
  await expect(
    versions.getByRole('group', {
      name: 'Designate Version 2 as the official Version? Version 1 will become superseded.',
    }),
  ).toBeVisible();
  await versions
    .getByRole('button', { name: 'Confirm official designation' })
    .click();
  await expect(versions.getByRole('status')).toHaveText(
    'Version 2 is now official.',
  );
  await expect(rows.nth(1)).toContainText('Superseded');
  await expect(rows.nth(1)).toContainText('Superseded by Version 2');
  await expect(rows.nth(1)).toContainText(firstTitle);
  const supersededReferences = rows
    .nth(1)
    .getByRole('list', { name: 'References for Version 1' });
  await expect(supersededReferences).toContainText('Signed · Position 3');
  await expect(supersededReferences).toContainText('Added after designation');
  await expect(
    rows.nth(1).getByRole('link', { name: 'Open Version 1 reference' }).first(),
  ).toHaveAttribute('href', firstUrl);
  await expect(rows.first()).toContainText('Official');
  await expect(rows.first()).toContainText(secondTitle);
  const secondLink = rows
    .first()
    .getByRole('link', { name: 'Open Version 2 reference' });
  await expect(secondLink).toHaveAttribute('href', secondUrl);
  await expect(secondLink).toHaveAttribute('target', '_blank');
  await expect(secondLink).toHaveAttribute('rel', 'noopener noreferrer');
  expect(server.commands.map((command) => command.body)).toEqual([
    { expectedRevision: 1, form: 'rendered', url: renderedUrl },
    { expectedRevision: 2 },
    { expectedRevision: 3, form: 'signed', url: signedUrl },
    { expectedRevision: 4 },
    { expectedRevision: 5 },
    { expectedRevision: 6, title: secondTitle, purpose, url: secondUrl },
    { expectedRevision: 7 },
  ]);
  expect(
    await page.evaluate(
      () => window.document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await versions.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath('document-versions-superseded.png'),
    fullPage: true,
  });
});
