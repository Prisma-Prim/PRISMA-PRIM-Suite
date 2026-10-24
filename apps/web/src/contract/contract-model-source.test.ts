import { describe, expect, it } from 'vitest';
import { modelOfferFixture } from '../offer/model-offer.fixture';
import {
  readAcceptedOfferSource,
  readContractPreparationSource,
} from './contract-response';

describe('Legacy Contract model-source boundary', () => {
  it('never offers the new non-official model for either accepted or early Contract preparation', () => {
    const offer = modelOfferFixture();
    for (const clientResponseState of ['NONE', 'PENDING', 'ACCEPTED']) {
      const input = {
        offer: {
          ...offer,
          version: {
            ...offer.version,
            decisionState: 'APPROVED',
            transmissionState: 'TRANSMITTED',
            clientResponseState,
          },
        },
      };
      expect(readAcceptedOfferSource(input)).toBeNull();
      expect(readContractPreparationSource(input)).toBeNull();
      expect(readContractPreparationSource(input, true)).toBeNull();
    }
  });
  it('fails closed for a malformed claim of new-model eligibility', () => {
    const offer = modelOfferFixture();
    const input = {
      offer: {
        ...offer,
        version: { ...offer.version, eligibility: 'OFFICIAL' },
      },
    };
    expect(() => readAcceptedOfferSource(input)).toThrow();
    expect(() => readContractPreparationSource(input, true)).toThrow();
  });
});
