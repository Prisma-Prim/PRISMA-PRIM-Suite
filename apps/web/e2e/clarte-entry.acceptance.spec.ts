import { expect, test, type Page, type Route } from '@playwright/test';
import type { ActorContext } from '../src/access-types';
import { isPhoneLayout } from './clarte.fixture';

// The screens before the Clarté frame (#1531). Every API request is
// intercepted with fictional data; no live backend answers.
const invitationId = 'aaaaaaaa-0000-4000-8000-000000001531';
const workspaceId = '00000000-0000-4000-8000-000000001530';
const recipient = {
  internalUserId: '00000000-0000-4000-8000-000000001532',
  workspaceMembershipId: '00000000-0000-4000-8000-000000001533',
  workspaceId,
  workspaceName: 'Invited Workspace',
  displayName: 'Recipient',
  email: 'recipient@example.test',
  active: true,
  workspacePermissions: [],
} satisfies ActorContext;

async function screenshot(page: Page, name: string) {
  const width = isPhoneLayout(page) ? '390' : '1440';
  await page.screenshot({
    path: test.info().outputPath(`${name}-${width}.png`),
    fullPage: false,
  });
}

async function expectEntryLayout(page: Page) {
  const main = page.locator('main.clarte-page');
  await expect(main).toBeVisible();
  await expect(page.getByRole('banner')).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  return main;
}

async function expectClartePage(page: Page) {
  const main = await expectEntryLayout(page);
  await expect(
    main.getByRole('group', { name: 'Interface language' }),
  ).toBeVisible();
  await expect(
    page.getByRole('combobox', { name: 'Interface language' }),
  ).toHaveCount(0);
}

async function expectInvitationPage(page: Page) {
  const main = await expectEntryLayout(page);
  const card = main.locator('.clarte-page-card');
  const brand = card.locator('.clarte-page-brand');
  await expect(brand.locator('svg')).toBeVisible();
  await expect(brand).toHaveText('');
  await expect(card.getByRole('radio')).toHaveCount(0);
  const language = { name: 'Interface language' };
  await expect(card.getByRole('combobox', language)).toHaveCount(0);
  await expect(page.getByRole('combobox', language)).toBeVisible();
}

function signedOut(page: Page) {
  return page.addInitScript(() => {
    sessionStorage.setItem('deterministic-auth-state', 'signed-out');
  });
}

test('welcomes a signed-out visitor in Clarté and continues to sign-in', async ({
  page,
}) => {
  let protectedRequests = 0;
  await signedOut(page);
  await page.route('**/api/**', (route) => {
    protectedRequests += 1;
    return route.fulfill({ status: 500 });
  });

  await page.goto('/?interface=clarte');

  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'PRISMA-PRIM Suite',
    }),
  ).toBeVisible();
  await expect(page.getByText('Make every decision traceable.')).toBeVisible();
  await expect(page.getByText('Access is invitation-only.')).toBeVisible();
  await expect(page.getByRole('link', { name: /sign up/iu })).toHaveCount(0);
  await expectClartePage(page);
  await expect(page).toHaveURL(/\/$/u);

  await page.getByRole('radio', { name: 'Română' }).check();
  await expect(
    page.getByText('Faceți fiecare decizie trasabilă.'),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Continuați pentru autentificare' }),
  ).toBeVisible();
  await page.getByRole('radio', { name: 'English' }).check();
  // A later visit without the opt-in parameter keeps the tester's choice.
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'PRISMA-PRIM Suite' }),
  ).toBeVisible();
  await expect(page.getByText('Make every decision traceable.')).toBeVisible();
  await expectClartePage(page);
  if (isPhoneLayout(page)) {
    const card = page.locator('.clarte-page-card');
    await expect(card).toHaveCSS('padding-left', '28px');
    await expect(card).toHaveCSS('padding-right', '28px');
    await expect(
      card.locator('.clarte-language-options > label').evaluateAll((labels) => {
        const bounds = labels.map((label) => label.getBoundingClientRect());
        return {
          width:
            Math.max(...bounds.map(({ right }) => right)) -
            Math.min(...bounds.map(({ left }) => left)),
          minHeight: Math.min(...bounds.map(({ height }) => height)),
        };
      }),
    ).resolves.toEqual({ width: 292, minHeight: 44 });
  }
  await screenshot(page, 'clarte-entry-welcome');

  // The one way on is the first stop of the keyboard.
  const signIn = page.getByRole('link', { name: 'Continue to sign in' });
  await page.keyboard.press('Tab');
  await expect(signIn).toBeFocused();
  expect(
    await signIn.evaluate((element) => getComputedStyle(element).outlineStyle),
  ).not.toBe('none');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/sign-in$/u);
  await expect(page.getByRole('alert')).toHaveText(
    'Sign in is required to access this workspace.',
  );
  await expectClartePage(page);
  await screenshot(page, 'clarte-entry-sign-in');
  expect(protectedRequests).toBe(0);
});

test('shows the access check, inactive access, access error and signed-out states in Clarté', async ({
  page,
}) => {
  let pendingActor: Route | undefined;
  await page.route('**/api/**', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/access/current-actor', (route) => {
    pendingActor = route;
  });

  await page.goto('/?interface=clarte');
  await expect(page.getByRole('status')).toHaveText('Verifying your access…');
  await expectClartePage(page);
  await screenshot(page, 'clarte-entry-checking');

  await expect.poll(() => Boolean(pendingActor)).toBe(true);
  if (!pendingActor) throw new Error('Expected the pending access check');
  await pendingActor.fulfill({ status: 403 });
  await expect(page.getByRole('alert')).toHaveText(
    'Your access to this workspace is inactive.',
  );
  await expectClartePage(page);
  await screenshot(page, 'clarte-entry-inactive');

  await page.route('**/api/access/current-actor', (route) =>
    route.fulfill({ status: 503 }),
  );
  await page.reload();
  await expect(page.getByRole('alert')).toHaveText(
    'We could not verify your access. Please try again.',
  );
  await expectClartePage(page);
  await screenshot(page, 'clarte-entry-error');

  await page.evaluate(() =>
    sessionStorage.setItem('deterministic-auth-state', 'signed-out'),
  );
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'PRISMA-PRIM Suite' }),
  ).toBeVisible();
  await expect(page.getByText('Make every decision traceable.')).toBeVisible();
  await expectClartePage(page);
});

test('refuses an invalid invitation ticket in Clarté without entering the Workspace', async ({
  page,
}) => {
  let attempts = 0;
  await page.route('**/api/**', (route) => route.fulfill({ status: 500 }));
  await page.route('**/api/access/invitations/accept', (route) => {
    attempts += 1;
    return route.fulfill({
      status: 403,
      json: { message: 'Forbidden', statusCode: 403 },
    });
  });

  await page.goto(
    `/accept-invitation?invitation=${invitationId}&__clerk_ticket=invalid_ticket&interface=clarte`,
  );
  await expect(
    page.getByRole('heading', { level: 1, name: 'Join your Workspace' }),
  ).toBeVisible();
  await expectInvitationPage(page);
  await page.getByRole('combobox', { name: 'Interface language' }).click();
  await expect(page.getByRole('option')).toHaveCount(4);
  await page.getByRole('option', { name: 'Română' }).click();
  await expect(
    page.getByRole('button', { name: 'Acceptați invitația' }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: 'Limba interfeței' }).click();
  await page.getByRole('option', { name: 'English' }).click();
  await screenshot(page, 'clarte-entry-invitation');

  await page.getByRole('button', { name: 'Accept invitation' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'This invitation cannot be accepted with your current access. Ask a Workspace Owner for help.',
  );
  await expect(
    page.getByRole('button', { name: 'Accept invitation' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Use another account' }),
  ).toBeEnabled();
  await expect(page.getByText('Invited Workspace')).toHaveCount(0);
  expect(attempts).toBe(1);
  expect(page.url()).not.toContain('invalid_ticket');
  await expectInvitationPage(page);
  await screenshot(page, 'clarte-entry-invitation-refused');
});

test('accepts an invitation in Clarté after an uncertain attempt and opens the Workspace', async ({
  page,
}) => {
  const keys: string[] = [];
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/access/current-actor')) {
      expect(route.request().headers()['x-workspace-context-id']).toBe(
        workspaceId,
      );
      return route.fulfill({ json: recipient });
    }
    if (path.endsWith('/activity-log'))
      return route.fulfill({ json: { events: [] } });
    return route.fulfill({ json: [] });
  });
  await page.route('**/api/access/invitations/accept', (route) => {
    expect(route.request().postDataJSON()).toEqual({
      invitationId,
      ticket: 'opaque_ticket',
    });
    keys.push(route.request().headers()['idempotency-key'] ?? '');
    if (keys.length === 1) return route.fulfill({ status: 503, json: {} });
    return route.fulfill({
      status: 201,
      json: {
        invitationId,
        workspaceId,
        internalUserId: recipient.internalUserId,
        workspaceMembershipId: recipient.workspaceMembershipId,
        acceptedAt: '2026-11-28T09:00:00.000Z',
      },
    });
  });

  await page.goto(
    `/accept-invitation?invitation=${invitationId}&__clerk_ticket=opaque_ticket&interface=clarte`,
  );
  await page.getByRole('button', { name: 'Accept invitation' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Acceptance could not be confirmed. Retry to check the same request safely.',
  );
  await expectInvitationPage(page);
  await screenshot(page, 'clarte-entry-invitation-retry');

  await page.getByRole('button', { name: 'Retry acceptance' }).click();
  await expect(
    page.getByRole('button', { name: 'Go to a screen' }),
  ).toBeVisible();
  await expect(page.getByText('Hello, Recipient.')).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBeTruthy();
  expect(keys[1]).toBe(keys[0]);
  expect(page.url()).not.toContain('opaque_ticket');
  await expect(page.locator('main.clarte-page')).toHaveCount(0);
  await screenshot(page, 'clarte-entry-invitation-accepted');
});

test('returns the ChatGPT consent code to the opening window from a Clarté callback window', async ({
  page,
}) => {
  await signedOut(page);
  await page.route('**/api/**', (route) => route.fulfill({ status: 500 }));
  await page.goto('/?interface=clarte');
  await expectClartePage(page);
  const openerUrl = page.url();
  // The fixture plays the window that asked for consent.
  await page.evaluate(() => {
    const received: unknown[] = [];
    Reflect.set(window, 'fixtureCallbacks', received);
    window.addEventListener('message', (event) => {
      if (event.origin === window.location.origin) received.push(event.data);
    });
  });

  const [callback] = await Promise.all([
    page.waitForEvent('popup'),
    page.evaluate(() => {
      Reflect.set(
        window,
        'fixtureCallbackWindow',
        window.open(
          '/chatgpt/callback?state=fictional-state&code=fictional-code',
          'prisma-chatgpt-fixture',
          'popup,width=560,height=760',
        ),
      );
    }),
  ]);

  await expect(callback.getByRole('status')).toHaveText(
    'Completing the connection…',
  );
  await expect(
    callback.getByRole('heading', { level: 1, name: 'ChatGPT connection' }),
  ).toBeVisible();
  await expect(callback.locator('main.clarte-page')).toBeVisible();
  expect(new URL(callback.url()).pathname).toBe('/chatgpt/callback');
  expect(new URL(callback.url()).search).toBe('');
  await callback.screenshot({
    path: test
      .info()
      .outputPath(
        `clarte-entry-chatgpt-callback-${isPhoneLayout(page) ? '390' : '1440'}.png`,
      ),
  });
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, 'fixtureCallbacks')))
    .toEqual([
      {
        type: 'prisma-chatgpt-callback',
        state: 'fictional-state',
        code: 'fictional-code',
        error: false,
      },
    ]);

  const closed = callback.waitForEvent('close');
  await page.evaluate(() => {
    const child: unknown = Reflect.get(window, 'fixtureCallbackWindow');
    if (
      typeof child !== 'object' ||
      child === null ||
      !('postMessage' in child) ||
      typeof child.postMessage !== 'function'
    )
      throw new Error('No callback window');
    child.postMessage(
      { type: 'prisma-chatgpt-received', state: 'fictional-state' },
      window.location.origin,
    );
  });
  await closed;
  expect(page.url()).toBe(openerUrl);
});
