import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { constants } from 'node:fs';
import {
  link,
  open,
  readdir,
  readFile,
  realpath,
  rm,
  stat,
} from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { Client } from 'pg';
import {
  createIdempotentCleanup,
  type OwnedResource,
} from '../database/owned-resource-cleanup.js';
import {
  startRecoveryApplication,
  type RecoveryPrincipal,
} from './synthetic-recovery-application.js';

const execute = promisify(execFile);
const MAXIMUM_DUMP_BYTES = 128 * 1024 * 1024;
const MAXIMUM_CONFIG_BYTES = 256 * 1024;
// PostgreSQL17 FirstNormalObjectId: initdb reserves every lower object OID.
const FIRST_NORMAL_POSTGRES_OBJECT_ID = 16_384;
const MAGIC = Buffer.from('PPRREC01', 'ascii');
const SUPPORTED_DUMP_VERSION = /^pg_dump \(PostgreSQL\) 17\.\d+$/u;

/** The isolated operator command; it adds no route or served identity mode. */
export interface SyntheticRecoveryCommandInput {
  readonly argv: readonly string[];
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly write: (line: string) => void;
  readonly signal?: AbortSignal;
}

export async function runSyntheticRecoveryCommand(
  input: SyntheticRecoveryCommandInput,
): Promise<number> {
  const [operation, option, configPath, ...remaining] = input.argv;
  if (
    (operation !== 'backup' && operation !== 'restore') ||
    option !== '--config' ||
    !configPath ||
    remaining.length !== 0
  ) {
    input.write(
      JSON.stringify({ outcome: 'refused', reason: 'invalid-arguments' }),
    );
    return 2;
  }
  if (
    input.environment.NODE_ENV !== 'test' &&
    input.environment.NODE_ENV !== 'development'
  ) {
    input.write(
      JSON.stringify({ outcome: 'refused', reason: 'production-environment' }),
    );
    return 2;
  }
  try {
    input.signal?.throwIfAborted();
    if (operation === 'backup') {
      const config = await readBackupConfig(configPath);
      await createRetainedBackup(config, input.signal);
      input.write(
        JSON.stringify({
          outcome: 'archive-created',
          recovery: 'not-verified',
        }),
      );
    } else {
      const config = await readRestoreConfig(configPath);
      input.write(
        JSON.stringify(
          await restoreAndVerify(config, input.environment, input.signal),
        ),
      );
    }
    return 0;
  } catch (error: unknown) {
    if (error instanceof RecoveryCleanupFailure) {
      input.write(
        JSON.stringify({
          outcome: 'failed',
          reason: 'owned-cleanup-incomplete',
          cleanup: 'incomplete',
          cancelled: input.signal?.aborted === true,
        }),
      );
      return 1;
    }
    if (input.signal?.aborted) {
      input.write(
        JSON.stringify({
          outcome: 'cancelled',
          reason: `${operation}-cancelled`,
          cleanup: 'attempted',
        }),
      );
      return 2;
    }
    const refusal = error instanceof RecoveryRefusal;
    input.write(
      JSON.stringify({
        outcome: refusal ? 'refused' : 'failed',
        reason: refusal ? error.reason : `${operation}-incomplete`,
      }),
    );
    return refusal ? 2 : 1;
  }
}

class RecoveryRefusal extends Error {
  constructor(readonly reason: string) {
    super('Synthetic recovery refused.');
  }
}

class RecoveryCleanupFailure extends Error {
  constructor() {
    super('Owned synthetic recovery cleanup is incomplete.');
  }
}

async function completeOwnedCleanup(
  resources: readonly OwnedResource[],
): Promise<void> {
  try {
    await createIdempotentCleanup({
      resources,
      multipleFailuresMessage: 'Owned recovery cleanup failed.',
      failureAction: 'close',
    })();
  } catch {
    throw new RecoveryCleanupFailure();
  }
}

function recoveryDatabaseClient(input: {
  readonly databaseUrl: string;
  readonly signal?: AbortSignal;
}) {
  input.signal?.throwIfAborted();
  const applicationName = `prisma-recovery-${randomBytes(12).toString('hex')}`;
  const client = new Client({
    connectionString: input.databaseUrl,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 5_000,
    query_timeout: 5_000,
    application_name: applicationName,
  });
  let closing: Promise<void> | undefined;
  const abort = () => {
    // Cleanup below awaits this same promise and preserves a close failure.
    void close().catch(() => undefined);
  };
  function close(): Promise<void> {
    input.signal?.removeEventListener('abort', abort);
    closing ??= (async () => {
      try {
        await client.end();
      } finally {
        // Disconnecting a socket need not wake a server blocked on a lock.
        // This separate bounded connection can close only our named session.
        if (input.signal?.aborted)
          await terminateOwnedDatabaseSessions({
            databaseUrl: input.databaseUrl,
            applicationName,
          });
      }
    })();
    return closing;
  }
  input.signal?.addEventListener('abort', abort, { once: true });
  return { client, close };
}

function localDatabaseName(connection: URL): string {
  const name = decodeURIComponent(connection.pathname.slice(1));
  // libpq treats '=' and URI-shaped values as connection information rather
  // than a literal database name; admission and the utility must name one DB.
  if (!name || name.includes('/') || name.includes('=') || name.includes('\0'))
    throw new RecoveryRefusal('invalid-database-name');
  return name;
}

interface BackupConfig {
  readonly applicationRevision: string;
  readonly workspace: { readonly id: string; readonly name: string };
  readonly database: { readonly url: string; readonly container: string };
  readonly archivePath: string;
  readonly keyPath: string;
  readonly verificationEvidencePath: string;
  readonly completionEvidencePath: string;
}

async function readBackupConfig(path: string): Promise<BackupConfig> {
  return decodeBackupConfig(await readConfigurationFile(path));
}

async function readConfigurationFile(
  path: string,
): Promise<Record<string, unknown>> {
  return record(
    JSON.parse(
      (await protectedFile(path, MAXIMUM_CONFIG_BYTES)).toString('utf8'),
    ),
  );
}

function decodeBackupConfig(input: Record<string, unknown>): BackupConfig {
  if (
    input.version !== 1 ||
    input.attestation !== 'exclusive-synthetic-non-production'
  )
    throw new RecoveryRefusal('synthetic-attestation-required');
  const workspace = record(input.workspace);
  const database = record(input.database);
  const revision = text(input.applicationRevision);
  const id = text(workspace.id);
  const name = text(workspace.name);
  const container = text(database.container);
  if (!/^[0-9a-f]{40}$/u.test(revision))
    throw new RecoveryRefusal('unsupported-application-revision');
  if (
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(id) ||
    !name.includes('DEMO')
  )
    throw new RecoveryRefusal('invalid-demonstration-workspace');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/u.test(container))
    throw new RecoveryRefusal('invalid-tool-container');
  return {
    applicationRevision: revision,
    workspace: { id: id.toLowerCase(), name },
    database: { url: text(database.url), container },
    archivePath: resolve(text(input.archivePath)),
    keyPath: resolve(text(input.keyPath)),
    verificationEvidencePath: resolve(text(input.verificationEvidencePath)),
    completionEvidencePath: resolve(text(input.completionEvidencePath)),
  };
}

interface RestoreConfig extends BackupConfig {
  readonly measurement: {
    readonly referenceInstant: string;
    readonly referenceMilliseconds: number;
    readonly maximumRecencyMilliseconds: number;
    readonly maximumRecoveryMilliseconds: number;
  };
}

async function readRestoreConfig(path: string): Promise<RestoreConfig> {
  const input = await readConfigurationFile(path);
  const measurement = record(input.measurement);
  const referenceInstant = text(measurement.referenceInstant);
  const maximumRecencyMilliseconds = measurement.maximumRecencyMilliseconds;
  const maximumRecoveryMilliseconds = measurement.maximumRecoveryMilliseconds;
  if (
    typeof maximumRecencyMilliseconds !== 'number' ||
    !Number.isFinite(maximumRecencyMilliseconds) ||
    maximumRecencyMilliseconds < 0 ||
    typeof maximumRecoveryMilliseconds !== 'number' ||
    !Number.isFinite(maximumRecoveryMilliseconds) ||
    maximumRecoveryMilliseconds <= 0
  )
    throw new RecoveryRefusal('invalid-caller-measurement-bounds');
  return {
    ...decodeBackupConfig(input),
    measurement: {
      referenceInstant,
      referenceMilliseconds: instant(referenceInstant),
      maximumRecencyMilliseconds,
      maximumRecoveryMilliseconds,
    },
  };
}

interface ExpectedRead {
  readonly key: string;
  readonly family: string;
  readonly principal: string;
  readonly path: string;
  readonly companyId?: string;
  readonly expectedStatus: number;
  readonly sha256: string;
}

function decodePublicEvidence(value: unknown): {
  readonly principals: readonly RecoveryPrincipal[];
  readonly reads: readonly ExpectedRead[];
} {
  const input = record(value);
  if (
    input.version !== 1 ||
    !Array.isArray(input.principals) ||
    input.principals.length === 0 ||
    input.principals.length > 16 ||
    !Array.isArray(input.reads) ||
    input.reads.length > 64
  )
    throw new RecoveryRefusal('unsupported-public-evidence');
  const principals = input.principals.map(
    (value: unknown): RecoveryPrincipal => {
      const row = record(value);
      return {
        key: label(row.key),
        provider: boundedText(row.provider),
        subject: boundedText(row.subject),
        displayName: boundedText(row.displayName),
        email: boundedText(row.email),
      };
    },
  );
  if (
    new Set(principals.map((entry) => entry.key)).size !== principals.length ||
    new Set(principals.map((entry) => `${entry.provider}\0${entry.subject}`))
      .size !== principals.length
  )
    throw new RecoveryRefusal('duplicate-public-principal');
  const required = [
    'business',
    'receipt-result',
    'configuration',
    'history',
    'authority-allowed',
    'pdf-current',
    'pdf-history',
    'authority-revoked',
    'authority-other-company',
    'authority-restricted',
    'after-cutoff',
  ];
  const reads = input.reads.map((value: unknown): ExpectedRead => {
    const row = record(value);
    const family = text(row.family);
    const path = boundedText(row.path, 2048);
    const principal = label(row.principal);
    if (
      !required.includes(family) ||
      !principals.some((entry) => entry.key === principal) ||
      !allowedPublicRead(path) ||
      typeof row.expectedStatus !== 'number' ||
      !(family.startsWith('authority-') && family !== 'authority-allowed'
        ? [403, 404].includes(row.expectedStatus)
        : row.expectedStatus === 200)
    )
      throw new RecoveryRefusal('invalid-public-read-contract');
    if (
      (family === 'pdf-current' || family === 'pdf-history') &&
      !path.includes('/content')
    )
      throw new RecoveryRefusal('invalid-pdf-public-proof');
    if (
      family === 'configuration' &&
      !path.startsWith('/pricing-configuration/')
    )
      throw new RecoveryRefusal('invalid-configuration-public-proof');
    if (family === 'after-cutoff' && !path.startsWith('/clients/search?query='))
      throw new RecoveryRefusal('invalid-cutoff-public-proof');
    return {
      key: label(row.key),
      family,
      path,
      principal,
      ...(row.companyId === undefined
        ? {}
        : { companyId: uuid(row.companyId) }),
      expectedStatus: row.expectedStatus,
      sha256: fingerprint(row.sha256),
    };
  });
  if (
    new Set(reads.map((entry) => entry.key)).size !== reads.length ||
    required.some((family) => !reads.some((entry) => entry.family === family))
  )
    throw new RecoveryRefusal('incomplete-public-evidence');
  return { principals, reads };
}

function allowedPublicRead(path: string): boolean {
  if (
    [
      '/companies',
      '/activity-log',
      '/access/current-actor',
      '/company-context-assignments/administration',
    ].includes(path)
  )
    return true;
  if (/^\/clients\/search\?query=[a-zA-Z0-9%_.~-]+$/u.test(path)) return true;
  const id = '[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}';
  return new RegExp(
    `^/(?:documents/${id}(?:/versions(?:/${id}/content(?:/(?:${id}|history))?)?)?|pricing-configuration/rule-versions/${id}|tasks/${id}/history)$`,
    'u',
  ).test(path);
}

async function restoreAndVerify(
  config: RestoreConfig,
  environment: Readonly<Record<string, string | undefined>>,
  signal?: AbortSignal,
) {
  if (
    Object.entries(environment).some(
      ([key, value]) =>
        value !== undefined &&
        (key.startsWith('ACCESS_BOOTSTRAP_') ||
          key === 'ACCESS_ACCEPTED_INVITATIONS_JSON' ||
          key === 'ACCESS_IDENTITY_MODE'),
    )
  )
    throw new RecoveryRefusal('ordinary-empty-admission-required');
  const started = performance.now();
  const withinDuration = () => {
    signal?.throwIfAborted();
    if (
      performance.now() - started >
      config.measurement.maximumRecoveryMilliseconds
    )
      throw new RecoveryRefusal('recovery-duration-bound-exceeded');
  };
  const archive = await protectedFile(
    config.archivePath,
    MAXIMUM_DUMP_BYTES + 32 * 1024,
  );
  const key = await protectedFile(config.keyPath, 32);
  let plaintext: Buffer | undefined;
  let application:
    Awaited<ReturnType<typeof startRecoveryApplication>> | undefined;
  try {
    if (
      key.length !== 32 ||
      archive.length < MAGIC.length + 4 + 12 + 16 ||
      !archive.subarray(0, MAGIC.length).equals(MAGIC)
    )
      throw new RecoveryRefusal('invalid-archive');
    const length = archive.readUInt32BE(MAGIC.length);
    const metadataEnd = MAGIC.length + 4 + length;
    const payloadStart = metadataEnd + 12;
    if (
      length > 16 * 1024 ||
      length === 0 ||
      payloadStart + 16 > archive.length
    )
      throw new RecoveryRefusal('invalid-archive-length');
    const nonce = archive.subarray(metadataEnd, payloadStart);
    const decipher = createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAAD(archive.subarray(0, payloadStart));
    decipher.setAuthTag(archive.subarray(-16));
    plaintext = decipher.update(archive.subarray(payloadStart, -16));
    try {
      plaintext = Buffer.concat([plaintext, decipher.final()]);
    } catch {
      throw new RecoveryRefusal('archive-authentication-failed');
    }
    const metadata = record(
      JSON.parse(
        archive.subarray(MAGIC.length + 4, metadataEnd).toString('utf8'),
      ),
    );
    const workspace = record(metadata.workspace);
    const currentMigrations = readMigrationFiles({
      migrationsFolder: './drizzle',
    }).map((migration) => ({
      hash: migration.hash,
      when: String(migration.folderMillis),
    }));
    if (
      metadata.version !== 1 ||
      metadata.applicationRevision !== config.applicationRevision ||
      metadata.applicationFingerprint !==
        (await compiledApplicationFingerprint()) ||
      metadata.migrationFingerprint !==
        sha256(Buffer.from(JSON.stringify(currentMigrations))) ||
      workspace.id !== config.workspace.id ||
      workspace.name !== config.workspace.name ||
      metadata.payloadLength !== plaintext.length ||
      plaintext.length > MAXIMUM_DUMP_BYTES ||
      !plaintext.subarray(0, 5).equals(Buffer.from('PGDMP'))
    )
      throw new RecoveryRefusal('incompatible-authenticated-archive');
    const snapshotCutoff = text(metadata.snapshotCutoff);
    const evidenceBytes = await protectedFile(
      config.verificationEvidencePath,
      MAXIMUM_CONFIG_BYTES,
    );
    if (metadata.verificationFingerprint !== sha256(evidenceBytes))
      throw new RecoveryRefusal('public-evidence-mismatch');
    const evidence = decodePublicEvidence(
      JSON.parse(evidenceBytes.toString('utf8')),
    );
    const completion = record(
      JSON.parse(
        (
          await protectedFile(
            config.completionEvidencePath,
            MAXIMUM_CONFIG_BYTES,
          )
        ).toString('utf8'),
      ),
    );
    const completedAt = text(completion.completedAt);
    if (
      completion.version !== 1 ||
      completion.outcome !== 'archive-created' ||
      completion.archiveSha256 !== sha256(archive) ||
      completion.snapshotCutoff !== snapshotCutoff ||
      completion.applicationRevision !== config.applicationRevision ||
      completion.verificationFingerprint !== metadata.verificationFingerprint ||
      instant(snapshotCutoff) > instant(completedAt) ||
      instant(completedAt) > config.measurement.referenceMilliseconds
    )
      throw new RecoveryRefusal('inconsistent-completion-evidence');
    const recencyMilliseconds =
      config.measurement.referenceMilliseconds - instant(snapshotCutoff);
    if (recencyMilliseconds > config.measurement.maximumRecencyMilliseconds)
      throw new RecoveryRefusal('recency-bound-exceeded');
    withinDuration();
    const postgresServerVersion = text(metadata.postgresServerVersion);
    const postgresToolVersion = text(metadata.postgresToolVersion);
    const target = await restoreTarget(
      config,
      postgresServerVersion,
      postgresToolVersion,
      signal,
    );
    await transactionalRestore(target, plaintext, signal);
    withinDuration();
    await assertPersistedRecoveryPrincipals({
      databaseUrl: config.database.url,
      principals: evidence.principals,
      signal,
    });
    application = await startRecoveryApplication({
      databaseUrl: config.database.url,
      principals: evidence.principals,
    });
    const checks: { key: string; status: number; sha256: string }[] = [];
    for (const read of evidence.reads) {
      withinDuration();
      const response = await fetch(`${application.origin}/api${read.path}`, {
        method: 'GET',
        redirect: 'error',
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(10_000)])
          : AbortSignal.timeout(10_000),
        headers: {
          ...application.headersFor(read.principal),
          ...(read.companyId ? { 'x-company-context-id': read.companyId } : {}),
        },
      });
      if (response.status !== read.expectedStatus)
        throw new RecoveryRefusal('public-authority-or-record-mismatch');
      const observed = await responseFingerprint(response);
      if (observed !== read.sha256)
        throw new RecoveryRefusal('public-content-mismatch');
      checks.push({ key: read.key, status: response.status, sha256: observed });
    }
    withinDuration();
    return {
      outcome: 'recovered',
      applicationRevision: config.applicationRevision,
      archiveSha256: sha256(archive),
      verificationFingerprint: sha256(evidenceBytes),
      postgresServerVersion,
      postgresToolVersion,
      snapshotCutoff,
      completedAt,
      referenceInstant: config.measurement.referenceInstant,
      recencyMilliseconds,
      maximumRecencyMilliseconds: config.measurement.maximumRecencyMilliseconds,
      recoveryMilliseconds: performance.now() - started,
      maximumRecoveryMilliseconds:
        config.measurement.maximumRecoveryMilliseconds,
      checks,
      cleanup: 'complete',
      policy: 'caller-bounds-only',
    };
  } finally {
    key.fill(0);
    plaintext?.fill(0);
    await completeOwnedCleanup([
      {
        name: 'restored application',
        cleanup: async () => {
          await application?.close();
        },
      },
    ]);
  }
}

async function assertPersistedRecoveryPrincipals(input: {
  readonly databaseUrl: string;
  readonly principals: readonly RecoveryPrincipal[];
  readonly signal?: AbortSignal;
}): Promise<void> {
  const { client, close } = recoveryDatabaseClient(input);
  try {
    input.signal?.throwIfAborted();
    await client.connect();
    for (const principal of input.principals) {
      input.signal?.throwIfAborted();
      const observed = await client.query<Record<string, unknown>>(
        `SELECT display_name AS "displayName", email FROM public.internal_users
         WHERE external_provider=$1 AND external_subject=$2`,
        [principal.provider, principal.subject],
      );
      if (
        observed.rows.length !== 1 ||
        observed.rows[0]?.displayName !== principal.displayName ||
        observed.rows[0]?.email !== principal.email
      )
        throw new RecoveryRefusal('persisted-principal-mismatch');
    }
    input.signal?.throwIfAborted();
  } finally {
    await completeOwnedCleanup([
      { name: 'principal verification client', cleanup: close },
    ]);
  }
}

interface RestoreTarget {
  readonly arguments: readonly string[];
  readonly environment: NodeJS.ProcessEnv;
  readonly databaseUrl: string;
  readonly applicationName: string;
}

async function restoreTarget(
  config: BackupConfig,
  serverVersion: string,
  dumpVersion: string,
  signal?: AbortSignal,
): Promise<RestoreTarget> {
  const connection = new URL(config.database.url);
  const databaseName = localDatabaseName(connection);
  if (
    !['postgres:', 'postgresql:'].includes(connection.protocol) ||
    connection.hostname !== '127.0.0.1' ||
    !connection.port ||
    connection.search ||
    connection.hash ||
    !connection.username ||
    !/^17\d{4}$/u.test(serverVersion) ||
    !SUPPORTED_DUMP_VERSION.test(dumpVersion)
  )
    throw new RecoveryRefusal('unsupported-local-restore-target');
  const inspected = await execute(
    'docker',
    [
      '--host=unix:///var/run/docker.sock',
      'inspect',
      '--format',
      '{{json .NetworkSettings.Ports}}',
      config.database.container,
    ],
    { timeout: 10_000, maxBuffer: 64 * 1024, signal },
  );
  const bindings = record(JSON.parse(inspected.stdout))['5432/tcp'];
  if (
    !Array.isArray(bindings) ||
    !bindings.some((value: unknown) => {
      const row = record(value);
      return row.HostIp === '127.0.0.1' && row.HostPort === connection.port;
    })
  )
    throw new RecoveryRefusal('container-target-mismatch');
  const applicationName = `prisma-recovery-${randomBytes(12).toString('hex')}`;
  const environment = {
    ...process.env,
    PGPASSWORD: decodeURIComponent(connection.password),
    PGAPPNAME: applicationName,
  };
  const prefix = [
    '--host=unix:///var/run/docker.sock',
    'exec',
    '--env',
    'PGPASSWORD',
    '--env',
    'PGAPPNAME',
    config.database.container,
    'pg_restore',
  ];
  const version = await execute('docker', [...prefix, '--version'], {
    env: environment,
    timeout: 10_000,
    maxBuffer: 1024,
    signal,
  });
  if (version.stdout.trim() !== dumpVersion.replace('pg_dump', 'pg_restore'))
    throw new RecoveryRefusal('incompatible-postgresql-restore-tool');
  const { client, close } = recoveryDatabaseClient({
    databaseUrl: config.database.url,
    signal,
  });
  try {
    await client.connect();
    await client.query(
      'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
    );
    // Dependencies on pinned builtins are omitted by PostgreSQL. Inventory all
    // standalone PG17 object catalogs too, including objects in pg_catalog;
    // dependent defaults, indexes, constraints, policies and rules are covered
    // by their parent objects and pg_depend. Cluster roles remain external.
    const state = await client.query<Record<string, unknown>>(`SELECT
      current_setting('server_version_num') AS version,
      EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid <> pg_backend_pid()) AS shared,
      EXISTS(SELECT 1 FROM pg_namespace WHERE nspname NOT IN ('public','information_schema') AND nspname !~ '^pg_') OR
      EXISTS(SELECT 1 FROM pg_class AS c JOIN pg_namespace AS n ON n.oid=c.relnamespace WHERE n.nspname='public') OR
      EXISTS(SELECT 1 FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid=p.pronamespace WHERE n.nspname='public') OR
      EXISTS(SELECT 1 FROM pg_type AS t JOIN pg_namespace AS n ON n.oid=t.typnamespace WHERE n.nspname='public') OR
      EXISTS(SELECT 1 FROM (
        SELECT oid FROM pg_catalog.pg_namespace UNION ALL
        SELECT oid FROM pg_catalog.pg_class UNION ALL
        SELECT oid FROM pg_catalog.pg_proc UNION ALL
        SELECT oid FROM pg_catalog.pg_type UNION ALL
        SELECT oid FROM pg_catalog.pg_attrdef UNION ALL
        SELECT oid FROM pg_catalog.pg_constraint UNION ALL
        SELECT oid FROM pg_catalog.pg_rewrite UNION ALL
        SELECT oid FROM pg_catalog.pg_trigger UNION ALL
        SELECT oid FROM pg_catalog.pg_policy UNION ALL
        SELECT oid FROM pg_catalog.pg_statistic_ext UNION ALL
        SELECT oid FROM pg_catalog.pg_operator UNION ALL
        SELECT oid FROM pg_catalog.pg_am UNION ALL
        SELECT oid FROM pg_catalog.pg_opclass UNION ALL
        SELECT oid FROM pg_catalog.pg_opfamily UNION ALL
        SELECT oid FROM pg_catalog.pg_collation UNION ALL
        SELECT oid FROM pg_catalog.pg_conversion UNION ALL
        SELECT oid FROM pg_catalog.pg_language UNION ALL
        SELECT oid FROM pg_catalog.pg_cast UNION ALL
        SELECT oid FROM pg_catalog.pg_ts_parser UNION ALL
        SELECT oid FROM pg_catalog.pg_ts_dict UNION ALL
        SELECT oid FROM pg_catalog.pg_ts_template UNION ALL
        SELECT oid FROM pg_catalog.pg_ts_config UNION ALL
        SELECT oid FROM pg_catalog.pg_foreign_data_wrapper UNION ALL
        SELECT oid FROM pg_catalog.pg_foreign_server UNION ALL
        SELECT oid FROM pg_catalog.pg_user_mapping UNION ALL
        SELECT oid FROM pg_catalog.pg_transform UNION ALL
        SELECT oid FROM pg_catalog.pg_event_trigger UNION ALL
        SELECT oid FROM pg_catalog.pg_publication UNION ALL
        SELECT oid FROM pg_catalog.pg_subscription WHERE subdbid=(
          SELECT oid FROM pg_catalog.pg_database WHERE datname=current_database()
        )
      ) AS objects WHERE oid >= ${FIRST_NORMAL_POSTGRES_OBJECT_ID}) OR
      EXISTS(SELECT 1 FROM pg_catalog.pg_depend
        WHERE objid >= ${FIRST_NORMAL_POSTGRES_OBJECT_ID}
        OR refobjid >= ${FIRST_NORMAL_POSTGRES_OBJECT_ID}) OR
      EXISTS(SELECT 1 FROM pg_extension WHERE extname <> 'plpgsql') OR
      EXISTS(SELECT 1 FROM pg_default_acl) OR
      EXISTS(SELECT 1 FROM pg_largeobject_metadata) AS nonempty`);
    if (
      state.rows[0]?.version !== serverVersion ||
      state.rows[0]?.nonempty !== false
    )
      throw new RecoveryRefusal('nonempty-or-incompatible-destination');
    if (state.rows[0]?.shared !== false)
      throw new RecoveryRefusal('shared-destination');
    await client.query('COMMIT');
  } finally {
    await completeOwnedCleanup([
      { name: 'destination admission client', cleanup: close },
    ]);
  }
  return {
    arguments: [
      ...prefix.slice(0, 2),
      '-i',
      ...prefix.slice(2),
      '--single-transaction',
      '--exit-on-error',
      '--host=127.0.0.1',
      '--port=5432',
      `--username=${decodeURIComponent(connection.username)}`,
      `--dbname=${databaseName}`,
    ],
    environment,
    databaseUrl: config.database.url,
    applicationName,
  };
}

async function transactionalRestore(
  target: RestoreTarget,
  bytes: Buffer,
  signal?: AbortSignal,
): Promise<void> {
  let completed = false;
  try {
    await new Promise<void>((done, fail) => {
      const child = spawn('docker', target.arguments, {
        env: target.environment,
        stdio: ['pipe', 'ignore', 'pipe'],
        timeout: 30_000,
        signal,
      });
      let diagnosticBytes = 0;
      child.stderr.on('data', (value: Buffer) => {
        diagnosticBytes += value.length;
        if (diagnosticBytes > 64 * 1024) child.kill();
      });
      child.stdin.on('error', () => {
        /* close reports the sanitized process result */
      });
      child.once('error', () =>
        fail(new RecoveryRefusal('restore-process-unavailable')),
      );
      child.once('close', (code) =>
        code === 0
          ? done()
          : fail(new RecoveryRefusal('transactional-restore-failed')),
      );
      child.stdin.end(bytes);
    });
    completed = true;
  } finally {
    if (!completed || signal?.aborted)
      await completeOwnedCleanup([
        {
          name: 'owned restore tool sessions',
          cleanup: () => terminateOwnedDatabaseSessions(target),
        },
      ]);
  }
}

async function terminateOwnedDatabaseSessions(input: {
  readonly databaseUrl: string;
  readonly applicationName: string;
}): Promise<void> {
  const client = new Client({
    connectionString: input.databaseUrl,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 5_000,
    query_timeout: 5_000,
  });
  try {
    await client.connect();
    await client.query(
      'SELECT pg_terminate_backend(pid, 5000) FROM pg_stat_activity WHERE datname=current_database() AND application_name=$1 AND pid<>pg_backend_pid()',
      [input.applicationName],
    );
    const state = await client.query<Record<string, unknown>>(
      'SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND application_name=$1 AND pid<>pg_backend_pid()) AS remaining',
      [input.applicationName],
    );
    if (state.rows[0]?.remaining !== false) throw new RecoveryCleanupFailure();
  } finally {
    await client.end();
  }
}

async function responseFingerprint(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new RecoveryRefusal('empty-public-response');
  const hash = createHash('sha256');
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > 8 * 1024 * 1024) {
        await reader.cancel();
        throw new RecoveryRefusal('oversized-public-response');
      }
      hash.update(value);
    }
    return hash.digest('hex');
  } finally {
    reader.releaseLock();
  }
}

function instant(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value)
    throw new RecoveryRefusal('invalid-reference-or-evidence-instant');
  return parsed;
}

function boundedText(value: unknown, maximum = 512): string {
  const result = text(value);
  if (result.length > maximum)
    throw new RecoveryRefusal('oversized-evidence-value');
  return result;
}

function label(value: unknown): string {
  const result = text(value);
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/u.test(result))
    throw new RecoveryRefusal('invalid-evidence-label');
  return result;
}

function uuid(value: unknown): string {
  const result = text(value);
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u.test(result))
    throw new RecoveryRefusal('invalid-evidence-company');
  return result;
}

function fingerprint(value: unknown): string {
  const result = text(value);
  if (!/^[0-9a-f]{64}$/u.test(result))
    throw new RecoveryRefusal('invalid-evidence-fingerprint');
  return result;
}

async function protectedFile(
  path: string,
  maximumBytes: number,
): Promise<Buffer> {
  const handle = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const details = await handle.stat();
    if (
      !details.isFile() ||
      details.size > maximumBytes ||
      (details.mode & 0o077) !== 0
    )
      throw new RecoveryRefusal('unprotected-or-oversized-input');
    const bytes = Buffer.alloc(maximumBytes + 1);
    let length = 0;
    while (length < bytes.length) {
      const result = await handle.read(bytes, length, bytes.length - length);
      if (result.bytesRead === 0) break;
      length += result.bytesRead;
    }
    if (length > maximumBytes) throw new RecoveryRefusal('oversized-input');
    return bytes.subarray(0, length);
  } finally {
    await handle.close();
  }
}

async function createRetainedBackup(
  config: BackupConfig,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted();
  const key = await protectedFile(config.keyPath, 32);
  if (key.length !== 32) throw new RecoveryRefusal('invalid-archive-key');
  const evidence = await protectedFile(
    config.verificationEvidencePath,
    MAXIMUM_CONFIG_BYTES,
  );
  const archiveDirectory = await realpath(dirname(config.archivePath));
  const parent = await stat(archiveDirectory);
  if (!parent.isDirectory() || (parent.mode & 0o077) !== 0)
    throw new RecoveryRefusal('unprotected-artifact-directory');
  if (
    new Set([
      config.archivePath,
      config.keyPath,
      config.verificationEvidencePath,
      config.completionEvidencePath,
    ]).size !== 4
  )
    throw new RecoveryRefusal('retained-material-must-be-independent');
  // Explicitly support the existing local container/loopback transport only.
  const connection = new URL(config.database.url);
  const databaseName = localDatabaseName(connection);
  if (
    !['postgres:', 'postgresql:'].includes(connection.protocol) ||
    connection.hostname !== '127.0.0.1' ||
    !connection.port ||
    connection.search ||
    connection.hash ||
    !connection.username
  )
    throw new RecoveryRefusal('unsupported-local-database-target');
  const inspected = await execute(
    'docker',
    [
      '--host=unix:///var/run/docker.sock',
      'inspect',
      '--format',
      '{{json .NetworkSettings.Ports}}',
      config.database.container,
    ],
    { timeout: 10_000, maxBuffer: 64 * 1024, signal },
  );
  const ports = record(JSON.parse(inspected.stdout));
  const bindings = ports['5432/tcp'];
  if (
    !Array.isArray(bindings) ||
    !bindings.some((value: unknown) => {
      const binding = record(value);
      return (
        binding.HostIp === '127.0.0.1' && binding.HostPort === connection.port
      );
    })
  )
    throw new RecoveryRefusal('container-target-mismatch');
  const toolArguments = [
    '--host=unix:///var/run/docker.sock',
    'exec',
    '--env',
    'PGPASSWORD',
    '--env',
    'PGAPPNAME',
    config.database.container,
    'pg_dump',
  ];
  const applicationName = `prisma-recovery-${randomBytes(12).toString('hex')}`;
  const toolEnvironment = {
    ...process.env,
    PGPASSWORD: decodeURIComponent(connection.password),
    PGAPPNAME: applicationName,
  };
  const tool = await execute('docker', [...toolArguments, '--version'], {
    env: toolEnvironment,
    timeout: 10_000,
    maxBuffer: 1024,
    signal,
  });
  const toolVersion = tool.stdout.trim();
  if (!SUPPORTED_DUMP_VERSION.test(toolVersion))
    throw new RecoveryRefusal('unsupported-postgresql-tool');
  const migrations = readMigrationFiles({ migrationsFolder: './drizzle' });
  const expected = migrations.map((migration) => ({
    hash: migration.hash,
    when: String(migration.folderMillis),
  }));
  const { client, close } = recoveryDatabaseClient({
    databaseUrl: config.database.url,
    signal,
  });
  let dumped: Buffer | undefined;
  let ciphertext: Buffer | undefined;
  let temporaryArtifact: string | undefined;
  let dumpState: 'not-started' | 'running' | 'completed' = 'not-started';
  try {
    await client.connect();
    const cutoff = new Date().toISOString();
    await client.query(
      'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
    );
    try {
      const snapshots = await client.query<Record<string, unknown>>(
        'SELECT pg_export_snapshot() AS snapshot',
      );
      const snapshot = text(snapshots.rows[0]?.snapshot);
      if (!/^[0-9a-f-]+$/iu.test(snapshot))
        throw new RecoveryRefusal('invalid-snapshot');
      const version = await client.query<Record<string, unknown>>(
        "SELECT current_setting('server_version_num') AS version",
      );
      const serverVersion = text(version.rows[0]?.version);
      if (!/^17\d{4}$/u.test(serverVersion))
        throw new RecoveryRefusal('unsupported-postgresql-server');
      const sourceSchema = await client.query<Record<string, unknown>>(
        `SELECT to_regclass('public.workspaces') IS NOT NULL AS workspace,
          to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS journal`,
      );
      if (
        sourceSchema.rows[0]?.workspace !== true ||
        sourceSchema.rows[0]?.journal !== true
      )
        throw new RecoveryRefusal('unsupported-source-schema');
      const workspaces = await client.query<Record<string, unknown>>(
        'SELECT id::text AS id, name FROM public.workspaces',
      );
      if (
        workspaces.rows.length !== 1 ||
        workspaces.rows[0]?.id !== config.workspace.id ||
        workspaces.rows[0]?.name !== config.workspace.name
      )
        throw new RecoveryRefusal('source-workspace-mismatch');
      const journal = await client.query<Record<string, unknown>>(
        'SELECT hash, created_at::text AS instant FROM drizzle.__drizzle_migrations ORDER BY created_at ASC, id ASC',
      );
      if (
        journal.rows.length !== expected.length ||
        journal.rows.some(
          (row, index) =>
            row.hash !== expected[index]?.hash ||
            row.instant !== expected[index]?.when,
        )
      )
        throw new RecoveryRefusal('unsupported-migration-state');
      dumpState = 'running';
      const dump = await execute(
        'docker',
        [
          ...toolArguments,
          '--format=custom',
          '--host=127.0.0.1',
          '--port=5432',
          `--username=${decodeURIComponent(connection.username)}`,
          `--dbname=${databaseName}`,
          `--snapshot=${snapshot}`,
        ],
        {
          env: toolEnvironment,
          encoding: 'buffer',
          timeout: 30_000,
          maxBuffer: MAXIMUM_DUMP_BYTES,
          signal,
        },
      );
      dumpState = 'completed';
      dumped = dump.stdout;
      signal?.throwIfAborted();
      if (
        dumped.length > MAXIMUM_DUMP_BYTES ||
        !dumped.subarray(0, 5).equals(Buffer.from('PGDMP'))
      )
        throw new RecoveryRefusal('unsupported-dump');
      await client.query('COMMIT');
      const metadata = Buffer.from(
        JSON.stringify({
          version: 1,
          applicationRevision: config.applicationRevision,
          applicationFingerprint: await compiledApplicationFingerprint(),
          migrationFingerprint: sha256(Buffer.from(JSON.stringify(expected))),
          workspace: config.workspace,
          snapshotCutoff: cutoff,
          postgresServerVersion: serverVersion,
          postgresToolVersion: toolVersion,
          verificationFingerprint: sha256(evidence),
          payloadLength: dumped.length,
        }),
      );
      if (metadata.length > 16 * 1024)
        throw new RecoveryRefusal('oversized-archive-header');
      const headerLength = Buffer.alloc(4);
      headerLength.writeUInt32BE(metadata.length);
      const nonce = randomBytes(12);
      const authenticatedHeader = Buffer.concat([
        MAGIC,
        headerLength,
        metadata,
        nonce,
      ]);
      const cipher = createCipheriv('aes-256-gcm', key, nonce);
      cipher.setAAD(authenticatedHeader);
      ciphertext = Buffer.concat([cipher.update(dumped), cipher.final()]);
      temporaryArtifact = join(
        archiveDirectory,
        `.${basename(config.archivePath)}.${randomBytes(12).toString('hex')}.staging`,
      );
      signal?.throwIfAborted();
      await writeExclusive(
        temporaryArtifact,
        Buffer.concat([authenticatedHeader, ciphertext, cipher.getAuthTag()]),
      );
      signal?.throwIfAborted();
      // Same-filesystem hard link publishes complete bytes atomically and never
      // replaces an existing retained artifact (including a symlink).
      await link(temporaryArtifact, config.archivePath);
      await syncDirectory(archiveDirectory);
      await writeExclusive(
        config.completionEvidencePath,
        Buffer.from(
          JSON.stringify({
            version: 1,
            outcome: 'archive-created',
            archiveSha256: sha256(await readFile(config.archivePath)),
            completedAt: new Date().toISOString(),
            snapshotCutoff: cutoff,
            applicationRevision: config.applicationRevision,
            verificationFingerprint: sha256(evidence),
          }) + '\n',
        ),
      );
    } catch (error) {
      if (!signal?.aborted) await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    dumped?.fill(0);
    key.fill(0);
    ciphertext?.fill(0);
    await completeOwnedCleanup([
      {
        name: 'owned encrypted staging artifact',
        cleanup: async () => {
          if (temporaryArtifact) await rm(temporaryArtifact);
        },
      },
      {
        name: 'owned dump tool sessions',
        cleanup: async () => {
          if (dumpState === 'running' || signal?.aborted)
            await terminateOwnedDatabaseSessions({
              databaseUrl: config.database.url,
              applicationName,
            });
        },
      },
      { name: 'source snapshot client', cleanup: close },
    ]);
  }
}

async function writeExclusive(path: string, content: Buffer): Promise<void> {
  const handle = await open(path, 'wx', 0o600);
  try {
    await handle.writeFile(content);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function syncDirectory(path: string): Promise<void> {
  const handle = await open(path, constants.O_RDONLY);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function compiledApplicationFingerprint(): Promise<string> {
  const hash = createHash('sha256');
  const root = resolve(__dirname, '..');
  const visit = async (directory: string): Promise<void> => {
    for (const entry of (
      await readdir(directory, { withFileTypes: true })
    ).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && entry.name.endsWith('.js')) {
        hash.update(path.slice(root.length));
        hash.update(await readFile(path));
      }
    }
  };
  await visit(root);
  return hash.digest('hex');
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new RecoveryRefusal('invalid-configuration-shape');
  return Object.fromEntries(Object.entries(value));
}

function text(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0)
    throw new RecoveryRefusal('invalid-configuration-value');
  return value;
}

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}
