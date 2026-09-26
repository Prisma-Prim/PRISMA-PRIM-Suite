import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
  DEMONSTRATION_SCENARIO,
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
const RUN_CLOCK = { now: () => new Date('2026-09-26T12:00:00.000Z') };
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
  async function readModel(result: DemonstrationRunResult) {
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
          title: task.title,
          status: task.status,
          priority: task.priority,
          dueDate: task.dueDate,
          version: task.version,
          assignee: memberKey(task.assignee),
        }));
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
          subject: detail.subject,
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
      ).map((offering) => [
        object(offering.serviceDefinition).code,
        offering.provisional,
      ]);
      const rules = object(
        await read(principal, '/pricing-configuration/rule-scope', companyId),
      );
      return {
        clients: objects(await read(principal, '/clients', companyId)).map(
          (client) => client.displayName,
        ),
        projects: projectModels,
        requests,
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
    await pool.query(
      'TRUNCATE activity_log_events, workspace_memberships, internal_users, workspaces CASCADE',
    );
  });

  afterAll(async () => {
    await harness?.close();
    await database?.close();
  });

  it('seeds demo-v1 through the public commands with normal, attributed events and isolated personas', async () => {
    const result = await run();
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
    const expectedModel = await readModel(uninterrupted);
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
      expect(await readModel(resumed), lastStep).toEqual(expectedModel);
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
