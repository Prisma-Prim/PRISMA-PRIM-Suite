import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inspectCommercialPdf } from '../commercial-pdf/pdf-inspection.test-support.mjs';
import {
  ESTIMATE_OFFER_PREPARER,
  ESTIMATE_OFFER_READER,
  ESTIMATE_OFFER_WORKSPACE,
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from './offer-estimate-preparation.test-support.js';
import {
  generatedOfferIntent,
  prepareGeneratedOfferSource,
  prepareGeneratedOfferWorkflow,
} from './offer-model-generation.test-fixture.js';
import {
  currentMessageCapture,
  prepareMessageIllustrativeOffer,
  readMessageOffer,
} from './offer-message-proof.test-support.js';
import { snapshotOfferMessageState } from './offer-message-snapshot.test-support.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres('Exact Offer message preparation public REST', () => {
  let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>;
  beforeAll(async () => {
    fixture = await openEstimateOfferFixture({
      synchronizeIdentityProfile: false,
    });
  });
  beforeEach(async () => {
    await fixture.reset();
  });
  afterAll(async () => {
    await fixture?.close();
  });

  it.each(['model-ro', 'illustrative-en'] as const)(
    'observes current and historical %s v1/v2 as a no-Client reader on a non-OPEN Opportunity without any business write',
    async (kind) => {
      const ready =
        kind === 'model-ro'
          ? await prepareGeneratedOfferWorkflow(fixture, 'PENDING')
          : await prepareMessageIllustrativeOffer(fixture);
      const second = responseRecord(
        await fixture.command({
          path:
            kind === 'model-ro'
              ? `${ready.path}/versions/from-approved-model`
              : `${ready.path}/versions`,
          companyId: ready.source.companyId,
          headers: ESTIMATE_OFFER_PREPARER,
          body: {
            ...('intent' in ready
              ? ready.intent
              : generatedOfferIntent(ready.source)),
            expectedOfferRevision: 1,
            commercialConditions: 'Deliberately recorded second Version',
          },
        }),
      );
      const secondId = responseString(responseRecord(second.version), 'id');
      await fixture.grant({
        path: '/company-opportunity-manager-assignments',
        companyId: ready.source.companyId,
        membershipId: ready.source.preparerMembershipId,
      });
      const outcome = await fixture.post({
        path: `/commercial-intake/opportunities/${ready.source.opportunityId}/outcome`,
        companyId: ready.source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body: { expectedVersion: 1, status: 'WON' },
      });
      expect({
        status: outcome.status,
        body: await outcome.json(),
      }).toMatchObject({
        status: 200,
      });
      expect(
        (
          await fixture.request({
            path: `/clients/${ready.source.clientId}`,
            companyId: ready.source.companyId,
            headers: ESTIMATE_OFFER_READER,
          })
        ).status,
      ).toBe(403);
      const { actor, capture } = await currentMessageCapture(
        fixture,
        ready.source.companyId,
      );
      const before = await snapshotOfferMessageState(
        fixture.pool,
        ESTIMATE_OFFER_WORKSPACE,
      );
      for (const [versionId, versionNumber] of [
        [ready.versionId, 1],
        [secondId, 2],
      ] as const) {
        const base = `${ready.path}/versions/${versionId}`;
        const exact = await readMessageOffer(fixture, {
          base,
          companyId: ready.source.companyId,
        });
        expect(exact.version.decisionState).toBe('PENDING');
        expect(createHash('sha256').update(exact.html).digest('hex')).toBe(
          exact.digest,
        );
        const response = await fixture.request({
          path: `${base}/message-preparation?sourceHtmlSha256=${exact.digest}`,
          companyId: ready.source.companyId,
          headers: ESTIMATE_OFFER_READER,
        });
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('private, no-store');
        const expectedSource = {
          kind: 'offer',
          workspaceId: ESTIMATE_OFFER_WORKSPACE,
          companyId: ready.source.companyId,
          opportunityId: ready.source.opportunityId,
          rootId: exact.offer.id,
          reference: exact.offer.illustrativeReference,
          versionId,
          versionNumber,
          createdAt: exact.version.createdAt,
          sourceRendererVersion: 1,
          sourceHtmlSha256: exact.digest,
          provenance:
            kind === 'model-ro' ? 'COMPANY_MODEL_ESTIMATE' : 'ILLUSTRATIVE',
          language: kind === 'model-ro' ? 'ro' : 'en',
          sourceRendererCode:
            kind === 'model-ro'
              ? 'OFFER_COMPANY_CONSULTING_RO'
              : 'OFFER_ILLUSTRATIVE',
        };
        expect(await response.json()).toEqual({
          format: 'offer-message-preparation.v1',
          readCapture: capture,
          source: expectedSource,
          party: {
            kind: 'PRIMARY',
            legalName: 'Synthetic internal Offer Client',
            taxId: 'SYNTHETIC-842',
            legalAddress: '842 Example Street',
          },
          actor: {
            workspaceMembershipId: ready.source.readerMembershipId,
            displayName: actor.displayName,
          },
        });
        const pdf = await fixture.request({
          path: `${base}/pdf?sourceHtmlSha256=${exact.digest}`,
          companyId: ready.source.companyId,
          headers: ESTIMATE_OFFER_READER,
        });
        expect(pdf.status).toBe(200);
        expect(pdf.headers.get('content-type')).toBe('application/pdf');
        expect(
          JSON.parse(pdf.headers.get('x-commercial-pdf-source') ?? 'null'),
        ).toEqual(expectedSource);
        const bytes = new Uint8Array(await pdf.arrayBuffer());
        expect(pdf.headers.get('x-commercial-pdf-sha256')).toBe(
          createHash('sha256').update(bytes).digest('hex'),
        );
        expect((await inspectCommercialPdf(bytes)).length).toBeGreaterThan(0);
      }
      expect(
        await snapshotOfferMessageState(fixture.pool, ESTIMATE_OFFER_WORKSPACE),
      ).toEqual(before);
    },
    30_000,
  );

  it('returns the immutable additional recipient without reading the corrected live Client', async () => {
    const source = await prepareGeneratedOfferSource(fixture);
    async function readClientVersion() {
      const client = responseRecord(
        await fixture.read({
          path: `/clients/${source.clientId}`,
          companyId: source.companyId,
          headers: ESTIMATE_OFFER_PREPARER,
        }),
      );
      const version = client.version;
      if (
        typeof version !== 'number' ||
        !Number.isSafeInteger(version) ||
        version < 1
      )
        throw new Error('Expected the native Client dossier version.');
      return version;
    }
    const registered = responseRecord(
      await fixture.command({
        path: `/clients/${source.clientId}/legal-entities`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body: {
          expectedClientVersion: await readClientVersion(),
          legalName: 'Literal historical branch',
          taxId: 'SYNTHETIC-MESSAGE-BRANCH',
          legalAddress: 'Literal historical address',
        },
      }),
    );
    const legalEntityId = responseString(
      responseRecord(registered.legalEntity),
      'id',
    );
    const created = responseRecord(
      await fixture.command({
        path: `/offers/opportunities/${source.opportunityId}/from-approved-model`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body: {
          ...generatedOfferIntent(source),
          recipient: { kind: 'ADDITIONAL', legalEntityId },
        },
      }),
    );
    const versionId = responseString(responseRecord(created.version), 'id');
    const corrected = await fixture.request({
      path: `/clients/${source.clientId}/legal-entities/${legalEntityId}`,
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      init: {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': randomUUID(),
        },
        body: JSON.stringify({
          expectedClientVersion: await readClientVersion(),
          changes: {
            legalName: 'Corrected live branch',
            legalAddress: 'Corrected live address',
          },
        }),
      },
    });
    expect(corrected.status).toBe(200);
    const base = `/offers/opportunities/${source.opportunityId}/versions/${versionId}`;
    const exact = await readMessageOffer(fixture, {
      base,
      companyId: source.companyId,
    });
    const before = await snapshotOfferMessageState(
      fixture.pool,
      ESTIMATE_OFFER_WORKSPACE,
    );
    const response = await fixture.request({
      path: `${base}/message-preparation?sourceHtmlSha256=${exact.digest}`,
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_READER,
    });
    expect(response.status).toBe(200);
    expect(responseRecord(await response.json()).party).toEqual({
      kind: 'ADDITIONAL',
      additionalLegalEntityId: legalEntityId,
      legalName: 'Literal historical branch',
      taxId: 'SYNTHETIC-MESSAGE-BRANCH',
      legalAddress: 'Literal historical address',
    });
    expect(
      await snapshotOfferMessageState(fixture.pool, ESTIMATE_OFFER_WORKSPACE),
    ).toEqual(before);
  });

  it('safely refuses malformed, mixed, foreign and mismatched requests without changing rows or exposing source metadata', async () => {
    const ready = await prepareGeneratedOfferWorkflow(fixture, 'PENDING');
    const exact = await readMessageOffer(fixture, {
      base: ready.base,
      companyId: ready.source.companyId,
    });
    const foreignCompany = responseRecord(
      await fixture.command({
        path: '/companies',
        body: { displayName: 'Foreign message Company' },
      }),
    );
    const foreignCompanyId = responseString(foreignCompany, 'id');
    const before = await snapshotOfferMessageState(
      fixture.pool,
      ESTIMATE_OFFER_WORKSPACE,
    );
    for (const refusal of [
      { path: `${ready.base}/message-preparation`, status: 400 },
      {
        path: `${ready.base}/message-preparation?sourceHtmlSha256=${exact.digest}&extra=value`,
        status: 400,
      },
      {
        path: `${ready.base}/message-preparation?sourceHtmlSha256=${exact.digest}&sourceHtmlSha256=${exact.digest}`,
        status: 400,
      },
      {
        path: `${ready.base}/message-preparation?sourceHtmlSha256=${exact.digest.toUpperCase()}`,
        status: 400,
      },
      {
        path: `${ready.base}/message-preparation?sourceHtmlSha256=${'0'.repeat(64)}`,
        status: 409,
      },
      {
        path: `/offers/opportunities/not-a-uuid/versions/${ready.versionId}/message-preparation?sourceHtmlSha256=${exact.digest}`,
        status: 400,
      },
      {
        path: `/offers/opportunities/${ready.source.opportunityId}/versions/not-a-uuid/message-preparation?sourceHtmlSha256=${exact.digest}`,
        status: 400,
      },
      {
        path: `/offers/opportunities/${randomUUID()}/versions/${ready.versionId}/message-preparation?sourceHtmlSha256=${exact.digest}`,
        status: 404,
      },
      {
        path: `${ready.base}/message-preparation?sourceHtmlSha256=${exact.digest}`,
        status: 403,
        companyId: foreignCompanyId,
      },
    ]) {
      const response = await fixture.request({
        path: refusal.path,
        companyId: refusal.companyId ?? ready.source.companyId,
        headers: ESTIMATE_OFFER_READER,
      });
      expect({ path: refusal.path, status: response.status }).toMatchObject({
        status: refusal.status,
      });
      const body = responseRecord(await response.json());
      for (const key of [
        'source',
        'party',
        'actor',
        'readCapture',
        'html',
        'versionId',
      ])
        expect(body).not.toHaveProperty(key);
      expect(response.headers.get('x-commercial-pdf-source')).toBeNull();
    }
    expect(
      await snapshotOfferMessageState(fixture.pool, ESTIMATE_OFFER_WORKSPACE),
    ).toEqual(before);
  });

  it('leaves adjusted Template-v2 native consultation available while safely refusing message preparation and PDF', async () => {
    const ready = await prepareMessageIllustrativeOffer(fixture, true);
    const exact = await readMessageOffer(fixture, {
      base: ready.base,
      companyId: ready.source.companyId,
    });
    expect(responseRecord(exact.version.representation).templateVersion).toBe(
      2,
    );
    const before = await snapshotOfferMessageState(
      fixture.pool,
      ESTIMATE_OFFER_WORKSPACE,
    );
    for (const action of ['message-preparation', 'pdf']) {
      const response = await fixture.request({
        path: `${ready.base}/${action}?sourceHtmlSha256=${exact.digest}`,
        companyId: ready.source.companyId,
        headers: ESTIMATE_OFFER_READER,
      });
      expect(response.status).toBe(422);
      expect(responseRecord(await response.json())).not.toHaveProperty(
        'source',
      );
    }
    expect(
      await readMessageOffer(fixture, {
        base: ready.base,
        companyId: ready.source.companyId,
      }),
    ).toEqual(exact);
    expect(
      await snapshotOfferMessageState(fixture.pool, ESTIMATE_OFFER_WORKSPACE),
    ).toEqual(before);
  });
});
