import { randomUUID } from 'node:crypto';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AccessService } from '../access/access.service.js';
import {
  json,
  object,
  string,
  openNextActionFixture,
  workspaceId,
  type NextActionFixture,
} from './project-next-action.test-support.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
(databaseUrl ? describe : describe.skip)(
  'Project next-action public scope and captures',
  () => {
    let fixture: NextActionFixture;
    beforeAll(async () => {
      if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
      fixture = await openNextActionFixture(databaseUrl);
    });
    afterEach(() => vi.restoreAllMocks());
    afterAll(async () => fixture?.close());
    const body = {
      expectedRevision: 0,
      expectedLifecycleRevision: 0,
      text: 'CONFIDENTIAL first target action',
    };
    async function coordinator() {
      const c = await fixture.setup();
      await fixture.created(
        '/company-project-next-action-coordinator-assignments',
        { companyId: c.companyId, workspaceMembershipId: c.membershipId },
      );
      return c;
    }
    async function refused(response: Response, status: number) {
      expect(response.status).toBe(status);
      const value = await json(response);
      for (const field of ['current', 'history', 'record', 'text', 'revision'])
        expect(value).not.toHaveProperty(field);
      expect(JSON.stringify(value)).not.toContain(body.text);
    }
    it('grants no coordination through Project responsibility or its creator and Workspace Owner titles', async () => {
      const c = await fixture.setup();
      const colleague = await json(
        await fixture.request('/access/current-actor', {
          subject: 'next-action-colleague',
        }),
      );
      const member = string(colleague.workspaceMembershipId);
      for (const bundle of ['context', 'director-client', 'project'])
        await fixture.created(`/company-${bundle}-assignments`, {
          companyId: c.companyId,
          workspaceMembershipId: member,
        });
      const assignment = await fixture.request(
        `/projects/${c.projectId}/responsible`,
        {
          method: 'PUT',
          companyId: c.companyId,
          body: { expectedRevision: 0, workspaceMembershipId: member },
        },
      );
      expect(assignment.status).toBe(200);
      expect(await json(assignment)).toMatchObject({
        responsible: { workspaceMembershipId: member },
      });
      for (const subject of ['next-action-owner', 'next-action-colleague']) {
        expect(
          (await fixture.request(c.path, { companyId: c.companyId, subject }))
            .status,
        ).toBe(200);
        await refused(
          await fixture.request(c.path, {
            method: 'POST',
            companyId: c.companyId,
            subject,
            body,
          }),
          403,
        );
      }
      expect(
        (
          await fixture.pool.query(
            'SELECT count(*)::int AS count FROM project_next_action_commands',
          )
        ).rows,
      ).toEqual([{ count: 0 }]);
    });
    it.each(['v1', 'v2'])(
      'keeps native Project Access %s reads and explicit independent coordination compatible',
      async (version) => {
        const c = await coordinator();
        // Seed a supported historical capture. Public grants continue to capture the
        // current version; this test does not expand or migrate a real assignment.
        await fixture.pool.query(
          "UPDATE company_role_assignments SET permission_set_version=$1 WHERE company_id=$2 AND workspace_membership_id=$3 AND bundle='company_project_access'",
          [version, c.companyId, c.membershipId],
        );
        const actor = await json(
          await fixture.request('/access/current-actor', {
            companyId: c.companyId,
          }),
        );
        expect(object(actor.activeCompany).projectPermissionSetVersion).toBe(
          version,
        );
        expect(
          (await fixture.request(c.path, { companyId: c.companyId })).status,
        ).toBe(200);
        const request = {
          method: 'POST',
          companyId: c.companyId,
          body,
          key: 'compatible-project-capture',
        };
        const saved = await fixture.request(c.path, request);
        expect(saved.status).toBe(200);
        const receipt = await json(saved);
        expect(await json(await fixture.request(c.path, request))).toEqual(
          receipt,
        );
      },
    );
    it('qualifies real foreign Company and changed-target/Company keys before disclosing any receipt', async () => {
      const c = await coordinator();
      const saved = await fixture.request(c.path, {
        method: 'POST',
        companyId: c.companyId,
        body,
        key: 'same-workspace-key',
      });
      expect(saved.status).toBe(200);
      const receipt = await json(saved);
      const second = await fixture.created(
        '/projects',
        { clientAccountId: c.clientId, title: 'Second readable Project DEMO' },
        c.companyId,
      );
      const secondPath = `/projects/${string(second.id)}/next-action`;
      await refused(
        await fixture.request(secondPath, {
          method: 'POST',
          companyId: c.companyId,
          body,
          key: 'same-workspace-key',
        }),
        409,
      );
      const companyId = string(
        (
          await fixture.created('/companies', {
            displayName: 'Other Company DEMO',
          })
        ).id,
      );
      for (const bundle of ['project', 'project-next-action-coordinator'])
        await fixture.created(`/company-${bundle}-assignments`, {
          companyId,
          workspaceMembershipId: c.membershipId,
        });
      const clientId = string(
        (
          await fixture.created(
            '/clients',
            { displayName: 'Other original Client DEMO' },
            companyId,
          )
        ).id,
      );
      const projectId = string(
        (
          await fixture.created(
            '/projects',
            { clientAccountId: clientId, title: 'Other Company Project DEMO' },
            companyId,
          )
        ).id,
      );
      const path = `/projects/${projectId}/next-action`;
      expect((await fixture.request(path, { companyId })).status).toBe(200);
      await refused(
        await fixture.request(path, { companyId: c.companyId }),
        404,
      );
      await refused(
        await fixture.request(path, {
          method: 'POST',
          companyId: c.companyId,
          body,
          key: 'same-workspace-key',
        }),
        404,
      );
      await refused(await fixture.request(c.path, { companyId }), 404);
      await refused(
        await fixture.request(c.path, {
          method: 'POST',
          companyId,
          body,
          key: 'same-workspace-key',
        }),
        404,
      );
      await refused(
        await fixture.request(path, {
          method: 'POST',
          companyId,
          body,
          key: 'same-workspace-key',
        }),
        409,
      );
      expect(
        (
          await fixture.request(path, {
            method: 'POST',
            companyId,
            body,
            key: 'other-visible-company-intent',
          })
        ).status,
      ).toBe(200);
      expect(
        await json(
          await fixture.request(c.path, {
            method: 'POST',
            companyId: c.companyId,
            body,
            key: 'same-workspace-key',
          }),
        ),
      ).toEqual(receipt);
      expect(
        await json(
          await fixture.request(secondPath, { companyId: c.companyId }),
        ),
      ).toMatchObject({ current: { revision: 0 }, history: { entries: [] } });
      expect(
        (
          await fixture.pool.query(
            'SELECT count(*)::int AS count FROM project_next_action_commands',
          )
        ).rows,
      ).toEqual([{ count: 2 }]);
    });
    it('keeps a real foreign Workspace target hidden with independent positive public controls', async () => {
      const c = await coordinator(),
        foreignWorkspace = randomUUID(),
        foreignMember = randomUUID();
      // Only admission/membership provisioning is native: all foreign business
      // records, captures and next-action writes below use the matching public API.
      await fixture.pool.query(
        'INSERT INTO workspaces(id,name) VALUES($1,$2)',
        [foreignWorkspace, 'Foreign Workspace DEMO'],
      );
      await fixture.pool.query(
        'INSERT INTO workspace_memberships(id,workspace_id,internal_user_id) VALUES($1,$2,$3)',
        [foreignMember, foreignWorkspace, c.actor.internalUserId],
      );
      await fixture.pool.query(
        'INSERT INTO workspace_permission_grants(workspace_id,workspace_membership_id,permission) SELECT $1,$2,permission FROM workspace_permission_grants WHERE workspace_id=$3 AND workspace_membership_id=$4',
        [foreignWorkspace, foreignMember, workspaceId, c.membershipId],
      );
      async function create(path: string, value: unknown, companyId?: string) {
        const result = await fixture.request(path, {
          method: 'POST',
          body: value,
          companyId,
          workspaceId: foreignWorkspace,
        });
        expect(result.status).toBe(201);
        return json(result);
      }
      const companyId = string(
        (await create('/companies', { displayName: 'Foreign Company DEMO' }))
          .id,
      );
      for (const bundle of ['project', 'project-next-action-coordinator'])
        await create(`/company-${bundle}-assignments`, {
          companyId,
          workspaceMembershipId: foreignMember,
        });
      const clientId = string(
        (
          await create(
            '/clients',
            { displayName: 'Foreign Client DEMO' },
            companyId,
          )
        ).id,
      );
      const projectId = string(
        (
          await create(
            '/projects',
            { clientAccountId: clientId, title: 'Foreign Project DEMO' },
            companyId,
          )
        ).id,
      );
      const path = `/projects/${projectId}/next-action`,
        options = { companyId, workspaceId: foreignWorkspace };
      expect(
        (
          await fixture.request(path, {
            ...options,
            method: 'POST',
            body,
            key: 'foreign-own-intent',
          })
        ).status,
      ).toBe(200);
      expect(await json(await fixture.request(path, options))).toMatchObject({
        current: {
          workspaceId: foreignWorkspace,
          companyId,
          projectId,
          originalClientAccountId: clientId,
          revision: 1,
        },
      });
      await refused(
        await fixture.request(path, { companyId: c.companyId }),
        404,
      );
      await refused(
        await fixture.request(path, {
          method: 'POST',
          companyId: c.companyId,
          body,
          key: 'foreign-own-intent',
        }),
        404,
      );
      await refused(await fixture.request(path, { companyId }), 403);
      await refused(await fixture.request(c.path, options), 404);
      expect(
        await json(await fixture.request(c.path, { companyId: c.companyId })),
      ).toMatchObject({ current: { workspaceId, revision: 0 } });
    });
    it('requires the exact original Client relationship even for a previously committed receipt', async () => {
      const c = await coordinator(),
        options = {
          method: 'POST',
          companyId: c.companyId,
          body,
          key: 'original-client-only',
        };
      expect((await fixture.request(c.path, options)).status).toBe(200);
      await fixture.pool.query(
        "UPDATE client_company_relationships SET status='archived' WHERE workspace_id=$1 AND company_id=$2 AND client_account_id=$3",
        [workspaceId, c.companyId, c.clientId],
      );
      await refused(
        await fixture.request(c.path, { companyId: c.companyId }),
        404,
      );
      await refused(await fixture.request(c.path, options), 404);
      expect(
        (
          await fixture.pool.query(
            'SELECT count(*)::int AS count FROM project_next_action_commands',
          )
        ).rows,
      ).toEqual([{ count: 1 }]);
    });
    it.each(
      [
        'projectPermissionSetVersion',
        'clientPermissionSetVersion',
        'projectNextActionCoordinatorPermissionSetVersion',
      ].flatMap((capture) =>
        [undefined, null, 'v999'].map((version) => ({ capture, version })),
      ),
    )(
      'fails closed for $capture=$version at the live public endpoint',
      async ({ capture, version }) => {
        const c = await coordinator();
        const colleague = await json(
          await fixture.request('/access/current-actor', {
            subject: 'next-action-colleague',
          }),
        );
        const member = string(colleague.workspaceMembershipId);
        for (const bundle of [
          'context',
          'director-client',
          'project',
          'project-next-action-coordinator',
        ])
          await fixture.created(`/company-${bundle}-assignments`, {
            companyId: c.companyId,
            workspaceMembershipId: member,
          });
        const options = {
          companyId: c.companyId,
          subject: 'next-action-colleague',
        };
        expect((await fixture.request(c.path, options)).status).toBe(200);
        const bundle =
          capture === 'projectPermissionSetVersion'
            ? 'company_project_access'
            : capture === 'clientPermissionSetVersion'
              ? 'company_director_client_access'
              : 'company_project_next_action_coordinator';
        await expect(
          fixture.pool.query(
            'UPDATE company_role_assignments SET permission_set_version=$1 WHERE workspace_membership_id=$2 AND company_id=$3 AND bundle=$4',
            [version, member, c.companyId, bundle],
          ),
        ).rejects.toMatchObject({ code: '23514' });
        // Invalid captures are not representable under the actual native CHECK.
        // Fault only the public Access publisher after real resolution to prove the
        // new HTTP consumer fails closed on a legacy/future/missing capture; its
        // authorization, records and transaction remain real. No guard is disabled.
        const resolve = AccessService.prototype.resolveActor;
        vi.spyOn(AccessService.prototype, 'resolveActor').mockImplementation(
          async function (this: AccessService, principal, selection) {
            const actor = await resolve.call(this, principal, selection);
            if (actor.activeCompany)
              Object.defineProperty(actor.activeCompany, capture, {
                value: version,
                enumerable: true,
              });
            return actor;
          },
        );
        const read = await fixture.request(c.path, options);
        if (capture === 'projectNextActionCoordinatorPermissionSetVersion')
          expect(read.status).toBe(200);
        else await refused(read, 403);
        await refused(
          await fixture.request(c.path, { ...options, method: 'POST', body }),
          403,
        );
        expect(
          (
            await fixture.pool.query(
              'SELECT count(*)::int AS count FROM project_next_action_commands',
            )
          ).rows,
        ).toEqual([{ count: 0 }]);
      },
    );
  },
);
