import { createHash } from 'node:crypto';
import {
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';
import {
  actorContextFixture,
  operationalHomeFixture,
} from './actor-context.fixture';
import { selectOption } from './select-option';
import {
  buildClientRequest,
  requestListItemFor,
} from '../src/test/commercial-intake-responses';
import {
  literalRejectionReason,
  offerDecisionLocales,
  pendingOffer,
  qualityRun,
  recordedDecision,
  withRecordedDecision,
} from '../src/test/offer-quality-decision-fixture';
import type {
  OfferDecisionView,
  OfferQualityRunView,
  OfferView,
} from '../src/offer/offer-response';

// Existing evaluation/decision formatting is browser-local, including after
// language changes. 12:00Z and 12:15Z must remain 08:00 and 08:15 here.
test.use({ timezoneId: 'America/New_York' });

type Locale = (typeof offerDecisionLocales)[number];
const backToRequests = {
  ro: 'Înapoi la Solicitări',
  ru: 'Назад к Запросам',
  fr: 'Retour aux Demandes',
  en: 'Back to Requests',
} satisfies Record<Locale['code'], string>;
const company = {
  id: '00000000-0000-4000-8000-000000000699',
  displayName: 'Synthetic Offer Company / Компания',
};
const clientId = 'client-699';
const approvalRequest = buildClientRequest({
  id: 'request-approve',
  companyId: company.id,
  subject: 'Approval {original} / Утверждение',
  clientAssociationStatus: 'visible',
  clientReference: {
    originalClientId: clientId,
    currentClientId: clientId,
    displayName: 'Client {original} / Клиент',
  },
  initialOpportunity: { id: 'opportunity-approve' },
});
const rejectionRequest = buildClientRequest({
  id: 'request-reject',
  companyId: company.id,
  subject: 'Rejection {original} / Отклонение',
  clientAssociationStatus: 'visible',
  clientReference: {
    originalClientId: clientId,
    currentClientId: clientId,
    displayName: 'Client {original} / Клиент',
  },
  initialOpportunity: { id: 'opportunity-reject' },
});

type Command = {
  path: string;
  body: string | null;
  key: string | undefined;
  companyId: string | undefined;
  method: string;
};
type Receipt =
  | { kind: 'quality'; value: OfferQualityRunView; body: string | null }
  | { kind: 'decision'; value: OfferDecisionView; body: string | null };
function gate() {
  let release: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    promise,
    release() {
      if (!release) throw new Error('Missing synthetic HTTP gate.');
      release();
    },
  };
}

async function installRoutes(
  page: Page,
  {
    readOnly = false,
    authorityLoss = false,
  }: { readOnly?: boolean; authorityLoss?: boolean } = {},
) {
  const approval = pendingOffer({
    offerId: 'offer-approve',
    versionId: 'version-approve',
    latestRun: false,
  });
  const rejection = pendingOffer({
    offerId: 'offer-reject',
    versionId: 'version-reject',
    bindingVersion: 2,
    latestRun: false,
  });
  const offers = new Map<string, OfferView>([
    [
      'opportunity-approve',
      readOnly
        ? withRecordedDecision({ offer: approval, kind: 'approve' })
        : approval,
    ],
    [
      'opportunity-reject',
      readOnly
        ? withRecordedDecision({ offer: rejection, kind: 'reject' })
        : rejection,
    ],
  ]);
  const receipts = new Map<string, Receipt>();
  const qualityCounts = new Map<string, number>();
  const commands: Command[] = [];
  const requests: string[] = [];
  const lateDecisionReplies: string[] = [];
  const gates = {
    quality: gate(),
    approve: gate(),
    reject: gate(),
    history: gate(),
  };
  let retired = false;
  page.on('close', () => {
    gates.quality.release();
    gates.approve.release();
    gates.reject.release();
    gates.history.release();
  });

  function actor(selectedCompany: boolean) {
    return {
      ...actorContextFixture,
      internalUserId: 'user-one',
      workspaceMembershipId: 'membership-one',
      workspacePermissions: [],
      ...(selectedCompany
        ? {
            activeCompany: {
              ...company,
              clientPermissionAssignmentId: 'client-reader-699',
              clientPermissionSetVersion: 'v1',
              clientPermissions: ['client.read'],
              commercialIntakePermissionAssignmentId: 'intake-reader-699',
              commercialIntakePermissionSetVersion: 'v1',
              commercialIntakePermissions: [
                'commercial.request.read',
                'commercial.request.create',
                'commercial.opportunity.read',
                'commercial.opportunity.create',
              ],
              offerApproverAssignmentId:
                readOnly || retired ? undefined : 'offer-approver-699',
              offerApproverPermissionSetVersion:
                readOnly || retired ? undefined : 'v1',
              offerPermissions:
                readOnly || retired
                  ? ['commercial.offer.read']
                  : ['commercial.offer.read', 'commercial.offer.approve'],
            },
          }
        : {}),
    };
  }

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    requests.push(`${request.method()} ${path}`);
    if (path === '/api/access/current-actor')
      return route.fulfill({
        json: actor(request.headers()['x-company-context-id'] === company.id),
      });
    if (path === '/api/companies') return route.fulfill({ json: [company] });
    if (path === '/api/operational-home')
      return route.fulfill({
        json: operationalHomeFixture(company.id, { active_clients: 1 }),
      });
    if (path === '/api/activity-log')
      return route.fulfill({ json: { events: [] } });
    if (path === '/api/clients')
      return route.fulfill({ json: { clients: [], nextCursor: null } });
    if (path === '/api/commercial-intake/requests')
      return route.fulfill({
        json: {
          items: [
            requestListItemFor(approvalRequest),
            requestListItemFor(rejectionRequest),
          ],
        },
      });
    if (path === `/api/commercial-intake/requests/${approvalRequest.id}`)
      return route.fulfill({ json: approvalRequest });
    if (path === `/api/commercial-intake/requests/${rejectionRequest.id}`)
      return route.fulfill({ json: rejectionRequest });

    const entry = [...offers].find(([id]) =>
      path.startsWith(`/api/offers/opportunities/${id}`),
    );
    if (!entry) return route.fulfill({ status: 404 });
    const [opportunityId, offer] = entry;
    const base = `/api/offers/opportunities/${opportunityId}`;
    if (request.method() === 'GET') {
      if (
        authorityLoss &&
        path === `${base}/versions` &&
        new URL(request.url()).searchParams.has('cursor')
      ) {
        await gates.history.promise;
        if (page.isClosed()) return;
        return route.fulfill({
          status: 403,
          json: { privateDetail: 'HIDDEN-RETIRED-AUTHORITY' },
        });
      }
      if (path === `${base}/versions`)
        return route.fulfill({
          json: {
            versions: [
              {
                id: offer.version.id,
                versionNumber: 1,
                createdAt: '2026-09-27T09:00:00.000Z',
                supersededByVersionId: null,
              },
            ],
            nextCursor: authorityLoss ? 'retirement-page' : null,
          },
        });
      if (path === base || path === `${base}/versions/${offer.version.id}`)
        return route.fulfill({ json: { offer } });
      return route.fulfill({ status: 404 });
    }
    const command = {
      path,
      body: request.postData(),
      key: request.headers()['idempotency-key'],
      companyId: request.headers()['x-company-context-id'],
      method: request.method(),
    };
    commands.push(command);
    if (readOnly || retired)
      return route.fulfill({
        status: 403,
        json: { privateDetail: 'HIDDEN-RETIRED-AUTHORITY' },
      });
    if (!command.key) throw new Error('Expected exact idempotency key.');
    const receiptId = `${path}:${command.key}`;
    const replay = receipts.get(receiptId);
    if (replay) {
      if (replay.body !== command.body)
        return route.fulfill({
          status: 409,
          json: { code: 'IDEMPOTENCY_CONFLICT' },
        });
      return route.fulfill({ status: 201, json: replay.value });
    }
    if (path.endsWith('/quality-checks')) {
      const number = (qualityCounts.get(opportunityId) ?? 0) + 1;
      qualityCounts.set(opportunityId, number);
      const run = qualityRun({
        bindingVersion: offer.version.qualityRuleSetVersion,
        versionId: offer.version.id,
        id: `${offer.version.id}-review-${number}`,
      });
      offers.set(opportunityId, {
        ...offer,
        version: { ...offer.version, latestQualityRun: run },
      });
      receipts.set(receiptId, {
        kind: 'quality',
        value: run,
        body: command.body,
      });
      if (opportunityId === 'opportunity-approve' && number === 2) {
        await gates.quality.promise;
        if (!page.isClosed()) return route.fulfill({ status: 503 });
        return;
      }
      return route.fulfill({ status: 201, json: run });
    }
    const kind = path.endsWith('/approve')
      ? 'approve'
      : path.endsWith('/reject')
        ? 'reject'
        : undefined;
    if (!kind) return route.fulfill({ status: 404 });
    if (
      kind === 'approve' &&
      command.body ===
        JSON.stringify({
          expectedOfferRevision: 1,
          acknowledgedWarningCodes: [],
        })
    )
      return route.fulfill({
        status: 409,
        json: { code: 'QUALITY_CHECK_WARNINGS_UNACKNOWLEDGED' },
      });
    const decision = recordedDecision({ offer, kind });
    const recorded = withRecordedDecision({ offer, kind });
    receipts.set(receiptId, {
      kind: 'decision',
      value: decision,
      body: command.body,
    });
    if (!authorityLoss) offers.set(opportunityId, recorded);
    else retired = true;
    await gates[kind].promise;
    if (page.isClosed()) return;
    if (authorityLoss) {
      try {
        await route.fulfill({ status: 201, json: decision });
      } finally {
        lateDecisionReplies.push(path);
      }
      return;
    }
    return route.fulfill({ status: 503 });
  });
  return {
    commands,
    requests,
    lateDecisionReplies,
    releaseQuality: gates.quality.release,
    releaseApproval: gates.approve.release,
    releaseRejection: gates.reject.release,
    releaseHistory: gates.history.release,
  };
}

async function chooseLanguage(page: Page, current: Locale, next: Locale) {
  const select = page.getByRole('combobox', {
    name: current.language,
    exact: true,
  });
  await select.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Home');
  const index = offerDecisionLocales.findIndex(
    (locale) => locale.code === next.code,
  );
  for (let position = 0; position < index; position += 1)
    await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('combobox', { name: next.language, exact: true }),
  ).toBeFocused();
  await expect(page.locator('html')).toHaveAttribute('lang', next.code);
}

async function openInitial(page: Page, info: TestInfo) {
  await page.goto('/');
  if (info.project.name === 'narrow')
    await page
      .getByRole('button', { name: 'Open navigation', exact: true })
      .click();
  await selectOption(
    page.getByRole('combobox', { name: 'Active Company', exact: true }),
    { value: company.id },
  );
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name: 'Client Requests', exact: true })
    .click();
}

async function openRequest(
  page: Page,
  request: typeof approvalRequest,
  locale: Locale = offerDecisionLocales[3],
) {
  if (typeof request.subject !== 'string')
    throw new Error('Synthetic Request must have a subject.');
  const workspace = page.locator('.commercial-intake-workspace');
  if (await workspace.getByRole('article').count())
    await workspace
      .getByRole('button', { name: backToRequests[locale.code], exact: true })
      .click();
  const reply = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname ===
        `/api/offers/opportunities/${request.initialOpportunity.id}`,
  );
  await page
    .locator('.commercial-intake-workspace')
    .getByRole('button')
    .filter({ has: page.getByText(request.subject, { exact: true }) })
    .click();
  const result = await reply;
  await expect(
    page
      .locator('.offer-version-history')
      .getByRole('button', { name: locale.openOne, exact: true }),
  ).toBeDisabled();
  return result;
}

function description(page: Page, label: string): Locator {
  return page
    .locator('dt')
    .and(page.getByText(label, { exact: true }))
    .locator('..')
    .locator('dd');
}

async function evidence(
  page: Page,
  info: TestInfo,
  name: string,
  focus: Locator,
) {
  await focus.scrollIntoViewIfNeeded();
  const dimensions = await page.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(
    dimensions.scrollWidth,
    JSON.stringify(dimensions),
  ).toBeLessThanOrEqual(dimensions.width);
  await page.screenshot({
    path: info.outputPath(`${name}-${info.project.name}-viewport.png`),
  });
  const position = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath(`${name}-${info.project.name}-full.png`),
    fullPage: true,
  });
  await page.evaluate(({ x, y }) => scrollTo(x, y), position);
}

function assertSameRetry(
  first: Command | undefined,
  retry: Command | undefined,
) {
  if (!first || !retry)
    throw new Error('Expected both synthetic HTTP attempts.');
  expect(first.key).toBeTruthy();
  expect(first.companyId).toBe(company.id);
  expect(first.method).toBe('POST');
  expect(retry).toEqual(first);
}

for (const locale of offerDecisionLocales) {
  test(`runs checks, recovers exact decisions and reopens immutable Offers in ${locale.code}`, async ({
    page,
  }, info) => {
    const observed = await installRoutes(page);
    await openInitial(page, info);
    await openRequest(page, approvalRequest);
    const offer = page.locator('.offer-panel');
    await chooseLanguage(page, offerDecisionLocales[3], locale);
    const originalFrame = offer.getByTitle(locale.frame, { exact: true });
    const html = await originalFrame.getAttribute('srcdoc');
    if (html === null) throw new Error('Expected immutable representation.');
    const checksum = createHash('sha256').update(html).digest('hex');
    await expect(offer.locator('.offer-representation code')).toHaveText(
      checksum,
    );
    await expect(
      originalFrame
        .contentFrame()
        .getByRole('heading', { name: 'Illustrative Offer', exact: true }),
    ).toBeVisible();
    await offer.getByRole('button', { name: locale.run, exact: true }).focus();
    await page.keyboard.press('Enter');
    const quality = offer.getByRole('region', {
      name: locale.quality,
      exact: true,
    });
    await expect(
      quality.getByText(locale.warnings, { exact: true }),
    ).toBeVisible();
    await expect(description(page, locale.evaluatedAt)).toHaveText(
      locale.localEvaluation,
    );
    await expect(description(page, locale.qualityActor)).toHaveText(
      'membership-one',
    );
    await expect(description(page, locale.ruleSet)).toHaveText(
      'OFFER_QUALITY_ILLUSTRATIVE v1',
    );
    await offer
      .getByRole('button', { name: locale.approve, exact: true })
      .click();
    await expect(
      offer.locator('.offer-decision').getByRole('alert'),
    ).toHaveText(locale.warningsChanged);
    await expect(
      offer.getByRole('button', { name: locale.retryDecision, exact: true }),
    ).toHaveCount(0);
    const reason = offer.getByRole('textbox', {
      name: locale.reason,
      exact: true,
    });
    const warning = offer.getByRole('checkbox', {
      name: locale.rules[5],
      exact: true,
    });
    await reason.fill(literalRejectionReason);
    await warning.focus();
    await page.keyboard.press('Space');
    await expect(warning).toBeChecked();
    const reasonNode = await reason.elementHandle();
    const warningNode = await warning.elementHandle();
    if (!reasonNode || !warningNode)
      throw new Error('Expected retained draft controls.');
    await offer.getByRole('button', { name: locale.run, exact: true }).click();
    await expect(
      offer.getByRole('button', { name: locale.runningQuality, exact: true }),
    ).toBeDisabled();
    const qualityRequestCount = observed.requests.length;
    const other =
      locale.code === 'fr' ? offerDecisionLocales[1] : offerDecisionLocales[2];
    await chooseLanguage(page, locale, other);
    expect(observed.requests).toHaveLength(qualityRequestCount);
    expect(
      await reasonNode.evaluate(
        (node) => node === document.querySelector('.offer-decision textarea'),
      ),
    ).toBe(true);
    expect(
      await warningNode.evaluate(
        (node) =>
          node ===
          document.querySelector('.offer-decision input[type="checkbox"]'),
      ),
    ).toBe(true);
    await expect(
      offer.getByRole('textbox', { name: other.reason, exact: true }),
    ).toHaveValue(literalRejectionReason);
    await expect(
      offer.getByRole('checkbox', { name: other.rules[5], exact: true }),
    ).toBeChecked();
    observed.releaseQuality();
    await expect(
      offer.getByText(other.uncertainQuality, { exact: true }),
    ).toBeVisible();
    await chooseLanguage(page, other, locale);
    expect(observed.requests).toHaveLength(qualityRequestCount);
    await offer
      .getByRole('button', { name: locale.retryQuality, exact: true })
      .click();
    await expect(
      quality.getByText(locale.warnings, { exact: true }),
    ).toBeVisible();
    await expect(warning).not.toBeChecked();
    await expect(reason).toHaveValue(literalRejectionReason);
    const qualityCommands = observed.commands.filter((command) =>
      command.path.endsWith('/quality-checks'),
    );
    expect(qualityCommands).toHaveLength(3);
    expect(qualityCommands[0]?.key).not.toBe(qualityCommands[1]?.key);
    assertSameRetry(qualityCommands[1], qualityCommands[2]);
    expect(qualityCommands[1]?.body).toBe('{}');
    await warning.focus();
    await page.keyboard.press('Space');
    await offer
      .getByRole('button', { name: locale.approve, exact: true })
      .focus();
    await page.keyboard.press('Enter');
    await expect(
      offer.getByText(locale.runningDecision, { exact: true }),
    ).toBeVisible();
    const decisionCount = observed.requests.length;
    await chooseLanguage(page, locale, other);
    expect(observed.requests).toHaveLength(decisionCount);
    await expect(
      offer.getByRole('textbox', { name: other.reason, exact: true }),
    ).toHaveValue(literalRejectionReason);
    await expect(
      offer.getByRole('checkbox', { name: other.rules[5], exact: true }),
    ).toBeChecked();
    observed.releaseApproval();
    await expect(
      offer.getByText(other.uncertainDecision, { exact: true }),
    ).toBeVisible();
    await chooseLanguage(page, other, locale);
    expect(observed.requests).toHaveLength(decisionCount);
    await evidence(
      page,
      info,
      `${locale.code}-uncertain-approval`,
      offer.locator('.offer-decision'),
    );
    await offer
      .getByRole('button', { name: locale.retryDecision, exact: true })
      .click();
    await expect(
      offer.getByText(locale.approved, { exact: true }),
    ).toBeVisible();
    const approvals = observed.commands.filter((command) =>
      command.path.endsWith('/approve'),
    );
    expect(approvals).toHaveLength(3);
    assertSameRetry(approvals[1], approvals[2]);
    expect(approvals[0]?.body).toBe(
      JSON.stringify({
        expectedOfferRevision: 1,
        acknowledgedWarningCodes: [],
      }),
    );
    expect(approvals[1]?.body).toBe(
      JSON.stringify({
        expectedOfferRevision: 1,
        acknowledgedWarningCodes: ['RECIPIENT_TAX_ID_RECORDED'],
      }),
    );
    await expect(description(page, locale.actor)).toHaveText('membership-one');
    await expect(description(page, locale.decidedAt)).toHaveText(
      locale.localDecision,
    );
    await expect(description(page, locale.decisionRun)).toHaveText(
      'approval-run-version-approve · OFFER_QUALITY_ILLUSTRATIVE v1',
    );
    await expect(description(page, locale.acknowledgedWarnings)).toHaveText(
      locale.rules[5],
    );
    await expect(description(page, locale.checksum)).toHaveText(checksum);
    await expect(originalFrame).toHaveAttribute('srcdoc', html);
    await evidence(
      page,
      info,
      `${locale.code}-approved`,
      description(page, locale.actor),
    );

    await openRequest(page, rejectionRequest, locale);
    await offer.getByRole('button', { name: locale.run, exact: true }).click();
    await expect(
      offer.getByText(locale.warnings, { exact: true }),
    ).toBeVisible();
    await expect(description(page, locale.ruleSet)).toHaveText(
      'OFFER_QUALITY_ILLUSTRATIVE v2',
    );
    const rejectedFrame = offer.getByTitle(locale.frame, { exact: true });
    const rejectionHtml = await rejectedFrame.getAttribute('srcdoc');
    if (rejectionHtml === null)
      throw new Error('Expected immutable v2 representation.');
    const rejectionChecksum = createHash('sha256')
      .update(rejectionHtml)
      .digest('hex');
    await expect(offer.locator('.offer-representation code')).toHaveText(
      rejectionChecksum,
    );
    await offer
      .getByRole('button', { name: locale.reject, exact: true })
      .click();
    await expect(
      offer.getByText(locale.invalid, { exact: true }),
    ).toBeVisible();
    const rejectionReason = offer.getByRole('textbox', {
      name: locale.reason,
      exact: true,
    });
    await rejectionReason.fill(literalRejectionReason);
    await offer
      .getByRole('button', { name: locale.reject, exact: true })
      .click();
    await expect(
      offer.getByText(locale.runningDecision, { exact: true }),
    ).toBeVisible();
    const rejectionCount = observed.requests.length;
    await chooseLanguage(page, locale, other);
    expect(observed.requests).toHaveLength(rejectionCount);
    observed.releaseRejection();
    await expect(
      offer.getByText(other.uncertainDecision, { exact: true }),
    ).toBeVisible();
    await chooseLanguage(page, other, locale);
    expect(observed.requests).toHaveLength(rejectionCount);
    await expect(rejectionReason).toHaveValue(literalRejectionReason);
    await offer
      .getByRole('button', { name: locale.retryDecision, exact: true })
      .click();
    await expect(
      offer.getByText(locale.rejected, { exact: true }),
    ).toBeVisible();
    const rejections = observed.commands.filter((command) =>
      command.path.endsWith('/reject'),
    );
    expect(rejections).toHaveLength(2);
    assertSameRetry(rejections[0], rejections[1]);
    expect(rejections[0]?.body).toBe(
      JSON.stringify({
        expectedOfferRevision: 1,
        reason: literalRejectionReason,
      }),
    );
    expect(await description(page, locale.reason).textContent()).toBe(
      literalRejectionReason,
    );
    await expect(rejectedFrame).toHaveAttribute('srcdoc', rejectionHtml);
    await evidence(
      page,
      info,
      `${locale.code}-rejected`,
      description(page, locale.reason),
    );

    const approvedReply = await openRequest(page, approvalRequest, locale);
    expect(await approvedReply.json()).toMatchObject({
      offer: {
        version: {
          id: 'version-approve',
          decision: {
            state: 'APPROVED',
            decidedAt: '2026-10-03T12:15:00.000Z',
            acknowledgedWarningCodes: ['RECIPIENT_TAX_ID_RECORDED'],
            representationSha256: checksum,
          },
        },
      },
    });
    await expect(description(page, locale.decidedAt)).toHaveText(
      locale.localDecision,
    );
    await expect(description(page, locale.checksum)).toHaveText(checksum);
    await expect(
      offer.getByTitle(locale.frame, { exact: true }),
    ).toHaveAttribute('srcdoc', html);
    const rejectedReply = await openRequest(page, rejectionRequest, locale);
    expect(await rejectedReply.json()).toMatchObject({
      offer: {
        version: {
          id: 'version-reject',
          decision: {
            state: 'REJECTED',
            reason: literalRejectionReason,
            decidedAt: '2026-10-03T12:15:00.000Z',
          },
        },
      },
    });
    expect(await description(page, locale.reason).textContent()).toBe(
      literalRejectionReason,
    );
    await expect(
      offer.getByTitle(locale.frame, { exact: true }),
    ).toHaveAttribute('srcdoc', rejectionHtml);
    await info.attach('exact-synthetic-commands', {
      body: JSON.stringify(observed.commands, null, 2),
      contentType: 'application/json',
    });
  });
}

test('keeps recorded decisions read-only through all four languages without acquiring a command', async ({
  page,
}, info) => {
  const observed = await installRoutes(page, { readOnly: true });
  await openInitial(page, info);
  await openRequest(page, approvalRequest);
  let current: Locale = offerDecisionLocales[3];
  for (const locale of offerDecisionLocales) {
    const before = observed.requests.length;
    await chooseLanguage(page, current, locale);
    current = locale;
    expect(observed.requests).toHaveLength(before);
    await expect(description(page, locale.actor)).toHaveText('membership-one');
    await expect(description(page, locale.checksum)).toHaveText(
      pendingOffer().version.representation.sha256,
    );
    await expect(
      page.getByRole('button', { name: locale.run, exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: locale.approve, exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('textbox', { name: locale.reason, exact: true }),
    ).toHaveCount(0);
  }
  expect(observed.commands).toHaveLength(0);
  await evidence(
    page,
    info,
    'readonly-decisions',
    description(page, current.actor),
  );
});

test('retires a real Company approval authority and suppresses its late result after localized revalidation', async ({
  page,
}, info) => {
  const observed = await installRoutes(page, { authorityLoss: true });
  await openInitial(page, info);
  await openRequest(page, approvalRequest);
  const locale = offerDecisionLocales[2];
  await chooseLanguage(page, offerDecisionLocales[3], locale);
  await page.getByRole('button', { name: locale.run, exact: true }).click();
  await expect(page.getByText(locale.warnings, { exact: true })).toBeVisible();
  await page
    .getByRole('checkbox', { name: locale.rules[5], exact: true })
    .check();
  // Start the independent read before the command takes ownership. New
  // sibling actions must be disabled while its confirmation is outstanding.
  const historyRead = page.waitForRequest(
    (request) =>
      request.method() === 'GET' &&
      new URL(request.url()).searchParams.get('cursor') === 'retirement-page',
  );
  await page
    .locator('.offer-version-history')
    .getByRole('button', {
      name: 'Afficher les versions plus anciennes',
      exact: true,
    })
    .click();
  await historyRead;
  await page.getByRole('button', { name: locale.approve, exact: true }).click();
  await expect(
    page.getByText(locale.runningDecision, { exact: true }),
  ).toBeVisible();
  // Existing access-rejection owner performs the real context revalidation.
  const reread = page.waitForResponse(
    (reply) =>
      reply.request().method() === 'GET' &&
      new URL(reply.url()).pathname ===
        '/api/offers/opportunities/opportunity-approve',
  );
  await expect(
    page.getByRole('button', { name: locale.run, exact: true }),
  ).toBeDisabled();
  observed.releaseHistory();
  expect(await (await reread).json()).toMatchObject({
    offer: {
      version: {
        id: 'version-approve',
        decision: null,
        decisionState: 'PENDING',
      },
    },
  });
  await expect(
    page.getByRole('button', { name: locale.approve, exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: locale.run, exact: true }),
  ).toHaveCount(0);
  observed.releaseApproval();
  await expect.poll(() => observed.lateDecisionReplies.length).toBe(1);
  await expect(page.getByText(locale.approved, { exact: true })).toHaveCount(0);
  await expect(
    page.getByText('approval-run-version-approve', { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText('HIDDEN-RETIRED-AUTHORITY', { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByTitle(locale.frame, { exact: true })).toHaveAttribute(
    'srcdoc',
    pendingOffer().version.representation.html,
  );
  const retiredRequestCount = observed.requests.length;
  await chooseLanguage(page, locale, offerDecisionLocales[0]);
  await expect(
    page.getByRole('button', {
      name: offerDecisionLocales[0].approve,
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', {
      name: offerDecisionLocales[0].run,
      exact: true,
    }),
  ).toHaveCount(0);
  expect(observed.requests).toHaveLength(retiredRequestCount);
  await chooseLanguage(page, offerDecisionLocales[0], locale);
  expect(observed.requests).toHaveLength(retiredRequestCount);
  expect(
    observed.commands.filter((command) => command.path.endsWith('/approve')),
  ).toHaveLength(1);
  expect(
    observed.requests.filter(
      (request) => request === 'GET /api/access/current-actor',
    ).length,
  ).toBeGreaterThanOrEqual(3);
  await evidence(
    page,
    info,
    'retired-approval-authority',
    page.locator('.offer-panel'),
  );
  await info.attach('retired-synthetic-commands', {
    body: JSON.stringify(observed.commands, null, 2),
    contentType: 'application/json',
  });
});
