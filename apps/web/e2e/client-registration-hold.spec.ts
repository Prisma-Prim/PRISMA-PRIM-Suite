import { createServer, type Server } from 'node:http';
import { test, expect } from '@playwright/test';
import { holdNextClientRegistration } from './hold-client-registration';
import type { ClientRegistrationDiagnostics } from './client-registration-diagnostics';

let server: Server;
let origin: string;

test.beforeEach(async () => {
  server = createServer((request, response) => {
    if (request.url === '/api/clients' && request.method === 'POST') {
      response.writeHead(201, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ id: 'synthetic-client' }));
    } else {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<main><output aria-label="Reply">pending</output></main>');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string')
    throw new Error('Expected a local fixture port.');
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

test('names an absent held Client POST before the whole journey expires', async ({
  page,
}) => {
  test.setTimeout(45_000);
  await page.goto(origin);
  const events: Parameters<ClientRegistrationDiagnostics['record']>[0][] = [];
  const held = await holdNextClientRegistration(page, 'deliver', {
    record: (event) => events.push(event),
  });
  await expect(held.committed).rejects.toThrow(
    'Timed out after 30000ms waiting for held POST /api/clients (deliver).',
  );
  expect(events).toEqual([{ delivery: 'deliver', phase: 'request-not-held' }]);
});

test('rejects the pending hold when the page closes', async ({ page }) => {
  await page.goto(origin);
  const events: Parameters<ClientRegistrationDiagnostics['record']>[0][] = [];
  const held = await holdNextClientRegistration(page, 'lose', {
    record: (event) => events.push(event),
  });
  const closed = expect(held.committed).rejects.toThrow(
    'Page closed while waiting for held POST /api/clients (lose).',
  );
  await page.close();
  await closed;
  expect(events).toEqual([{ delivery: 'lose', phase: 'page-closed' }]);
});

for (const delivery of ['deliver', 'lose'] satisfies ('deliver' | 'lose')[]) {
  test(`preserves the exact registration hold and ${delivery} release`, async ({
    page,
  }) => {
    await page.goto(origin);
    const events: Parameters<ClientRegistrationDiagnostics['record']>[0][] = [];
    const held = await holdNextClientRegistration(page, delivery, {
      record: (event) => events.push(event),
    });
    await page.evaluate(() => {
      const output = document.querySelector('output');
      if (!output) throw new Error('Missing fixture output.');
      void fetch('/api/clients', { method: 'POST', body: 'synthetic literal' })
        .then((response) => {
          output.textContent = String(response.status);
        })
        .catch(() => {
          output.textContent = 'connectionfailed';
        });
    });
    expect(await held.committed).toEqual({
      status: 201,
      id: 'synthetic-client',
    });
    await expect(page.getByLabel('Reply')).toHaveText('pending');
    expect(
      await page.evaluate(async () => (await fetch('/api/clients')).status),
    ).toBe(200);
    expect(
      await page.evaluate(
        async () => (await fetch('/api/clients/search')).status,
      ),
    ).toBe(200);
    held.release();
    await expect(page.getByLabel('Reply')).toHaveText(
      delivery === 'deliver' ? '201' : 'connectionfailed',
    );
    expect(events).toEqual([
      { delivery, phase: 'held' },
      {
        delivery,
        phase: 'committed',
        status: 201,
        clientId: 'synthetic-client',
      },
      { delivery, phase: 'released' },
      delivery === 'deliver'
        ? { delivery, phase: 'delivered' }
        : { delivery, phase: 'lost' },
    ]);
  });
}
