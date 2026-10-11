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
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000570';
const FOREIGN = {
  workspace: '00000000-0000-4000-8000-000000005701',
  user: '00000000-0000-4000-8000-000000005702',
  membership: '00000000-0000-4000-8000-000000005703',
  company: '00000000-0000-4000-8000-000000005704',
  request: '00000000-0000-4000-8000-000000005705',
  opportunity: '00000000-0000-4000-8000-000000005706',
};
const UNKNOWN_ID = '00000000-0000-4000-8000-000000005709';
const OWNER = 'workspace-owner';
const DISPLAY_NAMES = {
  [OWNER]: 'Workspace Owner',
  ada: 'Ada Ionescu',
  ion: 'Ion Popa',
  maria: 'Maria Rusu',
  mihai: 'Mihai Stan',
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
const READER: readonly Bundle[] = ['context', 'intake'];

type RequestOptions = {
  subject?: Subject;
  company?: string;
  method?: string;
  value?: unknown;
  key?: string;
  headers?: Record<string, string>;
};

describe.skipIf(!databaseUrl)(
  'Opportunity outcome status REST contract',
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
          ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Opportunity Outcome',
          ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify(
            ['ada', 'ion', 'maria', 'mihai'].map((subject) => ({
              provider: 'deterministic-test',
              subject,
              workspaceId: WORKSPACE_ID,
            })),
          ),
        },
      });
    }

    beforeAll(async () => {
      if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
      database = await createIsolatedPostgresTestDatabase({
        baseDatabaseUrl: databaseUrl,
        namePrefix: 'opportunity_outcome',
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
    // The captured v1 manager bundle as delivered before v2 existed.
    async function captureLegacyManagerVersion(workspaceMembershipId: string) {
      await harness.pool.query(
        `UPDATE company_role_assignments SET permission_set_version = 'v1'
          WHERE workspace_membership_id = $1 AND bundle = 'company_opportunity_manager'
            AND revoked_at IS NULL`,
        [workspaceMembershipId],
      );
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
    function change(
      opportunityId: string,
      value: unknown,
      options: RequestOptions = {},
    ) {
      return request(
        `/commercial-intake/opportunities/${opportunityId}/outcome`,
        {
          subject: 'ada',
          key: randomUUID(),
          ...options,
          method: 'POST',
          value,
        },
      );
    }
    async function changed(
      opportunityId: string,
      value: unknown,
      options: RequestOptions = {},
    ) {
      const response = await change(opportunityId, value, options);
      expect(response.status, JSON.stringify(value)).toBe(200);
      return body(response);
    }
    function history(
      opportunityId: string,
      options: RequestOptions & { cursor?: string } = {},
    ) {
      const { cursor, ...rest } = options;
      return request(
        `/commercial-intake/opportunities/${opportunityId}/outcome-history${
          cursor === undefined ? '' : `?cursor=${encodeURIComponent(cursor)}`
        }`,
        { subject: 'ada', ...rest },
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
    async function outcomeEvents(opportunityId: string) {
      return (
        await harness.pool.query<{
          actor: string;
          company: string;
          metadata: unknown;
        }>(
          `SELECT actor_workspace_membership_id AS actor, company_id AS company, metadata
             FROM commercial_intake_events
            WHERE opportunity_id = $1 AND action = 'opportunity.outcome.changed'
            ORDER BY (metadata ->> 'opportunityVersion')::integer`,
          [opportunityId],
        )
      ).rows;
    }
    async function receipts(opportunityId: string) {
      return (
        await harness.pool.query<Record<string, unknown>>(
          `SELECT expected_version, result_version, previous_status, new_status
             FROM commercial_intake_outcome_commands
            WHERE opportunity_id = $1 ORDER BY result_version`,
          [opportunityId],
        )
      ).rows;
    }
    async function historyRows(opportunityId: string) {
      return (
        await harness.pool.query<Record<string, unknown>>(
          `SELECT opportunity_version, previous_status, new_status
             FROM opportunity_outcome_history
            WHERE opportunity_id = $1 ORDER BY opportunity_version`,
          [opportunityId],
        )
      ).rows;
    }
    async function expectNothingWritten(opportunityId: string, version = 1) {
      expect(await opportunityRow(opportunityId)).toMatchObject({
        status: version === 1 ? 'OPEN' : expect.any(String),
        version,
      });
      const writes = await harness.pool.query<{ count: string }>(
        `SELECT (SELECT count(*) FROM opportunity_outcome_history WHERE opportunity_id = $1)
              + (SELECT count(*) FROM commercial_intake_outcome_commands WHERE opportunity_id = $1)
              + (SELECT count(*) FROM commercial_intake_events
                  WHERE opportunity_id = $1 AND action = 'opportunity.outcome.changed') AS count`,
        [opportunityId],
      );
      // Each committed transition wrote one entry, one receipt and one event.
      expect(Number(writes.rows[0]?.count)).toBe(3 * (version - 1));
    }
    async function commercialActivity(options: RequestOptions) {
      return objects((await read('/activity-log', options)).events).filter(
        (event) => event.action === 'opportunity.outcome.changed',
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

    it('lets a v2 manager lose an Opportunity with COMPETITOR, found with its time and history after reload and restart', async () => {
      const ada = await grant('ada', MANAGER);
      const ion = await grant('ion', READER);
      const created = await capture('ada');
      const opportunityId = opportunityOf(created);
      const requestId = string(created.id);
      const createdOpportunity = object(created.initialOpportunity);
      // Capture enters OPEN at the capture time, without a history entry.
      expect(createdOpportunity).toMatchObject({
        status: 'OPEN',
        statusEnteredAt: createdOpportunity.createdAt,
        outcomeHistory: { entries: [] },
      });
      const opportunityBefore = await opportunityRow(opportunityId);
      const requestBefore = await requestRow(requestId);
      const note = ' They chose a local auditor at a lower price. ';

      const result = await changed(opportunityId, {
        expectedVersion: 1,
        status: 'LOST',
        lossReasonCode: 'COMPETITOR',
        note,
      });

      const { internalUserId: adaUser } = await membership('ada');
      const opportunityAfter = await opportunityRow(opportunityId);
      const [historyEntry] = (
        await harness.pool.query<{ changed_at: unknown }>(
          'SELECT changed_at FROM opportunity_outcome_history WHERE opportunity_id = $1',
          [opportunityId],
        )
      ).rows;
      const enteredAt = historyEntry?.changed_at;
      if (!(enteredAt instanceof Date)) throw new Error('Expected a time.');
      // Only the status, the version and the attribution move; the history
      // entry records when the new status was entered.
      expect(opportunityAfter).toEqual({
        ...opportunityBefore,
        status: 'LOST',
        version: 2,
        last_updated_by_internal_user_id: adaUser,
        last_updated_by_workspace_membership_id: ada,
        last_updated_at: enteredAt,
      });
      expect(await requestRow(requestId)).toEqual(requestBefore);
      const entry = {
        previousStatus: 'OPEN',
        newStatus: 'LOST',
        lossReasonCode: 'COMPETITOR',
        reason: null,
        note,
        version: 2,
        actor: {
          workspaceMembershipId: ada,
          displayLabel: expect.stringMatching(/^Ada Ionescu · [0-9A-Z]+$/u),
        },
        changedAt: enteredAt.toISOString(),
      };
      const expected = {
        ...created,
        initialOpportunity: {
          ...createdOpportunity,
          status: 'LOST',
          statusEnteredAt: enteredAt.toISOString(),
          outcomeHistory: { entries: [entry] },
          version: 2,
        },
      };
      expect(result).toEqual({
        receipt: {
          opportunityId,
          previousStatus: 'OPEN',
          status: 'LOST',
          version: 2,
        },
        request: expected,
      });
      // Every Commercial Intake reader finds the status, its time and the
      // history; the list shows the status.
      for (const subject of ['ada', 'ion'] as const) {
        expect(
          await read(`/commercial-intake/requests/${requestId}`, { subject }),
        ).toEqual(expected);
        expect(
          await read(
            `/commercial-intake/opportunities/${opportunityId}/outcome-history`,
            { subject },
          ),
        ).toEqual({ entries: [entry] });
        const listed = objects(
          (await read('/commercial-intake/requests', { subject })).items,
        );
        expect(object(listed[0]?.initialOpportunity)).toEqual({
          title: 'Prepare the ISO 9001 audit',
          nextAction: 'Arrange a qualification call',
          status: 'LOST',
          responsibleActor: {
            workspaceMembershipId: ada,
            displayName: DISPLAY_NAMES.ada,
          },
        });
      }
      expect(await outcomeEvents(opportunityId)).toEqual([
        {
          actor: ada,
          company: companyId,
          metadata: {
            opportunityVersion: 2,
            previousStatus: 'OPEN',
            newStatus: 'LOST',
            lossReasonCode: 'COMPETITOR',
          },
        },
      ]);
      expect(await receipts(opportunityId)).toEqual([
        {
          expected_version: 1,
          result_version: 2,
          previous_status: 'OPEN',
          new_status: 'LOST',
        },
      ]);
      // A reader holds no outcome authority.
      expect(
        (
          await change(
            opportunityId,
            { expectedVersion: 2, status: 'OPEN', reason: 'Client returned' },
            { subject: 'ion' },
          )
        ).status,
      ).toBe(403);

      await harness.close();
      await openHarness();
      expect(
        await read(`/commercial-intake/requests/${requestId}`, {
          subject: 'ada',
        }),
      ).toEqual(expected);

      // Next action and reassignment keep working in a closed status and
      // leave the status and the time it was entered unchanged.
      const nextAction = await request(
        `/commercial-intake/opportunities/${opportunityId}/next-action`,
        {
          subject: 'ada',
          method: 'POST',
          key: randomUUID(),
          value: { expectedVersion: 2, nextAction: 'Ask for feedback' },
        },
      );
      expect(nextAction.status).toBe(200);
      const reassigned = await request(
        `/commercial-intake/opportunities/${opportunityId}/responsible`,
        {
          subject: 'ada',
          method: 'POST',
          key: randomUUID(),
          value: { expectedVersion: 3, workspaceMembershipId: ion },
        },
      );
      expect(reassigned.status).toBe(200);
      expect(
        object(
          (
            await read(`/commercial-intake/requests/${requestId}`, {
              subject: 'ada',
            })
          ).initialOpportunity,
        ),
      ).toMatchObject({
        status: 'LOST',
        statusEnteredAt: enteredAt.toISOString(),
      });
      expect(await opportunityRow(opportunityId)).toMatchObject({
        status: 'LOST',
        version: 4,
        next_action: 'Ask for feedback',
        responsible_workspace_membership_id: ion,
      });
    });

    it('walks every section 23.2 transition with exactly its required fields and keeps each entry consultable', async () => {
      await grant('ada', MANAGER);
      const opportunityId = opportunityOf(await capture('ada'));
      const steps = [
        { status: 'ON_HOLD', reason: 'Client postponed the audit' },
        { status: 'OPEN' },
        { status: 'WON' },
        { status: 'OPEN', reason: 'Won by mistake' },
        { status: 'ON_HOLD', reason: 'Budget review' },
        { status: 'WON' },
        { status: 'OPEN', reason: 'Client cancelled the order' },
        { status: 'LOST', lossReasonCode: 'OTHER', note: 'Merged with group' },
        { status: 'OPEN', reason: 'Client came back' },
        { status: 'ON_HOLD', reason: 'Waiting for the board' },
        { status: 'LOST', lossReasonCode: 'UNKNOWN' },
        { status: 'OPEN', reason: 'New contact person' },
        { status: 'DISQUALIFIED', reason: 'Outside our accreditation' },
        { status: 'OPEN', reason: 'Accreditation extended' },
        { status: 'ON_HOLD', reason: 'Scope unclear' },
        { status: 'DISQUALIFIED', reason: 'Not a genuine request' },
        { status: 'OPEN', reason: 'Genuine after all' },
        { status: 'ARCHIVED', reason: 'Duplicate of another Request' },
        { status: 'OPEN', reason: 'Not a duplicate' },
        { status: 'ON_HOLD', reason: 'No answer yet' },
        { status: 'ARCHIVED', reason: 'Never answered' },
        { status: 'OPEN', reason: 'Answered at last' },
        { status: 'LOST', lossReasonCode: 'PRICE' },
      ] as const;
      let previous = 'OPEN';
      for (const [index, step] of steps.entries()) {
        const result = await changed(opportunityId, {
          expectedVersion: index + 1,
          ...step,
        });
        expect(result.receipt).toEqual({
          opportunityId,
          previousStatus: previous,
          status: step.status,
          version: index + 2,
        });
        previous = step.status;
      }
      const pairs = new Set(
        (await historyRows(opportunityId)).map(
          (row) => `${String(row.previous_status)}>${String(row.new_status)}`,
        ),
      );
      expect([...pairs].sort()).toEqual(
        [
          'OPEN>ON_HOLD',
          'ON_HOLD>OPEN',
          'OPEN>WON',
          'ON_HOLD>WON',
          'OPEN>LOST',
          'ON_HOLD>LOST',
          'OPEN>DISQUALIFIED',
          'ON_HOLD>DISQUALIFIED',
          'OPEN>ARCHIVED',
          'ON_HOLD>ARCHIVED',
          'WON>OPEN',
          'LOST>OPEN',
          'DISQUALIFIED>OPEN',
          'ARCHIVED>OPEN',
        ].sort(),
      );
      const page = await body(await history(opportunityId));
      const entries = objects(page.entries);
      expect(page).not.toHaveProperty('nextCursor');
      expect(entries.map((entry) => entry.version)).toEqual(
        steps.map((_, index) => steps.length + 1 - index),
      );
      const oldestFirst = [...entries].reverse();
      for (const [index, step] of steps.entries())
        expect(oldestFirst[index]).toMatchObject({
          newStatus: step.status,
          lossReasonCode: 'lossReasonCode' in step ? step.lossReasonCode : null,
          reason: 'reason' in step ? step.reason : null,
          note: 'note' in step ? step.note : null,
        });
      // Events carry statuses and codes only, never reason or note text.
      const events = await outcomeEvents(opportunityId);
      expect(events).toHaveLength(steps.length);
      const recorded = JSON.stringify(events);
      for (const step of steps) {
        if ('reason' in step) expect(recorded).not.toContain(step.reason);
        if ('note' in step) expect(recorded).not.toContain(step.note);
      }
      expect(events[7]?.metadata).toEqual({
        opportunityVersion: 9,
        previousStatus: 'OPEN',
        newStatus: 'LOST',
        lossReasonCode: 'OTHER',
      });
      expect(events[0]?.metadata).toEqual({
        opportunityVersion: 2,
        previousStatus: 'OPEN',
        newStatus: 'ON_HOLD',
      });
    });

    it('returns the 50 newest entries with the Request and each older page from an opaque cursor', async () => {
      await grant('ada', MANAGER);
      await grant('ion', READER);
      const created = await capture('ada');
      const opportunityId = opportunityOf(created);
      for (let version = 1; version <= 52; version += 1)
        await changed(
          opportunityId,
          version % 2 === 1
            ? { expectedVersion: version, status: 'ON_HOLD', reason: 'Wait' }
            : { expectedVersion: version, status: 'OPEN' },
        );
      const detail = await read(
        `/commercial-intake/requests/${string(created.id)}`,
        { subject: 'ion' },
      );
      const first = object(object(detail.initialOpportunity).outcomeHistory);
      expect(objects(first.entries).map((entry) => entry.version)).toEqual(
        Array.from({ length: 50 }, (_, index) => 53 - index),
      );
      const cursor = string(first.nextCursor);
      expect(cursor).not.toContain('beforeVersion');
      expect(
        await body(await history(opportunityId, { subject: 'ion' })),
      ).toEqual(first);
      const older = await body(
        await history(opportunityId, { subject: 'ion', cursor }),
      );
      expect(older).toEqual({
        entries: [
          expect.objectContaining({ version: 3, newStatus: 'OPEN' }),
          expect.objectContaining({ version: 2, newStatus: 'ON_HOLD' }),
        ],
      });
      for (const invalid of [
        'not-a-cursor',
        Buffer.from(JSON.stringify({ beforeVersion: 1 })).toString('base64url'),
        Buffer.from(
          JSON.stringify({ beforeVersion: 3, opportunityId }),
        ).toString('base64url'),
      ]) {
        const response = await history(opportunityId, { cursor: invalid });
        expect(response.status).toBe(400);
        expect(await body(response)).toMatchObject({ code: 'INVALID_PAGE' });
      }
    }, 60_000);

    it('refuses the current status and every pair outside the table without writing', async () => {
      await grant('ada', MANAGER);
      const opportunityId = opportunityOf(await capture('ada'));
      const refused = async (version: number, value: object) => {
        const response = await change(opportunityId, {
          expectedVersion: version,
          ...value,
        });
        expect(response.status, JSON.stringify(value)).toBe(409);
        expect(await body(response)).toEqual({
          code: 'OUTCOME_TRANSITION_NOT_ALLOWED',
          message: expect.any(String),
        });
        await expectNothingWritten(opportunityId, version);
      };
      await refused(1, { status: 'OPEN' });
      await refused(1, { status: 'OPEN', reason: 'Already open' });
      await changed(opportunityId, {
        expectedVersion: 1,
        status: 'ON_HOLD',
        reason: 'Waiting',
      });
      await refused(2, { status: 'ON_HOLD', reason: 'Still waiting' });
      await changed(opportunityId, { expectedVersion: 2, status: 'WON' });
      await refused(3, { status: 'WON' });
      await refused(3, { status: 'ON_HOLD', reason: 'Pause the work' });
      await refused(3, { status: 'LOST', lossReasonCode: 'PRICE' });
      await refused(3, { status: 'DISQUALIFIED', reason: 'Out of scope' });
      await refused(3, { status: 'ARCHIVED', reason: 'Duplicate' });
      await changed(opportunityId, {
        expectedVersion: 3,
        status: 'OPEN',
        reason: 'Declared too early',
      });
      await changed(opportunityId, {
        expectedVersion: 4,
        status: 'LOST',
        lossReasonCode: 'NO_BUDGET',
      });
      await refused(5, { status: 'LOST', lossReasonCode: 'PRICE' });
      await refused(5, { status: 'WON' });
      await refused(5, { status: 'ARCHIVED', reason: 'Close it' });
      expect(await opportunityRow(opportunityId)).toMatchObject({
        status: 'LOST',
        version: 5,
      });
    });

    it('validates the exact command and the fields each transition accepts, writing nothing', async () => {
      await grant('ada', MANAGER);
      await grant('ion', READER);
      const opportunityId = opportunityOf(await capture('ada'));
      // Authorization precedes validation.
      expect((await change(opportunityId, {}, { subject: 'ion' })).status).toBe(
        403,
      );
      const longText = 'x'.repeat(501);
      for (const [value, field] of [
        [{}, 'expectedVersion'],
        [{ expectedVersion: '1', status: 'WON' }, 'expectedVersion'],
        [{ expectedVersion: 0, status: 'WON' }, 'expectedVersion'],
        [{ expectedVersion: 1 }, 'status'],
        [{ expectedVersion: 1, status: 'CLOSED' }, 'status'],
        [{ expectedVersion: 1, status: 'won' }, 'status'],
        [{ expectedVersion: 1, status: 'ON_HOLD' }, 'reason'],
        [{ expectedVersion: 1, status: 'ON_HOLD', reason: '   ' }, 'reason'],
        [{ expectedVersion: 1, status: 'ON_HOLD', reason: longText }, 'reason'],
        [{ expectedVersion: 1, status: 'ON_HOLD', reason: null }, 'reason'],
        [
          { expectedVersion: 1, status: 'ON_HOLD', reason: 'Wait', note: 'n' },
          'note',
        ],
        [
          {
            expectedVersion: 1,
            status: 'DISQUALIFIED',
            reason: 'Out of scope',
            lossReasonCode: 'PRICE',
          },
          'lossReasonCode',
        ],
        [{ expectedVersion: 1, status: 'ARCHIVED' }, 'reason'],
        [{ expectedVersion: 1, status: 'WON', reason: 'Signed' }, 'reason'],
        [{ expectedVersion: 1, status: 'WON', note: 'Signed' }, 'note'],
        [{ expectedVersion: 1, status: 'LOST' }, 'lossReasonCode'],
        [
          { expectedVersion: 1, status: 'LOST', lossReasonCode: 'EXPENSIVE' },
          'lossReasonCode',
        ],
        [
          { expectedVersion: 1, status: 'LOST', lossReasonCode: 'OTHER' },
          'note',
        ],
        [
          {
            expectedVersion: 1,
            status: 'LOST',
            lossReasonCode: 'OTHER',
            note: ' ',
          },
          'note',
        ],
        [
          {
            expectedVersion: 1,
            status: 'LOST',
            lossReasonCode: 'PRICE',
            note: null,
          },
          'note',
        ],
        [
          {
            expectedVersion: 1,
            status: 'LOST',
            lossReasonCode: 'PRICE',
            reason: 'Too expensive',
          },
          'reason',
        ],
        [{ expectedVersion: 1, status: 'OPEN', note: 'Resume' }, 'note'],
        [
          { expectedVersion: 1, status: 'WON', salesStage: 'Negotiation' },
          'change',
        ],
        [[], 'change'],
      ] satisfies Array<[unknown, string]>) {
        const response = await change(opportunityId, value);
        expect(response.status, JSON.stringify(value)).toBe(400);
        expect(await body(response)).toMatchObject({
          code: 'VALIDATION_ERROR',
          field,
        });
      }
      const withoutKey = await request(
        `/commercial-intake/opportunities/${opportunityId}/outcome`,
        {
          subject: 'ada',
          method: 'POST',
          value: { expectedVersion: 1, status: 'WON' },
        },
      );
      expect(withoutKey.status).toBe(400);
      expect(
        (
          await change('not-an-opportunity', {
            expectedVersion: 1,
            status: 'WON',
          })
        ).status,
      ).toBe(400);
      await expectNothingWritten(opportunityId);

      // The current status decides whether a request for OPEN takes a reason.
      await changed(opportunityId, {
        expectedVersion: 1,
        status: 'ON_HOLD',
        reason: 'Waiting',
      });
      const resumeWithReason = await change(opportunityId, {
        expectedVersion: 2,
        status: 'OPEN',
        reason: 'Back again',
      });
      expect(resumeWithReason.status).toBe(400);
      expect(await body(resumeWithReason)).toMatchObject({
        code: 'VALIDATION_ERROR',
        field: 'reason',
      });
      await changed(opportunityId, { expectedVersion: 2, status: 'WON' });
      const reopenWithoutReason = await change(opportunityId, {
        expectedVersion: 3,
        status: 'OPEN',
      });
      expect(reopenWithoutReason.status).toBe(400);
      expect(await body(reopenWithoutReason)).toMatchObject({
        code: 'VALIDATION_ERROR',
        field: 'reason',
      });
      await expectNothingWritten(opportunityId, 3);
    });

    it.each([
      {
        denied: 'Commercial Intake alone',
        prepare: () => grant('maria', READER),
      },
      {
        denied: 'the manager bundle without Commercial Intake',
        prepare: () => grant('maria', ['context', 'manager']),
      },
      {
        denied: 'the bundle and Intake without Company context',
        prepare: () => grant('maria', ['intake', 'manager']),
      },
      {
        denied: 'a legacy captured v1 manager bundle',
        prepare: async () =>
          captureLegacyManagerVersion(await grant('maria', MANAGER)),
      },
      {
        denied: 'a revoked manager bundle',
        prepare: async () => revoke('manager', await grant('maria', MANAGER)),
      },
      {
        denied: 'a suspended manager',
        prepare: async () => suspend(await grant('maria', MANAGER)),
      },
      {
        denied: 'a manager of another Company',
        prepare: () => grant('maria', MANAGER, otherCompanyId),
      },
    ])('denies $denied without writing', async ({ prepare }) => {
      await grant('ada', MANAGER);
      const opportunityId = opportunityOf(await capture('ada'));
      await prepare();
      const response = await change(
        opportunityId,
        { expectedVersion: 1, status: 'ON_HOLD', reason: 'Waiting' },
        { subject: 'maria' },
      );
      expect(response.status).toBe(403);
      expect(await response.text()).not.toContain(opportunityId);
      await expectNothingWritten(opportunityId);
    });

    it('denies a Workspace owner holding every other bundle', async () => {
      await grant('ada', MANAGER);
      const opportunityId = opportunityOf(await capture('ada'));
      await grant(OWNER, [
        'context',
        'intake',
        'client',
        'project',
        'task',
        'document',
        'reader',
      ]);
      const response = await change(
        opportunityId,
        { expectedVersion: 1, status: 'WON' },
        { subject: OWNER },
      );
      expect(response.status).toBe(403);
      await expectNothingWritten(opportunityId);
    });

    it('administers captured Company Opportunity Manager v2 and never expands a v1 assignment in place', async () => {
      const ada = await grant('ada', READER);
      const granted = await command(ROUTES.manager, {
        workspaceMembershipId: ada,
        companyId,
      });
      expect(granted).toEqual({
        id: expect.any(String),
        workspaceMembershipId: ada,
        companyId,
        active: true,
        bundle: 'Company Opportunity Manager',
        permissionSetVersion: 'v2',
      });
      const actor = object(
        (await read('/access/current-actor', { subject: 'ada' })).activeCompany,
      );
      expect(actor).toMatchObject({
        opportunityManagerPermissions: [
          'commercial.opportunity.assign',
          'commercial.opportunity.outcome.change',
        ],
        opportunityManagerPermissionAssignmentId: granted.id,
        opportunityManagerPermissionSetVersion: 'v2',
      });

      await captureLegacyManagerVersion(ada);
      const legacy = object(
        (await read('/access/current-actor', { subject: 'ada' })).activeCompany,
      );
      expect(legacy).toMatchObject({
        opportunityManagerPermissions: ['commercial.opportunity.assign'],
        opportunityManagerPermissionSetVersion: 'v1',
      });
      // A repeated grant keeps the live v1 assignment as captured.
      expect(
        await command(ROUTES.manager, {
          workspaceMembershipId: ada,
          companyId,
        }),
      ).toEqual({ ...granted, permissionSetVersion: 'v1' });
      const opportunityId = opportunityOf(await capture('ada'));
      expect(
        (await change(opportunityId, { expectedVersion: 1, status: 'WON' }))
          .status,
      ).toBe(403);
      // Reassignment keeps working for the v1 holder.
      const reassigned = await request(
        `/commercial-intake/opportunities/${opportunityId}/responsible`,
        {
          subject: 'ada',
          method: 'POST',
          key: randomUUID(),
          value: { expectedVersion: 1, workspaceMembershipId: ada },
        },
      );
      expect(reassigned.status).toBe(200);

      // Only revocation followed by a fresh grant captures v2.
      await revoke('manager', ada);
      expect(
        object(
          await command(ROUTES.manager, {
            workspaceMembershipId: ada,
            companyId,
          }),
        ).permissionSetVersion,
      ).toBe('v2');
      await changed(opportunityId, { expectedVersion: 1, status: 'WON' });
      const reassignedAgain = await request(
        `/commercial-intake/opportunities/${opportunityId}/responsible`,
        {
          subject: 'ada',
          method: 'POST',
          key: randomUUID(),
          value: { expectedVersion: 2, workspaceMembershipId: ada },
        },
      );
      expect(reassignedAgain.status).toBe(200);
    });

    it('answers unknown, cross-Company and cross-Workspace Opportunities with the Request detail not-found', async () => {
      await grant('ada', MANAGER);
      await grant('ada', MANAGER, otherCompanyId);
      const opportunityId = opportunityOf(await capture('ada'));
      await insertForeignWorkspaceOpportunity();
      const missing = await request(
        `/commercial-intake/requests/${UNKNOWN_ID}`,
        { subject: 'ada' },
      );
      expect(missing.status).toBe(404);
      const notFound = await missing.text();
      const value = { expectedVersion: 1, status: 'WON' };
      for (const response of [
        await change(opportunityId, value, { company: otherCompanyId }),
        await history(opportunityId, { company: otherCompanyId }),
        await change(UNKNOWN_ID, value),
        await history(UNKNOWN_ID),
        await change(FOREIGN.opportunity, value),
        await history(FOREIGN.opportunity),
      ]) {
        expect(response.status).toBe(404);
        const text = await response.text();
        expect(text).toBe(notFound);
        expect(text).not.toContain(opportunityId);
      }
      const foreignContext = await change(opportunityId, value, {
        headers: { 'x-workspace-context-id': FOREIGN.workspace },
      });
      expect(foreignContext.status).toBe(403);
      const anonymous = await fetch(
        `${harness.origin}/api/commercial-intake/opportunities/${opportunityId}/outcome`,
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
      await expectNothingWritten(opportunityId);
      expect(await opportunityRow(FOREIGN.opportunity)).toMatchObject({
        status: 'OPEN',
        version: 1,
      });
    });

    it('shares one version, replays exactly before staleness and the now-current status, conflicts on changed payload and denies replay after revocation', async () => {
      const ada = await grant('ada', MANAGER);
      const opportunityId = opportunityOf(await capture('ada'));
      const second = opportunityOf(await capture('ada'));
      const key = randomUUID();
      const hold = {
        expectedVersion: 1,
        status: 'ON_HOLD',
        reason: 'Client asked to wait',
      };
      const first = await changed(opportunityId, hold, { key });
      expect(await changed(opportunityId, hold, { key })).toEqual(first);
      const nextAction = await request(
        `/commercial-intake/opportunities/${opportunityId}/next-action`,
        {
          subject: 'ada',
          method: 'POST',
          key: randomUUID(),
          value: { expectedVersion: 2, nextAction: 'Call again in March' },
        },
      );
      expect(nextAction.status).toBe(200);
      const stale = await change(opportunityId, {
        expectedVersion: 2,
        status: 'OPEN',
      });
      expect(stale.status).toBe(409);
      expect(await body(stale)).toEqual({
        code: 'STALE_VERSION',
        message: 'Reload the Request before retrying.',
      });
      // The exact retry resolves before its stale version and its now-current
      // status could be refused, and returns the original receipt.
      const replay = await changed(opportunityId, hold, { key });
      expect(replay.receipt).toEqual(first.receipt);
      expect(object(replay.request).initialOpportunity).toMatchObject({
        status: 'ON_HOLD',
        nextAction: 'Call again in March',
        version: 3,
      });
      for (const [target, value] of [
        [opportunityId, { ...hold, reason: 'Client asked to wait.' }],
        [opportunityId, { ...hold, expectedVersion: 3 }],
        [opportunityId, { expectedVersion: 1, status: 'WON' }],
        [second, hold],
      ] satisfies Array<[string, unknown]>) {
        const conflict = await change(target, value, { key });
        expect(conflict.status).toBe(409);
        expect(await body(conflict)).toMatchObject({
          code: 'IDEMPOTENCY_CONFLICT',
        });
      }
      await revoke('manager', ada);
      expect((await change(opportunityId, hold, { key })).status).toBe(403);
      expect(await outcomeEvents(opportunityId)).toHaveLength(1);
      expect(await receipts(opportunityId)).toHaveLength(1);
      await expectNothingWritten(second);
    });

    it('lets exactly one of two concurrent changes commit on one version and converges exact retries', async () => {
      await grant('ada', MANAGER);
      // A different member: a request by the same member would queue behind
      // the other's share lock at actor resolution.
      await grant('mihai', MANAGER);
      const opportunityId = opportunityOf(await capture('ada'));
      const held = await barrier(
        'SELECT id FROM opportunities WHERE id = $1 FOR UPDATE',
        [opportunityId],
      );
      let released = false;
      try {
        const hold = change(opportunityId, {
          expectedVersion: 1,
          status: 'ON_HOLD',
          reason: 'Waiting for the board',
        });
        const win = change(
          opportunityId,
          { expectedVersion: 1, status: 'WON' },
          { subject: 'mihai' },
        );
        await waitForLockWaiters('%from "opportunities"%for no key update%', 2);
        await held.query('COMMIT');
        released = true;
        const outcomes = await Promise.all([hold, win]);
        expect(outcomes.map((response) => response.status).sort()).toEqual([
          200, 409,
        ]);
        const loser = outcomes.find((response) => response.status === 409);
        expect(loser && (await body(loser))).toMatchObject({
          code: 'STALE_VERSION',
        });
        expect(await opportunityRow(opportunityId)).toMatchObject({
          version: 2,
          status: outcomes[0]?.status === 200 ? 'ON_HOLD' : 'WON',
        });
        expect(await outcomeEvents(opportunityId)).toHaveLength(1);
        expect(await historyRows(opportunityId)).toHaveLength(1);
      } finally {
        if (!released) await held.query('ROLLBACK');
        held.release();
      }

      const current = String((await opportunityRow(opportunityId)).status);
      const key = randomUUID();
      const value =
        current === 'WON'
          ? { expectedVersion: 2, status: 'OPEN', reason: 'Declared early' }
          : { expectedVersion: 2, status: 'OPEN' };
      const retries = await Promise.all([
        change(opportunityId, value, { key }),
        change(opportunityId, value, { key }),
      ]);
      expect(retries.map((response) => response.status)).toEqual([200, 200]);
      const [one, two] = await Promise.all(retries.map(body));
      expect(one?.receipt).toEqual(two?.receipt);
      expect(one?.receipt).toMatchObject({ status: 'OPEN', version: 3 });
      expect(await outcomeEvents(opportunityId)).toHaveLength(2);
    }, 30_000);

    it("denies a change waiting on the manager's revocation and every later replay", async () => {
      const ada = await grant('ada', MANAGER);
      const opportunityId = opportunityOf(await capture('ada'));
      const held = await barrier(
        `SELECT id FROM company_role_assignments
          WHERE workspace_membership_id = $1 AND bundle = 'company_opportunity_manager'
            AND revoked_at IS NULL FOR UPDATE`,
        [ada],
      );
      let released = false;
      const key = randomUUID();
      const value = { expectedVersion: 1, status: 'WON' };
      try {
        const pending = change(opportunityId, value, { key });
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
      expect((await change(opportunityId, value, { key })).status).toBe(403);
      await expectNothingWritten(opportunityId);
    }, 30_000);

    it('projects the change to a commercial Activity reader with the statuses and loss code only', async () => {
      await grant('ada', [...MANAGER, 'reader']);
      const created = await capture('ada');
      const opportunityId = opportunityOf(created);
      await changed(opportunityId, {
        expectedVersion: 1,
        status: 'ON_HOLD',
        reason: 'Confidential budget freeze',
      });
      await changed(opportunityId, {
        expectedVersion: 2,
        status: 'LOST',
        lossReasonCode: 'NO_BUDGET',
        note: 'Confidential board decision',
      });
      const { internalUserId } = await membership('ada');
      const projected = await commercialActivity({ subject: 'ada' });
      const target = {
        type: 'opportunity',
        opportunityId,
        clientRequestId: string(created.id),
        companyId,
      };
      const actor = { internalUserId, displayName: DISPLAY_NAMES.ada };
      expect(projected).toEqual([
        {
          id: expect.any(String),
          action: 'opportunity.outcome.changed',
          occurredAt: expect.any(String),
          actor,
          target,
          metadata: {
            previousStatus: 'ON_HOLD',
            newStatus: 'LOST',
            lossReasonCode: 'NO_BUDGET',
          },
        },
        {
          id: expect.any(String),
          action: 'opportunity.outcome.changed',
          occurredAt: expect.any(String),
          actor,
          target,
          metadata: { previousStatus: 'OPEN', newStatus: 'ON_HOLD' },
        },
      ]);
      expect(JSON.stringify(projected)).not.toContain('Confidential');
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

    it('rolls back the status, history and receipt together when the event cannot be recorded', async () => {
      await grant('ada', MANAGER);
      const opportunityId = opportunityOf(await capture('ada'));
      const key = randomUUID();
      const value = {
        expectedVersion: 1,
        status: 'DISQUALIFIED',
        reason: 'Outside our accreditation',
      };
      await harness.pool.query(`
        CREATE FUNCTION reject_outcome_change() RETURNS trigger AS $$
        BEGIN
          IF NEW.action = 'opportunity.outcome.changed' THEN
            RAISE EXCEPTION 'forced event failure';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER reject_outcome_change BEFORE INSERT ON commercial_intake_events
          FOR EACH ROW EXECUTE FUNCTION reject_outcome_change();
      `);
      try {
        expect((await change(opportunityId, value, { key })).status).toBe(500);
        await expectNothingWritten(opportunityId);
      } finally {
        await harness.pool.query(
          'DROP TRIGGER reject_outcome_change ON commercial_intake_events; DROP FUNCTION reject_outcome_change()',
        );
      }
      expect(
        object((await changed(opportunityId, value, { key })).receipt),
      ).toMatchObject({ status: 'DISQUALIFIED', version: 2 });
      expect(await outcomeEvents(opportunityId)).toHaveLength(1);
    });

    it('refuses a transition from the PostgreSQL integer maximum without writing', async () => {
      const ada = await grant('ada', MANAGER);
      const opportunityId = opportunityOf(await capture('ada'));
      const { internalUserId } = await membership('ada');
      await harness.pool.query(
        `UPDATE opportunities
            SET version = 2147483647, last_updated_by_internal_user_id = $2,
                last_updated_by_workspace_membership_id = $3, last_updated_at = now()
          WHERE id = $1`,
        [opportunityId, internalUserId, ada],
      );
      const exhausted = await change(opportunityId, {
        expectedVersion: 2_147_483_647,
        status: 'WON',
      });
      expect(exhausted.status).toBe(409);
      expect(await body(exhausted)).toEqual({
        code: 'VERSION_EXHAUSTED',
        message: 'The Opportunity version cannot be incremented.',
      });
      expect(await opportunityRow(opportunityId)).toMatchObject({
        status: 'OPEN',
      });
      expect(await receipts(opportunityId)).toEqual([]);
      expect(await historyRows(opportunityId)).toEqual([]);
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
