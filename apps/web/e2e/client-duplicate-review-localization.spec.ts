import { expect, test } from '@playwright/test';
import {
  captureReview,
  comparisonFixture,
  installReviewFixture,
  nextReference,
  reviewCompany,
  reviewCursor,
  reviewReference,
} from './prisme-duplicate-review.fixture';
import {
  chooseReviewLocale,
  responseGate,
  reviewLocales,
} from './client-duplicate-review-localization.fixture';

for (const [localeIndex, locale] of reviewLocales.entries()) {
  const nextLocale = reviewLocales[(localeIndex + 1) % reviewLocales.length];
  if (!nextLocale) throw new Error('Every test locale needs a next locale.');

  test(`retains exact-ID review state through delayed reads and uncertain attachment in ${locale.code}`, async ({
    page,
  }, testInfo) => {
    const state = await installReviewFixture(page);
    const listGate = responseGate();
    const detailGate = responseGate();
    const olderGate = responseGate();
    const putGate = responseGate();
    const apiRequests: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/'))
        apiRequests.push(`${request.method()} ${request.url()}`);
    });
    state.comparison = {
      ...state.comparison,
      proposal: {
        ...state.comparison.proposal,
        fields: {
          ...state.comparison.proposal.fields,
          contacts: state.comparison.proposal.fields.contacts.map(
            (contact) => ({
              ...contact,
              communicationPreferences: 'Română; русский\nemail {dimineața}',
            }),
          ),
        },
      },
      candidate: {
        ...state.comparison.candidate,
        version: 1234,
        contacts: state.comparison.candidate.contacts.map((contact) => ({
          ...contact,
          communicationPreferences: 'Français; English {après-midi}',
        })),
      },
    };
    let olderAttempts = 0;
    state.list = async (route) => {
      if (state.attached) return route.fulfill({ status: 503 });
      const cursor = new URL(route.request().url()).searchParams.get('cursor');
      if (!cursor) {
        await listGate.pending;
        return route.fulfill({
          json: {
            items: [{ duplicate_review_reference: reviewReference }],
            next_cursor: reviewCursor,
          },
        });
      }
      olderAttempts++;
      if (olderAttempts === 1) {
        await olderGate.pending;
        return route.fulfill({ status: 503 });
      }
      return route.fulfill({
        json: {
          items: [
            { duplicate_review_reference: reviewReference },
            { duplicate_review_reference: nextReference },
          ],
          next_cursor: null,
        },
      });
    };
    state.detail = async (route) => {
      await detailGate.pending;
      await route.fulfill({ json: state.comparison });
    };
    state.attach = async (route) => {
      expect(route.request().headers()['idempotency-key']).toBeUndefined();
      await putGate.pending;
      await route.fulfill({ status: 503 });
    };
    await page.addInitScript(
      (code) => localStorage.setItem('prisma-prim.interface-locale', code),
      locale.code,
    );
    const initialListRequest = page.waitForRequest((request) => {
      const url = new URL(request.url());
      return (
        request.method() === 'GET' &&
        url.pathname === '/api/client-duplicate-reviews' &&
        url.searchParams.get('page_size') === '20' &&
        !url.searchParams.has('cursor')
      );
    });
    await page.goto('/?frame=prisme#clients');
    const panel = page.locator('.client-duplicate-review');
    await expect(
      panel.getByText(locale.listLoading, { exact: true }),
    ).toBeVisible();
    await initialListRequest;
    const beforeListSwitch = [...apiRequests];
    await chooseReviewLocale(page, nextLocale.code);
    await expect(
      panel.getByText(nextLocale.listLoading, { exact: true }),
    ).toBeVisible();
    expect(apiRequests).toEqual(beforeListSwitch);
    listGate.release();
    const open = panel.getByRole('button', {
      name: nextLocale.open,
      exact: true,
    });
    await expect(open).toBeVisible();
    await expect(panel.getByText(reviewReference, { exact: true })).toHaveCount(
      0,
    );
    await expect(panel.getByText(reviewCursor, { exact: true })).toHaveCount(0);
    await expect(panel.getByText('TAX-236', { exact: true })).toHaveCount(0);
    const originalOpen = await open.elementHandle();
    await open.focus();
    const initialDetailRequest = page.waitForRequest(
      (request) =>
        request.method() === 'GET' &&
        new URL(request.url()).pathname ===
          `/api/client-duplicate-reviews/${reviewReference}`,
    );
    await page.keyboard.press('Enter');
    await expect(
      panel.getByText(nextLocale.detailLoading, { exact: true }),
    ).toBeVisible();
    await initialDetailRequest;
    const beforeDetailSwitch = [...apiRequests];
    await chooseReviewLocale(page, locale.code);
    await expect(
      panel.getByText(locale.detailLoading, { exact: true }),
    ).toBeVisible();
    expect(apiRequests).toEqual(beforeDetailSwitch);
    detailGate.release();
    const comparison = panel.getByRole('region', { name: locale.comparison });
    await expect(comparison.getByRole('heading')).toBeVisible();
    await expect(page.locator('#interface-locale')).toBeFocused();
    if (testInfo.project.name === 'narrow') {
      const visibleRows = comparison.getByRole('row');
      await expect(visibleRows).toHaveCount(9);
      for (const row of await visibleRows.all()) {
        await expect(row).toBeVisible();
        await expect(row.getByRole('cell')).toHaveCount(2);
        await expect(
          row.getByRole('cell', { name: new RegExp(`^${locale.proposal} `) }),
        ).toBeVisible();
        await expect(
          row.getByRole('cell', { name: new RegExp(`^${locale.candidate} `) }),
        ).toBeVisible();
      }
    } else {
      await expect(
        comparison.getByRole('columnheader', { name: locale.proposal }),
      ).toBeVisible();
      await expect(
        comparison.getByRole('columnheader', { name: locale.candidate }),
      ).toBeVisible();
    }
    await expect(
      comparison.getByText(locale.version, { exact: true }),
    ).toBeVisible();
    await expect(
      comparison.getByText('Română; русский email {dimineața}', {
        exact: true,
      }),
    ).toHaveCount(2);
    await expect(
      comparison.getByText('Français; English {après-midi}', { exact: true }),
    ).toHaveCount(2);
    await expect(comparison.getByRole('textbox')).toHaveCount(0);
    const rows = await comparison.getByRole('row').elementHandles();
    const table = await comparison.getByRole('table').elementHandle();
    const proposedName = await comparison
      .getByText(state.comparison.proposal.fields.displayName, { exact: true })
      .elementHandle();
    const candidateName = await comparison
      .getByText(state.comparison.candidate.displayName, { exact: true })
      .elementHandle();
    await comparison.getByRole('heading').scrollIntoViewIfNeeded();
    await captureReview(
      page,
      testInfo,
      `${locale.code}-localized-review-comparison`,
    );
    const older = panel.getByRole('button', {
      name: locale.older,
      exact: true,
    });
    const initialOlderRequest = page.waitForRequest((request) => {
      const url = new URL(request.url());
      return (
        request.method() === 'GET' &&
        url.pathname === '/api/client-duplicate-reviews' &&
        url.searchParams.get('page_size') === '20' &&
        url.searchParams.get('cursor') === reviewCursor
      );
    });
    await older.click();
    await expect(
      panel.getByRole('button', { name: locale.olderLoading, exact: true }),
    ).toBeDisabled();
    await initialOlderRequest;
    const beforeOlderSwitch = [...apiRequests];
    await chooseReviewLocale(page, nextLocale.code);
    await expect(
      panel.getByRole('button', { name: nextLocale.olderLoading, exact: true }),
    ).toBeDisabled();
    expect(apiRequests).toEqual(beforeOlderSwitch);
    olderGate.release();
    await expect(
      panel.getByText(nextLocale.olderFailed, { exact: true }),
    ).toBeVisible();
    const beforeFailedSwitch = [...apiRequests];
    await chooseReviewLocale(page, locale.code);
    await expect(
      panel.getByText(locale.olderFailed, { exact: true }),
    ).toBeVisible();
    expect(apiRequests).toEqual(beforeFailedSwitch);
    expect(
      await comparison
        .getByRole('table')
        .evaluate((node, original) => node === original, table),
    ).toBe(true);
    for (const [index, row] of rows.entries())
      expect(
        await comparison
          .getByRole('row')
          .nth(index)
          .evaluate((node, original) => node === original, row),
      ).toBe(true);
    expect(
      await panel
        .getByRole('button', { name: locale.open, exact: true })
        .evaluate((node, original) => node === original, originalOpen),
    ).toBe(true);
    expect(
      await comparison
        .getByText(state.comparison.proposal.fields.displayName, {
          exact: true,
        })
        .evaluate((node, original) => node === original, proposedName),
    ).toBe(true);
    expect(
      await comparison
        .getByText(state.comparison.candidate.displayName, { exact: true })
        .evaluate((node, original) => node === original, candidateName),
    ).toBe(true);
    await panel
      .getByText(locale.olderFailed, { exact: true })
      .scrollIntoViewIfNeeded();
    await captureReview(
      page,
      testInfo,
      `${locale.code}-localized-review-continuation-failure`,
    );
    await panel
      .getByRole('button', { name: locale.older, exact: true })
      .click();
    await expect(
      panel.getByRole('button', { name: locale.second, exact: true }),
    ).toBeVisible();
    expect(state.listRequests).toEqual([null, reviewCursor, reviewCursor]);
    const attach = panel.getByRole('button', {
      name: locale.attach,
      exact: true,
    });
    const initialPutRequest = page.waitForRequest(
      (request) =>
        request.method() === 'PUT' &&
        new URL(request.url()).pathname ===
          `/api/clients/${state.comparison.candidate.id}/active-company-relationship`,
    );
    await attach.click();
    await expect(
      panel.getByRole('button', { name: locale.pending, exact: true }),
    ).toBeDisabled();
    await expect(
      panel.getByRole('button', { name: locale.open, exact: true }),
    ).toBeDisabled();
    await initialPutRequest;
    const beforePutSwitch = [...apiRequests];
    await chooseReviewLocale(page, nextLocale.code);
    await expect(
      panel.getByRole('button', { name: nextLocale.pending, exact: true }),
    ).toBeDisabled();
    expect(apiRequests).toEqual(beforePutSwitch);
    putGate.release();
    await expect(
      panel.getByText(nextLocale.uncertain, { exact: true }),
    ).toBeVisible();
    await expect(
      panel.getByText(nextLocale.confirmed, { exact: true }),
    ).toHaveCount(0);
    const beforeUncertainSwitch = [...apiRequests];
    await chooseReviewLocale(page, locale.code);
    await expect(
      panel.getByText(locale.uncertain, { exact: true }),
    ).toBeVisible();
    expect(apiRequests).toEqual(beforeUncertainSwitch);
    expect(state.commands).toHaveLength(1);
    state.attach = undefined;
    await panel.getByRole('button', { name: locale.open, exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(
      panel
        .getByRole('region', { name: locale.comparison })
        .getByRole('heading'),
    ).toBeFocused();
    expect(state.commands).toHaveLength(1);
    const clientsBefore = state.clientReads;
    const activityBefore = state.activityReads;
    await panel
      .getByRole('button', { name: locale.attach, exact: true })
      .click();
    await expect(
      panel.getByText(locale.confirmed, { exact: true }),
    ).toBeVisible();
    await expect(
      panel.getByText(locale.listFailed, { exact: true }),
    ).toBeVisible();
    expect(state.clientReads).toBeGreaterThan(clientsBefore);
    expect(state.activityReads).toBeGreaterThan(activityBefore);
    expect(state.listRequests).toEqual([
      null,
      reviewCursor,
      reviewCursor,
      null,
    ]);
    expect(state.detailReads).toBe(2);
    expect(state.commands).toEqual(
      [0, 1].map(() => ({
        method: 'PUT',
        path: `/api/clients/${state.comparison.candidate.id}/active-company-relationship`,
        body: null,
        company: reviewCompany.id,
      })),
    );
    const beforeConfirmedSwitch = [...apiRequests];
    await chooseReviewLocale(page, nextLocale.code);
    await expect(
      panel.getByText(nextLocale.confirmed, { exact: true }),
    ).toBeVisible();
    await chooseReviewLocale(page, locale.code);
    await expect(
      panel.getByText(locale.confirmed, { exact: true }),
    ).toBeVisible();
    expect(apiRequests).toEqual(beforeConfirmedSwitch);
    await panel
      .getByText(locale.confirmed, { exact: true })
      .scrollIntoViewIfNeeded();
    await captureReview(
      page,
      testInfo,
      `${locale.code}-localized-review-confirmed-refresh-failure`,
    );
  });

  test(`keeps comparison-only authority, correction guidance and remediation separate in ${locale.code}`, async ({
    page,
  }, testInfo) => {
    const state = await installReviewFixture(page, 'director');
    state.list = (route) =>
      route.fulfill({
        json: new URL(route.request().url()).searchParams.has('cursor')
          ? {
              items: [{ duplicate_review_reference: reviewReference }],
              next_cursor: '70900000-0000-4000-8000-000000000017',
            }
          : { items: [], next_cursor: reviewCursor },
      });
    await page.addInitScript(
      (code) => localStorage.setItem('prisma-prim.interface-locale', code),
      locale.code,
    );
    await page.goto('/?frame=prisme#clients');
    const panel = page.getByRole('region', { name: locale.title });
    await expect(
      panel.getByText(locale.emptyPage, { exact: true }),
    ).toBeVisible();
    expect(state.listRequests).toEqual([null]);
    await panel
      .getByText(locale.emptyPage, { exact: true })
      .scrollIntoViewIfNeeded();
    await captureReview(
      page,
      testInfo,
      `${locale.code}-localized-review-empty-continuation`,
    );
    await panel
      .getByRole('button', { name: locale.older, exact: true })
      .click();
    await panel.getByRole('button', { name: locale.open, exact: true }).click();
    await expect(
      panel.getByText(locale.noAttach, { exact: true }),
    ).toBeVisible();
    await expect(
      panel.getByRole('button', { name: locale.attach, exact: true }),
    ).toHaveCount(0);
    await panel
      .getByText(locale.noAttach, { exact: true })
      .scrollIntoViewIfNeeded();
    await captureReview(
      page,
      testInfo,
      `${locale.code}-localized-review-without-attachment`,
    );
    state.comparison = comparisonFixture('correction');
    await panel.getByRole('button', { name: locale.open, exact: true }).click();
    await expect(
      panel.getByText(locale.correction, { exact: true }),
    ).toBeVisible();
    await expect(
      panel.getByText(locale.guidance, { exact: true }),
    ).toBeVisible();
    const comparison = panel.getByRole('region', { name: locale.comparison });
    await expect(comparison.getByRole('link')).toHaveCount(0);
    await expect(comparison.getByRole('button')).toHaveCount(0);
    await panel
      .getByText(locale.guidance, { exact: true })
      .scrollIntoViewIfNeeded();
    await captureReview(
      page,
      testInfo,
      `${locale.code}-localized-review-correction-guidance`,
    );
    state.detail = (route) =>
      route.fulfill({
        json: {
          outcome: 'multiple_duplicate_candidates_require_data_remediation',
          duplicate_review_reference: reviewReference,
        },
      });
    await panel.getByRole('button', { name: locale.open, exact: true }).click();
    await expect(
      panel.getByText(locale.remediation, { exact: true }),
    ).toBeVisible();
    await expect(panel.getByRole('table')).toHaveCount(0);
    await expect(
      panel.getByText(state.comparison.candidate.displayName, { exact: true }),
    ).toHaveCount(0);
    await panel
      .getByText(locale.remediation, { exact: true })
      .scrollIntoViewIfNeeded();
    await captureReview(
      page,
      testInfo,
      `${locale.code}-localized-review-remediation`,
    );
    state.detail = undefined;
    await panel.getByRole('button', { name: locale.open, exact: true }).click();
    await expect(panel.getByRole('table')).toBeVisible();
    state.list = (route) => route.fulfill({ status: 403 });
    await panel
      .getByRole('button', { name: locale.older, exact: true })
      .click();
    await expect(panel.getByText(locale.denied, { exact: true })).toBeVisible();
    await expect(panel.getByRole('table')).toHaveCount(0);
    await expect(
      panel.getByText(state.comparison.candidate.displayName, { exact: true }),
    ).toHaveCount(0);
    expect(state.commands).toEqual([]);
    await panel
      .getByText(locale.denied, { exact: true })
      .scrollIntoViewIfNeeded();
    await captureReview(
      page,
      testInfo,
      `${locale.code}-localized-review-authority-retired`,
    );
  });
}
