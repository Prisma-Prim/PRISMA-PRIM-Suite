import { withoutGrantsList } from '../access/company-grants.test-support.js';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import type { Pool } from 'pg';
import { expect } from 'vitest';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';
import {
  invoicePredecessorProtocols,
  type UpgradeCallOptions,
} from '../invoice-record/invoice-record-predecessor-protocols.js';
import {
  fixtureHash,
  fixtureHeaders,
  fixtureObject,
  fixtureObjects,
  fixtureString,
  predecessorSnapshot,
} from './external-invoice-migration.test-support.js';

export const paymentPredecessorSource =
  'f87911a5fc4bd8de9b79f9f17e7a58b54ae9b4e7';
export const paymentPredecessorTree =
  '793b4896f6048b6595e3db026af9cb9b4394b7f4';
export const paymentPredecessorInstant = '2026-10-31T12:00:00.000Z';
export const paymentPredecessorSearchPath =
  '/knowledge/search?query=Private%20Company-only%20inventory';

export async function paymentAncestor() {
  const directory = 'test-support/fixtures/invoice-record-predecessor';
  const backup = await readFile(directory + '/predecessor-date.sql.gz');
  const compressed = await readFile(directory + '/context.json.gz');
  const contextBytes = gunzipSync(compressed);
  const provenanceBytes = await readFile(directory + '/provenance.json');
  expect(fixtureHash(backup)).toBe(
    '8d536c9be84e444a6d4ba91b508a3cc611274a8600784cfbaa477c9f9d8f88ac',
  );
  expect(fixtureHash(compressed)).toBe(
    '91d96ca0a8d4e1e232262a98003682f7f227ad89a165d4538e50e8290e1edd2c',
  );
  expect(fixtureHash(contextBytes)).toBe(
    'f6fa8294759a7b69e0a8cc62ea23a07d970f27f4cbbe18b27f7194c19c9711c9',
  );
  expect(fixtureHash(provenanceBytes)).toBe(
    '28fe0c513b6b4796567f151910ed6f98d598b595d2865a7e76dd0664ced977b0',
  );
  const context = fixtureObject(JSON.parse(contextBytes.toString('utf8')));
  const provenance = fixtureObject(
    JSON.parse(provenanceBytes.toString('utf8')),
  );
  expect(provenance).toMatchObject({
    source: 'd608b0436288e89f3c580c8ace219f304ec9ea3a',
    tree: '7db5b3e858c09a9a7e4106cb6649b565c4ae75a5',
    predecessor: '0094_opportunity_follow_up',
    nativeTables: 158,
    closedProducerBeforeDump: true,
  });
  return { backup, context, provenance };
}

/** Restore a genuine dump with every trigger/constraint live. Native CHECK helpers use public. */
export async function restorePaymentPredecessor(
  pool: Pool,
  backup: Uint8Array,
) {
  const sql = gunzipSync(backup).toString('utf8');
  expect(sql).not.toMatch(/DISABLE TRIGGER|session_replication_role/u);
  const publicSchemas = sql.match(/^CREATE SCHEMA public;$/gmu)?.length ?? 0;
  expect(publicSchemas).toBeLessThanOrEqual(1);
  // The genuine f879 dump owns public; its 0094 ancestor may not. The fresh
  // isolated database's default schema is empty, and DROP refuses any contents.
  if (publicSchemas === 1) await pool.query('DROP SCHEMA public');
  const empty = "SELECT pg_catalog.set_config('search_path', '', false);";
  expect(sql.split(empty)).toHaveLength(2);
  await pool.query(
    sql
      .replace(
        empty,
        "SELECT pg_catalog.set_config('search_path', 'public', false);",
      )
      .split('\n')
      .filter((line) => !/^\\(?:un)?restrict /u.test(line))
      .join('\n'),
  );
  await pool.query('SET search_path TO public');
}

export async function paymentPredecessorTables(pool: Pool) {
  return (
    await pool.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
    )
  ).rows.map((row) => row.tablename);
}

export async function paymentPredecessorJournal(pool: Pool) {
  return (
    await pool.query<{ hash: string; created_at: string }>(
      'SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at',
    )
  ).rows;
}

/** Stable catalog values rather than OIDs, sequence positions or server-local identities. */
export async function paymentPredecessorSchema(pool: Pool) {
  const queries = {
    columns: `SELECT c.relname || '.' || a.attname AS name,
      a.attnum AS position,format_type(a.atttypid,a.atttypmod) AS type,
      a.attnotnull AS required,a.attidentity AS identity,a.attgenerated AS generated,
      pg_get_expr(d.adbin,d.adrelid) AS default
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
      WHERE n.nspname='public' AND c.relkind IN ('r','p')
      AND a.attnum>0 AND NOT a.attisdropped ORDER BY name`,
    constraints: `SELECT c.relname || '.' || t.conname AS name,
      pg_get_constraintdef(t.oid,true) AS definition,t.convalidated AS validated,
      t.condeferrable AS deferrable,t.condeferred AS deferred
      FROM pg_constraint t JOIN pg_class c ON c.oid=t.conrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' ORDER BY name`,
    indexes: `SELECT tablename || '.' || indexname AS name,indexdef AS definition
      FROM pg_indexes WHERE schemaname='public' ORDER BY name`,
    triggers: `SELECT c.relname || '.' || t.tgname AS name,
      pg_get_triggerdef(t.oid,true) AS definition,t.tgenabled AS enabled
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY name`,
    functions: `SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS name,
      pg_get_functiondef(p.oid) AS definition FROM pg_proc p
      JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.prokind IN ('f','p') ORDER BY name`,
    enums: `SELECT t.typname AS name,array_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels
      FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
      JOIN pg_enum e ON e.enumtypid=t.oid WHERE n.nspname='public'
      GROUP BY t.typname ORDER BY name`,
  };
  const result: Record<string, unknown> = {};
  for (const [kind, query] of Object.entries(queries))
    result[kind] = (await pool.query(query)).rows;
  return result;
}

export function paymentPredecessorRuntime(context: Record<string, unknown>) {
  const workspaceId = fixtureString(
    fixtureObject(fixtureObject(context.reads)['/access/current-actor'])
      .workspaceId,
  );
  const companyId = fixtureString(context.companyId);
  const identity = {
    'x-test-external-provider': 'deterministic-test',
    'x-test-external-subject': 'mission-owner',
    'x-test-display-name': 'Mission Owner DEMO',
    'x-test-email': 'mission-owner@example.test',
  };
  let harness: PostgresRestTestHarness | undefined;
  async function open(databaseUrl: string) {
    if (harness) throw new Error('The predecessor App is already open.');
    harness = await createPostgresRestTestHarness({
      databaseUrl,
      synchronizeIdentityProfile: false,
      serverClock: { now: () => new Date(paymentPredecessorInstant) },
      environment: {
        KNOWLEDGE_EVIDENCE_ENABLED: 'true',
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'mission-owner',
        ACCESS_BOOTSTRAP_WORKSPACE_ID: workspaceId,
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Mission Documents DEMO',
      },
    });
  }
  async function close() {
    const current = harness;
    harness = undefined;
    await current?.close();
  }
  async function call(path: string, options: UpgradeCallOptions = {}) {
    if (!harness) throw new Error('The predecessor App is closed.');
    return fetch(harness.origin + '/api' + path, {
      method: options.method ?? 'GET',
      headers: {
        ...(options.identity ?? identity),
        'x-workspace-context-id': workspaceId,
        'x-company-context-id': options.companyId ?? companyId,
        'content-type': 'application/json',
        'idempotency-key': options.key ?? 'payment-predecessor-read',
        ...options.requestHeaders,
      },
      ...(options.payload
        ? {
            body:
              options.payload.kind === 'json'
                ? JSON.stringify(options.payload.value)
                : new Uint8Array(Buffer.from(options.payload.base64, 'base64')),
          }
        : {}),
    });
  }
  async function read(
    path: string,
    options?: UpgradeCallOptions,
  ): Promise<unknown> {
    const response = await call(path, options);
    expect(response.status, path).toBe(200);
    return response.json();
  }
  return { open, close, call, read, workspaceId, companyId };
}

interface PaymentPredecessorReplayInput {
  context: Record<string, unknown>;
  runtime: ReturnType<typeof paymentPredecessorRuntime>;
}

/** Old command owners define whether replay is immutable receipt or complete current detail. */
export async function replayPaymentPredecessorCapturedReceipts(
  input: PaymentPredecessorReplayInput,
) {
  const { context, runtime } = input;
  const { call, read } = runtime;
  const protocols = invoicePredecessorProtocols({ context, call, read });
  expect(
    await protocols.replayCapturedCommands(
      fixtureObjects(context.capturedCommands),
    ),
  ).toEqual({
    exact: 90,
    currentDocument: 2,
    currentRequest: 2,
    nativeReceipt: 0,
  });
  expect(
    await protocols.replayCapturedCommands(
      fixtureObjects(context.native0093Commands),
    ),
  ).toEqual({
    exact: 105,
    currentDocument: 4,
    currentRequest: 10,
    nativeReceipt: 26,
  });
}

export async function replayPaymentPredecessorDates(
  input: PaymentPredecessorReplayInput,
) {
  const { context, runtime } = input;
  const { call, read } = runtime;
  const protocols = invoicePredecessorProtocols({ context, call, read });
  expect(
    await protocols.replayCapturedCommands(
      fixtureObjects(context.nativeDateCommands),
    ),
  ).toEqual({
    exact: 53,
    currentDocument: 0,
    currentRequest: 12,
    nativeReceipt: 9,
  });
  await protocols.dates();
}

export async function replayPaymentPredecessorDelivered1044(
  input: PaymentPredecessorReplayInput,
) {
  const { context, runtime } = input;
  const { call, read } = runtime;
  for (const command of fixtureObjects(context.native1044Commands)) {
    const path = fixtureString(command.path);
    const response = await call(path, {
      companyId: fixtureString(command.companyId),
      identity: fixtureHeaders(command.identity),
      method: fixtureString(command.method),
      key: fixtureString(command.key),
      payload: { kind: 'json', value: command.body },
    });
    expect(response.status, path).toBe(command.status);
    expect(await response.json(), path).toEqual(command.response);
  }
  for (const captured of fixtureObjects(context.native1044Reads))
    expect(
      withoutGrantsList(
        fixtureString(captured.path),
        await read(fixtureString(captured.path), {
          companyId: fixtureString(captured.companyId),
          identity: fixtureHeaders(captured.identity),
        }),
      ),
      fixtureString(captured.path),
    ).toEqual(captured.value);
  for (const captured of fixtureObjects(context.native1044Binaries)) {
    const response = await call(fixtureString(captured.path), {
      companyId: fixtureString(captured.companyId),
      identity: fixtureHeaders(captured.identity),
    });
    expect(response.status, fixtureString(captured.path)).toBe(200);
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes.byteLength).toBe(captured.size);
    expect(fixtureHash(bytes)).toBe(captured.sha256);
    expect(Buffer.from(bytes).toString('base64')).toBe(captured.base64);
    expect(
      Object.fromEntries(
        fixtureObjects(captured.headers).map((header) => [
          fixtureString(header.name),
          response.headers.get(fixtureString(header.name)),
        ]),
      ),
    ).toEqual(
      Object.fromEntries(
        fixtureObjects(captured.headers).map((header) => [
          fixtureString(header.name),
          header.value,
        ]),
      ),
    );
  }
}

export async function replayPaymentPredecessorOriginalReadsAndBytes(
  input: PaymentPredecessorReplayInput,
) {
  const { context, runtime } = input;
  const { call, read } = runtime;
  for (const [path, expected] of Object.entries(fixtureObject(context.reads)))
    if (path !== paymentPredecessorSearchPath)
      expect(withoutGrantsList(path, await read(path)), path).toEqual(expected);
  for (const command of fixtureObjects(context.commands)) {
    const path = fixtureString(command.path);
    const response = await call(path, {
      method: 'POST',
      key: fixtureString(command.key),
      payload: { kind: 'json', value: command.body },
    });
    expect(response.status, path).toBe(command.status);
    expect(await response.json(), path).toEqual(command.replay);
  }
  const protocols = invoicePredecessorProtocols({ context, call, read });
  expect(
    (await protocols.originalBytes()) +
      (await protocols.deliveredPrivateAndCommercialFacts()),
  ).toBe(10);
}

/** The original private producer retains its complete, sequential replay entry point. */
export async function replayPaymentPredecessor(
  input: PaymentPredecessorReplayInput,
) {
  await replayPaymentPredecessorCapturedReceipts(input);
  await replayPaymentPredecessorDates(input);
  await replayPaymentPredecessorDelivered1044(input);
  await replayPaymentPredecessorOriginalReadsAndBytes(input);
}

/** The native empty search adds one attributable interaction; all existing rows stay exact. */
export async function paymentPredecessorSearch(input: {
  pool: Pool;
  tables: string[];
  before: Record<string, unknown>;
  context: Record<string, unknown>;
  runtime: ReturnType<typeof paymentPredecessorRuntime>;
}) {
  const { pool, tables, before, context, runtime } = input;
  expect(await runtime.read(paymentPredecessorSearchPath)).toEqual(
    fixtureObject(context.reads)[paymentPredecessorSearchPath],
  );
  const after = await predecessorSnapshot(pool, tables);
  const interactions = fixtureObjects(before.knowledge_interactions);
  const ids = new Set(
    interactions.map((entry) => fixtureString(fixtureObject(entry.row).id)),
  );
  const actual = fixtureObjects(after.knowledge_interactions);
  expect(
    actual.filter((entry) =>
      ids.has(fixtureString(fixtureObject(entry.row).id)),
    ),
  ).toEqual(interactions);
  expect(
    actual.filter(
      (entry) => !ids.has(fixtureString(fixtureObject(entry.row).id)),
    ),
  ).toEqual([
    {
      row: {
        id: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
        ),
        workspace_id: runtime.workspaceId,
        company_id: runtime.companyId,
        actor_membership_id: context.membershipId,
        capability_version: '1',
        operation: 'search',
        source_references: [],
        recorded_at: '2026-10-31T12:00:00+00:00',
      },
    },
  ]);
  expect({
    ...after,
    knowledge_interactions: before.knowledge_interactions,
  }).toEqual(before);
  return after;
}
