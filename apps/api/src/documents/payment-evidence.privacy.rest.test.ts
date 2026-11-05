import { createHash, randomUUID } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { unzipSync } from 'fflate';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { KnowledgeIdentityVerifier } from '../knowledge/knowledge-identity.js';
import { draftInput } from '../knowledge/knowledge.validation.js';
import { createKnowledgeMcpServer } from '../knowledge-mcp/server.js';
import { prepareReportedSigning } from '../contract/reported-contract-signing.test-support.js';
import { fictionalInvoiceValues } from '../invoice-record/invoice-record.proof-support.js';
import {
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';
import { openDocumentScannerFixture } from './document-scanner.test-support.js';
import { PDF_A } from './mission-document.test-support.js';
import {
  createPaymentEvidenceFixture,
  paymentJson,
  paymentNoticePdf,
  paymentRecord,
  paymentText,
  type PaymentEvidenceFixture,
} from './payment-evidence.test-support.js';
import {
  paymentEvidenceEffects,
  paymentSourceBody,
  registerPaymentSource,
} from './payment-evidence-proof.test-support.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;
function hash(bytes: Uint8Array | string) {
  return createHash('sha256').update(bytes).digest('hex');
}
function excludes(value: unknown, privateFacts: readonly string[]) {
  const serialized = JSON.stringify(value);
  for (const fact of privateFacts) expect(serialized).not.toContain(fact);
}

withPostgres('Payment Evidence Source bounded and indirect privacy', () => {
  let fixture: PaymentEvidenceFixture;
  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    vi.stubEnv('KNOWLEDGE_EVIDENCE_ENABLED', 'true');
    fixture = await createPaymentEvidenceFixture(databaseUrl);
  });
  beforeEach(async () => {
    await fixture.reset();
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await fixture?.close();
  });

  it.each(['reader', 'confirmer', 'reverser'] as const)(
    'gives the supported %s a real source read without Recorder mutation authority',
    async (identity) => {
      const source = await registerPaymentSource(fixture);
      for (const path of [
        '/documents/' + source.documentId,
        `/documents/${source.documentId}/versions`,
      ]) {
        const response = await fixture.call(path, { identity });
        expect(response.status).toBe(200);
        expect(await response.text()).toContain(source.versionId);
      }
      const before = await paymentEvidenceEffects(fixture.pool);
      expect(
        (
          await fixture.call('/documents/' + source.documentId, {
            identity,
            method: 'PATCH',
            body: { expectedRevision: 1, title: 'Forbidden reader correction' },
          })
        ).status,
      ).toBe(404);
      expect(await paymentEvidenceEffects(fixture.pool)).toEqual(before);
    },
  );
  it('uses Recorder as an independent supported read alternative after Reader removal', async () => {
    const source = await registerPaymentSource(fixture);
    expect(
      (
        await fixture.revoke(
          '/company-payment-reader-assignments',
          fixture.ready.membershipIds.owner,
        )
      ).status,
    ).toBe(200);
    const response = await fixture.call('/documents/' + source.documentId);
    expect(response.status).toBe(200);
    expect((await paymentJson(response)).id).toBe(source.documentId);
  });

  describe('populated generic Activity boundary', () => {
    let ordinaryId: string;
    let home: Record<string, unknown>;
    let ids: string[];
    // Public fixture construction uses the native hook budget; the behavioral
    // read assertions retain the unchanged default test deadline.
    beforeEach(async () => {
      const ordinary = await fixture.call('/documents', {
        method: 'POST',
        body: {
          clientId: fixture.ready.clientId,
          title: 'Older ordinary questionnaire control',
          purpose: 'Remain discoverable before generic page bounds',
          url: 'https://example.test/ordinary-control',
        },
      });
      expect(ordinary.status).toBe(201);
      ordinaryId = paymentText((await paymentJson(ordinary)).id);
      const initialHome = await fixture.call('/operational-home');
      expect(initialHome.status).toBe(200);
      home = await paymentJson(initialHome);
      ids = [];
      for (let index = 0; index < 51; index++) {
        const response = await fixture.call('/documents', {
          method: 'POST',
          body: {
            ...paymentSourceBody(fixture),
            title: 'Private FICT-PAY-001 notice ' + index,
          },
        });
        expect(response.status).toBe(201);
        ids.push(paymentText((await paymentJson(response)).id));
      }
    });
    it('excludes 51 newer private registrations before generic Activity bounds and from Home counts for an authorized Payment reader', async () => {
      for (const path of ['/activity-log', '/operational-home']) {
        const response = await fixture.call(path);
        expect(response.status, path).toBe(200);
        const value: unknown = await response.json();
        if (path === '/activity-log')
          expect(JSON.stringify(value)).toContain(ordinaryId);
        else expect(value).toEqual(home);
        excludes(value, [...ids, 'Private FICT-PAY-001 notice']);
      }
      const privateDetail = await fixture.call('/documents/' + ids[0]);
      expect(privateDetail.status).toBe(200);
      const ordinaryList = await fixture.call('/documents', {
        identity: 'ordinary',
      });
      expect(ordinaryList.status).toBe(200);
      const list: unknown = await ordinaryList.json();
      expect(JSON.stringify(list)).toContain(ordinaryId);
      excludes(list, ids);
    });
  });

  it('keeps exact official Payment bytes out of Project/ZIP, Task, Knowledge/MCP and Document-derived duplicate basis with native old-family controls', async () => {
    for (const path of [
      '/company-project-assignments',
      '/company-document-project-organizer-assignments',
      '/company-task-manager-assignments',
      '/company-task-result-recorder-assignments',
      '/company-mission-deliverable-access-assignments',
      '/knowledge/assignments/administrators',
      '/knowledge/assignments/readers',
    ])
      expect(
        (await fixture.grant(path, fixture.ready.membershipIds.owner)).status,
      ).toBe(201);
    const source = await registerPaymentSource(fixture);
    const bytes = await paymentNoticePdf();
    const upload = await fixture.upload({ ...source, revision: 1, bytes });
    expect(upload.status).toBe(201);
    const representationId = paymentText(
      (await paymentJson(upload)).representationId,
    );
    expect(
      (
        await fixture.call(
          `/documents/${source.documentId}/versions/${source.versionId}/official-designation`,
          { method: 'POST', body: { expectedRevision: 2 } },
        )
      ).status,
    ).toBe(200);
    const hidden = [
      source.documentId,
      source.versionId,
      representationId,
      source.body.title,
    ];

    const project = await fixture.call('/projects', {
      method: 'POST',
      body: {
        clientAccountId: fixture.ready.clientId,
        title: 'Fictional ordinary Project control',
      },
    });
    expect(project.status).toBe(201);
    const projectId = paymentText((await paymentJson(project)).id);
    const task = await fixture.call(`/projects/${projectId}/tasks`, {
      method: 'POST',
      body: { title: 'Fictional Task control' },
    });
    expect(task.status).toBe(201);
    const taskId = paymentText((await paymentJson(task)).id);
    const lawful = await fixture.call('/documents', {
      method: 'POST',
      body: {
        type: 'mission-deliverable',
        clientId: fixture.ready.clientId,
        title: 'Fictional lawful mission control',
        purpose: 'Preserve a native nonfinancial source',
      },
    });
    expect(lawful.status).toBe(201);
    const lawfulDocument = await paymentJson(lawful);
    const lawfulId = paymentText(lawfulDocument.id);
    const lawfulVersion = paymentText(paymentRecord(lawfulDocument.version).id);
    const lawfulUpload = await fixture.upload({
      documentId: lawfulId,
      versionId: lawfulVersion,
      revision: 1,
      bytes: PDF_A,
    });
    expect(lawfulUpload.status).toBe(201);
    const lawfulRepresentation = paymentText(
      (await paymentJson(lawfulUpload)).representationId,
    );
    expect(
      (
        await fixture.call(
          `/documents/${lawfulId}/versions/${lawfulVersion}/official-designation`,
          { method: 'POST', body: { expectedRevision: 2 } },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await fixture.call(`/documents/${lawfulId}/project-association`, {
          method: 'POST',
          body: { action: 'link', projectId, expectedRevision: 0 },
        })
      ).status,
    ).toBe(201);
    for (const path of [
      `/projects/${projectId}/documents`,
      `/tasks/${taskId}/results/eligible-versions`,
    ]) {
      const response = await fixture.call(path);
      expect(response.status, path).toBe(200);
      const value: unknown = await response.json();
      expect(JSON.stringify(value)).toContain(lawfulId);
      excludes(value, hidden);
    }
    const lawfulBundle = await fixture.call(
      `/projects/${projectId}/pdf-bundle`,
      {
        method: 'POST',
        body: {
          items: [
            {
              documentId: lawfulId,
              versionId: lawfulVersion,
              representationId: lawfulRepresentation,
              expectedProjectRevision: 1,
            },
          ],
        },
      },
    );
    expect(lawfulBundle.status).toBe(200);
    const bundleFiles = unzipSync(
      new Uint8Array(await lawfulBundle.arrayBuffer()),
    );
    expect(
      Object.entries(bundleFiles)
        .filter(([name]) => name !== 'manifest.json')
        .map(([, content]) => hash(content)),
    ).toEqual([hash(PDF_A)]);
    const before = await paymentEvidenceEffects(fixture.pool);
    expect(
      (
        await fixture.call(
          `/documents/${source.documentId}/project-association`,
          {
            method: 'POST',
            body: { action: 'link', projectId, expectedRevision: 0 },
          },
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await fixture.call(`/projects/${projectId}/pdf-bundle`, {
          method: 'POST',
          body: {
            items: [
              {
                documentId: source.documentId,
                versionId: source.versionId,
                representationId,
                expectedProjectRevision: 0,
              },
            ],
          },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await fixture.call(`/tasks/${taskId}/results`, {
          method: 'POST',
          body: {
            expectedTaskVersion: 1,
            expectedResultRevision: 0,
            documentId: source.documentId,
            versionId: source.versionId,
            declaration: 'Fictional forbidden financial result',
          },
        })
      ).status,
    ).toBe(404);
    expect(await paymentEvidenceEffects(fixture.pool)).toEqual(before);
    expect(
      (
        await fixture.call(`/tasks/${taskId}/results`, {
          method: 'POST',
          body: {
            expectedTaskVersion: 1,
            expectedResultRevision: 0,
            documentId: lawfulId,
            versionId: lawfulVersion,
            declaration: 'Fictional lawful mission result',
          },
        })
      ).status,
    ).toBe(201);

    const reviewPath = `/clients/${fixture.ready.unionSourceClientId}/union-reviews`;
    expect(
      (await fixture.call('/clients/' + fixture.ready.unionSourceClientId))
        .status,
    ).toBe(200);
    // Its genuinely distinct identifier has no duplicate pair. Do not fabricate one.
    expect(
      (await fixture.call(reviewPath, { method: 'POST', body: {} })).status,
    ).toBe(404);
    const beforeBasis = await paymentEvidenceEffects(fixture.pool);
    expect(
      (
        await fixture.call(reviewPath, {
          method: 'POST',
          body: { documentId: source.documentId },
        })
      ).status,
    ).toBe(400);
    expect(await paymentEvidenceEffects(fixture.pool)).toEqual(beforeBasis);

    const knowledgeBody = {
      documentId: lawfulId,
      documentVersionId: lawfulVersion,
      representationId: lawfulRepresentation,
      sourceSha256: hash(PDF_A),
      language: 'en',
      ownerReference: 'Fictional source owner',
      provenance: 'Fictional native mission source',
      rightsEvidenceReference: 'Synthetic authored control',
      permittedPurpose: 'cited-evidence',
      effectiveFrom: '2026-01-01T00:00:00.000Z',
      effectiveUntil: '2027-01-01T00:00:00.000Z',
      passages: [
        { locator: 'p1', text: 'Fictional admitted mission evidence' },
      ],
    };
    const knowledge = await fixture.call('/knowledge/sources', {
      method: 'POST',
      body: knowledgeBody,
    });
    expect(knowledge.status).toBe(201);
    const draft = await paymentJson(knowledge);
    const sourceId = paymentText(draft.sourceId);
    const financialBody = {
      ...knowledgeBody,
      documentId: source.documentId,
      documentVersionId: source.versionId,
      representationId,
      sourceSha256: hash(bytes),
    };
    const beforeKnowledge = await paymentEvidenceEffects(fixture.pool);
    expect(
      (
        await fixture.call('/knowledge/sources', {
          method: 'POST',
          body: financialBody,
        })
      ).status,
    ).toBe(404);
    const projectionSha = hash(
      JSON.stringify({
        documentVersionId: source.versionId,
        representationId,
        sourceSha256: hash(bytes),
        passages: knowledgeBody.passages,
      }),
    );
    const fingerprint = hash(
      JSON.stringify({
        companyId: fixture.ready.companyId,
        kind: 'create',
        input: draftInput(financialBody),
      }),
    );
    const writer = await fixture.pool.connect();
    try {
      await writer.query('BEGIN');
      // Complete negative source/passages/event/receipt candidate; no positive SQL fixture.
      await expect(
        writer.query(
          `WITH source AS (
        INSERT INTO knowledge_sources SELECT (jsonb_populate_record(NULL::knowledge_sources,to_jsonb(s)||jsonb_build_object('id',$2::text,'document_id',$3::text,'document_version_id',$4::text,'representation_id',$5::text,'source_sha256',$6::text,'projection_sha256',$7::text))).*
        FROM knowledge_sources s WHERE id=$1 RETURNING *
      ), passages AS (
        INSERT INTO knowledge_passages SELECT p.workspace_id,p.company_id,s.id,p.position,p.locator,p.text,p.sha256 FROM knowledge_passages p CROSS JOIN source s WHERE p.source_id=$1 RETURNING source_id
      ), event AS (
        INSERT INTO knowledge_source_events SELECT gen_random_uuid(),e.workspace_id,e.company_id,s.id,e.revision,e.action,e.actor_membership_id,e.actor_internal_user_id,e.actor_display_name,$9,e.recorded_at
        FROM knowledge_source_events e CROSS JOIN source s CROSS JOIN (SELECT count(*) FROM passages) p WHERE e.source_id=$1 RETURNING source_id
      ), command AS (
        INSERT INTO knowledge_source_commands SELECT gen_random_uuid(),c.workspace_id,c.company_id,c.actor_membership_id,$8,$9,s.id,c.result||jsonb_build_object('sourceId',s.id::text,'sourceSha256',s.source_sha256,'projectionSha256',s.projection_sha256)
        FROM knowledge_source_commands c CROSS JOIN source s CROSS JOIN (SELECT count(*) FROM event) e WHERE c.source_id=$1 RETURNING source_id
      ) SELECT source_id FROM command`,
          [
            sourceId,
            randomUUID(),
            source.documentId,
            source.versionId,
            representationId,
            hash(bytes),
            projectionSha,
            randomUUID(),
            fingerprint,
          ],
        ),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'financial_document_use_forbidden',
      });
    } finally {
      await writer.query('ROLLBACK');
      writer.release();
    }
    expect(await paymentEvidenceEffects(fixture.pool)).toEqual(beforeKnowledge);
    expect(
      (
        await fixture.call(`/knowledge/sources/${sourceId}/admission`, {
          method: 'POST',
          body: {
            expectedRevision: 1,
            attestation: 'exact-version-source-and-use-reviewed/v1',
            sourceSha256: draft.sourceSha256,
            projectionSha256: draft.projectionSha256,
          },
        })
      ).status,
    ).toBe(200);
    for (const path of [
      '/knowledge/evidence/sources',
      '/knowledge/evidence/search?query=Fictional',
    ]) {
      const response = await fixture.call(path);
      expect(response.status).toBe(200);
      const value: unknown = await response.json();
      expect(JSON.stringify(value)).toContain(sourceId);
      excludes(value, hidden);
    }

    const actorResponse = await fixture.call('/access/current-actor');
    const origin = new URL(actorResponse.url).origin;
    const actor = await paymentJson(actorResponse);
    const previousMode = process.env.ACCESS_IDENTITY_MODE;
    process.env.ACCESS_IDENTITY_MODE = 'clerk';
    const verifier = vi
      .spyOn(KnowledgeIdentityVerifier.prototype, 'verify')
      .mockImplementation(async (request) => {
        if (
          request.get('authorization') !==
          'Bearer synthetic-payment-evidence-exclusion'
        )
          throw new UnauthorizedException();
        return {
          provider: 'deterministic-test',
          subject: 'payment-evidence-owner',
          displayName: 'Fictional Payment Evidence Owner',
          email: 'payment-evidence-owner@example.test',
        };
      });
    const server = createKnowledgeMcpServer({
      PRISMA_KNOWLEDGE_API_ORIGIN: origin,
      PRISMA_KNOWLEDGE_WORKSPACE_ID: paymentText(actor.workspaceId),
      PRISMA_KNOWLEDGE_COMPANY_ID: fixture.ready.companyId,
      PRISMA_KNOWLEDGE_BEARER_TOKEN: 'synthetic-payment-evidence-exclusion',
    });
    const client = new Client({
      name: 'payment-evidence-exclusion-native-proof',
      version: '1',
    });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      expect((await client.listTools()).tools).toHaveLength(3);
      for (const tool of [
        { name: 'list_knowledge_sources', arguments: {} },
        { name: 'search_knowledge', arguments: { query: 'Fictional' } },
      ]) {
        const value = await client.callTool(tool);
        expect(JSON.stringify(value)).toContain(sourceId);
        excludes(value, hidden);
      }
      const lawfulPassage = await client.callTool({
        name: 'get_knowledge_passage',
        arguments: { sourceId, locator: 'p1' },
      });
      expect(lawfulPassage.isError).not.toBe(true);
      expect(JSON.stringify(lawfulPassage)).toContain(
        'Fictional admitted mission evidence',
      );
      const denied = await client.callTool({
        name: 'get_knowledge_passage',
        arguments: { sourceId: source.documentId, locator: 'p1' },
      });
      expect(denied.isError).toBe(true);
      excludes(denied, hidden);
    } finally {
      await client.close();
      await server.close();
      verifier.mockRestore();
      if (previousMode === undefined) delete process.env.ACCESS_IDENTITY_MODE;
      else process.env.ACCESS_IDENTITY_MODE = previousMode;
    }
  });
});

withPostgres(
  'Payment Evidence Source exclusion from signing and Invoice Record owners',
  () => {
    let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>;
    let scanner: Awaited<ReturnType<typeof openDocumentScannerFixture>>;
    let signed: Awaited<ReturnType<typeof prepareReportedSigning>>;
    let payment: Record<string, unknown>;
    let paymentTuple: Awaited<ReturnType<typeof preserve>>;
    async function preserve(document: Record<string, unknown>, bytes: Buffer) {
      const documentId = responseString(document, 'id');
      const versionId = responseString(responseRecord(document.version), 'id');
      const uploaded = await fixture.request({
        ...signed.target,
        path: `/documents/${documentId}/versions/${versionId}/content?expectedRevision=1&fileName=fictional-source.pdf`,
        init: {
          method: 'POST',
          headers: {
            'content-type': 'application/pdf',
            'idempotency-key': randomUUID(),
          },
          body: new Uint8Array(bytes),
        },
      });
      expect(uploaded.status).toBe(201);
      const representationId = responseString(
        responseRecord(await uploaded.json()),
        'representationId',
      );
      expect(
        (
          await fixture.post({
            ...signed.target,
            path: `/documents/${documentId}/versions/${versionId}/official-designation`,
            body: { expectedRevision: 2 },
          })
        ).status,
      ).toBe(200);
      return { documentId, documentVersionId: versionId, representationId };
    }
    beforeAll(async () => {
      scanner = await openDocumentScannerFixture();
      fixture = await openEstimateOfferFixture({
        scannerEnvironment: scanner.environment,
      });
    });
    beforeEach(async () => {
      await fixture.reset();
      scanner.reset();
      signed = await prepareReportedSigning(fixture);
      const companyId = signed.target.companyId;
      const membershipId = signed.f.ready.source.preparerMembershipId;
      for (const path of [
        '/company-payment-recorder-assignments',
        '/company-payment-evidence-access-assignments',
        '/company-invoice-recorder-assignments',
        '/company-external-invoice-access-assignments',
      ])
        await fixture.grant({ path, companyId, membershipId });
      payment = responseRecord(
        await fixture.command({
          ...signed.target,
          path: '/documents',
          body: {
            type: 'payment-evidence',
            clientId: signed.f.ready.source.clientId,
            payer: { kind: 'PRIMARY' },
            title: 'Fictional confidential payment notice',
            purpose: 'Prove native indirect exclusions',
            sourceDescription: 'Fictional manual notice',
            receivedOn: null,
          },
        }),
      );
      paymentTuple = await preserve(payment, await paymentNoticePdf());
    });
    afterAll(async () => {
      await fixture?.close();
      await scanner?.close();
    });
    it('refuses a known exact Payment UUID for signing while the lawful received source remains usable', async () => {
      const candidates = responseRecord(
        await fixture.read({
          ...signed.target,
          path: signed.path + '/pdf-candidates',
        }),
      );
      expect(JSON.stringify(candidates)).toContain(
        responseString(signed.f.document, 'id'),
      );
      excludes(candidates, [
        paymentTuple.documentId,
        paymentTuple.documentVersionId,
        paymentTuple.representationId,
        responseString(payment, 'title'),
      ]);
      const before = await paymentEvidenceEffects(fixture.pool);
      const deniedSigning = await fixture.post({
        ...signed.target,
        path: signed.path,
        body: { ...signed.body, ...paymentTuple },
      });
      expect(deniedSigning.status).toBe(404);
      expect(await paymentEvidenceEffects(fixture.pool)).toEqual(before);
      expect(
        (
          await fixture.post({
            ...signed.target,
            path: signed.path,
            body: signed.body,
          })
        ).status,
      ).toBe(201);
    });

    describe('Invoice Record source qualification', () => {
      let invoiceTuple: Awaited<ReturnType<typeof preserve>>;
      beforeEach(async () => {
        expect(
          (
            await fixture.post({
              ...signed.target,
              path: signed.path,
              body: signed.body,
            })
          ).status,
        ).toBe(201);
        const invoice = responseRecord(
          await fixture.command({
            ...signed.target,
            path: '/documents',
            body: {
              type: 'external-invoice',
              opportunityId: signed.f.ready.source.opportunityId,
              contractId: signed.f.contractId,
              contractVersionId: signed.f.contractVersionId,
              title: 'Fictional invoice control',
              purpose: 'Keep the native direct source gate exact',
              sourceDescription: 'Fictional manual source',
              receivedOn: null,
            },
          }),
        );
        invoiceTuple = await preserve(invoice, PDF_A);
      });
      it('refuses a known exact Payment UUID while the lawful external-Invoice source remains usable', async () => {
        const companyId = signed.target.companyId;
        const selection = responseRecord(
          await fixture.read({
            ...signed.target,
            path: '/invoice-records/sources',
          }),
        );
        expect(JSON.stringify(selection)).toContain(invoiceTuple.documentId);
        excludes(selection, [
          paymentTuple.documentId,
          paymentTuple.documentVersionId,
          paymentTuple.representationId,
        ]);
        const invoiceBody = {
          source: paymentTuple,
          values: fictionalInvoiceValues(),
          acknowledgeExternalDeclaration: true,
          replacesWithdrawnRecordId: null,
        };
        const beforeInvoice = await paymentEvidenceEffects(fixture.pool);
        expect(
          (
            await fixture.post({
              ...signed.target,
              path: '/invoice-records',
              body: invoiceBody,
            })
          ).status,
        ).toBe(404);
        await expect(
          fixture.pool.query(
            'SELECT documents_invoice_record_source($1::uuid,$2::uuid,$3::jsonb)',
            [
              responseString(payment, 'workspaceId'),
              companyId,
              JSON.stringify(paymentTuple),
            ],
          ),
        ).rejects.toMatchObject({
          code: '23514',
          constraint: 'invoice_native_source',
        });
        expect(await paymentEvidenceEffects(fixture.pool)).toEqual(
          beforeInvoice,
        );
        expect(
          (
            await fixture.post({
              ...signed.target,
              path: '/invoice-records',
              body: { ...invoiceBody, source: invoiceTuple },
            })
          ).status,
        ).toBe(201);
      });
    });
  },
);
