import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createPaymentEvidenceFixture,
  paymentRecord,
  paymentText,
  type PaymentEvidenceFixture,
} from '../documents/payment-evidence.test-support.js';
import {
  authorSourceCreateBody,
  authorSourceItems,
  authorSourceJson,
  authorSourceReceipt,
  authorSourceValues,
  prepareAuthorSource,
} from './payment-observation-author-source.test-support.js';

const databaseUrl = process.env.TEST_DATABASE_URL,
  withPostgres = databaseUrl ? describe : describe.skip;
withPostgres('Payment bounded inventory and complete immutable history', () => {
  let fixture: PaymentEvidenceFixture, id: string, ids: string[];
  beforeAll(async () => {
    if (!databaseUrl) throw new Error('Native PostgreSQL is required.');
    fixture = await createPaymentEvidenceFixture(databaseUrl);
    await fixture.reset();
    const source = (await prepareAuthorSource(fixture)).source;
    // Replace only the native clock boundary to exercise real equal-instant UUID ordering.
    // Every business root/fact/receipt/event still comes from the unmodified public command path.
    await fixture.pool.query(
      `CREATE FUNCTION payment_proof_equal_clock() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.created_at:='2026-01-20T12:00:00.000Z'; NEW.response:=jsonb_set(NEW.response,'{recordedAt}','"2026-01-20T12:00:00.000Z"'); RETURN NEW; END $$`,
    );
    await fixture.pool.query(
      'CREATE TRIGGER zz_payment_proof_equal_clock BEFORE INSERT ON payment_commands FOR EACH ROW EXECUTE FUNCTION payment_proof_equal_clock()',
    );
    ids = [];
    for (let index = 0; index < 27; index++) {
      const receipt = await authorSourceReceipt(
        await fixture.call('/payments', {
          method: 'POST',
          body: authorSourceCreateBody(source),
        }),
        { action: 'CREATE', revision: 1 },
      );
      ids.push(paymentText(receipt.paymentId));
    }
    const first = ids[0],
      withdrawn = ids[1],
      confirmed = ids[2],
      reversed = ids[3];
    if (!first || !withdrawn || !confirmed || !reversed)
      throw new Error('Complete reachable observation fixtures are required.');
    id = first;
    await authorSourceReceipt(
      await fixture.call(`/payments/${withdrawn}/commands`, {
        method: 'POST',
        body: {
          action: 'WITHDRAW_DRAFT',
          expectedRevision: 1,
          reason: 'Literal closed draft',
        },
      }),
      { action: 'WITHDRAW_DRAFT', revision: 2 },
    );
    for (const paymentId of [confirmed, reversed])
      await authorSourceReceipt(
        await fixture.call(`/payments/${paymentId}/commands`, {
          method: 'POST',
          identity: 'confirmer',
          body: {
            action: 'CONFIRM',
            expectedRevision: 1,
            acknowledgeReviewedObservation: true,
            confirmationNote: 'Independent review',
          },
        }),
        { action: 'CONFIRM', revision: 2 },
      );
    await authorSourceReceipt(
      await fixture.call(`/payments/${reversed}/commands`, {
        method: 'POST',
        identity: 'reverser',
        body: {
          action: 'REVERSE',
          expectedRevision: 2,
          reason: 'Literal reversal',
        },
      }),
      { action: 'REVERSE', revision: 3 },
    );
    for (let revision = 1; revision <= 27; revision++)
      await authorSourceReceipt(
        await fixture.call(`/payments/${id}/commands`, {
          method: 'POST',
          body: {
            action: 'CORRECT_DRAFT',
            expectedRevision: revision,
            values: {
              ...authorSourceValues,
              amountMinor: String(125500 + revision),
            },
            reason: `Material correction ${revision}`,
          },
        }),
        { action: 'CORRECT_DRAFT', revision: revision + 1 },
      );
  });
  afterAll(async () => {
    await fixture?.close();
  });
  async function effects() {
    return (
      await fixture.pool.query<{
        roots: number;
        commands: number;
        history: number;
        events: number;
        fences: unknown;
        scans: number;
      }>(
        `SELECT (SELECT count(*)::int FROM payments) roots,(SELECT count(*)::int FROM payment_commands) commands,(SELECT count(*)::int FROM payment_history) history,(SELECT count(*)::int FROM payment_events) events,(SELECT jsonb_agg(jsonb_build_array(id,version) ORDER BY id) FROM client_accounts) fences,(SELECT count(*)::int FROM document_pdfs) scans`,
      )
    ).rows;
  }
  it('reaches all27 observations in exact equal-time UUID order, all four states, without totals/filters or business read effects', async () => {
    const before = await effects(),
      first = await authorSourceJson(
        await fixture.call('/payments', { identity: 'reader' }),
      ),
      cursor = paymentText(first.nextCursor);
    expect(Object.keys(first).sort()).toEqual([
      'companyId',
      'format',
      'items',
      'nextCursor',
      'readCapture',
    ]);
    expect(cursor.length).toBeLessThanOrEqual(2048);
    const a = authorSourceItems(first.items);
    expect(a).toHaveLength(25);
    const second = await authorSourceJson(
        await fixture.call(`/payments?cursor=${encodeURIComponent(cursor)}`, {
          identity: 'reader',
        }),
      ),
      b = authorSourceItems(second.items);
    expect(b).toHaveLength(2);
    expect(second.nextCursor).toBeNull();
    expect([...a, ...b].map((row) => row.id)).toEqual(
      [...ids].sort().reverse(),
    );
    expect(new Set([...a, ...b].map((row) => row.state))).toEqual(
      new Set(['DRAFT', 'WITHDRAWN', 'CONFIRMED', 'REVERSED']),
    );
    expect(new Set([...a, ...b].map((row) => row.createdAt))).toEqual(
      new Set(['2026-01-20T12:00:00.000Z']),
    );
    for (const query of [
      'state=DRAFT',
      'from=2026-01-01',
      'externalReference=FICT',
      'cursor=' + encodeURIComponent('x'.repeat(2049)),
    ])
      expect((await fixture.call('/payments?' + query)).status).toBe(400);
    expect(
      (
        await fixture.call('/payments?cursor=' + encodeURIComponent(cursor), {
          identity: 'owner',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await fixture.call(
          '/payments?cursor=' + encodeURIComponent(cursor.slice(0, -2) + 'xx'),
          { identity: 'reader' },
        )
      ).status,
    ).toBe(400);
    expect(await effects()).toEqual(before);
  });
  it('reaches every before/after revision across25+3, refuses wrong-kind cursors, then reports409 for a changed head', async () => {
    const before = await effects(),
      detail = await authorSourceJson(
        await fixture.call(`/payments/${id}`, { identity: 'reader' }),
      ),
      history = paymentRecord(detail.history),
      head = authorSourceItems(history.items),
      cursor = paymentText(history.nextCursor);
    expect(head.map((row) => row.revision)).toEqual(
      Array.from({ length: 25 }, (_, i) => 28 - i),
    );
    expect(paymentRecord(detail.payment)).toMatchObject({
      revision: 28,
      values: { ...authorSourceValues, amountMinor: '125527' },
    });
    const rest = await authorSourceJson(
        await fixture.call(
          `/payments/${id}/history?cursor=${encodeURIComponent(cursor)}`,
          { identity: 'reader' },
        ),
      ),
      tail = authorSourceItems(rest.items);
    expect(tail.map((row) => row.revision)).toEqual([3, 2, 1]);
    expect(rest.nextCursor).toBeNull();
    const chain = [...head, ...tail];
    for (let i = 0; i < chain.length - 1; i++)
      expect(chain[i]?.before).toEqual(chain[i + 1]?.after);
    expect(chain.at(-1)).toMatchObject({
      revision: 1,
      before: null,
      after: { state: 'DRAFT', values: authorSourceValues },
    });
    expect(
      (
        await fixture.call('/payments?cursor=' + encodeURIComponent(cursor), {
          identity: 'reader',
        })
      ).status,
    ).toBe(400);
    const inventory = await authorSourceJson(
      await fixture.call('/payments', { identity: 'reader' }),
    );
    expect(
      (
        await fixture.call(
          `/payments/${id}/history?cursor=${encodeURIComponent(paymentText(inventory.nextCursor))}`,
          { identity: 'reader' },
        )
      ).status,
    ).toBe(400);
    expect(await effects()).toEqual(before);
    await authorSourceReceipt(
      await fixture.call(`/payments/${id}/commands`, {
        method: 'POST',
        body: {
          action: 'CORRECT_DRAFT',
          expectedRevision: 28,
          values: { ...authorSourceValues, amountMinor: '125528' },
          reason: 'Changed after the displayed history head',
        },
      }),
      { action: 'CORRECT_DRAFT', revision: 29 },
    );
    const changed = await fixture.call(
      `/payments/${id}/history?cursor=${encodeURIComponent(cursor)}`,
      { identity: 'reader' },
    );
    expect(changed.status).toBe(409);
    expect(await changed.json()).toMatchObject({
      code: 'PAYMENT_HISTORY_CHANGED',
    });
  });
});
