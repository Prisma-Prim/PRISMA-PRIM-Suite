import { describe, expect, it } from 'vitest';
import { assertMessageCoverage } from '../localization/messages';
import { pdfTarget } from '../commercial-pdf/commercial-pdf.test-fixture';
import { readOfferMessageObservation } from './offer-message-contract';
import { offerMessageMessages } from './offer-message.copy';

describe('protected exact Offer message observation', () => {
  it('accepts only the closed native envelope and full exact source tuple', () => {
    if (pdfTarget.kind !== 'offer') throw new Error('Offer fixture required');
    const readCapture = `offer-message-read.v1.${'b'.repeat(64)}`;
    const value = {
      format: 'offer-message-preparation.v1',
      readCapture,
      source: pdfTarget,
      party: {
        kind: 'PRIMARY',
        legalName: 'Synthetic Offer party',
        taxId: null,
        legalAddress: null,
      },
      actor: {
        workspaceMembershipId: 'member',
        displayName: 'Synthetic Actor',
      },
    };
    const read = (input: unknown) =>
      readOfferMessageObservation({
        value: input,
        target:
          pdfTarget.kind === 'offer'
            ? pdfTarget
            : (() => {
                throw new Error('Offer fixture required');
              })(),
        readCapture,
        workspaceMembershipId: 'member',
      });
    expect(read(value)?.party.legalName).toBe('Synthetic Offer party');
    expect(
      read({
        ...value,
        party: {
          ...value.party,
          kind: 'ADDITIONAL',
          additionalLegalEntityId: 'additional-entity',
        },
      }),
    ).not.toBeNull();
    for (const input of [
      { ...value, extra: true },
      { ...value, format: 'v2' },
      { ...value, readCapture: `${readCapture}0` },
      { ...value, source: { ...pdfTarget, sourceHtmlSha256: 'c'.repeat(64) } },
      { ...value, source: { ...pdfTarget, extra: true } },
      { ...value, actor: { ...value.actor, workspaceMembershipId: 'other' } },
      { ...value, actor: { ...value.actor, extra: true } },
      { ...value, party: { ...value.party, additionalLegalEntityId: null } },
      { ...value, party: { ...value.party, kind: 'ADDITIONAL' } },
    ])
      expect(read(input)).toBeNull();
    for (const key of Object.keys(pdfTarget)) {
      const source = Object.fromEntries(
        Object.entries(pdfTarget).filter(([name]) => name !== key),
      );
      expect(read({ ...value, source })).toBeNull();
    }
  });
  it('supplies every interface message in all four locales', () => {
    expect(() =>
      assertMessageCoverage('offerMessage', offerMessageMessages),
    ).not.toThrow();
  });
});
