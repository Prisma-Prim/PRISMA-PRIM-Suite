import { afterEach, describe, expect, it, vi } from 'vitest';
import { runDemonstrationScenario } from './demonstration-runner.js';
import {
  DEMONSTRATION_SCENARIO,
  type DemonstrationScenario,
} from './demonstration-scenario.js';

const ORIGIN = 'http://127.0.0.1:4090';
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000409';
const COMPANY_ID = '11111111-1111-4111-8111-111111111111';
const MEMBERSHIP_ID = '22222222-2222-4222-8222-222222222222';
const NOW = () => new Date('2026-09-26T12:00:00.000Z');

interface RequestTrace {
  readonly method: string;
  readonly path: string;
}

afterEach(() => vi.unstubAllGlobals());

describe('demonstration runner refusal boundaries', () => {
  it('preserves the pre-admission synthetic-profile refusal', async () => {
    const requests: RequestTrace[] = [];
    installFetch(
      [
        actor('Demonstration Operator', 'operator@example.test'),
        [],
        { id: COMPANY_ID, displayName: 'PRISMA-PRIM' },
        { members: [], companies: [], assignments: [] },
        new Response(
          JSON.stringify({
            statusCode: 403,
            message: 'persona-not-synthetic',
            error: 'Forbidden',
          }),
          { status: 403, headers: { 'content-type': 'application/json' } },
        ),
      ],
      requests,
    );

    const result = await runDemonstrationScenario({
      origin: ORIGIN,
      headersFor,
      now: NOW,
      scenario: scenario('company.prisma-prim', 'persona.ana'),
    });

    expect(result).toMatchObject({
      kind: 'stopped',
      stop: {
        step: 'persona.ana',
        reason: 'persona-not-synthetic',
        status: 403,
      },
    });
    expect(requests.filter((request) => request.method !== 'GET')).toEqual([
      { method: 'POST', path: '/api/companies' },
    ]);
  });

  it('stops when a persisted persona no longer has the DEMO marker', async () => {
    const requests: RequestTrace[] = [];
    installFetch(
      [
        actor('Demonstration Operator', 'operator@example.test'),
        [],
        { id: COMPANY_ID, displayName: 'PRISMA-PRIM' },
        { members: [], companies: [], assignments: [] },
        actor('Ana Popescu', 'ana.demo@example.test', MEMBERSHIP_ID),
      ],
      requests,
    );

    const result = await runDemonstrationScenario({
      origin: ORIGIN,
      headersFor,
      now: NOW,
      scenario: scenario('company.prisma-prim', 'persona.ana'),
    });

    expect(result).toEqual({
      kind: 'stopped',
      entries: [
        expect.objectContaining({
          step: 'company.prisma-prim',
          outcome: 'created',
        }),
      ],
      stop: {
        scenario: 'demo-v1',
        result: 'stopped',
        step: 'persona.ana',
        reason: 'persona-not-synthetic',
        status: null,
      },
    });
    expect(requests.filter((request) => request.method !== 'GET')).toEqual([
      { method: 'POST', path: '/api/companies' },
    ]);
  });

  it('stops before a grant when the administration projection exposes revoked history', async () => {
    const requests: RequestTrace[] = [];
    installFetch(
      [
        actor('Demonstration Operator', 'operator@example.test'),
        [],
        { id: COMPANY_ID, displayName: 'PRISMA-PRIM' },
        { members: [], companies: [], assignments: [] },
        actor('Ana DEMO', 'ana.demo@example.test', MEMBERSHIP_ID),
        {
          members: [],
          companies: [],
          assignments: [
            {
              id: '33333333-3333-4333-8333-333333333333',
              workspaceMembershipId: MEMBERSHIP_ID,
              companyId: COMPANY_ID,
              bundle: 'Company Context Access',
              permissionSetVersion: null,
              active: false,
            },
          ],
        },
      ],
      requests,
    );

    const result = await runDemonstrationScenario({
      origin: ORIGIN,
      headersFor,
      now: NOW,
      scenario: scenario(
        'company.prisma-prim',
        'persona.ana',
        'grant.ana.context',
      ),
    });

    expect(result).toMatchObject({
      kind: 'stopped',
      stop: {
        step: 'grant.ana.context',
        reason: 'grant-revoked',
        status: null,
      },
    });
    expect(requests.filter((request) => request.method !== 'GET')).toEqual([
      { method: 'POST', path: '/api/companies' },
    ]);
  });
});

function actor(
  displayName: string,
  email: string,
  workspaceMembershipId = '44444444-4444-4444-8444-444444444444',
): Record<string, unknown> {
  return {
    workspaceId: WORKSPACE_ID,
    workspaceName: 'PRISMA DEMO Workspace',
    workspaceMembershipId,
    displayName,
    email,
  };
}

function headersFor(): Readonly<Record<string, string>> {
  return { authorization: 'Bearer demonstration-test' };
}

function scenario(...keys: readonly string[]): DemonstrationScenario {
  const ana = DEMONSTRATION_SCENARIO.personas.find(
    (persona) => persona.key === 'ana',
  );
  if (!ana) throw new Error('The released Ana persona is missing.');
  return {
    ...DEMONSTRATION_SCENARIO,
    personas: [ana],
    steps: keys.map((key) => {
      const step = DEMONSTRATION_SCENARIO.steps.find(
        (candidate) => candidate.key === key,
      );
      if (!step) throw new Error(`The released ${key} step is missing.`);
      return step;
    }),
  };
}

function installFetch(bodies: unknown[], requests: RequestTrace[]): void {
  vi.stubGlobal(
    'fetch',
    async (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      requests.push({
        method: init?.method ?? 'GET',
        path: new URL(url).pathname,
      });
      const body = bodies.shift();
      if (body === undefined) throw new Error(`Unexpected request ${url}.`);
      if (body instanceof Response) return body;
      return new Response(JSON.stringify(body), {
        status: init?.method === 'POST' ? 201 : 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  );
}
