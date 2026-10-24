import { describe, expect, it } from 'vitest';
import { readOffer } from './offer-response';

import { internalOfferFixture } from './offer-estimate.fixture';

describe('Internal Offer response boundary', () => {
  it('reads a price-only internal draft without inventing a Snapshot, tax total or representation', () => {
    const view = readOffer(internalOfferFixture());
    expect(view.version).toMatchObject({
      provenance: 'APPROVED_ESTIMATE_INTERNAL_DRAFT',
      priceSource: { amount: '125.00', taxTreatment: 'UNSPECIFIED' },
    });
    expect(view.version).not.toHaveProperty('pricingSnapshot');
    expect(view.version).not.toHaveProperty('representation');
  });
  it.each([
    { provenance: 'FUTURE' },
    { pricingSnapshotId: 'forged' },
    { pricingSnapshot: {} },
    { representation: {} },
    { qualityRuleSet: 'OFFER_QUALITY_ILLUSTRATIVE' },
    { latestQualityRun: {} },
    { decisionState: 'APPROVED' },
    { transmissionState: 'TRANSMITTED' },
    { clientResponseState: 'ACCEPTED' },
  ])('rejects an incompatible internal shape %j', (change) => {
    const value = internalOfferFixture();
    expect(() =>
      readOffer({ ...value, version: { ...value.version, ...change } }),
    ).toThrow();
  });
  it.each([
    { amount: '125' },
    { amount: '0.00' },
    { currency: 'BAD' },
    { taxTreatment: 'NET' },
    { estimateVersionNumber: 0 },
    { approvalDecisionId: '' },
    { approvedAt: 'invalid' },
    { kind: 'FUTURE' },
  ])('rejects a malformed source %j', (change) => {
    const value = internalOfferFixture();
    expect(() =>
      readOffer({
        ...value,
        version: {
          ...value.version,
          priceSource: { ...value.version.priceSource, ...change },
        },
      }),
    ).toThrow();
  });
  it('refuses an unknown source kind in immutable history comparisons', () => {
    const value = internalOfferFixture();
    expect(() =>
      readOffer({
        ...value,
        revision: 2,
        version: {
          ...value.version,
          versionNumber: 2,
          predecessorVersionId: '00000000-0000-4000-8000-000000000099',
          differences: [
            {
              field: 'priceSourceKind',
              previous: 'FUTURE_SOURCE',
              current: 'DIRECTOR_APPROVED_ESTIMATE',
              changed: true,
            },
          ],
        },
      }),
    ).toThrow();
  });
});
