import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { describe, expect, it } from 'vitest';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const workspaceId = '00000000-0000-4000-8000-000000962100';
const companyId = '00000000-0000-4000-8000-000000962101';
const userId = '00000000-0000-4000-8000-000000962102';
const membershipId = '00000000-0000-4000-8000-000000962103';
const riskId = '00000000-0000-4000-8000-000000962104';
const ids = [105, 106, 107, 108].map(
  (suffix) => `00000000-0000-4000-8000-000000962${suffix}`,
);
const recordedAt = '2026-10-28T12:00:00.000Z';
const facts = {
  process: 'Preserved process Î Ж <literal>',
  cause: 'Cause',
  effect: 'Effect',
  plannedMeasure: 'Measure',
  existingMeasures: null,
  sourceDescription: null,
  plannedDate: null,
};
const actor = {
  workspaceMembershipId: membershipId,
  displayName: 'Preserved original author',
};

// This fixture is deliberately populated under the actual predecessor schema.
// Its literal old response shapes are preserved and publicly replayed unchanged.
describe.skipIf(!databaseUrl)(
  'Operational Risk journal genuine upgrade',
  () => {
    it('preserves populated 0086 rows, bytes, three legacy receipt kinds and grants, then corrects an old original through REST', async () => {
      if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
      const database = await createIsolatedPostgresTestDatabase({
        baseDatabaseUrl: databaseUrl,
        namePrefix: 'risk962_upgrade',
      });
      const previous = await mkdtemp(join(tmpdir(), 'prisma-risk962-upgrade-'));
      let harness: PostgresRestTestHarness | undefined;
      try {
        const journal = object(
          JSON.parse(await readFile('drizzle/meta/_journal.json', 'utf8')),
        );
        if (!Array.isArray(journal.entries))
          throw new Error('Invalid migration journal.');
        const entries = journal.entries;
        const tags = entries.map((value) => {
          const tag = object(value).tag;
          if (typeof tag !== 'string' || !/^\d{4}_[a-z0-9_-]+$/u.test(tag))
            throw new Error('Invalid migration tag.');
          return tag;
        });
        const index = tags.indexOf('0087_operational_risk_journal_corrections');
        expect(tags[index - 1]).toBe('0086_company_mission_plans');
        expect(index).toBe(tags.length - 1);
        await mkdir(join(previous, 'meta'));
        await writeFile(
          join(previous, 'meta/_journal.json'),
          JSON.stringify({ ...journal, entries: entries.slice(0, index) }),
        );
        for (const tag of tags.slice(0, index))
          await cp(join('drizzle', `${tag}.sql`), join(previous, `${tag}.sql`));
        const snapshot = object(
          JSON.parse(await readFile('drizzle/meta/0086_snapshot.json', 'utf8')),
        );
        const tables = Object.keys(object(snapshot.tables))
          .map((name) => {
            if (!/^public\.[a-z_]+$/u.test(name))
              throw new Error('Invalid predecessor table.');
            return name.slice(7);
          })
          .sort();
        const connection = drizzle(database.targetPool);
        await migrate(connection, { migrationsFolder: previous });
        const pool = database.targetPool;
        await pool.query(
          "INSERT INTO workspaces(id,name) VALUES($1,'Synthetic journal upgrade Workspace')",
          [workspaceId],
        );
        await pool.query(
          "INSERT INTO internal_users(id,external_provider,external_subject,display_name,email) VALUES($1,'deterministic-test','upgrade-recorder','Preserved original author','upgrade@example.test')",
          [userId],
        );
        await pool.query(
          'INSERT INTO workspace_memberships(id,workspace_id,internal_user_id) VALUES($1,$2,$3)',
          [membershipId, workspaceId, userId],
        );
        await pool.query(
          "INSERT INTO companies(id,workspace_id,display_name,created_by_internal_user_id,created_by_workspace_membership_id,registration_idempotency_key) VALUES($1,$2,'Preserved Company',$3,$4,'upgrade-company')",
          [companyId, workspaceId, userId, membershipId],
        );
        for (const [bundle, version] of [
          ['company_context_access', null],
          ['company_operational_risk_reader', 'v1'],
          ['company_operational_risk_recorder', 'v1'],
          ['company_ideas_reader', 'v1'],
        ])
          await pool.query(
            'INSERT INTO company_role_assignments(workspace_id,company_id,workspace_membership_id,bundle,permission_set_version) VALUES($1,$2,$3,$4,$5)',
            [workspaceId, companyId, membershipId, bundle, version],
          );
        await pool.query(
          "INSERT INTO company_role_assignments(workspace_id,company_id,workspace_membership_id,bundle,permission_set_version,revoked_at) VALUES($1,$2,$3,'company_operational_risk_recorder','v1',now())",
          [workspaceId, companyId, membershipId],
        );
        const inactiveUser = '00000000-0000-4000-8000-000000962120';
        const inactiveMember = '00000000-0000-4000-8000-000000962121';
        await pool.query(
          "INSERT INTO internal_users(id,external_provider,external_subject,display_name,email,status) VALUES($1,'deterministic-test','upgrade-inactive','Inactive historical actor','inactive@example.test','inactive')",
          [inactiveUser],
        );
        await pool.query(
          "INSERT INTO workspace_memberships(id,workspace_id,internal_user_id,status) VALUES($1,$2,$3,'inactive')",
          [inactiveMember, workspaceId, inactiveUser],
        );
        await pool.query(
          "INSERT INTO company_role_assignments(workspace_id,company_id,workspace_membership_id,bundle,permission_set_version) VALUES($1,$2,$3,'company_operational_risk_reader','v1')",
          [workspaceId, companyId, inactiveMember],
        );
        await pool.query(
          "INSERT INTO ideas(workspace_id,company_id,description,origin,revision,disposition,actor_membership_id,actor_internal_user_id,actor_display_name,submitted_at) VALUES($1,$2,'Unrelated preserved Idea Î Ж','Synthetic predecessor source',1,'new',$3,$4,'Preserved original author',$5)",
          [workspaceId, companyId, membershipId, userId, recordedAt],
        );
        const [intakeId, observationId, reassessmentId, correctionId] = ids;
        if (!intakeId || !observationId || !reassessmentId || !correctionId)
          throw new Error('Missing synthetic entry identity.');
        const intake = {
          id: intakeId,
          revision: 1,
          kind: 'intake-recorded',
          facts,
          predecessorId: null,
          reason: null,
          actor,
          recordedAt,
        };
        const observation = {
          id: observationId,
          revision: 2,
          kind: 'observation',
          narrative: 'Preserved observation Î Ж <literal>',
          occurredOn: '2024-02-29',
          actor,
          recordedAt,
        };
        const reassessment = {
          id: reassessmentId,
          revision: 3,
          kind: 'reassessment',
          narrative: 'Preserved narrative reassessment',
          occurredOn: null,
          actor,
          recordedAt,
        };
        const correctedFacts = {
          ...facts,
          cause: 'Preserved motivated correction',
        };
        const correction = {
          id: correctionId,
          revision: 4,
          kind: 'intake-corrected',
          facts: correctedFacts,
          predecessorId: intakeId,
          reason: 'Preserved reason',
          actor,
          recordedAt,
        };
        const risk = {
          id: riskId,
          companyId,
          revision: 1,
          assessment: 'not-assessed',
          responsibility: 'not-specified',
          createdAt: recordedAt,
          originalIntake: intake,
          currentIntake: intake,
        };
        const receipts = [
          {
            kind: 'record',
            path: '/operational-risks',
            body: facts,
            result: { risk, entry: intake },
          },
          {
            kind: 'journal',
            path: `/operational-risks/${riskId}/journal`,
            body: {
              expectedRevision: 1,
              kind: 'observation',
              narrative: observation.narrative,
              occurredOn: observation.occurredOn,
            },
            result: { risk: { ...risk, revision: 2 }, entry: observation },
          },
          {
            kind: 'journal',
            path: `/operational-risks/${riskId}/journal`,
            body: {
              expectedRevision: 2,
              kind: 'reassessment',
              narrative: reassessment.narrative,
              occurredOn: null,
            },
            result: { risk: { ...risk, revision: 3 }, entry: reassessment },
          },
          {
            kind: 'correct',
            path: `/operational-risks/${riskId}/intake-corrections`,
            body: {
              ...correctedFacts,
              expectedRevision: 3,
              predecessorId: intakeId,
              reason: correction.reason,
            },
            result: {
              risk: { ...risk, revision: 4, currentIntake: correction },
              entry: correction,
            },
          },
        ];
        const transaction = await pool.connect();
        try {
          await transaction.query('BEGIN');
          await transaction.query(
            'INSERT INTO operational_risks(id,workspace_id,company_id,revision,current_intake_revision,created_at) VALUES($1,$2,$3,4,4,$4)',
            [riskId, workspaceId, companyId, recordedAt],
          );
          for (const entry of [intake, observation, reassessment, correction]) {
            const payload =
              'facts' in entry
                ? entry.kind === 'intake-recorded'
                  ? { facts: entry.facts }
                  : { facts: entry.facts, reason: entry.reason }
                : { narrative: entry.narrative, occurredOn: entry.occurredOn };
            await transaction.query(
              'INSERT INTO operational_risk_entries(id,workspace_id,company_id,risk_id,revision,kind,predecessor_id,predecessor_revision,payload,actor_internal_user_id,actor_membership_id,actor_display_name,recorded_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
              [
                entry.id,
                workspaceId,
                companyId,
                riskId,
                entry.revision,
                entry.kind,
                entry.kind === 'intake-corrected' ? intakeId : null,
                entry.kind === 'intake-corrected' ? 1 : null,
                JSON.stringify(payload),
                userId,
                membershipId,
                actor.displayName,
                recordedAt,
              ],
            );
            const journalKind =
              entry.kind === 'observation' || entry.kind === 'reassessment'
                ? entry.kind
                : undefined;
            await transaction.query(
              'INSERT INTO operational_risk_events(workspace_id,company_id,risk_id,entry_id,revision,action,actor_internal_user_id,actor_membership_id,recorded_at,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
              [
                workspaceId,
                companyId,
                riskId,
                entry.id,
                entry.revision,
                journalKind
                  ? 'operational_risk.journal.recorded'
                  : entry.kind === 'intake-recorded'
                    ? 'operational_risk.recorded'
                    : 'operational_risk.intake.corrected',
                userId,
                membershipId,
                recordedAt,
                JSON.stringify(
                  journalKind
                    ? { revision: entry.revision, kind: journalKind }
                    : { revision: entry.revision },
                ),
              ],
            );
          }
          for (const [index, receipt] of receipts.entries()) {
            const input =
              receipt.kind === 'record'
                ? { body: receipt.body }
                : { riskId, body: receipt.body };
            const fingerprint = createHash('sha256')
              .update(stable(input))
              .digest('hex');
            await transaction.query(
              'INSERT INTO operational_risk_receipts(workspace_id,company_id,actor_membership_id,command_kind,idempotency_key,fingerprint,risk_id,response,recorded_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
              [
                workspaceId,
                companyId,
                membershipId,
                receipt.kind,
                `legacy-${index}`,
                fingerprint,
                riskId,
                JSON.stringify(receipt.result),
                recordedAt,
              ],
            );
          }
          await transaction.query('COMMIT');
        } catch (error) {
          await transaction.query('ROLLBACK');
          throw error;
        } finally {
          transaction.release();
        }
        const capture = () =>
          Promise.all(
            tables.map(
              async (table) =>
                (
                  await pool.query<{ row: string }>(
                    `SELECT (to_jsonb(t)${table === 'operational_risk_entries' ? " - ARRAY['original_entry_id','original_entry_revision','journal_kind']" : ''})::text AS row FROM public."${table}" t ORDER BY 1`,
                  )
                ).rows,
            ),
          );
        const before = await capture();
        const receiptBytes = await pool.query(
          'SELECT response::text,fingerprint FROM operational_risk_receipts ORDER BY idempotency_key',
        );
        await migrate(connection, { migrationsFolder: resolve('drizzle') });
        expect(await capture()).toEqual(before);
        expect(
          (
            await pool.query(
              'SELECT response::text,fingerprint FROM operational_risk_receipts ORDER BY idempotency_key',
            )
          ).rows,
        ).toEqual(receiptBytes.rows);
        expect(
          (
            await pool.query(
              'SELECT count(*)::integer AS count FROM operational_risk_entries WHERE original_entry_id IS NOT NULL',
            )
          ).rows,
        ).toEqual([{ count: 0 }]);
        harness = await createPostgresRestTestHarness({
          databaseUrl: database.targetUrl,
          environment: {
            NODE_ENV: 'test',
            ACCESS_IDENTITY_MODE: 'test',
            ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
            ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'upgrade-root',
            ACCESS_BOOTSTRAP_WORKSPACE_ID: workspaceId,
            ACCESS_BOOTSTRAP_WORKSPACE_NAME:
              'Synthetic journal upgrade Workspace',
          },
        });
        const headers = {
          'x-test-external-provider': 'deterministic-test',
          'x-test-external-subject': 'upgrade-recorder',
          'x-test-display-name': actor.displayName,
          'x-test-email': 'upgrade@example.test',
          'x-workspace-context-id': workspaceId,
          'x-company-context-id': companyId,
          'content-type': 'application/json',
        };
        for (const [index, receipt] of receipts.entries()) {
          const response = await fetch(`${harness.origin}/api${receipt.path}`, {
            method: 'POST',
            headers: { ...headers, 'idempotency-key': `legacy-${index}` },
            body: JSON.stringify(receipt.body),
          });
          expect(response.status).toBe(201);
          expect(await response.json()).toEqual(receipt.result);
        }
        const root = `${harness.origin}/api/operational-risks/${riskId}/journal/${observationId}`;
        const read = await fetch(root, { headers });
        expect(read.status).toBe(200);
        expect(await read.json()).toEqual({
          riskId,
          companyId,
          revision: 4,
          originalEntry: observation,
          currentEntry: observation,
        });
        const corrected = await fetch(`${root}/corrections`, {
          method: 'POST',
          headers: { ...headers, 'idempotency-key': 'correct-old-original' },
          body: JSON.stringify({
            expectedRevision: 4,
            predecessorId: observationId,
            narrative: 'Corrected after genuine upgrade',
            occurredOn: null,
            reason: 'New verified source',
          }),
        });
        expect(corrected.status).toBe(201);
        const result = object(await corrected.json());
        expect(result.entry).toMatchObject({
          kind: 'journal-corrected',
          originalEntryId: observationId,
          journalKind: 'observation',
          predecessorId: observationId,
          revision: 5,
        });
        expect(result.risk).toEqual({
          ...risk,
          revision: 5,
          currentIntake: correction,
        });
        expect(
          (
            await pool.query(
              'SELECT response::text,fingerprint FROM operational_risk_receipts WHERE command_kind <> $1 ORDER BY idempotency_key',
              ['journal-correct'],
            )
          ).rows,
        ).toEqual(receiptBytes.rows);
      } finally {
        await harness?.close();
        await database.close();
        await rm(previous, { recursive: true, force: true });
      }
    });
  },
);
function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Invalid synthetic object.');
  return Object.fromEntries(Object.entries(value));
}
// The delivered legacy fingerprint protocol: sorted JSON object keys, literal values.
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (typeof value === 'object' && value !== null)
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
