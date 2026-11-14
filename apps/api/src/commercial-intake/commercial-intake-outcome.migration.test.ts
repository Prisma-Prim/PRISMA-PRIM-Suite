import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { expect, it } from 'vitest';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const WORKSPACE = '00000000-0000-4000-8000-000000000571';
const USER = '00000000-0000-4000-8000-000000005711';
const MEMBERSHIP = '00000000-0000-4000-8000-000000005712';
const COMPANY = '00000000-0000-4000-8000-000000005713';
const REQUEST = '00000000-0000-4000-8000-000000005714';
const OPPORTUNITY = '00000000-0000-4000-8000-000000005716';
const CHECK_VIOLATION = '23514';
const FOREIGN_KEY_VIOLATION = '23503';
const UNIQUE_VIOLATION = '23505';

it.skipIf(!databaseUrl)(
  'enforces the Opportunity outcome status, history, receipt and event contract on a database migrated from empty',
  async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'opp_outcome_schema',
    });
    try {
      await migrate(drizzle(database.targetPool), {
        migrationsFolder: resolve('drizzle'),
      });
      const query = (text: string, values: unknown[] = []) =>
        database.targetPool.query(text, values);

      await query(
        `INSERT INTO workspaces (id, name) VALUES ($1, 'Outcome intake')`,
        [WORKSPACE],
      );
      await query(
        `INSERT INTO internal_users (id, external_provider, external_subject, display_name, email)
         VALUES ($1, 'deterministic-test', 'ada', 'Ada Ionescu', 'ada@example.test')`,
        [USER],
      );
      await query(
        `INSERT INTO workspace_memberships (id, workspace_id, internal_user_id)
         VALUES ($1, $2, $3)`,
        [MEMBERSHIP, WORKSPACE, USER],
      );
      await query(
        `INSERT INTO companies (id, workspace_id, display_name, created_by_internal_user_id,
           created_by_workspace_membership_id, registration_idempotency_key)
         VALUES ($1, $2, 'Outcome Company', $3, $4, 'outcome-company')`,
        [COMPANY, WORKSPACE, USER, MEMBERSHIP],
      );
      await query(
        `INSERT INTO client_requests (id, workspace_id, company_id, original_text, captured_by_internal_user_id,
           captured_by_workspace_membership_id)
         VALUES ($1, $2, $3, 'Outcome request text', $4, $5)`,
        [REQUEST, WORKSPACE, COMPANY, USER, MEMBERSHIP],
      );
      await query(
        `INSERT INTO opportunities (id, workspace_id, company_id, client_request_id, title, next_action,
           responsible_internal_user_id, responsible_workspace_membership_id)
         VALUES ($1, $2, $3, $4, 'Outcome Opportunity', 'Call back', $5, $6)`,
        [OPPORTUNITY, WORKSPACE, COMPANY, REQUEST, USER, MEMBERSHIP],
      );

      // Exactly the six statuses.
      for (const status of [
        'ON_HOLD',
        'WON',
        'LOST',
        'DISQUALIFIED',
        'ARCHIVED',
      ])
        await query(
          'UPDATE opportunities SET status = $1 WHERE id = $2 RETURNING id',
          [status, OPPORTUNITY],
        );
      for (const status of ['CLOSED', 'open', 'PENDING'])
        await expect(
          query('UPDATE opportunities SET status = $1 WHERE id = $2', [
            status,
            OPPORTUNITY,
          ]),
        ).rejects.toMatchObject({ code: CHECK_VIOLATION });
      await query("UPDATE opportunities SET status = 'OPEN' WHERE id = $1", [
        OPPORTUNITY,
      ]);

      // The manager bundle admits its captured versions only.
      const insertManager = (version: string | null) =>
        query(
          `INSERT INTO company_role_assignments (workspace_id, company_id, workspace_membership_id, bundle,
             permission_set_version, revoked_at)
           VALUES ($1, $2, $3, 'company_opportunity_manager', $4, now())`,
          [WORKSPACE, COMPANY, MEMBERSHIP, version],
        );
      await insertManager('v2');
      for (const version of [null, 'V2', 'v3'])
        await expect(insertManager(version)).rejects.toMatchObject({
          code: CHECK_VIOLATION,
        });

      // History entries record exactly one section 23.2 transition with the
      // fields it requires and section 16.3 text.
      const insertHistory = (
        version: number,
        entry: {
          previous: string;
          next: string;
          code?: string;
          reason?: string;
          note?: string;
          label?: string;
        },
      ) =>
        query(
          `INSERT INTO opportunity_outcome_history (workspace_id, company_id, opportunity_id, opportunity_version,
             previous_status, new_status, loss_reason_code, reason, note, actor_internal_user_id,
             actor_workspace_membership_id, actor_display_label)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            WORKSPACE,
            COMPANY,
            OPPORTUNITY,
            version,
            entry.previous,
            entry.next,
            entry.code ?? null,
            entry.reason ?? null,
            entry.note ?? null,
            USER,
            MEMBERSHIP,
            entry.label ?? 'Ada Ionescu · A',
          ],
        );
      for (const rejected of [
        { previous: 'OPEN', next: 'OPEN', reason: 'Same status' },
        { previous: 'WON', next: 'LOST', code: 'PRICE' },
        { previous: 'LOST', next: 'ARCHIVED', reason: 'Close it' },
        { previous: 'OPEN', next: 'ON_HOLD' },
        { previous: 'OPEN', next: 'ON_HOLD', reason: ' ' },
        { previous: 'OPEN', next: 'ON_HOLD', reason: 'x'.repeat(501) },
        { previous: 'OPEN', next: 'ON_HOLD', reason: 'Wait', note: 'Extra' },
        { previous: 'ON_HOLD', next: 'OPEN', reason: 'Resume' },
        { previous: 'WON', next: 'OPEN' },
        { previous: 'OPEN', next: 'WON', code: 'PRICE' },
        { previous: 'OPEN', next: 'LOST' },
        { previous: 'OPEN', next: 'LOST', code: 'EXPENSIVE' },
        { previous: 'OPEN', next: 'LOST', code: 'OTHER' },
        { previous: 'OPEN', next: 'LOST', code: 'PRICE', reason: 'Price' },
        { previous: 'OPEN', next: 'WON', label: ' ' },
      ])
        await expect(insertHistory(2, rejected)).rejects.toMatchObject({
          code: CHECK_VIOLATION,
        });
      await expect(
        insertHistory(1, { previous: 'OPEN', next: 'WON' }),
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });
      await insertHistory(2, {
        previous: 'OPEN',
        next: 'LOST',
        code: 'OTHER',
        note: ' Merged with a group ',
      });
      await insertHistory(3, {
        previous: 'LOST',
        next: 'OPEN',
        reason: 'Client returned',
      });
      await insertHistory(4, {
        previous: 'OPEN',
        next: 'ON_HOLD',
        reason: 'Wait',
      });
      await insertHistory(5, { previous: 'ON_HOLD', next: 'OPEN' });
      await insertHistory(6, {
        previous: 'OPEN',
        next: 'LOST',
        code: 'UNKNOWN',
      });
      await expect(
        insertHistory(6, { previous: 'LOST', next: 'OPEN', reason: 'Again' }),
      ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });

      // A receipt references the history entry its transition produced.
      const insertReceipt = (
        key: string,
        expected: number,
        result: number,
        statuses: readonly [string, string] = ['OPEN', 'LOST'],
      ) =>
        query(
          `INSERT INTO commercial_intake_outcome_commands (workspace_id, company_id, actor_workspace_membership_id,
             idempotency_key, fingerprint, opportunity_id, expected_version, result_version, previous_status, new_status)
           VALUES ($1, $2, $3, $4, 'fingerprint', $5, $6, $7, $8, $9)`,
          [
            WORKSPACE,
            COMPANY,
            MEMBERSHIP,
            key,
            OPPORTUNITY,
            expected,
            result,
            ...statuses,
          ],
        );
      await expect(
        insertReceipt('outside-table', 1, 2, ['WON', 'LOST']),
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });
      await insertReceipt('recorded', 1, 2);
      await expect(insertReceipt('skipped', 1, 3)).rejects.toMatchObject({
        code: CHECK_VIOLATION,
      });
      await expect(insertReceipt('orphan', 7, 8)).rejects.toMatchObject({
        code: FOREIGN_KEY_VIOLATION,
      });
      await expect(insertReceipt('recorded', 2, 3)).rejects.toMatchObject({
        code: UNIQUE_VIOLATION,
      });

      // The event carries exactly the version, the statuses of one
      // transition and a loss's code; never reason or note text.
      const insertEvent = (metadata: unknown) =>
        query(
          `INSERT INTO commercial_intake_events (workspace_id, company_id, action, client_request_id, opportunity_id,
             actor_internal_user_id, actor_workspace_membership_id, metadata)
           VALUES ($1, $2, 'opportunity.outcome.changed', $3, $4, $5, $6, $7::jsonb)`,
          [
            WORKSPACE,
            COMPANY,
            REQUEST,
            OPPORTUNITY,
            USER,
            MEMBERSHIP,
            JSON.stringify(metadata),
          ],
        );
      for (const rejected of [
        { opportunityVersion: 1, previousStatus: 'OPEN', newStatus: 'WON' },
        { opportunityVersion: '2', previousStatus: 'OPEN', newStatus: 'WON' },
        {
          opportunityVersion: 2,
          previousStatus: 'WON',
          newStatus: 'LOST',
          lossReasonCode: 'PRICE',
        },
        { opportunityVersion: 2, previousStatus: 'OPEN', newStatus: 'OPEN' },
        { opportunityVersion: 2, previousStatus: 'OPEN', newStatus: 'LOST' },
        {
          opportunityVersion: 2,
          previousStatus: 'OPEN',
          newStatus: 'LOST',
          lossReasonCode: 'EXPENSIVE',
        },
        {
          opportunityVersion: 2,
          previousStatus: 'OPEN',
          newStatus: 'WON',
          lossReasonCode: 'PRICE',
        },
        {
          opportunityVersion: 2,
          previousStatus: 'OPEN',
          newStatus: 'ON_HOLD',
          reason: 'Wait',
        },
        {
          opportunityVersion: 2,
          previousStatus: 'OPEN',
          newStatus: 'LOST',
          lossReasonCode: 'OTHER',
          note: 'Text',
        },
        { opportunityVersion: 2, previousStatus: 'OPEN' },
      ])
        await expect(insertEvent(rejected)).rejects.toMatchObject({
          code: CHECK_VIOLATION,
        });
      await insertEvent({
        opportunityVersion: 2,
        previousStatus: 'OPEN',
        newStatus: 'LOST',
        lossReasonCode: 'OTHER',
      });
      await insertEvent({
        opportunityVersion: 3,
        previousStatus: 'LOST',
        newStatus: 'OPEN',
      });
      await expect(
        insertEvent({
          opportunityVersion: 3,
          previousStatus: 'OPEN',
          newStatus: 'WON',
        }),
      ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
    } finally {
      await database.close();
    }
  },
  60_000,
);
