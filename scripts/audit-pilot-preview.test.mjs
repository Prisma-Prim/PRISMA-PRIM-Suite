import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { startPilotPreview } from '../apps/web/e2e/audit-pilot-preview.mjs';

test('a fictional participant switch reloads the App and preserves exact native request intentions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'audit-pilot-preview-'));
  const upstream = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    response.setHeader('content-type', 'application/json');
    response.end(
      JSON.stringify({
        headers: request.headers,
        body: Buffer.concat(chunks).toString(),
      }),
    );
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  let pilot;
  try {
    await writeFile(
      join(directory, 'index.html'),
      '<main>Fictional App build</main>',
    );
    const address = upstream.address();
    assert.ok(address && typeof address === 'object');
    pilot = await startPilotPreview({
      port: 0,
      apiOrigin: `http://127.0.0.1:${address.port}`,
      webRoot: fileURLToPath(new URL('../apps/web', import.meta.url)),
      outDir: directory,
      specimen: {
        companyName: 'Fictional Company',
        companyId: '11111111-1111-4111-8111-111111111111',
        projectTitle: 'Fictional Project',
        projectId: '22222222-2222-4222-8222-222222222222',
        orderReference: 'DEMO-1460',
        caseId: '33333333-3333-4333-8333-333333333333',
        today: '2026-11-18',
        pdf: Buffer.from('%PDF-fictional-original'),
        docx: Buffer.from('fictional-original-docx'),
      },
    });
    const switched = await fetch(`${pilot.origin}/__pilot/actor/approver`, {
      redirect: 'manual',
    });
    assert.equal(switched.status, 303);
    assert.equal(switched.headers.get('location'), '/#projects');
    const cookie = switched.headers.get('set-cookie');
    assert.match(cookie ?? '', /HttpOnly; SameSite=Strict/u);
    const literal = '{"expectedRevision":7,"note":"Ș Я <b>001</b>"}';
    const sent = await fetch(`${pilot.origin}/api/probe`, {
      method: 'POST',
      headers: {
        cookie,
        'content-type': 'application/json',
        'idempotency-key': 'fixed-intent',
        authorization: 'must-not-forward',
      },
      body: literal,
    });
    const observed = await sent.json();
    assert.equal(
      observed.headers['x-test-external-subject'],
      'workspace-owner',
    );
    assert.equal(observed.headers['idempotency-key'], 'fixed-intent');
    assert.equal(observed.headers.authorization, undefined);
    assert.equal(observed.body, literal);
    for (const headers of [
      { origin: 'https://external.example.test' },
      { 'sec-fetch-site': 'cross-site' },
      { cookie: 'prisma-audit-pilot-role=unseeded' },
    ]) {
      const refused = await fetch(`${pilot.origin}/api/probe`, { headers });
      assert.equal(refused.status, 403, JSON.stringify(headers));
    }
    const foreignHost = await new Promise((resolve, reject) => {
      const probe = request(
        `${pilot.origin}/api/probe`,
        { headers: { host: 'external.example.test' } },
        (response) => {
          response.resume();
          response.once('end', () => resolve(response.statusCode));
        },
      );
      probe.once('error', reject);
      probe.end();
    });
    assert.equal(foreignHost, 403);
    const unknown = await fetch(`${pilot.origin}/__pilot/actor/unseeded`, {
      redirect: 'manual',
    });
    assert.equal(unknown.status, 404);
    const mutation = await fetch(`${pilot.origin}/__pilot/actor/manager`, {
      method: 'POST',
      redirect: 'manual',
    });
    assert.equal(mutation.status, 405);
  } finally {
    await pilot?.close();
    await new Promise((resolve) => {
      upstream.close(resolve);
      upstream.closeAllConnections();
    });
    await rm(directory, { recursive: true, force: true });
  }
});
