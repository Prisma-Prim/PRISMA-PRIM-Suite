import { expect, test } from '@playwright/test';
import {
  attachReviewButton,
  captureReview,
  installReviewFixture,
  comparisonFixture,
  nextReference,
  reviewCursor,
  openReviewButton,
  reviewPanel,
  reviewReference,
} from './prisme-duplicate-review.fixture';

test('compares read-only sources and deliberately attaches the existing Client in Prisme', async ({
  page,
}, testInfo) => {
  const state = await installReviewFixture(page);
  await page.goto('/?frame=prisme#clients');
  await expect(openReviewButton(page)).toBeVisible();
  await expect(reviewPanel(page).getByText(reviewReference)).toHaveCount(0);
  await expect(reviewPanel(page).getByText('TAX-236')).toHaveCount(0);
  expect(state.detailReads).toBe(0);
  await reviewPanel(page).scrollIntoViewIfNeeded();
  await captureReview(page, testInfo, 'review-list');

  await openReviewButton(page).focus();
  await page.keyboard.press('Enter');
  const comparison = page.getByRole('region', {
    name: 'Compare the proposed and existing Client',
  });
  await expect(comparison.getByRole('heading')).toBeFocused();
  await expect(
    comparison.getByText('Registration proposal · not saved'),
  ).toBeVisible();
  await expect(
    comparison.getByText('Version 4', { exact: true }),
  ).toBeVisible();
  await expect(
    comparison.getByText('Ana Ionescu', { exact: true }),
  ).toHaveCount(2);
  await expect(
    comparison.getByText('Contact telephone', { exact: true }),
  ).toHaveCount(4);
  await expect(
    comparison.getByText('Contact email', { exact: true }),
  ).toHaveCount(4);
  await expect(comparison.getByRole('textbox')).toHaveCount(0);
  await expect(
    comparison.getByText('Not provided', { exact: true }).first(),
  ).toBeVisible();
  await comparison
    .getByRole('heading')
    .evaluate((heading) => heading.scrollIntoView({ block: 'start' }));
  await captureReview(page, testInfo, 'review-comparison');
  await comparison
    .getByText('Contacts', { exact: true })
    .evaluate((label) => label.scrollIntoView({ block: 'start' }));
  await captureReview(page, testInfo, 'review-contacts');

  let release = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  state.attach = async (route) => {
    await pending;
    state.attached = true;
    await route.fulfill({
      json: { ...state.comparison.candidate, relatedToActiveCompany: true },
    });
  };
  const clientsBefore = state.clientReads;
  const activityBefore = state.activityReads;
  await attachReviewButton(page).click();
  await expect(
    reviewPanel(page).getByRole('button', { name: 'Adding existing Client…' }),
  ).toBeDisabled();
  await expect(openReviewButton(page)).toBeDisabled();
  await expect(
    reviewPanel(page).getByText(
      'Existing Client linked to the active Company.',
    ),
  ).toHaveCount(0);
  await captureReview(page, testInfo, 'review-attachment-pending');
  release();
  await expect(
    reviewPanel(page)
      .getByRole('status')
      .filter({ hasText: 'Existing Client linked to the active Company.' }),
  ).toHaveText('Existing Client linked to the active Company.');
  await expect(
    page.getByRole('heading', { name: state.comparison.candidate.displayName }),
  ).toBeVisible();
  expect(state.clientReads).toBeGreaterThan(clientsBefore);
  expect(state.activityReads).toBeGreaterThan(activityBefore);
  expect(state.listRequests).toHaveLength(2);
  expect(state.commands).toEqual([
    {
      method: 'PUT',
      path: `/api/clients/${state.comparison.candidate.id}/active-company-relationship`,
      body: null,
      company: state.actor.activeCompany?.id,
    },
  ]);
  await expect(
    reviewPanel(page).getByText(/resolved|no longer available/i),
  ).toHaveCount(0);
  await reviewPanel(page)
    .getByText('Existing Client linked to the active Company.')
    .evaluate((notice) => notice.scrollIntoView({ block: 'center' }));
  await captureReview(page, testInfo, 'review-attachment-confirmed');
});

test('continues empty pages explicitly and retains rows and cursor after a continuation failure', async ({
  page,
}, testInfo) => {
  const state = await installReviewFixture(page);
  const secondCursor = '23600000-0000-4000-8000-000000000007';
  let failed = false;
  state.list = (route) => {
    const cursor = new URL(route.request().url()).searchParams.get('cursor');
    if (cursor === null)
      return route.fulfill({ json: { items: [], next_cursor: reviewCursor } });
    if (cursor === reviewCursor)
      return route.fulfill({
        json: {
          items: [{ duplicate_review_reference: reviewReference }],
          next_cursor: secondCursor,
        },
      });
    expect(cursor).toBe(secondCursor);
    if (!failed) {
      failed = true;
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
  await page.goto('/?frame=prisme#clients');
  await expect(
    reviewPanel(page).getByText(
      'No review on this page. More reviews may be available.',
    ),
  ).toBeVisible();
  await expect(
    reviewPanel(page).getByText(
      'No possible duplicate review is currently available.',
    ),
  ).toHaveCount(0);
  expect(state.listRequests).toEqual([null]);
  await reviewPanel(page).scrollIntoViewIfNeeded();
  await captureReview(page, testInfo, 'review-empty-continuation');
  const more = reviewPanel(page).getByRole('button', {
    name: 'Load more possible duplicate reviews',
  });
  await more.click();
  await expect(openReviewButton(page)).toBeVisible();
  expect(state.listRequests).toEqual([null, reviewCursor]);
  await more.click();
  await expect(reviewPanel(page).getByRole('alert')).toHaveText(
    'More duplicate reviews could not be loaded safely. Try again.',
  );
  await expect(openReviewButton(page)).toBeVisible();
  expect(state.detailReads).toBe(0);
  expect(state.listRequests).toEqual([null, reviewCursor, secondCursor]);
  await captureReview(page, testInfo, 'review-continuation-failure');
  await more.click();
  await expect(
    reviewPanel(page).getByRole('button', {
      name: 'Review possible duplicate 2',
    }),
  ).toBeVisible();
  await expect(
    reviewPanel(page).getByRole('button', {
      name: /Review possible duplicate/,
    }),
  ).toHaveCount(2);
  await expect(more).toHaveCount(0);
  expect(state.listRequests).toEqual([
    null,
    reviewCursor,
    secondCursor,
    secondCursor,
  ]);
  for (const opaque of [
    reviewReference,
    nextReference,
    reviewCursor,
    secondCursor,
  ])
    await expect(reviewPanel(page).getByText(opaque)).toHaveCount(0);
});

test('retries an initial list error and reopens unavailable, failed and remediation reviews safely', async ({
  page,
}, testInfo) => {
  const state = await installReviewFixture(page);
  state.list = (route) => route.fulfill({ status: 503 });
  await page.goto('/?frame=prisme#clients');
  await expect(reviewPanel(page).getByRole('alert')).toHaveText(
    'The duplicate review could not be loaded safely.',
  );
  await captureReview(page, testInfo, 'review-list-error');
  state.list = undefined;
  await reviewPanel(page)
    .getByRole('button', { name: 'Retry review list' })
    .click();
  await openReviewButton(page).click();
  await expect(attachReviewButton(page)).toBeVisible();
  state.detail = (route) => route.fulfill({ status: 404 });
  await openReviewButton(page).click();
  await expect(
    reviewPanel(page).getByText(
      'This review is no longer available. Its data or authority may have changed.',
    ),
  ).toBeVisible();
  await expect(
    reviewPanel(page).getByText(state.comparison.candidate.displayName),
  ).toHaveCount(0);
  expect(state.listRequests).toHaveLength(3);
  await captureReview(page, testInfo, 'review-unavailable');
  state.detail = (route) => route.abort('failed');
  await openReviewButton(page).click();
  await expect(
    reviewPanel(page).getByText(
      'The duplicate review could not be loaded safely.',
    ),
  ).toBeVisible();
  state.detail = (route) =>
    route.fulfill({
      json: {
        outcome: 'multiple_duplicate_candidates_require_data_remediation',
        duplicate_review_reference: reviewReference,
      },
    });
  await openReviewButton(page).click();
  await expect(
    reviewPanel(page).getByText(/Data remediation is required/),
  ).toBeVisible();
  await expect(reviewPanel(page).getByRole('table')).toHaveCount(0);
  await expect(attachReviewButton(page)).toHaveCount(0);
  await captureReview(page, testInfo, 'review-remediation');
  expect(state.commands).toEqual([]);
});

test('keeps correction guidance read-only without inventing a dossier target', async ({
  page,
}, testInfo) => {
  const state = await installReviewFixture(page);
  state.comparison = comparisonFixture('correction');
  state.comparison.proposal.fields.contacts = [];
  state.comparison.candidate.contacts = [];
  await page.goto('/?frame=prisme#clients');
  await openReviewButton(page).click();
  await expect(
    reviewPanel(page).getByText('Correction proposal · not saved'),
  ).toBeVisible();
  await expect(
    reviewPanel(page).getByText('No Contacts proposed.'),
  ).toBeVisible();
  await expect(
    reviewPanel(page).getByText('No shared Contacts recorded.'),
  ).toBeVisible();
  await expect(
    reviewPanel(page).getByText(
      'Return to the relevant dossier and submit an ordinary correction if appropriate.',
    ),
  ).toBeVisible();
  await expect(reviewPanel(page).getByRole('link')).toHaveCount(0);
  await expect(reviewPanel(page).getByRole('textbox')).toHaveCount(0);
  await expect(attachReviewButton(page)).toHaveCount(0);
  await captureReview(page, testInfo, 'review-correction-guidance');
  expect(state.commands).toEqual([]);
});

test('allows Director v2 comparison without attachment and respects an existing relationship', async ({
  page,
}, testInfo) => {
  const state = await installReviewFixture(page, 'director');
  await page.goto('/?frame=prisme#clients');
  await openReviewButton(page).click();
  await expect(
    reviewPanel(page).getByText(state.comparison.candidate.displayName),
  ).toBeVisible();
  await expect(attachReviewButton(page)).toHaveCount(0);
  await expect(
    reviewPanel(page).getByText(
      'Linking this Client is not available with your current access.',
    ),
  ).toBeVisible();
  await captureReview(page, testInfo, 'review-director-read-only');
  expect(state.commands).toEqual([]);
  state.comparison.candidate.relatedToActiveCompany = true;
  await openReviewButton(page).click();
  await expect(
    reviewPanel(page).getByText(
      'The existing Client is already linked to the active Company.',
    ),
  ).toBeVisible();
  await expect(attachReviewButton(page)).toHaveCount(0);
});

for (const authority of ['owner', 'v1', 'partial'] satisfies (
  'owner' | 'v1' | 'partial'
)[]) {
  test(`${authority} authority does not expose the candidate`, async ({
    page,
  }) => {
    const state = await installReviewFixture(page, authority);
    await page.goto('/?frame=prisme#clients');
    await expect(
      page.getByRole('region', { name: 'Clients', exact: true }),
    ).toBeVisible();
    if (authority === 'partial')
      await expect(
        reviewPanel(page).getByText(
          'No possible duplicate review is currently available.',
        ),
      ).toBeVisible();
    else await expect(reviewPanel(page)).toHaveCount(0);
    await expect(openReviewButton(page)).toHaveCount(0);
    await expect(
      page.getByText(state.comparison.candidate.displayName),
    ).toHaveCount(0);
    expect(state.detailReads).toBe(0);
    expect(state.commands).toEqual([]);
  });
}

test('separates confirmed attachment from subsequent list and Activity Log failures', async ({
  page,
}, testInfo) => {
  const state = await installReviewFixture(page);
  await page.goto('/?frame=prisme#clients');
  await openReviewButton(page).click();
  await expect(attachReviewButton(page)).toBeVisible();
  state.list = (route) => route.fulfill({ status: 503 });
  state.activityStatus = 503;
  await attachReviewButton(page).click();
  await expect(
    reviewPanel(page).getByText(
      'Existing Client linked to the active Company.',
    ),
  ).toBeVisible();
  await expect(reviewPanel(page).getByRole('alert')).toHaveText(
    'The duplicate review could not be loaded safely.',
  );
  await expect(
    page.getByRole('heading', { name: state.comparison.candidate.displayName }),
  ).toBeVisible();
  await captureReview(page, testInfo, 'review-confirmed-refresh-failure');
  state.list = undefined;
  await reviewPanel(page)
    .getByRole('button', { name: 'Retry review list' })
    .click();
  await expect(
    reviewPanel(page).getByText(
      'No possible duplicate review is currently available.',
    ),
  ).toBeVisible();
  await expect(
    reviewPanel(page).getByText(
      'Existing Client linked to the active Company.',
    ),
  ).toBeVisible();
  expect(state.commands).toHaveLength(1);
});

test('keeps an uncertain PUT separate from success and retries only after a deliberate reopening', async ({
  page,
}, testInfo) => {
  const state = await installReviewFixture(page);
  state.attach = (route) => route.abort('failed');
  await page.goto('/?frame=prisme#clients');
  await openReviewButton(page).click();
  await attachReviewButton(page).click();
  await expect(
    reviewPanel(page).getByText(
      'The Company attachment could not be confirmed. Reopen the review before trying again.',
    ),
  ).toBeVisible();
  await expect(
    reviewPanel(page).getByText(
      'Existing Client linked to the active Company.',
    ),
  ).toHaveCount(0);
  await expect(reviewPanel(page).getByRole('table')).toHaveCount(0);
  await captureReview(page, testInfo, 'review-attachment-failure');
  state.attach = undefined;
  await openReviewButton(page).click();
  await attachReviewButton(page).click();
  await expect(
    reviewPanel(page).getByText(
      'Existing Client linked to the active Company.',
    ),
  ).toBeVisible();
  expect(state.commands).toHaveLength(2);
  expect(state.commands[0]).toEqual(state.commands[1]);
});

test('preserves the mounted owner across frame and section navigation without async focus or scroll jumps', async ({
  page,
}) => {
  const state = await installReviewFixture(page);
  let releaseDetail = () => {};
  const pendingDetail = new Promise<void>((resolve) => {
    releaseDetail = resolve;
  });
  state.detail = async (route) => {
    await pendingDetail;
    await route.fulfill({ json: state.comparison });
  };
  await page.goto('/?frame=prisme#clients');
  await openReviewButton(page).focus();
  await page.keyboard.press('Enter');
  await expect(
    reviewPanel(page).getByText('Loading the duplicate comparison…'),
  ).toBeVisible();
  const navigate = async (label: string) => {
    const menu = page.getByRole('button', { name: 'Open navigation' });
    if (await menu.isVisible()) await menu.click();
    await page
      .getByRole('navigation', { name: 'Primary navigation' })
      .getByRole('link', { name: label, exact: true })
      .click();
  };
  const position = () =>
    page.evaluate(() => ({
      scroll: window.scrollY,
      focus: document.activeElement?.outerHTML,
    }));
  await navigate('Overview');
  const beforeDetail = await position();
  releaseDetail();
  await expect(page.locator('.client-review-comparison')).toBeAttached();
  expect(await position()).toEqual(beforeDetail);
  await expect(
    page.getByText(state.comparison.candidate.displayName),
  ).toBeHidden();
  await navigate('Clients');
  await expect(attachReviewButton(page)).toBeVisible();
  const menu = page.getByRole('button', { name: 'Open navigation' });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('button', { name: 'Use classic frame' }).click();
  await expect(attachReviewButton(page)).toBeVisible();
  await page.getByRole('button', { name: 'Try Prisme' }).click();
  await expect(attachReviewButton(page)).toBeVisible();
  expect(state.detailReads).toBe(1);
  expect(state.listRequests).toHaveLength(1);

  let releaseAttach = () => {};
  const pendingAttach = new Promise<void>((resolve) => {
    releaseAttach = resolve;
  });
  state.attach = async (route) => {
    await pendingAttach;
    state.attached = true;
    await route.fulfill({ json: state.comparison.candidate });
  };
  await attachReviewButton(page).click();
  await expect(
    reviewPanel(page).getByRole('button', { name: 'Adding existing Client…' }),
  ).toBeDisabled();
  await navigate('Activity Log');
  const beforeAttach = await position();
  releaseAttach();
  await expect(
    page.getByText('Existing Client linked to the active Company.'),
  ).toBeAttached();
  expect(await position()).toEqual(beforeAttach);
  await expect(
    page.getByText('Existing Client linked to the active Company.'),
  ).toBeHidden();
  await navigate('Clients');
  await expect(
    reviewPanel(page).getByText(
      'Existing Client linked to the active Company.',
    ),
  ).toBeVisible();
  expect(state.commands).toHaveLength(1);
});

test('does not retain comparison data after the server denies a still-mounted reviewer', async ({
  page,
}) => {
  const state = await installReviewFixture(page);
  await page.goto('/?frame=prisme#clients');
  await openReviewButton(page).click();
  await expect(attachReviewButton(page)).toBeVisible();
  state.detail = (route) => route.fulfill({ status: 403 });
  await openReviewButton(page).click();
  await expect(
    reviewPanel(page).getByText(
      'This review is no longer available. Its data or authority may have changed.',
    ),
  ).toBeVisible();
  await expect(
    reviewPanel(page).getByText(state.comparison.candidate.displayName),
  ).toHaveCount(0);
  await expect(attachReviewButton(page)).toHaveCount(0);
  expect(state.commands).toEqual([]);
});

test('does not offer attachment for an already-related candidate even with client.manage', async ({
  page,
}) => {
  const state = await installReviewFixture(page);
  state.comparison.candidate.relatedToActiveCompany = true;
  await page.goto('/?frame=prisme#clients');
  await openReviewButton(page).click();
  await expect(
    reviewPanel(page).getByText(
      'The existing Client is already linked to the active Company.',
    ),
  ).toBeVisible();
  await expect(attachReviewButton(page)).toHaveCount(0);
  expect(state.commands).toEqual([]);
});

test('clears a displayed candidate when continuation is denied after authority revalidation', async ({
  page,
}) => {
  const state = await installReviewFixture(page);
  state.list = (route) =>
    route.fulfill({
      json: {
        items: [{ duplicate_review_reference: reviewReference }],
        next_cursor: reviewCursor,
      },
    });
  await page.goto('/?frame=prisme#clients');
  await openReviewButton(page).click();
  await expect(attachReviewButton(page)).toBeVisible();
  state.list = (route) => route.fulfill({ status: 403 });
  await reviewPanel(page)
    .getByRole('button', { name: 'Load more possible duplicate reviews' })
    .click();
  await expect(
    reviewPanel(page).getByText(
      'Review access is not available with your current authority.',
    ),
  ).toBeVisible();
  await expect(reviewPanel(page).getByRole('table')).toHaveCount(0);
  await expect(attachReviewButton(page)).toHaveCount(0);
  expect(state.commands).toEqual([]);
});
