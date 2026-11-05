import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { expect, type Page } from '@playwright/test';
import { syntheticContent as offerContent } from '../src/offer-model/offer-model.fixture';
const origin = 'http://127.0.0.1:4174/api';

/** Browser-only probes forward native operations unchanged and retain values in test memory. */
export function installOfferMessagePrivacyProbe() {
  const events: string[] = [];
  Object.defineProperty(window, '__offerMessagePrivacyEvents', {
    value: events,
    configurable: true,
  });
  const record = (value: unknown) => events.push(JSON.stringify(value) ?? '');
  const setItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key: string, value: string) {
    record({ kind: 'storage', key, value });
    return setItem.call(this, key, value);
  };
  for (const method of [
    'pushState',
    'replaceState',
  ] satisfies (keyof History)[]) {
    const native = History.prototype[method];
    History.prototype[method] = function (
      data: unknown,
      unused: string,
      url?: string | URL | null,
    ) {
      record({ kind: method, data, url });
      return native.call(this, data, unused, url);
    };
  }
  for (const method of ['put', 'add'] satisfies (keyof IDBObjectStore)[]) {
    const native = IDBObjectStore.prototype[method];
    IDBObjectStore.prototype[method] = function (
      value: unknown,
      key?: IDBValidKey,
    ) {
      record({ kind: 'indexedDB.' + method, value, key });
      return native.call(this, value, key);
    };
  }
  const put = Cache.prototype.put;
  Cache.prototype.put = function (
    request: RequestInfo | URL,
    response: Response,
  ) {
    void response
      .clone()
      .text()
      .then((value) => record({ kind: 'cache', value }));
    return put.call(this, request, response);
  };
}
function headers(subject: string, name: string) {
  return {
    'x-test-external-provider': 'local-demo',
    'x-test-external-subject': subject,
    'x-test-display-name': name,
    'x-test-email': subject + '@example.test',
  };
}
export const offerMessageIdentities = {
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
export async function prepareOfferMessageCase(page: Page, suffix: string) {
  async function command(
    path: string,
    body: unknown,
    identity = offerMessageIdentities.owner,
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
    identity = offerMessageIdentities.preparer,
  ) {
    const response = await page.request.get(origin + path, {
      headers: { ...identity, 'x-company-context-id': companyId },
    });
    expect(response.status(), path).toBe(200);
    return object(await response.json());
  }
  async function member(identity: typeof offerMessageIdentities.owner) {
    const response = await page.request.get(origin + '/access/current-actor', {
      headers: identity,
    });
    expect(response.status()).toBe(200);
    return text(object(await response.json()).workspaceMembershipId);
  }
  const companyName = 'Offer Message DEMO ' + suffix,
    subject = 'Offer Message Request DEMO ' + suffix;
  const companyId = text(
    (await command('/companies', { displayName: companyName })).id,
  );
  const otherCompanyName = 'Other Offer Message DEMO ' + suffix,
    otherCompanyId = text(
      (await command('/companies', { displayName: otherCompanyName })).id,
    );
  const preparerId = await member(offerMessageIdentities.preparer),
    directorId = await member(offerMessageIdentities.director),
    readerId = await member(offerMessageIdentities.reader);
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
  await command('/company-context-assignments', {
    companyId: otherCompanyId,
    workspaceMembershipId: preparerId,
  });
  for (const bundle of [
    'company-director-client',
    'company-offer-preparer',
    'company-profitability-contributor',
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
  const clientId = text(
    (
      await command(
        '/clients',
        {
          displayName: 'Offer Message Client DEMO ' + suffix,
          taxId: 'SYNTHETIC-OFFER-MESSAGE-' + suffix,
          address: 'Synthetic case address',
        },
        offerMessageIdentities.preparer,
        companyId,
      )
    ).id,
  );
  const request = await command(
      '/commercial-intake/requests',
      {
        clientAccountId: clientId,
        subject,
        originalText: 'Synthetic full Offer message rehearsal.',
        opportunity: {
          title: subject,
          nextAction: 'Prepare the corresponding complete Contract and annex',
        },
      },
      offerMessageIdentities.preparer,
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
    offerMessageIdentities.preparer,
    companyId,
  );
  await command(
    `/opportunities/${opportunityId}/profitability-estimates/versions/${text(estimate.id)}/decision`,
    { expectedVersionNumber: 1, expectedDecision: null, code: 'APPROVE' },
    offerMessageIdentities.director,
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
          offerMessageIdentities.preparer,
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
    offerMessageIdentities.preparer,
    companyId,
  );
  const intent = {
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
  };
  const offer = await command(
    `/offers/opportunities/${opportunityId}/from-approved-model`,
    intent,
    offerMessageIdentities.preparer,
    companyId,
  );
  const historicalVersionId = text(object(offer.version).id);
  const head = await command(
    `/offers/opportunities/${opportunityId}/versions/from-approved-model`,
    {
      ...intent,
      expectedOfferRevision: 1,
      commercialConditions: 'Synthetic second version',
    },
    offerMessageIdentities.preparer,
    companyId,
  );
  const offerVersionId = text(object(head.version).id);
  async function revoke(bundle: string, membershipId = preparerId) {
    const response = await page.request.delete(
      origin + `/${bundle}-assignments/${membershipId}/${companyId}`,
      {
        headers: {
          ...offerMessageIdentities.owner,
          'idempotency-key': randomUUID(),
        },
      },
    );
    expect(response.status()).toBe(200);
  }
  // Same public pricing/catalogue setup as the native illustrative-PDF proof;
  // this joint fixture creates no Contract and removes setup-only pricing roles.
  async function illustrativeSource() {
    const bundles = [
      'company-service-catalogue',
      'company-pricing-configuration',
      'company-pricing-user',
    ];
    for (const bundle of bundles)
      await command('/' + bundle + '-assignments', {
        companyId,
        workspaceMembershipId: preparerId,
      });
    const make = (path: string, body: unknown) =>
      command(path, body, offerMessageIdentities.preparer, companyId);
    const subject = 'Illustrative English message DEMO ' + suffix;
    const request = await make('/commercial-intake/requests', {
      clientAccountId: clientId,
      subject,
      originalText: 'Synthetic native English Offer source.',
      opportunity: {
        title: subject,
        nextAction: 'Read and prepare the exact illustrative copy',
      },
    });
    const opportunityId = text(object(request.initialOpportunity).id);
    const clockFile = process.env.ACCEPTANCE_CLOCK_OFFSET_FILE;
    if (!clockFile) throw new Error('Synthetic acceptance clock required.');
    const offset: unknown = JSON.parse(await readFile(clockFile, 'utf8'));
    if (typeof offset !== 'number' || !Number.isSafeInteger(offset))
      throw new Error('Invalid synthetic clock.');
    const effectiveFrom = new Date(Date.now() + offset + 60_000).toISOString();
    await make('/pricing-configuration/rule-versions', {
      label: 'Synthetic message illustrative rule',
      effectiveFrom,
      expectedActiveVersionNumber: null,
    });
    const definition = object(
      (
        await make('/commercial-catalogue/service-definitions', {
          code: 'MESSAGE-1043-ILL',
          name: 'Synthetic English service Șț Русский Français',
          description: null,
        })
      ).definition,
    );
    const offering = object(
      (
        await make('/commercial-catalogue/offerings', {
          serviceDefinitionId: definition.id,
          commercialLabel: null,
        })
      ).offering,
    );
    await make(
      `/pricing-configuration/offerings/${text(offering.id)}/tariff-versions`,
      {
        unit: 'day',
        unitAmount: '100.00',
        currency: 'EUR',
        taxRatePercent: '20.00',
        taxLabel: 'Synthetic declared tax',
        effectiveFrom,
        expectedActiveVersionNumber: null,
      },
    );
    await writeFile(clockFile, JSON.stringify(offset + 120_000));
    try {
      const snapshot = await make(
        `/pricing/opportunities/${opportunityId}/snapshots`,
        {
          pricingRuleVersionNumber: 1,
          lines: [
            { offeringId: offering.id, tariffVersionNumber: 1, quantity: '1' },
          ],
        },
      );
      const path = `/offers/opportunities/${opportunityId}`;
      const intent = {
        pricingSnapshotId: snapshot.id,
        recipient: { kind: 'PRIMARY' },
        scopeNote: 'Synthetic literal English scope\nNo sending is recorded.',
        commercialConditions: 'Non-official illustrative conditions',
      };
      const first = await make(path, intent);
      const head = await make(path + '/versions', {
        ...intent,
        expectedOfferRevision: 1,
        commercialConditions: 'Synthetic immutable English successor',
      });
      return {
        subject,
        opportunityId,
        offer: head,
        offerVersionId: text(object(head.version).id),
        historicalVersionId: text(object(first.version).id),
      };
    } finally {
      await writeFile(clockFile, JSON.stringify(offset));
      for (const bundle of bundles) await revoke(bundle);
    }
  }
  const illustrative = await illustrativeSource();
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
    historicalVersionId,
    offer: head,
    illustrative,
    command,
    read,
    revoke,
  };
}
