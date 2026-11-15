import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export const accessApiOrigin = 'http://127.0.0.1:4174/api';
function identity(subject: string, displayName: string, email: string) {
  return {
    'x-test-external-provider': 'local-demo',
    'x-test-external-subject': subject,
    'x-test-display-name': displayName,
    'x-test-email': email,
  };
}
export const accessIdentities = {
  administrator: identity(
    'workspace-owner',
    'Workspace Owner',
    'owner@example.test',
  ),
  member: identity(
    'local-demonstration-user',
    'Ada Ionescu',
    'ada@example.test',
  ),
};
export function accessObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected a public Access response object.');
  return Object.fromEntries(Object.entries(value));
}
export function accessText(value: unknown): string {
  if (typeof value !== 'string' || !value)
    throw new Error('Expected a public Access identity.');
  return value;
}

/** Native Workspace administration; no business data or fabricated grants. */
export async function prepareAccessSequenceCase(page: Page, suffix: string) {
  async function command(path: string, body: unknown) {
    const response = await page.request.post(accessApiOrigin + path, {
      headers: {
        ...accessIdentities.administrator,
        'idempotency-key': randomUUID(),
      },
      data: body,
    });
    expect(response.status(), path).toBe(201);
    return accessObject(await response.json());
  }
  async function read(
    path: string,
    companyId?: string,
    role: keyof typeof accessIdentities = 'administrator',
  ) {
    const response = await page.request.get(accessApiOrigin + path, {
      headers: {
        ...accessIdentities[role],
        ...(companyId ? { 'x-company-context-id': companyId } : {}),
      },
    });
    expect(response.status(), path).toBe(200);
    return accessObject(await response.json());
  }
  const companyAName = `Fictional Access A Ș Я é ${suffix}`;
  const companyBName = `Fictional Access B Ș Я é ${suffix}`;
  const companies = {
    a: {
      id: accessText(
        (await command('/companies', { displayName: companyAName })).id,
      ),
      name: companyAName,
    },
    b: {
      id: accessText(
        (await command('/companies', { displayName: companyBName })).id,
      ),
      name: companyBName,
    },
  };
  const membershipId = accessText(
    (await read('/access/current-actor', undefined, 'member'))
      .workspaceMembershipId,
  );
  const administratorId = accessText(
    (await read('/access/current-actor')).workspaceMembershipId,
  );
  async function grant(bundle: string, company: keyof typeof companies) {
    return command(`/${bundle}-assignments`, {
      workspaceMembershipId: membershipId,
      companyId: companies[company].id,
    });
  }
  async function revoke(bundle: string, company: keyof typeof companies) {
    const response = await page.request.delete(
      `${accessApiOrigin}/${bundle}-assignments/${membershipId}/${companies[company].id}`,
      {
        headers: {
          ...accessIdentities.administrator,
          'idempotency-key': randomUUID(),
        },
      },
    );
    expect(response.status(), bundle).toBe(200);
    return accessObject(await response.json());
  }
  return {
    companies,
    membershipId,
    administratorId,
    command,
    read,
    grant,
    revoke,
  };
}
