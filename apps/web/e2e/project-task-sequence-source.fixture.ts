import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { expect } from './ui-chaos.fixture';
import {
  prepareAccessSequenceCase,
  accessApiOrigin,
  accessIdentities,
  accessObject,
  accessText,
} from './access-sequence-source.fixture';

/** Native fixture commands only; browser actions never receive fabricated business state. */
export async function prepareProjectTaskSource(page: Page, suffix: string) {
  const access = await prepareAccessSequenceCase(page, suffix);
  for (const company of ['a', 'b'] satisfies Array<
    keyof typeof access.companies
  >)
    for (const bundle of [
      'company-context',
      'company-director-client',
      'company-project',
      'company-task-manager',
      'company-project-next-action-coordinator',
    ])
      await access.grant(bundle, company);
  const headers = (company: 'a' | 'b') => ({
    ...accessIdentities.member,
    'x-company-context-id': access.companies[company].id,
  });
  async function command(company: 'a' | 'b', path: string, data: unknown) {
    const response = await page.request.post(accessApiOrigin + path, {
      headers: { ...headers(company), 'idempotency-key': randomUUID() },
      data,
    });
    expect([200, 201], path).toContain(response.status());
    return accessObject(await response.json());
  }
  const clientA = accessText(
    (
      await command('a', '/clients', {
        displayName: `Fictional Task Client A ${suffix}`,
      })
    ).id,
  );
  const clientB = accessText(
    (
      await command('b', '/clients', {
        displayName: `Fictional Task Client B ${suffix}`,
      })
    ).id,
  );
  const title = `Fictional sequence Project ${suffix}`;
  const otherTitle = `Independent sequence Project ${suffix}`;
  const companyBTitle = `Other Company sequence Project ${suffix}`;
  const projectId = accessText(
    (await command('a', '/projects', { clientAccountId: clientA, title })).id,
  );
  const otherProjectId = accessText(
    (
      await command('a', '/projects', {
        clientAccountId: clientA,
        title: otherTitle,
      })
    ).id,
  );
  const companyBProjectId = accessText(
    (
      await command('b', '/projects', {
        clientAccountId: clientB,
        title: companyBTitle,
      })
    ).id,
  );
  const taskTitle = `Fictional literal Task ${suffix}`;
  const initialDescription = 'Inițial Я — 001\n  Literal <b>instruction</b> 😀';
  const taskId = accessText(
    (
      await command('a', `/projects/${projectId}/tasks`, {
        title: taskTitle,
        description: initialDescription,
      })
    ).id,
  );
  return {
    ...access,
    projectId,
    otherProjectId,
    companyBProjectId,
    clientA,
    title,
    otherTitle,
    companyBTitle,
    taskTitle,
    taskId,
    initialDescription,
    headers: headers('a'),
    async task() {
      const response = await page.request.get(
        `${accessApiOrigin}/tasks/${taskId}`,
        { headers: headers('a') },
      );
      expect(response.status()).toBe(200);
      return accessObject(accessObject(await response.json()).task);
    },
    async history() {
      const response = await page.request.get(
        `${accessApiOrigin}/tasks/${taskId}/history`,
        { headers: headers('a') },
      );
      expect(response.status()).toBe(200);
      const value = accessObject(await response.json());
      if (!Array.isArray(value.events))
        throw new Error('Expected native Task history');
      return value.events.map(accessObject);
    },
    async nextAction() {
      const response = await page.request.get(
        `${accessApiOrigin}/projects/${projectId}/next-action`,
        { headers: headers('a') },
      );
      expect(response.status()).toBe(200);
      return accessObject(await response.json());
    },
    async externalTaskEdit(expectedVersion: number, description: string) {
      const response = await page.request.patch(
        `${accessApiOrigin}/tasks/${taskId}`,
        {
          headers: { ...headers('a'), 'idempotency-key': randomUUID() },
          data: { expectedVersion, description },
        },
      );
      expect(response.status()).toBe(200);
    },
    async unrelatedTasks() {
      return Promise.all(
        (
          [
            { company: 'a', id: otherProjectId },
            { company: 'b', id: companyBProjectId },
          ] satisfies Array<{ company: 'a' | 'b'; id: string }>
        ).map(async ({ company, id }) => {
          const response = await page.request.get(
            `${accessApiOrigin}/projects/${id}/tasks`,
            { headers: headers(company) },
          );
          expect(response.status()).toBe(200);
          const value = accessObject(await response.json());
          if (!Array.isArray(value.tasks))
            throw new Error('Expected native independent Task inventory');
          return value.tasks;
        }),
      );
    },
  };
}
