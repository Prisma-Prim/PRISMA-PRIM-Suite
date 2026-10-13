import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { expect, it } from 'vitest';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const WORKSPACE = '00000000-0000-4000-8000-000000000571';
const USER = '00000000-0000-4000-8000-000000005711';
const MEMBERSHIP = '00000000-0000-4000-8000-000000005712';
const COMPANY = '00000000-0000-4000-8000-000000005713';
const REQUESTS = [
  '00000000-0000-4000-8000-000000005714',
  '00000000-0000-4000-8000-000000005715',
] as const;
const OPPORTUNITIES = [
  '00000000-0000-4000-8000-000000005716',
  '00000000-0000-4000-8000-000000005717',
] as const;
const CAPTURED_AT = [
  '2026-03-02T08:15:00.123456Z',
  '2026-07-19T16:40:00.654321Z',
] as const;
const CHECK_VIOLATION = '23514';
const FOREIGN_KEY_VIOLATION = '23503';
const UNIQUE_VIOLATION = '23505';

it.skipIf(!databaseUrl)(
  'keeps existing Opportunities OPEN since their capture time and enforces the outcome status contract',
  async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'opp_outcome_upgrade',
    });
    let previous: string | undefined;
    try {
      const journal: unknown = JSON.parse(
        await readFile('drizzle/meta/_journal.json', 'utf8'),
      );
      if (
        typeof journal !== 'object' ||
        journal === null ||
        !('entries' in journal) ||
        !Array.isArray(journal.entries)
      )
        throw new Error('Invalid migration journal.');
      const tags: string[] = journal.entries.map((entry: unknown) => {
        if (
          typeof entry !== 'object' ||
          entry === null ||
          !('tag' in entry) ||
          typeof entry.tag !== 'string' ||
          !/^\d{4}_[a-z0-9_-]+$/u.test(entry.tag)
        )
          throw new Error('Invalid migration tag.');
        return entry.tag;
      });
      const target = tags.indexOf('0065_opportunity_outcome_status');
      expect(target).toBeGreaterThan(0);
      previous = await mkdtemp(join(tmpdir(), 'prisma-570-upgrade-'));
      await mkdir(join(previous, 'meta'));
      await writeFile(
        join(previous, 'meta/_journal.json'),
        JSON.stringify({
          ...journal,
          entries: journal.entries.slice(0, target),
        }),
      );
      for (const tag of tags.slice(0, target))
        await cp(join('drizzle', tag + '.sql'), join(previous, tag + '.sql'));
      const connection = drizzle(database.targetPool);
      await migrate(connection, { migrationsFolder: previous });
      const query = (text: string, values: unknown[] = []) =>
        database.targetPool.query(text, values);

      await query(
        `INSERT INTO workspaces (id, name) VALUES ($1, 'Preserved outcome')`,
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
         VALUES ($1, $2, 'Preserved Company', $3, $4, 'preserved-outcome-company')`,
        [COMPANY, WORKSPACE, USER, MEMBERSHIP],
      );
      await query(
        `INSERT INTO company_role_assignments (workspace_id, company_id, workspace_membership_id, bundle, permission_set_version)
         VALUES ($1, $2, $3, 'company_opportunity_manager', 'v1')`,
        [WORKSPACE, COMPANY, MEMBERSHIP],
      );
      for (const [index, request] of REQUESTS.entries()) {
        await query(
          `INSERT INTO client_requests (id, workspace_id, company_id, original_text, captured_by_internal_user_id,
             captured_by_workspace_membership_id, captured_at)
           VALUES ($1, $2, $3, 'Preserved request text', $4, $5, $6)`,
          [request, WORKSPACE, COMPANY, USER, MEMBERSHIP, CAPTURED_AT[index]],
        );
        // The second Opportunity was later updated: a mutation never moved
        // the status, so its status-entered time is still its capture time.
        await query(
          `INSERT INTO opportunities (id, workspace_id, company_id, client_request_id, title, next_action,
             responsible_internal_user_id, responsible_workspace_membership_id, created_at, version,
             last_updated_by_internal_user_id, last_updated_by_workspace_membership_id, last_updated_at)
           VALUES ($1, $2, $3, $4, 'Preserved Opportunity', 'Preserved next action', $5, $6, $7, $8,
             $9, $10, $11)`,
          [
            OPPORTUNITIES[index],
            WORKSPACE,
            COMPANY,
            request,
            USER,
            MEMBERSHIP,
            CAPTURED_AT[index],
            index + 1,
            index === 0 ? null : USER,
            index === 0 ? null : MEMBERSHIP,
            index === 0 ? null : '2026-08-01T10:00:00Z',
          ],
        );
      }
      const opportunitiesBefore = (
        await query('SELECT * FROM opportunities ORDER BY id')
      ).rows;
      const assignmentsBefore = (
        await query('SELECT * FROM company_role_assignments ORDER BY id')
      ).rows;

      await migrate(connection, { migrationsFolder: resolve('drizzle') });

      // Existing Opportunities stay OPEN, unchanged and without a history
      // entry, so each reads as OPEN since its capture time.
      // 0066 later adds the Sales Stage, which no migration assigns.
      expect(
        (await query('SELECT * FROM opportunities ORDER BY id')).rows,
      ).toEqual(
        opportunitiesBefore.map((row) => ({ ...row, sales_stage_id: null })),
      );
      expect(
        (await query('SELECT * FROM company_role_assignments ORDER BY id'))
          .rows,
      ).toEqual(assignmentsBefore);
      for (const table of [
        'opportunity_outcome_history',
        'commercial_intake_outcome_commands',
      ])
        expect(
          (await query(`SELECT count(*)::int AS count FROM ${table}`)).rows,
        ).toEqual([{ count: 0 }]);

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
          [status, OPPORTUNITIES[0]],
        );
      for (const status of ['CLOSED', 'open', 'PENDING'])
        await expect(
          query('UPDATE opportunities SET status = $1 WHERE id = $2', [
            status,
            OPPORTUNITIES[0],
          ]),
        ).rejects.toMatchObject({ code: CHECK_VIOLATION });
      await query("UPDATE opportunities SET status = 'OPEN' WHERE id = $1", [
        OPPORTUNITIES[0],
      ]);

      // The captured manager bundle admits v1 and v2 only.
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
            OPPORTUNITIES[0],
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
            OPPORTUNITIES[0],
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
            REQUESTS[0],
            OPPORTUNITIES[0],
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
      if (
        previous &&
        dirname(resolve(previous)) === resolve(tmpdir()) &&
        basename(previous).startsWith('prisma-570-upgrade-')
      )
        await rm(previous, { recursive: true, force: true });
    }
  },
  30_000,
);
