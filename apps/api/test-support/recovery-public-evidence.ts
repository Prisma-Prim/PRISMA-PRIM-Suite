import { randomUUID, createHash } from 'node:crypto';
import { createServer, type Server } from 'node:net';
import { PDFDocument } from 'pdf-lib';
import { expect } from 'vitest';
import {
  DEMONSTRATION_PERSONAS,
  DEMONSTRATION_PERSONA_PROVIDER,
} from '../src/demonstration/demonstration-scenario.js';

export async function startRecoveryScannerFixture(): Promise<{
  port: number;
  close(): Promise<void>;
}> {
  // Deterministic external ClamAV wire boundary, not real malware-engine proof.
  const server: Server = createServer((socket) => {
    let input = Buffer.alloc(0);
    socket.on('data', (bytes: Buffer) => {
      input = Buffer.concat([input, bytes]);
      if (input.equals(Buffer.from('zVERSION\0'))) {
        socket.end('ClamAV 1.4.3\0');
        return;
      }
      if (!input.subarray(0, 10).equals(Buffer.from('zINSTREAM\0'))) return;
      let offset = 10;
      while (offset + 4 <= input.length) {
        const length = input.readUInt32BE(offset);
        if (length === 0) {
          socket.end('stream: OK\0');
          return;
        }
        if (offset + 4 + length > input.length) return;
        offset += 4 + length;
      }
    });
  });
  await new Promise<void>((done, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', done);
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Expected local scanner address.');
  let closed = false;
  return {
    port: address.port,
    async close() {
      if (closed) return;
      closed = true;
      await new Promise<void>((done, fail) =>
        server.close((error) => (error ? fail(error) : done())),
      );
    },
  };
}

interface Principal {
  readonly key: string;
  readonly provider: string;
  readonly subject: string;
  readonly displayName: string;
  readonly email: string;
}

interface ExpectedRead {
  readonly key: string;
  readonly family: string;
  readonly principal: string;
  readonly path: string;
  readonly companyId?: string;
  readonly expectedStatus: number;
  readonly sha256: string;
}

export async function prepareRecoveryPublicEvidence(input: {
  readonly origin: string;
  readonly owner: Omit<Principal, 'key'>;
  readonly records: ReadonlyMap<string, string>;
}): Promise<{
  evidence: {
    readonly version: 1;
    readonly principals: readonly Principal[];
    readonly reads: readonly ExpectedRead[];
  };
  commitLaterSourceWrite(): Promise<void>;
}> {
  const principals: Principal[] = [
    { key: 'owner', ...input.owner },
    ...DEMONSTRATION_PERSONAS.map((persona) => ({
      key: persona.key,
      provider: DEMONSTRATION_PERSONA_PROVIDER,
      subject: persona.subject,
      displayName: persona.displayName,
      email: persona.email,
    })),
  ];
  const principal = (key: string) => {
    const found = principals.find((value) => value.key === key);
    if (!found) throw new Error('Expected existing synthetic principal.');
    return found;
  };
  const id = (key: string) => {
    const value = input.records.get(key);
    if (!value) throw new Error(`Expected released public source step ${key}.`);
    return value;
  };
  const company = id('company.prisma-prim');
  async function call(
    path: string,
    options: {
      readonly principal?: string;
      readonly companyId?: string;
      readonly method?: string;
      readonly body?: unknown;
      readonly bytes?: Buffer;
    } = {},
  ): Promise<Response> {
    const actor = principal(options.principal ?? 'owner');
    return fetch(`${input.origin}/api${path}`, {
      method: options.method ?? 'GET',
      headers: {
        'x-test-external-provider': actor.provider,
        'x-test-external-subject': actor.subject,
        'x-test-display-name': actor.displayName,
        'x-test-email': actor.email,
        ...(options.companyId
          ? { 'x-company-context-id': options.companyId }
          : {}),
        ...(options.method && options.method !== 'GET'
          ? { 'idempotency-key': randomUUID() }
          : {}),
        ...(options.bytes
          ? { 'content-type': 'application/pdf' }
          : options.body === undefined
            ? {}
            : { 'content-type': 'application/json' }),
      },
      ...(options.bytes
        ? { body: new Uint8Array(options.bytes) }
        : options.body === undefined
          ? {}
          : { body: JSON.stringify(options.body) }),
    });
  }
  const actorResponse = await call('/access/current-actor');
  expect(actorResponse.status).toBe(200);
  const membership = text(
    record(await actorResponse.json()).workspaceMembershipId,
  );
  for (const route of [
    '/company-context-assignments',
    '/company-document-registrar-assignments',
    '/company-document-approver-assignments',
    '/company-document-content-reader-assignments',
    '/company-document-content-uploader-assignments',
  ]) {
    const granted = await call(route, {
      method: 'POST',
      body: { companyId: company, workspaceMembershipId: membership },
    });
    expect(granted.status, route).toBe(201);
  }
  const registered = await call('/documents', {
    method: 'POST',
    companyId: company,
    body: {
      clientId: id('client.grup-demo'),
      title: 'Arbitrary recovery DEMO questionnaire',
      purpose: 'Additional source record beyond released seeds DEMO',
      url: 'https://example.test/recovery/questionnaire',
    },
  });
  expect(registered.status).toBe(201);
  const document = record(await registered.json());
  const documentId = text(document.id);
  const firstVersion = text(record(document.version).id);
  const pdf = async (label: string): Promise<Buffer> => {
    const value = await PDFDocument.create();
    value.addPage([360, 160]).drawText(label, { x: 15, y: 90 });
    return Buffer.from(await value.save({ useObjectStreams: false }));
  };
  const originalPdf = await pdf('Additional recovery DEMO original');
  const correctedPdf = await pdf('Additional recovery DEMO corrected');
  const successorPdf = await pdf('Additional recovery DEMO successor');
  const content = (version: string) =>
    `/documents/${documentId}/versions/${version}/content`;
  const upload = (version: string, revision: number, bytes: Buffer) =>
    call(
      `${content(version)}?expectedRevision=${revision}&fileName=recovery-demo.pdf`,
      {
        method: 'POST',
        companyId: company,
        bytes,
      },
    );
  const originalUpload = await upload(firstVersion, 1, originalPdf);
  expect(originalUpload.status).toBe(201);
  const originalRepresentation = text(
    record(await originalUpload.json()).representationId,
  );
  expect((await upload(firstVersion, 2, correctedPdf)).status).toBe(201);
  expect(
    (
      await call(
        `/documents/${documentId}/versions/${firstVersion}/official-designation`,
        {
          method: 'POST',
          companyId: company,
          body: { expectedRevision: 3 },
        },
      )
    ).status,
  ).toBe(200);
  const drafted = await call(`/documents/${documentId}/versions`, {
    method: 'POST',
    companyId: company,
    body: { expectedRevision: 4 },
  });
  expect(drafted.status).toBe(201);
  const secondVersion = text(record(await drafted.json()).versionId);
  expect((await upload(secondVersion, 5, successorPdf)).status).toBe(201);
  const ana = id('persona.ana');
  expect(
    (
      await call('/company-document-content-reader-assignments', {
        method: 'POST',
        body: { companyId: company, workspaceMembershipId: ana },
      })
    ).status,
  ).toBe(201);
  expect(
    (
      await call(
        `/company-document-content-reader-assignments/${ana}/${company}`,
        { method: 'DELETE' },
      )
    ).status,
  ).toBe(200);

  const reads: ExpectedRead[] = [];
  async function capture(
    key: string,
    family: string,
    path: string,
    options: {
      readonly principal?: string;
      readonly companyId?: string;
      readonly denied?: boolean;
      readonly bytes?: Buffer;
    } = {},
  ): Promise<void> {
    const response = await call(path, {
      principal: options.principal,
      companyId: options.companyId,
    });
    if (options.denied) expect([403, 404]).toContain(response.status);
    else expect(response.status, key).toBe(200);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (options.bytes) expect(bytes, key).toEqual(options.bytes);
    if (options.denied)
      expect(bytes.toString('utf8')).not.toContain('Arbitrary recovery DEMO');
    reads.push({
      key,
      family,
      principal: options.principal ?? 'owner',
      path,
      ...(options.companyId ? { companyId: options.companyId } : {}),
      expectedStatus: response.status,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  }
  for (const actor of principals)
    await capture(
      `exact-principal-${actor.key}`,
      'business',
      '/access/current-actor',
      { principal: actor.key },
    );
  await capture('exact-companies', 'business', '/companies');
  await capture(
    'exact-recorded-versions',
    'receipt-result',
    `/documents/${documentId}/versions`,
    { companyId: company },
  );
  await capture(
    'exact-arbitrary-record',
    'business',
    `/documents/${documentId}`,
    { companyId: company },
  );
  await capture(
    'exact-configuration-version',
    'configuration',
    `/pricing-configuration/rule-versions/${id('pricing.prisma-prim.rule-v1')}`,
    { principal: 'ana', companyId: company },
  );
  await capture(
    'exact-task-history',
    'history',
    `/tasks/${id('task.kick-off-meeting')}/history`,
    { principal: 'ana', companyId: company },
  );
  await capture('exact-activity-history', 'history', '/activity-log');
  await capture(
    'exact-captured-grants',
    'authority-allowed',
    '/company-context-assignments/administration',
  );
  await capture(
    'exact-allowed-current-pdf',
    'pdf-current',
    content(secondVersion),
    { companyId: company, bytes: successorPdf },
  );
  await capture('exact-official-pdf', 'pdf-history', content(firstVersion), {
    companyId: company,
    bytes: correctedPdf,
  });
  await capture(
    'exact-original-historical-pdf',
    'pdf-history',
    `${content(firstVersion)}/${originalRepresentation}`,
    { companyId: company, bytes: originalPdf },
  );
  await capture(
    'exact-pdf-history',
    'history',
    `${content(firstVersion)}/history`,
    { companyId: company },
  );
  await capture(
    'revoked-content-read-denied',
    'authority-revoked',
    content(secondVersion),
    { principal: 'ana', companyId: company, denied: true },
  );
  await capture(
    'other-company-read-denied',
    'authority-other-company',
    `/documents/${documentId}`,
    { principal: 'maria', companyId: id('company.bic'), denied: true },
  );
  await capture(
    'restricted-read-denied',
    'authority-restricted',
    `/documents/${documentId}`,
    { principal: 'victor', companyId: id('company.ecg'), denied: true },
  );
  const laterName = 'After-cutoff recovery DEMO only';
  const laterQuery = `/clients/search?query=${encodeURIComponent(laterName)}`;
  await capture('later-source-write-absent', 'after-cutoff', laterQuery, {
    companyId: company,
  });
  return {
    evidence: { version: 1, principals, reads },
    async commitLaterSourceWrite() {
      const response = await call('/clients', {
        method: 'POST',
        companyId: company,
        body: { displayName: laterName },
      });
      expect(response.status).toBe(201);
      const observed = await call(laterQuery, { companyId: company });
      expect(observed.status).toBe(200);
      expect(await observed.text()).toContain(laterName);
    },
  };
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Expected a public response object.');
  return Object.fromEntries(Object.entries(value));
}

function text(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0)
    throw new Error('Expected a public response identifier.');
  return value;
}
