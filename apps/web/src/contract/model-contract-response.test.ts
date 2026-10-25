import { describe, expect, it } from 'vitest';
import {
  modelContractActor,
  modelContractFixture,
  modelContractSourceOfferFixture,
  selectedContractModelFixture,
} from './model-contract.fixture';
import {
  readModelContract,
  readPreparedModelContract,
  readModelContractCase,
} from './model-contract-response';
import { readModelOffer } from '../offer/model-offer-response';
import { readSelectedContractModel } from './model-contract-source-response';
describe('Complete model Contract HTTP boundary', () => {
  it('confirms only the selected complete copies and attributed original command', () => {
    const source = modelContractFixture(),
      expected = {
        companyId: source.companyId,
        workspaceId: modelContractActor.workspaceId,
        opportunityId: source.opportunityId,
        membershipId: modelContractActor.workspaceMembershipId,
        prior: null,
        offer: readModelOffer(modelContractSourceOfferFixture()),
        model: readSelectedContractModel(selectedContractModelFixture),
        caseDetails: readModelContractCase(
          source.version.modelGeneration.caseDetails,
        ),
      };
    expect(readPreparedModelContract(source, expected).version.id).toBe(
      source.version.id,
    );
    const v = source.version,
      g = v.modelGeneration;
    for (const changed of [
      {
        ...v,
        createdByWorkspaceMembershipId: '10000000-0000-4000-8000-000000000999',
      },
      {
        ...v,
        modelGeneration: {
          ...g,
          modelSource: {
            ...g.modelSource,
            content: {
              ...g.modelSource.content,
              title: 'Different literal wording under the same identifiers',
            },
          },
        },
      },
      {
        ...v,
        modelGeneration: {
          ...g,
          offerSource: {
            ...g.offerSource,
            representationSha256: 'c'.repeat(64),
          },
        },
      },
    ])
      expect(() =>
        readPreparedModelContract({ ...source, version: changed }, expected),
      ).toThrow();
  });
  it('preserves the literal copied model, case, financial facts and exact representation', () => {
    const source = modelContractFixture(),
      read = readModelContract(source);
    expect(read.version.modelGeneration).toEqual(
      source.version.modelGeneration,
    );
    expect(read.version.representation).toEqual(source.version.representation);
  });
  it.each([
    { provenance: 'ILLUSTRATIVE' },
    { executionState: 'EXECUTED' },
    { decisionState: 'APPROVED' },
    {
      representation: {
        rendererCode: 'CONTRACT_ILLUSTRATIVE',
        rendererVersion: 1,
        html: 'bad',
        sha256: 'a'.repeat(64),
      },
    },
    { modelGeneration: { financials: { netAmount: '1.00' } } },
    { qualityRuleSet: 'CONTRACT_QUALITY_ILLUSTRATIVE' },
  ])('refuses contradictory or incomplete new-mode content %j', (change) => {
    const source = modelContractFixture();
    expect(() =>
      readModelContract({
        ...source,
        version: { ...source.version, ...change },
      }),
    ).toThrow();
  });
  it('rejects an unequal copied total and mismatched exact source', () => {
    const source = modelContractFixture();
    expect(() =>
      readModelContract({
        ...source,
        version: {
          ...source.version,
          modelGeneration: {
            ...source.version.modelGeneration,
            financials: {
              ...source.version.modelGeneration.financials,
              grossAmount: '1.00',
            },
          },
        },
      }),
    ).toThrow();
    expect(() =>
      readModelContract({
        ...source,
        sourceOfferId: '10000000-0000-4000-8000-000000000999',
      }),
    ).toThrow();
  });
});
