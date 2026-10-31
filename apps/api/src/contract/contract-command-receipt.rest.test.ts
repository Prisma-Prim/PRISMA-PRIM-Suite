import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ESTIMATE_OFFER_PREPARER,
  ESTIMATE_OFFER_READER,
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';
import {
  expectReceiptConflict,
  prepareReceiptScope,
  receiptEffects,
} from './contract-command-receipt.test-support.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres(
  'Decision and simulated signature receipts through default REST/PG composition',
  () => {
    let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>;
    beforeAll(async () => {
      fixture = await openEstimateOfferFixture();
    });
    beforeEach(async () => fixture.reset());
    afterAll(async () => fixture?.close());

    it.each([
      ['APPROVE', 'contract_commands'],
      ['APPROVE', 'contract_events'],
      ['RECORD_SIGNATURE', 'contract_commands'],
      ['RECORD_SIGNATURE', 'contract_events'],
    ] as const)(
      'rolls back every %s effect and Client fence when %s insertion fails, then retries identically',
      async (kind, table) => {
        const scope = await prepareReceiptScope(fixture);
        const target = await scope.target(kind);
        const before = await receiptEffects(fixture);
        try {
          await fixture.pool
            .query(`CREATE FUNCTION fail_receipt_effect() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'Synthetic receipt atomicity failure'; END; $$;
        CREATE TRIGGER fail_receipt_effect BEFORE INSERT ON ${table}
          FOR EACH ROW EXECUTE FUNCTION fail_receipt_effect()`);
          const refused = await target.send('receipt-atomicity');
          expect(refused.status).toBe(500);
          expect(await refused.json()).toMatchObject({
            code:
              kind === 'APPROVE'
                ? 'CONTRACT_DECISION_UNCERTAIN'
                : 'CONTRACT_SIGNATURE_UNCERTAIN',
          });
          expect(await receiptEffects(fixture)).toEqual(before);
        } finally {
          await fixture.pool.query(
            `DROP TRIGGER IF EXISTS fail_receipt_effect ON ${table}; DROP FUNCTION IF EXISTS fail_receipt_effect()`,
          );
        }
        const retry = await target.send('receipt-atomicity');
        expect(retry.status).toBe(201);
        const recorded = responseRecord(await retry.json());
        expect(
          (
            await fixture.pool.query(
              `SELECT kind,result_decision_id,result_signature_id,created_at FROM contract_commands WHERE idempotency_key='receipt-atomicity'`,
            )
          ).rows,
        ).toEqual([
          {
            kind,
            result_decision_id: kind === 'APPROVE' ? recorded.id : null,
            result_signature_id:
              kind === 'RECORD_SIGNATURE' ? recorded.id : null,
            created_at: new Date(
              responseString(
                recorded,
                kind === 'APPROVE' ? 'decidedAt' : 'recordedAt',
              ),
            ),
          },
        ]);
        const detail = responseRecord(
          await fixture.read({
            path: `${target.base}/versions/${target.versionId}`,
            companyId: scope.source.companyId,
            headers: ESTIMATE_OFFER_PREPARER,
          }),
        );
        const version = responseRecord(responseRecord(detail.contract).version);
        expect(version[kind === 'APPROVE' ? 'decision' : 'signature']).toEqual(
          recorded,
        );
      },
    );

    it.each([
      ['APPROVE', 'ordinary'],
      ['APPROVE', 'agreement'],
      ['RECORD_SIGNATURE', 'ordinary'],
      ['RECORD_SIGNATURE', 'agreement'],
    ] as const)(
      'conserves the exact %s result and fingerprint through %s route replay, later state, restart and live revocation',
      async (kind, route) => {
        const scope = await prepareReceiptScope(fixture);
        const target = await scope.target(kind);
        const other = await scope.target(kind);
        const path =
          route === 'ordinary'
            ? target.command.path
            : target.command.path.replace(
                target.base,
                `${target.base}/agreements/${target.contractId}`,
              );
        const send = (body: unknown = target.command.body) =>
          fixture.post({
            headers: ESTIMATE_OFFER_PREPARER,
            companyId: scope.source.companyId,
            path,
            body,
            key: 'conserved-receipt',
          });
        const committed = await send();
        expect(committed.status).toBe(201);
        const original: unknown = await committed.json();
        const receipt = await fixture.pool.query(
          `SELECT * FROM contract_commands WHERE idempotency_key='conserved-receipt'`,
        );
        if (kind === 'APPROVE')
          await fixture.command({
            headers: ESTIMATE_OFFER_PREPARER,
            companyId: scope.source.companyId,
            path: target.base + '/versions',
            body: {
              expectedContractRevision: 2,
              pricingSnapshotId: target.snapshotId,
              scopeNote: 'Later allowable complete successor',
            },
          });
        const client = responseRecord(
          await fixture.read({
            headers: ESTIMATE_OFFER_PREPARER,
            companyId: scope.source.companyId,
            path: '/clients/' + target.clientId,
          }),
        );
        const correction = await fixture.request({
          headers: ESTIMATE_OFFER_PREPARER,
          companyId: scope.source.companyId,
          path: '/clients/' + target.clientId,
          init: {
            method: 'PATCH',
            headers: {
              'content-type': 'application/json',
              'idempotency-key': 'later-party-correction',
            },
            body: JSON.stringify({
              expectedVersion: client.version,
              displayName: 'Later synthetic legal name',
              taxId: client.taxId,
              address: 'Later synthetic address',
            }),
          },
        });
        expect(correction.status).toBe(200);
        await fixture.restart();
        const beforeReplay = await receiptEffects(fixture);
        for (const replay of await Promise.all([send(), send()])) {
          expect(replay.status).toBe(201);
          expect(await replay.json()).toEqual(original);
        }
        expect(
          (
            await fixture.pool.query(
              `SELECT * FROM contract_commands WHERE idempotency_key='conserved-receipt'`,
            )
          ).rows,
        ).toEqual(receipt.rows);
        const changed = {
          ...responseRecord(target.command.body),
          acknowledgedWarningCodes: ['CHANGED'],
        };
        await expectReceiptConflict(await send(changed));
        await expectReceiptConflict(await other.send('conserved-receipt'));
        await expectReceiptConflict(
          await fixture.post({
            headers: ESTIMATE_OFFER_PREPARER,
            companyId: scope.source.companyId,
            path: path.replace(
              /\/(approve|signature)$/u,
              kind === 'APPROVE' ? '/reject' : '/approve',
            ),
            body: target.command.body,
            key: 'conserved-receipt',
          }),
        );
        expect(await receiptEffects(fixture)).toEqual(beforeReplay);
        const revoked = await fixture.request({
          path: `/company-contract-approver-assignments/${scope.source.preparerMembershipId}/${scope.source.companyId}`,
          init: {
            method: 'DELETE',
            headers: { 'idempotency-key': 'receipt-revoke' },
          },
        });
        expect(revoked.status).toBe(200);
        const afterRevocation = await receiptEffects(fixture);
        expect((await send()).status).toBe(403);
        expect((await send(changed)).status).toBe(403);
        expect(await receiptEffects(fixture)).toEqual(afterRevocation);
      },
    );

    it.each(['APPROVE', 'RECORD_SIGNATURE'] as const)(
      'keeps the same literal %s key independent in Company and Membership scope',
      async (kind) => {
        const firstScope = await prepareReceiptScope(fixture);
        const first = await firstScope.target(kind);
        const otherScope = await prepareReceiptScope(fixture, {
          clientTaxId: 'SYNTHETIC-SECOND-COMPANY',
        });
        const otherCompany = await otherScope.target(kind);
        const otherMembership = await firstScope.target(kind);
        for (const path of [
          '/company-contract-approver-assignments',
          '/company-director-client-assignments',
        ])
          await fixture.grant({
            path,
            companyId: firstScope.source.companyId,
            membershipId: firstScope.source.readerMembershipId,
          });
        const key = 'separate-receipt-scope';
        const responses = [
          await first.send(key),
          await otherCompany.send(key),
          await otherMembership.send(
            key,
            otherMembership.command.body,
            ESTIMATE_OFFER_READER,
          ),
        ];
        expect(responses.map((response) => response.status)).toEqual([
          201, 201, 201,
        ]);
        const ids = await Promise.all(
          responses.map(async (response) =>
            responseString(responseRecord(await response.json()), 'id'),
          ),
        );
        expect(new Set(ids).size).toBe(3);
        expect(
          (
            await fixture.pool.query(
              `SELECT company_id,actor_workspace_membership_id,result_contract_id FROM contract_commands WHERE idempotency_key=$1 ORDER BY result_contract_id`,
              [key],
            )
          ).rows,
        ).toEqual(
          [
            {
              company_id: firstScope.source.companyId,
              actor_workspace_membership_id:
                firstScope.source.preparerMembershipId,
              result_contract_id: first.contractId,
            },
            {
              company_id: otherScope.source.companyId,
              actor_workspace_membership_id:
                otherScope.source.preparerMembershipId,
              result_contract_id: otherCompany.contractId,
            },
            {
              company_id: firstScope.source.companyId,
              actor_workspace_membership_id:
                firstScope.source.readerMembershipId,
              result_contract_id: otherMembership.contractId,
            },
          ].sort((a, b) =>
            a.result_contract_id.localeCompare(b.result_contract_id),
          ),
        );
        for (const [target, headers] of [
          [first, ESTIMATE_OFFER_PREPARER],
          [otherMembership, ESTIMATE_OFFER_READER],
        ] as const) {
          const replay = await target.send(key, target.command.body, headers);
          expect(replay.status).toBe(201);
          expect(ids).toContain(
            responseString(responseRecord(await replay.json()), 'id'),
          );
        }
      },
    );
  },
);
