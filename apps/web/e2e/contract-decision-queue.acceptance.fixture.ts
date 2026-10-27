import { expect, type Page } from '@playwright/test';
import {
  prepareModelContractCase,
  modelContractIdentities as identities,
  object,
  text,
} from './model-contract.acceptance.fixture';

/** Public synthetic creation; the browser approver receives no Client/configuration grant. */
export async function prepareContractDecisionQueue(page: Page, suffix: string) {
  const f = await prepareModelContractCase(page, 'Pending ' + suffix);
  const prepare = (path: string, body: unknown) =>
    f.command(path, body, identities.preparer, f.companyId);
  for (const bundle of [
    'company-contract-preparer',
    'company-contract-approver',
  ])
    await f.command('/' + bundle + '-assignments', {
      companyId: f.companyId,
      workspaceMembershipId: f.preparerId,
    });
  const firstOffer = object(
    (await f.read(`/offers/opportunities/${f.opportunityId}`, f.companyId))
      .offer,
  );
  const offerModelId = text(
    object(object(firstOffer.version).modelSource).versionId,
  );
  const model = object(
    (await f.read('/contract-models/consulting-ro', f.companyId)).model,
  );
  const approvalId = text(object(object(model.head).decision).id);
  const versions: {
    opportunityId: string;
    contractId: string;
    versionId: string;
    reference: number;
    title: string;
    sourceOfferVersionId: string;
  }[] = [];
  for (let n = 0; n < 27; n++) {
    let opportunityId = f.opportunityId,
      sourceOfferVersionId = f.offerVersionId,
      title = f.subject;
    if (n > 0) {
      title = `Pending Contract ${suffix} ${n + 1}`;
      const request = await prepare('/commercial-intake/requests', {
        clientAccountId: f.clientId,
        subject: title,
        originalText: 'Synthetic pending Contract discovery',
        opportunity: { title, nextAction: 'Review the exact Contract' },
      });
      opportunityId = text(object(request.initialOpportunity).id);
      const estimate = await prepare(
        `/opportunities/${opportunityId}/profitability-estimates`,
        {
          expectedLatestVersionNumber: null,
          currency: 'EUR',
          executorType: 'PATENT_CONSULTANT',
          executorCost: '70.00',
          fiscalCost: '10.00',
          allocatedOverhead: '10.00',
          directCosts: [
            {
              key: 'travel',
              category: 'TRAVEL',
              label: 'Synthetic travel',
              amount: '10.00',
              currency: 'EUR',
            },
          ],
          targetProfitability: '20',
          proposedPrice: '125.00',
          pricingIntent: { kind: 'ORDINARY' },
          costConfirmation: true,
        },
      );
      await f.command(
        `/opportunities/${opportunityId}/profitability-estimates/versions/${text(estimate.id)}/decision`,
        { expectedVersionNumber: 1, expectedDecision: null, code: 'APPROVE' },
        identities.director,
        f.companyId,
      );
      const offer = await prepare(
        `/offers/opportunities/${opportunityId}/from-approved-model`,
        {
          estimateVersionId: text(estimate.id),
          estimateVersionNumber: 1,
          modelVersionId: offerModelId,
          modelVersionNumber: 1,
          recipient: { kind: 'PRIMARY' },
          validityDays: 30,
          scopeNote: 'Synthetic pending Contract scope',
          commercialConditions: null,
          financialDeclaration: {
            kind: 'NET_PLUS_DECLARED_TAX',
            netAmountConfirmed: true,
            taxAmount: '25.00',
            taxLabel: 'Synthetic declared tax',
            basis: 'Synthetic declaration basis',
          },
        },
      );
      sourceOfferVersionId = text(object(offer.version).id);
      const base = `/offers/opportunities/${opportunityId}/versions/${sourceOfferVersionId}`;
      await prepare(base + '/approve', {
        expectedOfferRevision: 1,
        acknowledgedWarningCodes: [
          'DECLARED_TAX_UNVERIFIED',
          'NON_OFFICIAL_OFFER',
          'ILLUSTRATIVE_MODEL',
        ],
      });
      await prepare(base + '/transmission', {
        expectedOfferRevision: 2,
        acknowledgedWarningCodes: [],
        note: null,
      });
    }
    const created = await prepare(
      `/contracts/opportunities/${opportunityId}/from-approved-model`,
      {
        sourceOfferVersionId,
        modelVersionId: f.modelVersionId,
        modelVersionNumber: 1,
        modelApprovalDecisionId: approvalId,
        documentDate: '2026-10-24',
        clientDetails:
          ' Synthetic exact Client requisites\n<script>literalPending()</script> ',
        termStartsOn: null,
        termEndsOn: null,
        specialConditions: null,
        sourceConcordanceDeclaration: true,
        sourceConcordanceBasis: 'Synthetic exact source concordance reviewed',
      },
    );
    const reference = created.illustrativeReference;
    if (typeof reference !== 'number' || !Number.isSafeInteger(reference))
      throw new Error('Missing synthetic reference');
    versions.push({
      opportunityId,
      contractId: text(created.id),
      versionId: text(object(created.version).id),
      reference,
      title,
      sourceOfferVersionId,
    });
  }
  expect(versions).toHaveLength(27);
  await page.route('**/api/**', (route) =>
    route.fallback({
      headers: { ...route.request().headers(), ...identities.reader },
    }),
  );
  return { ...f, versions };
}
