import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { expect } from './ui-chaos.fixture';
import {
  prepareAccessSequenceCase,
  accessIdentities,
  accessApiOrigin,
  accessObject,
  accessText,
} from './access-sequence-source.fixture';
export async function preparePricingOwnerSource(page: Page, suffix: string) {
  const access = await prepareAccessSequenceCase(page, suffix);
  await access.grant('company-context', 'b');
  await Promise.all(
    [
      'company-context',
      'company-director-client',
      'company-commercial-intake',
      'company-service-catalogue',
      'company-pricing-configuration',
      'company-pricing-user',
    ].map((bundle) => access.grant(bundle, 'a')),
  );
  const headers = {
    ...accessIdentities.member,
    'x-company-context-id': access.companies.a.id,
  };
  async function command(path: string, data: unknown) {
    const reply = await page.request.post(accessApiOrigin + path, {
      headers: { ...headers, 'idempotency-key': randomUUID() },
      data,
    });
    expect(reply.status(), path).toBe(201);
    return accessObject(await reply.json());
  }
  async function read(path: string) {
    const reply = await page.request.get(accessApiOrigin + path, { headers });
    expect(reply.status(), path).toBe(200);
    return accessObject(await reply.json());
  }
  const subject = `Fictional monetary request Ș Я ${suffix}`;
  const request = await command('/commercial-intake/requests', {
    subject,
    originalText: 'Prepared fictional monetary proof',
    opportunity: { title: subject, nextAction: 'Human illustrative pricing' },
  });
  const opportunityId = accessText(accessObject(request.initialOpportunity).id);
  const offeringName = `Fictional monetary service ${suffix}`;
  const definition = await command(
    '/commercial-catalogue/service-definitions',
    {
      code: 'SEQ-' + randomUUID().slice(0, 8).toUpperCase(),
      name: offeringName,
    },
  );
  const offering = await command('/commercial-catalogue/offerings', {
    serviceDefinitionId: accessText(accessObject(definition.definition).id),
  });
  const offeringId = accessText(accessObject(offering.offering).id);
  const effectiveFrom = new Date(Date.now() + 1_000).toISOString();
  await command('/pricing-configuration/rule-versions', {
    label: 'Prepared literal Rule Ș Я',
    effectiveFrom,
    expectedActiveVersionNumber: null,
  });
  await command(
    `/pricing-configuration/offerings/${offeringId}/tariff-versions`,
    {
      unit: 'fictional-unit',
      unitAmount: '100.01',
      currency: 'EUR',
      taxRatePercent: '20',
      taxLabel: 'Fictional tax',
      effectiveFrom,
      expectedActiveVersionNumber: null,
    },
  );
  await expect
    .poll(
      async () =>
        (await read('/pricing-configuration/rule-scope')).current !== null,
    )
    .toBe(true);
  await expect
    .poll(
      async () =>
        (
          await read(
            `/pricing-configuration/offerings/${offeringId}/tariff-scope`,
          )
        ).current !== null,
    )
    .toBe(true);
  return {
    ...access,
    headers,
    opportunityId,
    requestId: accessText(request.id),
    subject,
    offeringId,
    offeringName,
    command,
    read,
  };
}
