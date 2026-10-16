import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  createIsolatedPostgresTestDatabase,
  type IsolatedPostgresTestDatabase,
} from '../database/isolated-postgres-test-database.js';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';
import {
  runDemonstrationScenario,
  type DemonstrationPrincipal,
  type DemonstrationRunResult,
} from './demonstration-runner.js';
import {
  DEMONSTRATION_PERSONAS,
  DEMONSTRATION_PERSONA_PROVIDER,
  DEMONSTRATION_BASE_SCENARIO as DEMONSTRATION_SCENARIO,
  DEMONSTRATION_PRICING_SCENARIO as PRICING_SCENARIO,
  DEMONSTRATION_SCENARIO as COMMERCIAL_SCENARIO,
  demonstrationPersonaAdmissions,
  type DemonstrationPersonaKey,
  type DemonstrationScenario,
} from './demonstration-scenario.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000411';
const WORKSPACE_NAME = 'PRISMA DEMO Workspace';
const OWNER_IDENTITY = {
  provider: 'deterministic-test',
  subject: 'demonstration-owner',
  displayName: 'Demonstration Operator',
  email: 'operator@example.test',
};
const OWNER: DemonstrationPrincipal = { kind: 'owner' };
let runInstant = new Date('2026-09-26T12:00:00.000Z');
const RUN_CLOCK = { now: () => new Date(runInstant) };
const EVENT_TABLES = {
  activity_log_events: 'actor_workspace_membership_id',
  commercial_catalogue_events: 'actor_workspace_membership_id',
  commercial_intake_events: 'actor_workspace_membership_id',
  document_project_events: 'actor_membership_id',
  document_registration_events: 'actor_membership_id',
  pricing_configuration_events: 'actor_workspace_membership_id',
  project_creation_events: 'actor_workspace_membership_id',
  project_responsibility_events: 'actor_membership_id',
  task_events: 'actor_membership_id',
} as const;

function persona(key: DemonstrationPersonaKey): DemonstrationPrincipal {
  const definition = DEMONSTRATION_PERSONAS.find(
    (candidate) => candidate.key === key,
  );
  if (!definition) throw new Error(`Unknown persona ${key}.`);
  return { kind: 'persona', persona: definition };
}

function headersFor(principal: DemonstrationPrincipal): Record<string, string> {
  const identity =
    principal.kind === 'owner'
      ? OWNER_IDENTITY
      : {
          provider: DEMONSTRATION_PERSONA_PROVIDER,
          subject: principal.persona.subject,
          displayName: principal.persona.displayName,
          email: principal.persona.email,
        };
  return {
    'x-test-external-provider': identity.provider,
    'x-test-external-subject': identity.subject,
    'x-test-display-name': identity.displayName,
    'x-test-email': identity.email,
  };
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`Expected an object: ${JSON.stringify(value)}`);
  return Object.fromEntries(Object.entries(value));
}

function objects(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value))
    throw new Error(`Expected an array: ${JSON.stringify(value)}`);
  return value.map(object);
}

function text(value: unknown): string {
  if (typeof value !== 'string')
    throw new Error(`Expected text: ${JSON.stringify(value)}`);
  return value;
}

function recordIds(result: DemonstrationRunResult): Map<string, string> {
  return new Map(result.entries.map((entry) => [entry.step, entry.recordId]));
}

function id(ids: Map<string, string>, step: string): string {
  const value = ids.get(step);
  if (!value) throw new Error(`Step ${step} has no record.`);
  return value;
}

withPostgres('demonstration runner through the public REST API', () => {
  let database: IsolatedPostgresTestDatabase;
  let harness: PostgresRestTestHarness;
  let origin: string;
  let pool: Pool;

  async function api(
    principal: DemonstrationPrincipal,
    path: string,
    init: {
      method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
      companyId?: string;
      body?: unknown;
      key?: string;
    } = {},
  ): Promise<{ status: number; body: unknown }> {
    const response = await fetch(`${origin}/api${path}`, {
      method: init.method ?? 'GET',
      headers: {
        ...headersFor(principal),
        ...(init.companyId ? { 'x-company-context-id': init.companyId } : {}),
        ...(init.key ? { 'idempotency-key': init.key } : {}),
        ...(init.body === undefined
          ? {}
          : { 'content-type': 'application/json' }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const raw = await response.text();
    const body: unknown = raw ? JSON.parse(raw) : null;
    return { status: response.status, body };
  }

  async function read(
    principal: DemonstrationPrincipal,
    path: string,
    companyId?: string,
  ): Promise<unknown> {
    const response = await api(principal, path, { companyId });
    expect(response.status, path).toBe(200);
    return response.body;
  }

  function run(
    scenario: DemonstrationScenario = DEMONSTRATION_SCENARIO,
  ): Promise<DemonstrationRunResult> {
    return runDemonstrationScenario({
      origin,
      headersFor,
      scenario,
      now: RUN_CLOCK.now,
      beginPricing: () => {
        runInstant = new Date(
          Math.floor(runInstant.getTime() / 1000) * 1000 + 1000,
        );
      },
    });
  }

  function prefix(untilStep: string, inclusive = true): DemonstrationScenario {
    const index = DEMONSTRATION_SCENARIO.steps.findIndex(
      (step) => step.key === untilStep,
    );
    if (index < 0) throw new Error(`Unknown step ${untilStep}.`);
    return {
      ...DEMONSTRATION_SCENARIO,
      steps: DEMONSTRATION_SCENARIO.steps.slice(
        0,
        inclusive ? index + 1 : index,
      ),
    };
  }

  function commercialPrefix(untilStep: string): DemonstrationScenario {
    const index = COMMERCIAL_SCENARIO.steps.findIndex(
      (step) => step.key === untilStep,
    );
    if (index < 0) throw new Error(`Unknown commercial step ${untilStep}.`);
    return {
      ...COMMERCIAL_SCENARIO,
      steps: COMMERCIAL_SCENARIO.steps.slice(0, index),
    };
  }

  async function commercialCase(result: DemonstrationRunResult) {
    expect(
      result.kind,
      result.kind === 'stopped' ? JSON.stringify(result.stop) : '',
    ).toBe('converged');
    const ids = recordIds(result);
    const companyId = id(ids, 'company.prisma-prim');
    const request = object(
      await read(
        persona('ana'),
        `/commercial-intake/requests/${id(ids, 'request.grup-demo-iso14001')}`,
        companyId,
      ),
    );
    return {
      ids,
      companyId,
      opportunityId: text(object(request.initialOpportunity).id),
    };
  }

  /** Row counts of every application and migration table. */
  async function tableCounts(): Promise<Record<string, number>> {
    const tables = await pool.query<{ schema: string; name: string }>(
      `SELECT table_schema AS schema, table_name AS name
         FROM information_schema.tables
        WHERE table_schema IN ('public', 'drizzle') AND table_type = 'BASE TABLE'
        ORDER BY table_schema, table_name`,
    );
    const counts: Record<string, number> = {};
    for (const table of tables.rows) {
      const result = await pool.query<{ count: number }>(
        `SELECT count(*)::integer AS count FROM "${table.schema}"."${table.name}"`,
      );
      counts[`${table.schema}.${table.name}`] = result.rows[0]?.count ?? -1;
    }
    return counts;
  }

  /** The seeded business state as the owner and each persona read it. */
  async function readModel(
    result: DemonstrationRunResult,
    {
      normalizeConvergenceOrder = false,
    }: { normalizeConvergenceOrder?: boolean } = {},
  ) {
    const ids = recordIds(result);
    const memberKeys = new Map(
      DEMONSTRATION_PERSONAS.map((definition) => [
        id(ids, `persona.${definition.key}`),
        definition.key,
      ]),
    );
    const memberKey = (value: unknown) =>
      value === null
        ? null
        : memberKeys.get(text(object(value).workspaceMembershipId));
    const prisma = id(ids, 'company.prisma-prim');
    const bic = id(ids, 'company.bic');
    const companyNames = new Map([
      [prisma, 'PRISMA-PRIM'],
      [bic, 'BIC'],
      [id(ids, 'company.ecg'), 'ECG'],
    ]);
    const administration = object(
      await read(OWNER, '/company-context-assignments/administration'),
    );
    const scope = async (key: DemonstrationPersonaKey, companyId: string) => {
      const principal = persona(key);
      const projects = objects(await read(principal, '/projects', companyId));
      const projectModels = [];
      for (const project of projects) {
        const projectId = text(project.id);
        const tasks = objects(
          object(
            await read(principal, `/projects/${projectId}/tasks`, companyId),
          ).tasks,
        ).map((task) => ({
          title: text(task.title),
          status: task.status,
          priority: task.priority,
          dueDate: task.dueDate,
          version: task.version,
          assignee: memberKey(task.assignee),
        }));
        if (normalizeConvergenceOrder)
          tasks.sort((left, right) => left.title.localeCompare(right.title));
        const documents = objects(
          object(
            await read(
              principal,
              `/projects/${projectId}/documents`,
              companyId,
            ),
          ).documents,
        ).map((entry) => object(entry.document).title);
        const responsible = object(
          await read(
            principal,
            `/projects/${projectId}/responsible`,
            companyId,
          ),
        );
        projectModels.push({
          title: project.title,
          client: project.clientDisplayName,
          responsible: memberKey(responsible.responsible),
          tasks,
          documents,
        });
      }
      const requests = [];
      for (const item of objects(
        object(
          await read(
            principal,
            '/commercial-intake/requests?limit=50',
            companyId,
          ),
        ).items,
      )) {
        const detail = object(
          await read(
            principal,
            `/commercial-intake/requests/${text(item.id)}`,
            companyId,
          ),
        );
        const opportunity = object(detail.initialOpportunity);
        requests.push({
          subject: text(detail.subject),
          client:
            detail.clientReference === undefined
              ? null
              : object(detail.clientReference).displayName,
          opportunity: [
            opportunity.title,
            opportunity.nextAction,
            opportunity.version,
          ],
        });
      }
      const offerings = objects(
        object(
          await read(
            principal,
            '/commercial-catalogue/offerings?limit=50',
            companyId,
          ),
        ).items,
      ).map(
        (offering) =>
          [
            text(object(offering.serviceDefinition).code),
            offering.provisional,
          ] satisfies [string, unknown],
      );
      if (normalizeConvergenceOrder)
        offerings.sort((left, right) => left[0].localeCompare(right[0]));
      const rules = object(
        await read(principal, '/pricing-configuration/rule-scope', companyId),
      );
      return {
        clients: objects(await read(principal, '/clients', companyId)).map(
          (client) => client.displayName,
        ),
        projects: projectModels,
        // Fixed capture times leave UUIDs as list tie-breakers across fresh runs.
        // Convergence compares business content, not regenerated identifier order.
        requests: requests.sort((left, right) =>
          left.subject.localeCompare(right.subject),
        ),
        offerings,
        rules: [rules.headVersionNumber, rules.provisional],
      };
    };
    return {
      companies: objects(await read(OWNER, '/companies')).map(
        (company) => company.displayName,
      ),
      members: objects(administration.members)
        .map((member) => `${text(member.displayName)} <${text(member.email)}>`)
        .sort(),
      assignments: objects(administration.assignments)
        .map(
          (assignment) =>
            `${memberKeys.get(text(assignment.workspaceMembershipId)) ?? 'other'}@${
              companyNames.get(text(assignment.companyId)) ?? 'other'
            }:${text(assignment.bundle)}`,
        )
        .sort(),
      prisma: await scope('ana', prisma),
      bic: await scope('maria', bic),
    };
  }

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'demonstration_runner',
    });
    harness = await createPostgresRestTestHarness({
      databaseUrl: database.targetUrl,
      serverClock: RUN_CLOCK,
      environment: {
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: OWNER_IDENTITY.provider,
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: OWNER_IDENTITY.subject,
        ACCESS_BOOTSTRAP_WORKSPACE_ID: WORKSPACE_ID,
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: WORKSPACE_NAME,
        ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify(
          demonstrationPersonaAdmissions(WORKSPACE_ID),
        ),
      },
    });
    ({ origin, pool } = harness);
  }, 60_000);

  beforeEach(async () => {
    runInstant = new Date('2026-09-26T12:00:00.000Z');
    await pool.query(
      'TRUNCATE activity_log_events, workspace_memberships, internal_users, workspaces CASCADE',
    );
  });

  afterAll(async () => {
    await harness?.close();
    await database?.close();
  });

  it('reproduces exact commercial versions prepared by Ana and separately approved by Ion', async () => {
    const result = await run(COMMERCIAL_SCENARIO);
    expect(
      result.kind,
      result.kind === 'stopped' ? JSON.stringify(result.stop) : '',
    ).toBe('converged');
    const ids = recordIds(result);
    const companyId = id(ids, 'company.prisma-prim');
    const request = object(
      await read(
        persona('ana'),
        `/commercial-intake/requests/${id(ids, 'request.grup-demo-iso14001')}`,
        companyId,
      ),
    );
    const opportunityId = text(object(request.initialOpportunity).id);
    for (const family of ['offer', 'contract']) {
      const prefix = `commercial.prisma-prim.${family}`;
      const versionId = id(ids, `${prefix}.prepare`);
      const path = `/${family}s/opportunities/${opportunityId}/versions/${versionId}`;
      const artifact = object(
        object(await read(persona('ion'), path, companyId))[family],
      );
      expect(artifact).toMatchObject({
        companyId,
        opportunityId,
        provisional: true,
        createdByWorkspaceMembershipId: id(ids, 'persona.ana'),
        revision: 2,
      });
      const version = object(artifact.version);
      expect(version).toMatchObject({
        id: versionId,
        versionNumber: 1,
        decisionState: 'APPROVED',
        provenance: 'ILLUSTRATIVE',
        provisional: true,
        pricingSnapshotId: id(ids, 'pricing.prisma-prim.snapshot'),
        createdByWorkspaceMembershipId: id(ids, 'persona.ana'),
        decision: {
          id: id(ids, `${prefix}.approve`),
          actorWorkspaceMembershipId: id(ids, 'persona.ion'),
          acknowledgedWarningCodes:
            family === 'offer' ? [] : ['DIRECT_ORIGIN_REVIEWED'],
        },
        pricingSnapshot: { currency: 'MDL', total: '240.00' },
        issuingCompanyLabel: 'PRISMA-PRIM',
        recipient: {
          kind: 'PRIMARY',
          legalName: 'GRUP DEMO SA',
          taxId: 'DEMO-IDNO-0001',
          legalAddress: 'DEMO Example Street 1, DEMO City',
        },
      });
      const representation = object(version.representation);
      expect(representation).toMatchObject({
        templateCode:
          family === 'offer' ? 'OFFER_ILLUSTRATIVE' : 'CONTRACT_ILLUSTRATIVE',
        templateVersion: 1,
      });
      const html = text(representation.html);
      for (const content of [
        'PRISMA-PRIM',
        'GRUP DEMO SA',
        'DEMO-IDNO-0001',
        'DEMO Example Street 1, DEMO City',
        '240.00',
        'MDL',
        'Provisional illustrative document',
        'no legal effect',
        id(ids, 'pricing.prisma-prim.snapshot'),
      ])
        expect(html).toContain(content);
      expect(representation.sha256).toBe(
        createHash('sha256').update(html, 'utf8').digest('hex'),
      );
      expect(object(version.decision)).toMatchObject({
        [family === 'offer'
          ? 'representationSha256'
          : 'representationChecksum']: representation.sha256,
      });
      const qualityResponse =
        family === 'offer'
          ? await api(persona('ana'), `${path}/quality-checks`, {
              method: 'POST',
              companyId,
              key: `demo-v1:${prefix}.quality`,
              body: {},
            })
          : await api(
              persona('ion'),
              `${path}/quality-checks/${id(ids, `${prefix}.quality`)}`,
              { companyId },
            );
      expect(qualityResponse.status).toBe(family === 'offer' ? 201 : 200);
      const quality = object(qualityResponse.body);
      expect(quality).toMatchObject({
        id: id(ids, `${prefix}.quality`),
        actorWorkspaceMembershipId: id(ids, 'persona.ana'),
        ruleSetVersion: 1,
        [`${family}VersionId`]: versionId,
      });
      expect(
        objects(quality.results).filter((item) => item.status === 'ERROR'),
      ).toEqual([]);
      if (family === 'offer') {
        expect(version.transmissionState).toBe('NOT_TRANSMITTED');
        expect(version.clientResponseState).toBe('NONE');
      } else {
        expect(artifact.kind).toBe('CONTRACT');
        expect(artifact.origin).toBe('DIRECT');
        expect(version.executionState).toBe('NOT_EXECUTED');
        expect(version.signature).toBeNull();
        expect(artifact.linkedProjects).toEqual([]);
      }
    }
  }, 120_000);

  it('recovers a lost committed response at every commercial step without duplicates, even after expiry', async () => {
    const steps = [
      'commercial.prisma-prim.offer.prepare',
      'commercial.prisma-prim.offer.quality',
      'commercial.prisma-prim.offer.approve',
      'commercial.prisma-prim.contract.prepare',
      'commercial.prisma-prim.contract.quality',
      'commercial.prisma-prim.contract.approve',
    ];
    const remaining = new Set(steps.map((step) => `demo-v1:${step}`));
    const send = globalThis.fetch;
    const fault = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        const response = await send(input, init);
        const key = new Headers(init?.headers).get('idempotency-key');
        if (key && remaining.delete(key)) {
          expect(response.status).toBe(201);
          await response.text();
          throw new Error('DEMO response lost after acknowledged commit');
        }
        return response;
      });
    try {
      for (const step of steps) {
        const interrupted = await run(COMMERCIAL_SCENARIO);
        expect(interrupted).toMatchObject({
          kind: 'stopped',
          stop: { step, reason: 'unavailable', status: null },
        });
        const index = COMMERCIAL_SCENARIO.steps.findIndex(
          (item) => item.key === step,
        );
        expect(interrupted.entries.map((entry) => entry.step)).toEqual(
          COMMERCIAL_SCENARIO.steps.slice(0, index).map((item) => item.key),
        );
      }
      expect(remaining.size).toBe(0);
      const committedCounts = await tableCounts();
      runInstant = new Date('2030-01-01T00:00:00.000Z');
      const recovered = await run(COMMERCIAL_SCENARIO);
      const { ids, companyId, opportunityId } = await commercialCase(recovered);
      expect(await tableCounts()).toEqual(committedCounts);
      for (const family of ['offer', 'contract']) {
        const prefix = `commercial.prisma-prim.${family}`;
        const versionId = id(ids, `${prefix}.prepare`);
        const artifact = object(
          object(
            await read(
              persona('ion'),
              `/${family}s/opportunities/${opportunityId}/versions/${versionId}`,
              companyId,
            ),
          )[family],
        );
        expect(object(artifact.version)).toMatchObject({
          id: versionId,
          versionNumber: 1,
          decisionState: 'APPROVED',
          decision: {
            id: id(ids, `${prefix}.approve`),
            actorWorkspaceMembershipId: id(ids, 'persona.ion'),
          },
        });
        expect(
          object(
            await read(
              persona('ion'),
              `/${family}s/opportunities/${opportunityId}/versions`,
              companyId,
            ),
          )[family === 'offer' ? 'versions' : 'items'],
        ).toHaveLength(1);
      }
      const repeated = await run(COMMERCIAL_SCENARIO);
      expect(repeated.kind).toBe('converged');
      expect(
        repeated.entries.map((entry) => [entry.step, entry.recordId]),
      ).toEqual(recovered.entries.map((entry) => [entry.step, entry.recordId]));
      expect(
        repeated.entries
          .filter((entry) => steps.includes(entry.step))
          .map((entry) => entry.outcome),
      ).toEqual([
        'confirmed',
        'confirmed',
        'confirmed',
        'confirmed',
        'confirmed',
        'confirmed',
      ]);
      expect(await tableCounts()).toEqual(committedCounts);
    } finally {
      fault.mockRestore();
    }
  }, 300_000);

  it('preserves operator successor versions, decisions and later Quality Checks while replaying the original commercial results', async () => {
    const first = await run(COMMERCIAL_SCENARIO);
    const { ids, companyId, opportunityId } = await commercialCase(first);
    const successors: {
      family: string;
      versionId: string;
      decisionId: string;
    }[] = [];
    const originalVersions = new Map<string, Record<string, unknown>>();
    for (const family of ['offer', 'contract']) {
      const originalVersion = id(
        ids,
        `commercial.prisma-prim.${family}.prepare`,
      );
      const path = `/${family}s/opportunities/${opportunityId}`;
      originalVersions.set(
        family,
        object(
          object(
            object(
              await read(
                persona('ana'),
                `${path}/versions/${originalVersion}`,
                companyId,
              ),
            )[family],
          ).version,
        ),
      );
      expect(
        (
          await api(
            persona('ana'),
            `${path}/versions/${originalVersion}/quality-checks`,
            {
              method: 'POST',
              companyId,
              key: `DEMO-operator-${family}-quality`,
              body: {},
            },
          )
        ).status,
      ).toBe(201);
      const common = {
        pricingSnapshotId: id(ids, 'pricing.prisma-prim.snapshot'),
        scopeNote: 'DEMO operator successor scope',
        commercialConditions: 'DEMO operator successor conditions',
      };
      const successor = await api(persona('ana'), `${path}/versions`, {
        method: 'POST',
        companyId,
        key: `DEMO-operator-${family}-successor`,
        body:
          family === 'offer'
            ? {
                ...common,
                expectedOfferRevision: 2,
                recipient: { kind: 'PRIMARY' },
                validityDays: 30,
              }
            : { ...common, expectedContractRevision: 2 },
      });
      expect(successor.status, JSON.stringify(successor.body)).toBe(201);
      const receipt = object(successor.body);
      const successorId =
        family === 'offer'
          ? text(object(receipt.version).id)
          : text(receipt.contractVersionId);
      const version = object(
        object(
          object(
            await read(
              persona('ana'),
              `${path}/versions/${successorId}`,
              companyId,
            ),
          )[family],
        ).version,
      );
      expect(version).toMatchObject({
        versionNumber: 2,
        decisionState: 'PENDING',
      });
      const approval = await api(
        persona('ion'),
        `${path}/versions/${successorId}/approve`,
        {
          method: 'POST',
          companyId,
          key: `DEMO-operator-${family}-successor-approval`,
          body:
            family === 'offer'
              ? { expectedOfferRevision: 3, acknowledgedWarningCodes: [] }
              : {
                  expectedContractRevision: 3,
                  acknowledgedWarningCodes: ['DIRECT_ORIGIN_REVIEWED'],
                },
        },
      );
      expect(approval.status, JSON.stringify(approval.body)).toBe(201);
      const operatorDecision = object(approval.body);
      expect(operatorDecision).toMatchObject({
        actorWorkspaceMembershipId: id(ids, 'persona.ion'),
        ...(family === 'offer' ? { state: 'APPROVED' } : { kind: 'APPROVE' }),
      });
      const decisionId = text(operatorDecision.id);
      expect(decisionId).not.toBe(
        id(ids, `commercial.prisma-prim.${family}.approve`),
      );
      successors.push({ family, versionId: text(version.id), decisionId });
    }
    runInstant = new Date('2030-01-01T00:00:00.000Z');
    const operatorReads = await Promise.all(
      successors.map(({ family, versionId }) =>
        read(
          persona('ana'),
          `/${family}s/opportunities/${opportunityId}/versions/${versionId}`,
          companyId,
        ),
      ),
    );
    const counts = await tableCounts();
    const repeated = await run(COMMERCIAL_SCENARIO);
    expect(
      repeated.kind,
      repeated.kind === 'stopped' ? JSON.stringify(repeated.stop) : '',
    ).toBe('converged');
    expect(
      repeated.entries.map((entry) => [entry.step, entry.recordId]),
    ).toEqual(first.entries.map((entry) => [entry.step, entry.recordId]));
    expect(await tableCounts()).toEqual(counts);
    for (const [
      index,
      { family, versionId, decisionId },
    ] of successors.entries()) {
      const operator = await read(
        persona('ana'),
        `/${family}s/opportunities/${opportunityId}/versions/${versionId}`,
        companyId,
      );
      expect(operator).toEqual(operatorReads[index]);
      expect(object(object(object(operator)[family]).version)).toMatchObject({
        versionNumber: 2,
        decisionState: 'APPROVED',
        decision: {
          id: decisionId,
          actorWorkspaceMembershipId: id(ids, 'persona.ion'),
        },
      });
      const original = object(
        object(
          await read(
            persona('ana'),
            `/${family}s/opportunities/${opportunityId}/versions/${id(ids, `commercial.prisma-prim.${family}.prepare`)}`,
            companyId,
          ),
        )[family],
      );
      expect(object(original.version)).toMatchObject({
        versionNumber: 1,
        decisionState: 'APPROVED',
        supersededByVersionId: versionId,
        decision: { id: id(ids, `commercial.prisma-prim.${family}.approve`) },
      });
      const before = originalVersions.get(family);
      if (!before) throw new Error(`Missing original ${family} Version.`);
      for (const field of [
        'recipient',
        'issuingCompanyLabel',
        'representation',
        'pricingSnapshotId',
        'decision',
      ])
        expect(object(original.version)[field], `${family}: ${field}`).toEqual(
          before[field],
        );
    }
  }, 300_000);

  it('keeps preparation, approval and denied profiles distinct and hides commercial results from valid foreign readers', async () => {
    const { ids, companyId, opportunityId } = await commercialCase(
      await run(COMMERCIAL_SCENARIO),
    );
    const ecg = id(ids, 'company.ecg');
    const victor = object(
      await read(persona('victor'), '/access/current-actor', ecg),
    );
    expect(object(victor.activeCompany).id).toBe(ecg);
    const counts = await tableCounts();
    for (const family of ['offer', 'contract']) {
      const path = `/${family}s/opportunities/${opportunityId}`;
      const versionId = id(ids, `commercial.prisma-prim.${family}.prepare`);
      const creation = {
        pricingSnapshotId: id(ids, 'pricing.prisma-prim.snapshot'),
        recipient: { kind: 'PRIMARY' },
        scopeNote: 'DEMO denied scope',
        commercialConditions: 'DEMO denied terms',
        ...(family === 'offer'
          ? { validityDays: 30 }
          : { directReason: 'DEMO denied direct reason' }),
      };
      const approval =
        family === 'offer'
          ? { expectedOfferRevision: 2, acknowledgedWarningCodes: [] }
          : {
              expectedContractRevision: 2,
              acknowledgedWarningCodes: ['DIRECT_ORIGIN_REVIEWED'],
            };
      for (const actor of [
        'ion',
        'victor',
      ] satisfies DemonstrationPersonaKey[]) {
        expect(
          (
            await api(
              persona(actor),
              family === 'offer' ? path : `${path}/direct`,
              {
                method: 'POST',
                companyId: actor === 'victor' ? ecg : companyId,
                key: `DEMO-denied-${actor}-${family}-prepare`,
                body: creation,
              },
            )
          ).status,
        ).toBe(403);
      }
      for (const actor of [
        'ana',
        'victor',
      ] satisfies DemonstrationPersonaKey[]) {
        expect(
          (
            await api(persona(actor), `${path}/versions/${versionId}/approve`, {
              method: 'POST',
              companyId: actor === 'victor' ? ecg : companyId,
              key: `DEMO-denied-${actor}-${family}-approve`,
              body: approval,
            })
          ).status,
        ).toBe(403);
      }
      expect(
        (
          await api(
            persona('victor'),
            `${path}/versions/${versionId}/quality-checks`,
            {
              method: 'POST',
              companyId: ecg,
              key: `DEMO-denied-victor-${family}-quality`,
              body: {},
            },
          )
        ).status,
      ).toBe(403);
    }
    expect(await tableCounts()).toEqual(counts);
    const bic = id(ids, 'company.bic');
    const bicRequest = object(
      await read(
        persona('maria'),
        `/commercial-intake/requests/${id(ids, 'request.demo-construct-iso45001')}`,
        bic,
      ),
    );
    const bicOpportunity = text(object(bicRequest.initialOpportunity).id);
    for (const family of ['offer', 'contract']) {
      expect(
        (
          await api(OWNER, `/company-${family}-preparer-assignments`, {
            method: 'POST',
            key: `DEMO-foreign-${family}-reader`,
            body: {
              workspaceMembershipId: id(ids, 'persona.maria'),
              companyId: bic,
            },
          })
        ).status,
      ).toBe(201);
      const own = object(
        await read(
          persona('maria'),
          `/${family}s/opportunities/${bicOpportunity}`,
          bic,
        ),
      );
      expect(own[family]).toBeNull();
      const beforeDenied = await tableCounts();
      for (const suffix of [
        '',
        '/versions',
        `/versions/${id(ids, `commercial.prisma-prim.${family}.prepare`)}`,
      ]) {
        expect(
          (
            await api(
              persona('maria'),
              `/${family}s/opportunities/${opportunityId}${suffix}`,
              { companyId: bic },
            )
          ).status,
        ).toBe(404);
      }
      expect(await tableCounts()).toEqual(beforeDenied);
    }
  }, 300_000);

  it('never restores any of the five revoked commercial fixture grants', async () => {
    const { ids, companyId } = await commercialCase(
      await run(COMMERCIAL_SCENARIO),
    );
    for (const { actor, bundle } of [
      { actor: 'ana', bundle: 'offer-preparer' },
      { actor: 'ana', bundle: 'contract-preparer' },
      { actor: 'ion', bundle: 'commercial-intake' },
      { actor: 'ion', bundle: 'offer-approver' },
      { actor: 'ion', bundle: 'contract-approver' },
    ]) {
      expect(
        (
          await api(
            OWNER,
            `/company-${bundle}-assignments/${id(ids, `persona.${actor}`)}/${companyId}`,
            { method: 'DELETE', key: `DEMO-revoke-${actor}-${bundle}` },
          )
        ).status,
      ).toBe(200);
      const counts = await tableCounts();
      const stopped = await run(COMMERCIAL_SCENARIO);
      expect(stopped).toMatchObject({
        kind: 'stopped',
        stop: { step: `grant.${actor}.${bundle}`, reason: 'grant-revoked' },
      });
      expect(await tableCounts()).toEqual(counts);
      // An explicit administrator action prepares the next independent case;
      // the scenario itself was proved to leave the revocation untouched.
      expect(
        (
          await api(OWNER, `/company-${bundle}-assignments`, {
            method: 'POST',
            key: `DEMO-explicit-restore-${actor}-${bundle}`,
            body: {
              workspaceMembershipId: id(ids, `persona.${actor}`),
              companyId,
            },
          })
        ).status,
      ).toBe(201);
    }
  }, 300_000);

  it('revalidates approval authority after the grant phase even on an exact committed replay', async () => {
    const { ids, companyId } = await commercialCase(
      await run(COMMERCIAL_SCENARIO),
    );
    for (const family of ['offer', 'contract']) {
      const step = `commercial.prisma-prim.${family}.approve`;
      const send = globalThis.fetch;
      let revoked = false;
      let afterRevocation: Record<string, number> | undefined;
      const interception = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(async (input, init) => {
          if (
            !revoked &&
            new Headers(init?.headers).get('idempotency-key') ===
              `demo-v1:${step}`
          ) {
            revoked = true;
            expect(
              (
                await api(
                  OWNER,
                  `/company-${family}-approver-assignments/${id(ids, 'persona.ion')}/${companyId}`,
                  { method: 'DELETE', key: `DEMO-mid-run-${family}-revoke` },
                )
              ).status,
            ).toBe(200);
            afterRevocation = await tableCounts();
          }
          return send(input, init);
        });
      try {
        const stopped = await run(COMMERCIAL_SCENARIO);
        expect(stopped).toMatchObject({
          kind: 'stopped',
          stop: { step, reason: 'denied', status: 403 },
        });
        expect(revoked).toBe(true);
        expect(await tableCounts()).toEqual(afterRevocation);
      } finally {
        interception.mockRestore();
      }
      expect(
        (
          await api(OWNER, `/company-${family}-approver-assignments`, {
            method: 'POST',
            key: `DEMO-mid-run-${family}-explicit-restore`,
            body: { workspaceMembershipId: id(ids, 'persona.ion'), companyId },
          })
        ).status,
      ).toBe(201);
    }
  }, 300_000);

  it('refuses new unacknowledged identity warnings instead of changing an unfinished approval payload', async () => {
    const partial = await run(
      commercialPrefix('commercial.prisma-prim.offer.approve'),
    );
    const { ids, companyId } = await commercialCase(partial);
    const clientPath = `/clients/${id(ids, 'client.grup-demo')}`;
    const client = object(await read(persona('ana'), clientPath, companyId));
    expect(
      (
        await api(persona('ana'), clientPath, {
          method: 'PATCH',
          companyId,
          key: 'DEMO-before-approval-identity-correction',
          body: {
            expectedVersion: client.version,
            address: 'DEMO corrected address before approval',
          },
        })
      ).status,
    ).toBe(200);
    const counts = await tableCounts();
    const stopped = await run(COMMERCIAL_SCENARIO);
    expect(stopped).toMatchObject({
      kind: 'stopped',
      stop: {
        step: 'commercial.prisma-prim.offer.approve',
        reason: 'conflict',
        status: 409,
      },
    });
    expect(await tableCounts()).toEqual(counts);
    expect(
      object(await read(persona('ana'), clientPath, companyId)).address,
    ).toBe('DEMO corrected address before approval');
  }, 300_000);

  it('deduplicates concurrent commercial commands before either caller receives its first acknowledgement', async () => {
    expect((await run(PRICING_SCENARIO)).kind).toBe('converged');
    const keys = ['offer', 'contract'].flatMap((family) =>
      ['prepare', 'quality', 'approve'].map(
        (operation) => `demo-v1:commercial.prisma-prim.${family}.${operation}`,
      ),
    );
    const gates = new Map<
      string,
      {
        arrivals: number;
        readonly release: () => void;
        readonly promise: Promise<void>;
      }
    >();
    for (const key of keys) {
      let release: () => void = () => undefined;
      const promise = new Promise<void>((resolve) => {
        release = resolve;
      });
      gates.set(key, { arrivals: 0, release, promise });
    }
    let timedOut = false;
    const watchdog = setTimeout(() => {
      timedOut = true;
      for (const gate of gates.values()) gate.release();
    }, 120_000);
    const send = globalThis.fetch;
    const interception = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        const response = await send(input, init);
        const key = new Headers(init?.headers).get('idempotency-key');
        const gate = key === null ? undefined : gates.get(key);
        if (gate) {
          expect(response.status).toBe(201);
          gate.arrivals += 1;
          if (gate.arrivals >= 2) gate.release();
          await gate.promise;
        }
        return response;
      });
    try {
      const [first, second] = await Promise.all([
        run(COMMERCIAL_SCENARIO),
        run(COMMERCIAL_SCENARIO),
      ]);
      expect(timedOut).toBe(false);
      await commercialCase(first);
      await commercialCase(second);
      expect(
        second.entries.map((entry) => [entry.step, entry.recordId]),
      ).toEqual(first.entries.map((entry) => [entry.step, entry.recordId]));
      for (const [key, gate] of gates)
        expect(gate.arrivals, key).toBeGreaterThanOrEqual(2);
      const counts = await tableCounts();
      expect(counts).toMatchObject({
        'public.offers': 1,
        'public.offer_versions': 1,
        'public.offer_decisions': 1,
        'public.offer_quality_runs': 2,
        'public.offer_commands': 3,
        'public.contracts': 1,
        'public.contract_versions': 1,
        'public.contract_decisions': 1,
        'public.contract_quality_runs': 2,
        'public.contract_commands': 3,
      });
      expect((await run(COMMERCIAL_SCENARIO)).kind).toBe('converged');
      expect(await tableCounts()).toEqual(counts);
    } finally {
      clearTimeout(watchdog);
      for (const gate of gates.values()) gate.release();
      interception.mockRestore();
    }
  }, 300_000);

  it('fails closed at each commercial response boundary before another step can write', async () => {
    const { ids, companyId } = await commercialCase(
      await run(COMMERCIAL_SCENARIO),
    );
    const counts = await tableCounts();
    for (const family of ['offer', 'contract']) {
      const prefix = `commercial.prisma-prim.${family}`;
      const cases = [
        {
          name: 'provisional creation',
          stage: 'prepare',
          boundary: 'command',
          reason: 'unexpected-response',
          mutate: (reply) => ({
            ...reply,
            version: { ...object(reply.version), provisional: false },
          }),
        },
        {
          name: 'Company-bound exact read',
          stage: 'prepare',
          boundary: 'read',
          reason: 'unexpected-response',
          mutate: (reply) => ({ ...reply, companyId: id(ids, 'company.bic') }),
        },
        {
          name: 'known Quality Check version',
          stage: 'quality',
          boundary: 'command',
          reason: 'unexpected-response',
          mutate: (reply) => ({ ...reply, ruleSetVersion: 99 }),
        },
        {
          name: 'complete Quality Check results',
          stage: 'quality',
          boundary: 'read',
          reason: 'unexpected-response',
          mutate: (reply) => ({
            ...reply,
            results: objects(reply.results).slice(1),
          }),
        },
        {
          name: 'known Quality Check code',
          stage: 'quality',
          boundary: 'command',
          reason: 'unexpected-response',
          mutate: (reply) => ({
            ...reply,
            results: objects(reply.results).map((result, index) =>
              index === 0 ? { ...result, code: 'UNKNOWN' } : result,
            ),
          }),
        },
        {
          name: 'valid Quality Check severity',
          stage: 'quality',
          boundary: 'read',
          reason: 'unexpected-response',
          mutate: (reply) => ({
            ...reply,
            results: objects(reply.results).map((result, index) =>
              index === 0 ? { ...result, status: 'WARNING' } : result,
            ),
          }),
        },
        {
          name: 'blocking Quality Check error',
          stage: 'quality',
          boundary: 'command',
          reason: 'rejected',
          mutate: (reply) => ({
            ...reply,
            results: objects(reply.results).map((result) =>
              result.code === 'PRICING_SNAPSHOT_COHERENT'
                ? { ...result, status: 'ERROR' }
                : result,
            ),
          }),
        },
        {
          name: 'closed approval state',
          stage: 'approve',
          boundary: 'command',
          reason: 'unexpected-response',
          mutate: (reply) => ({
            ...reply,
            ...(family === 'offer'
              ? { state: 'UNKNOWN' }
              : { kind: 'UNKNOWN' }),
          }),
        },
        {
          name: 'exact deciding actor',
          stage: 'approve',
          boundary: 'read',
          reason: 'unexpected-response',
          mutate: (reply) => ({
            ...reply,
            version: {
              ...object(reply.version),
              decision: {
                ...object(object(reply.version).decision),
                actorWorkspaceMembershipId: id(ids, 'persona.ana'),
              },
            },
          }),
        },
      ] satisfies {
        name: string;
        stage: 'prepare' | 'quality' | 'approve';
        boundary: 'command' | 'read';
        reason: 'unexpected-response' | 'rejected';
        mutate: (reply: Record<string, unknown>) => unknown;
      }[];
      for (const testCase of cases) {
        const step = `${prefix}.${testCase.stage}`;
        const key = `demo-v1:${step}`;
        let commands = 0;
        let injected = false;
        const send = globalThis.fetch;
        const interception = vi
          .spyOn(globalThis, 'fetch')
          .mockImplementation(async (input, init) => {
            const response = await send(input, init);
            const path = new URL(String(input)).pathname;
            if (new Headers(init?.headers).get('idempotency-key') === key)
              commands += 1;
            const isReceiptRead =
              testCase.stage === 'quality' &&
              family === 'offer' &&
              commands === 2;
            const isGetRead =
              commands > 0 &&
              (init?.method ?? 'GET') === 'GET' &&
              path.startsWith(`/api/${family}s/`) &&
              (testCase.stage === 'quality'
                ? path.includes('/quality-checks/')
                : path.endsWith(`/versions/${id(ids, `${prefix}.prepare`)}`));
            const matches =
              testCase.boundary === 'command'
                ? new Headers(init?.headers).get('idempotency-key') === key
                : isReceiptRead || isGetRead;
            if (injected || !matches) return response;
            injected = true;
            expect(response.ok).toBe(true);
            const raw: unknown = await response.json();
            const reply = object(raw);
            const versionRead =
              testCase.boundary === 'read' && testCase.stage !== 'quality';
            const changed = testCase.mutate(
              versionRead ? object(reply[family]) : reply,
            );
            return new Response(
              JSON.stringify(
                versionRead ? { ...reply, [family]: changed } : changed,
              ),
              {
                status: response.status,
                headers: { 'content-type': 'application/json' },
              },
            );
          });
        try {
          const stopped = await run(COMMERCIAL_SCENARIO);
          expect(injected, `${family}: ${testCase.name}`).toBe(true);
          expect(stopped, `${family}: ${testCase.name}`).toMatchObject({
            kind: 'stopped',
            stop: { step, reason: testCase.reason },
          });
          const index = COMMERCIAL_SCENARIO.steps.findIndex(
            (item) => item.key === step,
          );
          expect(stopped.entries.map((entry) => entry.step)).toEqual(
            COMMERCIAL_SCENARIO.steps.slice(0, index).map((item) => item.key),
          );
          expect(await tableCounts()).toEqual(counts);
        } finally {
          interception.mockRestore();
        }
      }
    }
    expect(
      (await api(persona('ana'), '/access/current-actor', { companyId }))
        .status,
    ).toBe(200);
  }, 600_000);

  it('reproduces five tariffs and reopens the exact illustrative pricing results in their own Companies', async () => {
    const result = await run(PRICING_SCENARIO);
    expect(
      result.kind,
      result.kind === 'stopped' ? JSON.stringify(result.stop) : '',
    ).toBe('converged');
    const ids = recordIds(result);
    for (const expected of [
      {
        company: 'prisma-prim',
        actor: 'ana',
        request: 'grup-demo-iso14001',
        offering: 'demo-iso14001-cons',
        currency: 'MDL',
        net: '200.00',
        tax: '40.00',
        total: '240.00',
      },
      {
        company: 'bic',
        actor: 'maria',
        request: 'demo-construct-iso45001',
        offering: 'demo-iso45001-cert',
        currency: 'EUR',
        net: '300.00',
        tax: '0.00',
        total: '300.00',
      },
    ] satisfies {
      company: string;
      actor: DemonstrationPersonaKey;
      request: string;
      offering: string;
      currency: string;
      net: string;
      tax: string;
      total: string;
    }[]) {
      const companyId = id(ids, `company.${expected.company}`);
      const request = object(
        await read(
          persona(expected.actor),
          `/commercial-intake/requests/${id(ids, `request.${expected.request}`)}`,
          companyId,
        ),
      );
      const opportunityId = text(object(request.initialOpportunity).id);
      const path = `/pricing/opportunities/${opportunityId}/snapshots`;
      const snapshotId = id(ids, `pricing.${expected.company}.snapshot`);
      const detail = object(
        await read(persona(expected.actor), `${path}/${snapshotId}`, companyId),
      );
      expect(detail).toMatchObject({
        id: snapshotId,
        opportunityId,
        clientRequestId: id(ids, `request.${expected.request}`),
        provenance: 'ILLUSTRATIVE',
        provisional: true,
        version: 1,
        currency: expected.currency,
        subtotal: expected.net,
        taxTotal: expected.tax,
        total: expected.total,
        pricingRuleVersion: {
          id: id(ids, `pricing.${expected.company}.rule-v1`),
          versionNumber: 1,
        },
        lines: [
          expect.objectContaining({
            tariffVersionId: id(ids, `pricing.${expected.offering}.tariff-v1`),
            tariffVersionNumber: 1,
            quantity: '2',
            adjustment: null,
          }),
        ],
      });
      expect(
        objects(
          object(await read(persona(expected.actor), path, companyId)).items,
        ).map((item) => item.id),
      ).toEqual([snapshotId]);
      expect(
        (await api(persona('ion'), `${path}/${snapshotId}`, { companyId }))
          .status,
      ).toBe(403);
      const otherCompany =
        expected.company === 'prisma-prim' ? 'bic' : 'prisma-prim';
      const otherPersona =
        expected.actor === 'ana' ? persona('maria') : persona('ana');
      const otherCompanyId = id(ids, `company.${otherCompany}`);
      expect(
        (
          await api(otherPersona, `${path}/${snapshotId}`, {
            companyId: otherCompanyId,
          })
        ).status,
      ).toBe(404);
      expect(
        (await api(otherPersona, path, { companyId: otherCompanyId })).status,
      ).toBe(404);
      expect(
        (
          await api(persona(expected.actor), `${path}/${snapshotId}`, {
            companyId: id(ids, 'company.ecg'),
          })
        ).status,
      ).toBe(403);
    }
    expect(
      (
        await pool.query(
          'SELECT count(*)::integer AS count FROM tariff_versions',
        )
      ).rows,
    ).toEqual([{ count: 5 }]);
    const counts = await tableCounts();
    runInstant = new Date('2026-09-26T13:00:00.000Z');
    const repeated = await run(PRICING_SCENARIO);
    expect(repeated.kind, JSON.stringify(repeated)).toBe('converged');
    expect(repeated.entries.map((entry) => entry.recordId)).toEqual(
      result.entries.map((entry) => entry.recordId),
    );
    expect(repeated.entries.every((entry) => entry.outcome !== 'created')).toBe(
      true,
    );
    expect(await tableCounts()).toEqual(counts);
  }, 300_000);

  it.each(['tariff', 'snapshot'])(
    'recovers a committed %s whose response was lost, without duplicating it',
    async (kind) => {
      const originalFetch = globalThis.fetch;
      let lost = false;
      const spy = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(async (input, init) => {
          const response = await originalFetch(input, init);
          const url = String(input);
          if (
            !lost &&
            init?.method === 'POST' &&
            response.ok &&
            (kind === 'tariff'
              ? url.endsWith('/tariff-versions')
              : url.endsWith('/snapshots'))
          ) {
            lost = true;
            throw new Error('Simulated response loss after the real commit.');
          }
          return response;
        });
      let interrupted: DemonstrationRunResult;
      try {
        interrupted = await run(PRICING_SCENARIO);
      } finally {
        spy.mockRestore();
      }
      expect(lost).toBe(true);
      expect(interrupted).toMatchObject({
        kind: 'stopped',
        stop: { reason: 'unavailable' },
      });
      const committed = await pool.query<{ id: string }>(
        kind === 'tariff'
          ? 'SELECT id FROM tariff_versions'
          : 'SELECT id FROM pricing_snapshots',
      );
      expect(committed.rows).toHaveLength(1);
      runInstant = new Date('2026-09-26T14:00:00.000Z');
      const recovered = await run(PRICING_SCENARIO);
      expect(
        recovered.kind,
        recovered.kind === 'stopped' ? JSON.stringify(recovered.stop) : '',
      ).toBe('converged');
      expect(recovered.entries.map((entry) => entry.recordId)).toContain(
        committed.rows[0]?.id,
      );
      expect(
        (
          await pool.query(
            'SELECT count(*)::integer AS count FROM tariff_versions',
          )
        ).rows,
      ).toEqual([{ count: 5 }]);
      expect(
        (
          await pool.query(
            'SELECT count(*)::integer AS count FROM pricing_snapshots',
          )
        ).rows,
      ).toEqual([{ count: 2 }]);
      const counts = await tableCounts();
      expect((await run(PRICING_SCENARIO)).kind).toBe('converged');
      expect(await tableCounts()).toEqual(counts);
    },
    300_000,
  );

  it('preserves the exact original Snapshot after an operator publishes successor configuration', async () => {
    const first = await run(PRICING_SCENARIO);
    expect(first.kind).toBe('converged');
    const ids = recordIds(first);
    const companyId = id(ids, 'company.prisma-prim');
    const ana = persona('ana');
    const request = object(
      await read(
        ana,
        `/commercial-intake/requests/${id(ids, 'request.grup-demo-iso14001')}`,
        companyId,
      ),
    );
    const opportunityId = text(object(request.initialOpportunity).id);
    const snapshotPath = `/pricing/opportunities/${opportunityId}/snapshots/${id(ids, 'pricing.prisma-prim.snapshot')}`;
    const original = await read(ana, snapshotPath, companyId);
    const future = '2026-09-26T13:00:00.000Z';
    expect(
      (
        await api(ana, '/pricing-configuration/rule-versions', {
          method: 'POST',
          companyId,
          key: 'operator-successor-rule',
          body: {
            label: 'DEMO operator successor',
            effectiveFrom: future,
            expectedActiveVersionNumber: 1,
          },
        })
      ).status,
    ).toBe(201);
    const offeringId = id(ids, 'catalogue.demo-iso14001-cons.offering');
    expect(
      (
        await api(
          ana,
          `/pricing-configuration/offerings/${offeringId}/tariff-versions`,
          {
            method: 'POST',
            companyId,
            key: 'operator-successor-tariff',
            body: {
              unit: 'DEMO revised unit',
              unitAmount: '999.00',
              currency: 'MDL',
              taxRatePercent: '0',
              taxLabel: 'DEMO changed tax',
              effectiveFrom: future,
              expectedActiveVersionNumber: 1,
            },
          },
        )
      ).status,
    ).toBe(201);
    runInstant = new Date('2026-09-26T14:00:00.000Z');
    const counts = await tableCounts();
    const repeated = await run(PRICING_SCENARIO);
    expect(
      repeated.kind,
      repeated.kind === 'stopped' ? JSON.stringify(repeated.stop) : '',
    ).toBe('converged');
    expect(await tableCounts()).toEqual(counts);
    expect(await read(ana, snapshotPath, companyId)).toEqual(original);
    const repeatedIds = recordIds(repeated);
    expect(repeatedIds.get('pricing.prisma-prim.rule-v1')).toBe(
      ids.get('pricing.prisma-prim.rule-v1'),
    );
    expect(repeatedIds.get('pricing.demo-iso14001-cons.tariff-v1')).toBe(
      ids.get('pricing.demo-iso14001-cons.tariff-v1'),
    );

    const tariffs = object(
      await read(
        ana,
        `/pricing-configuration/offerings/${offeringId}/tariff-versions`,
        companyId,
      ),
    );
    expect(
      objects(tariffs.items).map((item) => [
        item.versionNumber,
        item.unitAmount,
      ]),
    ).toEqual([
      [2, '999.0000'],
      [1, '100.0000'],
    ]);
  }, 300_000);

  it.each([
    { effectiveFrom: '2027-01-01T00:00:00.000Z', total: null },
    { effectiveFrom: '2026-09-26T12:00:01.000Z', total: '1554.00' },
  ])(
    'preserves an operator tariff and evaluates its validity at calculation time: %j',
    async ({ effectiveFrom, total }) => {
      const tariffIndex = PRICING_SCENARIO.steps.findIndex(
        (step) => step.kind === 'pricing.tariff',
      );
      const partial = await run({
        ...PRICING_SCENARIO,
        steps: PRICING_SCENARIO.steps.slice(0, tariffIndex),
      });
      expect(partial.kind).toBe('converged');
      const ids = recordIds(partial);
      const companyId = id(ids, 'company.prisma-prim');
      const offeringId = id(ids, 'catalogue.demo-iso14001-cons.offering');
      const published = await api(
        persona('ana'),
        `/pricing-configuration/offerings/${offeringId}/tariff-versions`,
        {
          method: 'POST',
          companyId,
          key: 'operator-future-tariff',
          body: {
            unit: 'DEMO operator unit',
            unitAmount: '777.00',
            currency: 'MDL',
            taxRatePercent: '0',
            taxLabel: 'DEMO operator tax',
            effectiveFrom,
            expectedActiveVersionNumber: null,
          },
        },
      );
      expect(published.status).toBe(201);
      const result = await run(PRICING_SCENARIO);
      if (total === null) {
        expect(result).toMatchObject({
          kind: 'stopped',
          stop: {
            step: 'pricing.prisma-prim.snapshot',
            reason: 'conflict',
            status: 409,
          },
        });
        expect(
          (
            await pool.query(
              'SELECT count(*)::integer AS count FROM pricing_snapshots',
            )
          ).rows,
        ).toEqual([{ count: 0 }]);
      } else {
        expect(
          result.kind,
          result.kind === 'stopped' ? JSON.stringify(result.stop) : '',
        ).toBe('converged');
        const request = object(
          await read(
            persona('ana'),
            `/commercial-intake/requests/${id(ids, 'request.grup-demo-iso14001')}`,
            companyId,
          ),
        );
        const snapshot = object(
          await read(
            persona('ana'),
            `/pricing/opportunities/${text(object(request.initialOpportunity).id)}/snapshots/${id(recordIds(result), 'pricing.prisma-prim.snapshot')}`,
            companyId,
          ),
        );
        expect(snapshot).toMatchObject({
          total,
          subtotal: '1554.00',
          taxTotal: '0.00',
          provenance: 'ILLUSTRATIVE',
        });
        expect(objects(snapshot.lines)).toEqual([
          expect.objectContaining({
            tariffVersionId: object(object(published.body).version).id,
            unitAmount: '777.0000',
          }),
        ]);
      }
      const tariffs = object(
        await read(
          persona('ana'),
          `/pricing-configuration/offerings/${offeringId}/tariff-versions`,
          companyId,
        ),
      );
      expect(objects(tariffs.items)).toEqual([
        expect.objectContaining({
          id: object(object(published.body).version).id,
          unitAmount: '777.0000',
          versionNumber: 1,
        }),
      ]);
    },
    300_000,
  );

  it('never re-grants revoked pricing authority', async () => {
    const first = await run(PRICING_SCENARIO);
    expect(first.kind).toBe('converged');
    const ids = recordIds(first);
    expect(
      (
        await api(
          OWNER,
          `/company-pricing-user-assignments/${id(ids, 'persona.ana')}/${id(ids, 'company.prisma-prim')}`,
          { method: 'DELETE', key: 'revoke-ana-pricing' },
        )
      ).status,
    ).toBe(200);
    const counts = await tableCounts();
    const repeated = await run(PRICING_SCENARIO);
    expect(repeated).toMatchObject({
      kind: 'stopped',
      stop: { step: 'grant.ana.pricing-user', reason: 'grant-revoked' },
    });
    expect(await tableCounts()).toEqual(counts);
  }, 300_000);

  it.each([
    { provisional: false, headVersionNumber: null },
    { provisional: true, headVersionNumber: 'invalid' },
  ])(
    'stops before tariff writes on malformed or non-provisional configuration: %j',
    async (invalidScope) => {
      const originalFetch = globalThis.fetch;
      const spy = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(async (input, init) => {
          const response = await originalFetch(input, init);
          if (String(input).endsWith('/tariff-scope') && response.ok) {
            const body: unknown = await response.json();
            return new Response(
              JSON.stringify({ ...object(body), ...invalidScope }),
              { status: 200, headers: { 'content-type': 'application/json' } },
            );
          }
          return response;
        });
      let result: DemonstrationRunResult;
      try {
        result = await run(PRICING_SCENARIO);
      } finally {
        spy.mockRestore();
      }
      expect(result).toMatchObject({
        kind: 'stopped',
        stop: {
          step: 'pricing.demo-iso9001-cons.tariff-v1',
          reason: 'unexpected-response',
        },
      });
      expect(
        (
          await pool.query(
            'SELECT count(*)::integer AS count FROM tariff_versions',
          )
        ).rows,
      ).toEqual([{ count: 0 }]);
      expect(
        (
          await pool.query(
            'SELECT count(*)::integer AS count FROM pricing_snapshots',
          )
        ).rows,
      ).toEqual([{ count: 0 }]);
    },
    300_000,
  );

  it.each([
    { family: 'rule', malformed: 'outcome' },
    { family: 'tariff', malformed: 'outcome' },
    { family: 'rule', malformed: 'version' },
    { family: 'tariff', malformed: 'version' },
  ])(
    'rejects malformed pricing publication or history responses: %j',
    async ({ family, malformed }) => {
      const before =
        malformed === 'version' ? await run(PRICING_SCENARIO) : undefined;
      if (before) expect(before.kind).toBe('converged');
      const counts = before ? await tableCounts() : undefined;
      const originalFetch = globalThis.fetch;
      let changed = false;
      const spy = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(async (input, init) => {
          const response = await originalFetch(input, init);
          const url = new URL(String(input));
          const target = url.pathname.endsWith(
            family === 'rule' ? '/rule-versions' : '/tariff-versions',
          );
          if (
            !changed &&
            target &&
            response.ok &&
            (malformed === 'outcome'
              ? init?.method === 'POST'
              : init?.method === 'GET')
          ) {
            changed = true;
            const body: unknown = await response.json();
            const invalid =
              malformed === 'outcome'
                ? { ...object(body), outcome: 'UNKNOWN' }
                : {
                    ...object(body),
                    items: objects(object(body).items).map((item) => ({
                      ...item,
                      versionNumber: 0,
                    })),
                  };
            return new Response(JSON.stringify(invalid), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            });
          }
          return response;
        });
      let result: DemonstrationRunResult;
      try {
        result = await run(PRICING_SCENARIO);
      } finally {
        spy.mockRestore();
      }
      expect(changed).toBe(true);
      expect(result).toMatchObject({
        kind: 'stopped',
        stop: {
          step:
            family === 'rule'
              ? 'pricing.prisma-prim.rule-v1'
              : 'pricing.demo-iso9001-cons.tariff-v1',
          reason: 'unexpected-response',
        },
      });
      if (counts) expect(await tableCounts()).toEqual(counts);
      else
        expect(
          (
            await pool.query(
              'SELECT count(*)::integer AS count FROM pricing_snapshots',
            )
          ).rows,
        ).toEqual([{ count: 0 }]);
    },
    300_000,
  );

  it('seeds demo-v1 through the public commands with normal, attributed events and isolated personas', async () => {
    // This case asserts the API's creation-time order. Task creation uses the
    // database default rather than RUN_CLOCK, so give each real write a distinct
    // increasing fixture date before that clock's later state transitions.
    await pool.query('CREATE SEQUENCE demonstration_task_creation_clock');
    let result: DemonstrationRunResult;
    try {
      await pool.query(
        "ALTER TABLE tasks ALTER COLUMN created_at SET DEFAULT (TIMESTAMPTZ '2026-09-26T11:00:00Z' + nextval('demonstration_task_creation_clock') * interval '1 second')",
      );
      result = await run();
    } finally {
      await pool.query(
        'ALTER TABLE tasks ALTER COLUMN created_at SET DEFAULT now()',
      );
      await pool.query('DROP SEQUENCE demonstration_task_creation_clock');
    }
    expect(result.kind).toBe('converged');
    if (result.kind !== 'converged') return;
    expect(result.workspace).toEqual({
      id: WORKSPACE_ID,
      name: WORKSPACE_NAME,
    });
    expect(result.entries.map((entry) => [entry.step, entry.outcome])).toEqual(
      DEMONSTRATION_SCENARIO.steps.map((step) => [step.key, 'created']),
    );
    const ids = recordIds(result);
    const prisma = id(ids, 'company.prisma-prim');
    const bic = id(ids, 'company.bic');
    const ecg = id(ids, 'company.ecg');
    const ana = persona('ana');
    const maria = persona('maria');
    const victor = persona('victor');

    // Workspace, Companies, personas and provisional role profiles.
    const model = await readModel(result);
    expect(model.companies).toEqual(['BIC', 'ECG', 'PRISMA-PRIM']);
    expect(model.members).toEqual([
      'Ana DEMO <ana.demo@example.test>',
      'Demonstration Operator <operator@example.test>',
      'Ion DEMO <ion.demo@example.test>',
      'Maria DEMO <maria.demo@example.test>',
      'Victor DEMO <victor.demo@example.test>',
    ]);
    const manager = [
      'Company Commercial Activity Reader',
      'Company Commercial Intake',
      'Company Context Access',
      'Company Director Client Access',
      'Company Document Project Organizer',
      'Company Document Registrar',
      'Company Pricing Configuration',
      'Company Project Access',
      'Company Service Catalogue',
      'Company Task Manager',
    ];
    expect(model.assignments).toEqual(
      [
        ...manager.map((bundle) => `ana@PRISMA-PRIM:${bundle}`),
        ...[
          'Company Context Access',
          'Company Director Client Access',
          'Company Project Access',
          'Company Task Manager',
        ].map((bundle) => `ion@PRISMA-PRIM:${bundle}`),
        ...manager.map((bundle) => `maria@BIC:${bundle}`),
        'victor@ECG:Company Context Access',
      ].sort(),
    );
    expect(
      (
        await pool.query(
          `SELECT DISTINCT external_provider AS provider FROM internal_users
            WHERE email LIKE '%.demo@example.test'`,
        )
      ).rows,
    ).toEqual([{ provider: 'demo-seed' }]);

    // Operational examples as the PRISMA-PRIM and BIC managers read them.
    expect(model.prisma.clients).toEqual(['DEMO Lactate SRL', 'GRUP DEMO SA']);
    expect(model.prisma.projects).toEqual([
      {
        title: 'DEMO ISO 22000 implementation',
        client: 'DEMO Lactate SRL',
        responsible: 'ion',
        tasks: [
          {
            title: 'DEMO Review the HACCP plan',
            status: 'todo',
            priority: 'critical',
            dueDate: '2026-09-15',
            version: 1,
            assignee: 'ion',
          },
          {
            title: 'DEMO Document the prerequisite programmes',
            status: 'in_progress',
            priority: 'important',
            dueDate: '2026-09-25',
            version: 2,
            assignee: 'ion',
          },
          {
            title: 'DEMO Hold the kick-off meeting',
            status: 'done',
            priority: 'normal',
            dueDate: '2026-09-10',
            version: 2,
            assignee: 'ion',
          },
          {
            title: 'DEMO Collect the supplier approval records',
            status: 'blocked',
            priority: 'important',
            dueDate: '2027-01-20',
            version: 2,
            assignee: null,
          },
        ],
        documents: ['DEMO ISO 22000 pre-assessment questionnaire'],
      },
      {
        title: 'DEMO ISO 9001 consulting',
        client: 'GRUP DEMO SA',
        responsible: 'ana',
        tasks: [
          {
            title: 'DEMO Prepare the gap analysis',
            status: 'todo',
            priority: 'normal',
            dueDate: '2027-01-15',
            version: 1,
            assignee: 'ion',
          },
          {
            title: 'DEMO Plan the internal audit training',
            status: 'cancelled',
            priority: 'normal',
            dueDate: '2027-02-10',
            version: 2,
            assignee: null,
          },
        ],
        documents: ['DEMO ISO 9001 consulting questionnaire'],
      },
    ]);
    expect(model.prisma.requests).toEqual(
      expect.arrayContaining([
        {
          subject: 'DEMO ISO 14001 consulting request',
          client: 'GRUP DEMO SA',
          opportunity: [
            'DEMO ISO 14001 consulting',
            'DEMO Send the illustrative scope summary',
            2,
          ],
        },
        {
          subject: 'DEMO ISO 9001 enquiry without a Client',
          client: null,
          opportunity: [
            'DEMO ISO 9001 enquiry',
            'DEMO Identify the requesting organization',
            1,
          ],
        },
      ]),
    );
    expect(model.prisma.requests).toHaveLength(2);
    expect(model.prisma.offerings.sort()).toEqual([
      ['DEMO-ISO14001-CONS', true],
      ['DEMO-ISO22000-CONS', true],
      ['DEMO-ISO9001-CONS', true],
    ]);
    expect(model.prisma.rules).toEqual([1, true]);
    expect(model.bic.clients).toEqual(['DEMO Construct SRL', 'GRUP DEMO SA']);
    expect(
      model.bic.projects.map((project) => [
        project.title,
        project.client,
        project.responsible,
        project.documents,
      ]),
    ).toEqual([
      ['DEMO ISO 9001 certification audit', 'GRUP DEMO SA', 'maria', []],
      [
        'DEMO ISO 45001 certification audit',
        'DEMO Construct SRL',
        'maria',
        ['DEMO ISO 45001 application questionnaire'],
      ],
    ]);
    expect(model.bic.requests).toEqual([
      {
        subject: 'DEMO ISO 45001 certification request',
        client: 'DEMO Construct SRL',
        opportunity: [
          'DEMO ISO 45001 certification',
          'DEMO Send the application questionnaire',
          1,
        ],
      },
    ]);
    expect(model.bic.offerings.sort()).toEqual([
      ['DEMO-ISO45001-CERT', true],
      ['DEMO-ISO9001-CERT', true],
    ]);
    expect(model.bic.rules).toEqual([1, true]);

    const grup = object(
      await read(ana, `/clients/${id(ids, 'client.grup-demo')}`, prisma),
    );
    expect(grup).toMatchObject({
      displayName: 'GRUP DEMO SA',
      taxId: 'DEMO-IDNO-0001',
      involvedCompanyDisplayNames: expect.arrayContaining([
        'PRISMA-PRIM',
        'BIC',
      ]),
    });
    expect(objects(grup.contacts)).toEqual([
      expect.objectContaining({
        name: 'Elena DEMO',
        position: 'DEMO Quality manager',
        decisionRoles: ['final_decision_maker', 'financial'],
        communicationPreferences: expect.stringContaining('DEMO'),
      }),
      expect.objectContaining({
        name: 'Petru DEMO',
        position: 'DEMO Production lead',
        decisionRoles: ['influencer', 'technical'],
        communicationPreferences: expect.stringContaining('DEMO'),
      }),
    ]);
    const blocked = object(
      object(
        await read(ana, `/tasks/${id(ids, 'task.supplier-records')}`, prisma),
      ).task,
    );
    expect(object(blocked.blockage).reason).toBe(
      'DEMO Waiting for the DEMO supplier list from the Client',
    );

    // Isolation through persona reads.
    expect(
      (
        await api(maria, `/clients/${id(ids, 'client.demo-lactate')}`, {
          companyId: bic,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await api(
          maria,
          `/commercial-intake/requests/${id(ids, 'request.grup-demo-iso14001')}`,
          {
            companyId: bic,
          },
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await api(maria, `/projects/${id(ids, 'project.iso9001-consulting')}`, {
          companyId: bic,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await api(
          ana,
          `/projects/${id(ids, 'project.iso9001-certification-audit')}`,
          { companyId: prisma },
        )
      ).status,
    ).toBe(404);
    expect((await api(ana, '/projects', { companyId: bic })).status).toBe(403);
    // Victor holds Context only: ECG exposes no Client, Project or Request to
    // him, and he cannot select another Company.
    expect(
      objects(await read(victor, '/companies')).map(
        (company) => company.displayName,
      ),
    ).toEqual(['ECG']);
    for (const path of ['/clients', '/projects', '/commercial-intake/requests'])
      expect((await api(victor, path, { companyId: ecg })).status, path).toBe(
        403,
      );
    for (const companyId of [prisma, bic])
      expect(
        (await api(victor, '/access/current-actor', { companyId })).status,
      ).toBe(403);

    // Every committed step recorded exactly its module's normal event,
    // attributed to the owner for administration and to the persona otherwise.
    const ownerMembership = text(
      object(await read(OWNER, '/access/current-actor')).workspaceMembershipId,
    );
    const actorKeys = new Map<string, string>([
      [ownerMembership, 'owner'],
      ...DEMONSTRATION_PERSONAS.map((definition): [string, string] => [
        id(ids, `persona.${definition.key}`),
        definition.key,
      ]),
    ]);
    const events: Record<string, Record<string, number>> = {};
    for (const [table, actor] of Object.entries(EVENT_TABLES)) {
      const rows = await pool.query<{ actor: string; count: number }>(
        `SELECT ${actor}::text AS actor, count(*)::integer AS count FROM ${table} GROUP BY 1`,
      );
      events[table] = Object.fromEntries(
        rows.rows
          .map((row): [string, number] => [
            actorKeys.get(row.actor) ?? 'other',
            row.count,
          ])
          .sort(([left], [right]) => left.localeCompare(right)),
      );
    }
    expect(events).toEqual({
      activity_log_events: { ana: 5, ion: 1, maria: 3, owner: 30, victor: 1 },
      commercial_catalogue_events: { ana: 6, maria: 4 },
      commercial_intake_events: { ana: 5, maria: 2 },
      document_project_events: { ana: 2, maria: 1 },
      document_registration_events: { ana: 2, maria: 1 },
      pricing_configuration_events: { ana: 1, maria: 1 },
      project_creation_events: { ana: 1, ion: 1, maria: 2 },
      project_responsibility_events: { ana: 1, ion: 1, maria: 2 },
      task_events: { ana: 3, ion: 7, maria: 3 },
    });
    expect(
      (
        await pool.query<{ action: string }>(
          `SELECT DISTINCT action::text AS action FROM activity_log_events
            WHERE actor_workspace_membership_id = $1`,
          [ownerMembership],
        )
      ).rows
        .map((row) => row.action)
        .sort(),
    ).toEqual([
      'client_company_relationship.established',
      'company.registered',
      'company_commercial_activity_reader_assignment.granted',
      'company_commercial_intake_assignment.granted',
      'company_context_assignment.granted',
      'company_director_client_assignment.granted',
      'company_document_project_organizer_assignment.granted',
      'company_document_registrar_assignment.granted',
      'company_pricing_configuration_assignment.granted',
      'company_project_assignment.granted',
      'company_service_catalogue_assignment.granted',
      'company_task_manager_assignment.granted',
      'internal_user.provisioned',
    ]);
  }, 300_000);

  it('replays as a no-op and keeps a user correction', async () => {
    const first = await run();
    expect(first.kind).toBe('converged');
    const ids = recordIds(first);
    const prisma = id(ids, 'company.prisma-prim');
    const ana = persona('ana');
    const grupPath = `/clients/${id(ids, 'client.grup-demo')}`;
    const before = object(await read(ana, grupPath, prisma));
    const corrected = await api(ana, grupPath, {
      method: 'PATCH',
      companyId: prisma,
      key: 'ana-address-correction',
      body: {
        expectedVersion: before.version,
        address: 'DEMO Corrected Street 2, DEMO City',
      },
    });
    expect(corrected.status).toBe(200);
    const counts = await tableCounts();

    const second = await run();
    expect(second.kind).toBe('converged');
    expect(second.entries).toHaveLength(DEMONSTRATION_SCENARIO.steps.length);
    for (const entry of second.entries)
      expect(['replayed', 'present'], entry.step).toContain(entry.outcome);
    expect(second.entries.map((entry) => entry.recordId)).toEqual(
      first.entries.map((entry) => entry.recordId),
    );
    expect(await tableCounts()).toEqual(counts);
    expect(object(await read(ana, grupPath, prisma)).address).toBe(
      'DEMO Corrected Street 2, DEMO City',
    );
  }, 300_000);

  it('converges after an interrupted run to the state of an uninterrupted run', async () => {
    const uninterrupted = await run();
    expect(uninterrupted.kind).toBe('converged');
    const expectedCounts = await tableCounts();
    // Fresh runs compare Task and Offering content independently of creation-time order.
    const expectedModel = await readModel(uninterrupted, {
      normalizeConvergenceOrder: true,
    });
    // Cut points: inside the grants, between a Task and its transition, and
    // between the two rule publications.
    for (const lastStep of [
      'grant.ion.task-manager',
      'task.prerequisite-programmes',
      'pricing.prisma-prim.rule-v1',
    ]) {
      await pool.query(
        'TRUNCATE activity_log_events, workspace_memberships, internal_users, workspaces CASCADE',
      );
      expect((await run(prefix(lastStep))).kind, lastStep).toBe('converged');
      const resumed = await run();
      expect(resumed.kind, lastStep).toBe('converged');
      const resumedSteps = new Set(
        prefix(lastStep).steps.map((step) => step.key),
      );
      for (const entry of resumed.entries)
        expect(
          entry.outcome === 'created',
          `${lastStep}: ${entry.step} ${entry.outcome}`,
        ).toBe(!resumedSteps.has(entry.step));
      expect(await tableCounts(), lastStep).toEqual(expectedCounts);
      expect(
        await readModel(resumed, { normalizeConvergenceOrder: true }),
        lastStep,
      ).toEqual(expectedModel);
    }
  }, 600_000);

  it('stops at the refused step and never grants revoked authority again', async () => {
    const first = await run();
    expect(first.kind).toBe('converged');
    const ids = recordIds(first);
    const revoked = await api(
      OWNER,
      `/company-task-manager-assignments/${id(ids, 'persona.ion')}/${id(ids, 'company.prisma-prim')}`,
      { method: 'DELETE', key: 'revoke-ion-task-manager' },
    );
    expect(revoked.status).toBe(200);
    const counts = await tableCounts();

    const repeated = await run();
    expect(repeated.kind).toBe('stopped');
    if (repeated.kind !== 'stopped') return;
    expect(repeated.stop).toEqual({
      scenario: 'demo-v1',
      result: 'stopped',
      step: 'grant.ion.task-manager',
      reason: 'grant-revoked',
      status: null,
    });
    const stopIndex = DEMONSTRATION_SCENARIO.steps.findIndex(
      (step) => step.key === 'grant.ion.task-manager',
    );
    expect(repeated.entries.map((entry) => entry.step)).toEqual(
      DEMONSTRATION_SCENARIO.steps.slice(0, stopIndex).map((step) => step.key),
    );
    expect(await tableCounts()).toEqual(counts);
    const administration = object(
      await read(OWNER, '/company-context-assignments/administration'),
    );
    expect(
      objects(administration.assignments).filter(
        (assignment) =>
          assignment.workspaceMembershipId === id(ids, 'persona.ion') &&
          assignment.bundle === 'Company Task Manager',
      ),
    ).toEqual([]);
  }, 300_000);

  it('reports an operator-published rule head and never supersedes it', async () => {
    const partial = await run(prefix('pricing.bic.rule-v1', false));
    expect(partial.kind).toBe('converged');
    const ids = recordIds(partial);
    const bic = id(ids, 'company.bic');
    const maria = persona('maria');
    const published = await api(maria, '/pricing-configuration/rule-versions', {
      method: 'POST',
      companyId: bic,
      key: 'operator-published-rule',
      body: {
        label: 'DEMO operator rule',
        effectiveFrom: '2026-09-26T12:01:00.000Z',
        expectedActiveVersionNumber: null,
      },
    });
    expect(published.status).toBe(201);
    const operatorVersion = text(object(object(published.body).version).id);

    const completed = await run();
    expect(completed.kind).toBe('converged');
    expect(
      completed.entries.find((entry) => entry.step === 'pricing.bic.rule-v1'),
    ).toEqual({
      scenario: 'demo-v1',
      step: 'pricing.bic.rule-v1',
      outcome: 'present',
      recordId: operatorVersion,
      register: 'SUB-PR-03',
    });
    const versions = object(
      await read(maria, '/pricing-configuration/rule-versions', bic),
    );
    expect(versions.provisional).toBe(true);
    expect(
      objects(versions.items).map((version) => [
        version.versionNumber,
        version.label,
        version.supersession,
      ]),
    ).toEqual([[1, 'DEMO operator rule', null]]);
  }, 300_000);
});
