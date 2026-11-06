import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseContext } from '../database/database-context.js';
import {
  openEstimateOfferFixture,
  ESTIMATE_OFFER_PREPARER,
  ESTIMATE_OFFER_OWNER,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';
import { CompanyContextAuthorization } from './company-context-authorization.js';
import type { ActorContext, WorkspacePermission } from './access.types.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const bundles = [
  {
    route: 'working-evidence-case-reader',
    code: 'company_working_evidence_case_reader',
    label: 'Company Working Evidence Case Reader',
  },
  {
    route: 'working-evidence-case-recorder',
    code: 'company_working_evidence_case_recorder',
    label: 'Company Working Evidence Case Recorder',
  },
  {
    route: 'received-audit-source-access',
    code: 'company_received_audit_source_access',
    label: 'Company Received Audit Source Access',
  },
];
withPostgres(
  'Working Evidence explicit captures and independent native authority',
  () => {
    let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>;
    let authorization: CompanyContextAuthorization;
    beforeAll(async () => {
      fixture = await openEstimateOfferFixture();
      authorization = new CompanyContextAuthorization(
        new DatabaseContext(drizzle({ client: fixture.pool })),
      );
    }, 120_000);
    beforeEach(async () => fixture.reset());
    afterAll(async () => fixture?.close());

    it.each(bundles)(
      'starts $label unassigned, grants only explicit v1 and records actual transitions once',
      async ({ route, code, label }) => {
        const source = await fixture.prepare();
        const before = await fixture.pool.query(
          "SELECT count(*)::int AS count FROM company_role_assignments WHERE bundle::text IN ('company_working_evidence_case_reader','company_working_evidence_case_recorder','company_received_audit_source_access')",
        );
        expect(before.rows).toEqual([{ count: 0 }]);
        const body = {
          workspaceMembershipId: source.preparerMembershipId,
          companyId: source.companyId,
        };
        const path = `/company-${route}-assignments`;
        const key = randomUUID();
        const granted = responseRecord(
          await fixture.command({ path, body, key }),
        );
        expect(granted).toMatchObject({
          ...body,
          bundle: label,
          permissionSetVersion: 'v1',
          active: true,
        });
        expect(await fixture.command({ path, body, key })).toEqual(granted);
        expect(await fixture.command({ path, body })).toEqual(granted);
        const denied = await fixture.request({
          path,
          headers: ESTIMATE_OFFER_PREPARER,
          companyId: source.companyId,
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
        const unknownCapture = await fixture.request({
          path,
          init: {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'idempotency-key': randomUUID(),
            },
            body: JSON.stringify({ ...body, permissionSetVersion: 'v99' }),
          },
        });
        expect(unknownCapture.status).toBe(400);
        const revoked = await fixture.request({
          path: `${path}/${source.preparerMembershipId}/${source.companyId}`,
          init: {
            method: 'DELETE',
            headers: { 'idempotency-key': randomUUID() },
          },
        });
        expect(revoked.status).toBe(200);
        const again = await fixture.request({
          path: `${path}/${source.preparerMembershipId}/${source.companyId}`,
          init: {
            method: 'DELETE',
            headers: { 'idempotency-key': randomUUID() },
          },
        });
        expect(again.status).toBe(200);
        const events = await fixture.pool.query(
          'SELECT action,metadata FROM activity_log_events WHERE action::text LIKE $1 ORDER BY action',
          [`${code}_assignment.%`],
        );
        expect(events.rows).toEqual([
          { action: `${code}_assignment.granted`, metadata: { bundle: label } },
          { action: `${code}_assignment.revoked`, metadata: { bundle: label } },
        ]);
      },
    );

    it('consumes Reader for reads and Recorder for writes, preserving an independent read when Recorder changes', async () => {
      const source = await fixture.prepare();
      for (const route of [
        'project',
        'working-evidence-case-reader',
        'working-evidence-case-recorder',
      ])
        await grant(source, route);
      const actor = await actorFor(source.companyId);
      const original = await authorization.requireWorkingEvidenceCaseAccess(
        actor,
        { record: false, lockAssignment: false },
      );
      await authorization.requireWorkingEvidenceCaseAccess(actor, {
        record: true,
        lockAssignment: false,
      });
      await revoke(source, 'working-evidence-case-recorder');
      expect(
        await authorization.requireWorkingEvidenceCaseAccess(actor, {
          record: false,
          lockAssignment: false,
        }),
      ).toEqual(original);
      await expect(
        authorization.requireWorkingEvidenceCaseAccess(actor, {
          record: true,
          lockAssignment: false,
        }),
      ).rejects.toThrow();
      await grant(source, 'working-evidence-case-recorder');
      expect(
        await authorization.requireWorkingEvidenceCaseAccess(actor, {
          record: false,
          lockAssignment: false,
        }),
      ).toEqual(original);
      await expect(
        authorization.requireWorkingEvidenceCaseAccess(actor, {
          record: true,
          lockAssignment: false,
        }),
      ).rejects.toThrow();
      await authorization.requireWorkingEvidenceCaseAccess(
        await actorFor(source.companyId),
        { record: true, lockAssignment: false },
      );
      await revoke(source, 'working-evidence-case-reader');
      await expect(
        authorization.requireWorkingEvidenceCaseAccess(actor, {
          record: false,
          lockAssignment: false,
        }),
      ).rejects.toThrow();
      const recorderReader = await actorFor(source.companyId);
      const selectedRecorder =
        await authorization.requireWorkingEvidenceCaseAccess(recorderReader, {
          record: false,
          lockAssignment: false,
        });
      await grant(source, 'working-evidence-case-reader');
      await authorization.requireWorkingEvidenceCaseAccess(recorderReader, {
        record: false,
        lockAssignment: false,
      });
      const refreshed = await actorFor(source.companyId);
      expect(
        await authorization.requireWorkingEvidenceCaseAccess(refreshed, {
          record: false,
          lockAssignment: false,
          readCapture: selectedRecorder.readCapture,
        }),
      ).toEqual(selectedRecorder);
      await expect(
        authorization.requireWorkingEvidenceCaseAccess(refreshed, {
          record: false,
          lockAssignment: false,
          readCapture: '0'.repeat(64),
        }),
      ).rejects.toThrow();
      await revoke(source, 'working-evidence-case-recorder');
      await expect(
        authorization.requireWorkingEvidenceCaseAccess(
          await actorFor(source.companyId),
          {
            record: false,
            lockAssignment: false,
            readCapture: selectedRecorder.readCapture,
          },
        ),
      ).rejects.toThrow();
      await grant(source, 'working-evidence-case-recorder');
      await expect(
        authorization.requireWorkingEvidenceCaseAccess(
          await actorFor(source.companyId),
          {
            record: false,
            lockAssignment: false,
            readCapture: selectedRecorder.readCapture,
          },
        ),
      ).rejects.toThrow();
      expect(
        (
          await authorization.requireWorkingEvidenceCaseAccess(
            await actorFor(source.companyId),
            { record: false, lockAssignment: false },
          )
        ).readCapture,
      ).not.toBe(original.readCapture);
    });

    it('keeps native metadata, designation and successor separate from Case and content authority', async () => {
      const source = await fixture.prepare();
      for (const route of [
        'document-registrar',
        'received-audit-source-access',
      ])
        await grant(source, route);
      let actor = await actorFor(source.companyId);
      expect(await authorization.hasReceivedAuditSourceAccess(actor)).toBe(
        true,
      );
      for (const action of [
        'read',
        'register',
        'reference',
        'correct',
        'version',
      ] satisfies Array<
        'read' | 'register' | 'reference' | 'correct' | 'version'
      >)
        expect(
          await authorization.requireReceivedAuditSourceNativeAccess(actor, {
            action,
            lockAssignment: false,
          }),
        ).toBe(source.companyId);
      await expect(
        authorization.requireWorkingEvidenceCaseAccess(actor, {
          record: false,
          lockAssignment: false,
        }),
      ).rejects.toThrow();
      await expect(
        authorization.requireReceivedAuditSourceNativeAccess(actor, {
          action: 'content-read',
          lockAssignment: false,
        }),
      ).rejects.toThrow();
      await grant(source, 'document-approver');
      actor = await actorFor(source.companyId);
      expect(
        await authorization.requireReceivedAuditSourceNativeAccess(actor, {
          action: 'designate',
          lockAssignment: false,
        }),
      ).toBe(source.companyId);
      await expect(
        authorization.requireReceivedAuditSourceNativeAccess(actor, {
          action: 'upload',
          lockAssignment: false,
        }),
      ).rejects.toThrow();
      for (const route of [
        'document-content-reader',
        'document-content-uploader',
      ])
        await grant(source, route);
      actor = await actorFor(source.companyId);
      expect(
        await authorization.requireReceivedAuditSourceNativeAccess(actor, {
          action: 'upload',
          lockAssignment: false,
        }),
      ).toBe(source.companyId);
      await revoke(source, 'received-audit-source-access');
      expect(await authorization.hasReceivedAuditSourceAccess(actor)).toBe(
        false,
      );
      await grant(source, 'received-audit-source-access');
      expect(await authorization.hasReceivedAuditSourceAccess(actor)).toBe(
        false,
      );
      expect(
        await authorization.hasReceivedAuditSourceAccess(
          await actorFor(source.companyId),
        ),
      ).toBe(true);
    });

    it('preserves native Workspace Client management without inventing a Company Client capture', async () => {
      const source = await fixture.prepare();
      const owner = responseRecord(
        await fixture.read({
          path: '/access/current-actor',
          headers: ESTIMATE_OFFER_OWNER,
        }),
      );
      const membershipId = responseString(owner, 'workspaceMembershipId');
      for (const path of [
        '/company-document-registrar-assignments',
        '/company-received-audit-source-access-assignments',
      ])
        await fixture.grant({
          path,
          companyId: source.companyId,
          membershipId,
        });
      const actor = await actorFor(source.companyId, ESTIMATE_OFFER_OWNER);
      expect(actor.workspacePermissions).toContain('client.manage');
      expect(actor.activeCompany?.clientPermissionAssignmentId).toBeUndefined();
      expect(actor.activeCompany?.workingEvidenceClientReadCapture).toMatch(
        /^working-evidence-client-read\.v1\.[a-f0-9]{64}$/u,
      );
      expect(
        await authorization.requireReceivedAuditSourceNativeAccess(actor, {
          action: 'register',
          lockAssignment: false,
        }),
      ).toBe(source.companyId);
    });

    it('retires exact Client and Company context replacements while unrelated roles preserve valid Case authority', async () => {
      const source = await fixture.prepare();
      for (const route of ['project', 'working-evidence-case-reader'])
        await grant(source, route);
      const actor = await actorFor(source.companyId);
      const before = await authorization.requireWorkingEvidenceCaseAccess(
        actor,
        { record: false, lockAssignment: false },
      );
      await grant(source, 'document-content-uploader');
      expect(
        await authorization.requireWorkingEvidenceCaseAccess(actor, {
          record: false,
          lockAssignment: false,
        }),
      ).toEqual(before);
      await revoke(source, 'director-client');
      await grant(source, 'director-client');
      await expect(
        authorization.requireWorkingEvidenceCaseAccess(actor, {
          record: false,
          lockAssignment: false,
        }),
      ).rejects.toThrow();
      const refreshed = await actorFor(source.companyId);
      await authorization.requireWorkingEvidenceCaseAccess(refreshed, {
        record: false,
        lockAssignment: false,
      });
      await revoke(source, 'context');
      await grant(source, 'context');
      await expect(
        authorization.requireWorkingEvidenceCaseAccess(refreshed, {
          record: false,
          lockAssignment: false,
        }),
      ).rejects.toThrow();
      await authorization.requireWorkingEvidenceCaseAccess(
        await actorFor(source.companyId),
        { record: false, lockAssignment: false },
      );
    });

    async function grant(
      source: { companyId: string; preparerMembershipId: string },
      route: string,
    ) {
      await fixture.grant({
        path:
          route === 'context'
            ? '/company-context-assignments'
            : `/company-${route}-assignments`,
        companyId: source.companyId,
        membershipId: source.preparerMembershipId,
      });
    }
    async function revoke(
      source: { companyId: string; preparerMembershipId: string },
      route: string,
    ) {
      const path =
        route === 'context'
          ? '/company-context-assignments'
          : `/company-${route}-assignments`;
      const result = await fixture.request({
        path: `${path}/${source.preparerMembershipId}/${source.companyId}`,
        init: {
          method: 'DELETE',
          headers: { 'idempotency-key': randomUUID() },
        },
      });
      expect(result.status).toBe(200);
    }
    async function actorFor(
      companyId: string,
      headers: Readonly<Record<string, string>> = ESTIMATE_OFFER_PREPARER,
    ): Promise<ActorContext> {
      const identity = responseRecord(
        await fixture.read({
          path: '/access/current-actor',
          headers,
        }),
      );
      if (!Array.isArray(identity.workspacePermissions))
        throw new Error('Expected Workspace permissions');
      const workspacePermissions: WorkspacePermission[] = [];
      const suppliedPermissions: unknown[] = identity.workspacePermissions;
      for (const permission of suppliedPermissions) {
        if (
          permission !== 'company.manage' &&
          permission !== 'company.assignment.manage' &&
          permission !== 'client.manage' &&
          permission !== 'member.invite'
        )
          throw new Error('Unknown Workspace permission');
        workspacePermissions.push(permission);
      }
      const actor: ActorContext = {
        workspaceId: responseString(identity, 'workspaceId'),
        workspaceMembershipId: responseString(
          identity,
          'workspaceMembershipId',
        ),
        internalUserId: responseString(identity, 'internalUserId'),
        workspaceName: responseString(identity, 'workspaceName'),
        displayName: responseString(identity, 'displayName'),
        email: responseString(identity, 'email'),
        active: true,
        workspacePermissions,
      };
      const activeCompany = await authorization.resolveAuthorizedActiveCompany(
        actor,
        companyId,
      );
      if (!activeCompany) throw new Error('Expected fixture Company');
      return { ...actor, activeCompany };
    }
  },
);
