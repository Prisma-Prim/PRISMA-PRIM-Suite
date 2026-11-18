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

export const sequenceDirector = {
  'x-test-external-provider': 'local-demo',
  'x-test-external-subject': 'responsible-colleague',
  'x-test-display-name': 'Ion Popa',
  'x-test-email': 'ion@example.test',
};
/** Native fictional commercial records, with a distinct human Director. */
export async function prepareCommercialOwnerSource(
  page: Page,
  suffix: string,
  bundles: readonly string[],
) {
  const access = await prepareAccessSequenceCase(page, suffix);
  await access.grant('company-context', 'b');
  await Promise.all(
    [
      'company-context',
      'company-director-client',
      'company-commercial-intake',
      ...bundles,
    ].map((bundle) => access.grant(bundle, 'a')),
  );
  const directorReply = await page.request.get(
    accessApiOrigin + '/access/current-actor',
    { headers: sequenceDirector },
  );
  expect(directorReply.status()).toBe(200);
  const directorId = accessText(
    accessObject(await directorReply.json()).workspaceMembershipId,
  );
  await Promise.all(
    [
      'company-context',
      'company-commercial-intake',
      'company-profitability-director',
    ].map((bundle) =>
      access.command(`/${bundle}-assignments`, {
        companyId: access.companies.a.id,
        workspaceMembershipId: directorId,
      }),
    ),
  );
  const headers = {
    ...accessIdentities.member,
    'x-company-context-id': access.companies.a.id,
  };
  async function command(
    path: string,
    data: unknown,
    identity = accessIdentities.member,
  ) {
    const response = await page.request.post(accessApiOrigin + path, {
      headers: {
        ...identity,
        'x-company-context-id': access.companies.a.id,
        'idempotency-key': randomUUID(),
      },
      data,
    });
    expect([200, 201], path).toContain(response.status());
    return accessObject(await response.json());
  }
  async function read(path: string) {
    const response = await page.request.get(accessApiOrigin + path, {
      headers,
    });
    expect(response.status(), path).toBe(200);
    return accessObject(await response.json());
  }
  const clientName = `Fictional Client Ș Я ${suffix}`;
  const taxId = `SYNTHETIC-${randomUUID()}`;
  const clientId = accessText(
    (
      await command('/clients', {
        displayName: clientName,
        taxId,
        address: '42 Fictional Street',
      })
    ).id,
  );
  const subject = `Fictional request Ș Я ${suffix}`;
  const request = await command('/commercial-intake/requests', {
    clientAccountId: clientId,
    subject,
    originalText: 'Prepared fictional owner qualification',
    opportunity: { title: subject, nextAction: 'Human commercial review' },
  });
  const opportunityId = accessText(accessObject(request.initialOpportunity).id);
  return {
    ...access,
    headers,
    directorId,
    clientId,
    clientName,
    taxId,
    subject,
    requestId: accessText(request.id),
    opportunityId,
    command,
    read,
  };
}
