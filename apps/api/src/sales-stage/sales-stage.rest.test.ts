import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { versionedCommandProtocolScenarios } from '../command/versioned-command-protocol.js';
import {
  createIsolatedPostgresTestDatabase,
  type IsolatedPostgresTestDatabase,
} from '../database/isolated-postgres-test-database.js';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000591';
const FOREIGN = {
  workspace: '00000000-0000-4000-8000-000000005911',
  user: '00000000-0000-4000-8000-000000005912',
  membership: '00000000-0000-4000-8000-000000005913',
  company: '00000000-0000-4000-8000-000000005914',
  request: '00000000-0000-4000-8000-000000005915',
  opportunity: '00000000-0000-4000-8000-000000005916',
  stage: '00000000-0000-4000-8000-000000005917',
};
const UNKNOWN_ID = '00000000-0000-4000-8000-000000005919';
const OWNER = 'workspace-owner';
const DISPLAY_NAMES = {
  [OWNER]: 'Workspace Owner',
  iurie: 'Iurie Popescu',
  ion: 'Ion Popa',
  maria: 'Maria Rusu',
  mihai: 'Mihai Stan',
} as const;
type Subject = keyof typeof DISPLAY_NAMES;
const ROUTES = {
  context: '/company-context-assignments',
  intake: '/company-commercial-intake-assignments',
  configuration: '/company-sales-stage-configuration-assignments',
  manager: '/company-opportunity-manager-assignments',
  reader: '/company-commercial-activity-reader-assignments',
  client: '/company-director-client-assignments',
} as const;
type Bundle = keyof typeof ROUTES;
const CONFIGURATOR: readonly Bundle[] = ['context', 'intake', 'configuration'];
const SALES: readonly Bundle[] = ['context', 'intake'];
const READER: readonly Bundle[] = ['context', 'intake', 'reader'];

type RequestOptions = {
  subject?: Subject;
  company?: string;
  method?: string;
  value?: unknown;
  key?: string;
  headers?: Record<string, string>;
};

describe.skipIf(!databaseUrl)('Sales Stage REST contract', () => {
  let database: IsolatedPostgresTestDatabase;
  let harness: PostgresRestTestHarness;
  let companyId: string;
  let otherCompanyId: string;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'sales_stage',
    });
    harness = await createPostgresRestTestHarness({
      databaseUrl: database.targetUrl,
      environment: {
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: OWNER,
        ACCESS_BOOTSTRAP_WORKSPACE_ID: WORKSPACE_ID,
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Sales Stages',
        ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify(
          ['iurie', 'ion', 'maria', 'mihai'].map((subject) => ({
            provider: 'deterministic-test',
            subject,
            workspaceId: WORKSPACE_ID,
          })),
        ),
      },
    });
  });
  afterAll(async () => {
    await harness?.close();
    await database?.close();
  });
  beforeEach(async () => {
    await harness.pool.query(
      'TRUNCATE activity_log_events, workspace_memberships, internal_users, workspaces CASCADE',
    );
    companyId = '';
    companyId = string(
      (await command('/companies', { displayName: 'PRISMA-PRIM' })).id,
    );
    otherCompanyId = string(
      (await command('/companies', { displayName: 'BIC' })).id,
    );
  });

  function request(path: string, options: RequestOptions = {}) {
    const {
      subject = OWNER,
      company = companyId,
      method = 'GET',
      value,
      key,
      headers = {},
    } = options;
    return fetch(`${harness.origin}/api${path}`, {
      method,
      headers: {
        ...identity(subject),
        ...(company ? { 'x-company-context-id': company } : {}),
        ...(key === undefined ? {} : { 'idempotency-key': key }),
        ...(value === undefined ? {} : { 'content-type': 'application/json' }),
        ...headers,
      },
      ...(value === undefined ? {} : { body: JSON.stringify(value) }),
    });
  }
  async function read(path: string, options: RequestOptions = {}) {
    const response = await request(path, options);
    expect(response.status).toBe(200);
    return body(response);
  }
  async function command(
    path: string,
    value: unknown,
    options: RequestOptions = {},
  ) {
    const response = await request(path, {
      company: '',
      key: randomUUID(),
      ...options,
      method: 'POST',
      value,
    });
    expect(response.status).toBe(201);
    return body(response);
  }
  async function membership(subject: Subject): Promise<string> {
    const actor = await read('/access/current-actor', {
      subject,
      company: '',
    });
    return string(actor.workspaceMembershipId);
  }
  async function grant(
    subject: Subject,
    bundles: readonly Bundle[],
    company = companyId,
  ): Promise<string> {
    const workspaceMembershipId = await membership(subject);
    for (const bundle of bundles)
      await command(ROUTES[bundle], {
        workspaceMembershipId,
        companyId: company,
      });
    return workspaceMembershipId;
  }
  async function revoke(
    bundle: Bundle,
    workspaceMembershipId: string,
    company = companyId,
  ) {
    const response = await request(
      `${ROUTES[bundle]}/${workspaceMembershipId}/${company}`,
      { method: 'DELETE', company: '', key: randomUUID() },
    );
    expect(response.status).toBe(200);
    return body(response);
  }
  // The captured v3 Commercial Intake bundle as delivered before v4 existed.
  async function captureIntakeVersion(
    workspaceMembershipId: string,
    version: 'v3',
  ) {
    await harness.pool.query(
      `UPDATE company_role_assignments SET permission_set_version = $2
        WHERE workspace_membership_id = $1 AND bundle = 'company_commercial_intake'
          AND revoked_at IS NULL`,
      [workspaceMembershipId, version],
    );
  }
  function stages(options: RequestOptions = {}) {
    return request('/sales-stages', { subject: 'iurie', ...options });
  }
  async function stageList(options: RequestOptions = {}) {
    const response = await stages(options);
    expect(response.status).toBe(200);
    return body(response);
  }
  function create(value: unknown, options: RequestOptions = {}) {
    return request('/sales-stages', {
      subject: 'iurie',
      key: randomUUID(),
      ...options,
      method: 'POST',
      value,
    });
  }
  async function created(label: string, options: RequestOptions = {}) {
    const expectedRevision = Number(
      (await stageList({ subject: options.subject ?? 'iurie', ...options }))
        .revision,
    );
    const response = await create({ expectedRevision, label }, options);
    expect(response.status, label).toBe(201);
    return object((await body(response)).receipt);
  }
  async function capture(subject: Subject, company = companyId) {
    return command(
      '/commercial-intake/requests',
      {
        originalText:
          'Please help us prepare the ISO 9001 audit of our quality processes.',
        sourceLabel: 'Manual entry from a phone request',
        subject: 'Solicitare audit ISO 9001 — demo',
        opportunity: {
          title: 'Prepare the ISO 9001 audit',
          scope: 'Initial discussion of the audit scope',
          nextAction: 'Arrange a qualification call',
        },
      },
      { subject, company },
    );
  }
  function opportunityOf(detail: Record<string, unknown>): string {
    return string(object(detail.initialOpportunity).id);
  }
  function setStage(
    opportunityId: string,
    value: unknown,
    options: RequestOptions = {},
  ) {
    return request(`/commercial-intake/opportunities/${opportunityId}/stage`, {
      subject: 'ion',
      key: randomUUID(),
      ...options,
      method: 'POST',
      value,
    });
  }
  async function stageSet(
    opportunityId: string,
    value: unknown,
    options: RequestOptions = {},
  ) {
    const response = await setStage(opportunityId, value, options);
    expect(response.status, JSON.stringify(value)).toBe(200);
    return body(response);
  }
  function stageHistory(
    opportunityId: string,
    options: RequestOptions & { cursor?: string } = {},
  ) {
    const { cursor, ...rest } = options;
    return request(
      `/commercial-intake/opportunities/${opportunityId}/stage-history${
        cursor === undefined ? '' : `?cursor=${encodeURIComponent(cursor)}`
      }`,
      { subject: 'ion', ...rest },
    );
  }
  async function opportunityRow(opportunityId: string) {
    const result = await harness.pool.query<Record<string, unknown>>(
      'SELECT * FROM opportunities WHERE id = $1',
      [opportunityId],
    );
    return object(result.rows[0]);
  }
  async function stageEvents(opportunityId: string) {
    return (
      await harness.pool.query<{ actor: string; metadata: unknown }>(
        `SELECT actor_workspace_membership_id AS actor, metadata
           FROM commercial_intake_events
          WHERE opportunity_id = $1 AND action = 'opportunity.stage.changed'
          ORDER BY (metadata ->> 'opportunityVersion')::integer`,
        [opportunityId],
      )
    ).rows;
  }
  async function stageReceipts(opportunityId: string) {
    return (
      await harness.pool.query<Record<string, unknown>>(
        `SELECT expected_version, result_version, outcome, sales_stage_id
           FROM commercial_intake_stage_commands
          WHERE opportunity_id = $1 ORDER BY created_at, result_version`,
        [opportunityId],
      )
    ).rows;
  }
  async function stageHistoryRows(opportunityId: string) {
    return (
      await harness.pool.query<Record<string, unknown>>(
        `SELECT opportunity_version, previous_sales_stage_id, previous_label,
                new_sales_stage_id, new_label
           FROM opportunity_stage_history
          WHERE opportunity_id = $1 ORDER BY opportunity_version`,
        [opportunityId],
      )
    ).rows;
  }
  async function configurationWrites(company = companyId) {
    const rows = async (text: string) =>
      (await harness.pool.query(text, [company])).rows;
    return {
      configuration: await rows(
        'SELECT revision FROM sales_stage_configurations WHERE company_id = $1',
      ),
      stages: await rows(
        'SELECT id, label, position, state FROM sales_stages WHERE company_id = $1 ORDER BY position',
      ),
      receipts: await rows(
        'SELECT expected_revision, result_revision, label FROM sales_stage_configuration_commands WHERE company_id = $1 ORDER BY result_revision',
      ),
      events: await rows(
        `SELECT actor_workspace_membership_id, metadata FROM sales_stage_events
          WHERE company_id = $1 ORDER BY (metadata ->> 'configurationRevision')::integer`,
      ),
    };
  }
  async function activity(subject: Subject, company = companyId) {
    return objects(
      (await read('/activity-log', { subject, company })).events,
    ).filter(
      (event) =>
        event.action === 'opportunity.stage.changed' ||
        event.action === 'sales_stage.configured',
    );
  }
  async function insertForeignWorkspaceStage(): Promise<void> {
    const query = (text: string, values: unknown[]) =>
      harness.pool.query(text, values);
    await query(`INSERT INTO workspaces (id, name) VALUES ($1, 'Foreign')`, [
      FOREIGN.workspace,
    ]);
    await query(
      `INSERT INTO internal_users (id, external_provider, external_subject, display_name, email)
       VALUES ($1, 'deterministic-test', 'foreign-owner', 'Foreign Owner', 'foreign@example.test')`,
      [FOREIGN.user],
    );
    await query(
      `INSERT INTO workspace_memberships (id, workspace_id, internal_user_id) VALUES ($1, $2, $3)`,
      [FOREIGN.membership, FOREIGN.workspace, FOREIGN.user],
    );
    await query(
      `INSERT INTO companies (id, workspace_id, display_name, created_by_internal_user_id,
         created_by_workspace_membership_id, registration_idempotency_key)
       VALUES ($1, $2, 'Foreign Company', $3, $4, 'foreign-company')`,
      [FOREIGN.company, FOREIGN.workspace, FOREIGN.user, FOREIGN.membership],
    );
    await query(
      `INSERT INTO client_requests (id, workspace_id, company_id, original_text,
         captured_by_internal_user_id, captured_by_workspace_membership_id)
       VALUES ($1, $2, $3, 'Foreign request text', $4, $5)`,
      [
        FOREIGN.request,
        FOREIGN.workspace,
        FOREIGN.company,
        FOREIGN.user,
        FOREIGN.membership,
      ],
    );
    await query(
      `INSERT INTO opportunities (id, workspace_id, company_id, client_request_id, title, next_action,
         responsible_internal_user_id, responsible_workspace_membership_id)
       VALUES ($1, $2, $3, $4, 'Foreign Opportunity', 'Foreign next action', $5, $6)`,
      [
        FOREIGN.opportunity,
        FOREIGN.workspace,
        FOREIGN.company,
        FOREIGN.request,
        FOREIGN.user,
        FOREIGN.membership,
      ],
    );
    await query(
      `INSERT INTO sales_stages (id, workspace_id, company_id, label, position,
         created_by_internal_user_id, created_by_workspace_membership_id)
       VALUES ($1, $2, $3, 'Foreign stage', 1, $4, $5)`,
      [
        FOREIGN.stage,
        FOREIGN.workspace,
        FOREIGN.company,
        FOREIGN.user,
        FOREIGN.membership,
      ],
    );
  }

  it('creates two stages from an empty Company, then assigns, changes and clears one with its history and events after reload', async () => {
    const iurie = await grant('iurie', CONFIGURATOR);
    const ion = await grant('ion', SALES);
    await grant('maria', READER);
    // An empty Company is at revision 0 with no stage, not a seeded list.
    expect(await stageList()).toEqual({ revision: 0, stages: [] });
    expect(await stageList({ subject: 'ion' })).toEqual({
      revision: 0,
      stages: [],
    });

    const first = await create({ expectedRevision: 0, label: 'Qualification' });
    expect(first.status).toBe(201);
    const firstBody = await body(first);
    const qualification = string(object(firstBody.receipt).salesStageId);
    expect(firstBody).toEqual({
      receipt: {
        operation: 'CREATED',
        salesStageId: qualification,
        label: 'Qualification',
        position: 1,
        revision: 1,
      },
      configuration: {
        revision: 1,
        stages: [
          {
            id: qualification,
            label: 'Qualification',
            position: 1,
            state: 'ACTIVE',
          },
        ],
      },
    });
    const negotiation = string(
      (await created('Negociere finală')).salesStageId,
    );
    expect(await stageList({ subject: 'ion' })).toEqual({
      revision: 2,
      stages: [
        {
          id: qualification,
          label: 'Qualification',
          position: 1,
          state: 'ACTIVE',
        },
        {
          id: negotiation,
          label: 'Negociere finală',
          position: 2,
          state: 'ACTIVE',
        },
      ],
    });

    const captured = await capture('ion');
    const requestId = string(captured.id);
    const opportunityId = opportunityOf(captured);
    expect(object(captured.initialOpportunity)).toMatchObject({
      salesStage: null,
      stageHistory: { entries: [] },
      version: 1,
    });
    const before = await opportunityRow(opportunityId);

    const assigned = await stageSet(opportunityId, {
      expectedVersion: 1,
      salesStageId: qualification,
    });
    expect(assigned.receipt).toEqual({
      opportunityId,
      salesStageId: qualification,
      version: 2,
      outcome: 'updated',
    });
    const detail = object(
      (
        await read(`/commercial-intake/requests/${requestId}`, {
          subject: 'ion',
        })
      ).initialOpportunity,
    );
    expect(detail).toMatchObject({
      version: 2,
      salesStage: {
        id: qualification,
        label: 'Qualification',
        state: 'ACTIVE',
      },
      stageHistory: {
        entries: [
          {
            previousStage: null,
            newStage: { salesStageId: qualification, label: 'Qualification' },
            version: 2,
            actor: {
              workspaceMembershipId: ion,
              displayLabel: expect.stringMatching(/^Ion Popa · [0-9A-Z]+$/u),
            },
            changedAt: expect.any(String),
          },
        ],
      },
    });
    const listed = objects(
      (await read('/commercial-intake/requests', { subject: 'ion' })).items,
    );
    expect(object(listed[0]?.initialOpportunity).salesStage).toEqual({
      id: qualification,
      label: 'Qualification',
      state: 'ACTIVE',
    });

    await stageSet(opportunityId, {
      expectedVersion: 2,
      salesStageId: negotiation,
    });
    const cleared = await stageSet(opportunityId, {
      expectedVersion: 3,
      salesStageId: null,
    });
    expect(cleared.receipt).toEqual({
      opportunityId,
      salesStageId: null,
      version: 4,
      outcome: 'updated',
    });

    // Reload after the clear: no stage, three entries newest first.
    const reloaded = object(
      (
        await read(`/commercial-intake/requests/${requestId}`, {
          subject: 'ion',
        })
      ).initialOpportunity,
    );
    expect(reloaded.salesStage).toBeNull();
    expect(
      objects(object(reloaded.stageHistory).entries).map((entry) => ({
        previous: entry.previousStage,
        next: entry.newStage,
        version: entry.version,
      })),
    ).toEqual([
      {
        previous: { salesStageId: negotiation, label: 'Negociere finală' },
        next: null,
        version: 4,
      },
      {
        previous: { salesStageId: qualification, label: 'Qualification' },
        next: { salesStageId: negotiation, label: 'Negociere finală' },
        version: 3,
      },
      {
        previous: null,
        next: { salesStageId: qualification, label: 'Qualification' },
        version: 2,
      },
    ]);
    expect(object(reloaded.stageHistory).nextCursor).toBeUndefined();
    expect(await body(await stageHistory(opportunityId))).toEqual(
      reloaded.stageHistory,
    );

    // Nothing else about the Opportunity changed through the stage command.
    const after = await opportunityRow(opportunityId);
    for (const field of [
      'title',
      'scope',
      'next_action',
      'status',
      'responsible_workspace_membership_id',
      'client_request_id',
      'company_id',
    ])
      expect(after[field], field).toEqual(before[field]);
    expect(after).toMatchObject({
      version: 4,
      sales_stage_id: null,
      last_updated_by_workspace_membership_id: ion,
    });

    // Exactly one attributed event per material change, with exact metadata.
    expect(await stageEvents(opportunityId)).toEqual([
      {
        actor: ion,
        metadata: {
          opportunityVersion: 2,
          previousStage: null,
          newStage: { salesStageId: qualification, label: 'Qualification' },
        },
      },
      {
        actor: ion,
        metadata: {
          opportunityVersion: 3,
          previousStage: {
            salesStageId: qualification,
            label: 'Qualification',
          },
          newStage: { salesStageId: negotiation, label: 'Negociere finală' },
        },
      },
      {
        actor: ion,
        metadata: {
          opportunityVersion: 4,
          previousStage: {
            salesStageId: negotiation,
            label: 'Negociere finală',
          },
          newStage: null,
        },
      },
    ]);
    expect((await configurationWrites()).events).toEqual([
      {
        actor_workspace_membership_id: iurie,
        metadata: {
          operation: 'CREATED',
          configurationRevision: 1,
          label: 'Qualification',
        },
      },
      {
        actor_workspace_membership_id: iurie,
        metadata: {
          operation: 'CREATED',
          configurationRevision: 2,
          label: 'Negociere finală',
        },
      },
    ]);

    // The Activity reader sees the projected fields only.
    const events = await activity('maria');
    expect(
      events.map(({ action, metadata, target, actor }) => ({
        action,
        metadata,
        target,
        actor: object(actor).displayName,
      })),
    ).toEqual([
      {
        action: 'opportunity.stage.changed',
        metadata: { previousLabel: 'Negociere finală', newLabel: null },
        target: {
          type: 'opportunity',
          opportunityId,
          clientRequestId: requestId,
          companyId,
        },
        actor: 'Ion Popa',
      },
      {
        action: 'opportunity.stage.changed',
        metadata: {
          previousLabel: 'Qualification',
          newLabel: 'Negociere finală',
        },
        target: {
          type: 'opportunity',
          opportunityId,
          clientRequestId: requestId,
          companyId,
        },
        actor: 'Ion Popa',
      },
      {
        action: 'opportunity.stage.changed',
        metadata: { previousLabel: null, newLabel: 'Qualification' },
        target: {
          type: 'opportunity',
          opportunityId,
          clientRequestId: requestId,
          companyId,
        },
        actor: 'Ion Popa',
      },
      {
        action: 'sales_stage.configured',
        metadata: { operation: 'CREATED', label: 'Negociere finală' },
        target: { type: 'sales_stage', salesStageId: negotiation, companyId },
        actor: 'Iurie Popescu',
      },
      {
        action: 'sales_stage.configured',
        metadata: { operation: 'CREATED', label: 'Qualification' },
        target: { type: 'sales_stage', salesStageId: qualification, companyId },
        actor: 'Iurie Popescu',
      },
    ]);
    // Without the reader bundle, neither event is visible.
    expect(await activity('ion')).toEqual([]);
    // A reader in another Company sees nothing of this one.
    await grant('maria', READER, otherCompanyId);
    expect(await activity('maria', otherCompanyId)).toEqual([]);
  });

  it('stores labels as submitted, refuses a case-insensitive duplicate and invalid labels, and writes nothing', async () => {
    await grant('iurie', CONFIGURATOR);
    const label = '  Pregătire contract ';
    expect((await created(label)).label).toBe(label);
    const before = await configurationWrites();
    for (const duplicate of [
      '  PREGĂTIRE CONTRACT ',
      '  pregătire contract ',
    ]) {
      const taken = await create({ expectedRevision: 1, label: duplicate });
      expect(taken.status).toBe(400);
      expect(await body(taken)).toMatchObject({
        code: 'SALES_STAGE_LABEL_TAKEN',
        field: 'label',
      });
    }
    for (const value of [
      { expectedRevision: 1, label: '' },
      { expectedRevision: 1, label: '   ' },
      { expectedRevision: 1, label: 'x'.repeat(81) },
      { expectedRevision: 1, label: 7 },
      { expectedRevision: 1 },
      { expectedRevision: -1, label: 'Negotiation' },
      { expectedRevision: 1.5, label: 'Negotiation' },
      { expectedRevision: 1, label: 'Negotiation', position: 1 },
      ['Negotiation'],
    ]) {
      const invalid = await create(value);
      expect(invalid.status, JSON.stringify(value)).toBe(400);
      expect(await body(invalid)).toMatchObject({ code: 'VALIDATION_ERROR' });
    }
    expect(
      (await create({ expectedRevision: 1, label: 'x'.repeat(80) })).status,
    ).toBe(201);
    const after = await configurationWrites();
    expect(after.stages).toHaveLength(2);
    expect(after.stages.slice(0, 1)).toEqual(before.stages);
  });

  it('refuses a stale revision and a 31st stage without committing anything', async () => {
    await grant('iurie', CONFIGURATOR);
    await created('Qualification');
    const stale = await create({ expectedRevision: 0, label: 'Negotiation' });
    expect(stale.status).toBe(409);
    expect(await body(stale)).toMatchObject({ code: 'STALE_CONFIGURATION' });
    const ahead = await create({ expectedRevision: 2, label: 'Negotiation' });
    expect(ahead.status).toBe(409);
    expect(await body(ahead)).toMatchObject({ code: 'STALE_CONFIGURATION' });

    for (let position = 2; position <= 30; position += 1)
      await created(`Stage ${position}`);
    const full = await stageList();
    expect(full.revision).toBe(30);
    expect(objects(full.stages).map((stage) => stage.position)).toEqual(
      Array.from({ length: 30 }, (_, index) => index + 1),
    );
    const before = await configurationWrites();
    const limit = await create({ expectedRevision: 30, label: 'Stage 31' });
    expect(limit.status).toBe(409);
    expect(await body(limit)).toMatchObject({ code: 'SALES_STAGE_LIMIT' });
    expect(await configurationWrites()).toEqual(before);
  });

  it('serializes concurrent creates at one revision so exactly one commits', async () => {
    await grant('iurie', CONFIGURATOR);
    await grant('mihai', CONFIGURATOR);
    const results = await Promise.all([
      create({ expectedRevision: 0, label: 'Qualification' }),
      create(
        { expectedRevision: 0, label: 'Negotiation' },
        { subject: 'mihai' },
      ),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    const writes = await configurationWrites();
    expect(writes.configuration).toEqual([{ revision: 1 }]);
    expect(writes.stages).toHaveLength(1);
    expect(writes.events).toHaveLength(1);
  });

  it('requires the configuration bundle with live Commercial Intake read and Company context, and records its lifecycle', async () => {
    const iurie = await grant('iurie', ['context', 'configuration']);
    // Configuration without Commercial Intake read authorizes nothing.
    expect((await create({ expectedRevision: 0, label: 'A' })).status).toBe(
      403,
    );
    expect((await stages()).status).toBe(403);
    await grant('iurie', ['intake']);
    await revoke('context', iurie);
    expect((await create({ expectedRevision: 0, label: 'A' })).status).toBe(
      403,
    );
    await grant('iurie', ['context']);
    expect((await create({ expectedRevision: 0, label: 'A' })).status).toBe(
      201,
    );

    // Intake readers read the list but cannot configure it.
    await grant('ion', SALES);
    expect((await stages({ subject: 'ion' })).status).toBe(200);
    expect(
      (await create({ expectedRevision: 1, label: 'B' }, { subject: 'ion' }))
        .status,
    ).toBe(403);
    // The configuration bundle belongs to its own Company only.
    expect(
      (
        await create(
          { expectedRevision: 0, label: 'B' },
          { company: otherCompanyId },
        )
      ).status,
    ).toBe(403);

    // A repeated grant changes nothing; each actual transition records one
    // bundle-label-only event.
    await command(ROUTES.configuration, {
      workspaceMembershipId: iurie,
      companyId,
    });
    const revoked = await revoke('configuration', iurie);
    expect(revoked).toMatchObject({
      bundle: 'Company Sales Stage Configuration',
      permissionSetVersion: 'v1',
      active: false,
    });
    await revoke('configuration', iurie);
    expect((await create({ expectedRevision: 1, label: 'B' })).status).toBe(
      403,
    );
    const lifecycle = await harness.pool.query<Record<string, unknown>>(
      `SELECT action::text AS action, metadata, target_company_id, target_workspace_membership_id
         FROM activity_log_events
        WHERE action::text LIKE 'company_sales_stage_configuration_assignment.%'
        ORDER BY occurred_at, id`,
    );
    expect(lifecycle.rows).toEqual([
      {
        action: 'company_sales_stage_configuration_assignment.granted',
        metadata: { bundle: 'Company Sales Stage Configuration' },
        target_company_id: companyId,
        target_workspace_membership_id: iurie,
      },
      {
        action: 'company_sales_stage_configuration_assignment.revoked',
        metadata: { bundle: 'Company Sales Stage Configuration' },
        target_company_id: companyId,
        target_workspace_membership_id: iurie,
      },
    ]);
  });

  it('refuses unknown, other-Company and foreign-Workspace stages uniformly and hides other Opportunities', async () => {
    await grant('iurie', CONFIGURATOR);
    await grant('iurie', CONFIGURATOR, otherCompanyId);
    await grant('ion', SALES);
    await grant('ion', SALES, otherCompanyId);
    await created('Qualification');
    const otherStage = string(
      (await created('Qualification', { company: otherCompanyId }))
        .salesStageId,
    );
    await insertForeignWorkspaceStage();
    const opportunityId = opportunityOf(await capture('ion'));
    const otherOpportunityId = opportunityOf(
      await capture('ion', otherCompanyId),
    );
    const bodies = [];
    for (const salesStageId of [UNKNOWN_ID, otherStage, FOREIGN.stage]) {
      const unavailable = await setStage(opportunityId, {
        expectedVersion: 1,
        salesStageId,
      });
      expect(unavailable.status).toBe(409);
      bodies.push(await body(unavailable));
    }
    expect(bodies[0]).toMatchObject({ code: 'SALES_STAGE_UNAVAILABLE' });
    expect(bodies[1]).toEqual(bodies[0]);
    expect(bodies[2]).toEqual(bodies[0]);
    for (const salesStageId of ['not-a-stage', 7, undefined])
      expect(
        (await setStage(opportunityId, { expectedVersion: 1, salesStageId }))
          .status,
      ).toBe(400);
    expect(await opportunityRow(opportunityId)).toMatchObject({
      version: 1,
      sales_stage_id: null,
    });
    expect(await stageReceipts(opportunityId)).toEqual([]);

    // Other-Company and foreign-Workspace Opportunities are not found.
    const notFound = [];
    for (const target of [
      otherOpportunityId,
      FOREIGN.opportunity,
      UNKNOWN_ID,
    ]) {
      const hidden = await setStage(target, {
        expectedVersion: 1,
        salesStageId: null,
      });
      expect(hidden.status).toBe(404);
      notFound.push(await hidden.text());
      expect((await stageHistory(target)).status).toBe(404);
    }
    expect(new Set(notFound).size).toBe(1);
    // Each Company's list shows its own stages only.
    expect(
      objects((await stageList({ company: otherCompanyId })).stages).map(
        (stage) => stage.id,
      ),
    ).toEqual([otherStage]);
  });

  it('denies a v3-only member while a v4 holder keeps every v1 to v3 behaviour, and stops on revocation', async () => {
    await grant('iurie', CONFIGURATOR);
    const qualification = string((await created('Qualification')).salesStageId);
    const ion = await grant('ion', [...SALES, 'client']);
    const actor = await read('/access/current-actor', { subject: 'ion' });
    expect(object(actor.activeCompany)).toMatchObject({
      commercialIntakePermissionSetVersion: 'v4',
      commercialIntakePermissions: [
        'commercial.request.read',
        'commercial.request.create',
        'commercial.opportunity.read',
        'commercial.opportunity.create',
        'commercial.opportunity.next_action.update',
        'commercial.request.client.associate',
        'commercial.opportunity.stage.set',
      ],
    });
    // v1: capture and read; v2: next action; v3: one-time Client association.
    const captured = await capture('ion');
    const opportunityId = opportunityOf(captured);
    const nextAction = await request(
      `/commercial-intake/opportunities/${opportunityId}/next-action`,
      {
        subject: 'ion',
        method: 'POST',
        key: randomUUID(),
        value: { expectedVersion: 1, nextAction: 'Send the questionnaire' },
      },
    );
    expect(nextAction.status).toBe(200);
    const client = await command(
      '/clients',
      { displayName: 'Stage Client' },
      { company: companyId },
    );
    const association = await request(
      `/commercial-intake/requests/${string(captured.id)}/client-association`,
      {
        subject: 'ion',
        method: 'POST',
        key: randomUUID(),
        value: { expectedVersion: 1, clientAccountId: string(client.id) },
      },
    );
    expect(association.status).toBe(200);
    await stageSet(opportunityId, {
      expectedVersion: 2,
      salesStageId: qualification,
    });

    // A captured v3 assignment never expands in place.
    await captureIntakeVersion(ion, 'v3');
    const denied = await setStage(opportunityId, {
      expectedVersion: 3,
      salesStageId: null,
    });
    expect(denied.status).toBe(403);
    expect(
      (
        await read(`/commercial-intake/requests/${string(captured.id)}`, {
          subject: 'ion',
        })
      ).id,
    ).toBe(captured.id);
    // Only revocation and a fresh grant capture v4.
    await revoke('intake', ion);
    expect(
      (
        await setStage(opportunityId, {
          expectedVersion: 3,
          salesStageId: null,
        })
      ).status,
    ).toBe(403);
    await grant('ion', ['intake']);
    await stageSet(opportunityId, { expectedVersion: 3, salesStageId: null });
    // Losing Company context, which the Client bundle also confers, removes
    // the assignment authority as well.
    await revoke('context', ion);
    await revoke('client', ion);
    expect(
      (
        await setStage(opportunityId, {
          expectedVersion: 4,
          salesStageId: qualification,
        })
      ).status,
    ).toBe(403);
    expect(await stageEvents(opportunityId)).toHaveLength(2);
  });

  it('records a no-op receipt without an event, refuses a stale version and is accepted in every outcome status', async () => {
    await grant('iurie', CONFIGURATOR);
    await grant('ion', [...SALES, 'manager']);
    const qualification = string((await created('Qualification')).salesStageId);
    const opportunityId = opportunityOf(await capture('ion'));
    const clearNothing = await stageSet(opportunityId, {
      expectedVersion: 1,
      salesStageId: null,
    });
    expect(clearNothing.receipt).toEqual({
      opportunityId,
      salesStageId: null,
      version: 1,
      outcome: 'unchanged',
    });
    await stageSet(opportunityId, {
      expectedVersion: 1,
      salesStageId: qualification,
    });
    const same = await stageSet(opportunityId, {
      expectedVersion: 2,
      salesStageId: qualification,
    });
    expect(same.receipt).toMatchObject({ outcome: 'unchanged', version: 2 });
    const stale = await setStage(opportunityId, {
      expectedVersion: 1,
      salesStageId: null,
    });
    expect(stale.status).toBe(409);
    expect(await body(stale)).toMatchObject({ code: 'STALE_VERSION' });
    expect(await stageEvents(opportunityId)).toHaveLength(1);
    expect(await stageHistoryRows(opportunityId)).toHaveLength(1);

    for (const [index, status] of ['WON', 'OPEN', 'ON_HOLD'].entries()) {
      const version = 3 + index * 2;
      const outcome = await request(
        `/commercial-intake/opportunities/${opportunityId}/outcome`,
        {
          subject: 'ion',
          method: 'POST',
          key: randomUUID(),
          value: {
            expectedVersion: version - 1,
            status,
            ...(status === 'OPEN' ? { reason: 'Client came back' } : {}),
            ...(status === 'ON_HOLD' ? { reason: 'Budget freeze' } : {}),
          },
        },
      );
      expect(outcome.status, status).toBe(200);
      const changed = await stageSet(opportunityId, {
        expectedVersion: version,
        salesStageId: index % 2 === 0 ? null : qualification,
      });
      expect(object(object(changed.request).initialOpportunity).status).toBe(
        status,
      );
    }
  });

  it('lets at most one of two concurrent assignments on one observed version commit', async () => {
    await grant('iurie', CONFIGURATOR);
    await grant('ion', SALES);
    await grant('mihai', SALES);
    const qualification = string((await created('Qualification')).salesStageId);
    const negotiation = string((await created('Negotiation')).salesStageId);
    const opportunityId = opportunityOf(await capture('ion'));
    const results = await Promise.all([
      setStage(opportunityId, {
        expectedVersion: 1,
        salesStageId: qualification,
      }),
      setStage(
        opportunityId,
        { expectedVersion: 1, salesStageId: negotiation },
        { subject: 'mihai' },
      ),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect(await opportunityRow(opportunityId)).toMatchObject({ version: 2 });
    expect(await stageEvents(opportunityId)).toHaveLength(1);
    expect(await stageHistoryRows(opportunityId)).toHaveLength(1);
  });

  it('pages the stage history 50 entries at a time from an opaque cursor', async () => {
    await grant('iurie', CONFIGURATOR);
    await grant('ion', SALES);
    const qualification = string((await created('Qualification')).salesStageId);
    const captured = await capture('ion');
    const opportunityId = opportunityOf(captured);
    for (let version = 1; version <= 52; version += 1)
      await stageSet(opportunityId, {
        expectedVersion: version,
        salesStageId: version % 2 === 1 ? qualification : null,
      });
    const detail = object(
      (
        await read(`/commercial-intake/requests/${string(captured.id)}`, {
          subject: 'ion',
        })
      ).initialOpportunity,
    );
    const firstPage = object(detail.stageHistory);
    expect(objects(firstPage.entries).map((entry) => entry.version)).toEqual(
      Array.from({ length: 50 }, (_, index) => 53 - index),
    );
    const older = await stageHistory(opportunityId, {
      cursor: string(firstPage.nextCursor),
    });
    expect(older.status).toBe(200);
    const olderPage = await body(older);
    expect(objects(olderPage.entries).map((entry) => entry.version)).toEqual([
      3, 2,
    ]);
    expect(olderPage.nextCursor).toBeUndefined();
    expect(
      (await stageHistory(opportunityId, { cursor: 'not-a-cursor' })).status,
    ).toBe(400);
  });

  it('rolls back the change, history and receipt when the event cannot be recorded', async () => {
    await grant('iurie', CONFIGURATOR);
    await grant('ion', SALES);
    const qualification = string((await created('Qualification')).salesStageId);
    const opportunityId = opportunityOf(await capture('ion'));
    const key = randomUUID();
    await harness.pool.query(`
      CREATE FUNCTION reject_stage_change() RETURNS trigger AS $$
      BEGIN
        IF NEW.action = 'opportunity.stage.changed' THEN
          RAISE EXCEPTION 'forced event failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER reject_stage_change BEFORE INSERT ON commercial_intake_events
        FOR EACH ROW EXECUTE FUNCTION reject_stage_change();
    `);
    try {
      expect(
        (
          await setStage(
            opportunityId,
            { expectedVersion: 1, salesStageId: qualification },
            { key },
          )
        ).status,
      ).toBe(500);
      expect(await opportunityRow(opportunityId)).toMatchObject({
        version: 1,
        sales_stage_id: null,
      });
      expect(await stageHistoryRows(opportunityId)).toEqual([]);
      expect(await stageReceipts(opportunityId)).toEqual([]);
    } finally {
      await harness.pool.query(
        'DROP TRIGGER reject_stage_change ON commercial_intake_events; DROP FUNCTION reject_stage_change()',
      );
    }
    const retried = await stageSet(
      opportunityId,
      { expectedVersion: 1, salesStageId: qualification },
      { key },
    );
    expect(retried.receipt).toMatchObject({ outcome: 'updated', version: 2 });
  });

  describe('shared versioned command protocol: Sales Stage creation', () => {
    for (const scenario of versionedCommandProtocolScenarios({
      acceptedStatus: 201,
      staleCode: 'STALE_CONFIGURATION',
      receipt: (value) => object(value).receipt,
      arrange: async () => {
        const iurie = await grant('iurie', CONFIGURATOR);
        await grant('mihai', CONFIGURATOR);
        const version = async () => Number((await stageList()).revision);
        return {
          payload: ({ expectedVersion, variant }) => ({
            expectedRevision: expectedVersion,
            label: variant === 'first' ? 'Qualification' : 'Negotiation',
          }),
          submit: async ({ value, key }) => {
            const response = await create(value, { key });
            return { status: response.status, body: await body(response) };
          },
          version,
          writes: () => configurationWrites(),
          changeLater: async () => {
            const response = await create(
              { expectedRevision: await version(), label: 'Pregătire ofertă' },
              { subject: 'mihai' },
            );
            expect(response.status).toBe(201);
          },
          revokeAuthority: async () => {
            await revoke('configuration', iurie);
          },
        };
      },
    }))
      it(scenario.name, scenario.run);
  });

  describe('shared versioned command protocol: Sales Stage assignment', () => {
    for (const scenario of versionedCommandProtocolScenarios({
      acceptedStatus: 200,
      receipt: (value) => object(value).receipt,
      arrange: async () => {
        await grant('iurie', CONFIGURATOR);
        const ion = await grant('ion', SALES);
        const stagesByVariant = {
          first: string((await created('Qualification')).salesStageId),
          second: string((await created('Negotiation')).salesStageId),
        };
        const opportunityId = opportunityOf(await capture('ion'));
        const version = async () =>
          Number((await opportunityRow(opportunityId)).version);
        return {
          payload: ({ expectedVersion, variant }) => ({
            expectedVersion,
            salesStageId: stagesByVariant[variant],
          }),
          submit: async ({ value, key }) => {
            const response = await setStage(opportunityId, value, { key });
            return { status: response.status, body: await body(response) };
          },
          version,
          writes: async () => ({
            opportunity: await opportunityRow(opportunityId),
            receipts: await stageReceipts(opportunityId),
            history: await stageHistoryRows(opportunityId),
            events: await stageEvents(opportunityId),
          }),
          changeLater: async () => {
            const response = await request(
              `/commercial-intake/opportunities/${opportunityId}/next-action`,
              {
                subject: 'ion',
                method: 'POST',
                key: randomUUID(),
                value: {
                  expectedVersion: await version(),
                  nextAction: 'Send the audit questionnaire',
                },
              },
            );
            expect(response.status).toBe(200);
          },
          revokeAuthority: async () => {
            await revoke('intake', ion);
          },
        };
      },
    }))
      it(scenario.name, scenario.run);
  });
});

function identity(subject: Subject): Record<string, string> {
  return {
    'x-test-external-provider': 'deterministic-test',
    'x-test-external-subject': subject,
    'x-test-display-name': DISPLAY_NAMES[subject],
    'x-test-email': `${subject}@example.test`,
  };
}
function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Expected an object.');
  return Object.fromEntries(Object.entries(value));
}
function objects(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error('Expected an array.');
  const values: unknown[] = value;
  return values.map(object);
}
function string(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Expected a string.');
  return value;
}
async function body(response: Response): Promise<Record<string, unknown>> {
  const value: unknown = await response.json();
  return object(value);
}
