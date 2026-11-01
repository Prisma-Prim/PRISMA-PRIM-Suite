import { createHash, randomUUID } from 'node:crypto';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  openEstimateOfferFixture,
  responseRecord,
  responseString,
  ESTIMATE_OFFER_WORKSPACE,
} from '../offer/offer-estimate-preparation.test-support.js';
import { openDocumentScannerFixture } from './document-scanner.test-support.js';
import {
  externalInvoiceEffects,
  fictionalInvoicePdf,
  openExternalInvoiceDocument,
} from './external-invoice.test-support.js';
import { KnowledgeIdentityVerifier } from '../knowledge/knowledge-identity.js';
import { createKnowledgeMcpServer } from '../knowledge-mcp/server.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres(
  'Financial source exclusion through native indirect and Knowledge boundaries',
  () => {
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
      vi.stubEnv('KNOWLEDGE_EVIDENCE_ENABLED', 'true');
    });
    afterAll(async () => {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
      await fixture?.close();
      await scanner?.close();
    });
    it('excludes even an all-grants financial reader from Project, typed reference, signing, generic Activity and Knowledge use', async () => {
      const f = await openExternalInvoiceDocument(fixture),
        versionId = responseString(responseRecord(f.document.version), 'id'),
        bytes = await fictionalInvoicePdf();
      const upload = await f.upload(versionId, 1, bytes);
      expect(upload.status).toBe(201);
      const representationId = responseString(
        responseRecord(await upload.json()),
        'representationId',
      );
      expect(
        (
          await f.mutate(`/versions/${versionId}/official-designation`, {
            expectedRevision: 2,
          })
        ).status,
      ).toBe(200);
      for (const path of [
        '/company-project-assignments',
        '/company-document-project-organizer-assignments',
        '/company-task-manager-assignments',
        '/company-task-result-recorder-assignments',
        '/company-invoice-reader-assignments',
        '/company-mission-deliverable-access-assignments',
        '/knowledge/assignments/administrators',
        '/knowledge/assignments/readers',
      ])
        await fixture.grant({
          path,
          companyId: f.companyId,
          membershipId: f.membershipId,
        });
      const project = responseRecord(
          await fixture.command({
            ...f.target,
            path: '/projects',
            body: {
              clientAccountId: f.f.ready.source.clientId,
              title: 'Fictional ordinary Project',
            },
          }),
        ),
        projectId = responseString(project, 'id');
      for (const path of [
        `/projects/${projectId}/eligible-documents`,
        `/projects/${projectId}/documents`,
        '/activity-log',
        '/operational-home',
      ]) {
        const response = await fixture.request({ ...f.target, path });
        expect(response.status).toBe(200);
        const content = JSON.stringify(await response.json());
        expect(content).not.toContain(f.documentId);
        expect(content).not.toContain(f.body.title);
        expect(content).not.toContain(representationId);
      }
      const before = await externalInvoiceEffects(fixture);
      expect(
        (
          await f.mutate('/project-association', {
            projectId,
            action: 'link',
            expectedRevision: 0,
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await fixture.post({
            ...f.target,
            path: `/projects/${projectId}/pdf-bundle`,
            body: {
              items: [
                {
                  documentId: f.documentId,
                  versionId,
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
          await f.mutate(`/versions/${versionId}/representations`, {
            expectedRevision: 3,
            url: 'https://example.test/forbidden',
            form: 'other',
            primary: true,
          })
        ).status,
      ).toBe(400);
      const signing = await fixture.request({
        ...f.target,
        path: `${f.f.ready.path}/versions/${f.selection.contractVersionId}/signing-declarations/pdf-candidates`,
      });
      expect(signing.status).toBe(409);
      expect(JSON.stringify(await signing.json())).not.toContain(f.documentId);
      const body = {
        documentId: f.documentId,
        documentVersionId: versionId,
        representationId,
        sourceSha256: createHash('sha256').update(bytes).digest('hex'),
        language: 'en',
        ownerReference: 'Fictional source owner',
        provenance: 'Fictional manual source',
        rightsEvidenceReference: 'Synthetic only',
        permittedPurpose: 'cited-evidence',
        effectiveFrom: '2026-01-01T00:00:00.000Z',
        effectiveUntil: '2027-01-01T00:00:00.000Z',
        passages: [
          {
            locator: 'p1',
            text: 'Fictional external invoice — not a fiscal document',
          },
        ],
      };
      const denied = await fixture.post({
        ...f.target,
        path: '/knowledge/sources',
        body,
      });
      expect(denied.status).toBe(404);
      expect(JSON.stringify(await denied.json())).not.toContain(f.documentId);
      expect(await externalInvoiceEffects(fixture)).toEqual(before);
      for (const path of [
        '/knowledge/sources',
        '/knowledge/evidence/sources',
        '/knowledge/search?query=Fictional',
        '/knowledge/evidence/search?query=Fictional',
      ]) {
        const result = await fixture.request({ ...f.target, path });
        expect(result.status).toBe(200);
        expect(responseRecord(await result.json()).items).toEqual([]);
      }
      const sourceId = randomUUID();
      expect(
        (
          await fixture.post({
            ...f.target,
            path: `/knowledge/sources/${sourceId}/admission`,
            body: {
              expectedRevision: 1,
              attestation: 'exact-version-source-and-use-reviewed/v1',
              sourceSha256: body.sourceSha256,
              projectionSha256: '0'.repeat(64),
            },
          })
        ).status,
      ).toBe(404);
      const previousMode = process.env.ACCESS_IDENTITY_MODE;
      process.env.ACCESS_IDENTITY_MODE = 'clerk';
      const verifier = vi
        .spyOn(KnowledgeIdentityVerifier.prototype, 'verify')
        .mockImplementation(async (request) => {
          if (
            request.get('authorization') !==
            'Bearer synthetic-financial-exclusion'
          )
            throw new UnauthorizedException();
          return {
            provider: 'deterministic-test',
            subject: 'estimate-offer-preparer',
            displayName: 'Synthetic preparer',
            email: 'estimate-offer-preparer@example.test',
          };
        });
      const server = createKnowledgeMcpServer({
          PRISMA_KNOWLEDGE_API_ORIGIN: fixture.origin,
          PRISMA_KNOWLEDGE_WORKSPACE_ID: ESTIMATE_OFFER_WORKSPACE,
          PRISMA_KNOWLEDGE_COMPANY_ID: f.companyId,
          PRISMA_KNOWLEDGE_BEARER_TOKEN: 'synthetic-financial-exclusion',
        }),
        client = new Client({
          name: 'financial-exclusion-native-proof',
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
          {
            name: 'get_knowledge_passage',
            arguments: { sourceId, locator: 'p1' },
          },
        ]) {
          const result = await client.callTool(tool);
          expect(JSON.stringify(result)).not.toContain(f.documentId);
          expect(JSON.stringify(result)).not.toContain(f.body.title);
          if (tool.name === 'get_knowledge_passage')
            expect(result.isError).toBe(true);
          else
            expect(responseRecord(result.structuredContent).items).toEqual([]);
        }
      } finally {
        await client.close();
        await server.close();
        verifier.mockRestore();
        if (previousMode === undefined) delete process.env.ACCESS_IDENTITY_MODE;
        else process.env.ACCESS_IDENTITY_MODE = previousMode;
      }
    });
  },
);
