import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  openFollowUpFixture,
  json,
  object,
  text,
} from './opportunity-follow-up.test-support.js';
const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)(
  'manual follow-up native lifecycle and literal conservation',
  () => {
    let f: Awaited<ReturnType<typeof openFollowUpFixture>>;
    beforeAll(async () => {
      if (!databaseUrl) throw new Error('PostgreSQL is required.');
      f = await openFollowUpFixture(databaseUrl);
    }, 120000);
    beforeEach(async () => {
      await f.setup();
    });
    afterAll(async () => {
      await f?.close();
    });
    it('invalidates every native outcome epoch and requires explicit same-date reconfirmation', async () => {
      const c = await f.createCase(),
        body = {
          expectedRevision: 0,
          observedOpportunityVersion: 1,
          followUpOn: '2026-11-15',
          reason: null,
        };
      const first = await json(
        await f.request(c.path, { method: 'POST', body, key: 'past-plan' }),
      );
      let revision = 1;
      const transitions = [
        { status: 'ON_HOLD', reason: 'Pause' },
        { status: 'OPEN' },
        { status: 'WON' },
        { status: 'OPEN', reason: 'Reopen won' },
        { status: 'LOST', lossReasonCode: 'UNKNOWN' },
        { status: 'OPEN', reason: 'Reopen lost' },
        { status: 'DISQUALIFIED', reason: 'Qualification changed' },
        { status: 'OPEN', reason: 'Reopen qualification' },
        { status: 'ARCHIVED', reason: 'Archive duplicate' },
        { status: 'OPEN', reason: 'Reopen archive' },
      ];
      for (const transition of transitions) {
        const before = await json(await f.request(c.path));
        const outcome = await f.request(
          '/commercial-intake/opportunities/' + c.opportunityId + '/outcome',
          {
            method: 'POST',
            body: { expectedVersion: before.opportunityVersion, ...transition },
          },
        );
        expect(outcome.status).toBe(200);
        const current = await json(await f.request(c.path));
        expect(object(current.head).revision).toBe(revision);
        expect(current.status).toBe(transition.status);
        expect(object(current.head).confirmedEpoch).not.toBe(
          current.outcomeEpoch,
        );
        const discovery = await f.request(
          '/commercial-intake/opportunity-follow-ups?through=2026-11-15',
        );
        expect(discovery.status).toBe(200);
        expect((await json(discovery)).items).toEqual([]);
        const intent = {
          expectedRevision: revision,
          observedOpportunityVersion: current.opportunityVersion,
          followUpOn: '2026-11-15',
          reason: 'Deliberately resume this manual plan',
        };
        const response = await f.request(c.path, {
          method: 'POST',
          body: intent,
        });
        if (transition.status === 'OPEN') {
          expect(response.status).toBe(200);
          const confirmation = await json(response);
          revision++;
          expect(object(confirmation.fact).revision).toBe(revision);
          expect(object(confirmation.fact).confirmedEpoch).toBe(
            current.outcomeEpoch,
          );
          expect(
            (
              await json(
                await f.request(
                  '/commercial-intake/opportunity-follow-ups?through=2026-11-15',
                ),
              )
            ).items,
          ).toHaveLength(1);
        } else {
          expect(response.status).toBe(409);
        }
        expect(
          await json(
            await f.request(c.path, { method: 'POST', body, key: 'past-plan' }),
          ),
        ).toEqual(first);
      }
    }, 60000);
    it('keeps text/responsibility/stage native versions independent and checks fresh versions before no-op', async () => {
      const c = await f.createCase();
      const original = await json(
        await f.request(c.path, {
          method: 'POST',
          body: {
            expectedRevision: 0,
            observedOpportunityVersion: 1,
            followUpOn: '2026-11-15',
            reason: null,
          },
          key: 'original',
        }),
      );
      const changed = await f.request(
        '/commercial-intake/opportunities/' + c.opportunityId + '/next-action',
        {
          method: 'POST',
          body: { expectedVersion: 1, nextAction: 'Updated native text' },
        },
      );
      expect(changed.status).toBe(200);
      const current = await json(await f.request(c.path));
      expect(current.head).toEqual(original.fact);
      expect(current.opportunityVersion).toBe(2);
      expect(object(current.head).confirmedEpoch).toBe(current.outcomeEpoch);
      const stale = await f.request(c.path, {
        method: 'POST',
        body: {
          expectedRevision: 1,
          observedOpportunityVersion: 1,
          followUpOn: '2026-11-15',
          reason: null,
        },
      });
      expect(stale.status).toBe(409);
      expect((await json(stale)).code).toBe('STALE_VERSION');
      const noop = await json(
        await f.request(c.path, {
          method: 'POST',
          body: {
            expectedRevision: 1,
            observedOpportunityVersion: 2,
            followUpOn: '2026-11-15',
            reason: 'Reason alone does not change a fact',
          },
        }),
      );
      expect(noop.outcome).toBe('unchanged');
      expect(noop.fact).toEqual(original.fact);
      const native = await json(
        await f.request('/commercial-intake/requests/' + c.requestId),
      );
      expect(object(native.initialOpportunity).version).toBe(2);
      expect(object(native.initialOpportunity).nextAction).toBe(
        'Updated native text',
      );
      const changedKey = await f.request(c.path, {
        method: 'POST',
        key: 'original',
        body: {
          expectedRevision: 0,
          observedOpportunityVersion: 1,
          followUpOn: '2026-11-16',
          reason: null,
        },
      });
      expect(changedKey.status).toBe(409);
      expect((await json(changedKey)).code).toBe('IDEMPOTENCY_CONFLICT');
    });
    it('preserves exact boundary calendars and UTF-16 reasons while refusing invalid literal declarations', async () => {
      const c = await f.createCase();
      for (const followUpOn of [
        '0000-01-01',
        '1900-02-29',
        '2026-02-30',
        '2026-01-01T00:00:00Z',
        ' 2026-01-01',
        '2026-1-01',
      ])
        expect(
          (
            await f.request(c.path, {
              method: 'POST',
              body: {
                expectedRevision: 0,
                observedOpportunityVersion: 1,
                followUpOn,
                reason: null,
              },
            })
          ).status,
        ).toBe(400);
      for (const reason of ['', ' \u00a0', '\ud800', '\0', '😀'.repeat(251)])
        expect(
          (
            await f.request(c.path, {
              method: 'POST',
              body: {
                expectedRevision: 0,
                observedOpportunityVersion: 1,
                followUpOn: null,
                reason,
              },
            })
          ).status,
        ).toBe(400);
      const first = await f.request(c.path, {
        method: 'POST',
        body: {
          expectedRevision: 0,
          observedOpportunityVersion: 1,
          followUpOn: '0001-01-01',
          reason: null,
        },
      });
      expect(first.status).toBe(200);
      const reason = '  Ж é ' + '😀'.repeat(246) + '  ';
      const correction = await f.request(c.path, {
        method: 'POST',
        body: {
          expectedRevision: 1,
          observedOpportunityVersion: 1,
          followUpOn: '9999-12-31',
          reason,
        },
      });
      expect(correction.status).toBe(200);
      const head = await json(await f.request(c.path));
      expect(object(head.head).followUpOn).toBe('9999-12-31');
      const entries = object(head.history).entries;
      if (!Array.isArray(entries)) throw new Error();
      expect(object(entries[0]).reason).toBe(reason);
      expect(
        (
          await f.request(c.path, {
            method: 'POST',
            body: {
              expectedRevision: 2,
              observedOpportunityVersion: 1,
              followUpOn: null,
              reason: null,
            },
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await f.request(c.path, {
            method: 'POST',
            body: {
              expectedRevision: 2,
              observedOpportunityVersion: 1,
              followUpOn: null,
              reason: 'No date agreed',
            },
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await json(
            await f.request(
              '/commercial-intake/opportunity-follow-ups?through=9999-12-31',
            ),
          )
        ).items,
      ).toEqual([]);
    });
    it('revalidates all independent live authority before historical replay and hides existing foreign targets', async () => {
      const c = await f.createCase(),
        actor = await json(await f.request('/access/current-actor')),
        company = object(actor.activeCompany),
        membershipId = text(actor.workspaceMembershipId),
        companyId = text(company.id);
      const body = {
        expectedRevision: 0,
        observedOpportunityVersion: 1,
        followUpOn: '2026-11-15',
        reason: null,
      };
      const receipt = await json(
        await f.request(c.path, { method: 'POST', body, key: 'live-replay' }),
      );
      const otherCompanyId = text(
        (
          await f.created('/companies', {
            displayName: 'Other fictional Company',
          })
        ).id,
      );
      for (const bundle of [
        'context',
        'commercial-intake',
        'opportunity-follow-up-coordinator',
      ])
        await f.created('/company-' + bundle + '-assignments', {
          companyId: otherCompanyId,
          workspaceMembershipId: membershipId,
        });
      expect(
        (await f.request(c.path, { companyId: otherCompanyId })).status,
      ).toBe(404);
      expect((await f.request(c.path, { anonymous: true })).status).toBe(401);
      expect((await f.request(c.path)).status).toBe(200);
      const revoke = await f.request(
        '/company-opportunity-follow-up-coordinator-assignments/' +
          membershipId +
          '/' +
          companyId,
        { method: 'DELETE', subject: 'owner' },
      );
      expect(revoke.status).toBe(200);
      expect(
        (await f.request(c.path, { method: 'POST', body, key: 'live-replay' }))
          .status,
      ).toBe(403);
      expect((await f.request(c.path)).status).toBe(403);
      await f.grant('opportunity-follow-up-coordinator');
      expect(
        await json(
          await f.request(c.path, { method: 'POST', body, key: 'live-replay' }),
        ),
      ).toEqual(receipt);
    });
    it('excludes the private family before generic limits even with every Company bundle and Knowledge grants', async () => {
      const c = await f.createCase();
      const actor = await json(await f.request('/access/current-actor'));
      const membershipId = text(actor.workspaceMembershipId);
      const companyId = text(object(actor.activeCompany).id);
      // Public administration supplies every current opt-in bundle; no SQL grants.
      for (const path of [
        'company-commercial-activity-reader-assignments',
        'company-commercial-intake-assignments',
        'company-context-assignments',
        'company-contract-approver-assignments',
        'company-contract-early-preparation-assignments',
        'company-contract-model-approver-assignments',
        'company-contract-model-editor-assignments',
        'company-contract-preparer-assignments',
        'company-contract-signature-declarer-assignments',
        'company-director-client-assignments',
        'company-document-approver-assignments',
        'company-document-content-reader-assignments',
        'company-document-content-uploader-assignments',
        'company-document-project-organizer-assignments',
        'company-document-registrar-assignments',
        'company-external-invoice-access-assignments',
        'company-ideas-reader-assignments',
        'company-ideas-recorder-assignments',
        'company-ideas-reviewer-assignments',
        'company-internal-task-manager-assignments',
        'company-invoice-reader-assignments',
        'company-invoice-recorder-assignments',
        'company-mission-applicability-approver-assignments',
        'company-mission-applicability-coordinator-assignments',
        'company-mission-deliverable-access-assignments',
        'company-mission-plan-configuration-assignments',
        'company-mission-plan-user-assignments',
        'company-mission-result-reviewer-assignments',
        'company-offer-approver-assignments',
        'company-offer-model-approver-assignments',
        'company-offer-model-editor-assignments',
        'company-offer-preparer-assignments',
        'company-operational-risk-reader-assignments',
        'company-operational-risk-recorder-assignments',
        'company-opportunity-follow-up-coordinator-assignments',
        'company-opportunity-manager-assignments',
        'company-pricing-adjustment-assignments',
        'company-pricing-configuration-assignments',
        'company-pricing-user-assignments',
        'company-profitability-contributor-assignments',
        'company-profitability-director-assignments',
        'company-project-approver-assignments',
        'company-project-assignments',
        'company-project-next-action-coordinator-assignments',
        'company-project-stage-advancer-assignments',
        'company-project-template-configuration-assignments',
        'company-project-template-user-assignments',
        'company-received-contract-access-assignments',
        'company-sales-stage-configuration-assignments',
        'company-service-catalogue-assignments',
        'company-task-manager-assignments',
        'company-task-result-recorder-assignments',
      ])
        await f.created('/' + path, {
          companyId,
          workspaceMembershipId: membershipId,
        });
      for (const role of ['administrators', 'readers'])
        await f.created('/knowledge/assignments/' + role, {
          companyId,
          workspaceMembershipId: membershipId,
        });
      // Populate the ordinary visible Activity window through real native intake.
      for (let index = 0; index < 61; index++)
        await f.createCase('Ordinary fictional visible case ' + index);
      const paths = [
        '/activity-log',
        '/operational-home',
        '/knowledge/sources',
        '/knowledge/evidence/sources',
        '/knowledge/search?query=Private',
        '/knowledge/evidence/search?query=Private',
      ];
      const before = new Map<string, unknown>();
      for (const path of paths) {
        const response = await f.request(path);
        expect(response.status, path).toBe(200);
        before.set(path, await response.json());
      }
      expect(object(before.get('/activity-log')).events).toHaveLength(50);
      const secret = 'Private literal correction content';
      for (let revision = 0; revision < 61; revision++) {
        const response = await f.request(c.path, {
          method: 'POST',
          body: {
            expectedRevision: revision,
            observedOpportunityVersion: 1,
            followUpOn: revision % 2 ? '9999-12-29' : '9999-12-30',
            reason: secret,
          },
        });
        expect(response.status).toBe(200);
      }
      const result = await f.pool.query(
        'SELECT action,metadata FROM opportunity_follow_up_events ORDER BY revision',
      );
      expect(result.rows).toEqual(
        Array.from({ length: 61 }, (_, index) => ({
          action: 'opportunity.follow_up.updated',
          metadata: { revision: index + 1 },
        })),
      );
      for (const path of paths) {
        const response = await f.request(path);
        expect(response.status, path).toBe(200);
        const value: unknown = await response.json();
        expect(value, path).toEqual(before.get(path));
        const content = JSON.stringify(value);
        expect(content).not.toContain('opportunity.follow_up.updated');
        expect(content).not.toContain(secret);
        expect(content).not.toContain('9999-12-30');
      }
    }, 60000);
  },
);
