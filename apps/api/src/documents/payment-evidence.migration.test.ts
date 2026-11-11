import { conserveFrozenPdfPolicyUpgrade } from './frozen-pdf-policy-schema.test-support.js';
import { certificationTables } from '../certification/certification-schema.test-support.js';
import {
  withoutWorkingEvidenceSchema,
  workingEvidenceExistingTableTriggers,
  workingEvidenceTables,
} from '../working-evidence/working-evidence-schema.test-support.js';
import { receivedAddendumExistingTableTriggers } from './received-addendum-schema.test-support.js';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { types } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { expect, it } from 'vitest';
import { committedMigrationTables } from '../database/committed-migration-test-support.js';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';
import {
  fixtureHash,
  fixtureObject,
  fixtureObjects,
  fixtureString,
  predecessorSnapshot,
} from './external-invoice-migration.test-support.js';
import {
  paymentPredecessorJournal,
  paymentPredecessorRuntime,
  paymentPredecessorSchema,
  paymentPredecessorSearch,
  paymentPredecessorSource,
  paymentPredecessorTables,
  paymentPredecessorTree,
  replayPaymentPredecessorCapturedReceipts,
  replayPaymentPredecessorDates,
  replayPaymentPredecessorDelivered1044,
  replayPaymentPredecessorOriginalReadsAndBytes,
  restorePaymentPredecessor,
} from './payment-evidence-predecessor.test-support.js';

const expectedProvenanceSha256 =
  '0ee896f2d8d948f2277e60982bbf17e87198ca515e2a541efcf28cad61539a3e';

function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error('A captured nonnegative integer count is required.');
  return value;
}

/** pg returns catalog name[] as its native array text; preserve the captured bytes. */
function enumLabels(value: unknown): string[] {
  // pg-types registers PostgreSQL text[] OID 1009 at runtime, although its
  // TypeId declaration names only scalar OIDs. Keep the OID numeric and the
  // parser result unknown until every array label is validated.
  const textArrayOid: number = 1009;
  const parsed: unknown =
    typeof value === 'string'
      ? types.getTypeParser(textArrayOid, 'text')(value)
      : value;
  if (!Array.isArray(parsed))
    throw new Error('The complete native enum labels are required.');
  return parsed.map(fixtureString);
}

/** Explicit reviewed changes to existing guards; all other predecessor definitions stay exact. */
const changedExistingSchema: Readonly<Record<string, readonly string[]>> = {
  constraints: [
    'company_role_assignments.company_role_assignments_permission_set_version_check',
    'working_documents.working_documents_state_check',
  ],
  functions: [
    'guard_mission_document_version_pdf()',
    'guard_document_correction_family_reference()',
    'guard_mission_document_external_reference()',
  ],
};

const addedExistingTableTriggers = [
  ...receivedAddendumExistingTableTriggers,
  ...workingEvidenceExistingTableTriggers,
  'companies.payment_company_cursor',
  'working_documents.working_documents_payment_evidence_identity',
  'working_documents.working_documents_payment_evidence_required',
  'document_version_commands.document_version_commands_payment_evidence_authority',
  'document_correction_commands.document_correction_commands_payment_evidence_authority',
];

const newEnumLabels: Readonly<Record<string, readonly string[]>> = {
  company_role_bundle: [
    'company_received_addendum_access',
    'company_payment_reader',
    'company_payment_recorder',
    'company_payment_confirmer',
    'company_payment_reverser',
    'company_payment_evidence_access',
  ],
  activity_log_action: [
    'company_received_addendum_access_assignment.granted',
    'company_received_addendum_access_assignment.revoked',
    'company_payment_reader_assignment.granted',
    'company_payment_reader_assignment.revoked',
    'company_payment_recorder_assignment.granted',
    'company_payment_recorder_assignment.revoked',
    'company_payment_confirmer_assignment.granted',
    'company_payment_confirmer_assignment.revoked',
    'company_payment_reverser_assignment.granted',
    'company_payment_reverser_assignment.revoked',
    'company_payment_evidence_access_assignment.granted',
    'company_payment_evidence_access_assignment.revoked',
  ],
};

function conserveSchema(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  tables: readonly string[],
) {
  after = withoutWorkingEvidenceSchema(
    conserveFrozenPdfPolicyUpgrade(before, after),
  );
  for (const [kind, rows] of Object.entries(before)) {
    const actual = fixtureObjects(after[kind]);
    const expected = fixtureObjects(rows);
    for (const entry of expected) {
      const name = fixtureString(entry.name);
      const current = actual.find((candidate) => candidate.name === name);
      expect(current, kind + ':' + name).toBeDefined();
      if (!current) throw new Error('An existing schema object disappeared.');
      if (kind === 'enums') {
        const oldLabels = enumLabels(entry.labels);
        const currentLabels = enumLabels(current.labels);
        expect(
          currentLabels.filter((label) => oldLabels.includes(label)),
        ).toEqual(oldLabels);
        expect(
          currentLabels.filter((label) => !oldLabels.includes(label)).sort(),
        ).toEqual([...(newEnumLabels[name] ?? [])].sort());
      } else if (!changedExistingSchema[kind]?.includes(name)) {
        expect(current, kind + ':' + name).toEqual(entry);
      } else {
        expect(current.definition, kind + ':' + name).not.toBe(
          entry.definition,
        );
      }
    }
    for (const name of changedExistingSchema[kind] ?? [])
      expect(
        expected.some((entry) => entry.name === name),
        kind + ':' + name,
      ).toBe(true);
  }
  const oldTriggers = new Set(
    fixtureObjects(before.triggers).map((trigger) =>
      fixtureString(trigger.name),
    ),
  );
  const addedToExistingTables = fixtureObjects(after.triggers)
    .map((trigger) => fixtureString(trigger.name))
    .filter(
      (name) =>
        !oldTriggers.has(name) &&
        tables.some((table) => name.startsWith(table + '.')),
    );
  expect(addedToExistingTables.sort()).toEqual(
    [...addedExistingTableTriggers].sort(),
  );
}

it.skipIf(!process.env.TEST_DATABASE_URL).each([
  {
    group: 'captured native receipts',
    replay: replayPaymentPredecessorCapturedReceipts,
  },
  {
    group: 'Date receipts and integral histories',
    replay: replayPaymentPredecessorDates,
  },
  {
    group: 'delivered 1044 Records/Offer protocols',
    replay: replayPaymentPredecessorDelivered1044,
  },
  {
    group: 'original reads/receipts and exact source bytes',
    replay: replayPaymentPredecessorOriginalReadsAndBytes,
  },
])(
  'conserves genuine populated f879 $group through additive migration twice and two real restarts without inferred Payment facts or grants',
  async ({ replay }) => {
    const baseDatabaseUrl = process.env.TEST_DATABASE_URL;
    if (!baseDatabaseUrl) throw new Error('Native PostgreSQL is required.');
    const directory = 'test-support/fixtures/payment-evidence-predecessor';
    const backup = await readFile(directory + '/predecessor-f879.sql.gz');
    const compressed = await readFile(directory + '/context.json.gz');
    const contextBytes = gunzipSync(compressed);
    const provenanceBytes = await readFile(directory + '/provenance.json');
    expect(fixtureHash(provenanceBytes)).toBe(expectedProvenanceSha256);
    const provenance = fixtureObject(
      JSON.parse(provenanceBytes.toString('utf8')),
    );
    const context = fixtureObject(JSON.parse(contextBytes.toString('utf8')));
    expect(provenance).toMatchObject({
      source: paymentPredecessorSource,
      tree: paymentPredecessorTree,
      predecessor: '0095_invoice_records',
      closedProducerBeforeDump: true,
      guardsEnabled: true,
      nativeTables: 163,
      oldCommandCount: 334,
      nativeInvoiceRecords: 4,
      backupSha256: fixtureHash(backup),
      contextSha256: fixtureHash(contextBytes),
      compressedContextSha256: fixtureHash(compressed),
      selectedSyntheticFixtureProvenance: true,
      independentRunnerAttestation: false,
    });
    expect(context.source).toBe(paymentPredecessorSource);
    expect(context.tree).toBe(paymentPredecessorTree);
    expect(context.predecessor).toBe(provenance.predecessor);
    const ancestor = fixtureObject(context.ancestor0094Conservation);
    expect(fixtureObject(ancestor.provenance)).toMatchObject({
      source: 'd608b0436288e89f3c580c8ace219f304ec9ea3a',
      predecessor: '0094_opportunity_follow_up',
      backupSha256:
        '8d536c9be84e444a6d4ba91b508a3cc611274a8600784cfbaa477c9f9d8f88ac',
    });
    expect(fixtureObjects(context.commands)).toHaveLength(21);
    expect(fixtureObjects(context.capturedCommands)).toHaveLength(94);
    expect(fixtureObjects(context.native0093Commands)).toHaveLength(145);
    expect(fixtureObjects(context.nativeDateCommands)).toHaveLength(74);
    expect(fixtureObjects(context.native1044Commands)).toHaveLength(
      count(provenance.native1044CommandCount),
    );
    expect(fixtureObjects(context.native1044Reads)).toHaveLength(
      count(provenance.native1044ReadCount),
    );
    expect(fixtureObjects(context.native1044Binaries)).toHaveLength(
      count(provenance.native1044BinaryCount),
    );
    const journal = fixtureObject(
      JSON.parse(await readFile('drizzle/meta/_journal.json', 'utf8')),
    );
    const entries = fixtureObjects(journal.entries);
    const predecessorIndex = entries.findIndex(
      (entry) => entry.tag === context.predecessor,
    );
    expect(predecessorIndex).toBe(95);
    expect(entries.length).toBeGreaterThan(predecessorIndex + 1);
    expect(
      fixtureHash(
        JSON.stringify({ ...journal, entries: entries.slice(0, 96) }, null, 2) +
          '\n',
      ),
    ).toBe(provenance.journalSha256);
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl,
      namePrefix: 'payment_upgrade_f879',
    });
    const runtime = paymentPredecessorRuntime(context);
    try {
      await restorePaymentPredecessor(database.targetPool, backup);
      const tables = await paymentPredecessorTables(database.targetPool);
      expect(tables).toHaveLength(count(provenance.nativeTables));
      const original = await predecessorSnapshot(database.targetPool, tables);
      expect(original).toEqual(context.nativeBaseline);
      expect(await paymentPredecessorSchema(database.targetPool)).toEqual(
        context.nativeSchema,
      );
      expect(fixtureHash(JSON.stringify(context.nativeSchema))).toBe(
        provenance.schemaSha256,
      );
      const counts = fixtureObject(context.nativeRowCounts);
      const hashes = fixtureObject(context.nativeRowsSha256);
      expect(counts).toEqual(provenance.nativeRowCounts);
      expect(hashes).toEqual(provenance.nativeRowsSha256);
      for (const [table, rows] of Object.entries(original)) {
        expect(fixtureObjects(rows).length, table).toBe(counts[table]);
        expect(fixtureHash(JSON.stringify(rows)), table).toBe(hashes[table]);
      }
      for (const [table, rows] of Object.entries(
        fixtureObject(ancestor.nativeBaseline),
      ))
        for (const row of fixtureObjects(rows))
          expect(fixtureObjects(original[table]), table).toContainEqual(row);
      const previousJournal = await paymentPredecessorJournal(
        database.targetPool,
      );
      expect(previousJournal).toEqual(context.nativeJournal);
      expect(previousJournal).toHaveLength(96);
      for (let index = 0; index <= predecessorIndex; index++) {
        const entry = entries[index];
        if (!entry)
          throw new Error('A committed predecessor migration is required.');
        expect(previousJournal[index]?.hash, fixtureString(entry.tag)).toBe(
          fixtureHash(
            await readFile('drizzle/' + fixtureString(entry.tag) + '.sql'),
          ),
        );
      }
      for (let application = 0; application < 2; application++) {
        await migrate(drizzle(database.targetPool), {
          migrationsFolder: resolve('drizzle'),
        });
        expect(await predecessorSnapshot(database.targetPool, tables)).toEqual(
          original,
        );
        const applied = await paymentPredecessorJournal(database.targetPool);
        expect(applied).toHaveLength(entries.length);
        expect(applied.slice(0, previousJournal.length)).toEqual(
          previousJournal,
        );
        for (
          let index = previousJournal.length;
          index < entries.length;
          index++
        ) {
          const entry = entries[index];
          if (!entry)
            throw new Error('A committed additive migration is required.');
          expect(applied[index]?.hash).toBe(
            fixtureHash(
              await readFile('drizzle/' + fixtureString(entry.tag) + '.sql'),
            ),
          );
        }
        conserveSchema(
          fixtureObject(context.nativeSchema),
          await paymentPredecessorSchema(database.targetPool),
          tables,
        );
      }
      const actualTables = await paymentPredecessorTables(database.targetPool);
      expect(actualTables).toEqual(await committedMigrationTables(entries));
      expect(actualTables.filter((table) => !tables.includes(table))).toEqual([
        ...certificationTables,
        'payment_commands',
        'payment_cursor_keys',
        'payment_events',
        'payment_evidence_document_sources',
        'payment_history',
        'payments',
        'received_addendum_document_relations',
        ...workingEvidenceTables,
      ]);
      async function noInferredPayment() {
        expect(
          (
            await database.targetPool.query<{ count: number }>(
              'SELECT count(*)::int AS count FROM payment_evidence_document_sources',
            )
          ).rows,
        ).toEqual([{ count: 0 }]);
        expect(
          (
            await database.targetPool.query<{ count: number }>(
              `SELECT count(*)::int AS count FROM company_role_assignments
           WHERE bundle::text IN ('company_payment_reader','company_payment_recorder',
           'company_payment_confirmer','company_payment_reverser','company_payment_evidence_access')`,
            )
          ).rows,
        ).toEqual([{ count: 0 }]);
      }
      const upgradedJournal = await paymentPredecessorJournal(
        database.targetPool,
      );
      let expected = original;
      for (let restart = 0; restart < 3; restart++) {
        await runtime.open(database.targetUrl);
        expect(await paymentPredecessorJournal(database.targetPool)).toEqual(
          upgradedJournal,
        );
        expect(await predecessorSnapshot(database.targetPool, tables)).toEqual(
          expected,
        );
        await noInferredPayment();
        await replay({ context, runtime });
        expect(await predecessorSnapshot(database.targetPool, tables)).toEqual(
          expected,
        );
        expected = await paymentPredecessorSearch({
          pool: database.targetPool,
          tables,
          before: expected,
          context,
          runtime,
        });
        await noInferredPayment();
        await runtime.close();
      }
      expect(fixtureObjects(expected.knowledge_interactions)).toHaveLength(
        fixtureObjects(original.knowledge_interactions).length + 3,
      );
    } finally {
      try {
        await runtime.close();
      } finally {
        await database.close();
      }
    }
  },
  120_000,
);
