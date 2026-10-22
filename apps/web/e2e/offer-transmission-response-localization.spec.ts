import { createHash } from 'node:crypto';
import {
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { selectOption } from './select-option';
import {
  company707,
  installTransmissionRoutes,
  requests707,
  type Command707,
} from './offer-transmission-response.fixture';
import {
  literalClientReason,
  literalReceivedAt,
  literalSimulationNote,
  offerTransmissionLocales,
} from '../src/test/offer-transmission-response-fixture';

// Recorded facts retain browser-local time; UTC text input is never converted.
test.use({ timezoneId: 'America/New_York' });
type Locale = (typeof offerTransmissionLocales)[number];
const english = offerTransmissionLocales.find((locale) => locale.code === 'en');
if (!english) throw new Error('Missing independent English fixture.');
const englishLocale = english;

async function chooseLanguage({
  page,
  current,
  next,
}: {
  page: Page;
  current: Locale;
  next: Locale;
}) {
  const language = page.getByRole('combobox', {
    name: current.language,
    exact: true,
  });
  await language.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Home');
  const index = offerTransmissionLocales.findIndex(
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
    { value: company707.id },
  );
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name: 'Client Requests', exact: true })
    .click();
}
async function openRequest(
  page: Page,
  request: (typeof requests707)[number]['request'],
  locale: Locale,
) {
  const workspace = page.locator('.commercial-intake-workspace');
  if (await workspace.getByRole('article').count())
    await workspace
      .getByRole('button', { name: locale.back, exact: true })
      .click();
  if (typeof request.subject !== 'string')
    throw new Error('Missing synthetic Request subject.');
  const reply = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname ===
        `/api/offers/opportunities/${request.initialOpportunity.id}`,
  );
  await workspace
    .getByRole('button')
    .filter({ has: page.getByText(request.subject, { exact: true }) })
    .click();
  const result = await reply;
  await expect(
    page.locator('.offer-version-history').getByRole('button').first(),
  ).toBeDisabled();
  return result;
}
function description(scope: Locator, label: string): Locator {
  return scope
    .locator('dt')
    .and(scope.getByText(label, { exact: true }))
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
function sameRetry({
  first,
  second,
}: {
  first: Command707 | undefined;
  second: Command707 | undefined;
}) {
  if (!first || !second) throw new Error('Missing HTTP attempts.');
  expect(first.key).toBeTruthy();
  expect(first.method).toBe('POST');
  expect(first.companyId).toBe(company707.id);
  expect(second).toEqual(first);
}

for (const locale of offerTransmissionLocales) {
  for (const scenario of requests707) {
    test(`records and reopens simulated ${scenario.outcome} evidence in ${locale.code} with literal UTC and exact retries`, async ({
      page,
    }, info) => {
      const observed = await installTransmissionRoutes(page);
      await openInitial(page, info);
      await openRequest(page, scenario.request, englishLocale);
      const offer = page.locator('.offer-panel');
      await chooseLanguage({ page, current: englishLocale, next: locale });
      const frame = offer.getByTitle(locale.frame, { exact: true });
      const html = await frame.getAttribute('srcdoc');
      if (html === null) throw new Error('Missing immutable representation.');
      const checksum = createHash('sha256').update(html).digest('hex');
      await expect(offer.locator('.offer-representation code')).toHaveText(
        checksum,
      );
      const other =
        locale.code === 'fr'
          ? offerTransmissionLocales[0]
          : offerTransmissionLocales[2];
      if (!other) throw new Error('Missing independent second locale.');
      if (scenario.outcome === 'ACCEPTED') {
        const transmission = offer.locator('.offer-transmission');
        const note = transmission.getByRole('textbox', {
          name: locale.note,
          exact: true,
        });
        const warning = transmission.getByRole('checkbox', {
          name: locale.rules[5],
          exact: true,
        });
        await note.fill(literalSimulationNote);
        await warning.focus();
        await page.keyboard.press('Space');
        await expect(warning).toBeChecked();
        const noteNode = await note.elementHandle();
        const warningNode = await warning.elementHandle();
        if (!noteNode || !warningNode)
          throw new Error('Missing retained transmission controls.');
        const beforeDraftSwitch = observed.requests.length;
        await chooseLanguage({ page, current: locale, next: other });
        expect(observed.requests).toHaveLength(beforeDraftSwitch);
        expect(
          await noteNode.evaluate(
            (node) =>
              node === document.querySelector('.offer-transmission textarea'),
          ),
        ).toBe(true);
        expect(
          await warningNode.evaluate(
            (node) =>
              node ===
              document.querySelector(
                '.offer-transmission input[type="checkbox"]',
              ),
          ),
        ).toBe(true);
        await expect(
          transmission.getByRole('textbox', { name: other.note, exact: true }),
        ).toHaveValue(literalSimulationNote);
        await expect(
          transmission.getByRole('checkbox', {
            name: other.rules[5],
            exact: true,
          }),
        ).toBeChecked();
        await chooseLanguage({ page, current: other, next: locale });
        await transmission
          .getByRole('button', { name: locale.record, exact: true })
          .focus();
        await page.keyboard.press('Enter');
        await expect(transmission.getByRole('status')).toHaveText(
          locale.runningTransmission,
        );
        await expect.poll(() => observed.commands.length).toBe(1);
        const pendingRequests = observed.requests.length;
        await chooseLanguage({ page, current: locale, next: other });
        expect(observed.requests).toHaveLength(pendingRequests);
        observed.releaseTransmission();
        await expect(transmission.getByRole('alert')).toHaveText(
          other.uncertainTransmission,
        );
        await expect(
          page.getByRole('combobox', { name: other.language, exact: true }),
        ).toBeFocused();
        await chooseLanguage({ page, current: other, next: locale });
        expect(observed.requests).toHaveLength(pendingRequests);
        await expect(note).toHaveValue(literalSimulationNote);
        await expect(warning).toBeChecked();
        await evidence(
          page,
          info,
          `${locale.code}-uncertain-transmission`,
          transmission,
        );
        await transmission
          .getByRole('button', { name: locale.retryTransmission, exact: true })
          .click();
        await expect(
          offer.locator('.offer-transmission-evidence'),
        ).toBeVisible();
        sameRetry({
          first: observed.commands[0],
          second: observed.commands[1],
        });
        expect(observed.commands[0]?.path).toBe(
          '/api/offers/opportunities/opportunity-ACCEPTED/versions/version-ACCEPTED/transmission',
        );
        expect(observed.commands[0]?.body).toBe(
          JSON.stringify({
            expectedOfferRevision: 2,
            acknowledgedWarningCodes: ['RECIPIENT_TAX_ID_RECORDED'],
            note: literalSimulationNote,
          }),
        );
      }
      const transmissionEvidence = offer.locator(
        '.offer-transmission-evidence',
      );
      await expect(
        description(transmissionEvidence, locale.transmissionActor),
      ).toHaveText('membership-one');
      await expect(
        description(transmissionEvidence, locale.transmittedAt),
      ).toHaveText(locale.localTransmission);
      await expect(
        description(transmissionEvidence, locale.transmissionChecksum),
      ).toHaveText(checksum);
      await expect(
        description(transmissionEvidence, locale.transmissionWarnings),
      ).toHaveText(locale.rules[5]);
      expect(
        await description(transmissionEvidence, locale.note).textContent(),
      ).toBe(literalSimulationNote);
      const response = offer.locator('.offer-client-response');
      await expect(
        response.getByRole('heading', { name: locale.response, exact: true }),
      ).toBeVisible();
      if (scenario.outcome === 'EXPIRED')
        await expect(
          response.getByText(locale.pendingElapsed, { exact: true }),
        ).toBeVisible();
      const time = response.getByRole('textbox', {
        name: locale.received,
        exact: true,
      });
      const reason = response.getByRole('textbox', {
        name: locale.clientReason,
        exact: true,
      });
      await expect(time).toHaveAttribute('type', 'text');
      await expect(time).toHaveAttribute(
        'placeholder',
        '2026-10-03T14:30:00.000Z',
      );
      await time.fill(literalReceivedAt);
      await reason.fill(literalClientReason);
      const timeNode = await time.elementHandle();
      const reasonNode = await reason.elementHandle();
      if (!timeNode || !reasonNode)
        throw new Error('Missing literal response inputs.');
      const beforeResponseSwitch = observed.requests.length;
      await chooseLanguage({ page, current: locale, next: other });
      expect(observed.requests).toHaveLength(beforeResponseSwitch);
      expect(
        await timeNode.evaluate(
          (node) =>
            node === document.querySelector('.offer-client-response input'),
        ),
      ).toBe(true);
      expect(
        await reasonNode.evaluate(
          (node) =>
            node === document.querySelector('.offer-client-response textarea'),
        ),
      ).toBe(true);
      await expect(
        response.getByRole('textbox', { name: other.received, exact: true }),
      ).toHaveValue(literalReceivedAt);
      await expect(
        response.getByRole('textbox', {
          name: other.clientReason,
          exact: true,
        }),
      ).toHaveValue(literalClientReason);
      await chooseLanguage({ page, current: other, next: locale });
      await response
        .getByRole('button', {
          name:
            scenario.outcome === 'ACCEPTED'
              ? locale.acceptClient
              : scenario.outcome === 'REJECTED'
                ? locale.rejectClient
                : locale.expireClient,
          exact: true,
        })
        .focus();
      await page.keyboard.press('Enter');
      await expect(response.getByRole('status')).toHaveText(
        locale.runningResponse,
      );
      await expect
        .poll(
          () =>
            observed.commands.filter((command) =>
              command.path.endsWith('/client-response'),
            ).length,
        )
        .toBe(1);
      const pendingRequests = observed.requests.length;
      await chooseLanguage({ page, current: locale, next: other });
      expect(observed.requests).toHaveLength(pendingRequests);
      observed.releaseResponse(scenario.outcome);
      await expect(response.getByRole('alert')).toHaveText(
        other.uncertainResponse,
      );
      await expect(
        page.getByRole('combobox', { name: other.language, exact: true }),
      ).toBeFocused();
      await chooseLanguage({ page, current: other, next: locale });
      expect(observed.requests).toHaveLength(pendingRequests);
      await expect(time).toHaveValue(literalReceivedAt);
      await expect(reason).toHaveValue(literalClientReason);
      await evidence(
        page,
        info,
        `${locale.code}-${scenario.outcome}-uncertain-response`,
        response,
      );
      await response
        .getByRole('button', { name: locale.retryResponse, exact: true })
        .click();
      const responseEvidence = offer.locator('.offer-client-response-evidence');
      await expect(responseEvidence).toBeVisible();
      const attempts = observed.commands.filter((command) =>
        command.path.endsWith('/client-response'),
      );
      expect(attempts).toHaveLength(2);
      sameRetry({ first: attempts[0], second: attempts[1] });
      expect(attempts[0]?.body).toBe(
        JSON.stringify({
          expectedOfferRevision: 3,
          outcome: scenario.outcome,
          ...(scenario.outcome === 'EXPIRED'
            ? {}
            : { receivedAt: literalReceivedAt }),
          ...(scenario.outcome === 'REJECTED'
            ? { reason: literalClientReason }
            : {}),
        }),
      );
      expect(attempts[0]?.path).toBe(
        `/api/offers/opportunities/opportunity-${scenario.outcome}/versions/version-${scenario.outcome}/client-response`,
      );
      await expect(
        description(responseEvidence, locale.responseActor),
      ).toHaveText('membership-one');
      if (scenario.outcome !== 'EXPIRED') {
        await expect(
          description(responseEvidence, locale.responseDecided),
        ).toHaveText(locale.localResponse);
        await expect(
          description(responseEvidence, locale.recordedReceived),
        ).toHaveText(locale.localReceived);
      } else await expect(responseEvidence.locator('dt')).toHaveCount(2);
      if (scenario.outcome === 'REJECTED')
        expect(
          await description(
            responseEvidence,
            locale.clientReason,
          ).textContent(),
        ).toBe(literalClientReason);
      await expect(frame).toHaveAttribute('srcdoc', html);
      await expect(offer.locator('.offer-representation code')).toHaveText(
        checksum,
      );
      await evidence(
        page,
        info,
        `${locale.code}-${scenario.outcome}-recorded`,
        responseEvidence,
      );
      const reopened = await openRequest(page, scenario.request, locale);
      expect(await reopened.json()).toMatchObject({
        offer: {
          version: {
            id: `version-${scenario.outcome}`,
            clientResponse: {
              outcome: scenario.outcome,
              evidenceKind: 'SIMULATED',
              ...(scenario.outcome === 'EXPIRED'
                ? {}
                : { receivedAt: literalReceivedAt }),
            },
          },
        },
      });
      await expect(
        offer.getByTitle(locale.frame, { exact: true }),
      ).toHaveAttribute('srcdoc', html);
      await expect(
        description(
          offer.locator('.offer-transmission-evidence'),
          locale.transmittedAt,
        ),
      ).toHaveText(locale.localTransmission);
      await expect(
        offer.getByRole('textbox', { name: locale.received, exact: true }),
      ).toHaveCount(0);
      expect(
        observed.requests.filter((request) =>
          /clients|snapshots|quality-checks/u.test(request),
        ),
      ).toHaveLength(0);
      await info.attach('exact-synthetic-commands', {
        body: JSON.stringify(observed.commands, null, 2),
        contentType: 'application/json',
      });
    });
  }
}

test('reads exact historical rejected evidence through all four locales without Client or Pricing authority or controls', async ({
  page,
}, info) => {
  const observed = await installTransmissionRoutes(page, { readOnly: true });
  await openInitial(page, info);
  const scenario = requests707.find(({ outcome }) => outcome === 'REJECTED');
  if (!scenario) throw new Error('Missing rejected history.');
  await openRequest(page, scenario.request, englishLocale);
  await page
    .locator('.offer-version-history')
    .getByRole('button', { name: 'Open version 1', exact: true })
    .click();
  const offer = page.locator('.offer-panel');
  await expect(
    offer.getByText('Historical version · read only', { exact: true }),
  ).toBeVisible();
  // Historical selection refreshes the version page before locale-only checks.
  await expect(
    offer.getByRole('button', { name: 'Open version 2', exact: true }),
  ).toBeEnabled();
  await expect(
    offer.getByRole('button', { name: 'Open version 1', exact: true }),
  ).toBeDisabled();
  const frame = offer.getByTitle(englishLocale.frame, { exact: true });
  const html = await frame.getAttribute('srcdoc');
  if (html === null)
    throw new Error('Missing historical immutable representation.');
  let current: Locale = englishLocale;
  for (const locale of offerTransmissionLocales) {
    const requests = observed.requests.length;
    await chooseLanguage({ page, current: current, next: locale });
    current = locale;
    expect(observed.requests).toHaveLength(requests);
    await expect(
      description(
        offer.locator('.offer-transmission-evidence'),
        locale.transmittedAt,
      ),
    ).toHaveText(locale.localTransmission);
    await expect(
      description(
        offer.locator('.offer-client-response-evidence'),
        locale.recordedReceived,
      ),
    ).toHaveText(locale.localReceived);
    expect(
      await description(
        offer.locator('.offer-client-response-evidence'),
        locale.clientReason,
      ).textContent(),
    ).toBe(literalClientReason);
    await expect(
      offer.getByRole('button', { name: locale.record, exact: true }),
    ).toHaveCount(0);
    await expect(
      offer.getByRole('button', { name: locale.acceptClient, exact: true }),
    ).toHaveCount(0);
    await expect(
      offer.getByTitle(locale.frame, { exact: true }),
    ).toHaveAttribute('srcdoc', html);
    await evidence(
      page,
      info,
      `${locale.code}-historical-readonly`,
      offer.locator('.offer-client-response-evidence'),
    );
  }
  expect(observed.commands).toHaveLength(0);
});

test('retires a real transmission authority after localized read refusal and suppresses its late recorded result', async ({
  page,
}, info) => {
  const observed = await installTransmissionRoutes(page, {
    authorityLoss: true,
  });
  const scenario = requests707.find(({ outcome }) => outcome === 'ACCEPTED');
  if (!scenario) throw new Error('Missing transmission scenario.');
  await openInitial(page, info);
  await openRequest(page, scenario.request, englishLocale);
  const locale = offerTransmissionLocales[2];
  if (!locale) throw new Error('Missing French fixture.');
  await chooseLanguage({ page, current: englishLocale, next: locale });
  const offer = page.locator('.offer-panel');
  await offer
    .getByRole('textbox', { name: locale.note, exact: true })
    .fill(literalSimulationNote);
  await offer
    .getByRole('checkbox', { name: locale.rules[5], exact: true })
    .check();
  await offer.getByRole('button', { name: locale.record, exact: true }).click();
  await expect(
    offer.getByText(locale.runningTransmission, { exact: true }),
  ).toBeVisible();
  await offer
    .locator('.offer-version-history')
    .getByRole('button', { name: locale.openOne, exact: true })
    .click();
  await expect(
    offer.getByRole('button', { name: locale.record, exact: true }),
  ).toHaveCount(0);
  observed.releaseTransmission();
  await expect.poll(() => observed.lateReplies.length).toBe(1);
  await expect(offer.locator('.offer-transmission-evidence')).toHaveCount(0);
  await expect(
    page.getByText('HIDDEN-RETIRED-AUTHORITY', { exact: true }),
  ).toHaveCount(0);
  const requests = observed.requests.length;
  const other = offerTransmissionLocales[0];
  if (!other) throw new Error('Missing Romanian fixture.');
  await chooseLanguage({ page, current: locale, next: other });
  expect(observed.requests).toHaveLength(requests);
  await expect(
    offer.getByRole('button', { name: other.record, exact: true }),
  ).toHaveCount(0);
  expect(observed.commands).toHaveLength(1);
  await evidence(page, info, 'retired-transmission-authority', offer);
});
