import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';
import { openDocumentScannerFixture } from './document-scanner.test-support.js';
import {
  fictionalAddendumPdf,
  prepareReceivedAddendumParent,
} from './received-addendum.test-support.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres('Received Addendum original PDF lifecycle', () => {
  let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>,
    scanner: Awaited<ReturnType<typeof openDocumentScannerFixture>>,
    parent: Awaited<ReturnType<typeof prepareReceivedAddendumParent>>;
  let document: Record<string, unknown>,
    documentId: string,
    versionId: string,
    pdfA: Buffer,
    pdfB: Buffer;
  const mutate = (
    suffix: string,
    body: unknown,
    method = 'POST',
    key = randomUUID(),
  ) =>
    parent.call(`/documents/${documentId}${suffix}`, {
      method,
      headers: { 'content-type': 'application/json', 'idempotency-key': key },
      body: JSON.stringify(body),
    });
  const upload = (
    id: string,
    revision: number,
    bytes: Buffer,
    key = randomUUID(),
  ) =>
    parent.call(
      `/documents/${documentId}/versions/${id}/content?expectedRevision=${revision}&fileName=fictional-addendum.pdf`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/pdf', 'idempotency-key': key },
        body: new Uint8Array(bytes),
      },
    );
  const read = (suffix = '') =>
    parent.call(`/documents/${documentId}${suffix}`);
  beforeAll(async () => {
    scanner = await openDocumentScannerFixture();
    fixture = await openEstimateOfferFixture({
      scannerEnvironment: scanner.environment,
    });
    pdfA = await fictionalAddendumPdf('First exact source');
    pdfB = await fictionalAddendumPdf('Second exact source');
  });
  beforeEach(async () => {
    await fixture.reset();
    scanner.reset();
    parent = await prepareReceivedAddendumParent(fixture);
    const saved = await parent.register();
    expect(saved.status, await saved.clone().text()).toBe(201);
    document = responseRecord(await saved.json());
    documentId = responseString(document, 'id');
    versionId = responseString(responseRecord(document.version), 'id');
  });
  afterAll(async () => {
    await fixture?.close();
    await scanner?.close();
  });
  it('retains both original uploads, exact replay, official and superseded bytes through two actual App restarts', async () => {
    const parentBefore = await parentFacts();
    expect(
      (
        await mutate(`/versions/${versionId}/official-designation`, {
          expectedRevision: 1,
        })
      ).status,
    ).toBe(409);
    const key = randomUUID(),
      first = await upload(versionId, 1, pdfA, key);
    expect(first.status).toBe(201);
    const receipt = await first.json();
    expect(receipt).toMatchObject({ workingRevision: 2 });
    expect((await upload(versionId, 2, pdfB)).status).toBe(201);
    expect(await (await upload(versionId, 1, pdfA, key)).json()).toEqual(
      receipt,
    );
    expect((await upload(versionId, 1, pdfB, key)).status).toBe(409);
    await fixture.restart();
    expect(
      Buffer.from(
        await (await read(`/versions/${versionId}/content`)).arrayBuffer(),
      ),
    ).toEqual(pdfB);
    const history = responseRecord(
      await (await read(`/versions/${versionId}/content/history`)).json(),
    );
    if (!Array.isArray(history.uploads))
      throw new Error('Native original upload history required');
    expect(history.uploads).toHaveLength(2);
    const oldId = responseString(
      responseRecord(history.uploads[1]),
      'representationId',
    );
    expect(
      Buffer.from(
        await (
          await read(`/versions/${versionId}/content/${oldId}`)
        ).arrayBuffer(),
      ),
    ).toEqual(pdfA);
    expect(
      (
        await mutate(`/versions/${versionId}/official-designation`, {
          expectedRevision: 3,
        })
      ).status,
    ).toBe(200);
    const next = await mutate('/versions', { expectedRevision: 4 });
    expect(next.status).toBe(201);
    const nextId = responseString(
      responseRecord(await next.json()),
      'versionId',
    );
    expect(await (await read('/versions')).json()).toMatchObject({
      workingRevision: 5,
      versions: [
        {
          id: nextId,
          status: 'draft',
          pdfContent: { state: 'absent' },
          representations: [],
        },
        { id: versionId, status: 'official' },
      ],
    });
    expect(
      (
        await mutate(`/versions/${nextId}/official-designation`, {
          expectedRevision: 5,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await mutate(
          '',
          {
            expectedRevision: 5,
            title: 'Corrected native title',
            purpose: 'Corrected draft purpose',
          },
          'PATCH',
        )
      ).status,
    ).toBe(200);
    expect((await upload(nextId, 6, pdfA)).status).toBe(201);
    expect(
      (
        await mutate(`/versions/${nextId}/official-designation`, {
          expectedRevision: 7,
        })
      ).status,
    ).toBe(200);
    await fixture.restart();
    expect(await (await read()).json()).toMatchObject({
      title: 'Corrected native title',
      receivedAddendumRelation: document.receivedAddendumRelation,
    });
    expect(await (await read('/versions')).json()).toMatchObject({
      workingRevision: 8,
      versions: [
        { id: nextId, status: 'official' },
        { id: versionId, status: 'superseded' },
      ],
    });
    expect(
      Buffer.from(
        await (await read(`/versions/${versionId}/content`)).arrayBuffer(),
      ),
    ).toEqual(pdfB);
    expect(
      Buffer.from(
        await (
          await read(`/versions/${versionId}/content/${oldId}`)
        ).arrayBuffer(),
      ),
    ).toEqual(pdfA);
    expect(await parentFacts()).toEqual(parentBefore);
  });
  it('keeps the native 50-Version boundary with a real preserved PDF in every designated Version', async () => {
    const before = await parentFacts();
    let current = versionId;
    let revision = 1;
    for (let number = 1; number <= 50; number += 1) {
      const saved = await upload(current, revision, pdfA);
      expect(saved.status, `upload Version ${number}`).toBe(201);
      revision += 1;
      expect(
        (
          await mutate(`/versions/${current}/official-designation`, {
            expectedRevision: revision,
          })
        ).status,
      ).toBe(200);
      revision += 1;
      if (number < 50) {
        const next = await mutate('/versions', { expectedRevision: revision });
        expect(next.status).toBe(201);
        current = responseString(
          responseRecord(await next.json()),
          'versionId',
        );
        revision += 1;
      }
    }
    const full = await ownFacts();
    const refused = await mutate('/versions', { expectedRevision: revision });
    expect(refused.status).toBe(409);
    const body = responseRecord(await refused.json());
    expect(body.code).toBe('document_version_capacity_exceeded');
    expect(JSON.stringify(body)).not.toMatch(/50|51|official|https/u);
    expect(await ownFacts()).toEqual(full);
    const history = responseRecord(await (await read('/versions')).json());
    expect(history.workingRevision).toBe(revision);
    expect(history.versions).toHaveLength(50);
    expect(await parentFacts()).toEqual(before);
  }, 180_000);
  it('accepts only closed source grammar, literal Unicode and real optional receipt dates, and corrects only native title/purpose', async () => {
    const before = await ownFacts();
    const cases: unknown[] = [
      { ...parent.body, clientId: parent.ready.source.clientId },
      { ...parent.body, opportunityId: parent.ready.source.opportunityId },
      { ...parent.body, receivedOn: '2026-02-29' },
      { ...parent.body, receivedOn: '0000-01-01' },
      { ...parent.body, receivedOn: '2026-01-01T00:00:00Z' },
      { ...parent.body, sourceDescription: '  ' },
      { ...parent.body, title: 'a'.repeat(201) },
      { ...parent.body, purpose: 'bad\uD800' },
      { ...parent.body, sourceDescription: 'bad\0' },
    ];
    for (const body of cases)
      expect((await parent.register(randomUUID(), body)).status).toBe(400);
    expect(await ownFacts()).toEqual(before);
    for (const field of [
      'sourceDescription',
      'receivedOn',
      'parentContractId',
      'clientId',
      'type',
      'url',
    ])
      expect(
        (
          await mutate(
            '',
            { expectedRevision: 1, [field]: 'forbidden' },
            'PATCH',
          )
        ).status,
      ).toBe(400);
    for (const value of ['bad\uD800', 'bad\uDC00', 'bad\0'])
      expect(
        (await mutate('', { expectedRevision: 1, title: value }, 'PATCH'))
          .status,
      ).toBe(400);
    expect(await ownFacts()).toEqual(before);
    expect(
      (
        await mutate(
          '',
          {
            expectedRevision: 1,
            title: ' Literal � 😀 <script>text</script> ',
          },
          'PATCH',
        )
      ).status,
    ).toBe(200);
    expect(await (await read()).json()).toMatchObject({
      title: 'Literal � 😀 <script>text</script>',
      receivedAddendumRelation: document.receivedAddendumRelation,
    });
    expect(
      (
        await parent.register(randomUUID(), {
          ...parent.body,
          receivedOn: '0001-01-01',
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await parent.register(randomUUID(), {
          ...parent.body,
          receivedOn: '9999-12-31',
        })
      ).status,
    ).toBe(201);
  });
  it.each(['unsafe', 'unavailable', 'malformed'] as const)(
    'fails closed for scanner %s with no partial source/history/receipt effects',
    async (mode) => {
      const before = await ownFacts();
      scanner.setScanMode(mode);
      const rejected = await upload(versionId, 1, pdfA);
      expect(rejected.status).toBe(mode === 'unsafe' ? 400 : 503);
      expect(await ownFacts()).toEqual(before);
    },
  );
  async function snapshot(tables: readonly string[]) {
    const result: Record<string, unknown> = {};
    for (const table of tables)
      result[table] = (
        await fixture.pool.query<{ facts: unknown }>(
          `SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) facts FROM ${table} t`,
        )
      ).rows[0]?.facts;
    return result;
  }
  const ownFacts = () =>
    snapshot([
      'working_documents',
      'received_addendum_document_relations',
      'document_versions',
      'document_pdfs',
      'document_version_commands',
      'document_correction_commands',
      'document_registration_events',
      'client_accounts',
    ]);
  const parentFacts = () =>
    snapshot([
      'contracts',
      'contract_versions',
      'contract_commands',
      'contract_quality_runs',
      'contract_events',
      'contract_signing_declarations',
      'contract_project_links',
      'offer_versions',
      'offer_commands',
      'offer_client_responses',
    ]);
});
