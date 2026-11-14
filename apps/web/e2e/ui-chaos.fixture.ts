import {
  expect,
  test as base,
  type Locator,
  type Page,
  type Request,
  type TestInfo,
} from '@playwright/test';
import { basename } from 'node:path';
import {
  CHAOS_SEED_VARIABLE,
  chaosReplayCommand,
  createChaosPlan,
  parseChaosSeed,
} from '../../../scripts/ui-chaos.mjs';

export { expect };

/**
 * Seeded UI chaos (#1376, stage 2 of #1155). An acceptance journey opts in by
 * importing `test` from this file instead of `@playwright/test`. Without the
 * seed that `pnpm verify:journey --chaos` sets, nothing changes. With it, the
 * journey's page gets the seed's perturbations (response delays, a slowed CPU,
 * double submits, back then forward after a section change), and the journey
 * also fails on a console or page error, or on a loading state still shown
 * once the network is idle. The failure names the seed and the command that
 * replays it. The delays add up, so the journey's own time limit stretches
 * by CHAOS_TIMEOUT_FACTOR; the runner lengthens each assertion's wait.
 */
const journeyTest = base.extend({
  page: async ({ page }, use, testInfo) => {
    const value = process.env[CHAOS_SEED_VARIABLE];
    if (value === undefined) {
      await use(page);
      return;
    }
    const seed = parseChaosSeed(value);
    if (seed === null)
      throw new Error(
        `${CHAOS_SEED_VARIABLE} must be a whole number from 1 to 2147483647.`,
      );
    const chaos = await startChaos(page, testInfo, seed);
    try {
      await use(page);
    } finally {
      chaos.restoreClicks();
    }
    await chaos.finish();
  },
});
const CHAOS_TIMEOUT_FACTOR = 3;
const setJourneyTimeout = journeyTest.setTimeout;
journeyTest.setTimeout = (timeout: number) =>
  setJourneyTimeout(
    process.env[CHAOS_SEED_VARIABLE] === undefined
      ? timeout
      : timeout * CHAOS_TIMEOUT_FACTOR,
  );
export const test = journeyTest;

/**
 * The page's API requests still pending in its current document. A new
 * document drops the previous one's requests, and under an interception
 * Playwright never reports their end, so they leave the set when the main
 * frame commits the new document.
 */
export function pendingApiRequests(page: Page): ReadonlySet<Request> {
  const pending = new Set<Request>();
  let navigating = false;
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame())
      navigating = true;
    else if (new URL(request.url()).pathname.startsWith('/api/'))
      pending.add(request);
  });
  page.on('framenavigated', (frame) => {
    if (frame !== page.mainFrame() || !navigating) return;
    navigating = false;
    pending.clear();
  });
  page.on('requestfinished', (request) => pending.delete(request));
  page.on('requestfailed', (request) => pending.delete(request));
  return pending;
}

/** Chromium's resource line for an HTTP 4xx answer: a deliberate refusal. */
const DELIBERATE_REFUSAL =
  /^Failed to load resource: the server responded with a status of 4\d\d\b/u;
/** The network counts as idle after this long without any request event. */
const IDLE_MILLISECONDS = 500;
const IDLE_DEADLINE_MILLISECONDS = 15_000;
/** Rendering after the last response gets this long to drop its loading state. */
const LOADING_DEADLINE_MILLISECONDS = 10_000;

type Click = Locator['click'];
type ClickOwner = { click: Click };
type ClickTarget = { kind: 'submit' | 'section' | 'other'; name: string };

// Playwright exposes no hook around a journey's clicks. The supported
// contract used here is the public Locator.click method, shared by every
// locator through its prototype; it is checked before it is wrapped.
function isClickOwner(value: unknown): value is ClickOwner {
  return (
    typeof value === 'object' &&
    value !== null &&
    'click' in value &&
    typeof value.click === 'function'
  );
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function clickTarget(locator: Locator): Promise<ClickTarget> {
  try {
    return await locator.evaluate(
      (element): ClickTarget => {
        if (
          element instanceof HTMLButtonElement &&
          element.type === 'submit' &&
          element.form !== null
        )
          return { kind: 'submit', name: element.textContent?.trim() ?? '' };
        if (
          element instanceof HTMLAnchorElement &&
          element.closest('nav') !== null &&
          element.hash !== '' &&
          element.origin === window.location.origin &&
          element.pathname === window.location.pathname
        )
          return { kind: 'section', name: element.hash };
        return { kind: 'other', name: '' };
      },
      undefined,
      { timeout: 1_000 },
    );
  } catch {
    // Not attached yet, or not one element: the journey's own click decides.
    return { kind: 'other', name: '' };
  }
}

async function visibleLoadingStates(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const found: string[] = [];
    for (const element of document.querySelectorAll('[aria-busy="true"]'))
      if (element.checkVisibility())
        found.push(`aria-busy ${element.tagName.toLowerCase()}`);
    // The interface names a pending state like "Loading Clients…" or
    // "Checking summary availability…", always ending with an ellipsis.
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim() ?? '';
      if (
        /^\p{Lu}\p{Ll}+ing\b.*…$/u.test(text) &&
        node.parentElement?.checkVisibility()
      )
        found.push(text);
    }
    return found;
  });
}

async function startChaos(page: Page, testInfo: TestInfo, seed: number) {
  const journey = basename(testInfo.file).replace(
    /\.acceptance\.spec\.ts$/u,
    '',
  );
  const replay = chaosReplayCommand(journey, seed);
  const project = testInfo.project.name;
  const plan = createChaosPlan({ seed, scope: `${project} ${testInfo.title}` });
  testInfo.annotations.push({
    type: 'ui-chaos',
    description: `seed ${seed}; ${plan.describe()}; replay: ${replay}`,
  });
  console.log(
    `UI chaos seed ${seed} (${project}): ${plan.describe()}. Replay: ${replay}`,
  );

  if (plan.cpuThrottleRate > 1) {
    const session = await page.context().newCDPSession(page);
    await session.send('Emulation.setCPUThrottlingRate', {
      rate: plan.cpuThrottleRate,
    });
  }

  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !DELIBERATE_REFUSAL.test(message.text()))
      errors.push(`console error: ${message.text()}`);
  });
  page.on('pageerror', (error) =>
    errors.push(`uncaught page error: ${error.message}`),
  );

  const inFlight = pendingApiRequests(page);
  let lastActivity = Date.now();
  const touch = () => {
    lastActivity = Date.now();
  };
  page.on('request', touch);
  page.on('requestfinished', touch);
  page.on('requestfailed', touch);

  // Registered before the journey's own routes, so theirs run first and fall
  // back here with their header overrides. The API handles each request when
  // the page sends it, so the server sees the page's own order; only the
  // answer comes back late.
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const delay = plan.responseDelay({
      method: request.method(),
      url: request.url(),
      companyContextId: request.headers()['x-company-context-id'],
    });
    let response;
    try {
      response = await route.fetch();
    } catch {
      // No answer at all, as when the page closes: the request fails.
      await route.abort().catch(() => undefined);
      return;
    }
    await wait(delay);
    // The page may have dropped the request meanwhile; the late answer then
    // reaches nobody.
    await route.fulfill({ response }).catch(() => undefined);
  });

  const prototype: unknown = Object.getPrototypeOf(page.locator('body'));
  if (!isClickOwner(prototype))
    throw new Error('UI chaos needs the Playwright Locator click method.');
  const click = prototype.click;
  prototype.click = async function chaosClick(
    this: Locator,
    options?: Parameters<Click>[0],
  ) {
    if (this.page() !== page) return click.call(this, options);
    const target = await clickTarget(this);
    if (target.kind === 'submit') {
      const handle = await this.elementHandle({ timeout: 1_000 }).catch(
        () => null,
      );
      await click.call(this, options);
      if (handle === null) return;
      if (plan.doubleSubmit(target.name)) {
        // The same button again at once, as the second click of a double
        // click: a button the first click disabled or removed takes nothing.
        const outcome = await handle
          .evaluate((button) => {
            if (!button.isConnected) return 'button gone';
            if (button instanceof HTMLButtonElement && button.disabled)
              return 'button disabled';
            if (!(button instanceof HTMLElement)) return 'not a button';
            button.click();
            return 'clicked again';
          })
          .catch(() => 'page changed');
        plan.log.push({ kind: 'double-submit-outcome', outcome });
      }
      await handle.dispose();
      return;
    }
    if (target.kind === 'section') {
      const before = await page.evaluate(() => window.location.href);
      await click.call(this, options);
      const after = await page.evaluate(() => window.location.href);
      if (after !== before && plan.backAndForward(target.name)) {
        await page.goBack();
        await page.goForward();
        plan.log.push({
          kind: 'back-and-forward-outcome',
          url: await page.evaluate(() => window.location.href),
        });
      }
      return;
    }
    return click.call(this, options);
  };

  return {
    restoreClicks() {
      prototype.click = click;
    },
    async finish() {
      // A journey that already failed keeps its own error first.
      const checked = testInfo.status === testInfo.expectedStatus;
      const states: string[] = [];
      if (checked) {
        const deadline = Date.now() + IDLE_DEADLINE_MILLISECONDS;
        while (
          (inFlight.size > 0 ||
            Date.now() - lastActivity < IDLE_MILLISECONDS) &&
          Date.now() < deadline
        )
          await wait(100);
        if (inFlight.size > 0)
          states.push(
            `${inFlight.size} API requests still pending after ${IDLE_DEADLINE_MILLISECONDS / 1000} s`,
          );
        else {
          let loading = await visibleLoadingStates(page);
          const loadingDeadline = Date.now() + LOADING_DEADLINE_MILLISECONDS;
          while (loading.length > 0 && Date.now() < loadingDeadline) {
            await wait(250);
            loading = await visibleLoadingStates(page);
          }
          states.push(
            ...loading.map(
              (state) =>
                `loading state still shown with the network idle: ${state}`,
            ),
          );
        }
      }
      // Read after the waits: a late answer can still raise an error.
      const problems = checked ? [...errors, ...states] : [];
      await testInfo.attach('ui-chaos.json', {
        contentType: 'application/json',
        body: JSON.stringify(
          {
            seed,
            replay,
            project,
            plan: plan.describe(),
            errors,
            pending: [...inFlight].map(
              (request) =>
                `${request.method()} ${new URL(request.url()).pathname}`,
            ),
            log: plan.log,
          },
          null,
          2,
        ),
      });
      if (problems.length > 0)
        throw new Error(
          `UI chaos seed ${seed} (${project}): ${problems.join('; ')}. Replay: ${replay}`,
        );
    },
  };
}
