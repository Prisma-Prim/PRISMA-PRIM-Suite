import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import { syntheticContent as offerContent } from '../src/offer-model/offer-model.fixture';
import { syntheticContent as contractContent } from '../src/contract-model/contract-model.fixture';
const origin = 'http://127.0.0.1:4174/api';
function headers(subject: string, name: string) {
  return {
    'x-test-external-provider': 'local-demo',
    'x-test-external-subject': subject,
    'x-test-display-name': name,
    'x-test-email': subject + '@example.test',
  };
}
export const modelContractIdentities = {
  owner: headers('workspace-owner', 'Workspace Owner'),
  preparer: headers('local-demonstration-user', 'Ada Ionescu'),
  director: headers('responsible-colleague', 'Ion Popa'),
  reader: headers('commercial-readonly-member', 'Commercial Reader'),
};
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected synthetic response object');
  return Object.fromEntries(Object.entries(value));
}
export function text(value: unknown) {
  if (typeof value !== 'string' || !value)
    throw new Error('Expected response identifier');
  return value;
}

/** All setup uses the public API and deliberate synthetic approvals, never actual case data. */
export async function prepareModelContractCase(page: Page, suffix: string) {
  async function command(
    path: string,
    body: unknown,
    identity = modelContractIdentities.owner,
    companyId?: string,
  ) {
    const response = await page.request.post(origin + path, {
      headers: {
        ...identity,
        ...(companyId ? { 'x-company-context-id': companyId } : {}),
        'idempotency-key': randomUUID(),
      },
      data: body,
    });
    expect(response.status(), path).toBe(201);
    return object(await response.json());
  }
  async function read(
    path: string,
    companyId: string,
    identity = modelContractIdentities.preparer,
  ) {
    const response = await page.request.get(origin + path, {
      headers: { ...identity, 'x-company-context-id': companyId },
    });
    expect(response.status(), path).toBe(200);
    return object(await response.json());
  }
  async function member(identity: typeof modelContractIdentities.owner) {
    const response = await page.request.get(origin + '/access/current-actor', {
      headers: identity,
    });
    expect(response.status()).toBe(200);
    return text(object(await response.json()).workspaceMembershipId);
  }
  const companyName = 'Corresponding Contract DEMO ' + suffix,
    subject = 'Corresponding Contract Request DEMO ' + suffix;
  const companyId = text(
    (await command('/companies', { displayName: companyName })).id,
  );
  const otherCompanyName = 'Other Corresponding Contract DEMO ' + suffix,
    otherCompanyId = text(
      (await command('/companies', { displayName: otherCompanyName })).id,
    );
  const preparerId = await member(modelContractIdentities.preparer),
    directorId = await member(modelContractIdentities.director),
    readerId = await member(modelContractIdentities.reader);
  for (const membershipId of [preparerId, directorId, readerId])
    for (const bundle of ['company-context', 'company-commercial-intake'])
      await command('/' + bundle + '-assignments', {
        companyId,
        workspaceMembershipId: membershipId,
      });
  await command('/company-context-assignments', {
    companyId: otherCompanyId,
    workspaceMembershipId: readerId,
  });
  for (const bundle of [
    'company-director-client',
    'company-offer-preparer',
    'company-profitability-contributor',
    'company-contract-model-editor',
    'company-contract-model-approver',
  ])
    await command('/' + bundle + '-assignments', {
      companyId,
      workspaceMembershipId: preparerId,
    });
  await command('/company-profitability-director-assignments', {
    companyId,
    workspaceMembershipId: directorId,
  });
  for (const membershipId of [preparerId, readerId])
    await command('/company-offer-approver-assignments', {
      companyId,
      workspaceMembershipId: membershipId,
    });
  await command('/company-contract-approver-assignments', {
    companyId,
    workspaceMembershipId: readerId,
  });
  const clientId = text(
    (
      await command(
        '/clients',
        {
          displayName: 'Corresponding Contract Client DEMO ' + suffix,
          taxId: 'SYNTHETIC-MODEL-CONTRACT-' + suffix,
          address: 'Synthetic case address',
        },
        modelContractIdentities.preparer,
        companyId,
      )
    ).id,
  );
  const request = await command(
      '/commercial-intake/requests',
      {
        clientAccountId: clientId,
        subject,
        originalText: 'Synthetic full corresponding Contract rehearsal.',
        opportunity: {
          title: subject,
          nextAction: 'Prepare the corresponding complete Contract and annex',
        },
      },
      modelContractIdentities.preparer,
      companyId,
    ),
    opportunityId = text(object(request.initialOpportunity).id);
  const estimate = await command(
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
    modelContractIdentities.preparer,
    companyId,
  );
  await command(
    `/opportunities/${opportunityId}/profitability-estimates/versions/${text(estimate.id)}/decision`,
    { expectedVersionNumber: 1, expectedDecision: null, code: 'APPROVE' },
    modelContractIdentities.director,
    companyId,
  );
  for (const bundle of [
    'company-offer-model-editor',
    'company-offer-model-approver',
  ])
    await command('/' + bundle + '-assignments', {
      companyId,
      workspaceMembershipId: preparerId,
    });
  const offerModel = object(
      (
        await command(
          '/offer-models/consulting-ro/versions',
          { expectedModelRevision: 0, content: offerContent },
          modelContractIdentities.preparer,
          companyId,
        )
      ).model,
    ),
    offerModelId = text(object(offerModel.head).id);
  await command(
    `/offer-models/consulting-ro/versions/${offerModelId}/decision`,
    {
      expectedModelRevision: 1,
      versionNumber: 1,
      outcome: 'APPROVE',
      basis: 'Synthetic full Offer wording reviewed',
    },
    modelContractIdentities.preparer,
    companyId,
  );
  const offer = await command(
      `/offers/opportunities/${opportunityId}/from-approved-model`,
      {
        estimateVersionId: text(estimate.id),
        estimateVersionNumber: 1,
        modelVersionId: offerModelId,
        modelVersionNumber: 1,
        recipient: { kind: 'PRIMARY' },
        validityDays: 30,
        scopeNote:
          ' Synthetic corresponding scope\n<script>literalScope()</script> ',
        commercialConditions: 'Synthetic commercial conditions',
        financialDeclaration: {
          kind: 'NET_PLUS_DECLARED_TAX',
          netAmountConfirmed: true,
          taxAmount: '25.00',
          taxLabel: 'Synthetic declared tax',
          basis: 'Synthetic private tax declaration basis',
        },
      },
      modelContractIdentities.preparer,
      companyId,
    ),
    offerVersionId = text(object(offer.version).id);
  await command(
    `/offers/opportunities/${opportunityId}/versions/${offerVersionId}/approve`,
    {
      expectedOfferRevision: 1,
      acknowledgedWarningCodes: [
        'DECLARED_TAX_UNVERIFIED',
        'NON_OFFICIAL_OFFER',
        'ILLUSTRATIVE_MODEL',
      ],
    },
    modelContractIdentities.preparer,
    companyId,
  );
  await command(
    `/offers/opportunities/${opportunityId}/versions/${offerVersionId}/transmission`,
    { expectedOfferRevision: 2, acknowledgedWarningCodes: [], note: null },
    modelContractIdentities.preparer,
    companyId,
  );
  const content = {
    ...contractContent,
    issuer: offerContent.issuer,
    serviceTitle: offerContent.serviceTitle,
    frameworks: offerContent.frameworks,
  };
  const model = object(
      (
        await command(
          '/contract-models/consulting-ro/versions',
          { expectedModelRevision: 0, content },
          modelContractIdentities.preparer,
          companyId,
        )
      ).model,
    ),
    modelVersionId = text(object(model.head).id);
  await command(
    `/contract-models/consulting-ro/versions/${modelVersionId}/decision`,
    {
      expectedModelRevision: 1,
      versionNumber: 1,
      outcome: 'APPROVE',
      basis: 'Synthetic full Contract and thirteen-row annex reviewed',
    },
    modelContractIdentities.preparer,
    companyId,
  );
  async function revoke(bundle: string, membershipId = preparerId) {
    const response = await page.request.delete(
      origin + `/${bundle}-assignments/${membershipId}/${companyId}`,
      {
        headers: {
          ...modelContractIdentities.owner,
          'idempotency-key': randomUUID(),
        },
      },
    );
    expect(response.status()).toBe(200);
  }
  return {
    companyId,
    companyName,
    otherCompanyId,
    otherCompanyName,
    subject,
    preparerId,
    readerId,
    opportunityId,
    offerVersionId,
    modelVersionId,
    command,
    read,
    revoke,
  };
}
