import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { PDF_B } from '../documents/mission-document.test-support.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  openWorkingEvidenceFixture,
  json,
  record,
  text,
  PDF_A,
  type WorkingEvidenceFixture,
} from './working-evidence.test-support.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;
withPostgres('Working Evidence closed command and denial protocol', () => {
  let fixture: WorkingEvidenceFixture;
  let projectId: string;
  let companyId: string;
  let source: Awaited<ReturnType<WorkingEvidenceFixture['source']>>;
  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    fixture = await openWorkingEvidenceFixture(databaseUrl);
  });
  beforeEach(async () => {
    ({ projectId, companyId } = await fixture.prepare());
    source = await fixture.source();
  });
  afterAll(async () => fixture?.close());
  const path = () => `/projects/${projectId}/working-evidence-cases`;
  const post = (body: unknown) =>
    fixture.call(path(), { method: 'POST', body });

  it('rejects GET entities and malformed UTF8 while bounding actual JSON bytes at 256 KiB', async () => {
    function raw(
      route: string,
      method: 'GET' | 'POST',
      bytes: Buffer,
    ): Promise<Response> {
      return new Promise((resolve, reject) => {
        const request = httpRequest(
          fixture.origin + '/api' + route,
          {
            method,
            headers: {
              'x-test-external-provider': 'deterministic-test',
              'x-test-external-subject': 'mission-owner',
              'x-test-display-name': 'Mission Owner DEMO',
              'x-test-email': 'mission-owner@example.test',
              'x-company-context-id': companyId,
              'content-type': 'application/json',
              'content-length': String(bytes.length),
              'idempotency-key': randomUUID(),
            },
          },
          (response) => {
            let body = '';
            response.setEncoding('utf8');
            response.on('data', (chunk: unknown) => {
              if (typeof chunk !== 'string') {
                response.destroy(
                  new Error('Expected encoded public HTTP response.'),
                );
                return;
              }
              body += chunk;
            });
            response.on('error', reject);
            response.on('end', () => {
              if (typeof response.statusCode !== 'number') {
                reject(new Error('Expected public HTTP status.'));
                return;
              }
              const headers = new Headers();
              for (const [name, value] of Object.entries(response.headers)) {
                if (typeof value === 'string') headers.append(name, value);
                else if (Array.isArray(value))
                  for (const part of value) headers.append(name, part);
              }
              resolve(
                new Response(body, { status: response.statusCode, headers }),
              );
            });
          },
        );
        request.on('error', reject);
        request.end(bytes);
      });
    }
    const selectorPath = `/projects/${projectId}/working-evidence-sources`;
    // An explicit empty JSON entity remains a body and must never become a valid GET.
    for (const route of [path(), selectorPath]) {
      const refused = await raw(route, 'GET', Buffer.from('{}'));
      expect(refused.status).toBe(400);
      expect(await refused.json()).toEqual({ code: 'invalid_request' });
    }
    const command = fixture.recordBody([source]);
    const marker = Buffer.from('RAW_UTF8_LITERAL_MARKER');
    const malformedJson = Buffer.from(
      JSON.stringify({
        ...command,
        values: { ...command.values, statement: marker.toString('utf8') },
      }),
    );
    const markerPosition = malformedJson.indexOf(marker);
    if (markerPosition < 0)
      throw new Error('Expected the fictional literal marker.');
    const malformed = Buffer.concat([
      malformedJson.subarray(0, markerPosition),
      Buffer.from([0xc3, 0x28]),
      malformedJson.subarray(markerPosition + marker.length),
    ]);
    const invalidUtf8 = await raw(path(), 'POST', malformed);
    expect(invalidUtf8.status).toBe(400);
    expect(await invalidUtf8.json()).toEqual({ code: 'invalid_request' });
    expect(await json(await fixture.call(path()))).toMatchObject({
      items: [],
      nextCursor: null,
    });

    // Trailing JSON whitespace changes wire bytes without enlarging any literal
    // or changing the closed parsed command; this proves the actual parser cap.
    const serialized = Buffer.from(JSON.stringify(command));
    const paddingBytes = 262144 - serialized.length;
    expect(paddingBytes).toBeGreaterThan(0);
    const atLimit = Buffer.concat([
      serialized,
      Buffer.alloc(paddingBytes, 0x20),
    ]);
    expect(atLimit.length).toBe(262144);
    const accepted = await raw(path(), 'POST', atLimit);
    expect(accepted.status).toBe(201);
    const receipt = await json(accepted);
    expect(receipt).toMatchObject({
      commandId: command.commandId,
      action: 'RECORD',
      revisionNumber: 1,
    });
    const aboveLimit = Buffer.concat([atLimit, Buffer.from([0x20])]);
    expect(aboveLimit.length).toBe(262145);
    const oversizedReplay = await raw(path(), 'POST', aboveLimit);
    expect(oversizedReplay.status).toBe(400);
    expect(await oversizedReplay.json()).toEqual({ code: 'invalid_request' });

    const casePath = `/working-evidence-cases/${text(receipt.caseId)}`;
    const revisionPath = `${casePath}/revisions/${text(receipt.revisionId)}`;
    const detail = await json(await fixture.call(revisionPath));
    const evidence = record(detail.evidence);
    if (!Array.isArray(evidence.supports))
      throw new Error('Expected the authorized exact support.');
    const support = record(evidence.supports[0]);
    for (const route of [
      casePath,
      casePath + '/revisions',
      revisionPath,
      revisionPath + '/statement',
      revisionPath + '/annex',
      revisionPath + '/evidence/' + text(support.evidenceId),
    ]) {
      const refused = await raw(route, 'GET', Buffer.from('{}'));
      expect(refused.status).toBe(400);
      expect(await refused.json()).toEqual({ code: 'invalid_request' });
    }
    expect(await json(await fixture.call(path()))).toMatchObject({
      items: [
        {
          caseId: receipt.caseId,
          revisionId: receipt.revisionId,
          revisionNumber: 1,
        },
      ],
      nextCursor: null,
    });
    expect(await json(await post(command))).toEqual(receipt);
  });

  it('rejects extra, omitted, malformed, duplicate and unsafe literal intent without recording a Case', async () => {
    const valid = fixture.recordBody([source]);
    const first = valid.values.supports[0];
    if (!first) throw new Error('One complete fictional support is required.');
    const invalid = [
      { ...valid, actor: randomUUID() },
      { ...valid, format: 'WORKING_EVIDENCE_CASE_COMMAND/2' },
      { ...valid, commandId: 'not-a-uuid' },
      { ...valid, commandId: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA' },
      { ...valid, expectedRevision: '0' },
      { ...valid, expectedRevision: 1 },
      { ...valid, values: { ...valid.values, declaredContext: undefined } },
      { ...valid, values: { ...valid.values, declaredContext: '' } },
      { ...valid, values: { ...valid.values, title: ' '.repeat(8) } },
      { ...valid, values: { ...valid.values, process: '\ud800' } },
      { ...valid, values: { ...valid.values, statement: 'literal\0rejected' } },
      { ...valid, values: { ...valid.values, statement: 'x'.repeat(2001) } },
      { ...valid, values: { ...valid.values, supports: [] } },
      { ...valid, values: { ...valid.values, supports: [first, first] } },
      {
        ...valid,
        values: {
          ...valid.values,
          supports: [
            first,
            { ...first, locator: 'Different literal location' },
          ],
        },
      },
      {
        ...valid,
        values: {
          ...valid.values,
          supports: [{ ...first, sha256: '0'.repeat(64) }],
        },
      },
      {
        ...valid,
        values: { ...valid.values, supports: [{ ...first, locator: '' }] },
      },
      {
        ...valid,
        values: {
          ...valid.values,
          supports: [{ ...first, supportNote: null }],
        },
      },
    ];
    for (const body of invalid) {
      const response = await post(body);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ code: 'invalid_request' });
    }
    expect(await json(await fixture.call(path()))).toEqual({
      format: 'WORKING_EVIDENCE_CASE_PAGE/1',
      items: [],
      nextCursor: null,
    });
  });

  it('refuses forged exact tuples without exposing any native label or a success receipt', async () => {
    const valid = fixture.recordBody([source]);
    const first = valid.values.supports[0];
    if (!first) throw new Error('One complete fictional support is required.');
    for (const tuple of [
      { ...first, documentId: randomUUID() },
      { ...first, versionId: randomUUID() },
      { ...first, representationId: randomUUID() },
    ]) {
      const response = await post({
        ...valid,
        commandId: randomUUID(),
        values: { ...valid.values, supports: [tuple] },
      });
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ code: 'not_found' });
    }
    expect(await json(await fixture.call(path()))).toMatchObject({ items: [] });
  });

  it('keeps ordinary Project access and native source preparation independent from explicit Case authority', async () => {
    await fixture.revoke('/company-working-evidence-case-recorder-assignments');
    const stillReadable = await fixture.call(path());
    expect(stillReadable.status).toBe(200);
    const deniedRecord = await post(fixture.recordBody([source]));
    expect(deniedRecord.status).toBe(403);
    await fixture.revoke('/company-working-evidence-case-reader-assignments');
    expect((await fixture.call(path())).status).toBe(403);
    expect((await fixture.call(`/projects/${projectId}`)).status).toBe(200);
    expect((await fixture.call(`/documents/${source.documentId}`)).status).toBe(
      200,
    );
    const nativeSource = await fixture.source({
      title: 'Separate native preparation remains permitted',
    });
    expect(nativeSource.documentId).not.toBe(source.documentId);
  });

  it('rejects unknown query filters, malformed cursors and cursor context substitution using one fixed response', async () => {
    for (const route of [
      path(),
      `/projects/${projectId}/working-evidence-sources`,
    ]) {
      for (const suffix of [
        '?limit=1',
        '?cursor=',
        '?cursor=a&cursor=b',
        '?cursor=%00',
        '?cursor=unrecognized',
      ]) {
        const response = await fixture.call(route + suffix);
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ code: 'invalid_request' });
      }
    }
    const saved = await post(fixture.recordBody([source]));
    expect(saved.status).toBe(201);
    const receipt = await json(saved);
    const detail = await fixture.call(
      `/working-evidence-cases/${text(receipt.caseId)}?includeSources=true`,
    );
    expect(detail.status).toBe(400);
    expect(await detail.json()).toEqual({ code: 'invalid_request' });
  });
  it('selects only the final successful PDF upload frozen at designation, preserving earlier native upload history independently', async () => {
    const original = await fixture.call(`/documents/${source.documentId}`);
    expect(original.status).toBe(200);
    const clientId = text((await json(original)).clientId);
    const registered = await fixture.call('/documents', {
      method: 'POST',
      body: {
        type: 'received-audit-source',
        clientId,
        title: 'Fictional corrected draft original',
        purpose: 'Freeze only the independently reviewed final upload',
      },
    });
    expect(registered.status).toBe(201);
    const document = await json(registered);
    const documentId = text(document.id);
    const versionId = text(record(document.version).id);
    const first = await fixture.native.upload({
      documentId,
      versionId,
      revision: 1,
      bytes: PDF_A,
    });
    expect(first.status).toBe(201);
    const firstRepresentationId = text((await json(first)).representationId);
    const final = await fixture.native.upload({
      documentId,
      versionId,
      revision: 2,
      bytes: PDF_B,
    });
    expect(final.status).toBe(201);
    const finalRepresentationId = text((await json(final)).representationId);
    expect(
      (
        await fixture.call(
          `/documents/${documentId}/versions/${versionId}/official-designation`,
          { method: 'POST', body: { expectedRevision: 3 } },
        )
      ).status,
    ).toBe(200);
    const selector = await json(
      await fixture.call(`/projects/${projectId}/working-evidence-sources`),
    );
    if (!Array.isArray(selector.items))
      throw new Error('Expected exact candidates.');
    expect(
      selector.items.filter((value) => record(value).documentId === documentId),
    ).toEqual([
      {
        documentId,
        versionId,
        versionNumber: 1,
        representationId: finalRepresentationId,
        sourceTitle: 'Fictional corrected draft original',
      },
    ]);
    const refused = await post(
      fixture.recordBody([
        { documentId, versionId, representationId: firstRepresentationId },
      ]),
    );
    expect(refused.status).toBe(404);
    expect(await refused.json()).toEqual({ code: 'not_found' });
    const saved = await post(
      fixture.recordBody([
        { documentId, versionId, representationId: finalRepresentationId },
      ]),
    );
    expect(saved.status).toBe(201);
    const receipt = await json(saved);
    const revision = await json(
      await fixture.call(
        `/working-evidence-cases/${text(receipt.caseId)}/revisions/${text(receipt.revisionId)}`,
      ),
    );
    const evidence = record(revision.evidence);
    if (!Array.isArray(evidence.supports))
      throw new Error('Expected exact retained support.');
    const support = record(evidence.supports[0]);
    const exact = await fixture.call(
      `/working-evidence-cases/${text(receipt.caseId)}/revisions/${text(receipt.revisionId)}/evidence/${text(support.evidenceId)}`,
    );
    expect(exact.status).toBe(200);
    expect(Buffer.from(await exact.arrayBuffer())).toEqual(PDF_B);
    const history = await fixture.call(
      `/documents/${documentId}/versions/${versionId}/content/history`,
    );
    expect(history.status).toBe(200);
    expect(await history.json()).toMatchObject({
      uploads: [
        { representationId: finalRepresentationId },
        { representationId: firstRepresentationId },
      ],
    });
  });
  it('derives the immutable original Client from the Project and withholds another Client source before selection', async () => {
    const registeredClient = await fixture.call('/clients', {
      method: 'POST',
      body: { displayName: 'Separate fictional Client' },
    });
    expect(registeredClient.status).toBe(201);
    const otherClientId = text((await json(registeredClient)).id);
    const unrelated = await fixture.source({
      clientId: otherClientId,
      title: 'Confidential unrelated fictional source',
    });
    expect(
      (await fixture.call(`/documents/${unrelated.documentId}`)).status,
    ).toBe(200);
    const selector = await json(
      await fixture.call(`/projects/${projectId}/working-evidence-sources`),
    );
    expect(selector).toMatchObject({
      items: [{ documentId: source.documentId }],
      nextCursor: null,
    });
    expect(JSON.stringify(selector)).not.toContain(unrelated.documentId);
    expect(JSON.stringify(selector)).not.toContain(
      'Confidential unrelated fictional source',
    );
    const refused = await post(fixture.recordBody([unrelated]));
    expect(refused.status).toBe(404);
    expect(await refused.json()).toEqual({ code: 'not_found' });
    expect(await json(await fixture.call(path()))).toMatchObject({
      items: [],
      nextCursor: null,
    });
  });
});
