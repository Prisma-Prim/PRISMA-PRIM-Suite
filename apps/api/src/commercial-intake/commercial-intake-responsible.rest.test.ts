import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createIsolatedPostgresTestDatabase,
  type IsolatedPostgresTestDatabase,
} from '../database/isolated-postgres-test-database.js';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000399';
const FOREIGN = {
  workspace: '00000000-0000-4000-8000-000000003991',
  user: '00000000-0000-4000-8000-000000003992',
  membership: '00000000-0000-4000-8000-000000003993',
  company: '00000000-0000-4000-8000-000000003994',
  request: '00000000-0000-4000-8000-000000003995',
  opportunity: '00000000-0000-4000-8000-000000003996',
};
const UNKNOWN_ID = '00000000-0000-4000-8000-000000003999';
const OWNER = 'workspace-owner';
const DISPLAY_NAMES = {
  [OWNER]: 'Workspace Owner',
  ada: 'Ada Ionescu',
  elena: 'Elena Vasile',
  ion: 'Ion Popa',
  maria: 'Maria Rusu',
  mihai: 'Mihai Stan',
  nora: 'Nora Dinu',
} as const;
type Subject = keyof typeof DISPLAY_NAMES;
const ROUTES = {
  context: '/company-context-assignments',
  intake: '/company-commercial-intake-assignments',
  manager: '/company-opportunity-manager-assignments',
  reader: '/company-commercial-activity-reader-assignments',
  client: '/company-director-client-assignments',
  project: '/company-project-assignments',
  task: '/company-task-manager-assignments',
  document: '/company-document-registrar-assignments',
} as const;
type Bundle = keyof typeof ROUTES;
const MANAGER: readonly Bundle[] = ['context', 'intake', 'manager'];
const ELIGIBLE: readonly Bundle[] = ['context', 'intake'];

type RequestOptions = {
  subject?: Subject;
  company?: string;
  method?: string;
  value?: unknown;
  key?: string;
  headers?: Record<string, string>;
};

describe.skipIf(!databaseUrl)(
  'Opportunity responsible actor reassignment REST contract',
  () => {
    let database: IsolatedPostgresTestDatabase;
    let harness: PostgresRestTestHarness;
    let companyId: string;
    let otherCompanyId: string;

    async function openHarness(): Promise<void> {
      harness = await createPostgresRestTestHarness({
        databaseUrl: database.targetUrl,
        environment: {
          NODE_ENV: 'test',
          ACCESS_IDENTITY_MODE: 'test',
          ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
          ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: OWNER,
          ACCESS_BOOTSTRAP_WORKSPACE_ID: WORKSPACE_ID,
          ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Opportunity Reassignment',
          ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify(
            ['ada', 'elena', 'ion', 'maria', 'mihai', 'nora'].map(
              (subject) => ({
                provider: 'deterministic-test',
                subject,
                workspaceId: WORKSPACE_ID,
              }),
            ),
          ),
        },
      });
    }

    beforeAll(async () => {
      if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
      database = await createIsolatedPostgresTestDatabase({
        baseDatabaseUrl: databaseUrl,
        namePrefix: 'opportunity_reassignment',
      });
      await openHarness();
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
          ...(value === undefined
            ? {}
            : { 'content-type': 'application/json' }),
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
    async function membership(subject: Subject) {
      const actor = await read('/access/current-actor', {
        subject,
        company: '',
      });
      return {
        workspaceMembershipId: string(actor.workspaceMembershipId),
        internalUserId: string(actor.internalUserId),
      };
    }
    async function grant(
      subject: Subject,
      bundles: readonly Bundle[],
      company = companyId,
    ): Promise<string> {
      const { workspaceMembershipId } = await membership(subject);
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
    async function suspend(workspaceMembershipId: string) {
      await command('/workspace-membership-suspensions', {
        workspaceMembershipId,
      });
    }
    async function capture(
      subject: Subject,
      extra: Record<string, unknown> = {},
      company = companyId,
    ) {
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
          ...extra,
        },
        { subject, company },
      );
    }
    function opportunityOf(detail: Record<string, unknown>): string {
      return string(object(detail.initialOpportunity).id);
    }
    function reassign(
      opportunityId: string,
      value: unknown,
      options: RequestOptions = {},
    ) {
      return request(
        `/commercial-intake/opportunities/${opportunityId}/responsible`,
        {
          subject: 'ada',
          key: randomUUID(),
          ...options,
          method: 'POST',
          value,
        },
      );
    }
    async function reassigned(
      opportunityId: string,
      value: unknown,
      options: RequestOptions = {},
    ) {
      const response = await reassign(opportunityId, value, options);
      expect(response.status).toBe(200);
      return body(response);
    }
    function updateNextAction(
      opportunityId: string,
      value: unknown,
      options: RequestOptions = {},
    ) {
      return request(
        `/commercial-intake/opportunities/${opportunityId}/next-action`,
        {
          subject: 'ada',
          key: randomUUID(),
          ...options,
          method: 'POST',
          value,
        },
      );
    }
    function eligible(opportunityId: string, options: RequestOptions = {}) {
      return request(
        `/commercial-intake/opportunities/${opportunityId}/eligible-responsible-actors`,
        { subject: 'ada', ...options },
      );
    }
    async function candidates(
      opportunityId: string,
      options: RequestOptions = {},
    ) {
      const response = await eligible(opportunityId, options);
      expect(response.status).toBe(200);
      const page = await body(response);
      expect(Object.keys(page)).toEqual(['members']);
      const members = objects(page.members);
      for (const entry of members)
        expect(Object.keys(entry)).toEqual([
          'workspaceMembershipId',
          'displayLabel',
        ]);
      return members;
    }
    async function candidate(opportunityId: string, id: string) {
      return object(
        (await candidates(opportunityId)).find(
          (entry) => entry.workspaceMembershipId === id,
        ),
      );
    }
    async function opportunityRow(opportunityId: string) {
      const result = await harness.pool.query<Record<string, unknown>>(
        'SELECT * FROM opportunities WHERE id = $1',
        [opportunityId],
      );
      return object(result.rows[0]);
    }
    async function requestRow(requestId: string) {
      const result = await harness.pool.query<Record<string, unknown>>(
        'SELECT * FROM client_requests WHERE id = $1',
        [requestId],
      );
      return object(result.rows[0]);
    }
    async function responsibleEvents(opportunityId: string) {
      return (
        await harness.pool.query<{
          actor: string;
          company: string;
          metadata: unknown;
        }>(
          `SELECT actor_workspace_membership_id AS actor, company_id AS company, metadata
             FROM commercial_intake_events
            WHERE opportunity_id = $1 AND action = 'opportunity.responsible.changed'
            ORDER BY occurred_at, id`,
          [opportunityId],
        )
      ).rows;
    }
    async function nextActionEvents(opportunityId: string) {
      return (
        await harness.pool.query(
          `SELECT id FROM commercial_intake_events
            WHERE opportunity_id = $1 AND action = 'opportunity.next_action.updated'`,
          [opportunityId],
        )
      ).rows;
    }
    async function receipts(opportunityId: string) {
      return (
        await harness.pool.query<{
          outcome: string;
          expected_version: number;
          result_version: number;
          responsible_workspace_membership_id: string;
        }>(
          `SELECT outcome, expected_version, result_version, responsible_workspace_membership_id
             FROM commercial_intake_responsible_commands
            WHERE opportunity_id = $1 ORDER BY created_at, id`,
          [opportunityId],
        )
      ).rows;
    }
    async function clientVersions() {
      return (
        await harness.pool.query<{ id: string; version: number }>(
          'SELECT id, version FROM client_accounts ORDER BY id',
        )
      ).rows;
    }
    async function expectUnchanged(
      opportunityId: string,
      responsible: string,
      version = 1,
    ) {
      expect(await opportunityRow(opportunityId)).toMatchObject({
        responsible_workspace_membership_id: responsible,
        version,
      });
    }
    async function commercialActivity(options: RequestOptions) {
      return objects((await read('/activity-log', options)).events).filter(
        (event) => event.action === 'opportunity.responsible.changed',
      );
    }
    async function waitForLockWaiters(
      pattern: string,
      expected: number,
    ): Promise<void> {
      for (let attempt = 0; attempt < 400; attempt += 1) {
        const waiting = await harness.pool.query<{ count: string }>(
          `SELECT count(*) AS count
             FROM pg_stat_activity
            WHERE datname = current_database()
              AND wait_event_type = 'Lock'
              AND query ILIKE $1`,
          [pattern],
        );
        if (Number(waiting.rows[0]?.count) >= expected) return;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error(`Expected ${expected} lock waiter(s) on ${pattern}.`);
    }
    async function barrier(
      statement: string,
      values: unknown[] = [],
    ): Promise<PoolClient> {
      const connection = await harness.pool.connect();
      try {
        await connection.query('BEGIN');
        await connection.query(statement, values);
        return connection;
      } catch (error) {
        await connection.query('ROLLBACK');
        connection.release();
        throw error;
      }
    }
    async function insertForeignWorkspaceOpportunity(): Promise<void> {
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
    }

    it('lets a manager hand an Opportunity to an eligible colleague, shown after reload and restart with one attributed event', async () => {
      const ada = await grant('ada', [...MANAGER, 'client']);
      const ion = await grant('ion', ELIGIBLE);
      // A legacy captured Intake v1 still carries both reads.
      await harness.pool.query(
        `UPDATE company_role_assignments SET permission_set_version = 'v1'
          WHERE workspace_membership_id = $1 AND bundle = 'company_commercial_intake' AND revoked_at IS NULL`,
        [ion],
      );
      const client = string(
        (
          await command(
            '/clients',
            { displayName: 'Synthetic Audit Client' },
            { company: companyId },
          )
        ).id,
      );
      const created = await capture('ada', { clientAccountId: client });
      const opportunityId = opportunityOf(created);
      const requestId = string(created.id);
      const members = await candidates(opportunityId);
      expect(members.map((entry) => entry.workspaceMembershipId)).toEqual([
        ada,
        ion,
      ]);
      const [adaEntry, ionEntry] = members;
      const opportunityBefore = await opportunityRow(opportunityId);
      const requestBefore = await requestRow(requestId);
      const clientsBefore = await clientVersions();

      const result = await reassigned(opportunityId, {
        expectedVersion: 1,
        workspaceMembershipId: ion,
      });

      const expected = {
        ...created,
        initialOpportunity: {
          ...object(created.initialOpportunity),
          responsibleWorkspaceMembershipId: ion,
          responsibleActor: {
            workspaceMembershipId: ion,
            displayName: DISPLAY_NAMES.ion,
          },
          version: 2,
        },
      };
      expect(result).toEqual({
        receipt: {
          opportunityId,
          workspaceMembershipId: ion,
          version: 2,
          outcome: 'updated',
        },
        request: expected,
      });
      expect(
        await read(`/commercial-intake/requests/${requestId}`, {
          subject: 'ada',
        }),
      ).toEqual(expected);
      const listed = objects(
        (await read('/commercial-intake/requests', { subject: 'ada' })).items,
      );
      expect(object(listed[0]?.initialOpportunity)).toEqual({
        title: 'Prepare the ISO 9001 audit',
        nextAction: 'Arrange a qualification call',
        responsibleActor: {
          workspaceMembershipId: ion,
          displayName: DISPLAY_NAMES.ion,
        },
      });

      // Only the responsible actor, version and last-mutation attribution move.
      const { internalUserId: ionUser } = await membership('ion');
      const { internalUserId: adaUser } = await membership('ada');
      const opportunityAfter = await opportunityRow(opportunityId);
      expect(opportunityAfter).toEqual({
        ...opportunityBefore,
        responsible_internal_user_id: ionUser,
        responsible_workspace_membership_id: ion,
        version: 2,
        last_updated_by_internal_user_id: adaUser,
        last_updated_by_workspace_membership_id: ada,
        last_updated_at: expect.any(Date),
      });
      expect(await requestRow(requestId)).toEqual(requestBefore);
      expect(await clientVersions()).toEqual(clientsBefore);
      expect(await responsibleEvents(opportunityId)).toEqual([
        {
          actor: ada,
          company: companyId,
          metadata: {
            opportunityVersion: 2,
            before: adaEntry,
            after: ionEntry,
          },
        },
      ]);
      expect(await receipts(opportunityId)).toEqual([
        {
          outcome: 'updated',
          expected_version: 1,
          result_version: 2,
          responsible_workspace_membership_id: ion,
        },
      ]);

      await harness.close();
      await openHarness();
      expect(
        await read(`/commercial-intake/requests/${requestId}`, {
          subject: 'ada',
        }),
      ).toEqual(expected);

      // Next-action updates keep working whoever is responsible.
      const updated = await updateNextAction(opportunityId, {
        expectedVersion: 2,
        nextAction: 'Send the audit questionnaire',
      });
      expect(updated.status).toBe(200);
      expect(object((await body(updated)).request)).toMatchObject({
        initialOpportunity: {
          nextAction: 'Send the audit questionnaire',
          responsibleWorkspaceMembershipId: ion,
          version: 3,
        },
      });
    });

    it('administers captured Company Opportunity Manager v1 with one lifecycle event per actual change and no other authority', async () => {
      const ada = (await membership('ada')).workspaceMembershipId;
      const key = randomUUID();
      const granted = await command(
        ROUTES.manager,
        { workspaceMembershipId: ada, companyId },
        { key },
      );
      expect(granted).toEqual({
        id: expect.any(String),
        workspaceMembershipId: ada,
        companyId,
        active: true,
        bundle: 'Company Opportunity Manager',
        permissionSetVersion: 'v1',
      });
      expect(
        await command(
          ROUTES.manager,
          { workspaceMembershipId: ada, companyId },
          { key },
        ),
      ).toEqual(granted);
      expect(
        await command(ROUTES.manager, {
          workspaceMembershipId: ada,
          companyId,
        }),
      ).toEqual(granted);
      const denied = await request(ROUTES.manager, {
        subject: 'ada',
        company: '',
        method: 'POST',
        key: randomUUID(),
        value: { workspaceMembershipId: ada, companyId },
      });
      expect(denied.status).toBe(403);

      // The bundle confers no Company context, Request read or Activity read.
      expect(
        (await request('/access/current-actor', { subject: 'ada' })).status,
      ).toBe(403);
      await grant('ada', ['context']);
      const actor = await read('/access/current-actor', { subject: 'ada' });
      const company = object(actor.activeCompany);
      expect(company.opportunityManagerPermissions).toEqual([
        'commercial.opportunity.assign',
      ]);
      expect(company.opportunityManagerPermissionSetVersion).toBe('v1');
      expect(company.opportunityManagerPermissionAssignmentId).toBe(granted.id);
      for (const absent of [
        'commercialIntakePermissions',
        'commercialActivityPermissions',
        'projectPermissions',
        'taskPermissions',
        'pricingConfigurationPermissions',
        'serviceCataloguePermissions',
      ])
        expect(company).not.toHaveProperty(absent);
      expect(company.clientPermissions).toEqual([]);
      expect(
        (await request('/commercial-intake/requests', { subject: 'ada' }))
          .status,
      ).toBe(403);

      const administration = await read(
        '/company-context-assignments/administration',
        { company: '' },
      );
      expect(objects(administration.assignments)).toContainEqual(granted);

      expect(await revoke('manager', ada)).toEqual({
        ...granted,
        active: false,
      });
      expect((await revoke('manager', ada)).active).toBe(false);
      const { workspaceMembershipId: owner } = await membership(OWNER);
      const history = await harness.pool.query(
        `SELECT action::text AS action, actor_workspace_membership_id AS actor,
                target_type::text AS "targetType", target_company_id AS company,
                target_workspace_membership_id AS member,
                target_company_role_assignment_id AS assignment, metadata
           FROM activity_log_events
          WHERE action::text LIKE 'company_opportunity_manager_assignment.%'
          ORDER BY occurred_at, action`,
      );
      const lifecycle = {
        actor: owner,
        targetType: 'company_role_assignment',
        company: companyId,
        member: ada,
        assignment: granted.id,
        metadata: { bundle: 'Company Opportunity Manager' },
      };
      expect(history.rows).toEqual([
        {
          action: 'company_opportunity_manager_assignment.granted',
          ...lifecycle,
        },
        {
          action: 'company_opportunity_manager_assignment.revoked',
          ...lifecycle,
        },
      ]);
      // Visible under administration only; never commercial history.
      const ownerActions = objects(
        (await read('/activity-log', { company: '' })).events,
      ).map((event) => event.action);
      expect(ownerActions).toEqual(
        expect.arrayContaining([
          'company_opportunity_manager_assignment.granted',
          'company_opportunity_manager_assignment.revoked',
        ]),
      );
      await grant('ada', ['intake', 'reader']);
      const readerActions = objects(
        (await read('/activity-log', { subject: 'ada' })).events,
      ).map((event) => event.action);
      expect(readerActions).not.toContain(
        'company_opportunity_manager_assignment.granted',
      );
      const rows = await harness.pool.query(
        `SELECT permission_set_version FROM company_role_assignments
          WHERE bundle = 'company_opportunity_manager'`,
      );
      expect(rows.rows).toEqual([{ permission_set_version: 'v1' }]);
    });

    it.each([
      {
        denied: 'Commercial Intake alone',
        subject: 'maria',
        prepare: () => grant('maria', ELIGIBLE),
      },
      {
        denied: 'the manager bundle alone',
        subject: 'maria',
        prepare: () => grant('maria', ['context', 'manager']),
      },
      {
        denied: 'the bundle and Intake without Company context',
        subject: 'maria',
        prepare: () => grant('maria', ['intake', 'manager']),
      },
      {
        denied: 'a revoked manager bundle',
        subject: 'maria',
        prepare: async () => revoke('manager', await grant('maria', MANAGER)),
      },
      {
        denied: 'a suspended manager',
        subject: 'maria',
        prepare: async () => suspend(await grant('maria', MANAGER)),
      },
      {
        denied: 'a manager of another Company',
        subject: 'maria',
        prepare: () => grant('maria', MANAGER, otherCompanyId),
      },
      {
        denied: 'a Workspace owner holding every other bundle',
        subject: OWNER,
        prepare: () =>
          grant(OWNER, [
            'context',
            'intake',
            'client',
            'project',
            'task',
            'document',
            'reader',
          ]),
      },
    ] satisfies Array<{
      denied: string;
      subject: Subject;
      prepare: () => Promise<unknown>;
    }>)(
      'denies $denied on the command and the eligible list without writing',
      async ({ subject, prepare }) => {
        const ada = await grant('ada', MANAGER);
        const ion = await grant('ion', ELIGIBLE);
        const opportunityId = opportunityOf(await capture('ada'));
        await prepare();
        for (const response of [
          await reassign(
            opportunityId,
            { expectedVersion: 1, workspaceMembershipId: ion },
            { subject },
          ),
          await eligible(opportunityId, { subject }),
        ]) {
          expect(response.status).toBe(403);
          const text = await response.text();
          expect(text).not.toContain(opportunityId);
          expect(text).not.toContain(DISPLAY_NAMES.ion);
        }
        await expectUnchanged(opportunityId, ada);
        expect(await responsibleEvents(opportunityId)).toEqual([]);
        expect(await receipts(opportunityId)).toEqual([]);
      },
    );

    it('answers an unknown, cross-Company or cross-Workspace Opportunity with the Request detail not-found', async () => {
      const ada = await grant('ada', MANAGER);
      await grant('ada', MANAGER, otherCompanyId);
      const ion = await grant('ion', ELIGIBLE);
      const opportunityId = opportunityOf(await capture('ada'));
      await insertForeignWorkspaceOpportunity();
      const missing = await request(
        `/commercial-intake/requests/${UNKNOWN_ID}`,
        { subject: 'ada' },
      );
      expect(missing.status).toBe(404);
      const notFound = await missing.text();
      const value = { expectedVersion: 1, workspaceMembershipId: ion };
      for (const response of [
        await reassign(opportunityId, value, { company: otherCompanyId }),
        await eligible(opportunityId, { company: otherCompanyId }),
        await reassign(UNKNOWN_ID, value),
        await eligible(UNKNOWN_ID),
        await reassign(FOREIGN.opportunity, value),
        await eligible(FOREIGN.opportunity),
      ]) {
        expect(response.status).toBe(404);
        const text = await response.text();
        expect(text).toBe(notFound);
        expect(text).not.toContain(opportunityId);
      }
      const foreignContext = await reassign(opportunityId, value, {
        headers: { 'x-workspace-context-id': FOREIGN.workspace },
      });
      expect(foreignContext.status).toBe(403);
      expect(await foreignContext.text()).not.toContain(opportunityId);
      const anonymous = await fetch(
        `${harness.origin}/api/commercial-intake/opportunities/${opportunityId}/responsible`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': randomUUID(),
          },
          body: JSON.stringify(value),
        },
      );
      expect(anonymous.status).toBe(401);
      await expectUnchanged(opportunityId, ada);
      expect(await responsibleEvents(opportunityId)).toEqual([]);
      expect(
        (
          await harness.pool.query(
            'SELECT * FROM commercial_intake_responsible_commands',
          )
        ).rows,
      ).toEqual([]);
      expect(await opportunityRow(FOREIGN.opportunity)).toMatchObject({
        version: 1,
        responsible_workspace_membership_id: FOREIGN.membership,
      });
    });

    it.each(['v1', 'v2', 'v3'] as const)(
      'keeps Manager reassignment and candidate eligibility with captured Intake %s',
      async (version) => {
        const ada = await grant('ada', MANAGER);
        const ion = await grant('ion', ELIGIBLE);
        await harness.pool.query(
          `UPDATE company_role_assignments SET permission_set_version = $1
            WHERE workspace_membership_id IN ($2, $3)
              AND bundle = 'company_commercial_intake' AND revoked_at IS NULL`,
          [version, ada, ion],
        );
        const opportunityId = opportunityOf(await capture('ada'));
        expect(
          (await candidates(opportunityId)).map(
            (entry) => entry.workspaceMembershipId,
          ),
        ).toEqual([ada, ion]);
        const denied = await reassign(
          opportunityId,
          {
            expectedVersion: 1,
            workspaceMembershipId: ada,
          },
          { subject: 'ion' },
        );
        expect(denied.status).toBe(403);
        await reassigned(opportunityId, {
          expectedVersion: 1,
          workspaceMembershipId: ion,
        });
        await expectUnchanged(opportunityId, ion, 2);
        expect(await responsibleEvents(opportunityId)).toHaveLength(1);
        expect(await receipts(opportunityId)).toHaveLength(1);
      },
    );

    it('lists only eligible members without directory data and rejects every ineligible target with one unavailable response', async () => {
      const ada = await grant('ada', MANAGER);
      const ion = await grant('ion', ELIGIBLE);
      const maria = await grant('maria', ['context']);
      const mihai = await grant('mihai', ['intake']);
      const elena = await grant('elena', ELIGIBLE, otherCompanyId);
      const nora = await grant('nora', ELIGIBLE);
      await suspend(nora);
      await insertForeignWorkspaceOpportunity();
      const opportunityId = opportunityOf(await capture('ada'));

      const members = await candidates(opportunityId);
      expect(members).toEqual([
        {
          workspaceMembershipId: ada,
          displayLabel: expect.stringMatching(/^Ada Ionescu · [0-9A-Z]+$/u),
        },
        {
          workspaceMembershipId: ion,
          displayLabel: expect.stringMatching(/^Ion Popa · [0-9A-Z]+$/u),
        },
      ]);
      const page = JSON.stringify(members);
      for (const hidden of ['@', maria, mihai, elena, nora, 'Workspace Owner'])
        expect(page).not.toContain(hidden);

      const rejections: unknown[] = [];
      for (const target of [
        UNKNOWN_ID,
        maria,
        mihai,
        elena,
        nora,
        FOREIGN.membership,
      ]) {
        const response = await reassign(opportunityId, {
          expectedVersion: 1,
          workspaceMembershipId: target,
        });
        expect(response.status).toBe(400);
        rejections.push(await body(response));
      }
      expect(rejections[0]).toEqual({
        code: 'RESPONSIBLE_ACTOR_UNAVAILABLE',
        message: expect.any(String),
      });
      for (const rejection of rejections)
        expect(rejection).toEqual(rejections[0]);
      await expectUnchanged(opportunityId, ada);
      expect(await responsibleEvents(opportunityId)).toEqual([]);
      expect(await receipts(opportunityId)).toEqual([]);
    });

    it.each(['v1', 'v2', 'v3'] as const)(
      'accepts Registrar %s as effective Company context when separate Intake read remains live',
      async (version) => {
        await grant('ada', MANAGER);
        const ion = await grant('ion', ['document', 'intake']);
        await harness.pool.query(
          `UPDATE company_role_assignments SET permission_set_version = $1
            WHERE workspace_membership_id = $2
              AND bundle = 'company_document_registrar' AND revoked_at IS NULL`,
          [version, ion],
        );
        const opportunityId = opportunityOf(await capture('ada'));

        expect(
          (await candidates(opportunityId)).map(
            (entry) => entry.workspaceMembershipId,
          ),
        ).toContain(ion);
        await reassigned(opportunityId, {
          expectedVersion: 1,
          workspaceMembershipId: ion,
        });

        await expectUnchanged(opportunityId, ion, 2);
        expect(await responsibleEvents(opportunityId)).toHaveLength(1);
        expect(await receipts(opportunityId)).toHaveLength(1);
      },
    );

    it('fails closed for null, unknown or revoked Registrar context and never treats Registrar as Intake read', async () => {
      const ada = await grant('ada', MANAGER);
      const ion = await grant('ion', ['document', 'intake']);
      const maria = await grant('maria', ['document']);
      const opportunityId = opportunityOf(await capture('ada'));

      const initiallyEligible = (await candidates(opportunityId)).map(
        (entry) => entry.workspaceMembershipId,
      );
      expect(initiallyEligible).toContain(ion);
      expect(initiallyEligible).not.toContain(maria);
      expect(
        (
          await reassign(opportunityId, {
            expectedVersion: 1,
            workspaceMembershipId: maria,
          })
        ).status,
      ).toBe(400);

      const [assignment] = (
        await harness.pool.query<{ id: string }>(
          `SELECT id FROM company_role_assignments
            WHERE workspace_membership_id = $1
              AND bundle = 'company_document_registrar' AND revoked_at IS NULL`,
          [ion],
        )
      ).rows;
      if (!assignment) throw new Error('Expected a live Registrar assignment.');
      const [constraint] = (
        await harness.pool.query<{ definition: string }>(
          `SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
            WHERE conname = 'company_role_assignments_permission_set_version_check'`,
        )
      ).rows;
      if (!constraint) throw new Error('Expected the captured-version check.');
      await harness.pool.query(
        'ALTER TABLE company_role_assignments DROP CONSTRAINT company_role_assignments_permission_set_version_check',
      );
      try {
        for (const version of [null, 'v4']) {
          await harness.pool.query(
            'UPDATE company_role_assignments SET permission_set_version = $1 WHERE id = $2',
            [version, assignment.id],
          );
          expect(
            (await candidates(opportunityId)).map(
              (entry) => entry.workspaceMembershipId,
            ),
          ).not.toContain(ion);
          expect(
            (
              await reassign(opportunityId, {
                expectedVersion: 1,
                workspaceMembershipId: ion,
              })
            ).status,
          ).toBe(400);
        }
      } finally {
        await harness.pool.query(
          "UPDATE company_role_assignments SET permission_set_version = 'v3' WHERE id = $1",
          [assignment.id],
        );
        await harness.pool.query(
          `ALTER TABLE company_role_assignments
             ADD CONSTRAINT company_role_assignments_permission_set_version_check ${constraint.definition}`,
        );
      }

      await revoke('document', ion);
      expect(
        (await candidates(opportunityId)).map(
          (entry) => entry.workspaceMembershipId,
        ),
      ).not.toContain(ion);
      expect(
        (
          await reassign(opportunityId, {
            expectedVersion: 1,
            workspaceMembershipId: ion,
          })
        ).status,
      ).toBe(400);
      await expectUnchanged(opportunityId, ada);
      expect(await responsibleEvents(opportunityId)).toEqual([]);
      expect(await receipts(opportunityId)).toEqual([]);
    });

    it.each(['revocation', 'suspension'] as const)(
      'keeps a responsible actor who loses eligibility by %s on record without access, and lets a manager replace them',
      async (loss) => {
        const ada = await grant('ada', MANAGER);
        const ion = await grant('ion', ELIGIBLE);
        const mihai = await grant('mihai', ELIGIBLE);
        const created = await capture('ada');
        const opportunityId = opportunityOf(created);
        const adaEntry = await candidate(opportunityId, ada);
        const ionEntry = await candidate(opportunityId, ion);
        const mihaiEntry = await candidate(opportunityId, mihai);
        await reassigned(opportunityId, {
          expectedVersion: 1,
          workspaceMembershipId: ion,
        });
        if (loss === 'revocation') await revoke('intake', ion);
        else await suspend(ion);

        const detail = await read(
          `/commercial-intake/requests/${string(created.id)}`,
          { subject: 'ada' },
        );
        expect(object(detail.initialOpportunity)).toMatchObject({
          responsibleWorkspaceMembershipId: ion,
          responsibleActor: {
            workspaceMembershipId: ion,
            displayName: DISPLAY_NAMES.ion,
          },
          version: 2,
        });
        expect(
          (await candidates(opportunityId)).map(
            (entry) => entry.workspaceMembershipId,
          ),
        ).toEqual([ada, mihai]);
        // Being responsible grants nothing.
        expect(
          (await request('/commercial-intake/requests', { subject: 'ion' }))
            .status,
        ).toBe(403);
        // Naming the recorded member again is a no-op without eligibility check.
        expect(
          object(
            (
              await reassigned(opportunityId, {
                expectedVersion: 2,
                workspaceMembershipId: ion,
              })
            ).receipt,
          ),
        ).toEqual({
          opportunityId,
          workspaceMembershipId: ion,
          version: 2,
          outcome: 'unchanged',
        });
        await reassigned(opportunityId, {
          expectedVersion: 2,
          workspaceMembershipId: mihai,
        });
        expect(
          (await responsibleEvents(opportunityId)).map(
            (event) => event.metadata,
          ),
        ).toEqual([
          { opportunityVersion: 2, before: adaEntry, after: ionEntry },
          { opportunityVersion: 3, before: ionEntry, after: mihaiEntry },
        ]);
      },
    );

    it('validates the exact command after authorization and writes nothing', async () => {
      const ada = await grant('ada', MANAGER);
      const ion = await grant('ion', ELIGIBLE);
      const opportunityId = opportunityOf(await capture('ada'));
      expect(
        (await reassign(opportunityId, {}, { subject: 'ion' })).status,
      ).toBe(403);
      for (const [value, field] of [
        [{}, 'expectedVersion'],
        [{ expectedVersion: 1 }, 'workspaceMembershipId'],
        [
          { expectedVersion: 1, workspaceMembershipId: null },
          'workspaceMembershipId',
        ],
        [
          { expectedVersion: 1, workspaceMembershipId: 'ion' },
          'workspaceMembershipId',
        ],
        [
          { expectedVersion: '1', workspaceMembershipId: ion },
          'expectedVersion',
        ],
        [{ expectedVersion: 0, workspaceMembershipId: ion }, 'expectedVersion'],
        [
          { expectedVersion: 2_147_483_648, workspaceMembershipId: ion },
          'expectedVersion',
        ],
        [
          {
            expectedVersion: 1,
            workspaceMembershipId: ion,
            nextAction: 'Changed',
          },
          'change',
        ],
        [[], 'change'],
      ] satisfies Array<[unknown, string]>) {
        const response = await reassign(opportunityId, value);
        expect(response.status).toBe(400);
        expect(await body(response)).toMatchObject({
          code: 'VALIDATION_ERROR',
          field,
        });
      }
      const withoutKey = await request(
        `/commercial-intake/opportunities/${opportunityId}/responsible`,
        {
          subject: 'ada',
          method: 'POST',
          value: { expectedVersion: 1, workspaceMembershipId: ion },
        },
      );
      expect(withoutKey.status).toBe(400);
      expect(
        (
          await reassign('not-an-opportunity', {
            expectedVersion: 1,
            workspaceMembershipId: ion,
          })
        ).status,
      ).toBe(400);
      await expectUnchanged(opportunityId, ada);
      expect(await responsibleEvents(opportunityId)).toEqual([]);
      expect(await receipts(opportunityId)).toEqual([]);
    });

    it('records an unchanged no-op and shares one version with the next-action update in both directions', async () => {
      const ada = await grant('ada', MANAGER);
      const ion = await grant('ion', ELIGIBLE);
      const created = await capture('ada');
      const opportunityId = opportunityOf(created);
      const unchanged = await reassigned(opportunityId, {
        expectedVersion: 1,
        workspaceMembershipId: ada,
      });
      expect(unchanged).toEqual({
        receipt: {
          opportunityId,
          workspaceMembershipId: ada,
          version: 1,
          outcome: 'unchanged',
        },
        request: created,
      });
      expect(await responsibleEvents(opportunityId)).toEqual([]);
      const stale = await reassign(opportunityId, {
        expectedVersion: 2,
        workspaceMembershipId: ada,
      });
      expect(stale.status).toBe(409);
      expect(await body(stale)).toEqual({
        code: 'STALE_VERSION',
        message: 'Reload the Request before retrying.',
      });

      expect(
        (
          await updateNextAction(opportunityId, {
            expectedVersion: 1,
            nextAction: 'Book the audit call',
          })
        ).status,
      ).toBe(200);
      const afterNextAction = await reassign(opportunityId, {
        expectedVersion: 1,
        workspaceMembershipId: ion,
      });
      expect(afterNextAction.status).toBe(409);
      expect(await body(afterNextAction)).toMatchObject({
        code: 'STALE_VERSION',
      });
      await reassigned(opportunityId, {
        expectedVersion: 2,
        workspaceMembershipId: ion,
      });
      const staleNextAction = await updateNextAction(opportunityId, {
        expectedVersion: 2,
        nextAction: 'Superseded next action',
      });
      expect(staleNextAction.status).toBe(409);
      expect(await body(staleNextAction)).toMatchObject({
        code: 'STALE_VERSION',
      });
      expect(await opportunityRow(opportunityId)).toMatchObject({
        version: 3,
        next_action: 'Book the audit call',
        responsible_workspace_membership_id: ion,
      });
      expect(
        (await receipts(opportunityId)).sort(
          (left, right) => left.expected_version - right.expected_version,
        ),
      ).toEqual([
        {
          outcome: 'unchanged',
          expected_version: 1,
          result_version: 1,
          responsible_workspace_membership_id: ada,
        },
        {
          outcome: 'updated',
          expected_version: 2,
          result_version: 3,
          responsible_workspace_membership_id: ion,
        },
      ]);
      expect(await responsibleEvents(opportunityId)).toHaveLength(1);
      expect(await nextActionEvents(opportunityId)).toHaveLength(1);
    });

    it('replays an exact command before the stale check, conflicts on any changed payload and denies replay after revocation', async () => {
      const ada = await grant('ada', MANAGER);
      const ion = await grant('ion', ELIGIBLE);
      const mihai = await grant('mihai', ELIGIBLE);
      const opportunityId = opportunityOf(await capture('ada'));
      const second = opportunityOf(await capture('ada'));
      const key = randomUUID();
      const first = await reassigned(
        opportunityId,
        { expectedVersion: 1, workspaceMembershipId: ion },
        { key },
      );
      expect(
        await reassigned(
          opportunityId,
          { expectedVersion: 1, workspaceMembershipId: ion },
          { key },
        ),
      ).toEqual(first);
      await reassigned(opportunityId, {
        expectedVersion: 2,
        workspaceMembershipId: mihai,
      });
      const replay = await reassigned(
        opportunityId,
        { expectedVersion: 1, workspaceMembershipId: ion },
        { key },
      );
      expect(replay.receipt).toEqual(first.receipt);
      expect(object(replay.request).initialOpportunity).toMatchObject({
        responsibleWorkspaceMembershipId: mihai,
        version: 3,
      });
      for (const [target, value] of [
        [opportunityId, { expectedVersion: 1, workspaceMembershipId: mihai }],
        [opportunityId, { expectedVersion: 3, workspaceMembershipId: ion }],
        [second, { expectedVersion: 1, workspaceMembershipId: ion }],
      ] satisfies Array<[string, unknown]>) {
        const changed = await reassign(target, value, { key });
        expect(changed.status).toBe(409);
        expect(await body(changed)).toMatchObject({
          code: 'IDEMPOTENCY_CONFLICT',
        });
      }
      await revoke('manager', ada);
      const revoked = await reassign(
        opportunityId,
        { expectedVersion: 1, workspaceMembershipId: ion },
        { key },
      );
      expect(revoked.status).toBe(403);
      expect(await responsibleEvents(opportunityId)).toHaveLength(2);
      expect(await responsibleEvents(second)).toEqual([]);
      await expectUnchanged(opportunityId, mihai, 3);
    });

    it('refuses a material change from the PostgreSQL integer maximum and still confirms a no-op there', async () => {
      const ada = await grant('ada', MANAGER);
      const ion = await grant('ion', ELIGIBLE);
      const opportunityId = opportunityOf(await capture('ada'));
      const { internalUserId } = await membership('ada');
      await harness.pool.query(
        `UPDATE opportunities
            SET version = 2147483647, last_updated_by_internal_user_id = $2,
                last_updated_by_workspace_membership_id = $3, last_updated_at = now()
          WHERE id = $1`,
        [opportunityId, internalUserId, ada],
      );
      const exhausted = await reassign(opportunityId, {
        expectedVersion: 2_147_483_647,
        workspaceMembershipId: ion,
      });
      expect(exhausted.status).toBe(409);
      expect(await body(exhausted)).toEqual({
        code: 'VERSION_EXHAUSTED',
        message: 'The Opportunity version cannot be incremented.',
      });
      expect(await receipts(opportunityId)).toEqual([]);
      expect(
        object(
          (
            await reassigned(opportunityId, {
              expectedVersion: 2_147_483_647,
              workspaceMembershipId: ada,
            })
          ).receipt,
        ),
      ).toMatchObject({ outcome: 'unchanged', version: 2_147_483_647 });
      await expectUnchanged(opportunityId, ada, 2_147_483_647);
      expect(await responsibleEvents(opportunityId)).toEqual([]);
    });

    it('lets exactly one of a reassignment and a next-action update commit on one version', async () => {
      const ada = await grant('ada', MANAGER);
      const ion = await grant('ion', ELIGIBLE);
      // A different member updates the next action: a request by the same
      // member would queue behind the other's share lock at actor resolution.
      await grant('maria', ELIGIBLE);
      const opportunityId = opportunityOf(await capture('ada'));
      const held = await barrier(
        'SELECT id FROM opportunities WHERE id = $1 FOR UPDATE',
        [opportunityId],
      );
      let released = false;
      try {
        const reassignment = reassign(opportunityId, {
          expectedVersion: 1,
          workspaceMembershipId: ion,
        });
        const nextAction = updateNextAction(
          opportunityId,
          { expectedVersion: 1, nextAction: 'Racing next action' },
          { subject: 'maria' },
        );
        await waitForLockWaiters('%from "opportunities"%for no key update%', 2);
        await held.query('COMMIT');
        released = true;
        const outcomes = await Promise.all([reassignment, nextAction]);
        expect(outcomes.map((response) => response.status).sort()).toEqual([
          200, 409,
        ]);
        const loser = outcomes.find((response) => response.status === 409);
        expect(loser && (await body(loser))).toMatchObject({
          code: 'STALE_VERSION',
        });
        const reassignmentWon = outcomes[0]?.status === 200;
        expect(await opportunityRow(opportunityId)).toMatchObject({
          version: 2,
          responsible_workspace_membership_id: reassignmentWon ? ion : ada,
          next_action: reassignmentWon
            ? 'Arrange a qualification call'
            : 'Racing next action',
        });
        expect(await responsibleEvents(opportunityId)).toHaveLength(
          reassignmentWon ? 1 : 0,
        );
        expect(await nextActionEvents(opportunityId)).toHaveLength(
          reassignmentWon ? 0 : 1,
        );
      } finally {
        if (!released) await held.query('ROLLBACK');
        held.release();
      }
    }, 30_000);

    it('lets exactly one of two reassignments commit on one version and converges exact retries', async () => {
      await grant('ada', MANAGER);
      await grant('mihai', MANAGER);
      const ion = await grant('ion', ELIGIBLE);
      const elena = await grant('elena', ELIGIBLE);
      const opportunityId = opportunityOf(await capture('ada'));
      const held = await barrier(
        'SELECT id FROM opportunities WHERE id = $1 FOR UPDATE',
        [opportunityId],
      );
      let released = false;
      try {
        const first = reassign(opportunityId, {
          expectedVersion: 1,
          workspaceMembershipId: ion,
        });
        const second = reassign(
          opportunityId,
          { expectedVersion: 1, workspaceMembershipId: elena },
          { subject: 'mihai' },
        );
        await waitForLockWaiters('%from "opportunities"%for no key update%', 2);
        await held.query('COMMIT');
        released = true;
        const outcomes = await Promise.all([first, second]);
        expect(outcomes.map((response) => response.status).sort()).toEqual([
          200, 409,
        ]);
        const winner = outcomes[0]?.status === 200 ? ion : elena;
        expect(await opportunityRow(opportunityId)).toMatchObject({
          version: 2,
          responsible_workspace_membership_id: winner,
        });
        expect(await responsibleEvents(opportunityId)).toHaveLength(1);
      } finally {
        if (!released) await held.query('ROLLBACK');
        held.release();
      }

      const key = randomUUID();
      const value = {
        expectedVersion: 2,
        workspaceMembershipId:
          (await opportunityRow(opportunityId))
            .responsible_workspace_membership_id === ion
            ? elena
            : ion,
      };
      const retries = await Promise.all([
        reassign(opportunityId, value, { key }),
        reassign(opportunityId, value, { key }),
      ]);
      expect(retries.map((response) => response.status)).toEqual([200, 200]);
      const [one, two] = await Promise.all(retries.map(body));
      expect(one?.receipt).toEqual(two?.receipt);
      expect(one?.receipt).toMatchObject({ outcome: 'updated', version: 3 });
      expect(await responsibleEvents(opportunityId)).toHaveLength(2);
    }, 30_000);

    describe.each(['revocation', 'suspension'] as const)(
      "the target's %s",
      (change) => {
        function changeTarget(ion: string) {
          return change === 'revocation'
            ? request(`${ROUTES.intake}/${ion}/${companyId}`, {
                method: 'DELETE',
                company: '',
                key: randomUUID(),
              })
            : request('/workspace-membership-suspensions', {
                method: 'POST',
                company: '',
                key: randomUUID(),
                value: { workspaceMembershipId: ion },
              });
        }
        const changedStatus = change === 'revocation' ? 200 : 201;

        it('committed first leaves the reassignment unavailable', async () => {
          const ada = await grant('ada', MANAGER);
          const ion = await grant('ion', ELIGIBLE);
          const opportunityId = opportunityOf(await capture('ada'));
          const held = await barrier(
            'SELECT id FROM opportunities WHERE id = $1 FOR UPDATE',
            [opportunityId],
          );
          let released = false;
          try {
            const pending = reassign(opportunityId, {
              expectedVersion: 1,
              workspaceMembershipId: ion,
            });
            await waitForLockWaiters(
              '%from "opportunities"%for no key update%',
              1,
            );
            // The waiting reassignment holds no lock the change needs.
            expect((await changeTarget(ion)).status).toBe(changedStatus);
            await held.query('COMMIT');
            released = true;
            const outcome = await pending;
            expect(outcome.status).toBe(400);
            expect(await body(outcome)).toMatchObject({
              code: 'RESPONSIBLE_ACTOR_UNAVAILABLE',
            });
          } finally {
            if (!released) await held.query('ROLLBACK');
            held.release();
          }
          await expectUnchanged(opportunityId, ada);
          expect(await responsibleEvents(opportunityId)).toEqual([]);
          expect(await receipts(opportunityId)).toEqual([]);
        }, 30_000);

        it('waiting behind the reassignment commits after it', async () => {
          await grant('ada', MANAGER);
          const ion = await grant('ion', ELIGIBLE);
          const opportunityId = opportunityOf(await capture('ada'));
          // SHARE mode admits the row lock but holds the command at its write,
          // after it share-locked the target's authority.
          const held = await barrier('LOCK TABLE opportunities IN SHARE MODE');
          let released = false;
          try {
            const pending = reassign(opportunityId, {
              expectedVersion: 1,
              workspaceMembershipId: ion,
            });
            await waitForLockWaiters('update "opportunities"%', 1);
            const targetChange = changeTarget(ion);
            await waitForLockWaiters(
              '%from "workspace_memberships"%for update%',
              1,
            );
            await held.query('COMMIT');
            released = true;
            expect((await pending).status).toBe(200);
            expect((await targetChange).status).toBe(changedStatus);
          } finally {
            if (!released) await held.query('ROLLBACK');
            held.release();
          }
          await expectUnchanged(opportunityId, ion, 2);
          expect(await responsibleEvents(opportunityId)).toHaveLength(1);
        }, 30_000);
      },
    );

    it("denies a reassignment waiting on the manager's revocation and every later replay", async () => {
      const ada = await grant('ada', MANAGER);
      const ion = await grant('ion', ELIGIBLE);
      const opportunityId = opportunityOf(await capture('ada'));
      const held = await barrier(
        `SELECT id FROM company_role_assignments
          WHERE workspace_membership_id = $1 AND bundle = 'company_opportunity_manager'
            AND revoked_at IS NULL FOR UPDATE`,
        [ada],
      );
      let released = false;
      const key = randomUUID();
      try {
        const pending = reassign(
          opportunityId,
          { expectedVersion: 1, workspaceMembershipId: ion },
          { key },
        );
        await waitForLockWaiters(
          '%from "company_role_assignments"%for share%',
          1,
        );
        await held.query(
          `UPDATE company_role_assignments SET revoked_at = clock_timestamp()
            WHERE workspace_membership_id = $1 AND bundle = 'company_opportunity_manager'
              AND revoked_at IS NULL`,
          [ada],
        );
        await held.query('COMMIT');
        released = true;
        expect((await pending).status).toBe(403);
      } finally {
        if (!released) await held.query('ROLLBACK');
        held.release();
      }
      expect(
        (
          await reassign(
            opportunityId,
            { expectedVersion: 1, workspaceMembershipId: ion },
            { key },
          )
        ).status,
      ).toBe(403);
      await expectUnchanged(opportunityId, ada);
      expect(await responsibleEvents(opportunityId)).toEqual([]);
      expect(await receipts(opportunityId)).toEqual([]);
    }, 30_000);

    it('projects the change only to a commercial Activity reader of the Opportunity, with the Request link and no version', async () => {
      const ada = await grant('ada', MANAGER);
      const ion = await grant('ion', ELIGIBLE);
      const created = await capture('ada');
      const opportunityId = opportunityOf(created);
      const adaEntry = await candidate(opportunityId, ada);
      const ionEntry = await candidate(opportunityId, ion);
      await reassigned(opportunityId, {
        expectedVersion: 1,
        workspaceMembershipId: ion,
      });
      expect(await commercialActivity({ subject: 'ada' })).toEqual([]);
      await grant('ada', ['reader']);
      const { internalUserId } = await membership('ada');
      expect(await commercialActivity({ subject: 'ada' })).toEqual([
        {
          id: expect.any(String),
          action: 'opportunity.responsible.changed',
          occurredAt: expect.any(String),
          actor: { internalUserId, displayName: DISPLAY_NAMES.ada },
          target: {
            type: 'opportunity',
            opportunityId,
            clientRequestId: string(created.id),
            companyId,
          },
          metadata: { before: adaEntry, after: ionEntry },
        },
      ]);
      // The reader bundle alone, another Company and no active Company omit it.
      await grant('maria', ['context', 'reader']);
      expect(await commercialActivity({ subject: 'maria' })).toEqual([]);
      await grant('ada', ['context', 'intake', 'reader'], otherCompanyId);
      expect(
        await commercialActivity({ subject: 'ada', company: otherCompanyId }),
      ).toEqual([]);
      expect(await commercialActivity({ subject: 'ada', company: '' })).toEqual(
        [],
      );
    });

    it('rolls back the responsible actor, version and receipt together when the event cannot be recorded', async () => {
      const ada = await grant('ada', MANAGER);
      const ion = await grant('ion', ELIGIBLE);
      const opportunityId = opportunityOf(await capture('ada'));
      const key = randomUUID();
      await harness.pool.query(`
        CREATE FUNCTION reject_responsible_change() RETURNS trigger AS $$
        BEGIN
          IF NEW.action = 'opportunity.responsible.changed' THEN
            RAISE EXCEPTION 'forced event failure';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER reject_responsible_change BEFORE INSERT ON commercial_intake_events
          FOR EACH ROW EXECUTE FUNCTION reject_responsible_change();
      `);
      try {
        expect(
          (
            await reassign(
              opportunityId,
              { expectedVersion: 1, workspaceMembershipId: ion },
              { key },
            )
          ).status,
        ).toBe(500);
        await expectUnchanged(opportunityId, ada);
        expect(await receipts(opportunityId)).toEqual([]);
      } finally {
        await harness.pool.query(
          'DROP TRIGGER reject_responsible_change ON commercial_intake_events; DROP FUNCTION reject_responsible_change()',
        );
      }
      expect(
        object(
          (
            await reassigned(
              opportunityId,
              { expectedVersion: 1, workspaceMembershipId: ion },
              { key },
            )
          ).receipt,
        ),
      ).toMatchObject({ outcome: 'updated', version: 2 });
      expect(await responsibleEvents(opportunityId)).toHaveLength(1);
    });
  },
);

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
