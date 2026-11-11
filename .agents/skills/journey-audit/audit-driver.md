# Audit driver

A throwaway Playwright spec that walks one journey for the [journey audit](SKILL.md). It lives in the audit folder, outside the clone, and never enters Git. Run it after `pnpm verify:journey <journey>`, which builds `apps/api/dist` and `apps/web/dist`.

## Audit folder

```text
<audit>/
  package.json            { "type": "module" }
  audit.config.mjs        the configuration below
  <journey>.audit.spec.ts the spec below
  screens/<width>/        screenshots, accessible text and the audit log
  results/                Playwright output and traces
```

The web application's modules are ES modules, hence `"type": "module"`. Playwright resolves bare imports from the importing file's folder, which is outside the clone, so import Playwright and the repository's modules by absolute path. Below, `<repo>` is the clone's absolute path with forward slashes.

## Configuration

It reuses the canonical acceptance configuration: the global setup creates a new isolated database and the fictional members, and the desktop and narrow projects keep their widths and English locale. Only selection, evidence and startup change.

```js
import { fileURLToPath } from 'node:url';
import base from 'file:///<repo>/apps/web/playwright.acceptance.config.ts';

const web = '<repo>/apps/web';
const here = (path) => fileURLToPath(new URL(path, import.meta.url));

export default {
  ...base,
  testDir: here('.'),
  testMatch: /\.audit\.spec\.ts$/u,
  globalSetup: `${web}/${base.globalSetup}`,
  outputDir: here('results'),
  reporter: [['list']],
  use: { ...base.use, trace: 'on' },
  webServer: {
    ...base.webServer,
    cwd: web,
    command: 'pnpm preview --host 127.0.0.1 --port 4173',
    timeout: 180_000,
  },
};
```

Run it from `<repo>/apps/web` with `pnpm exec playwright test --config <audit>/audit.config.mjs` and `TEST_DATABASE_URL` exported as for `verify:journey`. With the managed PostgreSQL runner, run `node scripts/managed-postgres.mjs -- pnpm --filter @prisma-prim/web exec playwright test --config <audit>/audit.config.mjs` from the clone root.

## Spec

Seed through the journey's fixture, `apps/web/e2e/<journey>.acceptance.fixture.ts`, when it has one; otherwise copy the seeding steps of the spec. Copy the spec's navigation helpers, then add these:

```ts
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test } from '<repo>/apps/web/node_modules/@playwright/test/index.mjs';

test('audits <journey> by role', async ({ page }, info) => {
  test.setTimeout(900_000);
  const width = info.project.name.endsWith('narrow') ? 'narrow' : 'desktop';
  const folder = fileURLToPath(new URL(`screens/${width}/`, import.meta.url));
  await mkdir(folder, { recursive: true });

  // Each member acts through the test identity headers the API accepts in
  // test mode; switch members by assigning `member`, then load the page again.
  let member = { 'x-test-external-provider': 'local-demo' /* … */ };
  await page.route('**/api/**', (route) =>
    route.fallback({ headers: { ...route.request().headers(), ...member } }),
  );

  // Failed API calls, console errors and page errors, tagged by step.
  let step = 'setup';
  const log: string[] = [];
  page.on('response', (response) => {
    const path = new URL(response.url()).pathname;
    if (path.startsWith('/api/') && response.status() >= 400)
      log.push(`[${step}] ${response.status()} ${path}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') log.push(`[${step}] ${message.text()}`);
  });
  page.on('pageerror', (error) => log.push(`[${step}] ${error.message}`));

  let count = 0;
  /** What this member sees of `target`, as text and as viewport images. */
  async function shot(name: string, target = page.locator('body'), views = 1) {
    step = `${String(++count).padStart(2, '0')}-${name}`;
    const base = `${folder}${step}`;
    await writeFile(`${base}.aria.yml`, await target.ariaSnapshot());
    // Scroll as a person does and capture the viewport. A full-page capture
    // enlarges the viewport, which moves fixed and sticky elements.
    await target.evaluate((element) =>
      element.scrollIntoView({ block: 'start' }),
    );
    const view = page.viewportSize() ?? { width: 1440, height: 900 };
    for (let index = 1; index <= views; index += 1) {
      await page.screenshot({ path: `${base}-${index}.png` });
      await page.evaluate(
        (top) => window.scrollBy({ top, behavior: 'instant' }),
        view.height - 60,
      );
    }
    // Elements wider than the viewport outside a scrolling container.
    const overflowing = await page.evaluate(() =>
      [...document.querySelectorAll('body *')]
        .filter((element) => {
          if (element.getBoundingClientRect().right <= innerWidth + 1)
            return false;
          for (
            let node = element.parentElement;
            node;
            node = node.parentElement
          )
            if (getComputedStyle(node).overflowX !== 'visible') return false;
          return true;
        })
        .map((element) => element.getAttribute('class')),
    );
    for (const className of overflowing)
      log.push(`[${step}] overflows: ${className}`);
    await writeFile(`${folder}audit.log`, `${log.join('\n')}\n`);
  }

  // Walk every role of the journey-map row: open each screen, `shot()` the
  // page and each region the role acts in, perform the role's allowed actions
  // and `shot()` the result.
});
```

Long pages, such as a Case page of 20 000 px at the narrow width, are read region by region: `shot('approver-decision', region, 2)`.

Confirm the candidates with a second spec on a new dataset that captures only the regions concerned.

To walk the other states, intercept the screen's read with `page.route`: delay it to see the loading state, answer `503` to see the unavailable state. For a stale state, change the record through the API after the screen has loaded it, then submit.

To switch the locale in place, choose it in `.interface-locale-control` (on the narrow width, open the navigation with `.production-menu-button` first); a page load keeps the locale stored under `prisma-prim.interface-locale`.

## Reading the evidence

- `.aria.yml`: labels, values, forms and buttons per role. Compare a member's commands with the PRD's permission matrix, and the values of one fact across screens, documents and locales.
- Images: the layout at each width. Open the views of every region a role acts in, at both widths.
- `audit.log`: failed API calls, console and page errors, and elements wider than the viewport, each tagged with its step.
- A downloaded PDF: extract its text, for example with `inspectCommercialPdf` from `apps/api/src/commercial-pdf/pdf-inspection.test-support.mts`, and compare each value with the screen.
