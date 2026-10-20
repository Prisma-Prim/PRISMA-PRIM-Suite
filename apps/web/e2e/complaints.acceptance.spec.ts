import { randomUUID } from 'node:crypto';
import {
  expect,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { selectOption } from './select-option';
import { expectSelectAppearance } from './select-appearance';

const origin = 'http://127.0.0.1:4174';
const ada = {
  'x-test-external-provider': 'local-demo',
  'x-test-external-subject': 'local-demonstration-user',
  'x-test-display-name': 'Ada Ionescu',
  'x-test-email': 'ada@example.test',
};
const owner = {
  'x-test-external-provider': 'local-demo',
  'x-test-external-subject': 'workspace-owner',
  'x-test-display-name': 'Workspace Owner',
  'x-test-email': 'owner@example.test',
};
const locales = [
  {
    locale: 'en',
    title: 'Complaints',
    history: 'Factual history',
    action: 'Action',
    corrected: 'Corrected; original retained',
    declaredDate: 'Declared action or response date',
    noSending: 'Recording a response does not send it or close the complaint.',
  },
  {
    locale: 'fr',
    title: 'Réclamations',
    history: 'Historique des faits',
    action: 'Action',
    corrected: 'Corrigé ; déclaration d’origine conservée',
    declaredDate: 'Date déclarée de l’action ou de la réponse',
    noSending:
      'Enregistrer une réponse ne l’envoie pas et ne clôture pas la réclamation.',
  },
  {
    locale: 'ro',
    title: 'Reclamații',
    history: 'Istoric factual',
    action: 'Acțiune',
    corrected: 'Corectat; originalul este păstrat',
    declaredDate: 'Data declarată a acțiunii sau răspunsului',
    noSending:
      'Înregistrarea unui răspuns nu îl trimite și nu închide reclamația.',
  },
  {
    locale: 'ru',
    title: 'Жалобы',
    history: 'История фактов',
    action: 'Действие',
    corrected: 'Исправлено; исходная запись сохранена',
    declaredDate: 'Заявленная дата действия или ответа',
    noSending: 'Запись ответа не отправляет его и не закрывает жалобу.',
  },
];

// Registered production App, actual Nest routes and disposable PostgreSQL from
// the existing acceptance setup. No feature owner, HTTP reply or clock is mocked.
// Company/Client creation and administrator grants are synthetic fixture setup.
test('records, corrects and reopens a factual Complaint journey in four languages with independent live grants', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const narrow = testInfo.project.name.endsWith('narrow');
  const suffix = narrow ? 'narrow' : 'desktop';
  const membershipId = required('ACCEPTANCE_PRIMARY_MEMBERSHIP_ID');
  const companyName = `Complaint acceptance ${suffix}`;
  const company = await command(
    page.request,
    '/companies',
    { displayName: companyName },
    { administrator: true },
  );
  const companyId = text(company.id);
  for (const path of [
    '/company-context-assignments',
    '/company-director-client-assignments',
    '/company-complaints-reader-assignments',
    '/company-complaints-recorder-assignments',
  ]) {
    const grant = await command(
      page.request,
      path,
      { workspaceMembershipId: membershipId, companyId },
      { administrator: true },
    );
    if (path.includes('complaints'))
      expect(grant.permissionSetVersion).toBe('v1');
  }
  const clientName = `Synthetic Complaint Client ${suffix}`;
  const client = await command(
    page.request,
    '/clients',
    { displayName: clientName },
    { companyId },
  );
  const clientAccountId = text(client.id);
  const complainant = '  Synthetic Client representative — Ștefan / Иван  ';
  const originalSubject = `  Questionnaire instructions were unclear.\n${'Literal facts remain attributed — Ștefan / Иван. '.repeat(5)}${suffix}  `;
  const correctedSubject = `  Clarified questionnaire instructions.\nPreserve the original declaration — ${suffix}.  `;
  const actionText = `  Reviewed the declared instructions.\nNo financial or mission approval — ${suffix}.  `;
  const responseText = `  Recorded factual reply <b>as plain text</b>.\nNot sent or accepted — ${suffix}.  `;
  const correctedAction = `  Corrected the declared review facts.\nOriginal action retained — ${suffix}.  `;
  const intakeReason =
    '  Correcting the declared wording and complaint date.  ';
  const actionReason = '  Clarifying the original action without erasure.  ';
  const commits: Array<{
    path: string;
    key: string;
    body: unknown;
    revision: number;
  }> = [];

  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Hello, Ada Ionescu.', exact: true }),
  ).toBeVisible();
  if (narrow)
    await page
      .getByRole('button', { name: 'Open navigation', exact: true })
      .click();
  await selectOption(
    page.getByRole('combobox', { name: 'Active Company', exact: true }),
    companyId,
  );
  if (narrow)
    await page
      .getByRole('button', { name: 'Close navigation', exact: true })
      .click();
  await navigate(page, narrow);
  const section = page.locator('#complaints');
  await expect(
    section.getByText('No complaints are available in this Company.', {
      exact: true,
    }),
  ).toBeVisible();
  const openNew = section.getByRole('button', {
    name: 'Record a complaint',
    exact: true,
  });
  await openNew.focus();
  await openNew.press('Enter');
  await section
    .getByRole('textbox', { name: 'Client name', exact: true })
    .fill(clientName);
  await section
    .getByRole('button', { name: 'Find Client', exact: true })
    .click();
  const clientChoice = section.getByRole('combobox', {
    name: 'Original Client',
    exact: true,
  });
  await expect(clientChoice).toBeEnabled();
  await expectSelectAppearance(clientChoice);
  await selectOption(clientChoice, clientAccountId);
  await expect(clientChoice).toHaveAttribute('data-value', clientAccountId);
  await section
    .getByRole('textbox', { name: 'Complainant', exact: true })
    .fill(complainant);
  await section
    .getByRole('textbox', { name: 'Complaint content', exact: true })
    .fill(originalSubject);
  const complaintDate = section.getByRole('textbox', {
    name: 'Declared complaint date',
    exact: true,
  });
  const dueDate = section.getByRole('textbox', {
    name: 'Declared response due date (optional)',
    exact: true,
  });
  await expect(complaintDate).toHaveAccessibleName('Declared complaint date');
  await expect(complaintDate).toHaveAccessibleDescription(
    'Year-month-day (YYYY-MM-DD), or leave empty when the date is unknown.',
  );
  await expect(dueDate).toHaveValue('');
  const save = section.getByRole('button', {
    name: 'Save complaint',
    exact: true,
  });
  const self = section.getByRole('button', {
    name: 'I take responsibility for this complaint',
    exact: true,
  });
  await expect(self).toHaveAttribute('aria-pressed', 'false');
  await expect(save).toBeDisabled();
  await self.focus();
  await self.press('Enter');
  await expect(self).toHaveAttribute('aria-pressed', 'true');
  await complaintDate.fill('2025-02-29');
  await expect(save).toBeDisabled();
  await complaintDate.fill('');
  await expect(save).toBeEnabled();
  await customAndFit(page, section);
  await capture(page, testInfo, `complaints-${suffix}-explicit-intake.png`);
  const creation = page.waitForResponse(mutation('/api/complaints'));
  await save.click();
  const created = await creation;
  expect(created.status()).toBe(201);
  const createdValue: unknown = await created.json();
  const saved = object(createdValue);
  const complaintId = text(saved.id);
  const path = `/api/complaints/${complaintId}`;
  const intake = {
    complaintDate: null,
    complainant,
    subject: originalSubject,
    severityDescription: null,
    responseDueDate: null,
  };
  expect(saved).toMatchObject({
    companyId,
    clientAccountId,
    projectId: null,
    revision: 1,
    originalIntake: intake,
    currentIntake: intake,
    responsible: {
      workspaceMembershipId: membershipId,
      displayLabel: 'Ada Ionescu',
    },
  });
  expect(saved).not.toHaveProperty('complaint');
  const creationBody: unknown = created.request().postDataJSON();
  expect(creationBody).toEqual({
    clientAccountId,
    projectId: null,
    responsibleMembershipId: membershipId,
    ...intake,
  });
  commits.push({
    path: '/api/complaints',
    key: requestKey(created.request().headers()),
    body: creationBody,
    revision: 1,
  });

  await page.reload();
  const persisted = section.getByRole('listitem').filter({
    has: page.getByRole('heading', { name: originalSubject, exact: true }),
  });
  const opening = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname === path,
  );
  const open = persisted.getByRole('button', {
    name: 'Open complaint',
    exact: true,
  });
  await open.focus();
  await open.press('Enter');
  expect((await opening).status()).toBe(200);
  await expect(
    section.getByRole('heading', { name: originalSubject, exact: true }),
  ).toBeFocused();
  expect(page.url()).not.toContain(complaintId);
  await expect(
    section
      .getByRole('region', { name: 'Factual history', exact: true })
      .getByRole('listitem'),
  ).toHaveCount(1);

  await section.getByRole('button', { name: 'Action', exact: true }).click();
  let journalForm = section.locator('form').filter({
    has: page.getByRole('textbox', { name: 'Factual text', exact: true }),
  });
  await journalForm
    .getByRole('textbox', { name: 'Factual text', exact: true })
    .fill(actionText);
  await journalForm
    .getByRole('textbox', {
      name: 'Declared action or response date',
      exact: true,
    })
    .fill('2026-10-19');
  await recordJournal(page, journalForm, `${path}/journal`, 2, commits);
  expect(commits[1]?.body).toEqual({
    kind: 'action',
    text: actionText,
    declaredDate: '2026-10-19',
    expectedRevision: 1,
  });

  await section.getByRole('button', { name: 'Response', exact: true }).click();
  journalForm = section.locator('form').filter({
    has: page.getByRole('textbox', { name: 'Factual text', exact: true }),
  });
  await journalForm
    .getByRole('textbox', { name: 'Factual text', exact: true })
    .fill(responseText);
  await expect(
    journalForm.getByRole('textbox', {
      name: 'Declared action or response date',
      exact: true,
    }),
  ).toHaveValue('');
  await recordJournal(page, journalForm, `${path}/journal`, 3, commits);
  expect(commits[2]?.body).toEqual({
    kind: 'response',
    text: responseText,
    declaredDate: null,
    expectedRevision: 2,
  });
  await expect(
    section.getByText(
      'Recording a response does not send it or close the complaint.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(section.locator('b,script')).toHaveCount(0);

  await section
    .getByRole('button', { name: 'Correct complaint facts', exact: true })
    .click();
  const intakeForm = section.locator('form').filter({
    has: page.getByRole('textbox', {
      name: 'Complaint content',
      exact: true,
    }),
  });
  await intakeForm
    .getByRole('textbox', { name: 'Complaint content', exact: true })
    .fill(correctedSubject);
  await intakeForm
    .getByRole('textbox', { name: 'Declared complaint date', exact: true })
    .fill('2026-10-19');
  await intakeForm
    .getByRole('textbox', { name: 'Correction reason', exact: true })
    .fill(intakeReason);
  const correction = page.waitForResponse(
    mutation(`${path}/intake-corrections`),
  );
  await intakeForm
    .getByRole('button', { name: 'Record correction', exact: true })
    .click();
  const intakeCorrected = await correction;
  expect(intakeCorrected.status()).toBe(201);
  const intakeResult: unknown = await intakeCorrected.json();
  expect(object(intakeResult)).toMatchObject({
    revision: 4,
    originalIntake: intake,
    currentIntake: {
      ...intake,
      subject: correctedSubject,
      complaintDate: '2026-10-19',
    },
  });
  const correctionBody: unknown = intakeCorrected.request().postDataJSON();
  expect(correctionBody).toEqual({
    ...intake,
    subject: correctedSubject,
    complaintDate: '2026-10-19',
    reason: intakeReason,
    expectedRevision: 3,
  });
  commits.push({
    path: `${path}/intake-corrections`,
    key: requestKey(intakeCorrected.request().headers()),
    body: correctionBody,
    revision: 4,
  });

  const history = section.getByRole('region', {
    name: 'Factual history',
    exact: true,
  });
  const originalAction = history.getByRole('listitem').filter({
    has: page.getByRole('heading', { name: 'Action', exact: true }),
  });
  await expect(originalAction).toHaveCount(1);
  expect(await originalAction.locator('.complaint-literal').textContent()).toBe(
    actionText,
  );
  const beforeCorrection = await read(
    page.request,
    `${path}/history`,
    companyId,
  );
  const originalActionRecord = rows(beforeCorrection.entries).find(
    (entry) => entry.kind === 'action',
  );
  if (!originalActionRecord)
    throw new Error('The real original action is unavailable.');
  const originalActionId = text(originalActionRecord.id);
  await originalAction
    .getByRole('button', { name: 'Record correction', exact: true })
    .click();
  journalForm = section.locator('form').filter({
    has: page.getByRole('textbox', { name: 'Factual text', exact: true }),
  });
  await journalForm
    .getByRole('textbox', { name: 'Factual text', exact: true })
    .fill(correctedAction);
  await journalForm
    .getByRole('textbox', {
      name: 'Declared action or response date',
      exact: true,
    })
    .fill('');
  await journalForm
    .getByRole('textbox', { name: 'Correction reason', exact: true })
    .fill(actionReason);
  const correctedPath = `${path}/journal/${originalActionId}/corrections`;
  await recordJournal(page, journalForm, correctedPath, 5, commits);
  expect(commits[4]?.body).toEqual({
    text: correctedAction,
    declaredDate: null,
    reason: actionReason,
    expectedRevision: 4,
  });

  await page.reload();
  await section
    .getByRole('listitem')
    .filter({
      has: page.getByRole('heading', { name: correctedSubject, exact: true }),
    })
    .getByRole('button', { name: 'Open complaint', exact: true })
    .click();
  await expect(
    section.getByRole('heading', { name: correctedSubject, exact: true }),
  ).toBeVisible();
  await expect(history.getByRole('listitem')).toHaveCount(5);
  await expect(
    originalAction.getByText('Corrected; original retained', { exact: true }),
  ).toBeVisible();
  expect(await originalAction.locator('.complaint-literal').textContent()).toBe(
    actionText,
  );
  expect(
    await history
      .locator('.complaint-original-reference blockquote')
      .textContent(),
  ).toBe(actionText);
  const persistedHistory = await read(
    page.request,
    `${path}/history`,
    companyId,
  );
  expect(persistedHistory).toMatchObject({
    complaintId,
    companyId,
    revision: 5,
    total: 5,
    offset: 0,
    pageSize: 25,
  });
  const entries = rows(persistedHistory.entries);
  expect(entries.map((entry) => entry.kind)).toEqual([
    'intake',
    'action',
    'response',
    'intake_correction',
    'correction',
  ]);
  expect(entries[0]).toMatchObject({ intake, revision: 1 });
  expect(entries[1]).toMatchObject({
    id: originalActionId,
    text: actionText,
    declaredDate: '2026-10-19',
    corrected: true,
    revision: 2,
  });
  expect(entries[2]).toMatchObject({
    text: responseText,
    declaredDate: null,
    revision: 3,
  });
  expect(entries[3]).toMatchObject({
    reason: intakeReason,
    intake: {
      ...intake,
      subject: correctedSubject,
      complaintDate: '2026-10-19',
    },
    revision: 4,
  });
  expect(entries[4]).toMatchObject({
    originalEntryId: originalActionId,
    originalKind: 'action',
    text: correctedAction,
    declaredDate: null,
    reason: actionReason,
    revision: 5,
    original: { text: actionText, actor: originalActionRecord.actor },
  });
  for (const entry of entries) {
    expect(object(entry.actor)).toEqual({
      workspaceMembershipId: membershipId,
      displayLabel: 'Ada Ionescu',
    });
    expect(Number.isFinite(Date.parse(text(entry.recordedAt)))).toBe(true);
  }
  for (const copy of locales) {
    await selectOption(page.locator('#interface-locale'), copy.locale);
    await expect(
      section.getByRole('heading', { name: copy.title, exact: true }),
    ).toBeVisible();
    const localizedHistory = section.getByRole('region', {
      name: copy.history,
      exact: true,
    });
    await expect(localizedHistory.getByRole('listitem')).toHaveCount(5);
    await expect(
      localizedHistory.getByText(copy.corrected, { exact: true }),
    ).toBeVisible();
    await expect(
      localizedHistory.getByText(copy.declaredDate, { exact: false }).first(),
    ).toBeVisible();
    await expect(
      section.getByText(copy.noSending, { exact: true }),
    ).toBeVisible();
    await customAndFit(page, section);
    await capture(
      page,
      testInfo,
      `complaints-${suffix}-${copy.locale}-history.png`,
    );
  }
  await selectOption(page.locator('#interface-locale'), 'en');

  // Revoke only Recorder: the real Reader keeps saved history, controls retire,
  // and even an exact committed journal receipt is denied after authority loss.
  await revoke(page.request, 'recorder', membershipId, companyId);
  await page.reload();
  await section
    .getByRole('listitem')
    .filter({
      has: page.getByRole('heading', { name: correctedSubject, exact: true }),
    })
    .getByRole('button', { name: 'Open complaint', exact: true })
    .click();
  await expect(history.getByRole('listitem')).toHaveCount(5);
  for (const name of [
    'Correct complaint facts',
    'Action',
    'Response',
    'Record correction',
  ])
    await expect(
      section.getByRole('button', { name, exact: true }),
    ).toHaveCount(0);
  const actionCommit = commits[1];
  if (!actionCommit)
    throw new Error('The real action command was not captured.');
  const refusedReplay = await page.request.post(
    `${origin}${actionCommit.path}`,
    {
      headers: {
        ...ada,
        'x-company-context-id': companyId,
        'idempotency-key': actionCommit.key,
      },
      data: actionCommit.body,
    },
  );
  expect(refusedReplay.status()).toBe(403);
  const refusedBody: unknown = await refusedReplay.json();
  expect(JSON.stringify(refusedBody)).not.toContain(actionText);
  expect(await read(page.request, `${path}/history`, companyId)).toEqual(
    persistedHistory,
  );
  await capture(page, testInfo, `complaints-${suffix}-reader-only.png`);

  await revoke(page.request, 'reader', membershipId, companyId);
  await page.reload();
  await expect(section).toHaveCount(0);
  for (const target of ['/api/complaints', path, `${path}/history`]) {
    const denied = await page.request.get(`${origin}${target}`, {
      headers: { ...ada, 'x-company-context-id': companyId },
    });
    expect(denied.status()).toBe(403);
    const deniedValue: unknown = await denied.json();
    for (const privateFact of [
      originalSubject,
      correctedSubject,
      actionText,
      responseText,
      correctedAction,
    ])
      expect(JSON.stringify(deniedValue)).not.toContain(privateFact);
  }
  await customAndFit(page, page.locator('.prisme-shell'));
  await capture(page, testInfo, `complaints-${suffix}-reader-revoked.png`);
  await testInfo.attach('complaints-real-public-commands', {
    body: Buffer.from(
      JSON.stringify(
        { companyId, clientAccountId, complaintId, commits },
        null,
        2,
      ),
    ),
    contentType: 'application/json',
  });
});

function mutation(path: string) {
  return (response: import('@playwright/test').Response) =>
    response.request().method() === 'POST' &&
    new URL(response.url()).pathname === path;
}
async function recordJournal(
  page: Page,
  form: Locator,
  path: string,
  revision: number,
  commits: Array<{
    path: string;
    key: string;
    body: unknown;
    revision: number;
  }>,
) {
  const response = page.waitForResponse(mutation(path));
  await form
    .getByRole('button', {
      name: path.endsWith('/corrections')
        ? 'Record correction'
        : 'Record factual entry',
      exact: true,
    })
    .click();
  const saved = await response;
  expect(saved.status()).toBe(201);
  const value: unknown = await saved.json();
  expect(object(value).revision).toBe(revision);
  expect(value).not.toHaveProperty('complaint');
  const body: unknown = saved.request().postDataJSON();
  commits.push({
    path,
    key: requestKey(saved.request().headers()),
    body,
    revision,
  });
}
async function command(
  request: APIRequestContext,
  path: string,
  data: unknown,
  {
    administrator = false,
    companyId,
  }: { administrator?: boolean; companyId?: string } = {},
) {
  const response = await request.post(`${origin}/api${path}`, {
    headers: {
      ...(administrator ? owner : ada),
      ...(companyId ? { 'x-company-context-id': companyId } : {}),
      'idempotency-key': randomUUID(),
    },
    data,
  });
  expect(response.status()).toBe(201);
  const value: unknown = await response.json();
  return object(value);
}
async function read(
  request: APIRequestContext,
  path: string,
  companyId: string,
) {
  const response = await request.get(`${origin}${path}`, {
    headers: { ...ada, 'x-company-context-id': companyId },
  });
  expect(response.status()).toBe(200);
  const value: unknown = await response.json();
  return object(value);
}
async function revoke(
  request: APIRequestContext,
  grant: 'reader' | 'recorder',
  membershipId: string,
  companyId: string,
) {
  const response = await request.delete(
    `${origin}/api/company-complaints-${grant}-assignments/${membershipId}/${companyId}`,
    {
      headers: { ...owner, 'idempotency-key': randomUUID() },
    },
  );
  expect(response.status()).toBe(200);
}
async function navigate(page: Page, narrow: boolean) {
  if (narrow)
    await page
      .getByRole('button', { name: 'Open navigation', exact: true })
      .click();
  await page
    .getByRole('navigation', { name: 'Primary navigation', exact: true })
    .getByRole('link', { name: 'Complaints', exact: true })
    .click();
}
async function customAndFit(page: Page, section: Locator) {
  await expect(section.locator('select,input[type="checkbox"]')).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}
async function capture(page: Page, testInfo: TestInfo, name: string) {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.screenshot({ path: testInfo.outputPath(name), fullPage: true });
}
function requestKey(headers: Record<string, string>) {
  const key = headers['idempotency-key'];
  if (!key) throw new Error('A real mutation idempotency key is required.');
  expect(headers['content-type']).toContain('application/json');
  return key;
}
function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Expected a public API object.');
  return Object.fromEntries(Object.entries(value));
}
function rows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value))
    throw new Error('Expected a bounded public history page.');
  return value.map((entry: unknown) => object(entry));
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value)
    throw new Error('Expected public identified text.');
  return value;
}
function required(name: string) {
  return text(process.env[name]);
}
