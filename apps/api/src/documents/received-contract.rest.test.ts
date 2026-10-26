import {
  prepareReceivedContractSource,
  registerReceivedContract,
  receivedContractEffects,
} from './received-contract.test-support.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ESTIMATE_OFFER_PREPARER,
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';
import {
  prepareModelContractSource,
  revokeModelContractFixtureGrant,
} from '../contract/model-contract.test-fixture.js';
import { randomUUID } from 'node:crypto';
import { openDocumentScannerFixture } from './document-scanner.test-support.js';
import { PDF_A, PDF_B } from './mission-document.test-support.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres('Received Contract PDF family public REST', () => {
  let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>;
  let scanner: Awaited<ReturnType<typeof openDocumentScannerFixture>>;
  beforeAll(async () => {
    scanner = await openDocumentScannerFixture();
    fixture = await openEstimateOfferFixture({
      scannerEnvironment: scanner.environment,
    });
  });
  beforeEach(async () => {
    await fixture.reset();
    scanner.reset();
  });
  afterAll(async () => {
    await fixture?.close();
    await scanner?.close();
  });

  const source = () => prepareReceivedContractSource(fixture);
  const received = () => registerReceivedContract(fixture);

  it('refuses invalid Unicode in received draft corrections without changing any conserved fact', async () => {
    const f = await received(),
      before = await receivedContractEffects(fixture.pool);
    for (const field of ['title', 'purpose'])
      for (const value of ['bad\uD800', 'bad\uDC00', 'bad\u0000']) {
        const response = await f.mutate(
          '',
          { expectedRevision: 1, [field]: value },
          'PATCH',
        );
        expect({ field, value, status: response.status }).toMatchObject({
          status: 400,
        });
        expect(await receivedContractEffects(fixture.pool)).toEqual(before);
      }
    expect(
      (
        await f.mutate(
          '',
          { expectedRevision: 1, title: 'Literal � and 😀' },
          'PATCH',
        )
      ).status,
    ).toBe(200);
    expect(await (await f.call('')).json()).toMatchObject({
      title: 'Literal � and 😀',
      workingRevision: 2,
    });
  });

  it('independently prevents changing the original Client behind a conserved relation', async () => {
    const f = await received();
    const other = responseRecord(
      await fixture.command({
        path: '/clients',
        companyId: f.ready.source.companyId,
        body: { displayName: 'Unrelated synthetic Client' },
      }),
    );
    await expect(
      fixture.pool.query(
        'UPDATE working_documents SET client_id=$1 WHERE id=$2',
        [responseString(other, 'id'), responseString(f.document, 'id')],
      ),
    ).rejects.toHaveProperty('code', '23514');
    expect(await (await f.call('')).json()).toMatchObject({
      clientId: f.ready.source.clientId,
      receivedContractRelation: f.document.receivedContractRelation,
    });
  });

  it('independently binds every initial relation to its exact source, original Client and registering identity', async () => {
    const f = await received(),
      documentId = responseString(f.document, 'id');
    const other = responseString(
      responseRecord(
        await fixture.command({
          path: '/clients',
          companyId: f.ready.source.companyId,
          body: { displayName: 'Other initial relation Client DEMO' },
        }),
      ),
      'id',
    );
    const columns = [
      'document_id',
      'workspace_id',
      'company_id',
      'opportunity_id',
      'contract_id',
      'contract_version_id',
      'contract_version_number',
      'illustrative_reference',
      'source_description',
      'received_on',
      'registered_by_membership_id',
      'registered_by_internal_user_id',
      'registered_at',
    ];
    const variants = [
      { field: 'opportunity_id', expression: '$3::uuid', value: randomUUID() },
      {
        field: 'contract_version_id',
        expression: '$3::uuid',
        value: randomUUID(),
      },
      {
        field: 'contract_version_number',
        expression: '$3::integer',
        value: 999,
      },
      {
        field: 'illustrative_reference',
        expression: '$3::integer',
        value: 999,
      },
      {
        field: 'registered_by_membership_id',
        expression: '$3::uuid',
        value: f.ready.source.readerMembershipId,
      },
      {
        field: 'registered_at',
        expression: '$3::timestamptz',
        value: '2000-01-01T00:00:00.000Z',
      },
      { field: 'originalClient', expression: '', value: other },
    ];
    for (const variant of variants) {
      const transaction = await fixture.pool.connect();
      try {
        await transaction.query('BEGIN');
        const inserted = await transaction.query<{ id: string }>(
          "INSERT INTO working_documents(workspace_id,company_id,client_id,type,title,purpose,created_by_membership_id,idempotency_key,request_fingerprint) SELECT workspace_id,company_id,CASE WHEN $2::uuid IS NULL THEN client_id ELSE $2::uuid END,type,title,purpose,created_by_membership_id,gen_random_uuid()::text,'synthetic-binding' FROM working_documents WHERE id=$1 RETURNING id",
          [documentId, variant.field === 'originalClient' ? other : null],
        );
        const id = inserted.rows[0]?.id;
        if (!id) throw new Error('Missing synthetic Document root');
        await transaction.query(
          'INSERT INTO document_versions(workspace_id,company_id,document_id,number,created_by_membership_id) SELECT workspace_id,company_id,id,1,created_by_membership_id FROM working_documents WHERE id=$1',
          [id],
        );
        // SQL identifiers/expressions come only from the closed fixture literals above.
        const projection = columns.map((column) =>
          variant.field === column
            ? variant.expression
            : column === 'document_id'
              ? 'd.id'
              : column === 'registered_at'
                ? 'd.created_at'
                : `r.${column}`,
        );
        const values =
          variant.field === 'originalClient'
            ? [documentId, id]
            : [documentId, id, variant.value];
        await expect(
          transaction.query(
            `INSERT INTO received_contract_document_relations(${columns.join(',')}) SELECT ${projection.join(',')} FROM received_contract_document_relations r JOIN working_documents d ON d.id=$2 WHERE r.document_id=$1`,
            values,
          ),
        ).rejects.toMatchObject({
          code: '23514',
          constraint: 'received_contract_relation_binding',
        });
      } finally {
        await transaction.query('ROLLBACK');
        transaction.release();
      }
    }
    const versionId = responseString(responseRecord(f.document.version), 'id');
    await expect(
      fixture.pool.query(
        "UPDATE document_versions SET status='official',designated_at=now(),designated_by_membership_id=$2,frozen_title='Synthetic official',frozen_purpose='No clean bytes' WHERE id=$1",
        [versionId, f.ready.source.preparerMembershipId],
      ),
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'mission_document_version_pdf_required',
    });
    expect(await (await f.call('')).json()).toEqual(f.document);
  });

  it('redacts the relation after Contract read loss while preserving independently authorized Document and PDF work', async () => {
    const f = await received();
    for (const path of [
      '/company-document-content-reader-assignments',
      '/company-document-content-uploader-assignments',
    ])
      await fixture.grant({
        path,
        companyId: f.ready.source.companyId,
        membershipId: f.ready.source.preparerMembershipId,
      });
    const versionId = responseString(responseRecord(f.document.version), 'id');
    expect((await f.upload(versionId, 1, PDF_A)).status).toBe(201);
    for (const path of [
      '/company-contract-preparer-assignments',
      '/company-contract-approver-assignments',
    ])
      await revokeModelContractFixtureGrant(
        fixture,
        path,
        f.ready.source.companyId,
        f.ready.source.preparerMembershipId,
      );
    const metadata = responseRecord(await (await f.call('')).json());
    expect(metadata).toMatchObject({
      type: 'received-contract',
      receivedContractRelation: { access: 'denied' },
    });
    expect(metadata.receivedContractRelation).toEqual({ access: 'denied' });
    expect(
      Buffer.from(
        await (await f.call(`/versions/${versionId}/content`)).arrayBuffer(),
      ),
    ).toEqual(PDF_A);
    expect((await f.upload(versionId, 2, PDF_B)).status).toBe(201);
    expect((await fixture.post(f.options)).status).toBe(403);
    await fixture.grant({
      path: '/company-contract-preparer-assignments',
      companyId: f.ready.source.companyId,
      membershipId: f.ready.source.preparerMembershipId,
    });
    expect(await (await f.call('')).json()).toMatchObject({
      receivedContractRelation: f.document.receivedContractRelation,
    });
    await revokeModelContractFixtureGrant(
      fixture,
      '/company-document-content-reader-assignments',
      f.ready.source.companyId,
      f.ready.source.preparerMembershipId,
    );
    expect((await f.call(`/versions/${versionId}/content`)).status).toBe(403);
    expect(await (await f.call('/versions')).json()).toMatchObject({
      versions: [{ pdfContent: { state: 'stored', access: 'denied' } }],
    });
    await revokeModelContractFixtureGrant(
      fixture,
      '/company-received-contract-access-assignments',
      f.ready.source.companyId,
      f.ready.source.preparerMembershipId,
    );
    expect((await f.call('')).status).toBe(404);
    expect((await f.call('/versions')).status).toBe(404);
    expect((await fixture.post(f.options)).status).toBe(403);
    expect(
      await fixture.read({
        path: '/documents',
        companyId: f.ready.source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
      }),
    ).toEqual([]);
  });

  it('rejects malformed, copied or unknown registration inputs without a new Document', async () => {
    const f = await received();
    for (const extra of [
      { clientId: f.ready.source.clientId },
      { url: 'https://example.test/contract.pdf' },
      { signed: true },
      { sourceDescription: '' },
      { sourceDescription: 'x'.repeat(2001) },
      { sourceDescription: 'bad\u0000' },
      { title: 'bad\uD800' },
      { receivedOn: '2026-02-30' },
      { receivedOn: '2025-02-29' },
      { receivedOn: '0000-01-01' },
      { receivedOn: 42 },
      { contractVersionId: 'invalid' },
      { contractVersionId: randomUUID() },
      { opportunityId: randomUUID() },
      { contractId: randomUUID() },
    ]) {
      const result = await fixture.post({
        ...f.options,
        key: randomUUID(),
        body: { ...f.options.body, ...extra },
      });
      expect([400, 404]).toContain(result.status);
    }
    expect(
      await fixture.read({
        path: '/documents',
        companyId: f.ready.source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
      }),
    ).toHaveLength(1);
    expect(
      (
        await f.mutate(
          '',
          { expectedRevision: 1, sourceDescription: 'retarget' },
          'PATCH',
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await f.mutate(
          '',
          { expectedRevision: 1, url: 'https://example.test/retarget' },
          'PATCH',
        )
      ).status,
    ).toBe(400);
    await expect(
      fixture.pool.query(
        'DELETE FROM received_contract_document_relations WHERE document_id=$1',
        [responseString(f.document, 'id')],
      ),
    ).rejects.toHaveProperty('code', '23514');
    await expect(
      fixture.pool.query(
        "UPDATE received_contract_document_relations SET source_description='rewritten' WHERE document_id=$1",
        [responseString(f.document, 'id')],
      ),
    ).rejects.toHaveProperty('code', '23514');
    await expect(
      fixture.pool.query(
        "INSERT INTO working_documents(workspace_id,company_id,client_id,type,title,purpose,created_by_membership_id,idempotency_key,request_fingerprint) SELECT workspace_id,company_id,client_id,type,title,purpose,created_by_membership_id,'missing-relation','synthetic' FROM working_documents WHERE id=$1",
        [responseString(f.document, 'id')],
      ),
    ).rejects.toHaveProperty('code', '23514');
  });

  it('keeps a historical exact source and registration replay after Contract succession without needing Offer, model or economic grants', async () => {
    const f = await received();
    const next = responseRecord(
      await f.ready.invoke(f.ready.path + '/versions/from-approved-model', {
        ...f.ready.intent,
        expectedContractRevision: 1,
      }),
    );
    expect(responseString(responseRecord(next.version), 'id')).not.toBe(
      f.contractVersionId,
    );
    for (const path of [
      '/company-offer-preparer-assignments',
      '/company-offer-model-editor-assignments',
      '/company-contract-model-editor-assignments',
      '/company-contract-model-approver-assignments',
      '/company-profitability-contributor-assignments',
    ])
      await revokeModelContractFixtureGrant(
        fixture,
        path,
        f.ready.source.companyId,
        f.ready.source.preparerMembershipId,
      );
    expect(await fixture.command(f.options)).toEqual(f.document);
    const another = responseRecord(
      await fixture.command({
        ...f.options,
        key: randomUUID(),
        body: { ...f.options.body, title: 'Second declared received file' },
      }),
    );
    expect(another).toMatchObject({
      receivedContractRelation: {
        access: 'granted',
        contractId: f.contractId,
        contractVersionId: f.contractVersionId,
        sourceDescription: 'Synthetic email source',
        receivedOn: '2026-10-25',
      },
    });
    const page = responseRecord(
      await fixture.read({
        path: '/documents/received-contract-sources',
        companyId: f.ready.source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
      }),
    );
    expect(page.sources).toHaveLength(2);
    expect((await f.call('')).status).toBe(200);
    const conflict = await fixture.post({
      ...f.options,
      body: {
        ...f.options.body,
        contractVersionId: responseString(responseRecord(next.version), 'id'),
      },
    });
    expect(conflict.status).toBe(409);
  });

  it('preserves exact PDF uploads across restart, clean designation and an empty successor without changing the declared relation', async () => {
    const f = await received();
    for (const path of [
      '/company-document-content-reader-assignments',
      '/company-document-content-uploader-assignments',
      '/company-document-approver-assignments',
    ])
      await fixture.grant({
        path,
        companyId: f.ready.source.companyId,
        membershipId: f.ready.source.preparerMembershipId,
      });
    const versionId = responseString(responseRecord(f.document.version), 'id');
    expect(
      (
        await f.mutate(`/versions/${versionId}/official-designation`, {
          expectedRevision: 1,
        })
      ).status,
    ).toBe(409);
    const uploadKey = randomUUID();
    const first = await f.upload(versionId, 1, PDF_A, uploadKey);
    expect(first.status).toBe(201);
    const firstReceipt = await first.json();
    expect(firstReceipt).toMatchObject({ workingRevision: 2 });
    expect((await f.upload(versionId, 2, PDF_B)).status).toBe(201);
    expect(
      await (await f.upload(versionId, 1, PDF_A, uploadKey)).json(),
    ).toEqual(firstReceipt);
    expect((await f.upload(versionId, 1, PDF_B, uploadKey)).status).toBe(409);
    await fixture.restart();
    expect(
      Buffer.from(
        await (await f.call(`/versions/${versionId}/content`)).arrayBuffer(),
      ),
    ).toEqual(PDF_B);
    const history = responseRecord(
      await (await f.call(`/versions/${versionId}/content/history`)).json(),
    );
    if (!Array.isArray(history.uploads))
      throw new Error('Expected upload history.');
    const oldId = responseString(
      responseRecord(history.uploads[1]),
      'representationId',
    );
    expect(
      Buffer.from(
        await (
          await f.call(`/versions/${versionId}/content/${oldId}`)
        ).arrayBuffer(),
      ),
    ).toEqual(PDF_A);
    expect(
      (
        await f.mutate(`/versions/${versionId}/official-designation`, {
          expectedRevision: 3,
        })
      ).status,
    ).toBe(200);
    const next = await f.mutate('/versions', { expectedRevision: 4 });
    expect(next.status).toBe(201);
    const successor = responseRecord(await next.json());
    const nextId = responseString(successor, 'versionId');
    expect(await (await f.call('/versions')).json()).toMatchObject({
      workingRevision: 5,
      versions: [
        {
          id: nextId,
          status: 'draft',
          representations: [],
          pdfContent: { state: 'absent' },
        },
        {
          id: versionId,
          status: 'official',
          pdfContent: { state: 'stored', access: 'granted' },
        },
      ],
    });
    expect(
      (
        await f.mutate(
          '',
          { expectedRevision: 5, title: 'Corrected received title' },
          'PATCH',
        )
      ).status,
    ).toBe(200);
    expect((await f.upload(nextId, 6, PDF_A)).status).toBe(201);
    expect(
      (
        await f.mutate(`/versions/${nextId}/official-designation`, {
          expectedRevision: 7,
        })
      ).status,
    ).toBe(200);
    expect(await (await f.call('')).json()).toMatchObject({
      receivedContractRelation: f.document.receivedContractRelation,
    });
    expect(await (await f.call('/versions')).json()).toMatchObject({
      workingRevision: 8,
      versions: [
        { id: nextId, status: 'official' },
        { id: versionId, status: 'superseded' },
      ],
    });
    expect(
      Buffer.from(
        await (await f.call(`/versions/${versionId}/content`)).arrayBuffer(),
      ),
    ).toEqual(PDF_B);
    expect(scanner.scanCount).toBe(3);
  });

  it('offers a labeled exact Contract Version selection without registering a Document', async () => {
    const { ready, contractId, contractVersionId } = await source();
    const page = await fixture.read({
      path: '/documents/received-contract-sources',
      companyId: ready.source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
    });
    expect(page).toMatchObject({
      sources: [
        {
          opportunityId: ready.source.opportunityId,
          contractId,
          contractVersionId,
          contractVersionNumber: 1,
          illustrativeReference: 1,
          clientId: ready.source.clientId,
          clientDisplayName: expect.any(String),
          opportunityTitle: expect.any(String),
        },
      ],
      nextCursor: null,
    });
    expect(
      await fixture.read({
        path: '/documents',
        companyId: ready.source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
      }),
    ).toEqual([]);
  });

  it('paginates only visible exact Versions at twenty per page and rejects malformed or invisible cursors', async () => {
    const f = await source();
    for (let revision = 1; revision < 23; revision++)
      await f.ready.invoke(f.ready.path + '/versions/from-approved-model', {
        ...f.ready.intent,
        expectedContractRevision: revision,
      });
    const read = (suffix = '') =>
      fixture.request({
        path: '/documents/received-contract-sources' + suffix,
        companyId: f.ready.source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
      });
    const first = responseRecord(await (await read()).json());
    expect(first.sources).toHaveLength(20);
    const cursor = responseString(first, 'nextCursor');
    expect(cursor).toMatch(/^[A-Za-z0-9_-]{48}$/u);
    const next = responseRecord(await (await read('?cursor=' + cursor)).json());
    expect(next.sources).toHaveLength(3);
    expect(next.nextCursor).toBeNull();
    if (!Array.isArray(first.sources) || !Array.isArray(next.sources))
      throw new Error('Expected source pages');
    const ids = [...first.sources, ...next.sources].map((value) =>
      responseString(responseRecord(value), 'contractVersionId'),
    );
    expect(new Set(ids).size).toBe(23);
    expect(ids).toContain(f.contractVersionId);
    for (const suffix of [
      '?page=2',
      '?cursor=invalid',
      '?cursor=' + Buffer.from(randomUUID()).toString('base64url'),
      '?cursor=' + cursor + '&limit=100',
    ])
      expect((await read(suffix)).status).toBe(400);
    await fixture.pool.query(
      "UPDATE client_company_relationships SET status='archived' WHERE client_account_id=$1 AND company_id=$2",
      [f.ready.source.clientId, f.ready.source.companyId],
    );
    expect(await (await read()).json()).toEqual({
      sources: [],
      nextCursor: null,
    });
    expect((await read('?cursor=' + cursor)).status).toBe(400);
  });

  it('organizes received PDFs under an ordinary matching Project without making them eligible Task results or adding source fields to Activity', async () => {
    const f = await received(),
      s = f.ready.source;
    for (const path of [
      '/company-mission-deliverable-access-assignments',
      '/company-project-assignments',
      '/company-task-manager-assignments',
      '/company-task-result-recorder-assignments',
      '/company-document-project-organizer-assignments',
      '/company-document-content-reader-assignments',
      '/company-document-content-uploader-assignments',
      '/company-document-approver-assignments',
    ])
      await fixture.grant({
        path,
        companyId: s.companyId,
        membershipId: s.preparerMembershipId,
      });
    const command = (path: string, body: unknown) =>
      fixture.command({
        path,
        body,
        companyId: s.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
      });
    const read = (path: string) =>
      fixture.read({
        path,
        companyId: s.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
      });
    const project = responseRecord(
        await command('/projects', {
          title: 'Received organizational Project DEMO',
          clientAccountId: s.clientId,
        }),
      ),
      projectId = responseString(project, 'id');
    const task = responseRecord(
        await command(`/projects/${projectId}/tasks`, {
          title: 'Ordinary mission result Task DEMO',
        }),
      ),
      taskId = responseString(task, 'id');
    const documentId = responseString(f.document, 'id'),
      versionId = responseString(responseRecord(f.document.version), 'id');
    expect((await f.upload(versionId, 1, PDF_A)).status).toBe(201);
    expect(
      (
        await f.mutate(`/versions/${versionId}/official-designation`, {
          expectedRevision: 2,
        })
      ).status,
    ).toBe(200);
    await command(`/documents/${documentId}/project-association`, {
      action: 'link',
      projectId,
      expectedRevision: 0,
    });
    expect(await read(`/projects/${projectId}/documents`)).toMatchObject({
      documents: [{ document: { id: documentId, type: 'received-contract' } }],
    });
    expect(
      await read(`/tasks/${taskId}/results/eligible-versions`),
    ).toMatchObject({ versions: [] });
    const refused = await fixture.post({
      path: `/tasks/${taskId}/results`,
      companyId: s.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      body: {
        expectedTaskVersion: 1,
        expectedResultRevision: 0,
        documentId,
        versionId,
        declaration: 'This received Contract is not a mission output',
      },
    });
    expect(refused.status).toBe(404);
    const activity = responseRecord(await read('/activity-log'));
    if (!Array.isArray(activity.events))
      throw new Error('Expected Activity events');
    const events = activity.events
      .map(responseRecord)
      .filter((event) => String(event.action).startsWith('document'));
    expect(events.some((event) => event.action === 'document.registered')).toBe(
      true,
    );
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain(f.contractId);
    expect(serialized).not.toContain(f.contractVersionId);
    expect(serialized).not.toContain('Synthetic email source');
    expect(serialized).not.toContain('received-demo.pdf');
    await revokeModelContractFixtureGrant(
      fixture,
      '/company-received-contract-access-assignments',
      s.companyId,
      s.preparerMembershipId,
    );
    expect(await read(`/projects/${projectId}/documents`)).toMatchObject({
      documents: [],
    });
    const hiddenActivity = JSON.stringify(await read('/activity-log'));
    expect(hiddenActivity).not.toContain(documentId);
  });

  it('registers an explicitly authorized empty received Document with the exact declared Contract Version and unknown receipt date', async () => {
    const ready = await prepareModelContractSource(fixture);
    const contract = responseRecord(
      await ready.invoke(ready.path + '/from-approved-model', ready.intent),
    );
    const contractId = responseString(contract, 'id');
    const contractVersionId = responseString(
      responseRecord(contract.version),
      'id',
    );
    for (const path of [
      '/company-document-registrar-assignments',
      '/company-received-contract-access-assignments',
    ])
      await fixture.grant({
        path,
        companyId: ready.source.companyId,
        membershipId: ready.source.preparerMembershipId,
      });
    const created = responseRecord(
      await fixture.command({
        path: '/documents',
        companyId: ready.source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body: {
          type: 'received-contract',
          opportunityId: ready.source.opportunityId,
          contractId,
          contractVersionId,
          title: ' Received Contract DEMO ',
          purpose: ' Preserve the external original ',
          sourceDescription: ' Synthetic email source ☀️ ',
        },
      }),
    );
    expect(created).toMatchObject({
      type: 'received-contract',
      confidentiality: 'company-confidential',
      companyId: ready.source.companyId,
      clientId: ready.source.clientId,
      title: 'Received Contract DEMO',
      purpose: 'Preserve the external original',
      workingRevision: 1,
      version: { status: 'draft', representation: null },
      receivedContractRelation: {
        access: 'granted',
        opportunityId: ready.source.opportunityId,
        contractId,
        contractVersionId,
        contractVersionNumber: 1,
        illustrativeReference: 1,
        sourceDescription: 'Synthetic email source ☀️',
        receivedOn: null,
      },
    });
    expect(
      await fixture.read({
        path: '/documents/' + responseString(created, 'id'),
        companyId: ready.source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
      }),
    ).toEqual(created);
  });
});
