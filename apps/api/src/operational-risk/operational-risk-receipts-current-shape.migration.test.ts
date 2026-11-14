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
const CURRENT_SHAPE_MIGRATION = '_operational_risk_receipts_current_shape';
const RECEIPTS_REFUSAL =
  'operational_risk_receipts holds a Risk receipt recorded in an earlier schema; the development database must be recreated.';
const ENTRIES_REFUSAL =
  'operational_risk_entries holds a Risk intake recorded in an earlier schema; the development database must be recreated.';
const scope = {
  workspaceId: randomUUID(),
  companyId: randomUUID(),
  riskId: randomUUID(),
  internalUserId: randomUUID(),
};
const recordedAt = '2026-11-14T08:00:00.000Z';
const actor = {
  workspaceMembershipId: randomUUID(),
  displayName: 'Fictional recorder',
};
const facts = {
  process: 'Fictional dispatch process',
  cause: 'Fictional cause',
  effect: 'Fictional effect',
  plannedMeasure: 'Fictional measure',
  existingMeasures: null,
  sourceDescription: null,
  plannedDate: null,
};
const intake = {
  id: randomUUID(),
  revision: 1,
  kind: 'intake-recorded',
  facts,
  predecessorId: null,
  reason: null,
  actor,
  recordedAt,
};
const observation = {
  id: randomUUID(),
  revision: 2,
  kind: 'observation',
  narrative: 'Fictional observation',
  occurredOn: '2026-11-13',
  actor,
  recordedAt,
};
const correction = {
  id: randomUUID(),
  revision: 3,
  kind: 'intake-corrected',
  facts: { ...facts, cause: 'Corrected fictional cause' },
  predecessorId: intake.id,
  reason: 'Checked source',
  actor,
  recordedAt,
};
const journalCorrection = {
  id: randomUUID(),
  revision: 4,
  kind: 'journal-corrected',
  originalEntryId: observation.id,
  journalKind: 'observation',
  predecessorId: observation.id,
  narrative: 'Corrected fictional observation',
  occurredOn: null,
  reason: 'New source',
  actor,
  recordedAt,
};
const risk = (revision: number, currentIntake: object) => ({
  id: scope.riskId,
  companyId: scope.companyId,
  revision,
  assessment: 'not-assessed',
  responsibility: 'not-specified',
  createdAt: recordedAt,
  originalIntake: intake,
  currentIntake,
});
const responses = {
  record: { risk: risk(1, intake), entry: intake },
  journal: { risk: risk(2, intake), entry: observation },
  correct: { risk: risk(3, correction), entry: correction },
  'journal-correct': { risk: risk(4, correction), entry: journalCorrection },
};
const undatedIntake = { ...intake, facts: without(facts, ['plannedDate']) };

type CommandKind = keyof typeof responses;
type StoredRow =
  | {
      table: 'operational_risk_receipts';
      commandKind: CommandKind;
      response: unknown;
    }
  | {
      table: 'operational_risk_entries';
      id: string;
      revision: number;
      kind: string;
      predecessorId: string | null;
      payload: unknown;
    };

const receipt = (commandKind: CommandKind, response: unknown): StoredRow => ({
  table: 'operational_risk_receipts',
  commandKind,
  response,
});
const entryRow = (
  entry: {
    id: string;
    revision: number;
    kind: string;
    predecessorId?: string | null;
  },
  payload: unknown,
): StoredRow => ({
  table: 'operational_risk_entries',
  id: entry.id,
  revision: entry.revision,
  kind: entry.kind,
  predecessorId: entry.predecessorId ?? null,
  payload,
});

withPostgres('Operational Risk receipt current-schema migration', () => {
  it.each([
    [
      'a Risk recorded before its assessment and responsibility',
      receipt('record', {
        ...responses.record,
        risk: without(responses.record.risk, ['assessment', 'responsibility']),
      }),
      RECEIPTS_REFUSAL,
    ],
    [
      'an intake whose facts lack an optional fact',
      receipt('record', {
        risk: {
          ...risk(1, undatedIntake),
          originalIntake: undatedIntake,
        },
        entry: undatedIntake,
      }),
      RECEIPTS_REFUSAL,
    ],
    [
      'a follow-up recorded without its date',
      receipt('journal', {
        ...responses.journal,
        entry: without(observation, ['occurredOn']),
      }),
      RECEIPTS_REFUSAL,
    ],
    [
      'an intake correction without its author snapshot',
      receipt('correct', {
        ...responses.correct,
        entry: without(correction, ['actor']),
      }),
      RECEIPTS_REFUSAL,
    ],
    [
      'a journal correction without its journal kind',
      receipt('journal-correct', {
        ...responses['journal-correct'],
        entry: without(journalCorrection, ['journalKind']),
      }),
      RECEIPTS_REFUSAL,
    ],
    [
      'an entry other than the one its command records',
      receipt('journal', { ...responses.journal, entry: intake }),
      RECEIPTS_REFUSAL,
    ],
    [
      'a receipt with a key outside the current schema',
      receipt('record', { ...responses.record, schema: 'risk/v0' }),
      RECEIPTS_REFUSAL,
    ],
    [
      'an intake entry whose facts lack an optional fact',
      entryRow(intake, { facts: without(facts, ['plannedDate']) }),
      ENTRIES_REFUSAL,
    ],
  ] satisfies [string, StoredRow, string][])(
    'refuses %s and asks to recreate the development database',
    async (_name, row, message) => {
      await withPreviousSchema('risk1371_refused', async (database) => {
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
      });
    },
    60_000,
  );

  it('applies over current-schema receipts of every command kind and intake entries, leaving them byte-identical', async () => {
    await withPreviousSchema('risk1371_current', async (database, through) => {
      for (const row of [
        ...Object.entries(responses).map(([commandKind, response]) =>
          receipt(commandKindOf(commandKind), response),
        ),
        entryRow(intake, { facts }),
        entryRow(observation, {
          narrative: observation.narrative,
          occurredOn: observation.occurredOn,
        }),
        entryRow(correction, {
          facts: correction.facts,
          reason: correction.reason,
        }),
      ])
        await insert(database, row);
      const stored = await storedRows(database);
      const applied = await appliedMigrations(database);
      await migrate(drizzle(database.targetPool), {
        migrationsFolder: through,
      });
      expect(await appliedMigrations(database)).toBe((applied ?? 0) + 1);
      expect(await storedRows(database)).toEqual(stored);
      expect(stored.receipts).toHaveLength(4);
      expect(stored.entries).toHaveLength(3);
    });
  }, 60_000);
});

/**
 * Runs `test` on an isolated database migrated up to, but excluding, the
 * current-schema migration; `through` holds the migrations up to and including
 * it, so a later migration never changes what the test proves. The Risk, Company
 * and actor references do not matter to the stored JSON, so the database drops
 * them instead of building those records.
 */
async function withPreviousSchema(
  namePrefix: string,
  test: (
    database: IsolatedPostgresTestDatabase,
    through: string,
  ) => Promise<void>,
) {
  if (!databaseUrl) throw new Error('TEST_DATABASE_URL required');
  const database = await createIsolatedPostgresTestDatabase({
    baseDatabaseUrl: databaseUrl,
    namePrefix,
  });
  let previous: string | undefined;
  let through: string | undefined;
  try {
    previous = await mkdtemp(join(tmpdir(), 'risk1371-previous-'));
    through = await mkdtemp(join(tmpdir(), 'risk1371-through-'));
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
    for (const [folder, kept] of [
      [previous, entries.slice(0, index)],
      [through, entries.slice(0, index + 1)],
    ] as const) {
      await mkdir(join(folder, 'meta'));
      await writeFile(
        join(folder, 'meta', '_journal.json'),
        JSON.stringify({ ...journal, entries: kept }),
      );
      for (const entry of kept) {
        if (typeof entry.tag !== 'string') throw new Error('Tag required');
        await cp(
          join(directory, `${entry.tag}.sql`),
          join(folder, `${entry.tag}.sql`),
        );
      }
    }
    await migrate(drizzle(database.targetPool), { migrationsFolder: previous });
    await database.targetPool.query(
      'ALTER TABLE operational_risk_receipts DROP CONSTRAINT operational_risk_receipts_risk_fk, DROP CONSTRAINT operational_risk_receipts_actor_fk',
    );
    await database.targetPool.query(
      'ALTER TABLE operational_risk_entries DROP CONSTRAINT operational_risk_entries_risk_fk, DROP CONSTRAINT operational_risk_entries_actor_fk',
    );
    await test(database, through);
  } finally {
    await database.close();
    for (const folder of [previous, through])
      if (folder) await rm(folder, { recursive: true, force: true });
  }
}

async function insert(database: IsolatedPostgresTestDatabase, row: StoredRow) {
  if (row.table === 'operational_risk_receipts')
    await database.targetPool.query(
      'INSERT INTO operational_risk_receipts (workspace_id, company_id, actor_membership_id, command_kind, idempotency_key, fingerprint, risk_id, response, recorded_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [
        scope.workspaceId,
        scope.companyId,
        actor.workspaceMembershipId,
        row.commandKind,
        randomUUID(),
        'f'.repeat(64),
        scope.riskId,
        JSON.stringify(row.response),
        recordedAt,
      ],
    );
  else
    await database.targetPool.query(
      'INSERT INTO operational_risk_entries (id, workspace_id, company_id, risk_id, revision, kind, predecessor_id, predecessor_revision, payload, actor_internal_user_id, actor_membership_id, actor_display_name, recorded_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
      [
        row.id,
        scope.workspaceId,
        scope.companyId,
        scope.riskId,
        row.revision,
        row.kind,
        row.predecessorId,
        row.predecessorId === null ? null : intake.revision,
        JSON.stringify(row.payload),
        scope.internalUserId,
        actor.workspaceMembershipId,
        actor.displayName,
        recordedAt,
      ],
    );
}

/** Text renderings compare the stored receipts and entries exactly. */
async function storedRows(database: IsolatedPostgresTestDatabase) {
  const receipts = await database.targetPool.query<{ response: string }>(
    'SELECT response::text AS response FROM operational_risk_receipts ORDER BY response::text',
  );
  const entries = await database.targetPool.query<{ payload: string }>(
    'SELECT payload::text AS payload FROM operational_risk_entries ORDER BY payload::text',
  );
  return {
    receipts: receipts.rows.map((row) => row.response),
    entries: entries.rows.map((row) => row.payload),
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

function commandKindOf(value: string): CommandKind {
  if (
    value === 'record' ||
    value === 'journal' ||
    value === 'correct' ||
    value === 'journal-correct'
  )
    return value;
  throw new Error('Unknown command kind');
}

/** The same stored JSON in an earlier schema, without later keys. */
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
