import { randomUUID } from 'node:crypto';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  createPaymentEvidenceFixture,
  paymentRecord,
  paymentText,
  type PaymentEvidenceFixture,
} from '../documents/payment-evidence.test-support.js';
import {
  authorSourceCreateBody,
  authorSourceJson,
  authorSourceReceipt,
  authorSourceValues,
  prepareAuthorSource,
} from './payment-observation-author-source.test-support.js';
import { PaymentStore } from './payment.store.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;
withPostgres('Payment native literal intent, replay and atomic effects', () => {
  let fixture: PaymentEvidenceFixture;
  let body: ReturnType<typeof authorSourceCreateBody>;
  beforeAll(async () => {
    if (!databaseUrl) throw new Error('Native PostgreSQL is required.');
    fixture = await createPaymentEvidenceFixture(databaseUrl);
  });
  beforeEach(async () => {
    await fixture.reset();
    body = authorSourceCreateBody((await prepareAuthorSource(fixture)).source);
  });
  afterAll(async () => {
    await fixture?.close();
  });
  async function effects() {
    const tables = [
      'payments',
      'payment_commands',
      'payment_history',
      'payment_events',
      'payment_cursor_keys',
      'client_accounts',
      'activity_log_events',
    ];
    if (tables.some((table) => !/^[a-z_]+$/u.test(table)))
      throw new Error('Fixed native proof tables are required.');
    const fields = tables
      .map(
        (table) =>
          `'${table}',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) FROM ${table} t)`,
      )
      .join(',');
    const row = (
      await fixture.pool.query<{ snapshot: unknown }>(
        `SELECT jsonb_build_object(${fields}) snapshot`,
      )
    ).rows[0];
    if (!row)
      throw new Error('The complete native effect snapshot is required.');
    return row.snapshot;
  }
  async function create(key = randomUUID(), value: unknown = body) {
    return fixture.call('/payments', { method: 'POST', key, body: value });
  }
  it('rejects unknown/default/numeric/rounded money and malformed literal inputs without reserving a key or creating any effect', async () => {
    const before = await effects(),
      key = randomUUID();
    const invalid = [
      { ...body, values: { ...body.values, amountMinor: null } },
      { ...body, values: { ...body.values, amountMinor: 125500 } },
      ...['0', '00', '01', '-1', '+1', '1.00', '1e2', '100000000000000'].map(
        (amountMinor) => ({ ...body, values: { ...body.values, amountMinor } }),
      ),
      ...['', 'eur', 'XXX', null].map((currency) => ({
        ...body,
        values: { ...body.values, currency },
      })),
      ...[
        '0000-01-01',
        '2026-02-29',
        '2026-04-31',
        '01/15/2026',
        '2026-1-15',
      ].map((effectiveOn) => ({
        ...body,
        values: { ...body.values, effectiveOn },
      })),
      { ...body, values: { ...body.values, method: ' ' } },
      { ...body, values: { ...body.values, method: 'bad\u0000text' } },
      {
        ...body,
        values: { ...body.values, observationBasis: 'bad\ud800text' },
      },
      { ...body, values: { ...body.values, externalReference: undefined } },
      { ...body, values: { ...body.values, unknown: 'refuse' } },
      { ...body, acknowledgeObservedDeclaration: false },
      { ...body, replacesClosedPaymentId: undefined },
      { ...body, extra: null },
    ];
    for (const value of invalid)
      expect((await create(key, value)).status).toBe(400);
    expect(await effects()).toEqual(before);
    const literal = {
      ...body,
      values: {
        ...authorSourceValues,
        amountMinor: '99999999999999',
        currency: 'USD',
        effectiveOn: '2000-02-29',
        externalReference: null,
      },
    };
    const receipt = await authorSourceReceipt(await create(key, literal), {
      action: 'CREATE',
      revision: 1,
    });
    const current = await authorSourceJson(
      await fixture.call(`/payments/${paymentText(receipt.paymentId)}`),
    );
    expect(paymentRecord(current.payment).values).toEqual(literal.values);
  });
  it('uses one actor key namespace across all actions and targets, with exact minimal conserved replay and no extra revision/event/fence', async () => {
    const key = randomUUID(),
      first = await authorSourceReceipt(await create(key), {
        action: 'CREATE',
        revision: 1,
      }),
      id = paymentText(first.paymentId),
      before = await effects();
    const replay = await authorSourceJson(await create(key), 201);
    expect(replay).toEqual(first.body);
    expect(await effects()).toEqual(before);
    expect(
      (
        await create(key, {
          ...body,
          values: { ...body.values, externalReference: 'Changed exact intent' },
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await fixture.call(`/payments/${id}/commands`, {
          method: 'POST',
          key,
          body: {
            action: 'WITHDRAW_DRAFT',
            expectedRevision: 1,
            reason: 'Same namespace',
          },
        })
      ).status,
    ).toBe(409);
    expect(await effects()).toEqual(before);
    const withdrawalKey = randomUUID(),
      withdraw = {
        action: 'WITHDRAW_DRAFT',
        expectedRevision: 1,
        reason: '  Deliberate withdrawal Ș Ю 😀  ',
      };
    const closed = await authorSourceReceipt(
      await fixture.call(`/payments/${id}/commands`, {
        method: 'POST',
        key: withdrawalKey,
        body: withdraw,
      }),
      { action: 'WITHDRAW_DRAFT', revision: 2 },
    );
    const terminal = await effects();
    expect(
      await authorSourceJson(
        await fixture.call(`/payments/${id}/commands`, {
          method: 'POST',
          key: withdrawalKey,
          body: withdraw,
        }),
        201,
      ),
    ).toEqual(closed.body);
    expect(await effects()).toEqual(terminal);
    expect(
      (
        await fixture.call(`/payments/${id}/commands`, {
          method: 'POST',
          body: { ...withdraw, expectedRevision: 2 },
        })
      ).status,
    ).toBe(409);
    const replacement = await authorSourceReceipt(
      await create(randomUUID(), { ...body, replacesClosedPaymentId: id }),
      { action: 'CREATE', revision: 1 },
    );
    expect(
      (await create(randomUUID(), { ...body, replacesClosedPaymentId: id }))
        .status,
    ).toBe(409);
    expect(
      await authorSourceJson(await fixture.call(`/payments/${id}`)),
    ).toMatchObject({
      payment: {
        state: 'WITHDRAWN',
        revision: 2,
        replacementPaymentId: replacement.paymentId,
      },
      history: {
        items: [
          { action: 'WITHDRAW_DRAFT', reason: withdraw.reason },
          { action: 'CREATE' },
        ],
      },
    });
  });
  describe.each([
    'final event',
    'deferred commit',
    'valid final response',
  ] as const)('%s failure', (failure) => {
    it('visits the final coupled stage, rolls back head/history/intent/receipt/event/fence and permits the exact unreserved retry', async () => {
      const before = await effects(),
        key = randomUUID();
      let decoded: unknown;
      let restore: (() => void) | undefined;
      try {
        if (failure === 'valid final response') {
          const original = PaymentStore.prototype.replay;
          const spy = vi
            .spyOn(PaymentStore.prototype, 'replay')
            .mockImplementationOnce(async function (
              this: PaymentStore,
              row: Parameters<PaymentStore['replay']>[0],
            ) {
              decoded = await original.call(this, row);
              throw new Error('Synthetic final Payment response failure');
            });
          restore = () => spy.mockRestore();
        } else {
          await fixture.pool.query(
            'CREATE SEQUENCE payment_proof_final_visits',
          );
          await fixture.pool
            .query(`CREATE FUNCTION payment_proof_final_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF EXISTS(SELECT 1 FROM payments p JOIN payment_history h ON (h.workspace_id,h.company_id,h.payment_id,h.revision)=(p.workspace_id,p.company_id,p.id,p.revision) JOIN payment_commands c ON c.id=h.command_id WHERE p.id=NEW.payment_id AND c.id=NEW.command_id AND c.response->>'paymentId'=p.id::text AND h.fact->'after'->'values'=p.values) THEN PERFORM nextval('payment_proof_final_visits'); END IF;
      RAISE EXCEPTION 'Synthetic final Payment failure'; END $$`);
          await fixture.pool.query(
            failure === 'final event'
              ? 'CREATE TRIGGER payment_proof_final_failure BEFORE INSERT ON payment_events FOR EACH ROW EXECUTE FUNCTION payment_proof_final_failure()'
              : 'CREATE CONSTRAINT TRIGGER payment_proof_final_failure AFTER INSERT ON payment_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION payment_proof_final_failure()',
          );
        }
        expect((await create(key)).status).toBe(503);
        if (failure === 'valid final response')
          expect(decoded).toMatchObject({
            format: 'PAYMENT_COMMAND/1',
            revision: 1,
            action: 'CREATE',
          });
        else
          expect(
            (
              await fixture.pool.query<{
                last_value: string;
                is_called: boolean;
              }>(
                'SELECT last_value::text,is_called FROM payment_proof_final_visits',
              )
            ).rows,
          ).toEqual([{ last_value: '1', is_called: true }]);
        expect(await effects()).toEqual(before);
        expect(
          await authorSourceJson(await fixture.call('/payments')),
        ).toMatchObject({ items: [], nextCursor: null });
        expect(await effects()).toEqual(before);
      } finally {
        restore?.();
        if (failure !== 'valid final response') {
          await fixture.pool.query(
            'DROP TRIGGER IF EXISTS payment_proof_final_failure ON payment_events',
          );
          await fixture.pool.query(
            'DROP FUNCTION IF EXISTS payment_proof_final_failure()',
          );
          await fixture.pool.query(
            'DROP SEQUENCE IF EXISTS payment_proof_final_visits',
          );
        }
      }
      const saved = await authorSourceReceipt(await create(key), {
        action: 'CREATE',
        revision: 1,
      });
      expect(await authorSourceJson(await create(key), 201)).toEqual(
        saved.body,
      );
    });
  });
});
