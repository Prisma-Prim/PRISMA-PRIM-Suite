import { randomUUID } from 'node:crypto';
import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const apiOrigin = 'http://127.0.0.1:4174';
export const owner = {
  'x-test-external-provider': 'local-demo',
  'x-test-external-subject': 'workspace-owner',
  'x-test-display-name': 'Workspace Owner',
  'x-test-email': 'owner@example.test',
};
export const ada = {
  'x-test-external-provider': 'local-demo',
  'x-test-external-subject': 'local-demonstration-user',
  'x-test-display-name': 'Ada Ionescu',
  'x-test-email': 'ada@example.test',
};

export async function navigate(
  page: Page,
  label: string,
  narrow: boolean,
): Promise<void> {
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name: label, exact: true })
    .click();
}
export async function createCompany(
  request: APIRequestContext,
  displayName: string,
): Promise<{ id: string }> {
  const response = await request.post(`${apiOrigin}/api/companies`, {
    headers: { ...owner, 'idempotency-key': randomUUID() },
    data: { displayName },
  });
  expect(response.status()).toBe(201);
  const body: unknown = await response.json();
  return { id: string(object(body).id) };
}
export async function grant({
  request,
  path,
  workspaceMembershipId,
  companyId,
}: {
  request: APIRequestContext;
  path: string;
  workspaceMembershipId: string;
  companyId: string;
}): Promise<void> {
  const response = await request.post(`${apiOrigin}/api/${path}`, {
    headers: { ...owner, 'idempotency-key': randomUUID() },
    data: { workspaceMembershipId, companyId },
  });
  expect(response.status()).toBe(201);
}
export function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing synthetic acceptance fixture ${name}.`);
  return value;
}
export function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Expected a synthetic object.');
  return Object.fromEntries(Object.entries(value));
}
export function string(value: unknown): string {
  if (typeof value !== 'string')
    throw new Error('Expected a synthetic string.');
  return value;
}
