import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  openFollowUpFixture,
  json,
  object,
} from './opportunity-follow-up.test-support.js';
const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)(
  'independent manual Opportunity follow-up through native HTTP/PostgreSQL',
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
    it('conserves a separate literal date, immutable receipt and native text/version through restart', async () => {
      const c = await f.createCase();
      const control = await f.request(
        '/commercial-intake/opportunities/' + c.opportunityId + '/next-action',
        {
          method: 'POST',
          body: {
            expectedVersion: 1,
            nextAction: '  Literal text control Ж  ',
          },
        },
      );
      expect(control.status).toBe(200);
      const controlValue = await json(control);
      expect(object(controlValue.receipt).version).toBe(2);
      const initial = await json(await f.request(c.path));
      expect(initial.head).toEqual({ state: 'UNRECORDED', revision: 0 });
      const body = {
        expectedRevision: 0,
        observedOpportunityVersion: 2,
        followUpOn: '2026-11-15',
        reason: null,
      };
      const response = await f.request(c.path, {
        method: 'POST',
        body,
        key: 'literal-date',
      });
      expect(response.status).toBe(200);
      const receipt = await json(response);
      expect(receipt.outcome).toBe('updated');
      expect(object(receipt.fact)).toMatchObject({
        state: 'RECORDED',
        revision: 1,
        followUpOn: '2026-11-15',
      });
      expect(object(receipt.fact).recordedBy).toMatchObject({
        displayLabel: expect.stringContaining('DEMO writer'),
      });
      for (let restart = 0; restart < 2; restart++) {
        await f.restart();
        const current = await json(await f.request(c.path));
        expect(current.head).toEqual(receipt.fact);
        expect(object(current.history).entries).toHaveLength(1);
        expect(current.opportunityVersion).toBe(2);
        const native = await json(
          await f.request('/commercial-intake/requests/' + c.requestId),
        );
        expect(object(native.initialOpportunity).nextAction).toBe(
          '  Literal text control Ж  ',
        );
        expect(object(native.initialOpportunity).version).toBe(2);
        expect(
          await json(
            await f.request(c.path, {
              method: 'POST',
              body,
              key: 'literal-date',
            }),
          ),
        ).toEqual(receipt);
      }
    });
    it('records first explicit null as a material absence declaration and preserves no-op attribution', async () => {
      const c = await f.createCase();
      const body = {
        expectedRevision: 0,
        observedOpportunityVersion: 1,
        followUpOn: null,
        reason: null,
      };
      const response = await f.request(c.path, {
        method: 'POST',
        body,
        key: 'first-null',
      });
      expect(response.status).toBe(200);
      const receipt = await json(response);
      expect(receipt.outcome).toBe('updated');
      expect(object(receipt.fact)).toMatchObject({
        state: 'RECORDED',
        revision: 1,
        followUpOn: null,
      });
      const noop = await json(
        await f.request(c.path, {
          method: 'POST',
          body: { ...body, expectedRevision: 1 },
          key: 'same-null',
        }),
      );
      expect(noop.outcome).toBe('unchanged');
      expect(noop.fact).toEqual(receipt.fact);
      const current = await json(await f.request(c.path));
      expect(object(current.history).entries).toHaveLength(1);
    });
    it('conserves a reasoned calendar correction without rewriting its previous declaration', async () => {
      const c = await f.createCase();
      const firstResponse = await f.request(c.path, {
        method: 'POST',
        body: {
          expectedRevision: 0,
          observedOpportunityVersion: 1,
          followUpOn: '2026-11-15',
          reason: null,
        },
      });
      expect(firstResponse.status).toBe(200);
      const correction = await f.request(c.path, {
        method: 'POST',
        body: {
          expectedRevision: 1,
          observedOpportunityVersion: 1,
          followUpOn: '2026-11-18',
          reason: 'The discussion moved',
        },
      });
      const current = await json(await f.request(c.path));
      expect(current.head).toMatchObject({
        state: 'RECORDED',
        revision: 2,
        followUpOn: '2026-11-18',
      });
      expect(correction.status).toBe(200);
      expect(object(current.history).entries).toHaveLength(2);
    });
  },
);
