import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { test as base, expect, type APIRequestContext } from '@playwright/test';

type Subject = 'workspace-owner' | 'local-demonstration-user';
type Scope = { companyId?: string; subject?: Subject };
type ExpectedTask = { id: string; title: string; dueDate: string };
type OverdueFixture = {
  companyId: string;
  companyName: string;
  projectId: string;
  projectTitle: string;
  clientLabel: string;
  hiddenTitle: string;
  tasks: ExpectedTask[];
};
function headers({ companyId, subject = 'local-demonstration-user' }: Scope) {
  return {
    'x-test-external-provider': 'local-demo',
    'x-test-external-subject': subject,
    'x-test-display-name':
      subject === 'workspace-owner' ? 'Workspace Owner' : 'Ada Ionescu',
    'x-test-email':
      subject === 'workspace-owner' ? 'owner@example.test' : 'ada@example.test',
    ...(companyId ? { 'x-company-context-id': companyId } : {}),
  };
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected a public API object');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Expected public API text');
  return value;
}
async function command(
  request: APIRequestContext,
  path: string,
  value: unknown,
  scope: Scope,
) {
  const response = await request.post(`/api${path}`, {
    headers: { ...headers(scope), 'idempotency-key': randomUUID() },
    data: value,
  });
  expect(response.status()).toBe(201);
  const decoded: unknown = await response.json();
  return object(decoded);
}
async function seed(
  request: APIRequestContext,
  suffix: string,
): Promise<OverdueFixture> {
  const actor = await request.get('/api/access/current-actor', {
    headers: headers({}),
  });
  expect(actor.status()).toBe(200);
  const actorBody: unknown = await actor.json();
  const memberId = text(object(actorBody).workspaceMembershipId);
  async function company(displayName: string) {
    const companyId = text(
      (
        await command(
          request,
          '/companies',
          { displayName },
          { subject: 'workspace-owner' },
        )
      ).id,
    );
    for (const path of [
      '/company-context-assignments',
      '/company-director-client-assignments',
      '/company-project-assignments',
      '/company-task-manager-assignments',
    ])
      await command(
        request,
        path,
        { workspaceMembershipId: memberId, companyId },
        { subject: 'workspace-owner' },
      );
    return companyId;
  }
  const companyName = `Overdue acceptance ${suffix} — Știință / Société / Компания`;
  const companyId = await company(companyName);
  const clientLabel = `Client ${suffix} — Știință / Société / Клиент`;
  const projectTitle = `Preparation ${suffix} — Documentation / Подготовка / Pregătire`;
  const scope = { companyId };
  const clientId = text(
    (await command(request, '/clients', { displayName: clientLabel }, scope))
      .id,
  );
  const projectId = text(
    (
      await command(
        request,
        '/projects',
        { title: projectTitle, clientAccountId: clientId },
        scope,
      )
    ).id,
  );
  const tasks: ExpectedTask[] = [];
  // REST107 independently owns equal-time identifier ties. Distinct browser due
  // dates give an independent exact ordering, without inferring PG microseconds
  // from the public millisecond timestamp projection. All remain overdue.
  for (let index = 0; index < 107; index++) {
    const title = `Task ${String(index + 1).padStart(3, '0')} — Știință / Société / Задача`;
    const dueDate = new Date(Date.UTC(2026, 4, 1 + index))
      .toISOString()
      .slice(0, 10);
    const created = await command(
      request,
      `/projects/${projectId}/tasks`,
      {
        title,
        dueDate,
        assigneeMembershipId: index % 2 === 0 ? null : memberId,
      },
      scope,
    );
    tasks.push({ id: text(created.id), title, dueDate });
  }
  const otherCompany = await company(`Other overdue acceptance ${suffix}`);
  const otherScope = { companyId: otherCompany };
  const otherClient = text(
    (
      await command(
        request,
        '/clients',
        { displayName: `Other Client ${suffix}` },
        otherScope,
      )
    ).id,
  );
  const otherProject = text(
    (
      await command(
        request,
        '/projects',
        { title: `Other Project ${suffix}`, clientAccountId: otherClient },
        otherScope,
      )
    ).id,
  );
  const hiddenTitle = `OTHER Company Task ${suffix}`;
  await command(
    request,
    `/projects/${otherProject}/tasks`,
    { title: hiddenTitle, dueDate: '2026-05-01', assigneeMembershipId: null },
    otherScope,
  );
  return {
    companyId,
    companyName,
    projectId,
    projectTitle,
    clientLabel,
    hiddenTitle,
    tasks,
  };
}

// One real107-row fixture per viewport worker, reused by the four read-only
// locale journeys; never four redundant copies or a synthetic overdue response.
export const test = base.extend<
  Record<never, never>,
  { companyOverdue: OverdueFixture }
>({
  companyOverdue: [
    async ({ playwright }, use, workerInfo) => {
      const clockFile = process.env.ACCEPTANCE_CLOCK_OFFSET_FILE;
      if (!clockFile) throw new Error('Acceptance clock fixture is required');
      const previousOffset = await readFile(clockFile, 'utf8');
      const decoded: unknown = JSON.parse(previousOffset);
      if (typeof decoded !== 'number' || !Number.isSafeInteger(decoded))
        throw new Error('Invalid acceptance clock fixture');
      const request = await playwright.request.newContext({
        baseURL: 'http://127.0.0.1:4173',
      });
      try {
        await writeFile(
          clockFile,
          String(Date.parse('2026-09-26T21:30:00.000Z') - Date.now()),
        );
        const viewport = workerInfo.project.name.endsWith('narrow')
          ? 'narrow'
          : 'desktop';
        const suffix = `${viewport}-worker-${workerInfo.workerIndex}`;
        await use(await seed(request, suffix));
      } finally {
        try {
          await request.dispose();
        } finally {
          await writeFile(clockFile, previousOffset);
        }
      }
    },
    { scope: 'worker', timeout: 30_000 },
  ],
});
