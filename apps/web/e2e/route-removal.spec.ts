import { createServer } from 'node:http';
import { expect, test as base } from '@playwright/test';
import { removeRoute } from './route-removal';

const test = base.extend<{ origin: string }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright requires destructured fixture arguments; this HTTP server has no fixture dependencies.
  origin: async ({}, use) => {
    const server = createServer((request, response) => {
      if (request.url === '/') {
        response.setHeader('Content-Type', 'text/html');
        response.end('<!doctype html><title>Reads</title><output></output>');
      } else response.end('complete');
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    try {
      const address = server.address();
      if (!address || typeof address === 'string')
        throw new Error('Expected a listening HTTP port');
      await use(`http://127.0.0.1:${address.port}`);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  },
});

test('all continuous reads finish when the last temporary route is repeatedly removed', async ({
  page,
  origin,
}) => {
  await page.goto(origin);
  const pattern = '**/*';
  await page.route(pattern, (route) => route.continue());
  await page.evaluate(() => {
    const output = document.querySelector('output');
    if (!output) throw new Error('Expected read observation output');
    let issued = 0;
    let completed = 0;
    let failed = 0;
    output.dataset.running = 'true';
    for (let worker = 0; worker < 16; worker++)
      void (async () => {
        while (output.dataset.running === 'true') {
          const id = issued++;
          output.dataset.pending = String(issued - completed - failed);
          try {
            const response = await fetch(`/read?id=${id}`);
            if ((await response.text()) !== 'complete')
              throw new Error('Unexpected HTTP body');
            completed++;
          } catch {
            failed++;
          }
          output.dataset.pending = String(issued - completed - failed);
          output.dataset.completed = String(completed);
          output.dataset.failed = String(failed);
        }
      })();
  });
  for (let transition = 0; transition < 100; transition++) {
    await removeRoute(page, pattern);
    await page.route(pattern, (route) => route.continue());
  }
  await page.locator('output').evaluate((output) => {
    output.dataset.running = 'false';
  });
  await expect(page.locator('output')).toHaveAttribute('data-pending', '0');
  await expect(page.locator('output')).toHaveAttribute('data-failed', '0');
  await expect(page.locator('output')).toHaveAttribute(
    'data-completed',
    /^[1-9]\d*$/u,
  );
});

test('preserves handler selection, broad patterns and later fault interception', async ({
  page,
  origin,
}) => {
  await page.goto(origin);
  const read = () => page.evaluate(async () => (await fetch('/value')).text());
  const pattern = '**/value';
  const first: Parameters<typeof page.route>[1] = (route) =>
    route.fulfill({ body: 'first' });
  const second: Parameters<typeof page.route>[1] = (route) =>
    route.fulfill({ body: 'second' });
  await page.route(pattern, first);
  await page.route(pattern, second);
  expect(await read()).toBe('second');
  await removeRoute(page, pattern, second);
  expect(await read()).toBe('first');
  await removeRoute(page, pattern, first);
  expect(await read()).toBe('complete');

  await page.route('**/*', (route) => route.fulfill({ body: 'broad' }));
  expect(await read()).toBe('broad');
  await removeRoute(page, '**/*');
  expect(await read()).toBe('complete');

  const expression = /\/value$/u;
  await page.route(expression, (route) =>
    route.fulfill({ body: 'later fault' }),
  );
  expect(await read()).toBe('later fault');
  await removeRoute(page, expression);
  expect(await read()).toBe('complete');
});
