import { randomUUID } from 'node:crypto';
import { readFile, writeFile, rename, rm } from 'node:fs/promises';
import { expect, type Page } from '@playwright/test';
const origin = 'http://127.0.0.1:4174/api';
function identity(subject: string) {
  return {
    'x-test-external-provider': 'local-demo',
    'x-test-external-subject': subject,
    'x-test-display-name': subject,
    'x-test-email': subject + '@example.test',
  };
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected public response');
  return Object.fromEntries(Object.entries(value));
}
export function text(value: unknown): string {
  if (typeof value !== 'string' || !value)
    throw new Error('Expected public identity');
  return value;
}
export async function prepareOfferDecisionQueue(page: Page, suffix: string) {
  const clockOffset = await readQueueClockOffset();
  const effectiveFrom = new Date(
    Date.now() + clockOffset + 60_000,
  ).toISOString();
  const identities = {
    owner: identity('workspace-owner'),
    preparer: identity('responsible-colleague'),
    approver: identity('local-demonstration-user'),
  };
  async function command({
    path,
    body,
    who = 'owner',
    companyId,
  }: {
    path: string;
    body: unknown;
    who?: keyof typeof identities;
    companyId?: string;
  }) {
    const response = await page.request.post(origin + path, {
      headers: {
        ...identities[who],
        ...(companyId ? { 'x-company-context-id': companyId } : {}),
        'idempotency-key': randomUUID(),
      },
      data: body,
    });
    expect(response.status(), path).toBe(201);
    return object(await response.json());
  }
  async function membership(who: keyof typeof identities) {
    const response = await page.request.get(origin + '/access/current-actor', {
      headers: identities[who],
    });
    expect(response.status()).toBe(200);
    return text(object(await response.json()).workspaceMembershipId);
  }
  const companyName = 'Pending Offer queue DEMO ' + suffix;
  const companyId = text(
    (await command({ path: '/companies', body: { displayName: companyName } }))
      .id,
  );
  const approverId = await membership('approver'),
    preparerId = await membership('preparer');
  for (const member of [preparerId, approverId])
    for (const bundle of ['company-context', 'company-commercial-intake'])
      await command({
        path: `/${bundle}-assignments`,
        body: { companyId, workspaceMembershipId: member },
      });
  for (const bundle of [
    'company-director-client',
    'company-service-catalogue',
    'company-pricing-configuration',
    'company-pricing-user',
    'company-offer-preparer',
  ])
    await command({
      path: `/${bundle}-assignments`,
      body: { companyId, workspaceMembershipId: preparerId },
    });
  await command({
    path: '/company-offer-approver-assignments',
    body: { companyId, workspaceMembershipId: approverId },
  });
  const prepare = (path: string, body: unknown) =>
    command({ path, body, who: 'preparer', companyId });
  const clientId = text(
    (
      await prepare('/clients', {
        displayName: 'Pending Offer Client DEMO ' + suffix,
        taxId: 'SYNTHETIC-QUEUE-' + suffix,
        address: 'Synthetic queue address',
      })
    ).id,
  );
  const rule = object(
    (
      await prepare('/pricing-configuration/rule-versions', {
        label: 'Synthetic queue rule',
        effectiveFrom,
        expectedActiveVersionNumber: null,
      })
    ).version,
  );
  const definition = object(
    (
      await prepare('/commercial-catalogue/service-definitions', {
        code: 'QUEUE-OFFER-' + suffix.toUpperCase(),
        name: 'Synthetic queue consulting ' + suffix,
        description: null,
      })
    ).definition,
  );
  const offering = object(
    (
      await prepare('/commercial-catalogue/offerings', {
        serviceDefinitionId: definition.id,
        commercialLabel: null,
      })
    ).offering,
  );
  const tariff = object(
    (
      await prepare(
        `/pricing-configuration/offerings/${offering.id}/tariff-versions`,
        {
          unit: 'synthetic-unit',
          unitAmount: '100.0000',
          currency: 'EUR',
          taxRatePercent: '0.00',
          taxLabel: 'Illustrative tax',
          effectiveFrom,
          expectedActiveVersionNumber: null,
        },
      )
    ).version,
  );
  await writeQueueClockOffset(clockOffset + 120_000);
  const versions: {
    versionId: string;
    offerId: string;
    opportunityId: string;
    title: string;
    reference: number;
  }[] = [];
  for (let n = 1; n <= 27; n++) {
    const title = `Pending Offer DEMO ${suffix} ${n}`;
    const opportunity = object(
      (
        await prepare('/commercial-intake/requests', {
          clientAccountId: clientId,
          subject: title,
          originalText: 'Synthetic queue acceptance; no real Client data.',
          opportunity: { title, nextAction: 'Review the exact Offer' },
        })
      ).initialOpportunity,
    );
    const opportunityId = text(opportunity.id);
    const snapshot = await prepare(
      `/pricing/opportunities/${opportunityId}/snapshots`,
      {
        pricingRuleVersionNumber: rule.versionNumber,
        lines: [
          {
            offeringId: offering.id,
            tariffVersionNumber: tariff.versionNumber,
            quantity: '1',
          },
        ],
      },
    );
    const offer = await prepare(`/offers/opportunities/${opportunityId}`, {
      pricingSnapshotId: snapshot.id,
      recipient: { kind: 'PRIMARY' },
      validityDays: 30,
      scopeNote: 'Synthetic consulting scope',
      commercialConditions: null,
    });
    if (typeof offer.illustrativeReference !== 'number')
      throw new Error('Missing illustrative reference');
    versions.push({
      versionId: text(object(offer.version).id),
      offerId: text(offer.id),
      opportunityId,
      title,
      reference: offer.illustrativeReference,
    });
  }
  return {
    origin,
    companyName,
    companyId,
    clientId,
    approverId,
    identities,
    versions,
  };
}

function clockFile() {
  const path = process.env.ACCEPTANCE_CLOCK_OFFSET_FILE;
  if (!path) throw new Error('Missing registered synthetic acceptance clock');
  return path;
}
export async function readQueueClockOffset() {
  const value: unknown = JSON.parse(await readFile(clockFile(), 'utf8'));
  if (typeof value !== 'number' || !Number.isSafeInteger(value))
    throw new Error('Invalid synthetic clock');
  return value;
}
export async function writeQueueClockOffset(value: number) {
  const path = clockFile(),
    temporaryPath = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, JSON.stringify(value));
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}
