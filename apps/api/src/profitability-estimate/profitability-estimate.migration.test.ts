import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createIsolatedPostgresTestDatabase,
  type IsolatedPostgresTestDatabase,
} from '../database/isolated-postgres-test-database.js';
import { calculateProfitability } from './profitability-estimate.calculation.js';
import { readProfitabilitySubmission } from './profitability-estimate.validation.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const uuid = (suffix: number) =>
  `00000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const scope = {
  workspaceId: uuid(498100),
  companyId: uuid(498101),
  userId: uuid(498102),
  membershipId: uuid(498103),
  requestId: uuid(498104),
  opportunityId: uuid(498105),
};
const otherCompany = {
  ...scope,
  companyId: uuid(498106),
  requestId: uuid(498107),
  opportunityId: uuid(498108),
};
const otherWorkspace = {
  ...scope,
  workspaceId: uuid(498109),
  companyId: uuid(498110),
  membershipId: uuid(498111),
  requestId: uuid(498112),
  opportunityId: uuid(498113),
};
const estimateId = uuid(498114);
const versionId = uuid(498115);
const orphanEstimateId = uuid(498116);
const decisionId = uuid(498117);
const receiptId = uuid(498118);
const eventId = uuid(498119);
const nextVersionId = uuid(498120);
const frozenInputs = readProfitabilitySubmission({
  expectedLatestVersionNumber: null,
  currency: 'EUR',
  executorType: 'PATENT_CONSULTANT',
  executorCost: '060.00',
  fiscalCost: '10.00',
  allocatedOverhead: '10.00',
  directCosts: [
    {
      key: 'synthetic',
      category: 'OTHER',
      label: '  Synthetic line  ',
      amount: '20.00',
      currency: 'EUR',
    },
  ],
  proposedPrice: '125.00',
  targetProfitability: '+020.0000000000000000000001',
  pricingIntent: {
    kind: 'STRATEGIC',
    reason: '  Synthetic preserved reason  ',
  },
  costConfirmation: true,
});
const { expectedLatestVersionNumber, ...inputs } = frozenInputs;
const results = calculateProfitability(inputs);
const calculationRule = {
  id: 'CONFIRMED_COST_PROFITABILITY',
  version: 1,
  monetaryScale: 2,
  percentageScale: 2,
  rounding: 'HALF_UP',
};
const newTables = [
  'profitability_estimates',
  'profitability_estimate_versions',
  'profitability_estimate_decisions',
  'profitability_estimate_receipts',
  'profitability_estimate_events',
];
const legacyTables = [
  'workspaces',
  'internal_users',
  'workspace_memberships',
  'companies',
  'company_role_assignments',
  'client_requests',
  'opportunities',
  'activity_log_events',
  'pricing_snapshots',
  'offer_versions',
];

describe.skipIf(!databaseUrl)(
  'Confirmed-cost additive migration and database invariants',
  () => {
    let database: IsolatedPostgresTestDatabase | undefined;
    let before: unknown;
    let after: unknown;
    let initiallyEmpty: unknown;

    function pool() {
      if (!database) throw new Error('Migration fixture is unavailable.');
      return database.targetPool;
    }

    async function transaction(work: (client: PoolClient) => Promise<unknown>) {
      const client = await pool().connect();
      try {
        await client.query('BEGIN');
        await work(client);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }

    async function insertVersion(
      client: PoolClient,
      overrides: {
        id?: string;
        workspaceId?: string;
        companyId?: string;
        opportunityId?: string;
        clientRequestId?: string;
        versionNumber?: number;
        predecessorVersionId?: string | null;
        predecessorVersionNumber?: number | null;
      } = {},
    ) {
      return client.query(
        `INSERT INTO profitability_estimate_versions
       (id,workspace_id,company_id,estimate_id,opportunity_id,client_request_id,version_number,
        predecessor_version_id,predecessor_version_number,inputs,results,calculation_rule,
        created_by_workspace_membership_id,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,$13,now())`,
        [
          overrides.id ?? versionId,
          overrides.workspaceId ?? scope.workspaceId,
          overrides.companyId ?? scope.companyId,
          estimateId,
          overrides.opportunityId ?? scope.opportunityId,
          overrides.clientRequestId ?? scope.requestId,
          overrides.versionNumber ?? 1,
          overrides.predecessorVersionId ?? null,
          overrides.predecessorVersionNumber ?? null,
          JSON.stringify(inputs),
          JSON.stringify(results),
          JSON.stringify(calculationRule),
          scope.membershipId,
        ],
      );
    }

    async function seedLegacy(value: typeof scope) {
      await pool().query(
        `INSERT INTO workspace_memberships (id,workspace_id,internal_user_id) VALUES ($1,$2,$3)`,
        [value.membershipId, value.workspaceId, value.userId],
      );
      await pool().query(
        `INSERT INTO companies
      (id,workspace_id,display_name,created_by_internal_user_id,created_by_workspace_membership_id,registration_idempotency_key)
      VALUES ($1,$2,'Synthetic preserved Company',$3,$4,$1::text)`,
        [value.companyId, value.workspaceId, value.userId, value.membershipId],
      );
      await seedOpportunity(value);
    }

    async function seedOpportunity(value: typeof scope) {
      await pool().query(
        `INSERT INTO client_requests
      (id,workspace_id,company_id,original_text,captured_by_internal_user_id,captured_by_workspace_membership_id)
      VALUES ($1,$2,$3,'Synthetic preserved request',$4,$5)`,
        [
          value.requestId,
          value.workspaceId,
          value.companyId,
          value.userId,
          value.membershipId,
        ],
      );
      await pool().query(
        `INSERT INTO opportunities
      (id,workspace_id,company_id,client_request_id,title,next_action,responsible_internal_user_id,responsible_workspace_membership_id)
      VALUES ($1,$2,$3,$4,'Synthetic preserved Opportunity','Synthetic next action',$5,$6)`,
        [
          value.opportunityId,
          value.workspaceId,
          value.companyId,
          value.requestId,
          value.userId,
          value.membershipId,
        ],
      );
    }

    beforeAll(async () => {
      if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
      database = await createIsolatedPostgresTestDatabase({
        baseDatabaseUrl: databaseUrl,
        namePrefix: 'profitability_upgrade',
      });
      const previous = await mkdtemp(join(tmpdir(), 'prisma-498-upgrade-'));
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
        const tags = journal.entries.map((entry: unknown) => {
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
        const migrationIndex = tags.indexOf(
          '0052_confirmed_cost_profitability_estimate',
        );
        expect(migrationIndex).toBeGreaterThan(0);
        expect(tags[migrationIndex - 1]).toBe('0051_contract_first_version');
        await mkdir(join(previous, 'meta'));
        await writeFile(
          join(previous, 'meta/_journal.json'),
          JSON.stringify({
            ...journal,
            entries: journal.entries.slice(0, migrationIndex),
          }),
        );
        for (const tag of tags.slice(0, migrationIndex))
          await cp(join('drizzle', `${tag}.sql`), join(previous, `${tag}.sql`));
        const connection = drizzle(pool());
        await migrate(connection, { migrationsFolder: previous });
        await pool().query(
          `INSERT INTO workspaces (id,name) VALUES ($1,'Synthetic preserved Workspace'),($2,'Synthetic other Workspace')`,
          [scope.workspaceId, otherWorkspace.workspaceId],
        );
        await pool().query(
          `INSERT INTO internal_users (id,external_provider,external_subject,display_name,email)
        VALUES ($1,'synthetic','profitability-migration','Synthetic Actor','synthetic@example.test')`,
          [scope.userId],
        );
        await seedLegacy(scope);
        await seedLegacy(otherWorkspace);
        await pool().query(
          `INSERT INTO companies
        (id,workspace_id,display_name,created_by_internal_user_id,created_by_workspace_membership_id,registration_idempotency_key)
        VALUES ($1,$2,'Synthetic other Company',$3,$4,$1::text)`,
          [
            otherCompany.companyId,
            scope.workspaceId,
            scope.userId,
            scope.membershipId,
          ],
        );
        await seedOpportunity(otherCompany);
        for (const [bundle, version] of [
          ['company_context_access', null],
          ['company_pricing_user', 'v1'],
          ['company_offer_preparer', 'v1'],
          ['company_opportunity_manager', 'v1'],
        ])
          await pool().query(
            `INSERT INTO company_role_assignments (workspace_id,company_id,workspace_membership_id,bundle,permission_set_version)
          VALUES ($1,$2,$3,$4,$5)`,
            [
              scope.workspaceId,
              scope.companyId,
              scope.membershipId,
              bundle,
              version,
            ],
          );
        await pool().query(
          `INSERT INTO activity_log_events
        (workspace_id,actor_internal_user_id,actor_workspace_membership_id,action,target_type,target_company_id,metadata,idempotency_key)
        VALUES ($1,$2,$3,'company.registered','company',$4,'{}'::jsonb,'synthetic-preserved-event')`,
          [
            scope.workspaceId,
            scope.userId,
            scope.membershipId,
            scope.companyId,
          ],
        );
        const capture = () =>
          Promise.all(
            legacyTables.map(
              async (table) =>
                (
                  await pool().query(
                    `SELECT to_jsonb(preserved_row)::text AS value FROM ${table} AS preserved_row ORDER BY id`,
                  )
                ).rows,
            ),
          );
        before = await capture();
        await migrate(connection, { migrationsFolder: resolve('drizzle') });
        after = await capture();
        initiallyEmpty = await Promise.all(
          newTables.map(
            async (table) =>
              (
                await pool().query(
                  `SELECT count(*)::int AS count FROM ${table}`,
                )
              ).rows,
          ),
        );
        await transaction(async (client) => {
          await client.query(
            `INSERT INTO profitability_estimates
          (id,workspace_id,company_id,opportunity_id,client_request_id) VALUES ($1,$2,$3,$4,$5)`,
            [
              estimateId,
              scope.workspaceId,
              scope.companyId,
              scope.opportunityId,
              scope.requestId,
            ],
          );
          await insertVersion(client);
          await client.query(
            'UPDATE profitability_estimates SET latest_version_number=1 WHERE id=$1',
            [estimateId],
          );
        });
        await pool().query(
          `INSERT INTO profitability_estimate_decisions
        (id,workspace_id,company_id,estimate_id,opportunity_id,client_request_id,version_id,version_number,code,decided_by_workspace_membership_id,decided_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,1,'MODIFY',$8,now())`,
          [
            decisionId,
            scope.workspaceId,
            scope.companyId,
            estimateId,
            scope.opportunityId,
            scope.requestId,
            versionId,
            scope.membershipId,
          ],
        );
        await pool().query(
          `INSERT INTO profitability_estimate_receipts
        (id,workspace_id,company_id,actor_workspace_membership_id,command_kind,idempotency_key,fingerprint,opportunity_id,version_id,response,created_at)
        VALUES ($1,$2,$3,$4,'create','synthetic-key','synthetic-fingerprint',$5,$6,$7::jsonb,now())`,
          [
            receiptId,
            scope.workspaceId,
            scope.companyId,
            scope.membershipId,
            scope.opportunityId,
            versionId,
            JSON.stringify({ inputs, results }),
          ],
        );
        await pool().query(
          `INSERT INTO profitability_estimate_events
        (id,workspace_id,company_id,estimate_id,version_id,version_number,opportunity_id,client_request_id,action,actor_internal_user_id,actor_workspace_membership_id,occurred_at,metadata)
        VALUES ($1,$2,$3,$4,$5,1,$6,$7,'profitability_estimate_version.created',$8,$9,now(),$10::jsonb)`,
          [
            eventId,
            scope.workspaceId,
            scope.companyId,
            estimateId,
            versionId,
            scope.opportunityId,
            scope.requestId,
            scope.userId,
            scope.membershipId,
            JSON.stringify({ estimateId, versionNumber: 1 }),
          ],
        );
      } finally {
        await rm(previous, { recursive: true, force: true });
      }
    }, 30_000);

    afterAll(async () => {
      if (database) await database.close();
    });

    it('upgrades populated 0051 without changing legacy rows or backfilling any new storage', () => {
      expect(after).toEqual(before);
      expect(initiallyEmpty).toEqual(newTables.map(() => [{ count: 0 }]));
    });

    it('freezes accepted decimal spelling and precision without conversion or recomputation', async () => {
      expect(expectedLatestVersionNumber).toBe(null);
      expect(
        (
          await pool().query(
            'SELECT inputs,results,calculation_rule FROM profitability_estimate_versions WHERE id=$1',
            [versionId],
          )
        ).rows,
      ).toEqual([{ inputs, results, calculation_rule: calculationRule }]);
    });

    it('requires captured v1 for new opt-in bundles and preserves independent grants', async () => {
      for (const bundle of [
        'company_profitability_contributor',
        'company_profitability_director',
      ]) {
        for (const version of [null, 'v2', 'unknown'])
          await expect(
            pool().query(
              `INSERT INTO company_role_assignments (workspace_id,company_id,workspace_membership_id,bundle,permission_set_version)
          VALUES ($1,$2,$3,$4,$5)`,
              [
                scope.workspaceId,
                scope.companyId,
                scope.membershipId,
                bundle,
                version,
              ],
            ),
          ).rejects.toMatchObject({ code: '23514' });
        await pool().query(
          `INSERT INTO company_role_assignments (workspace_id,company_id,workspace_membership_id,bundle,permission_set_version)
        VALUES ($1,$2,$3,$4,'v1')`,
          [scope.workspaceId, scope.companyId, scope.membershipId, bundle],
        );
      }
    });

    it('rejects duplicate Opportunity identity, version number and exact-version decision', async () => {
      await expect(
        pool().query(
          `INSERT INTO profitability_estimates (workspace_id,company_id,opportunity_id,client_request_id)
      VALUES ($1,$2,$3,$4)`,
          [
            scope.workspaceId,
            scope.companyId,
            scope.opportunityId,
            scope.requestId,
          ],
        ),
      ).rejects.toMatchObject({ code: '23505' });
      await expect(
        transaction((client) => insertVersion(client, { id: nextVersionId })),
      ).rejects.toMatchObject({ code: '23505' });
      await expect(
        pool().query(
          `INSERT INTO profitability_estimate_decisions
      (workspace_id,company_id,estimate_id,opportunity_id,client_request_id,version_id,version_number,code,decided_by_workspace_membership_id,decided_at)
      VALUES ($1,$2,$3,$4,$5,$6,1,'APPROVE',$7,now())`,
          [
            scope.workspaceId,
            scope.companyId,
            estimateId,
            scope.opportunityId,
            scope.requestId,
            versionId,
            scope.membershipId,
          ],
        ),
      ).rejects.toMatchObject({ code: '23505' });
    });

    it('rejects cross-Company/Workspace identity, version and actor references', async () => {
      await expect(
        pool().query(
          `INSERT INTO profitability_estimates (workspace_id,company_id,opportunity_id,client_request_id)
      VALUES ($1,$2,$3,$4)`,
          [
            scope.workspaceId,
            otherCompany.companyId,
            scope.opportunityId,
            scope.requestId,
          ],
        ),
      ).rejects.toMatchObject({ code: '23503' });
      for (const overrides of [
        { companyId: otherCompany.companyId },
        { workspaceId: otherWorkspace.workspaceId },
        { opportunityId: otherCompany.opportunityId },
        { clientRequestId: otherCompany.requestId },
      ])
        await expect(
          transaction((client) =>
            insertVersion(client, {
              id: nextVersionId,
              versionNumber: 2,
              predecessorVersionId: versionId,
              predecessorVersionNumber: 1,
              ...overrides,
            }),
          ),
        ).rejects.toMatchObject({ code: '23503' });
      await expect(
        pool().query(
          `INSERT INTO profitability_estimate_receipts
      (workspace_id,company_id,actor_workspace_membership_id,command_kind,idempotency_key,fingerprint,opportunity_id,version_id,response,created_at)
      VALUES ($1,$2,$3,'create','wrong-actor','fingerprint',$4,$5,'{}'::jsonb,now())`,
          [
            scope.workspaceId,
            scope.companyId,
            otherWorkspace.membershipId,
            scope.opportunityId,
            versionId,
          ],
        ),
      ).rejects.toMatchObject({ code: '23503' });
      await expect(
        pool().query(
          `INSERT INTO profitability_estimate_receipts
      (workspace_id,company_id,actor_workspace_membership_id,command_kind,idempotency_key,fingerprint,opportunity_id,version_id,response,created_at)
      VALUES ($1,$2,$3,'create','wrong-target','fingerprint',$4,$5,'{}'::jsonb,now())`,
          [
            scope.workspaceId,
            scope.companyId,
            scope.membershipId,
            otherCompany.opportunityId,
            versionId,
          ],
        ),
      ).rejects.toMatchObject({ code: '23503' });
    });

    it('refuses UPDATE and DELETE against every immutable economic record', async () => {
      for (const [table, id] of [
        ['profitability_estimate_versions', versionId],
        ['profitability_estimate_decisions', decisionId],
        ['profitability_estimate_receipts', receiptId],
        ['profitability_estimate_events', eventId],
      ]) {
        await expect(
          pool().query(`UPDATE ${table} SET id=id WHERE id=$1`, [id]),
        ).rejects.toMatchObject({ code: '23514' });
        await expect(
          pool().query(`DELETE FROM ${table} WHERE id=$1`, [id]),
        ).rejects.toMatchObject({ code: '23514' });
      }
      await expect(
        pool().query('DELETE FROM profitability_estimates WHERE id=$1', [
          estimateId,
        ]),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        pool().query(
          'UPDATE profitability_estimates SET opportunity_id=$1 WHERE id=$2',
          [otherCompany.opportunityId, estimateId],
        ),
      ).rejects.toMatchObject({ code: '23514' });
      for (const head of [0, 1, 3])
        await expect(
          pool().query(
            'UPDATE profitability_estimates SET latest_version_number=$1 WHERE id=$2',
            [head, estimateId],
          ),
        ).rejects.toMatchObject({ code: '23514' });
    });

    it('rolls back incomplete first identity, successor and head-only transactions at commit', async () => {
      await expect(
        transaction((client) =>
          client.query(
            `INSERT INTO profitability_estimates
      (id,workspace_id,company_id,opportunity_id,client_request_id) VALUES ($1,$2,$3,$4,$5)`,
            [
              orphanEstimateId,
              scope.workspaceId,
              otherCompany.companyId,
              otherCompany.opportunityId,
              otherCompany.requestId,
            ],
          ),
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        transaction((client) =>
          client.query(
            'UPDATE profitability_estimates SET latest_version_number=2 WHERE id=$1',
            [estimateId],
          ),
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        transaction((client) =>
          insertVersion(client, {
            id: nextVersionId,
            versionNumber: 2,
            predecessorVersionId: versionId,
            predecessorVersionNumber: 1,
          }),
        ),
      ).rejects.toMatchObject({ code: '23514' });
      expect(
        (
          await pool().query(
            'SELECT id,latest_version_number FROM profitability_estimates ORDER BY id',
          )
        ).rows,
      ).toEqual([{ id: estimateId, latest_version_number: 1 }]);
      expect(
        (
          await pool().query(
            'SELECT id FROM profitability_estimate_versions ORDER BY id',
          )
        ).rows,
      ).toEqual([{ id: versionId }]);
    });
  },
);
