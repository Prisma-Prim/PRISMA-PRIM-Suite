import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
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
const workspaceId = '00000000-0000-4000-8000-000000000367';
const owner = 'responsible-owner';
const assignments = {
  context: '/company-context-assignments',
  client: '/company-director-client-assignments',
  project: '/company-project-assignments',
  task: '/company-task-manager-assignments',
  document: '/company-document-registrar-assignments',
};
type Kind = keyof typeof assignments;

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Expected an object.');
  return Object.fromEntries(Object.entries(value));
}
function string(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Expected a string.');
  return value;
}
function objects(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error('Expected an array.');
  const values: unknown[] = value;
  return values.map(object);
}
async function body(response: Response) {
  const value: unknown = await response.json();
  return object(value);
}

describe.skipIf(!databaseUrl)(
  'Project responsible member REST contract',
  () => {
    let database: IsolatedPostgresTestDatabase;
    let harness: PostgresRestTestHarness;
    let companyId: string;
    let clientId: string;
    let projectId: string;
    let project: Record<string, unknown>;
    let ownerMembershipId: string;
    let ownerInternalUserId: string;

    beforeAll(async () => {
      if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
      database = await createIsolatedPostgresTestDatabase({
        baseDatabaseUrl: databaseUrl,
        namePrefix: 'project_responsible',
      });
      harness = await createPostgresRestTestHarness({
        databaseUrl: database.targetUrl,
        environment: {
          NODE_ENV: 'test',
          ACCESS_IDENTITY_MODE: 'test',
          ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
          ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: owner,
          ACCESS_BOOTSTRAP_WORKSPACE_ID: workspaceId,
          ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Project Responsibility',
          ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify(
            ['ion', 'maria', 'legacy', 'outsider', 'suspended'].map(
              (subject) => ({
                provider: 'deterministic-test',
                subject,
                workspaceId,
              }),
            ),
          ),
        },
      });
    });
    afterAll(async () => {
      await harness?.close();
      await database?.close();
    });
    beforeEach(async () => {
      await harness.pool.query('TRUNCATE workspaces, internal_users CASCADE');
      companyId = '';
      companyId = string(
        (await command('/companies', { displayName: 'PRISMA-PRIM' })).id,
      );
      const actor = await read('/access/current-actor');
      ownerMembershipId = string(actor.workspaceMembershipId);
      ownerInternalUserId = string(actor.internalUserId);
      await grant('client');
      await grant('project');
      clientId = string(
        (await command('/clients', { displayName: 'Synthetic Client' })).id,
      );
      project = await command('/projects', {
        title: 'ISO preparation',
        clientAccountId: clientId,
      });
      projectId = string(project.id);
    });

    function request(
      path: string,
      options: {
        method?: string;
        value?: unknown;
        key?: string | null;
        company?: string;
        subject?: string;
      } = {},
    ) {
      const {
        method = 'GET',
        value,
        key = randomUUID(),
        company = companyId,
        subject = owner,
      } = options;
      return fetch(`${harness.origin}/api${path}`, {
        method,
        headers: {
          'x-test-external-provider': 'deterministic-test',
          'x-test-external-subject': subject,
          'x-test-display-name':
            subject === owner ? 'Responsible Owner' : subject,
          'x-test-email': `${subject}@example.test`,
          ...(company ? { 'x-company-context-id': company } : {}),
          ...(key === null ? {} : { 'idempotency-key': key }),
          'content-type': 'application/json',
        },
        ...(value === undefined ? {} : { body: JSON.stringify(value) }),
      });
    }
    async function read(
      path: string,
      options: Parameters<typeof request>[1] = {},
    ) {
      const response = await request(path, options);
      expect(response.status).toBe(200);
      return body(response);
    }
    async function command(
      path: string,
      value: unknown,
      options: Parameters<typeof request>[1] = {},
    ) {
      const response = await request(path, {
        ...options,
        method: 'POST',
        value,
      });
      expect(response.status).toBe(201);
      return body(response);
    }
    function grant(
      kind: Kind,
      target = ownerMembershipId,
      company = companyId,
    ) {
      return command(assignments[kind], {
        workspaceMembershipId: target,
        companyId: company,
      });
    }
    async function revoke(kind: Kind, target: string, company = companyId) {
      const response = await request(
        `${assignments[kind]}/${target}/${company}`,
        {
          method: 'DELETE',
        },
      );
      expect(response.status).toBe(200);
      return body(response);
    }
    /** A member with Company context, Client read and Project Access. */
    async function member(subject: string, eligible = false) {
      const actor = await read('/access/current-actor', {
        subject,
        company: '',
      });
      const id = string(actor.workspaceMembershipId);
      if (eligible)
        for (const kind of ['context', 'client', 'project'] satisfies Kind[])
          await grant(kind, id);
      return id;
    }
    function responsibility(options: Parameters<typeof request>[1] = {}) {
      return read(`/projects/${projectId}/responsible`, options);
    }
    async function candidates(options: Parameters<typeof request>[1] = {}) {
      const page = await read(
        `/projects/${projectId}/eligible-responsible-members`,
        options,
      );
      expect(Object.keys(page)).toEqual(['members']);
      return objects(page.members);
    }
    async function candidate(id: string) {
      return object(
        (await candidates()).find(
          (entry) => entry.workspaceMembershipId === id,
        ),
      );
    }
    function change(
      expectedRevision: number,
      workspaceMembershipId: string | null,
      options: Parameters<typeof request>[1] = {},
      target = projectId,
    ) {
      return request(`/projects/${target}/responsible`, {
        ...options,
        method: 'PUT',
        value: { expectedRevision, workspaceMembershipId },
      });
    }
    async function set(
      expectedRevision: number,
      workspaceMembershipId: string | null,
      options: Parameters<typeof request>[1] = {},
    ) {
      const response = await change(
        expectedRevision,
        workspaceMembershipId,
        options,
      );
      expect(response.status).toBe(200);
      return body(response);
    }
    async function responsibleEvents(
      options: Parameters<typeof request>[1] = {},
    ) {
      return objects((await read('/activity-log', options)).events).filter(
        (event) => event.action === 'project.responsible.changed',
      );
    }
    async function clientVersions() {
      return (
        await harness.pool.query<{ id: string; version: number }>(
          'SELECT id, version FROM client_accounts ORDER BY id',
        )
      ).rows;
    }
    async function receipts() {
      return (
        await harness.pool.query(
          'SELECT * FROM project_responsibility_commands ORDER BY id',
        )
      ).rows;
    }
    async function projectAssignment(membershipId: string) {
      const result = await harness.pool.query<{ id: string }>(
        "SELECT id FROM company_role_assignments WHERE bundle = 'company_project_access' AND workspace_membership_id = $1 AND company_id = $2 AND revoked_at IS NULL",
        [membershipId, companyId],
      );
      return string(result.rows[0]?.id);
    }
    async function captureLegacyVersion(membershipId: string) {
      // Simulates an assignment captured before v2 existed.
      await harness.pool.query(
        "UPDATE company_role_assignments SET permission_set_version = 'v1' WHERE id = $1",
        [await projectAssignment(membershipId)],
      );
    }
    async function withUnsupportedPermissionVersion(
      assignmentId: string,
      version: string | null,
      work: () => Promise<void>,
    ) {
      // Current migrations prevent unsupported versions. Temporarily admit this
      // future-version fixture in this isolated database to prove fail-closed reads.
      const result = await harness.pool.query<{ definition: unknown }>(
        "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname='company_role_assignments_permission_set_version_check'",
      );
      const definition = string(result.rows[0]?.definition);
      const previous = await harness.pool.query<{ version: string }>(
        'SELECT permission_set_version AS version FROM company_role_assignments WHERE id = $1',
        [assignmentId],
      );
      await harness.pool.query(
        'ALTER TABLE company_role_assignments DROP CONSTRAINT company_role_assignments_permission_set_version_check',
      );
      try {
        await harness.pool.query(
          'UPDATE company_role_assignments SET permission_set_version=$1 WHERE id=$2',
          [version, assignmentId],
        );
        await work();
      } finally {
        await harness.pool.query(
          'UPDATE company_role_assignments SET permission_set_version=$1 WHERE id=$2',
          [previous.rows[0]?.version, assignmentId],
        );
        await harness.pool.query(
          `ALTER TABLE company_role_assignments ADD CONSTRAINT company_role_assignments_permission_set_version_check ${definition}`,
        );
      }
    }
    async function unionSetup(supersedeOriginal = false) {
      const second = string(
        (
          await command('/clients', {
            displayName: 'Legacy synthetic identity',
          })
        ).id,
      );
      // The public create path rejects duplicates. Reuse the Client suite's
      // historical-data fixture, then exercise union and reversal through REST.
      await harness.pool.query(
        "UPDATE client_accounts SET tax_id='PROJECT-RESPONSIBLE-367' WHERE id=ANY($1::uuid[])",
        [[clientId, second]],
      );
      const review = await command(`/clients/${clientId}/union-reviews`, {});
      expect(review.outcome).toBe('comparison');
      const confirmed = await command(
        `/client-union-reviews/${string(review.reviewReference)}/confirm`,
        {
          canonicalClientId: supersedeOriginal ? second : clientId,
          fields: {
            displayName: clientId,
            taxId: clientId,
            address: clientId,
            telephone: clientId,
            generalEmail: clientId,
            businessActivity: clientId,
          },
          companyIds: [companyId],
          reviewedDifferences: true,
          reason: 'Legacy duplicate identity.',
        },
      );
      return { second, reference: string(confirmed.projectionReference) };
    }
    function reverse(reference: string) {
      return request(`/client-union-operations/${reference}/reversal`, {
        method: 'POST',
        value: { companyIds: [companyId], reason: 'Reverse synthetic union.' },
      });
    }

    it('lists only my current open Projects through the authenticated directory', async () => {
      const colleague = await member('ion', true);
      const colleagueProject = await command('/projects', {
        title: 'Colleague preparation',
        clientAccountId: clientId,
      });
      const unassignedProject = await command('/projects', {
        title: 'Unassigned preparation',
        clientAccountId: clientId,
      });
      expect(await set(0, ownerMembershipId)).toMatchObject({
        revision: 1,
        responsible: { workspaceMembershipId: ownerMembershipId },
      });
      const colleagueChange = await change(
        0,
        colleague,
        {},
        string(colleagueProject.id),
      );
      expect(colleagueChange.status).toBe(200);

      const allResponse = await request('/projects');
      expect(allResponse.status).toBe(200);
      const allValue: unknown = await allResponse.json();
      const allProjects = objects(allValue);
      expect(allProjects).toEqual([
        project,
        colleagueProject,
        unassignedProject,
      ]);
      expect(allProjects.map((row) => row.status)).toEqual([
        'preparatory',
        'preparatory',
        'preparatory',
      ]);

      const mineResponse = await request('/projects?view=mine_open');
      expect(mineResponse.status).toBe(200);
      const mineValue: unknown = await mineResponse.json();
      expect(objects(mineValue)).toEqual([project]);
    });

    async function directory(options: Parameters<typeof request>[1] = {}) {
      const response = await request('/projects?view=mine_open', options);
      expect(response.status).toBe(200);
      const value: unknown = await response.json();
      return objects(value);
    }
    async function responsibleProject(input: {
      title: string;
      membershipId: string;
    }) {
      const value = await command('/projects', {
        title: input.title,
        clientAccountId: clientId,
      });
      const response = await change(
        0,
        input.membershipId,
        {},
        string(value.id),
      );
      expect(response.status).toBe(200);
      return value;
    }
    async function transitionProject(input: {
      projectId: string;
      value: unknown;
    }) {
      const response = await request(
        `/projects/${input.projectId}/lifecycle-transitions`,
        { method: 'POST', value: input.value },
      );
      expect(response.status).toBe(200);
      return body(response);
    }
    async function activateProject(target: string) {
      await transitionProject({
        projectId: target,
        value: {
          action: 'activate',
          expectedLifecycleRevision: 0,
          declaration: {
            approvedOffer: 'missing',
            contractOrPrecontract: 'missing',
            projectPlan: 'missing',
            initialDocuments: 'missing',
            deadlines: 'missing',
            financialConditions: 'missing',
            risks: 'missing',
          },
          startException: {
            reason: 'Synthetic preparation exception.',
            completionMembershipId: ownerMembershipId,
            completionDueDate: '2035-01-01',
          },
        },
      });
    }
    async function directoryPersistence() {
      // Read-only observations prove absence of writes; commands remain public REST.
      const result = await harness.pool.query<{ value: unknown }>(`
        SELECT jsonb_build_object(
          'projects', (SELECT jsonb_agg(to_jsonb(entry) ORDER BY entry.id) FROM projects entry),
          'clients', (SELECT jsonb_agg(to_jsonb(entry) ORDER BY entry.id) FROM client_accounts entry),
          'relationships', (SELECT jsonb_agg(to_jsonb(entry) ORDER BY entry.id) FROM client_company_relationships entry),
          'assignments', (SELECT jsonb_agg(to_jsonb(entry) ORDER BY entry.id) FROM company_role_assignments entry),
          'responsibilityCommands', (SELECT jsonb_agg(to_jsonb(entry) ORDER BY entry.id) FROM project_responsibility_commands entry),
          'lifecycleCommands', (SELECT jsonb_agg(to_jsonb(entry) ORDER BY entry.id) FROM project_lifecycle_commands entry),
          'transitions', (SELECT jsonb_agg(to_jsonb(entry) ORDER BY entry.id) FROM project_lifecycle_transitions entry),
          'startDeclarations', (SELECT jsonb_agg(to_jsonb(entry) ORDER BY entry.id) FROM project_start_declarations entry),
          'activity', (SELECT jsonb_agg(to_jsonb(entry) ORDER BY entry.id) FROM activity_log_events entry)
        ) AS value
      `);
      return result.rows[0]?.value;
    }

    it('keeps legacy ignored query parameters and rejects malformed new directory selectors without writes', async () => {
      await set(0, ownerMembershipId);
      const before = await directoryPersistence();
      for (const path of [
        '/projects?legacy=kept',
        '/projects?membershipId=someone-else',
        '/projects?viewName=mine_open',
      ]) {
        const response = await request(path);
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual([project]);
      }
      for (const query of [
        'view=',
        'view=all',
        'view=unknown',
        'view=mine_open&view=mine_open',
        'view[]=mine_open',
        'view[nested]=mine_open',
        'view=mine_open&extra=1',
        'view=mine_open&workspaceMembershipId=someone-else',
        'view=mine_open&companyId=someone-else',
        'view=mine_open&scope=all',
      ]) {
        const response = await request(`/projects?${query}`);
        expect(response.status, query).toBe(400);
        const value: unknown = await response.json();
        expect(JSON.stringify(value)).not.toContain(project.title);
      }
      expect(await directory()).toEqual([project]);
      expect(await directoryPersistence()).toEqual(before);
    });

    it('selects preparatory, active and on-hold self responsibilities and preserves creation-time then ID order', async () => {
      await command('/company-project-approver-assignments', {
        workspaceMembershipId: ownerMembershipId,
        companyId,
      });
      await set(0, ownerMembershipId);
      const active = await responsibleProject({
        title: 'Active own Project',
        membershipId: ownerMembershipId,
      });
      const held = await responsibleProject({
        title: 'Held own Project',
        membershipId: ownerMembershipId,
      });
      await activateProject(string(active.id));
      await activateProject(string(held.id));
      await transitionProject({
        projectId: string(held.id),
        value: {
          action: 'hold',
          expectedLifecycleRevision: 1,
          reason: 'Explicit synthetic hold.',
        },
      });
      // Fixed creation ties are historical input, not a substitute for lifecycle commands.
      await harness.pool.query(
        'UPDATE projects SET created_at=$1 WHERE id=ANY($2::uuid[])',
        ['2034-01-01T00:00:00.000Z', [projectId, active.id, held.id]],
      );
      const expected = [projectId, string(active.id), string(held.id)].sort();
      const result = await directory();
      expect(result.map((row) => row.id)).toEqual(expected);
      expect(new Map(result.map((row) => [row.id, row.status]))).toEqual(
        new Map([
          [projectId, 'preparatory'],
          [active.id, 'active'],
          [held.id, 'on_hold'],
        ]),
      );
      const before = await directoryPersistence();
      expect(await directory()).toEqual(result);
      expect(await directoryPersistence()).toEqual(before);
    });

    it('excludes completed, cancelled, unassigned and other-responsible Projects after supported public commands', async () => {
      await command('/company-project-approver-assignments', {
        workspaceMembershipId: ownerMembershipId,
        companyId,
      });
      const ion = await member('ion', true);
      const completed = await responsibleProject({
        title: 'Completed own Project',
        membershipId: ownerMembershipId,
      });
      const cancelled = await responsibleProject({
        title: 'Cancelled own Project',
        membershipId: ownerMembershipId,
      });
      const other = await responsibleProject({
        title: 'Other responsible Project',
        membershipId: ion,
      });
      await activateProject(string(completed.id));
      await transitionProject({
        projectId: string(completed.id),
        value: {
          action: 'complete',
          expectedLifecycleRevision: 1,
          note: 'Explicit completion.',
        },
      });
      await transitionProject({
        projectId: string(cancelled.id),
        value: {
          action: 'cancel',
          expectedLifecycleRevision: 0,
          reason: 'Explicit cancellation.',
        },
      });
      expect(await directory()).toEqual([]);
      expect(
        (await directory({ subject: 'ion' })).map((row) => row.id),
      ).toEqual([other.id]);
      const all = await request('/projects');
      const value: unknown = await all.json();
      expect(all.status).toBe(200);
      expect(objects(value).map((row) => row.id)).toEqual([
        projectId,
        completed.id,
        cancelled.id,
        other.id,
      ]);
    });

    it('rechecks current responsibility without requiring Project update, Tasks, Templates or Approver rights for reads', async () => {
      const ion = await member('ion', true);
      await set(0, ion);
      await captureLegacyVersion(ion);
      const current = await read('/access/current-actor', { subject: 'ion' });
      expect(object(current.activeCompany).projectPermissions).toEqual([
        'project.read',
        'project.create',
      ]);
      expect(object(current.activeCompany).taskPermissions ?? []).toEqual([]);
      expect(
        object(current.activeCompany).projectTemplatePermissions ?? [],
      ).toEqual([]);
      expect(
        object(current.activeCompany).projectApproverPermissions ?? [],
      ).toEqual([]);
      expect(await directory({ subject: 'ion' })).toEqual([project]);
      const before = await directoryPersistence();
      expect(await directory({ subject: 'ion' })).toEqual([project]);
      expect(await directoryPersistence()).toEqual(before);
      await set(1, ownerMembershipId);
      expect(await directory({ subject: 'ion' })).toEqual([]);
      expect(await directory()).toEqual([project]);
      await set(2, null);
      expect(await directory()).toEqual([]);
    });

    it('revalidates live Project and Client grants and the selected Company without revealing hidden rows', async () => {
      const ion = await member('ion', true);
      await set(0, ion);
      const scope = { subject: 'ion' };
      expect(await directory(scope)).toEqual([project]);
      for (const kind of ['project', 'client'] satisfies Kind[]) {
        await revoke(kind, ion);
        const response = await request('/projects?view=mine_open', scope);
        expect(response.status, kind).toBe(403);
        expect(JSON.stringify(await response.json())).not.toContain(
          project.title,
        );
        await grant(kind, ion);
        expect(await directory(scope)).toEqual([project]);
      }
      // Known live Client/Project bundles provide effective context as before.
      await revoke('context', ion);
      expect(await directory(scope)).toEqual([project]);
      await grant('context', ion);
      for (const company of ['', randomUUID()]) {
        const response = await request('/projects?view=mine_open', {
          ...scope,
          company,
        });
        expect(response.status).toBe(403);
        expect(JSON.stringify(await response.json())).not.toContain(
          project.title,
        );
      }
      await command('/workspace-membership-suspensions', {
        workspaceMembershipId: ion,
      });
      const suspended = await request('/projects?view=mine_open', scope);
      expect(suspended.status).toBe(403);
      expect(JSON.stringify(await suspended.json())).not.toContain(
        project.title,
      );
    });

    it.each([null, 'unknown'])(
      'fails closed for captured Project permission version %s without responsibility granting access',
      async (version) => {
        const ion = await member('ion', true);
        await set(0, ion);
        expect(await directory({ subject: 'ion' })).toEqual([project]);
        await withUnsupportedPermissionVersion(
          await projectAssignment(ion),
          version,
          async () => {
            const response = await request('/projects?view=mine_open', {
              subject: 'ion',
            });
            expect(response.status).toBe(403);
            expect(JSON.stringify(await response.json())).not.toContain(
              project.title,
            );
          },
        );
        expect(await directory({ subject: 'ion' })).toEqual([project]);
      },
    );

    it('preserves original superseded Client reads and reversal fences through repeated Mine reads', async () => {
      await set(0, ownerMembershipId);
      const union = await unionSetup(true);
      const before = await directoryPersistence();
      const own = await directory();
      expect(own).toEqual([
        expect.objectContaining({
          id: projectId,
          clientAccountId: clientId,
          clientDossierId: union.second,
        }),
      ]);
      expect(await directory()).toEqual(own);
      expect(await directoryPersistence()).toEqual(before);
      const reversed = await reverse(union.reference);
      expect(reversed.status).toBe(201);
      expect(await directory()).toEqual([
        expect.objectContaining({
          id: projectId,
          clientAccountId: clientId,
          clientDossierId: clientId,
        }),
      ]);
    });

    it.each([null, 'unknown'])(
      'fails closed for captured Client permission version %s on the self directory',
      async (version) => {
        const ion = await member('ion', true);
        await set(0, ion);
        expect(await directory({ subject: 'ion' })).toEqual([project]);
        const assignment = await harness.pool.query<{ id: string }>(
          "SELECT id FROM company_role_assignments WHERE bundle='company_director_client_access' AND workspace_membership_id=$1 AND company_id=$2 AND revoked_at IS NULL",
          [ion, companyId],
        );
        await withUnsupportedPermissionVersion(
          string(assignment.rows[0]?.id),
          version,
          async () => {
            const response = await request('/projects?view=mine_open', {
              subject: 'ion',
            });
            expect(response.status).toBe(403);
            expect(JSON.stringify(await response.json())).not.toContain(
              project.title,
            );
          },
        );
        expect(await directory({ subject: 'ion' })).toEqual([project]);
      },
    );

    it('removes a self Project when its original Client or relationship becomes unreadable', async () => {
      await set(0, ownerMembershipId);
      expect(await directory()).toEqual([project]);
      // Existing invalidation fixtures; no public archive workflow is invented.
      await harness.pool.query(
        "UPDATE client_company_relationships SET status='archived' WHERE company_id=$1 AND client_account_id=$2",
        [companyId, clientId],
      );
      expect(await directory()).toEqual([]);
      await harness.pool.query(
        "UPDATE client_company_relationships SET status='active' WHERE company_id=$1 AND client_account_id=$2",
        [companyId, clientId],
      );
      expect(await directory()).toEqual([project]);
      await harness.pool.query(
        "UPDATE client_accounts SET status='archived' WHERE id=$1",
        [clientId],
      );
      expect(await directory()).toEqual([]);
    });

    it('denies an inactive Internal User or Company instead of returning an empty successful self directory', async () => {
      const ion = await member('ion', true);
      await set(0, ion);
      const current = await read('/access/current-actor', { subject: 'ion' });
      expect(await directory({ subject: 'ion' })).toEqual([project]);
      await harness.pool.query(
        "UPDATE internal_users SET status='inactive' WHERE id=$1",
        [string(current.internalUserId)],
      );
      const inactiveUser = await request('/projects?view=mine_open', {
        subject: 'ion',
      });
      expect(inactiveUser.status).toBe(403);
      expect(JSON.stringify(await inactiveUser.json())).not.toContain(
        project.title,
      );
      await harness.pool.query(
        "UPDATE internal_users SET status='active' WHERE id=$1",
        [string(current.internalUserId)],
      );
      expect(await directory({ subject: 'ion' })).toEqual([project]);
      await harness.pool.query(
        "UPDATE companies SET status='inactive' WHERE id=$1",
        [companyId],
      );
      const inactiveCompany = await request('/projects?view=mine_open', {
        subject: 'ion',
      });
      expect(inactiveCompany.status).toBe(403);
      expect(JSON.stringify(await inactiveCompany.json())).not.toContain(
        project.title,
      );
    });

    it('captures Project Access v2 on a fresh grant and lets its holder name, reload and replace the responsible member', async () => {
      const actor = await read('/access/current-actor');
      expect(object(actor.activeCompany).projectPermissions).toEqual([
        'project.read',
        'project.create',
        'project.update',
      ]);
      expect(await responsibility()).toEqual({
        responsible: null,
        revision: 0,
        lastChange: null,
        mutable: true,
      });
      const ion = await member('ion', true);
      const ionEntry = await candidate(ion);
      expect(ionEntry).toEqual({
        workspaceMembershipId: ion,
        displayLabel: expect.stringContaining('ion'),
      });
      expect(await set(0, ion)).toEqual({
        projectId,
        outcome: 'changed',
        revision: 1,
        responsible: ionEntry,
      });
      expect(await responsibility()).toEqual({
        responsible: ionEntry,
        revision: 1,
        lastChange: {
          actorDisplayName: 'Responsible Owner',
          occurredAt: expect.any(String),
        },
        mutable: true,
      });
      const maria = await member('maria', true);
      const mariaEntry = await candidate(maria);
      expect(await set(1, maria)).toEqual({
        projectId,
        outcome: 'changed',
        revision: 2,
        responsible: mariaEntry,
      });
      const reloaded = await responsibility({ subject: 'ion' });
      expect(reloaded).toMatchObject({ responsible: mariaEntry, revision: 2 });
      expect(
        Number.isNaN(
          Date.parse(string(object(reloaded.lastChange).occurredAt)),
        ),
      ).toBe(false);
      const target = {
        type: 'project',
        projectId,
        projectTitle: 'ISO preparation',
        companyId,
      };
      const eventActor = {
        internalUserId: ownerInternalUserId,
        displayName: 'Responsible Owner',
      };
      const events = await responsibleEvents();
      expect(events).toEqual([
        {
          id: expect.any(String),
          action: 'project.responsible.changed',
          occurredAt: object(reloaded.lastChange).occurredAt,
          actor: eventActor,
          target,
          metadata: { revision: 2, before: ionEntry, after: mariaEntry },
        },
        {
          id: expect.any(String),
          action: 'project.responsible.changed',
          occurredAt: expect.any(String),
          actor: eventActor,
          target,
          metadata: { revision: 1, before: null, after: ionEntry },
        },
      ]);
      expect(JSON.stringify(events)).not.toContain('@');
      // The Project list and detail payloads are unchanged and it stays preparatory.
      expect(await read(`/projects/${projectId}`)).toEqual(project);
      const list = await request('/projects');
      expect(await list.json()).toEqual([project]);
    });

    it('never expands a legacy v1 assignment, recaptures v2 only after explicit revocation and fails closed for null or unknown versions', async () => {
      const ion = await member('ion', true);
      const legacy = await member('legacy', true);
      await captureLegacyVersion(legacy);
      const legacyActor = await read('/access/current-actor', {
        subject: 'legacy',
      });
      expect(object(legacyActor.activeCompany).projectPermissions).toEqual([
        'project.read',
        'project.create',
      ]);
      // Every delivered read and create keeps accepting captured v1.
      expect(
        await read(`/projects/${projectId}`, { subject: 'legacy' }),
      ).toEqual(project);
      await command(
        '/projects',
        { title: 'Legacy preparation', clientAccountId: clientId },
        { subject: 'legacy' },
      );
      expect(await responsibility({ subject: 'legacy' })).toEqual({
        responsible: null,
        revision: 0,
        lastChange: null,
        mutable: true,
      });
      expect((await change(0, ion, { subject: 'legacy' })).status).toBe(403);
      expect(
        (
          await request(`/projects/${projectId}/eligible-responsible-members`, {
            subject: 'legacy',
          })
        ).status,
      ).toBe(403);
      // A v1 reader stays an eligible responsible member and Task assignee, and
      // keeps My Tasks and the Document–Project read.
      expect(
        (await candidates()).map((entry) => entry.workspaceMembershipId),
      ).toContain(legacy);
      for (const target of [ownerMembershipId, legacy]) {
        await grant('task', target);
        await grant('document', target);
      }
      expect(
        objects(
          (await read(`/projects/${projectId}/eligible-task-assignees`))
            .members,
        ).map((entry) => entry.workspaceMembershipId),
      ).toContain(legacy);
      const task = await command(`/projects/${projectId}/tasks`, {
        title: 'Legacy notes',
        assigneeMembershipId: legacy,
      });
      expect(
        objects(
          (await read('/assigned-tasks', { subject: 'legacy' })).tasks,
        ).map((entry) => entry.id),
      ).toEqual([task.id]);
      expect(
        await read(`/projects/${projectId}/documents`, { subject: 'legacy' }),
      ).toMatchObject({ mutable: true, documents: [] });
      expect(
        await read('/access/current-actor', { subject: 'legacy' }),
      ).toMatchObject({
        activeCompany: {
          projectPermissions: ['project.read', 'project.create'],
        },
      });
      // Granting an already active v1 assignment again does not expand it.
      expect(await grant('project', legacy)).toMatchObject({
        bundle: 'Company Project Access',
        permissionSetVersion: 'v1',
        active: true,
      });
      expect((await change(0, ion, { subject: 'legacy' })).status).toBe(403);
      await revoke('project', legacy);
      const fresh = await grant('project', legacy);
      expect(fresh).toMatchObject({
        bundle: 'Company Project Access',
        permissionSetVersion: 'v2',
        active: true,
      });
      expect(await set(0, ion, { subject: 'legacy' })).toMatchObject({
        outcome: 'changed',
        revision: 1,
      });
      for (const version of [null, 'v3'])
        await withUnsupportedPermissionVersion(
          string(fresh.id),
          version,
          async () => {
            const current = await read('/access/current-actor', {
              subject: 'legacy',
            });
            expect(object(current.activeCompany).projectPermissions).toBe(
              undefined,
            );
            for (const path of [
              '/projects',
              `/projects/${projectId}`,
              `/projects/${projectId}/responsible`,
              `/projects/${projectId}/eligible-responsible-members`,
            ])
              expect((await request(path, { subject: 'legacy' })).status).toBe(
                403,
              );
            expect((await change(1, null, { subject: 'legacy' })).status).toBe(
              403,
            );
            expect(
              (await candidates()).map((entry) => entry.workspaceMembershipId),
            ).not.toContain(legacy);
          },
        );
      expect(await responsibleEvents()).toHaveLength(1);
    });

    it('confers project.update through no other bundle or Workspace ownership', async () => {
      const maria = await member('maria');
      for (const kind of [
        'context',
        'client',
        'task',
        'document',
      ] satisfies Kind[])
        await grant(kind, maria);
      const actor = await read('/access/current-actor', { subject: 'maria' });
      expect(object(actor.activeCompany).projectPermissions).toBe(undefined);
      expect((await change(0, null, { subject: 'maria' })).status).toBe(403);
      // The Workspace Owner holds Company, Client and assignment administration
      // but loses every Project path once its own Project Access is revoked.
      await revoke('project', ownerMembershipId);
      for (const path of [
        `/projects/${projectId}/responsible`,
        `/projects/${projectId}/eligible-responsible-members`,
      ])
        expect((await request(path)).status).toBe(403);
      expect((await change(0, null)).status).toBe(403);
      expect(await responsibleEvents()).toEqual([]);
    });

    it('keeps every delivered Project, Task, Document and My Tasks read for v2 holders', async () => {
      const ion = await member('ion', true);
      await grant('task');
      await grant('task', ion);
      await grant('document');
      expect(
        (await read('/access/current-actor', { subject: 'ion' })).activeCompany,
      ).toMatchObject({
        projectPermissions: [
          'project.read',
          'project.create',
          'project.update',
        ],
      });
      const second = await command('/projects', {
        title: 'Second preparation',
        clientAccountId: clientId,
      });
      const firstCreatedAt = '2034-01-01T00:00:00.000Z';
      const secondCreatedAt = '2035-01-01T00:00:00.000Z';
      await harness.pool.query(
        'UPDATE projects SET created_at = CASE WHEN id = $1::uuid THEN $3::timestamptz ELSE $4::timestamptz END WHERE id IN ($1::uuid, $2::uuid)',
        [projectId, string(second.id), firstCreatedAt, secondCreatedAt],
      );
      project.createdAt = firstCreatedAt;
      second.createdAt = secondCreatedAt;
      const listed = await request('/projects');
      expect(await listed.json()).toEqual([project, second]);
      const assignees = objects(
        (await read(`/projects/${projectId}/eligible-task-assignees`)).members,
      ).map((entry) => entry.workspaceMembershipId);
      expect(assignees).toEqual(
        expect.arrayContaining([ownerMembershipId, ion]),
      );
      const task = await command(`/projects/${projectId}/tasks`, {
        title: 'Collect preparation notes',
        assigneeMembershipId: ion,
      });
      expect(await read(`/projects/${projectId}/tasks`)).toMatchObject({
        mutable: true,
        tasks: [task],
      });
      expect(
        objects((await read(`/tasks/${string(task.id)}/history`)).events),
      ).toHaveLength(1);
      expect(
        objects((await read('/assigned-tasks', { subject: 'ion' })).tasks).map(
          (entry) => entry.id,
        ),
      ).toEqual([task.id]);
      expect(await read(`/projects/${projectId}/documents`)).toMatchObject({
        mutable: true,
        documents: [],
      });
      const activity = objects((await read('/activity-log')).events);
      expect(
        activity
          .filter((event) => event.action === 'project.created')
          .map((event) => object(event.target).projectId),
      ).toEqual(expect.arrayContaining([projectId, second.id]));
      expect(
        activity.filter((event) => event.action === 'task.created'),
      ).toHaveLength(1);
    });

    it('lists only eligible members without directory fields and rejects every directly submitted ineligible identifier identically', async () => {
      const ion = await member('ion', true);
      const maria = await member('maria');
      await grant('context', maria);
      await grant('client', maria);
      const legacy = await member('legacy');
      await grant('context', legacy);
      await grant('project', legacy);
      const other = string(
        (await command('/companies', { displayName: 'BIC' })).id,
      );
      const outsider = await member('outsider');
      for (const kind of ['context', 'client', 'project'] satisfies Kind[])
        await grant(kind, outsider, other);
      const suspended = await member('suspended', true);
      await command('/workspace-membership-suspensions', {
        workspaceMembershipId: suspended,
      });
      const versions = await clientVersions();
      const members = await candidates();
      expect(members).toEqual([
        expect.objectContaining({ workspaceMembershipId: ion }),
        expect.objectContaining({ workspaceMembershipId: ownerMembershipId }),
      ]);
      for (const entry of members)
        expect(Object.keys(entry)).toEqual([
          'workspaceMembershipId',
          'displayLabel',
        ]);
      const page = JSON.stringify(members);
      for (const hidden of ['@', maria, legacy, outsider, suspended])
        expect(page).not.toContain(hidden);
      const rejections = [];
      for (const id of [randomUUID(), maria, legacy, outsider, suspended]) {
        const response = await change(0, id);
        expect(response.status).toBe(400);
        rejections.push(await body(response));
      }
      for (const rejection of rejections)
        expect(rejection).toEqual(rejections[0]);
      expect(await responsibility()).toMatchObject({
        responsible: null,
        revision: 0,
      });
      expect(await clientVersions()).toEqual(versions);
      expect(await responsibleEvents()).toEqual([]);
      expect(await receipts()).toEqual([]);
      // Being named grants nothing: no Task read, assignment or My Tasks entry.
      await set(0, ion);
      for (const path of [`/projects/${projectId}/tasks`, '/assigned-tasks'])
        expect((await request(path, { subject: 'ion' })).status).toBe(403);
      expect(await read(`/projects/${projectId}`)).toEqual(project);
    });

    it('rejects malformed commands, a missing key and hidden Projects without writing', async () => {
      const ion = await member('ion', true);
      for (const value of [
        {},
        { expectedRevision: 0 },
        { expectedRevision: -1, workspaceMembershipId: ion },
        { expectedRevision: 0, workspaceMembershipId: 'ion' },
        { expectedRevision: 0, workspaceMembershipId: ion, title: 'Changed' },
      ])
        expect(
          (
            await request(`/projects/${projectId}/responsible`, {
              method: 'PUT',
              value,
            })
          ).status,
        ).toBe(400);
      expect((await change(0, ion, { key: null })).status).toBe(400);
      expect(
        (
          await request('/projects/not-a-project/responsible', {
            method: 'PUT',
            value: { expectedRevision: 0, workspaceMembershipId: ion },
          })
        ).status,
      ).toBe(400);
      expect((await change(0, ion, {}, randomUUID())).status).toBe(404);
      const other = string(
        (await command('/companies', { displayName: 'BIC' })).id,
      );
      await grant('project', ownerMembershipId, other);
      await grant('client', ownerMembershipId, other);
      for (const response of [
        await change(0, ion, { company: other }),
        await request(`/projects/${projectId}/responsible`, { company: other }),
        await request(`/projects/${projectId}/eligible-responsible-members`, {
          company: other,
        }),
      ])
        expect(response.status).toBe(404);
      expect(
        (await fetch(`${harness.origin}/api/projects/${projectId}/responsible`))
          .status,
      ).toBe(401);
      expect(await receipts()).toEqual([]);
      expect(await responsibility()).toMatchObject({ revision: 0 });
    });

    it('conflicts on a stale revision and lets at most one of two concurrent commands change the responsibility', async () => {
      const ion = await member('ion', true);
      const ownerEntry = await candidate(ownerMembershipId);
      expect((await change(1, ion)).status).toBe(409);
      await set(0, ion);
      expect((await change(0, null)).status).toBe(409);
      const versions = await clientVersions();
      const [clear, replace] = await Promise.all([
        change(1, null, { subject: 'ion' }),
        change(1, ownerMembershipId),
      ]);
      expect([clear.status, replace.status].sort()).toEqual([200, 409]);
      expect(await responsibility()).toMatchObject({
        revision: 2,
        responsible: clear.status === 200 ? null : ownerEntry,
      });
      expect(await responsibleEvents()).toHaveLength(2);
      const [after] = await clientVersions();
      expect(after?.version).toBe((versions[0]?.version ?? 0) + 1);
    });

    it('records a normalized no-op as an unchanged receipt without event or fence advance after the usual checks', async () => {
      const ion = await member('ion', true);
      const versions = await clientVersions();
      expect(await set(0, null)).toEqual({
        projectId,
        outcome: 'unchanged',
        revision: 0,
        responsible: null,
      });
      await responsibility();
      await candidates();
      expect(await clientVersions()).toEqual(versions);
      expect(await responsibleEvents()).toEqual([]);
      const ionEntry = (await set(0, ion)).responsible;
      const changed = await clientVersions();
      expect(changed[0]?.version).toBe((versions[0]?.version ?? 0) + 1);
      expect(await set(1, ion)).toEqual({
        projectId,
        outcome: 'unchanged',
        revision: 1,
        responsible: ionEntry,
      });
      expect((await change(0, ion)).status).toBe(409);
      expect((await change(1, ion, { subject: 'legacy' })).status).toBe(403);
      expect(await clientVersions()).toEqual(changed);
      expect(await responsibleEvents()).toHaveLength(1);
      expect(await responsibility()).toMatchObject({ revision: 1 });
    });

    it('replays an exact command before the stale check, conflicts on changed key reuse and denies replay after revocation', async () => {
      const ion = await member('ion', true);
      const key = randomUUID();
      const first = await set(0, ion, { key, subject: 'ion' });
      const versions = await clientVersions();
      expect(await set(0, ion, { key, subject: 'ion' })).toEqual(first);
      expect(await clientVersions()).toEqual(versions);
      await set(1, null);
      expect(await set(0, ion, { key, subject: 'ion' })).toEqual(first);
      const second = string(
        (
          await command('/projects', {
            title: 'Second preparation',
            clientAccountId: clientId,
          })
        ).id,
      );
      for (const response of [
        await change(0, null, { key, subject: 'ion' }),
        await change(0, ownerMembershipId, { key, subject: 'ion' }),
        await change(2, ion, { key, subject: 'ion' }),
        await change(0, ion, { key, subject: 'ion' }, second),
      ])
        expect(response.status).toBe(409);
      expect(await responsibleEvents()).toHaveLength(2);
      await revoke('project', ion);
      expect((await change(0, ion, { key, subject: 'ion' })).status).toBe(403);
      expect(await responsibility()).toMatchObject({
        responsible: null,
        revision: 2,
      });
    });

    it.each(['membership-contention', 'revocation-first', 'mutation-first'])(
      'serializes queued Project authority changes with %s',
      async (order) => {
        const ion = await member('ion', true);
        const key = randomUUID();
        const before = await clientVersions();
        const control = await harness.pool.connect();
        const pending: Promise<Response>[] = [];
        const blockedBy = async ({
          pids,
          excluded = [],
        }: {
          pids: readonly number[];
          excluded?: readonly number[];
        }) => {
          const deadline = performance.now() + 2000;
          while (performance.now() < deadline) {
            const result = await harness.pool.query<{ pid: number }>(
              `SELECT pid FROM pg_stat_activity
               WHERE datname=current_database() AND wait_event_type='Lock'
                 AND pg_blocking_pids(pid) && $1::integer[]
                 AND NOT (pid = ANY($2::integer[]))`,
              [pids, excluded],
            );
            const [blocked] = result.rows;
            if (result.rows.length === 1 && blocked) return blocked.pid;
            await delay(10);
          }
          throw new Error(
            'Expected the public command to reach its lock barrier.',
          );
        };
        try {
          await control.query('BEGIN');
          const result = await control.query<{ pid: number }>(
            'SELECT pg_backend_pid() AS pid',
          );
          const controller = result.rows[0];
          if (!controller) throw new Error('Missing control connection.');
          await control.query(
            order === 'membership-contention'
              ? 'SELECT id FROM workspace_memberships WHERE id=$1 FOR UPDATE'
              : order === 'revocation-first'
                ? `SELECT id FROM company_role_assignments
                   WHERE workspace_membership_id=$1 AND bundle='company_project_access'
                   FOR UPDATE`
                : 'SELECT id FROM projects WHERE id=$1 FOR UPDATE',
            [order === 'mutation-first' ? projectId : ion],
          );
          const mutate = () =>
            change(0, ownerMembershipId, { key, subject: 'ion' });
          const revokeAccess = () =>
            request(`${assignments.project}/${ion}/${companyId}`, {
              method: 'DELETE',
            });
          const first = order === 'mutation-first' ? mutate() : revokeAccess();
          pending.push(first);
          const firstPid = await blockedBy({ pids: [controller.pid] });
          const second = order === 'mutation-first' ? revokeAccess() : mutate();
          pending.push(second);
          await blockedBy({
            pids:
              order === 'mutation-first'
                ? [firstPid]
                : [controller.pid, firstPid],
            excluded: [firstPid],
          });
          await control.query('COMMIT');
          const [firstResponse, secondResponse] = await Promise.all([
            first,
            second,
          ]);
          const mutation =
            order === 'mutation-first' ? firstResponse : secondResponse;
          const revoked =
            order === 'mutation-first' ? secondResponse : firstResponse;
          expect(revoked.status).toBe(200);
          if (order === 'membership-contention')
            expect([200, 403]).toContain(mutation.status);
          else
            expect(mutation.status).toBe(
              order === 'revocation-first' ? 403 : 200,
            );
          const committed = mutation.status === 200;
          expect(await responsibility()).toMatchObject({
            revision: committed ? 1 : 0,
          });
          expect(await responsibleEvents()).toHaveLength(committed ? 1 : 0);
          const [after] = await clientVersions();
          expect(after?.version).toBe(
            (before[0]?.version ?? 0) + (committed ? 1 : 0),
          );
          expect(
            (await change(0, ownerMembershipId, { key, subject: 'ion' }))
              .status,
          ).toBe(403);
        } finally {
          await control.query('ROLLBACK');
          control.release();
          await Promise.allSettled(pending);
        }
      },
    );

    it.each(['revocation', 'suspension'])(
      'serializes a change against actor %s and denies all later replay',
      async (authorityChange) => {
        const ion = await member('ion', true);
        const key = randomUUID();
        const [mutation, changed] = await Promise.all([
          change(0, ownerMembershipId, { key, subject: 'ion' }),
          authorityChange === 'revocation'
            ? request(`${assignments.project}/${ion}/${companyId}`, {
                method: 'DELETE',
              })
            : request('/workspace-membership-suspensions', {
                method: 'POST',
                value: { workspaceMembershipId: ion },
              }),
        ]);
        expect(changed.status).toBe(
          authorityChange === 'revocation' ? 200 : 201,
        );
        expect([200, 403]).toContain(mutation.status);
        const committed = mutation.status === 200;
        expect(await responsibility()).toMatchObject({
          revision: committed ? 1 : 0,
        });
        expect(await responsibleEvents()).toHaveLength(committed ? 1 : 0);
        expect(
          (await change(0, ownerMembershipId, { key, subject: 'ion' })).status,
        ).toBe(403);
      },
    );

    it.each(['revocation', 'suspension'])(
      'serializes naming a target against its %s',
      async (authorityChange) => {
        const maria = await member('maria', true);
        const [mutation, changed] = await Promise.all([
          change(0, maria),
          authorityChange === 'revocation'
            ? request(`${assignments.client}/${maria}/${companyId}`, {
                method: 'DELETE',
              })
            : request('/workspace-membership-suspensions', {
                method: 'POST',
                value: { workspaceMembershipId: maria },
              }),
        ]);
        expect(changed.status).toBe(
          authorityChange === 'revocation' ? 200 : 201,
        );
        expect([200, 400]).toContain(mutation.status);
        const named = mutation.status === 200;
        expect(await responsibility()).toMatchObject({
          revision: named ? 1 : 0,
          responsible: named
            ? expect.objectContaining({ workspaceMembershipId: maria })
            : null,
        });
        expect(
          (await candidates()).map((entry) => entry.workspaceMembershipId),
        ).not.toContain(maria);
      },
    );

    it.each(['project', 'client', 'suspension'] satisfies Array<
      'project' | 'client' | 'suspension'
    >)(
      'keeps a responsible member who loses eligibility by %s on record without access, then lets a manager replace and clear them',
      async (loss) => {
        const ion = await member('ion', true);
        const ionEntry = object((await set(0, ion)).responsible);
        if (loss === 'suspension')
          await command('/workspace-membership-suspensions', {
            workspaceMembershipId: ion,
          });
        else await revoke(loss, ion);
        expect(await responsibility()).toMatchObject({
          responsible: ionEntry,
          revision: 1,
        });
        expect(
          (await candidates()).map((entry) => entry.workspaceMembershipId),
        ).not.toContain(ion);
        expect(
          (
            await request(`/projects/${projectId}/responsible`, {
              subject: 'ion',
            })
          ).status,
        ).toBe(403);
        // Naming the same recorded member again is a normalized no-op.
        expect(await set(1, ion)).toMatchObject({
          outcome: 'unchanged',
          revision: 1,
          responsible: ionEntry,
        });
        const maria = await member('maria', true);
        const mariaEntry = await candidate(maria);
        expect(await set(1, maria)).toMatchObject({
          outcome: 'changed',
          revision: 2,
          responsible: mariaEntry,
        });
        expect(await set(2, null)).toMatchObject({
          outcome: 'changed',
          revision: 3,
          responsible: null,
        });
        const events = await responsibleEvents();
        expect(events).toHaveLength(3);
        expect(events.map((event) => event.metadata)).toEqual(
          expect.arrayContaining([
            { revision: 3, before: mariaEntry, after: null },
            { revision: 2, before: ionEntry, after: mariaEntry },
            { revision: 1, before: null, after: ionEntry },
          ]),
        );
        let previous: { occurredAt: number; id: string } | undefined;
        for (const event of events) {
          const occurredAt = Date.parse(string(event.occurredAt));
          if (!Number.isFinite(occurredAt))
            throw new Error('Expected recorded event time.');
          const current = { occurredAt, id: string(event.id) };
          if (previous)
            expect(
              previous.occurredAt > current.occurredAt ||
                (previous.occurredAt === current.occurredAt &&
                  previous.id > current.id),
            ).toBe(true);
          previous = current;
        }
      },
    );

    it('keeps the responsibility readable under a superseded original Client, refuses every change and still confirms an exact replay', async () => {
      const ion = await member('ion', true);
      const key = randomUUID();
      const receipt = await set(0, ion, { key });
      const current = await responsibility();
      const union = await unionSetup(true);
      const versions = await clientVersions();
      const readOnly = await responsibility();
      expect(readOnly).toEqual({ ...current, mutable: false });
      for (const hidden of [union.second, 'Legacy synthetic identity'])
        expect(JSON.stringify(readOnly)).not.toContain(hidden);
      for (const response of [
        await change(1, null),
        await change(1, ownerMembershipId),
        await change(1, ion),
        await request(`/projects/${projectId}/eligible-responsible-members`),
      ]) {
        expect(response.status).toBe(404);
        expect(await response.text()).not.toContain(union.second);
      }
      expect(await set(0, ion, { key })).toEqual(receipt);
      expect(await clientVersions()).toEqual(versions);
      expect(await responsibleEvents()).toHaveLength(1);
      expect((await reverse(union.reference)).status).toBe(201);
      expect(await responsibility()).toEqual(current);
    });

    it('allows union reversal after reads, no-ops, rejected commands and exact replays', async () => {
      const ion = await member('ion', true);
      const key = randomUUID();
      await set(0, ion, { key });
      const union = await unionSetup();
      await responsibility();
      await candidates();
      await set(1, ion);
      expect((await change(1, randomUUID())).status).toBe(400);
      expect((await change(0, null)).status).toBe(409);
      expect(await set(0, ion, { key })).toMatchObject({ revision: 1 });
      expect((await reverse(union.reference)).status).toBe(201);
    });

    it('blocks union reversal after one material responsible change', async () => {
      const ion = await member('ion', true);
      const union = await unionSetup();
      await set(0, ion);
      expect((await reverse(union.reference)).status).toBe(409);
      expect(await responsibility()).toMatchObject({
        revision: 1,
        mutable: true,
      });
    });

    it('projects the change only to current Project and Client readers of the original relationship', async () => {
      const ion = await member('ion', true);
      await set(0, ion);
      const legacy = await member('legacy', true);
      await captureLegacyVersion(legacy);
      expect(await responsibleEvents({ subject: 'legacy' })).toHaveLength(1);
      const maria = await member('maria');
      await grant('context', maria);
      await grant('client', maria);
      expect(await responsibleEvents({ subject: 'maria' })).toEqual([]);
      const outsider = await member('outsider');
      await grant('context', outsider);
      await grant('project', outsider);
      expect(await responsibleEvents({ subject: 'outsider' })).toEqual([]);
      const other = string(
        (await command('/companies', { displayName: 'BIC' })).id,
      );
      await grant('project', ownerMembershipId, other);
      await grant('client', ownerMembershipId, other);
      expect(await responsibleEvents({ company: other })).toEqual([]);
      await harness.pool.query(
        "UPDATE client_company_relationships SET status = 'archived' WHERE client_account_id = $1 AND company_id = $2",
        [clientId, companyId],
      );
      expect(await responsibleEvents()).toEqual([]);
      await harness.pool.query(
        "UPDATE client_company_relationships SET status = 'active' WHERE client_account_id = $1 AND company_id = $2",
        [clientId, companyId],
      );
      expect(await responsibleEvents()).toHaveLength(1);
      await revoke('project', ownerMembershipId);
      expect(await responsibleEvents()).toEqual([]);
    });

    it('rolls back the responsibility, receipt and Client fence together when the event cannot be recorded', async () => {
      const ion = await member('ion', true);
      const key = randomUUID();
      const versions = await clientVersions();
      await harness.pool
        .query(`CREATE FUNCTION reject_responsible_event() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'forced event failure'; END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER reject_responsible_event BEFORE INSERT ON project_responsibility_events FOR EACH ROW EXECUTE FUNCTION reject_responsible_event()`);
      try {
        expect((await change(0, ion, { key })).status).toBe(500);
        expect(await responsibility()).toEqual({
          responsible: null,
          revision: 0,
          lastChange: null,
          mutable: true,
        });
        expect(await receipts()).toEqual([]);
        expect(await clientVersions()).toEqual(versions);
      } finally {
        await harness.pool.query(
          'DROP TRIGGER reject_responsible_event ON project_responsibility_events; DROP FUNCTION reject_responsible_event()',
        );
      }
      expect(await set(0, ion, { key })).toMatchObject({
        outcome: 'changed',
        revision: 1,
      });
      expect(await responsibleEvents()).toHaveLength(1);
    });
  },
);
