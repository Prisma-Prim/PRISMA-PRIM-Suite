import { randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { describe, expect, it } from 'vitest';
import {
  createIsolatedPostgresTestDatabase,
  type IsolatedPostgresTestDatabase,
} from '../database/isolated-postgres-test-database.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;
const CURRENT_SHAPE_MIGRATION = '_certification_payloads_current_shape';
const STEPS_REFUSAL =
  'certification_step_versions holds a step recorded in an earlier shape; the development database must be recreated.';
const RECEIPTS_REFUSAL =
  'certification_receipts holds a Case receipt recorded before exchange pagination or the Certificate release; the development database must be recreated.';

const CONFIRMED = {
  noConsultancy: 'confirmed',
  noEmployment: 'confirmed',
  noManagementInvolvement: 'confirmed',
  confidentiality: 'confirmed',
};
const application = {
  submittedOn: null,
  declaredLegalName: 'Lactis Demo SRL',
  declaredAddress: 'Str. Exemplu 1, Demo City',
  sites: [{ address: 'Str. Exemplu 1, Demo City', activity: 'Milk' }],
  requestedScope: 'Production of milk',
  foodChainSubcategories: ['CI'],
  haccpStudyCount: 2,
  totalHeadcount: 40,
  effectiveFte: 40,
  shiftCount: 1,
  seasonalActivity: null,
  otherCertifiedSystems: null,
  outsourcedProcesses: null,
  consultant: { used: false },
  auditLanguages: ['ro'],
  preferredAuditPeriod: null,
};
const team = {
  members: [
    {
      name: 'Auditor Demo',
      role: 'team_leader',
      workspaceMembershipId: null,
      holdsCategory: true,
      competenceNote: 'ISO 22000 lead auditor, category C',
      declarations: CONFIRMED,
      conflictNote: null,
    },
  ],
  impartialityAnalysis: null,
};
const teamDecision = {
  teamVersion: 1,
  decision: 'approved',
  reason: null,
  onBehalf: null,
  independenceAttested: true,
};
const dossierReview = {
  items: { application: { answer: 'present', note: null } },
  conclusion: 'Complete',
  reviewedBy: null,
  approvedBy: null,
  independenceAttested: true,
};
const caseRead = {
  id: randomUUID(),
  revision: 2,
  release: {
    revisions: [],
    currentRevisionIndex: null,
    revisionRequired: false,
    validity: null,
    drafts: [],
  },
  exchanges: { records: [], total: 0, nextCursor: null, sendings: [] },
};

type StoredRow =
  | { table: 'step'; step: string; payload: unknown }
  | { table: 'receipt'; response: unknown };

withPostgres('Certification payload current-shape migration', () => {
  it.each([
    [
      'an application recorded before its date',
      {
        table: 'step',
        step: 'application',
        payload: without(application, ['submittedOn']),
      },
      STEPS_REFUSAL,
    ],
    [
      'an audit team with first-format boolean declarations',
      {
        table: 'step',
        step: 'team',
        payload: {
          ...team,
          members: team.members.map((member) => ({
            ...member,
            declarations: { ...CONFIRMED, noConsultancy: true },
          })),
        },
      },
      STEPS_REFUSAL,
    ],
    [
      'a team decision recorded before the attestation',
      {
        table: 'step',
        step: 'team_decision',
        payload: without(teamDecision, ['independenceAttested']),
      },
      STEPS_REFUSAL,
    ],
    [
      'a dossier review recorded before the attestation',
      {
        table: 'step',
        step: 'dossier_review',
        payload: without(dossierReview, ['independenceAttested']),
      },
      STEPS_REFUSAL,
    ],
    [
      'a dossier review read as not attested',
      {
        table: 'step',
        step: 'dossier_review',
        payload: { ...dossierReview, independenceAttested: false },
      },
      STEPS_REFUSAL,
    ],
    [
      'a Case receipt recorded before exchange pagination',
      {
        table: 'receipt',
        response: {
          ...caseRead,
          exchanges: without(caseRead.exchanges, ['nextCursor', 'sendings']),
        },
      },
      RECEIPTS_REFUSAL,
    ],
    [
      'a Case receipt recorded before the Certificate release',
      { table: 'receipt', response: without(caseRead, ['release']) },
      RECEIPTS_REFUSAL,
    ],
    [
      'a Case receipt whose release has no validity',
      {
        table: 'receipt',
        response: {
          ...caseRead,
          release: without(caseRead.release, ['validity']),
        },
      },
      RECEIPTS_REFUSAL,
    ],
  ] satisfies [string, StoredRow, string][])(
    'refuses %s and asks to recreate the development database',
    async (_name, row, message) => {
      await withPreviousSchema(
        'certification1370_refused',
        async (database) => {
          await insert(database, row);
          const stored = await storedRows(database);
          const applied = await appliedMigrations(database);
          const refusal = raisedError(
            await migrate(drizzle(database.targetPool), {
              migrationsFolder: resolve('drizzle'),
            }).then(
              () => undefined,
              (error: unknown) => error,
            ),
          );
          expect(refusal).toEqual({ code: 'P0001', message });
          expect(await appliedMigrations(database)).toBe(applied);
          expect(await storedRows(database)).toEqual(stored);
        },
      );
    },
    60_000,
  );

  it('applies over current-shape steps and receipts and leaves them byte-identical', async () => {
    await withPreviousSchema('certification1370_current', async (database) => {
      for (const row of [
        { table: 'step', step: 'application', payload: application },
        {
          table: 'step',
          step: 'application',
          payload: { ...application, submittedOn: '2026-10-01' },
        },
        {
          table: 'step',
          step: 'team',
          payload: {
            ...team,
            members: team.members.map((member) => ({
              ...member,
              declarations: { ...CONFIRMED, noConsultancy: 'to_verify' },
              conflictNote: 'Fictional link to verify.',
            })),
          },
        },
        { table: 'step', step: 'team_decision', payload: teamDecision },
        { table: 'step', step: 'dossier_review', payload: dossierReview },
        {
          table: 'step',
          step: 'recommendation',
          payload: {
            recommendation: 'grant',
            basis: 'Fictional',
            recommendedOn: null,
          },
        },
        { table: 'receipt', response: caseRead },
        {
          table: 'receipt',
          response: {
            ...caseRead,
            exchanges: { ...caseRead.exchanges, nextCursor: 'next-page' },
          },
        },
      ] satisfies StoredRow[])
        await insert(database, row);
      const stored = await storedRows(database);
      const applied = await appliedMigrations(database);
      await migrate(drizzle(database.targetPool), {
        migrationsFolder: resolve('drizzle'),
      });
      expect(await appliedMigrations(database)).toBe((applied ?? 0) + 1);
      expect(await storedRows(database)).toEqual(stored);
      expect(stored.steps).toHaveLength(6);
      expect(stored.receipts).toHaveLength(2);
    });
  }, 60_000);
});

/**
 * Runs `test` on an isolated database migrated up to, but excluding, the
 * current-shape migration. The Case and actor references do not matter to the
 * stored JSON, so the database drops them instead of building those records.
 */
async function withPreviousSchema(
  namePrefix: string,
  test: (database: IsolatedPostgresTestDatabase) => Promise<void>,
) {
  if (!databaseUrl) throw new Error('TEST_DATABASE_URL required');
  const database = await createIsolatedPostgresTestDatabase({
    baseDatabaseUrl: databaseUrl,
    namePrefix,
  });
  let previous: string | undefined;
  try {
    previous = await mkdtemp(join(tmpdir(), 'certification1370-previous-'));
    const directory = resolve('drizzle');
    const journal = object(
      JSON.parse(
        await readFile(join(directory, 'meta', '_journal.json'), 'utf8'),
      ),
    );
    if (!Array.isArray(journal.entries))
      throw new Error('Journal entries required');
    const entries = journal.entries.map((entry: unknown) => object(entry));
    const index = entries.findIndex(
      (entry) =>
        typeof entry.tag === 'string' &&
        entry.tag.endsWith(CURRENT_SHAPE_MIGRATION),
    );
    expect(index).toBeGreaterThan(0);
    const old = entries.slice(0, index);
    await mkdir(join(previous, 'meta'));
    await writeFile(
      join(previous, 'meta', '_journal.json'),
      JSON.stringify({ ...journal, entries: old }),
    );
    for (const entry of old) {
      if (typeof entry.tag !== 'string') throw new Error('Tag required');
      await cp(
        join(directory, `${entry.tag}.sql`),
        join(previous, `${entry.tag}.sql`),
      );
    }
    await migrate(drizzle(database.targetPool), { migrationsFolder: previous });
    await database.targetPool.query(
      'ALTER TABLE certification_step_versions DROP CONSTRAINT certification_step_versions_case_fk, DROP CONSTRAINT certification_step_versions_actor_fk',
    );
    await database.targetPool.query(
      'ALTER TABLE certification_receipts DROP CONSTRAINT certification_receipts_case_fk, DROP CONSTRAINT certification_receipts_actor_fk',
    );
    await test(database);
  } finally {
    await database.close();
    if (previous) await rm(previous, { recursive: true, force: true });
  }
}

async function insert(database: IsolatedPostgresTestDatabase, row: StoredRow) {
  if (row.table === 'step')
    await database.targetPool.query(
      `INSERT INTO certification_step_versions (workspace_id, company_id, case_id, step, version, case_revision, payload, actor_membership_id, actor_internal_user_id, actor_display_name, recorded_at) VALUES ($1,$2,$3,$4,1,2,$5,$6,$7,'Fictional manager','2026-11-07T08:00:00Z')`,
      [
        randomUUID(),
        randomUUID(),
        randomUUID(),
        row.step,
        JSON.stringify(row.payload),
        randomUUID(),
        randomUUID(),
      ],
    );
  else
    await database.targetPool.query(
      `INSERT INTO certification_receipts (workspace_id, company_id, actor_membership_id, command_kind, idempotency_key, fingerprint, case_id, response, recorded_at) VALUES ($1,$2,$3,'application',$4,'fingerprint',$5,$6,'2026-11-07T08:00:00Z')`,
      [
        randomUUID(),
        randomUUID(),
        randomUUID(),
        randomUUID(),
        randomUUID(),
        JSON.stringify(row.response),
      ],
    );
}

/** Text renderings compare the stored steps and receipts exactly. */
async function storedRows(database: IsolatedPostgresTestDatabase) {
  const steps = await database.targetPool.query<{ payload: string }>(
    'SELECT payload::text AS payload FROM certification_step_versions ORDER BY payload::text',
  );
  const receipts = await database.targetPool.query<{ response: string }>(
    'SELECT response::text AS response FROM certification_receipts ORDER BY response::text',
  );
  return {
    steps: steps.rows.map((row) => row.payload),
    receipts: receipts.rows.map((row) => row.response),
  };
}

async function appliedMigrations(database: IsolatedPostgresTestDatabase) {
  const result = await database.targetPool.query<{ total: number }>(
    'SELECT count(*)::int AS total FROM drizzle.__drizzle_migrations',
  );
  return result.rows[0]?.total;
}

/** The PostgreSQL error the migration raised, under the driver's wrapper. */
function raisedError(error: unknown): { code: unknown; message: unknown } {
  let current = error;
  while (current instanceof Error) {
    if ('code' in current && typeof current.code === 'string')
      return { code: current.code, message: current.message };
    current = current.cause;
  }
  throw new Error('Expected the migration to raise a PostgreSQL error.');
}

/** The same stored JSON as an earlier application wrote it, without later keys. */
function without(value: object, keys: readonly string[]) {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !keys.includes(key)),
  );
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Object required');
  return Object.fromEntries(Object.entries(value));
}
