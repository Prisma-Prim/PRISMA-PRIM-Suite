import { ServerResponse } from 'node:http';
import { Transform } from 'node:stream';
import { StreamableFile } from '@nestjs/common';
import * as pdfRead from '../commercial-pdf/commercial-pdf-read.js';
import { ContractService } from '../contract/contract.service.js';
import { parse, type DefaultTreeAdapterMap } from 'parse5';
import { openDocumentScannerFixture } from '../documents/document-scanner.test-support.js';
import {
  registerReceivedContract,
  receivedContractEffects,
} from '../documents/received-contract.test-support.js';
import { PDF_A } from '../documents/mission-document.test-support.js';
import {
  nearBoundOfferModel,
  nearBoundContractModel,
} from '../commercial-pdf/commercial-pdf.test-fixture.js';
import { OfferService } from './offer.service.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ServiceUnavailableException } from '@nestjs/common';
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
import {
  ESTIMATE_OFFER_PREPARER,
  ESTIMATE_OFFER_READER,
  ESTIMATE_OFFER_OWNER,
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from './offer-estimate-preparation.test-support.js';
import {
  generatedOfferIntent,
  generatedOfferModelContent,
  prepareGeneratedOfferWorkflow,
} from './offer-model-generation.test-fixture.js';
import {
  prepareModelContractSource,
  revokeModelContractFixtureGrant,
} from '../contract/model-contract.test-fixture.js';
import { CommercialPdfRenderer } from '../commercial-pdf/commercial-pdf-renderer.js';
import {
  compactPdfText,
  inspectCommercialPdf,
} from '../commercial-pdf/pdf-inspection.test-support.mjs';
import {
  projectCommercialPdfSource,
  type CommercialPdfSource,
} from '../commercial-pdf/commercial-pdf-source.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres('Exact non-official commercial PDF public REST', () => {
  let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>;
  let scanner: Awaited<ReturnType<typeof openDocumentScannerFixture>>;
  beforeAll(async () => {
    scanner = await openDocumentScannerFixture();
    fixture = await openEstimateOfferFixture({
      scannerEnvironment: scanner.environment,
    });
  });
  beforeEach(async () => {
    vi.restoreAllMocks();
    await fixture.reset();
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await fixture?.close();
    await scanner?.close();
  });
  async function download(
    path: string,
    companyId: string,
    digest: string,
    headers = ESTIMATE_OFFER_PREPARER,
  ) {
    return fixture.request({
      path: `${path}/pdf?sourceHtmlSha256=${digest}`,
      companyId,
      headers,
    });
  }
  it('downloads the complete selected model Offer from its authenticated exact HTML source', async () => {
    const flow = await prepareGeneratedOfferWorkflow(fixture, 'PENDING');
    const exact = responseRecord(
      responseRecord(
        await fixture.read({
          path: flow.base,
          companyId: flow.source.companyId,
          headers: ESTIMATE_OFFER_PREPARER,
        }),
      ).offer,
    );
    const representation = responseRecord(
        responseRecord(exact.version).representation,
      ),
      digest = responseString(representation, 'sha256');
    const source = responseString(representation, 'html');
    expect(createHash('sha256').update(source).digest('hex')).toBe(digest);
    const renderer = vi.spyOn(CommercialPdfRenderer.prototype, 'render');
    const response = await download(flow.base, flow.source.companyId, digest);
    expect({
      status: response.status,
      error: response.ok ? null : await response.json(),
    }).toEqual({ status: 200, error: null });
    await assertCompleteDownload(response, exact, source, 'offer');
    expect(renderer.mock.calls[0]?.[1]?.aborted).toBe(false);
  }, 30_000);
  it('downloads full ordinary Contract/annex and historical exact Versions after successor, restart and source grant loss, without mutation', async () => {
    const ready = await prepareModelContractSource(fixture);
    const first = responseRecord(
      await ready.invoke(ready.path + '/from-approved-model', ready.intent),
    );
    const version = responseRecord(first.version),
      id = responseString(version, 'id'),
      representation = responseRecord(version.representation),
      digest = responseString(representation, 'sha256');
    await ready.invoke(ready.path + '/versions/from-approved-model', {
      ...ready.intent,
      expectedContractRevision: 1,
      clientDetails: 'Complete deliberate successor',
    });
    for (const path of [
      '/company-offer-preparer-assignments',
      '/company-contract-model-editor-assignments',
      '/company-contract-model-approver-assignments',
      '/company-profitability-contributor-assignments',
    ])
      await revokeModelContractFixtureGrant(
        fixture,
        path,
        ready.source.companyId,
        ready.source.preparerMembershipId,
      );
    await fixture.restart();
    const before = await effects();
    const response = await download(
      `${ready.path}/versions/${id}`,
      ready.source.companyId,
      digest,
    );
    expect(response.status).toBe(200);
    await assertCompleteDownload(
      response,
      first,
      responseString(representation, 'html'),
      'contract',
    );
    expect(await effects()).toEqual(before);
    const reopened = responseRecord(
      responseRecord(
        await fixture.read({
          path: `${ready.path}/versions/${id}`,
          companyId: ready.source.companyId,
          headers: ESTIMATE_OFFER_PREPARER,
        }),
      ).contract,
    );
    expect(
      responseRecord(responseRecord(reopened.version).representation),
    ).toEqual(representation);
  }, 30_000);
  it('keeps an older exact Offer target across head advancement and refuses observed digest/unknown request fields safely', async () => {
    const flow = await prepareGeneratedOfferWorkflow(fixture, 'PENDING');
    const first = responseRecord(
      responseRecord(
        await fixture.read({
          path: flow.base,
          companyId: flow.source.companyId,
          headers: ESTIMATE_OFFER_PREPARER,
        }),
      ).offer,
    );
    const digest = responseString(
      responseRecord(responseRecord(first.version).representation),
      'sha256',
    );
    await fixture.command({
      path: flow.path + '/versions/from-approved-model',
      companyId: flow.source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      body: {
        ...generatedOfferIntent(flow.source),
        expectedOfferRevision: 1,
        scopeNote: 'Changed successor only',
      },
    });
    expect(
      (await download(flow.base, flow.source.companyId, digest)).status,
    ).toBe(200);
    const mismatch = await download(
      flow.base,
      flow.source.companyId,
      '0'.repeat(64),
    );
    expect({
      status: mismatch.status,
      body: await mismatch.json(),
    }).toMatchObject({ status: 409, body: { code: 'PDF_SOURCE_MISMATCH' } });
    const invalid = await fixture.request({
      path: `${flow.base}/pdf?sourceHtmlSha256=${digest}&html=bad`,
      companyId: flow.source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
    });
    expect(invalid.status).toBe(400);
  }, 30_000);
  it('rechecks actual authority after rendering and releases no bytes when revocation wins the final read', async () => {
    const flow = await prepareGeneratedOfferWorkflow(fixture, 'PENDING');
    const first = responseRecord(
      responseRecord(
        await fixture.read({
          path: flow.base,
          companyId: flow.source.companyId,
          headers: ESTIMATE_OFFER_READER,
        }),
      ).offer,
    );
    const digest = responseString(
      responseRecord(responseRecord(first.version).representation),
      'sha256',
    );
    let release = () => {},
      entered = () => {};
    const held = new Promise<void>((resolve) => {
        release = resolve;
      }),
      atRenderer = new Promise<void>((resolve) => {
        entered = resolve;
      });
    const render = CommercialPdfRenderer.prototype.render;
    vi.spyOn(CommercialPdfRenderer.prototype, 'render').mockImplementation(
      async function (this: CommercialPdfRenderer, source) {
        const bytes = await render.call(this, source);
        entered();
        await held;
        return bytes;
      },
    );
    const pending = download(
      flow.base,
      flow.source.companyId,
      digest,
      ESTIMATE_OFFER_READER,
    );
    await atRenderer;
    await revokeModelContractFixtureGrant(
      fixture,
      '/company-offer-approver-assignments',
      flow.source.companyId,
      flow.source.readerMembershipId,
    );
    release();
    const denied = await pending;
    expect(denied.status).toBe(403);
    expect(denied.headers.get('x-commercial-pdf-source')).toBeNull();
    expect(denied.headers.get('content-disposition')).toBeNull();
  }, 30_000);
  it.each<{
    kind: 'offer' | 'contract';
    stage: 'before-render' | 'after-render';
  }>([
    { kind: 'offer', stage: 'before-render' },
    { kind: 'contract', stage: 'before-render' },
    { kind: 'offer', stage: 'after-render' },
    { kind: 'contract', stage: 'after-render' },
  ])(
    'cancels the $kind PDF $stage at the real HTTP boundary before the final owner read or attachment',
    async ({ kind, stage }) => {
      const ready = await prepareModelContractSource(fixture);
      const contract = responseRecord(
        await ready.invoke(ready.path + '/from-approved-model', ready.intent),
      );
      const exact =
        kind === 'contract'
          ? contract
          : responseRecord(
              responseRecord(
                await fixture.read({
                  path: ready.flow.path,
                  companyId: ready.source.companyId,
                  headers: ESTIMATE_OFFER_PREPARER,
                }),
              ).offer,
            );
      const version = responseRecord(exact.version),
        digest = responseString(
          responseRecord(version.representation),
          'sha256',
        ),
        path = kind === 'contract' ? ready.path : ready.flow.path;
      const ownerRead =
        kind === 'offer'
          ? vi.spyOn(OfferService.prototype, 'read')
          : vi.spyOn(ContractService.prototype, 'read');
      const headers = vi.spyOn(ServerResponse.prototype, 'setHeader');
      let release = () => {},
        entered = () => {},
        settled = () => {};
      const barrier = new Promise<void>((resolve) => {
          release = resolve;
        }),
        atRenderer = new Promise<void>((resolve) => {
          entered = resolve;
        }),
        pipelineSettled = new Promise<void>((resolve) => {
          settled = resolve;
        });
      let serverSignal: AbortSignal | undefined;
      const render = CommercialPdfRenderer.prototype.render;
      vi.spyOn(CommercialPdfRenderer.prototype, 'render').mockImplementation(
        async function (
          this: CommercialPdfRenderer,
          source: CommercialPdfSource,
          signal?: AbortSignal,
        ) {
          serverSignal = signal;
          const bytes =
            stage === 'after-render'
              ? await render.call(this, source, signal)
              : undefined;
          entered();
          await barrier;
          return bytes ?? render.call(this, source, signal);
        },
      );
      const read = pdfRead.readExactCommercialPdf;
      vi.spyOn(pdfRead, 'readExactCommercialPdf').mockImplementation(
        async (input) => {
          try {
            return await read(input);
          } finally {
            settled();
          }
        },
      );
      const controller = new AbortController();
      const pending = fixture
        .request({
          path: `${path}/versions/${responseString(version, 'id')}/pdf?sourceHtmlSha256=${digest}`,
          companyId: ready.source.companyId,
          headers: ESTIMATE_OFFER_PREPARER,
          init: { signal: controller.signal },
        })
        .then(
          () => 'unexpected response',
          (error: unknown) =>
            error instanceof Error ? error.name : 'unknown error',
        );
      try {
        await atRenderer;
        controller.abort();
        expect(await pending).toBe('AbortError');
        await vi.waitFor(() => expect(serverSignal?.aborted).toBe(true));
      } finally {
        controller.abort();
        release();
        await pipelineSettled;
      }
      expect(ownerRead).toHaveBeenCalledTimes(1);
      expect(
        headers.mock.calls.filter(([name]) =>
          name.toLowerCase().startsWith('x-commercial-pdf-'),
        ),
      ).toEqual([]);
    },
    30_000,
  );
  it.each<'offer' | 'contract'>(['offer', 'contract'])(
    'destroys the %s PDF attachment and removes its owned listeners when HTTP closes under backpressure',
    async (kind) => {
      const ready = await prepareModelContractSource(fixture);
      const contract = responseRecord(
        await ready.invoke(ready.path + '/from-approved-model', ready.intent),
      );
      const exact =
        kind === 'contract'
          ? contract
          : responseRecord(
              responseRecord(
                await fixture.read({
                  path: ready.flow.path,
                  companyId: ready.source.companyId,
                  headers: ESTIMATE_OFFER_PREPARER,
                }),
              ).offer,
            );
      const version = responseRecord(exact.version),
        digest = responseString(
          responseRecord(version.representation),
          'sha256',
        ),
        path = kind === 'contract' ? ready.path : ready.flow.path;
      type Listeners = ReturnType<ServerResponse['listeners']>;
      const baselines = new WeakMap<
        ServerResponse,
        { close: Listeners; finish: Listeners }
      >();
      const captures: {
        response: ServerResponse;
        close: Listeners;
        finish: Listeners;
      }[] = [];
      const setHeader = ServerResponse.prototype.setHeader;
      vi.spyOn(ServerResponse.prototype, 'setHeader').mockImplementation(
        function (this: ServerResponse, name, value) {
          let baseline = baselines.get(this);
          if (!baseline) {
            baseline = {
              close: this.listeners('close'),
              finish: this.listeners('finish'),
            };
            baselines.set(this, baseline);
          }
          if (name.toLowerCase() === 'x-commercial-pdf-source') {
            captures.push({
              response: this,
              close: this.listeners('close').filter(
                (listener) => !baseline.close.includes(listener),
              ),
              finish: this.listeners('finish').filter(
                (listener) => !baseline.finish.includes(listener),
              ),
            });
          }
          return setHeader.call(this, name, value);
        },
      );
      let entered = () => {};
      const atStream = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const getStream = StreamableFile.prototype.getStream;
      let stream: ReturnType<typeof getStream> | undefined;
      let releaseBody = () => {};
      const streams = new WeakMap<StreamableFile, Transform>();
      vi.spyOn(StreamableFile.prototype, 'getStream').mockImplementation(
        function (this: StreamableFile) {
          const existing = streams.get(this);
          if (existing) return existing;
          // Hold an actual PDF body under deterministic native-stream backpressure.
          const gate = new Transform({
            transform(chunk: Buffer, _encoding, callback) {
              this.push(chunk.subarray(0, 64));
              releaseBody = () => callback(null, chunk.subarray(64));
            },
          });
          streams.set(this, gate);
          stream = gate;
          getStream.call(this).pipe(gate);
          entered();
          return gate;
        },
      );
      const controller = new AbortController();
      const pending = fixture
        .request({
          path: `${path}/versions/${responseString(version, 'id')}/pdf?sourceHtmlSha256=${digest}`,
          companyId: ready.source.companyId,
          headers: ESTIMATE_OFFER_PREPARER,
          init: { signal: controller.signal },
        })
        .then(async (response) => {
          await response.arrayBuffer();
          return 'unexpected complete response';
        })
        .catch((error: unknown) =>
          error instanceof Error ? error.name : 'unknown error',
        );
      try {
        await atStream;
        expect(stream?.destroyed).toBe(false);
        controller.abort();
        expect(await pending).toBe('AbortError');
        await vi.waitFor(() => expect(stream?.destroyed).toBe(true));
        const capture = captures.at(-1);
        expect(capture?.response.writableFinished).toBe(false);
        expect(capture?.close.length).toBeGreaterThan(0);
        expect(capture?.finish.length).toBeGreaterThan(0);
        for (const listener of capture?.close ?? [])
          expect(capture?.response.listeners('close')).not.toContain(listener);
        for (const listener of capture?.finish ?? [])
          expect(capture?.response.listeners('finish')).not.toContain(listener);
      } finally {
        controller.abort();
        releaseBody();
        stream?.destroy();
      }
    },
    30_000,
  );
  it('conserves every glyph, section and cell of both near64KiB source-shaped models, including tall row continuation and repeated labels', async () => {
    const modelContent = nearBoundOfferModel(),
      contractModelContent = nearBoundContractModel();
    const ready = await prepareModelContractSource(fixture, {
      modelContent,
      contractModelContent,
    });
    const contract = responseRecord(
      await ready.invoke(ready.path + '/from-approved-model', ready.intent),
    );
    const offer = responseRecord(
      responseRecord(
        await fixture.read({
          path: ready.flow.base,
          companyId: ready.source.companyId,
          headers: ESTIMATE_OFFER_PREPARER,
        }),
      ).offer,
    );
    for (const [kind, exact, path] of [
      ['offer', offer, ready.flow.base],
      [
        'contract',
        contract,
        `${ready.path}/versions/${responseString(responseRecord(contract.version), 'id')}`,
      ],
    ] satisfies ['offer' | 'contract', Record<string, unknown>, string][]) {
      const representation = responseRecord(
        responseRecord(exact.version).representation,
      );
      const response = await download(
        path,
        ready.source.companyId,
        responseString(representation, 'sha256'),
      );
      expect({
        status: response.status,
        error: response.ok ? null : await response.json(),
      }).toEqual({ status: 200, error: null });
      const clone = response.clone();
      await assertCompleteDownload(
        response,
        exact,
        responseString(representation, 'html'),
        kind,
      );
      if (process.env.COMMERCIAL_PDF_EVIDENCE_DIRECTORY) {
        await mkdir(process.env.COMMERCIAL_PDF_EVIDENCE_DIRECTORY, {
          recursive: true,
        });
        await writeFile(
          join(
            process.env.COMMERCIAL_PDF_EVIDENCE_DIRECTORY,
            `${kind}-near-bound.pdf`,
          ),
          new Uint8Array(await clone.arrayBuffer()),
        );
        await writeFile(
          join(
            process.env.COMMERCIAL_PDF_EVIDENCE_DIRECTORY,
            `${kind}-near-bound.html`,
          ),
          responseString(representation, 'html'),
        );
      }
    }
  }, 120_000);
  it('allows a response already authorized at the final exact read when subsequent revocation wins afterwards', async () => {
    const flow = await prepareGeneratedOfferWorkflow(fixture, 'PENDING');
    const exact = responseRecord(
      responseRecord(
        await fixture.read({
          path: flow.base,
          companyId: flow.source.companyId,
          headers: ESTIMATE_OFFER_READER,
        }),
      ).offer,
    );
    const digest = responseString(
      responseRecord(responseRecord(exact.version).representation),
      'sha256',
    );
    const original = OfferService.prototype.read;
    let reads = 0,
      entered = () => {},
      release = () => {};
    const finalAuthorized = new Promise<void>((resolve) => {
        entered = resolve;
      }),
      held = new Promise<void>((resolve) => {
        release = resolve;
      });
    vi.spyOn(OfferService.prototype, 'read').mockImplementation(async function (
      this: OfferService,
      ...args
    ) {
      const result = await original.apply(this, args);
      reads += 1;
      if (reads === 2) {
        entered();
        await held;
      }
      return result;
    });
    const pending = download(
      flow.base,
      flow.source.companyId,
      digest,
      ESTIMATE_OFFER_READER,
    );
    await finalAuthorized;
    await revokeModelContractFixtureGrant(
      fixture,
      '/company-offer-approver-assignments',
      flow.source.companyId,
      flow.source.readerMembershipId,
    );
    release();
    expect((await pending).status).toBe(200);
  }, 30_000);
  it.each(['oversized', 'failure'])(
    'refuses %s renderer output without exposing a partial attachment or changing source facts',
    async (mode) => {
      const flow = await prepareGeneratedOfferWorkflow(fixture, 'PENDING');
      const first = responseRecord(
        responseRecord(
          await fixture.read({
            path: flow.base,
            companyId: flow.source.companyId,
            headers: ESTIMATE_OFFER_PREPARER,
          }),
        ).offer,
      );
      const digest = responseString(
          responseRecord(responseRecord(first.version).representation),
          'sha256',
        ),
        before = await effects();
      const spy = vi.spyOn(CommercialPdfRenderer.prototype, 'render');
      if (mode === 'oversized')
        spy.mockResolvedValue(new Uint8Array(16 * 1024 * 1024 + 1));
      else
        spy.mockRejectedValue(
          new ServiceUnavailableException({ code: 'PDF_RENDER_UNAVAILABLE' }),
        );
      const response = await download(flow.base, flow.source.companyId, digest);
      expect(response.status).toBe(mode === 'oversized' ? 422 : 503);
      expect(await response.json()).toMatchObject({
        code:
          mode === 'oversized' ? 'PDF_CONTENT_LIMIT' : 'PDF_RENDER_UNAVAILABLE',
      });
      expect(response.headers.get('content-disposition')).toBeNull();
      expect(response.headers.get('x-commercial-pdf-source')).toBeNull();
      expect(await effects()).toEqual(before);
    },
  );
  it.each(['offer', 'contract'] satisfies ('offer' | 'contract')[])(
    'enforces every independent %s reader/context intersection before content-specific disclosure',
    async (kind) => {
      const ready = await prepareModelContractSource(fixture);
      const contract = responseRecord(
        await ready.invoke(ready.path + '/from-approved-model', ready.intent),
      );
      const offer = responseRecord(
        responseRecord(
          await fixture.read({
            path: ready.flow.base,
            companyId: ready.source.companyId,
            headers: ESTIMATE_OFFER_PREPARER,
          }),
        ).offer,
      );
      await fixture.grant({
        path: '/company-contract-approver-assignments',
        companyId: ready.source.companyId,
        membershipId: ready.source.readerMembershipId,
      });
      const path =
        kind === 'offer'
          ? ready.flow.base
          : `${ready.path}/versions/${responseString(responseRecord(contract.version), 'id')}`;
      const exact = kind === 'offer' ? offer : contract;
      const digest = responseString(
        responseRecord(responseRecord(exact.version).representation),
        'sha256',
      );
      const bundle =
        kind === 'offer'
          ? 'company_offer_approver'
          : 'company_contract_approver';
      const principal = responseRecord(
        await fixture.read({
          path: '/access/current-actor',
          headers: ESTIMATE_OFFER_READER,
        }),
      );
      const cases = [
        {
          sql: 'UPDATE company_role_assignments SET revoked_at=now() WHERE workspace_membership_id=$1 AND bundle=$2',
          parameters: [ready.source.readerMembershipId, bundle],
        },
        {
          sql: 'UPDATE company_role_assignments SET revoked_at=now() WHERE workspace_membership_id=$1 AND bundle=$2',
          parameters: [
            ready.source.readerMembershipId,
            'company_commercial_intake',
          ],
        },
        {
          sql: 'UPDATE company_role_assignments SET revoked_at=now() WHERE workspace_membership_id=$1 AND bundle=$2',
          parameters: [
            ready.source.readerMembershipId,
            'company_context_access',
          ],
        },
        {
          sql: "UPDATE internal_users SET status='inactive' WHERE id=$1",
          parameters: [responseString(principal, 'internalUserId')],
        },
        {
          sql: "UPDATE workspace_memberships SET status='inactive' WHERE id=$1",
          parameters: [ready.source.readerMembershipId],
        },
        {
          sql: "UPDATE companies SET status='inactive' WHERE id=$1",
          parameters: [ready.source.companyId],
        },
      ];
      // The HTTP server observes committed state. Restore each owned row from its recorded facts between independent absence cases.
      for (const testCase of cases) {
        const assignments = await fixture.pool.query<{
          id: string;
          permission_set_version: string;
          revoked_at: Date | null;
        }>(
          'SELECT id,permission_set_version,revoked_at FROM company_role_assignments WHERE workspace_membership_id=$1',
          [ready.source.readerMembershipId],
        );
        await fixture.pool.query(testCase.sql, testCase.parameters);
        const response = await download(
          path,
          ready.source.companyId,
          '0'.repeat(64),
          ESTIMATE_OFFER_READER,
        );
        expect(response.status, testCase.sql).toBe(403);
        expect(response.headers.get('x-commercial-pdf-source')).toBeNull();
        expect(response.headers.get('content-disposition')).toBeNull();
        for (const row of assignments.rows)
          await fixture.pool.query(
            'UPDATE company_role_assignments SET permission_set_version=$2,revoked_at=$3 WHERE id=$1',
            [row.id, row.permission_set_version, row.revoked_at],
          );
        await fixture.pool.query(
          "UPDATE internal_users SET status='active' WHERE id=$1",
          [responseString(principal, 'internalUserId')],
        );
        await fixture.pool.query(
          "UPDATE workspace_memberships SET status='active' WHERE id=$1",
          [ready.source.readerMembershipId],
        );
        await fixture.pool.query(
          "UPDATE companies SET status='active' WHERE id=$1",
          [ready.source.companyId],
        );
      }
      const originalCapture = await fixture.pool.query<{
        id: string;
        version: string;
      }>(
        'SELECT id,permission_set_version AS version FROM company_role_assignments WHERE workspace_membership_id=$1 AND bundle=$2 AND revoked_at IS NULL',
        [ready.source.readerMembershipId, bundle],
      );
      const capture = originalCapture.rows[0];
      const constraint = await fixture.pool.query<{ definition: string }>(
        "SELECT pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid='company_role_assignments'::regclass AND conname='company_role_assignments_permission_set_version_check'",
      );
      const definition = constraint.rows[0]?.definition;
      if (!capture || !definition)
        throw new Error('Expected isolated captured-permission constraint.');
      await fixture.pool.query(
        'ALTER TABLE company_role_assignments DROP CONSTRAINT company_role_assignments_permission_set_version_check',
      );
      try {
        await fixture.pool.query(
          "UPDATE company_role_assignments SET permission_set_version='UNKNOWN_PDF_TEST' WHERE id=$1",
          [capture.id],
        );
        expect(
          (
            await download(
              path,
              ready.source.companyId,
              digest,
              ESTIMATE_OFFER_READER,
            )
          ).status,
        ).toBe(403);
      } finally {
        await fixture.pool.query(
          'UPDATE company_role_assignments SET permission_set_version=$2 WHERE id=$1',
          [capture.id, capture.version],
        );
        await fixture.pool.query(
          `ALTER TABLE company_role_assignments ADD CONSTRAINT company_role_assignments_permission_set_version_check ${definition}`,
        );
      }
      const anonymous = await download(
        path,
        ready.source.companyId,
        digest,
        {},
      );
      expect(anonymous.status).toBe(401);
      const wrong = await download(
        path.replace(
          responseString(responseRecord(exact.version), 'id'),
          randomUUID(),
        ),
        ready.source.companyId,
        digest,
        ESTIMATE_OFFER_READER,
      );
      expect(wrong.status).toBe(404);
      expect(wrong.headers.get('x-commercial-pdf-source')).toBeNull();
    },
    30_000,
  );
  it.each(['中', '\u0001', '\u202Ereversed', 'مرحبا', 'A☀B☀️C'])(
    'retains readable exact HTML while refusing unsupported %j through authenticated REST',
    async (literal) => {
      const content = structuredClone(generatedOfferModelContent);
      content.sections.introduction = literal;
      const flow = await prepareGeneratedOfferWorkflow(fixture, 'PENDING', {
        modelContent: content,
      });
      const exact = responseRecord(
          responseRecord(
            await fixture.read({
              path: flow.base,
              companyId: flow.source.companyId,
              headers: ESTIMATE_OFFER_PREPARER,
            }),
          ).offer,
        ),
        representation = responseRecord(
          responseRecord(exact.version).representation,
        );
      const before = await effects(),
        response = await download(
          flow.base,
          flow.source.companyId,
          responseString(representation, 'sha256'),
        );
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({
        code: 'PDF_TEXT_UNSUPPORTED',
      });
      expect(await effects()).toEqual(before);
      const reopened = responseRecord(
        responseRecord(
          await fixture.read({
            path: flow.base,
            companyId: flow.source.companyId,
            headers: ESTIMATE_OFFER_PREPARER,
          }),
        ).offer,
      );
      expect(
        responseRecord(responseRecord(reopened.version).representation),
      ).toEqual(representation);
    },
  );
  it('hides exact records in another Company and second Workspace membership of the same Internal User', async () => {
    const flow = await prepareGeneratedOfferWorkflow(fixture, 'PENDING');
    const owner = responseRecord(
        await fixture.read({ path: '/access/current-actor' }),
      ),
      reader = responseRecord(
        await fixture.read({
          path: '/access/current-actor',
          headers: ESTIMATE_OFFER_READER,
        }),
      );
    const sameWorkspaceCompany = responseString(
      responseRecord(
        await fixture.command({
          path: '/companies',
          headers: ESTIMATE_OFFER_OWNER,
          body: { displayName: 'Foreign Company in same Workspace' },
        }),
      ),
      'id',
    );
    for (const path of [
      '/company-context-assignments',
      '/company-commercial-intake-assignments',
      '/company-offer-approver-assignments',
    ])
      await fixture.command({
        path,
        headers: ESTIMATE_OFFER_OWNER,
        body: {
          companyId: sameWorkspaceCompany,
          workspaceMembershipId: responseString(
            reader,
            'workspaceMembershipId',
          ),
        },
      });
    const foreign = await download(
      flow.base,
      sameWorkspaceCompany,
      '0'.repeat(64),
      ESTIMATE_OFFER_READER,
    );
    expect(foreign.status).toBe(404);
    expect(foreign.headers.get('x-commercial-pdf-source')).toBeNull();
    expect(foreign.headers.get('content-disposition')).toBeNull();
    const workspaceId = randomUUID(),
      ownerMembershipId = randomUUID(),
      membershipId = randomUUID();
    await fixture.pool.query('INSERT INTO workspaces(id,name) VALUES($1,$2)', [
      workspaceId,
      'Synthetic independent PDF Workspace',
    ]);
    for (const [id, userId] of [
      [ownerMembershipId, responseString(owner, 'internalUserId')],
      [membershipId, responseString(reader, 'internalUserId')],
    ])
      await fixture.pool.query(
        'INSERT INTO workspace_memberships(id,workspace_id,internal_user_id) VALUES($1,$2,$3)',
        [id, workspaceId, userId],
      );
    for (const permission of ['company.manage', 'company.assignment.manage'])
      await fixture.pool.query(
        'INSERT INTO workspace_permission_grants(workspace_id,workspace_membership_id,permission) VALUES($1,$2,$3)',
        [workspaceId, ownerMembershipId, permission],
      );
    async function scopedCommand(path: string, body: unknown) {
      const response = await fixture.request({
        path,
        headers: ESTIMATE_OFFER_OWNER,
        init: {
          method: 'POST',
          headers: {
            'x-workspace-context-id': workspaceId,
            'content-type': 'application/json',
            'idempotency-key': randomUUID(),
          },
          body: JSON.stringify(body),
        },
      });
      expect(response.status).toBe(201);
      const value: unknown = await response.json();
      return responseRecord(value);
    }
    const foreignCompany = responseString(
      await scopedCommand('/companies', {
        displayName: 'PDF second Workspace Company',
      }),
      'id',
    );
    for (const path of [
      '/company-context-assignments',
      '/company-commercial-intake-assignments',
      '/company-offer-approver-assignments',
    ])
      await scopedCommand(path, {
        companyId: foreignCompany,
        workspaceMembershipId: membershipId,
      });
    for (const versionId of [flow.versionId, randomUUID()]) {
      const response = await fixture.request({
        path: `${flow.path}/versions/${versionId}/pdf?sourceHtmlSha256=${'0'.repeat(64)}`,
        companyId: foreignCompany,
        headers: ESTIMATE_OFFER_READER,
        init: { headers: { 'x-workspace-context-id': workspaceId } },
      });
      expect(response.status).toBe(404);
      expect(response.headers.get('x-commercial-pdf-source')).toBeNull();
      expect(response.headers.get('content-disposition')).toBeNull();
    }
  });
  it('preserves the independent received original, document receipts and Registry facts across ordinary generated Contract PDF download', async () => {
    const received = await registerReceivedContract(fixture),
      companyId = received.ready.source.companyId;
    for (const path of [
      '/company-document-content-reader-assignments',
      '/company-document-content-uploader-assignments',
    ])
      await fixture.grant({
        path,
        companyId,
        membershipId: received.ready.source.preparerMembershipId,
      });
    const versionId = responseString(
      responseRecord(received.document.version),
      'id',
    );
    expect((await received.upload(versionId, 1, PDF_A)).status).toBe(201);
    await received.ready.invoke(
      `${received.ready.path}/versions/${received.contractVersionId}/quality-checks`,
      {},
    );
    await received.ready.invoke(
      `${received.ready.path}/versions/${received.contractVersionId}/approve`,
      {
        expectedContractRevision: 1,
        acknowledgedWarningCodes: [
          'MODEL_WORDING_REVIEWED',
          'ANNEX_SCOPE_REVIEWED',
        ],
        reviewBasis: 'PDF-CONSERVATION-PRIVATE-REVIEW',
      },
    );
    const exact = responseRecord(
      responseRecord(
        await fixture.read({
          path: received.ready.path,
          companyId,
          headers: ESTIMATE_OFFER_PREPARER,
        }),
      ).contract,
    );
    const representation = responseRecord(
      responseRecord(exact.version).representation,
    );
    const before = {
      commercial: await effects(),
      received: await receivedContractEffects(fixture.pool),
    };
    const response = await download(
      `${received.ready.path}/versions/${received.contractVersionId}`,
      companyId,
      responseString(representation, 'sha256'),
    );
    expect(response.status).toBe(200);
    await assertCompleteDownload(
      response,
      exact,
      responseString(representation, 'html'),
      'contract',
    );
    expect({
      commercial: await effects(),
      received: await receivedContractEffects(fixture.pool),
    }).toEqual(before);
    expect(
      Buffer.from(
        await (
          await received.call(`/versions/${versionId}/content`)
        ).arrayBuffer(),
      ),
    ).toEqual(PDF_A);
  }, 30_000);
  it.each(['legacy', 'internal'])(
    'refuses the %s Offer PDF without changing its preserved original representation or receipts',
    async (kind) => {
      const source = await fixture.prepare(),
        path = `/offers/opportunities/${source.opportunityId}`;
      const snapshot =
        kind === 'legacy' ? await fixture.illustrativeSnapshot(source) : null;
      const offer = responseRecord(
        await fixture.command({
          path: path + (kind === 'internal' ? '/from-approved-estimate' : ''),
          companyId: source.companyId,
          headers: ESTIMATE_OFFER_PREPARER,
          body: snapshot
            ? { pricingSnapshotId: snapshot.id, recipient: { kind: 'PRIMARY' } }
            : {
                estimateVersionId: source.estimateVersionId,
                estimateVersionNumber: source.estimateVersionNumber,
                recipient: { kind: 'PRIMARY' },
                validityDays: 30,
                scopeNote: null,
                commercialConditions: null,
              },
        }),
      );
      const version = responseRecord(offer.version),
        before = await effects();
      const response = await download(
        `${path}/versions/${responseString(version, 'id')}`,
        source.companyId,
        '0'.repeat(64),
      );
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({
        code: 'PDF_SOURCE_UNSUPPORTED',
      });
      expect(response.headers.get('content-disposition')).toBeNull();
      expect(await effects()).toEqual(before);
      const reopened = responseRecord(
        responseRecord(
          await fixture.read({
            path,
            companyId: source.companyId,
            headers: ESTIMATE_OFFER_PREPARER,
          }),
        ).offer,
      );
      expect(reopened.version).toEqual(offer.version);
    },
    30_000,
  );
  it.each(['sha256', 'html', 'rendererCode'])(
    'rejects database alteration of frozen %s and keeps the exact PDF source unchanged',
    async (field) => {
      const flow = await prepareGeneratedOfferWorkflow(fixture, 'PENDING');
      const exact = responseRecord(
        responseRecord(
          await fixture.read({
            path: flow.base,
            companyId: flow.source.companyId,
            headers: ESTIMATE_OFFER_PREPARER,
          }),
        ).offer,
      );
      const representation = responseRecord(
          responseRecord(exact.version).representation,
        ),
        before = await effects();
      await expect(
        fixture.pool.query(
          `UPDATE offer_versions SET model_generation_snapshot=jsonb_set(model_generation_snapshot,ARRAY['representation',$2],to_jsonb($3::text)) WHERE id=$1`,
          [
            flow.versionId,
            field,
            field === 'sha256' ? '0'.repeat(64) : 'unknown stored content',
          ],
        ),
      ).rejects.toThrow('Only initial Offer supersession is writable.');
      const response = await download(
        flow.base,
        flow.source.companyId,
        responseString(representation, 'sha256'),
      );
      expect(response.status).toBe(200);
      await assertCompleteDownload(
        response,
        exact,
        responseString(representation, 'html'),
        'offer',
      );
      expect(await effects()).toEqual(before);
    },
    30_000,
  );
  async function effects() {
    const facts: Record<string, unknown> = {};
    // Literal authoritative owners, independent of the renderer's projected document.
    // Compare whole rows, including frozen source bytes, decisions, receipts and counters.
    for (const table of [
      'offers',
      'offer_versions',
      'offer_quality_runs',
      'offer_decisions',
      'offer_transmissions',
      'offer_client_responses',
      'offer_commands',
      'offer_events',
      'offer_reference_counters',
      'contracts',
      'contract_versions',
      'contract_quality_runs',
      'contract_decisions',
      'contract_signatures',
      'contract_signing_declarations',
      'contract_project_links',
      'contract_commands',
      'contract_events',
      'contract_reference_counters',
      'offer_models',
      'offer_model_versions',
      'offer_model_decisions',
      'offer_model_withdrawals',
      'offer_model_commands',
      'offer_model_events',
      'contract_models',
      'contract_model_versions',
      'contract_model_decisions',
      'contract_model_withdrawals',
      'contract_model_commands',
      'contract_model_events',
      'profitability_estimates',
      'profitability_estimate_versions',
      'profitability_estimate_decisions',
      'profitability_estimate_receipts',
      'profitability_estimate_events',
      'pricing_rule_versions',
      'tariff_versions',
      'pricing_snapshots',
      'pricing_snapshot_lines',
      'pricing_snapshot_adjustments',
      'pricing_configuration_commands',
      'pricing_configuration_events',
      'company_role_assignments',
      'company_context_assignment_commands',
      'activity_log_events',
    ]) {
      const result = await fixture.pool.query<{ facts: unknown }>(
        `SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) AS facts FROM ${table} t`,
      );
      facts[table] = result.rows[0]?.facts;
    }
    return facts;
  }
});
async function assertCompleteDownload(
  response: Response,
  exact: Record<string, unknown>,
  html: string,
  kind: 'offer' | 'contract',
) {
  expect(response.headers.get('content-type')).toBe('application/pdf');
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  const bytes = new Uint8Array(await response.arrayBuffer());
  expect(Number(response.headers.get('content-length'))).toBe(bytes.length);
  expect(response.headers.get('x-commercial-pdf-sha256')).toBe(
    createHash('sha256').update(bytes).digest('hex'),
  );
  const metadata: unknown = JSON.parse(
    response.headers.get('x-commercial-pdf-source') ?? 'null',
  );
  const tuple = responseRecord(metadata),
    version = responseRecord(exact.version);
  expect(tuple).toMatchObject({
    kind,
    rootId: exact.id,
    companyId: exact.companyId,
    opportunityId: exact.opportunityId,
    versionId: version.id,
    versionNumber: version.versionNumber,
    sourceHtmlSha256: createHash('sha256').update(html).digest('hex'),
    sourceRendererVersion: 1,
    language: 'ro',
    createdAt: version.createdAt,
  });
  const source: Record<string, unknown> = { ...tuple, html };
  // Fully validate the response tuple before using it at the source-projection seam.
  if (
    (source.kind !== 'offer' && source.kind !== 'contract') ||
    typeof source.workspaceId !== 'string' ||
    typeof source.companyId !== 'string' ||
    typeof source.opportunityId !== 'string' ||
    typeof source.rootId !== 'string' ||
    typeof source.reference !== 'number' ||
    typeof source.versionId !== 'string' ||
    typeof source.versionNumber !== 'number' ||
    (source.provenance !== 'COMPANY_MODEL_ESTIMATE' &&
      source.provenance !== 'COMPANY_MODEL_OFFER') ||
    source.language !== 'ro' ||
    typeof source.createdAt !== 'string' ||
    (source.sourceRendererCode !== 'OFFER_COMPANY_CONSULTING_RO' &&
      source.sourceRendererCode !== 'COMPANY_CONSULTING_CONTRACT_RO') ||
    source.sourceRendererVersion !== 1 ||
    typeof source.sourceHtmlSha256 !== 'string'
  )
    throw new Error('Invalid test response tuple.');
  const identity = {
    workspaceId: source.workspaceId,
    companyId: source.companyId,
    opportunityId: source.opportunityId,
    rootId: source.rootId,
    reference: source.reference,
    versionId: source.versionId,
    versionNumber: source.versionNumber,
    language: source.language,
    createdAt: source.createdAt,
    sourceRendererVersion: source.sourceRendererVersion,
    sourceHtmlSha256: source.sourceHtmlSha256,
    html,
  } satisfies Omit<
    CommercialPdfSource,
    'kind' | 'provenance' | 'sourceRendererCode'
  >;
  let qualified: CommercialPdfSource;
  if (
    source.kind === 'offer' &&
    source.provenance === 'COMPANY_MODEL_ESTIMATE' &&
    source.sourceRendererCode === 'OFFER_COMPANY_CONSULTING_RO'
  )
    qualified = {
      ...identity,
      kind: 'offer',
      provenance: source.provenance,
      sourceRendererCode: source.sourceRendererCode,
    };
  else if (
    source.kind === 'contract' &&
    source.provenance === 'COMPANY_MODEL_OFFER' &&
    source.sourceRendererCode === 'COMPANY_CONSULTING_CONTRACT_RO'
  )
    qualified = {
      ...identity,
      kind: 'contract',
      provenance: source.provenance,
      sourceRendererCode: source.sourceRendererCode,
    };
  else throw new Error('Incoherent exact PDF source binding.');

  const pages = await inspectCommercialPdf(bytes);
  for (const [i, page] of pages.entries()) {
    expect(page.text).toContain('COPIE PDF NEOFICIALĂ');
    expect(page.text).toContain(`Pagina ${i + 1}`);
    expect(compactPdfText(page.text)).toContain(qualified.sourceHtmlSha256);
  }
  const items = pages.flatMap((page) => page.items);
  const sourceItems = items.filter((item) =>
    item.tag.startsWith('SourceBlock'),
  );
  const expected = new Map<string, string>();
  for (const [i, block] of projectCommercialPdfSource(qualified).entries()) {
    if (block.kind === 'text') expected.set(`SourceBlock${i}`, block.text);
    else
      for (const [r, row] of block.rows.entries())
        for (const [c, cell] of row.entries())
          expected.set(`SourceBlock${i}Row${r}Cell${c}`, cell);
  }
  const actual = new Map<string, string>();
  for (const item of sourceItems)
    actual.set(item.tag, (actual.get(item.tag) ?? '') + item.text);
  expect([...actual.keys()]).toEqual([...expected.keys()]);
  // Independent full-body oracle: no production projection function or PDF marker label
  // supplies the expected visible source glyph sequence, including repeated literal cells.
  let sourceBodyText = '';
  function sourceText(
    node: DefaultTreeAdapterMap['node'],
    insideBody: boolean,
  ) {
    const inside = insideBody || node.nodeName === 'body';
    if (inside && node.nodeName === '#text' && 'value' in node)
      sourceBodyText += node.value;
    if ('childNodes' in node)
      for (const child of node.childNodes) sourceText(child, inside);
  }
  sourceText(parse(html), false);
  expect(compactPdfText([...actual.values()].join(''))).toBe(
    compactPdfText(sourceBodyText),
  );

  for (const [tag, text] of expected)
    expect(compactPdfText(actual.get(tag) ?? ''), tag).toBe(
      compactPdfText(text),
    );
  for (const item of items) {
    expect(item.tag).toMatch(
      /^(?:SourceBlock[0-9]+(?:Row[0-9]+Cell[0-2])?|Pagination|PaginationTableHeader[0-9]+Cell[0-2]|PaginationRowContinuation|PdfProvenance)$/u,
    );
    if (item.tag === 'Pagination')
      expect(item.y < 70 || item.y >= 792).toBe(true);
  }
  const body = items.map((item) => item.text).join('');
  expect(body).not.toContain('basis-should-stay-internal');
  expect(body).not.toContain('source-description-internal');
  expect(body).not.toContain('PDF-CONSERVATION-PRIVATE-REVIEW');
  expect(body).toContain(qualified.rootId);
  expect(body).toContain(qualified.versionId);
}
