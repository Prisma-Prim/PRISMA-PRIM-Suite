import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CompanyContextAuthorization } from './company-context-authorization.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  openEstimateOfferFixture,
  ESTIMATE_OFFER_PREPARER,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const bundles = [
  {
    route: 'invoice-reader',
    bundle: 'company_invoice_reader',
    label: 'Company Invoice Reader',
  },
  {
    route: 'invoice-recorder',
    bundle: 'company_invoice_recorder',
    label: 'Company Invoice Recorder',
  },
  {
    route: 'external-invoice-access',
    bundle: 'company_external_invoice_access',
    label: 'Company External Invoice Access',
  },
];
withPostgres(
  'External invoice explicit assignment administration and live captured identities',
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
      '$label grants only explicit v1, conserves replay/no-op and records two minimal transitions',
      async (bundle) => {
        const source = await fixture.prepare();
        const body = {
          workspaceMembershipId: source.preparerMembershipId,
          companyId: source.companyId,
        };
        const path = `/company-${bundle.route}-assignments`;
        const before = await fixture.pool.query(
          "SELECT count(*)::int AS count FROM company_role_assignments WHERE bundle IN ('company_invoice_reader','company_invoice_recorder','company_external_invoice_access')",
        );
        expect(before.rows[0]).toEqual({ count: 0 });
        const key = randomUUID();
        const assignment = responseRecord(
          await fixture.command({ path, body, key }),
        );
        expect(assignment).toMatchObject({
          ...body,
          bundle: bundle.label,
          permissionSetVersion: 'v1',
          active: true,
        });
        expect(await fixture.command({ path, body, key })).toEqual(assignment);
        expect(await fixture.command({ path, body })).toEqual(assignment);
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
        const unknown = await fixture.request({
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
        expect(unknown.status).toBe(400);
        const current = responseRecord(
          await fixture.read({
            path: '/access/current-actor',
            headers: ESTIMATE_OFFER_PREPARER,
            companyId: source.companyId,
          }),
        );
        expect(
          responseRecord(current.activeCompany).externalInvoiceGrants,
        ).toEqual([
          {
            bundle: bundle.bundle,
            assignmentId: assignment.id,
            permissionSetVersion: 'v1',
          },
        ]);
        const revoke = await fixture.request({
          path: `${path}/${source.preparerMembershipId}/${source.companyId}`,
          init: {
            method: 'DELETE',
            headers: { 'idempotency-key': randomUUID() },
          },
        });
        expect(revoke.status).toBe(200);
        const refreshed = responseRecord(
          await fixture.read({
            path: '/access/current-actor',
            headers: ESTIMATE_OFFER_PREPARER,
            companyId: source.companyId,
          }),
        );
        expect(
          responseRecord(refreshed.activeCompany).externalInvoiceGrants,
        ).toBeUndefined();
        const events = await fixture.pool.query(
          'SELECT action,metadata FROM activity_log_events WHERE action::text LIKE $1 ORDER BY action',
          [`${bundle.bundle}_assignment.%`],
        );
        expect(events.rows).toEqual([
          {
            action: `${bundle.bundle}_assignment.granted`,
            metadata: { bundle: bundle.label },
          },
          {
            action: `${bundle.bundle}_assignment.revoked`,
            metadata: { bundle: bundle.label },
          },
        ]);
      },
    );
    it('keeps read alternatives independent and refuses retired family/recorder identities after equal-permission regrant', async () => {
      const source = await fixture.prepare();
      for (const bundle of bundles)
        await fixture.grant({
          path: `/company-${bundle.route}-assignments`,
          companyId: source.companyId,
          membershipId: source.preparerMembershipId,
        });
      const actor = await actorFor(source.companyId);
      expect(
        await authorization.hasExternalInvoiceAccess(actor, {
          manage: true,
          lockAssignment: false,
        }),
      ).toBe(true);
      for (const route of ['invoice-recorder', 'external-invoice-access']) {
        await fixture.request({
          path: `/company-${route}-assignments/${source.preparerMembershipId}/${source.companyId}`,
          init: {
            method: 'DELETE',
            headers: { 'idempotency-key': randomUUID() },
          },
        });
        expect(
          await authorization.hasExternalInvoiceAccess(actor, {
            manage: true,
            lockAssignment: false,
          }),
        ).toBe(false);
        if (route === 'invoice-recorder')
          expect(
            await authorization.hasExternalInvoiceAccess(actor, {
              manage: false,
              lockAssignment: false,
            }),
          ).toBe(true);
        await fixture.grant({
          path: `/company-${route}-assignments`,
          companyId: source.companyId,
          membershipId: source.preparerMembershipId,
        });
        expect(
          await authorization.hasExternalInvoiceAccess(actor, {
            manage: true,
            lockAssignment: false,
          }),
        ).toBe(false);
        expect(
          await authorization.hasExternalInvoiceAccess(
            await actorFor(source.companyId),
            { manage: true, lockAssignment: false },
          ),
        ).toBe(true);
      }
    });
    it.each([
      {
        route: 'document-registrar',
        actions: [
          'read',
          'register',
          'correct',
          'version',
          'designate',
          'content-read',
          'upload',
        ],
      },
      { route: 'director-client', actions: ['read'] },
      { route: 'document-content-reader', actions: ['content-read', 'upload'] },
      { route: 'document-content-uploader', actions: ['upload'] },
      { route: 'document-approver', actions: ['designate'] },
    ] satisfies Array<{
      route: string;
      actions: Array<
        | 'read'
        | 'register'
        | 'correct'
        | 'version'
        | 'designate'
        | 'content-read'
        | 'upload'
      >;
    }>)(
      'fences the exact native $route capture through revoke and equal-permission replacement',
      async ({ route, actions }) => {
        const source = await fixture.prepare();
        for (const native of [
          'document-registrar',
          'document-approver',
          'document-content-reader',
          'document-content-uploader',
        ])
          await fixture.grant({
            path: `/company-${native}-assignments`,
            companyId: source.companyId,
            membershipId: source.preparerMembershipId,
          });
        const captured = await actorFor(source.companyId);
        for (const action of actions)
          expect(
            await authorization.requireExternalInvoiceNativeAccess(captured, {
              action,
              lockAssignment: false,
            }),
          ).toBe(source.companyId);
        const path = `/company-${route}-assignments`;
        expect(
          (
            await fixture.request({
              path: `${path}/${source.preparerMembershipId}/${source.companyId}`,
              init: {
                method: 'DELETE',
                headers: { 'idempotency-key': randomUUID() },
              },
            })
          ).status,
        ).toBe(200);
        for (const action of actions)
          await expect(
            authorization.requireExternalInvoiceNativeAccess(captured, {
              action,
              lockAssignment: false,
            }),
          ).rejects.toMatchObject({ status: 403 });
        await fixture.grant({
          path,
          companyId: source.companyId,
          membershipId: source.preparerMembershipId,
        });
        for (const action of actions)
          await expect(
            authorization.requireExternalInvoiceNativeAccess(captured, {
              action,
              lockAssignment: false,
            }),
          ).rejects.toMatchObject({ status: 403 });
        const current = await actorFor(source.companyId);
        for (const action of actions)
          expect(
            await authorization.requireExternalInvoiceNativeAccess(current, {
              action,
              lockAssignment: false,
            }),
          ).toBe(source.companyId);
      },
    );

    async function actorFor(companyId: string) {
      const identity = responseRecord(
        await fixture.read({
          path: '/access/current-actor',
          headers: ESTIMATE_OFFER_PREPARER,
        }),
      );
      const actor = {
        workspaceId: responseString(identity, 'workspaceId'),
        workspaceMembershipId: responseString(
          identity,
          'workspaceMembershipId',
        ),
        internalUserId: responseString(identity, 'internalUserId'),
        workspaceName: responseString(identity, 'workspaceName'),
        displayName: responseString(identity, 'displayName'),
        email: responseString(identity, 'email'),
        active: true as const,
        workspacePermissions: [],
      };
      const activeCompany = await authorization.resolveAuthorizedActiveCompany(
        actor,
        companyId,
      );
      if (!activeCompany) throw new Error('Expected fixture Company.');
      return { ...actor, activeCompany };
    }
  },
);
