import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { OfferService } from '../offer/offer.service.js';
import {
  ESTIMATE_OFFER_PREPARER,
  ESTIMATE_OFFER_READER,
  openEstimateOfferFixture,
  responseRecord,
} from '../offer/offer-estimate-preparation.test-support.js';
import { prepareMessageIllustrativeOffer } from '../offer/offer-message-proof.test-support.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const initialTime = '2026-10-24T09:00:00.000Z';

withPostgres('Contract binding at the pending Offer validity boundary', () => {
  let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>;
  let now: Date;
  beforeAll(async () => {
    fixture = await openEstimateOfferFixture({
      serverClock: { now: () => new Date(now) },
    });
  });
  beforeEach(async () => {
    now = new Date(initialTime);
    await fixture.reset();
  });
  afterAll(async () => {
    await fixture?.close();
  });

  async function preparePendingOffer() {
    const { source, versionId, base } =
      await prepareMessageIllustrativeOffer(fixture);
    const { companyId, opportunityId, preparerMembershipId } = source;
    for (const path of [
      '/company-contract-preparer-assignments',
      '/company-contract-early-preparation-assignments',
    ])
      await fixture.grant({
        path,
        companyId,
        membershipId: preparerMembershipId,
      });
    await fixture.command({
      path: `${base}/approve`,
      companyId,
      headers: ESTIMATE_OFFER_READER,
      body: { expectedOfferRevision: 1, acknowledgedWarningCodes: [] },
    });
    await fixture.command({
      path: `${base}/transmission`,
      companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      body: {
        expectedOfferRevision: 2,
        acknowledgedWarningCodes: [],
        note: null,
      },
    });
    return { companyId, opportunityId, versionId };
  }

  async function effects() {
    return (
      await fixture.pool.query<{ effects: unknown }>(`SELECT jsonb_build_object(
        'contracts', (SELECT count(*) FROM contracts),
        'versions', (SELECT count(*) FROM contract_versions),
        'receipts', (SELECT count(*) FROM contract_commands),
        'events', (SELECT count(*) FROM contract_events),
        'references', (SELECT jsonb_agg(to_jsonb(c) ORDER BY company_id, kind) FROM contract_reference_counters c),
        'clientVersions', (SELECT jsonb_agg(jsonb_build_object('id',id,'version',version) ORDER BY id) FROM client_accounts)
      ) AS effects`)
    ).rows;
  }

  it.each(['initial', 'successor'] as const)(
    'refuses expiry while recording the %s binding without effects',
    async (kind) => {
      const { companyId, opportunityId, versionId } =
        await preparePendingOffer();
      const contract = `/contracts/opportunities/${opportunityId}`;
      if (kind === 'successor')
        await fixture.command({
          path: `${contract}/preparation`,
          companyId,
          headers: ESTIMATE_OFFER_PREPARER,
          body: { sourceOfferVersionId: versionId },
        });
      const expiry = (
        await fixture.pool.query<{ valid_until: Date }>(
          'SELECT valid_until FROM offer_versions WHERE id=$1',
          [versionId],
        )
      ).rows[0]?.valid_until;
      if (!expiry) throw new Error('Missing Offer Version validity.');
      now = new Date(expiry.getTime() - 1);
      const before = await effects();
      const lookup = OfferService.prototype.resolvePreparationContractSource;
      const resolutions: {
        locked: boolean;
        offerReads: number;
        versionReads: number;
      }[] = [];
      const clock = vi
        .spyOn(OfferService.prototype, 'resolvePreparationContractSource')
        .mockImplementation(async function (this: OfferService, input) {
          const result = await fixture.measureApplicationQueries(() =>
            lookup.call(this, input),
          );
          resolutions.push({
            locked: input.lock,
            offerReads: result.queries.filter((query) =>
              query.includes('from "offers"'),
            ).length,
            versionReads: result.queries.filter((query) =>
              query.includes('from "offer_versions"'),
            ).length,
          });
          if (input.lock) now = expiry;
          return result.value;
        });
      const request = {
        path: `${contract}/${kind === 'initial' ? 'preparation' : 'versions'}`,
        companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body: {
          sourceOfferVersionId: versionId,
          ...(kind === 'successor' ? { expectedContractRevision: 1 } : {}),
        },
        key: 'expiry-crossing-' + kind,
      };
      let recorded: Response;
      try {
        recorded = await fixture.post(request);
      } finally {
        clock.mockRestore();
      }
      expect(recorded.status).toBe(409);
      expect(responseRecord(await recorded.json()).code).toBe(
        'OFFER_NOT_PREPARABLE',
      );
      expect(resolutions).toEqual(
        (kind === 'initial' ? [false, true] : [true]).map((locked) => ({
          locked,
          offerReads: 1,
          versionReads: 1,
        })),
      );
      expect(await effects()).toEqual(before);
      const replay = await fixture.post(request);
      expect(replay.status).toBe(409);
      expect(responseRecord(await replay.json()).code).toBe(
        'OFFER_NOT_PREPARABLE',
      );
      expect(await effects()).toEqual(before);
    },
    30000,
  );
});
