import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseContext } from '../database/database-context.js';
import {
  ESTIMATE_OFFER_PREPARER,
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';
import type { ActorContext } from './access.types.js';
import { CompanyContextAuthorization } from './company-context-authorization.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const route = '/company-opportunity-follow-up-coordinator-assignments';
const label = 'Company Opportunity Follow-up Coordinator';

withPostgres(
  'Opportunity follow-up independent administration and live captures',
  () => {
    let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>;
    let authorization: CompanyContextAuthorization;
    let database: DatabaseContext;

    beforeAll(async () => {
      fixture = await openEstimateOfferFixture();
      database = new DatabaseContext(drizzle({ client: fixture.pool }));
      authorization = new CompanyContextAuthorization(database);
    }, 120_000);
    beforeEach(async () => fixture.reset());
    afterAll(async () => fixture?.close());

    async function setup() {
      const company = responseRecord(
        await fixture.command({
          path: '/companies',
          body: { displayName: 'Synthetic follow-up Company' },
        }),
      );
      const member = responseRecord(
        await fixture.read({
          path: '/access/current-actor',
          headers: ESTIMATE_OFFER_PREPARER,
        }),
      );
      return {
        companyId: responseString(company, 'id'),
        membershipId: responseString(member, 'workspaceMembershipId'),
      };
    }

    async function grant(
      path: string,
      source: Awaited<ReturnType<typeof setup>>,
    ) {
      return fixture.grant({
        path,
        companyId: source.companyId,
        membershipId: source.membershipId,
      });
    }

    async function revoke(
      path: string,
      source: Awaited<ReturnType<typeof setup>>,
    ) {
      const response = await fixture.request({
        path: `${path}/${source.membershipId}/${source.companyId}`,
        init: {
          method: 'DELETE',
          headers: { 'idempotency-key': randomUUID() },
        },
      });
      expect(response.status).toBe(200);
      return responseRecord(await response.json());
    }

    async function actorFor(
      companyId: string,
      owner = false,
    ): Promise<ActorContext> {
      const identity = responseRecord(
        await fixture.read({
          path: '/access/current-actor',
          ...(owner ? {} : { headers: ESTIMATE_OFFER_PREPARER }),
        }),
      );
      const actor: ActorContext = {
        internalUserId: responseString(identity, 'internalUserId'),
        workspaceMembershipId: responseString(
          identity,
          'workspaceMembershipId',
        ),
        workspaceId: responseString(identity, 'workspaceId'),
        workspaceName: responseString(identity, 'workspaceName'),
        displayName: responseString(identity, 'displayName'),
        email: responseString(identity, 'email'),
        active: true,
        workspacePermissions: owner
          ? ['company.manage', 'company.assignment.manage']
          : [],
      };
      if (owner)
        expect(identity.workspacePermissions).toEqual(
          expect.arrayContaining(actor.workspacePermissions),
        );
      const activeCompany = await authorization.resolveAuthorizedActiveCompany(
        actor,
        companyId,
      );
      if (!activeCompany)
        throw new Error('Expected explicitly authorized Company context.');
      return { ...actor, activeCompany };
    }

    it('is initially unassigned, requires independent context/native reads and never introduces a Client gate', async () => {
      const source = await setup();
      const before = await fixture.pool.query(
        "SELECT count(*)::int AS count FROM company_role_assignments WHERE bundle = 'company_opportunity_follow_up_coordinator'",
      );
      expect(before.rows).toEqual([{ count: 0 }]);
      const assignment = responseRecord(await grant(route, source));
      expect(assignment).toMatchObject({
        companyId: source.companyId,
        workspaceMembershipId: source.membershipId,
        bundle: label,
        permissionSetVersion: 'v1',
        active: true,
      });
      expect(
        (
          await fixture.request({
            path: '/access/current-actor',
            headers: ESTIMATE_OFFER_PREPARER,
            companyId: source.companyId,
          })
        ).status,
      ).toBe(403);
      await grant('/company-context-assignments', source);
      const incomplete = await actorFor(source.companyId);
      expect(incomplete.activeCompany?.opportunityFollowUpPermissions).toEqual([
        'commercial.opportunity.follow_up.read',
        'commercial.opportunity.follow_up.manage',
      ]);
      expect(
        incomplete.activeCompany?.opportunityFollowUpReadCapture,
      ).toBeUndefined();
      await expect(
        authorization.requireOpportunityFollowUpAccess(incomplete, {
          manage: false,
          lock: false,
        }),
      ).rejects.toMatchObject({ status: 403 });
      await grant('/company-commercial-intake-assignments', source);
      const actor = await actorFor(source.companyId);
      expect(actor.activeCompany?.clientPermissions).toEqual([]);
      const required = await database.transaction(() =>
        authorization.requireOpportunityFollowUpAccess(actor, {
          manage: true,
          lock: true,
        }),
      );
      expect(required).toEqual({
        companyId: source.companyId,
        assignmentId: assignment.id,
        permissionSetVersion: 'v1',
        readCapture: actor.activeCompany?.opportunityFollowUpReadCapture,
      });
      const wire = responseRecord(
        await fixture.read({
          path: '/access/current-actor',
          headers: ESTIMATE_OFFER_PREPARER,
          companyId: source.companyId,
        }),
      );
      expect(responseRecord(wire.activeCompany)).toMatchObject({
        opportunityFollowUpCoordinatorAssignmentId: assignment.id,
        opportunityFollowUpCoordinatorPermissionSetVersion: 'v1',
        opportunityFollowUpReadCapture: required.readCapture,
      });
    });

    it('conserves exact repeated grants and emits only two safe actual administration transitions', async () => {
      const source = await setup();
      const body = {
        workspaceMembershipId: source.membershipId,
        companyId: source.companyId,
      };
      const key = randomUUID();
      const first = await fixture.command({ path: route, body, key });
      expect(await fixture.command({ path: route, body, key })).toEqual(first);
      expect(await fixture.command({ path: route, body })).toEqual(first);
      const denied = await fixture.request({
        path: route,
        headers: ESTIMATE_OFFER_PREPARER,
        init: {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': randomUUID(),
          },
          body: JSON.stringify(body),
        },
      });
      expect(denied.status).toBe(403);
      const widened = await fixture.request({
        path: route,
        init: {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': randomUUID(),
          },
          body: JSON.stringify({ ...body, permissionSetVersion: 'v2' }),
        },
      });
      expect(widened.status).toBe(400);
      const revoked = await revoke(route, source);
      expect(await revoke(route, source)).toEqual(revoked);
      const events = await fixture.pool.query(
        "SELECT action,metadata FROM activity_log_events WHERE action::text LIKE 'company_opportunity_follow_up_coordinator_assignment.%' ORDER BY action",
      );
      expect(events.rows).toEqual([
        {
          action:
            'company_opportunity_follow_up_coordinator_assignment.granted',
          metadata: { bundle: label },
        },
        {
          action:
            'company_opportunity_follow_up_coordinator_assignment.revoked',
          metadata: { bundle: label },
        },
      ]);
    });

    it.each([
      '/company-context-assignments',
      '/company-commercial-intake-assignments',
      route,
    ])(
      'retires the exact consumed %s identity through equal-permission replacement',
      async (path) => {
        const source = await setup();
        for (const assignmentPath of [
          '/company-context-assignments',
          '/company-commercial-intake-assignments',
          route,
        ])
          await grant(assignmentPath, source);
        const captured = await actorFor(source.companyId);
        const original = await authorization.requireOpportunityFollowUpAccess(
          captured,
          { manage: true, lock: false },
        );
        expect(await grant(path, source)).toBeDefined();
        expect(
          await authorization.requireOpportunityFollowUpAccess(
            await actorFor(source.companyId),
            { manage: true, lock: false },
          ),
        ).toEqual(original);
        await revoke(path, source);
        await expect(
          authorization.requireOpportunityFollowUpAccess(captured, {
            manage: false,
            lock: false,
          }),
        ).rejects.toMatchObject({ status: 403 });
        await grant(path, source);
        await expect(
          authorization.requireOpportunityFollowUpAccess(captured, {
            manage: false,
            lock: false,
          }),
        ).rejects.toMatchObject({ status: 403 });
        const refreshed = await actorFor(source.companyId);
        expect(refreshed.activeCompany?.opportunityFollowUpPermissions).toEqual(
          captured.activeCompany?.opportunityFollowUpPermissions,
        );
        expect(
          refreshed.activeCompany?.opportunityFollowUpReadCapture,
        ).not.toBe(original.readCapture);
        await expect(
          authorization.requireOpportunityFollowUpAccess(refreshed, {
            manage: true,
            lock: false,
          }),
        ).resolves.toMatchObject({ companyId: source.companyId });
      },
    );

    it('binds Workspace manager context to its exact live grant and refuses another Company or membership', async () => {
      const source = await setup();
      const ownerIdentity = responseRecord(
        await fixture.read({ path: '/access/current-actor' }),
      );
      const ownerSource = {
        ...source,
        membershipId: responseString(ownerIdentity, 'workspaceMembershipId'),
      };
      for (const path of ['/company-commercial-intake-assignments', route])
        await grant(path, ownerSource);
      const captured = await actorFor(source.companyId, true);
      await expect(
        authorization.requireOpportunityFollowUpAccess(captured, {
          manage: true,
          lock: false,
        }),
      ).resolves.toMatchObject({ companyId: source.companyId });
      const company = captured.activeCompany;
      if (!company) throw new Error('Expected Company.');
      await expect(
        authorization.requireOpportunityFollowUpAccess(
          { ...captured, workspaceMembershipId: source.membershipId },
          { manage: false, lock: false },
        ),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        authorization.requireOpportunityFollowUpAccess(
          { ...captured, activeCompany: { ...company, id: randomUUID() } },
          { manage: false, lock: false },
        ),
      ).rejects.toMatchObject({ status: 403 });
      for (const changedIdentity of [
        { workspaceId: randomUUID() },
        { internalUserId: randomUUID() },
      ])
        await expect(
          authorization.requireOpportunityFollowUpAccess(
            { ...captured, ...changedIdentity },
            { manage: false, lock: false },
          ),
        ).rejects.toMatchObject({ status: 403 });
      const workspaceId = captured.workspaceId;
      await fixture.pool.query(
        "DELETE FROM workspace_permission_grants WHERE workspace_id = $1 AND workspace_membership_id = $2 AND permission = 'company.manage'",
        [workspaceId, captured.workspaceMembershipId],
      );
      await expect(
        authorization.requireOpportunityFollowUpAccess(captured, {
          manage: false,
          lock: false,
        }),
      ).rejects.toMatchObject({ status: 403 });
      await fixture.pool.query(
        "INSERT INTO workspace_permission_grants (workspace_id,workspace_membership_id,permission) VALUES ($1,$2,'company.manage')",
        [workspaceId, captured.workspaceMembershipId],
      );
      await expect(
        authorization.requireOpportunityFollowUpAccess(captured, {
          manage: false,
          lock: false,
        }),
      ).rejects.toMatchObject({ status: 403 });
      const current = await actorFor(source.companyId, true);
      expect(current.activeCompany?.opportunityFollowUpReadCapture).not.toBe(
        company.opportunityFollowUpReadCapture,
      );
      await expect(
        authorization.requireOpportunityFollowUpAccess(current, {
          manage: true,
          lock: false,
        }),
      ).resolves.toMatchObject({ companyId: source.companyId });
    });

    it.each(['membership', 'Internal User'])(
      'refuses a captured actor after its %s becomes inactive',
      async (target) => {
        const source = await setup();
        for (const path of [
          '/company-context-assignments',
          '/company-commercial-intake-assignments',
          route,
        ])
          await grant(path, source);
        const captured = await actorFor(source.companyId);
        if (target === 'membership')
          await fixture.pool.query(
            "UPDATE workspace_memberships SET status = 'inactive' WHERE id = $1",
            [captured.workspaceMembershipId],
          );
        else
          await fixture.pool.query(
            "UPDATE internal_users SET status = 'inactive' WHERE id = $1",
            [captured.internalUserId],
          );
        for (const manage of [false, true])
          await expect(
            authorization.requireOpportunityFollowUpAccess(captured, {
              manage,
              lock: false,
            }),
          ).rejects.toMatchObject({ status: 403 });
      },
    );
  },
);
