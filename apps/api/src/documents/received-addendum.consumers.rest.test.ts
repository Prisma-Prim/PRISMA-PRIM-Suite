import { createHash, randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { UnauthorizedException } from '@nestjs/common';
import { createKnowledgeMcpServer } from '../knowledge-mcp/server.js';
import { KnowledgeIdentityVerifier } from '../knowledge/knowledge-identity.js';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  ESTIMATE_OFFER_WORKSPACE,
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';
import { predecessorSnapshot } from './external-invoice-migration.test-support.js';
import { fictionalInvoiceValues } from '../invoice-record/invoice-record.proof-support.js';
import { openDocumentScannerFixture } from './document-scanner.test-support.js';
import {
  fictionalAddendumPdf,
  prepareReceivedAddendumParent,
} from './received-addendum.test-support.js';
const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres.each(['received-addendum', 'received-audit-source'])(
  '%s excluded native consumers even with every relevant grant',
  (family) => {
    let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>,
      scanner: Awaited<ReturnType<typeof openDocumentScannerFixture>>,
      parent: Awaited<ReturnType<typeof prepareReceivedAddendumParent>>;
    let source: {
        documentId: string;
        documentVersionId: string;
        representationId: string;
      },
      paymentControl: typeof source,
      invoiceControl: typeof source,
      bytes: Buffer,
      projectId: string,
      taskId: string;
    const post = (path: string, body: unknown) =>
      parent.call(path, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': randomUUID(),
        },
        body: JSON.stringify(body),
      });
    const title = `Confidential fictional ${family} source exclusion`;
    beforeAll(async () => {
      scanner = await openDocumentScannerFixture();
      fixture = await openEstimateOfferFixture({
        scannerEnvironment: scanner.environment,
      });
      bytes = await fictionalAddendumPdf();
    });
    beforeEach(async () => {
      await fixture.reset();
      scanner.reset();
      vi.stubEnv('KNOWLEDGE_EVIDENCE_ENABLED', 'true');
      parent = await prepareReceivedAddendumParent(fixture);
      for (const path of [
        '/company-project-assignments',
        '/company-document-project-organizer-assignments',
        '/company-task-manager-assignments',
        '/company-task-result-recorder-assignments',
        '/company-mission-deliverable-access-assignments',
        '/company-commercial-activity-reader-assignments',
        '/company-invoice-reader-assignments',
        '/company-invoice-recorder-assignments',
        '/company-external-invoice-access-assignments',
        '/company-payment-reader-assignments',
        '/company-payment-recorder-assignments',
        '/company-payment-confirmer-assignments',
        '/company-payment-reverser-assignments',
        '/company-payment-evidence-access-assignments',
        '/knowledge/assignments/administrators',
        '/knowledge/assignments/readers',
      ])
        await fixture.grant({
          path,
          companyId: parent.target.companyId,
          membershipId: parent.ready.source.preparerMembershipId,
        });
      if (family === 'received-audit-source')
        await fixture.grant({
          path: '/company-received-audit-source-access-assignments',
          companyId: parent.target.companyId,
          membershipId: parent.ready.source.preparerMembershipId,
        });
      source = await preserved(
        family === 'received-addendum'
          ? { ...parent.body, title }
          : {
              type: 'received-audit-source',
              clientId: parent.ready.source.clientId,
              title,
              purpose:
                'Preserve a fictional unverified source for exclusion proof',
            },
      );
      paymentControl = await preserved({
        type: 'payment-evidence',
        clientId: parent.ready.source.clientId,
        payer: { kind: 'PRIMARY' },
        title: 'Fictional lawful Payment control',
        purpose: 'Exact native family control',
        sourceDescription: 'Fictional control',
        receivedOn: null,
      });
      invoiceControl = await preserved({
        type: 'external-invoice',
        opportunityId: parent.ready.source.opportunityId,
        contractId: parent.parentContractId,
        contractVersionId: parent.parentContractVersionId,
        title: 'Fictional lawful Invoice control',
        purpose: 'Exact native family control',
        sourceDescription: 'Fictional control',
        receivedOn: null,
      });
      const project = await post('/projects', {
        clientAccountId: parent.ready.source.clientId,
        title: 'Fictional exclusion Project',
      });
      expect(project.status).toBe(201);
      projectId = responseString(responseRecord(await project.json()), 'id');
      const task = await post(`/projects/${projectId}/tasks`, {
        title: 'Fictional exclusion Task',
      });
      expect(task.status).toBe(201);
      taskId = responseString(responseRecord(await task.json()), 'id');
    });
    afterAll(async () => {
      vi.unstubAllEnvs();
      await fixture?.close();
      await scanner?.close();
    });
    async function preserved(body: unknown) {
      const created = await post('/documents', body);
      expect(created.status, await created.clone().text()).toBe(201);
      const d = responseRecord(await created.json()),
        documentId = responseString(d, 'id'),
        documentVersionId = responseString(responseRecord(d.version), 'id');
      const uploaded = await parent.call(
        `/documents/${documentId}/versions/${documentVersionId}/content?expectedRevision=1&fileName=fictional-source.pdf`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/pdf',
            'idempotency-key': randomUUID(),
          },
          body: new Uint8Array(bytes),
        },
      );
      expect(uploaded.status).toBe(201);
      const representationId = responseString(
        responseRecord(await uploaded.json()),
        'representationId',
      );
      expect(
        (
          await post(
            `/documents/${documentId}/versions/${documentVersionId}/official-designation`,
            { expectedRevision: 2 },
          )
        ).status,
      ).toBe(200);
      return { documentId, documentVersionId, representationId };
    }
    it('filters sources before financial selector bounds and refuses direct Payment/Invoice and integrity use while preserving exact native-family controls', async () => {
      const payment = await parent.call('/payments/sources');
      expect(payment.status).toBe(200);
      expect(responseRecord(await payment.json()).items).toEqual([
        expect.objectContaining({ source: paymentControl }),
      ]);
      const invoice = await parent.call('/invoice-records/sources');
      expect(invoice.status).toBe(200);
      expect(responseRecord(await invoice.json()).items).toEqual([
        expect.objectContaining({ source: invoiceControl }),
      ]);
      const paymentBody = {
        source,
        values: {
          amountMinor: '125500',
          currency: 'MDL',
          effectiveOn: '2026-01-15',
          method: 'Fictional manual notice',
          externalReference: null,
          observationBasis: 'Fictional declaration only',
        },
        acknowledgeObservedDeclaration: true,
        replacesClosedPaymentId: null,
      };
      const invoiceBody = {
        source,
        values: fictionalInvoiceValues(),
        acknowledgeExternalDeclaration: true,
        replacesWithdrawnRecordId: null,
      };
      const protectedTables = [
        'client_accounts',
        'payments',
        'payment_history',
        'payment_events',
        'payment_commands',
        'invoice_records',
        'invoice_record_history',
        'invoice_record_commands',
        'working_documents',
        'document_versions',
        'document_pdfs',
      ];
      const beforeRefusals = await predecessorSnapshot(
        fixture.pool,
        protectedTables,
      );
      const wrongPayment = await post('/payments', paymentBody);
      expect(wrongPayment.status).toBe(409);
      expect(await wrongPayment.json()).toMatchObject({
        code: 'PAYMENT_SOURCE_INELIGIBLE',
      });
      expect((await post('/invoice-records', invoiceBody)).status).toBe(404);
      const scopes = await fixture.pool.query<{ workspace_id: string }>(
        'SELECT workspace_id FROM working_documents WHERE id=$1',
        [source.documentId],
      );
      const workspaceId = scopes.rows[0]?.workspace_id;
      if (!workspaceId) throw new Error('Native source scope required');
      await expect(
        fixture.pool.query(
          'SELECT documents_payment_source($1,$2,$3::jsonb,true)',
          [workspaceId, parent.target.companyId, JSON.stringify(source)],
        ),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'payment_native_source',
      });
      await expect(
        fixture.pool.query(
          'SELECT documents_invoice_record_source($1,$2,$3::jsonb)',
          [workspaceId, parent.target.companyId, JSON.stringify(source)],
        ),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'invoice_native_source',
      });
      expect(await predecessorSnapshot(fixture.pool, protectedTables)).toEqual(
        beforeRefusals,
      );
      expect(
        (await post('/payments', { ...paymentBody, source: paymentControl }))
          .status,
      ).toBe(201);
      expect(
        (
          await post('/invoice-records', {
            ...invoiceBody,
            source: invoiceControl,
          })
        ).status,
      ).toBe(201);
    });
    it('excludes the source from a real MCP SDK client over native authenticated Knowledge HTTP', async () => {
      const verifier = vi
        .spyOn(KnowledgeIdentityVerifier.prototype, 'verify')
        .mockImplementation(async (request) => {
          if (
            request.get('authorization') !==
            'Bearer synthetic-addendum-mcp-token'
          )
            throw new UnauthorizedException();
          return {
            provider: 'deterministic-test',
            subject: 'estimate-offer-preparer',
            displayName: 'Synthetic Offer preparer',
            email: 'estimate-offer-preparer@example.test',
          };
        });
      const server = createKnowledgeMcpServer({
        PRISMA_KNOWLEDGE_API_ORIGIN: fixture.origin,
        PRISMA_KNOWLEDGE_WORKSPACE_ID: ESTIMATE_OFFER_WORKSPACE,
        PRISMA_KNOWLEDGE_COMPANY_ID: parent.target.companyId,
        PRISMA_KNOWLEDGE_BEARER_TOKEN: 'synthetic-addendum-mcp-token',
      });
      const client = new Client({
        name: 'received-addendum-exclusion-proof',
        version: '1',
      });
      const [clientTransport, serverTransport] =
        InMemoryTransport.createLinkedPair();
      // Only the external cryptographic identity verifier is replaced. Every tool
      // still traverses the registered SDK, authenticated native HTTP, live grants
      // and PostgreSQL source policy. No application fetch or result is mocked.
      vi.stubEnv('ACCESS_IDENTITY_MODE', 'clerk');
      try {
        await server.connect(serverTransport);
        await client.connect(clientTransport);
        expect(
          (await client.listTools()).tools.map((tool) => tool.name),
        ).toEqual([
          'list_knowledge_sources',
          'search_knowledge',
          'get_knowledge_passage',
        ]);
        for (const request of [
          { name: 'list_knowledge_sources', arguments: {} },
          { name: 'search_knowledge', arguments: { query: 'Fictional' } },
          {
            name: 'search_knowledge',
            arguments: {
              query: 'Fictional',
              mode: 'historical',
              documentVersionId: source.documentVersionId,
            },
          },
        ]) {
          const result = await client.callTool(request);
          expect(result.isError).not.toBe(true);
          expect(result.structuredContent).toEqual({
            items: [],
            nextCursor: null,
          });
          const wire = JSON.stringify(result);
          for (const forbidden of [
            source.documentId,
            source.documentVersionId,
            source.representationId,
            title,
            parent.body.sourceDescription,
          ])
            expect(wire).not.toContain(forbidden);
        }
        const direct = await client.callTool({
          name: 'get_knowledge_passage',
          arguments: { sourceId: source.documentId, locator: 'p1' },
        });
        expect(direct.isError).toBe(true);
        expect(direct.content).toEqual([
          {
            type: 'text',
            text: 'The knowledge request could not be completed.',
          },
        ]);
        expect(verifier).toHaveBeenCalledTimes(4);
      } finally {
        await client.close();
        await server.close();
        verifier.mockRestore();
        vi.stubEnv('ACCESS_IDENTITY_MODE', 'test');
      }
    });
    it('excludes the substantive source from generic Activity/Home, Project/Task/bundle, signing and Knowledge surfaces', async () => {
      for (const path of [
        '/activity-log',
        '/operational-home',
        '/client-duplicate-reviews',
        `/projects/${projectId}/eligible-documents`,
        `/projects/${projectId}/documents`,
        `/tasks/${taskId}/results/eligible-versions`,
        '/knowledge/sources',
        '/knowledge/evidence/sources',
        '/knowledge/search?query=Fictional',
        '/knowledge/evidence/search?query=Fictional',
      ]) {
        const response = await parent.call(path);
        expect(
          response.status,
          path + ':' + (await response.clone().text()),
        ).toBe(200);
        const value = JSON.stringify(await response.json());
        expect(value).not.toContain(source.documentId);
        expect(value).not.toContain(source.representationId);
        expect(value).not.toContain(title);
        expect(value).not.toContain(parent.body.sourceDescription);
      }
      expect(
        (
          await post(`/documents/${source.documentId}/project-association`, {
            projectId,
            action: 'link',
            expectedRevision: 0,
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await post(`/projects/${projectId}/pdf-bundle`, {
            items: [
              {
                documentId: source.documentId,
                versionId: source.documentVersionId,
                representationId: source.representationId,
                expectedProjectRevision: 0,
              },
            ],
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await post(`/tasks/${taskId}/results`, {
            expectedTaskVersion: 1,
            expectedResultRevision: 0,
            documentId: source.documentId,
            versionId: source.documentVersionId,
            declaration: 'A received Addendum is not a mission result',
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await post('/knowledge/sources', {
            ...source,
            sourceSha256: createHash('sha256').update(bytes).digest('hex'),
            language: 'en',
            ownerReference: 'Fictional owner',
            provenance: 'Fictional declared source',
            rightsEvidenceReference: 'Fictional only',
            permittedPurpose: 'cited-evidence',
            effectiveFrom: '2026-01-01T00:00:00.000Z',
            effectiveUntil: '2027-01-01T00:00:00.000Z',
            passages: [
              {
                locator: 'p1',
                text: 'Fictional received Addendum — not a legal document',
              },
            ],
          })
        ).status,
      ).toBe(404);
      const signing = await parent.call(
        `${parent.ready.path}/versions/${parent.parentContractVersionId}/signing-declarations/pdf-candidates`,
      );
      expect(signing.status).toBe(409);
      expect(await signing.text()).not.toContain(source.documentId);
    });
  },
);
